// Paying instructors, owners and schools their shares of a booking.
//
// Every share is a Stripe transfer tied to the charge the money came from. A share is:
//  - paid now            → ledger payout_<party>
//  - held                → ledger held_<party> (no payout account yet; releaseHeld pays it later)
//  - waiting on debrief  → ledger await_<party> (lessons with an instructor: the instructor's
//                          and school's shares wait until the debrief is written; releaseDebrief)
// Ledger rows record the charge they draw on in stripe_ref (held_/await_), and a row that
// settles another points at it with source_id, so each is paid exactly once.
import { admin, stripe, payoutStatus } from './server.ts';
import { allocateToCharges, DEBRIEF_PARTIES } from './bookings.js';

export type Charge = { id: string; amount: number };

// The party's payout account, if it's ready to receive money.
export async function readyAccount(table: 'profiles' | 'schools', id: string | null) {
  if (!id) return null;
  const { data } = await admin.from(table).select('stripe_account_id, payouts_ready').eq('id', id).single();
  if (!data?.stripe_account_id) return null;
  if (data.payouts_ready) return data.stripe_account_id as string;
  // They may have just finished setup: ask Stripe before holding their pay.
  const st = await payoutStatus(data.stripe_account_id).catch(() => ({ ready: false }));
  if (st.ready) await admin.from(table).update({ payouts_ready: true }).eq('id', id);
  return st.ready ? (data.stripe_account_id as string) : null;
}

// Who each party is, for ledger rows and payout accounts.
export function parties(b: any, plane: any, schoolId: string | null) {
  return {
    cfi: { partyId: b.cfi_id, schoolId: null, table: 'profiles' as const, id: b.cfi_id },
    // A school-owned plane pays the school, not the person who listed it.
    owner: plane?.school_id
      ? { partyId: null, schoolId: plane.school_id, table: 'schools' as const, id: plane.school_id }
      : { partyId: plane?.owner_id || null, schoolId: null, table: 'profiles' as const, id: plane?.owner_id || null },
    school: { partyId: null, schoolId, table: 'schools' as const, id: schoolId },
  } as Record<string, { partyId: string | null; schoolId: string | null; table: 'profiles' | 'schools'; id: string | null }>;
}

async function transfer(b: any, party: string, amount: number, account: string, chargeId: string, key: string, sourceId: string | null) {
  const tr = await stripe.transfers.create({
    amount: Math.round(amount * 100), currency: 'usd', destination: account, source_transaction: chargeId,
    transfer_group: b.id, metadata: { booking_id: b.id, party, ...(sourceId ? { released_from: sourceId } : {}) },
  }, { idempotencyKey: key });
  return tr.id;
}

// Pay a booking's shares from one or more charges.
// awaitDebrief: the instructor's and school's shares wait for the debrief.
export async function payShares(opts: {
  b: any; plane: any; schoolId: string | null; split: { cfi?: number; owner?: number; school?: number };
  charges: Charge[]; kind: string; awaitDebrief?: boolean;
}) {
  const { b, plane, schoolId, split, charges, kind, awaitDebrief } = opts;
  const who = parties(b, plane, schoolId);
  const lines = (['cfi', 'owner', 'school'] as const)
    .map((party) => ({ party, amount: Number((split as any)[party] || 0) }))
    .filter((l) => l.amount > 0);
  const out = { paid: [] as string[], held: [] as string[], awaiting: [] as string[] };
  const accounts: Record<string, string | null> = {};
  for (const l of lines) {
    if (!(awaitDebrief && DEBRIEF_PARTIES.includes(l.party))) accounts[l.party] = await readyAccount(who[l.party].table, who[l.party].id);
  }
  for (const a of allocateToCharges(lines, charges)) {
    const w = who[a.party];
    const row = { booking_id: b.id, party_id: w.partyId, school_id: w.schoolId, amount: a.amount };
    if (awaitDebrief && DEBRIEF_PARTIES.includes(a.party)) {
      await admin.from('ledger').insert({ ...row, kind: 'await_' + a.party, stripe_ref: a.chargeId });
      out.awaiting.push(a.party);
    } else if (accounts[a.party]) {
      const ref = await transfer(b, a.party, a.amount, accounts[a.party]!, a.chargeId, `tr-${kind}-${b.id}-${a.party}-${a.chargeId}`, null);
      await admin.from('ledger').insert({ ...row, kind: 'payout_' + a.party, stripe_ref: ref });
      out.paid.push(a.party);
    } else {
      await admin.from('ledger').insert({ ...row, kind: 'held_' + a.party, stripe_ref: a.chargeId });
      out.held.push(a.party);
    }
  }
  const uniq = (xs: string[]) => [...new Set(xs)];
  return { paid: uniq(out.paid), held: uniq(out.held), awaiting: uniq(out.awaiting) };
}

// The debrief is in: pay (or hold, if payouts aren't set up) everything that was waiting on it.
export async function releaseDebrief(b: any, schoolId: string | null) {
  const { data: rows } = await admin.from('ledger').select('id, kind, amount, party_id, school_id, stripe_ref')
    .eq('booking_id', b.id).in('kind', DEBRIEF_PARTIES.map((p) => 'await_' + p));
  let paid = 0, held = 0;
  for (const r of rows || []) {
    const { count } = await admin.from('ledger').select('id', { count: 'exact', head: true }).eq('source_id', r.id);
    if (count) continue;
    const party = r.kind.slice('await_'.length);
    const w = parties(b, null, schoolId)[party];
    const account = await readyAccount(w.table, party === 'cfi' ? r.party_id : r.school_id);
    if (account) {
      const ref = await transfer(b, party, Number(r.amount), account, r.stripe_ref, 'debrief-' + r.id, r.id);
      const { error } = await admin.from('ledger').insert({ booking_id: b.id, party_id: r.party_id, school_id: r.school_id, kind: 'payout_' + party, amount: r.amount, stripe_ref: ref, source_id: r.id });
      if (error && error.code !== '23505') throw error; // 23505: a parallel release already recorded it
      if (!error) paid += Number(r.amount);
    } else {
      const { error } = await admin.from('ledger').insert({ booking_id: b.id, party_id: r.party_id, school_id: r.school_id, kind: 'held_' + party, amount: r.amount, stripe_ref: r.stripe_ref, source_id: r.id });
      if (error && error.code !== '23505') throw error;
      if (!error) held += Number(r.amount);
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { paid: r2(paid), held: r2(held) };
}
