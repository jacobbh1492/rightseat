// Shared solo rentals: the other pilot's deposit.
// The deposit is their share of the estimate, charged when they accept, with their card
// saved for any difference at close-out. Used by the split function, the Stripe webhook
// (in case the app closes before it reports back) and booking-action (refunds).
import { admin, stripe, audit } from './server.ts';

export async function loadSplit(bookingId: string) {
  const { data } = await admin.from('booking_splits').select('*').eq('booking_id', bookingId).maybeSingle();
  return data;
}

// The deposit went through: the booking now goes to the owner.
// Safe to call more than once (app and webhook both report it).
export async function finalizeDeposit(pi: any) {
  const splitId = pi.metadata?.split_id;
  if (!splitId || pi.status !== 'succeeded') return { ok: false };
  const { data: s } = await admin.from('booking_splits').select('*').eq('id', splitId).single();
  if (!s) return { ok: false };
  if (s.status === 'accepted') return { ok: true, status: 'accepted' };
  const { data: b } = await admin.from('bookings').select('id, status, split_pending, hold_until').eq('id', s.booking_id).single();
  const chargeId = String(pi.latest_charge);
  // Paid too late (the invite ran out, or the booker cancelled or went solo): give it back.
  if (!b || b.status !== 'requested' || s.status !== 'invited' || !b.split_pending) {
    await stripe.refunds.create({ charge: chargeId, metadata: { booking_id: s.booking_id, split_id: s.id } }, { idempotencyKey: 'late-dep-' + pi.id });
    await audit(s.partner_id, 'split.deposit_refunded_late', s.booking_id, { amount: pi.amount / 100 });
    return { ok: false, refunded: true };
  }
  const { data: won } = await admin.from('booking_splits').update({
    status: 'accepted', responded_at: new Date().toISOString(), deposit_charge_id: chargeId,
    partner_pm: typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id || null,
  }).eq('id', s.id).eq('status', 'invited').select('id');
  if (!won?.length) return { ok: true, status: 'accepted' }; // the other report got there first
  await admin.from('ledger').insert({ booking_id: s.booking_id, party_id: s.partner_id, kind: 'charge_split_deposit', amount: pi.amount / 100, stripe_ref: pi.id });
  await admin.from('bookings').update({ split_pending: false, hold_until: null }).eq('id', s.booking_id);
  await audit(s.partner_id, 'split.accepted', s.booking_id, { deposit: pi.amount / 100 });
  return { ok: true, status: 'accepted' };
}

// Give the other pilot their deposit back (booking cancelled or declined, they left,
// or the booker chose to fly solo). Returns the amount refunded.
export async function refundDeposit(s: any, why: string) {
  if (!s || s.status !== 'accepted' || !s.deposit_charge_id) return 0;
  const { data: done } = await admin.from('ledger').select('id').eq('booking_id', s.booking_id).eq('party_id', s.partner_id).eq('kind', 'refund_split_deposit').maybeSingle();
  if (done) return 0;
  const rf = await stripe.refunds.create({ charge: s.deposit_charge_id, metadata: { booking_id: s.booking_id, split_id: s.id, why } }, { idempotencyKey: 'dep-refund-' + s.id });
  const amount = rf.amount / 100;
  await admin.from('ledger').insert({ booking_id: s.booking_id, party_id: s.partner_id, kind: 'refund_split_deposit', amount, stripe_ref: rf.id });
  return amount;
}
