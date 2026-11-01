// POST /booking-action { bookingId, action: confirm | decline | cancel | complete, ... }
//  confirm/decline — the instructor (or the owner, for a solo rental) answers a request.
//  cancel          — anyone on the booking; a student inside 24 h of a confirmed lesson
//                    pays the late-cancel fee, which goes to the instructor.
//  complete        — close-out with actual Hobbs/ground time: charge the saved card,
//                    then pay the instructor, owner and school their shares.
import { serve, json, admin, stripe, requireUser, audit, payoutStatus } from '../_shared/server.ts';
import { assertTransition, roleIn, finalPrice, validateActuals, cancellationFee, payoutPlan, cents, HttpError } from '../_shared/bookings.js';

async function load(id: string) {
  const { data: b } = await admin.from('bookings').select('*').eq('id', id).single();
  if (!b) throw new HttpError(404, 'Booking not found.');
  const { data: plane } = b.plane_id ? await admin.from('planes').select('id, owner_id, school_id, tail').eq('id', b.plane_id).single() : { data: null };
  const { data: aff } = b.affiliation_id ? await admin.from('affiliations').select('school_id, school_pct').eq('id', b.affiliation_id).single() : { data: null };
  return { b, plane, schoolId: aff?.school_id || null, schoolPct: Number(aff?.school_pct || 0) };
}

async function isSchoolAdmin(userId: string, schoolId: string | null) {
  if (!schoolId) return false;
  const { count } = await admin.from('school_admins').select('user_id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('user_id', userId);
  return (count || 0) > 0;
}

// Charge the student's saved card off-session.
async function charge(b: any, amount: number, description: string, key: string) {
  const { data: student } = await admin.from('profiles').select('stripe_customer_id').eq('id', b.student_id).single();
  if (!student?.stripe_customer_id || !b.setup_intent_id) throw new HttpError(409, 'The student hasn’t added a card for this booking.');
  const si = await stripe.setupIntents.retrieve(b.setup_intent_id);
  if (si.status !== 'succeeded' || !si.payment_method) throw new HttpError(409, 'The student’s card isn’t set up for this booking yet.');
  return await stripe.paymentIntents.create({
    amount: cents(amount), currency: 'usd', customer: student.stripe_customer_id,
    payment_method: String(si.payment_method), off_session: true, confirm: true,
    description, transfer_group: b.id, metadata: { booking_id: b.id },
  }, { idempotencyKey: key });
}

async function payout(b: any, split: any, chargeId: string, plane: any, schoolId: string | null, kind: string) {
  const acct = async (table: string, id: string | null) => {
    if (!id) return null;
    const { data } = await admin.from(table).select('stripe_account_id, payouts_ready').eq('id', id).single();
    if (!data?.stripe_account_id) return null;
    if (data.payouts_ready) return data.stripe_account_id;
    // They may have just finished setup: ask Stripe before holding their pay.
    const st = await payoutStatus(data.stripe_account_id).catch(() => ({ ready: false }));
    if (st.ready) await admin.from(table).update({ payouts_ready: true }).eq('id', id);
    return st.ready ? data.stripe_account_id : null;
  };
  // A school-owned plane pays the school, not the person who listed it.
  const ownerAccount = plane?.school_id ? await acct('schools', plane.school_id) : await acct('profiles', plane?.owner_id || null);
  const plan = payoutPlan(split, { cfiAccount: await acct('profiles', b.cfi_id), ownerAccount, schoolAccount: await acct('schools', schoolId) });
  const partyId = { cfi: b.cfi_id, owner: plane?.school_id ? null : plane?.owner_id, school: null } as any;
  const partySchool = { cfi: null, owner: plane?.school_id || null, school: schoolId } as any;
  for (const t of plan.transfers) {
    const tr = await stripe.transfers.create({
      amount: t.cents, currency: 'usd', destination: t.account, source_transaction: chargeId,
      transfer_group: b.id, metadata: { booking_id: b.id, party: t.party },
    }, { idempotencyKey: `tr-${kind}-${b.id}-${t.party}` });
    await admin.from('ledger').insert({ booking_id: b.id, party_id: partyId[t.party], school_id: partySchool[t.party], kind: 'payout_' + t.party, amount: t.amount, stripe_ref: tr.id });
  }
  for (const h of plan.held) {
    await admin.from('ledger').insert({ booking_id: b.id, party_id: partyId[h.party], school_id: partySchool[h.party], kind: 'held_' + h.party, amount: h.amount });
  }
  return plan;
}

// Sandbox only: lets the dashboard play the seeded Test Instructor so the confirm and
// close-out flow can be exercised end to end. Inert with live Stripe keys, and only
// touches bookings on the test listing (supabase/seed/test_listing.sql).
const SANDBOX_CFI = 'a0000000-0000-4000-8000-000000000001';
const sandboxAllowed = (req: Request) =>
  req.headers.get('x-rightseat-sandbox') === 'act-as-test-cfi' && (Deno.env.get('STRIPE_SECRET_KEY') || '').startsWith('sk_test_');

serve(async (req, body) => {
  const sandbox = sandboxAllowed(req);
  const user = sandbox ? { id: SANDBOX_CFI } : await requireUser(req);
  const { b, plane, schoolId, schoolPct } = await load(String(body.bookingId || ''));
  if (sandbox && b.cfi_id !== SANDBOX_CFI) throw new HttpError(403, 'Sandbox mode only works on the test listing.');
  const role = roleIn(b, user.id, { planeOwnerId: plane?.owner_id, schoolAdmin: await isSchoolAdmin(user.id, schoolId) });
  const action = String(body.action || '');

  // The student's app asks this right after Stripe's card sheet closes: we check with
  // Stripe directly instead of trusting the sheet, so a request is only "sent" with a saved card.
  if (action === 'card') {
    if (role !== 'student') throw new HttpError(403, 'This isn’t your booking.');
    if (b.card_ready) return json({ cardReady: true });
    if (!b.setup_intent_id) return json({ cardReady: false });
    const si = await stripe.setupIntents.retrieve(b.setup_intent_id);
    const ready = si.status === 'succeeded' && !!si.payment_method;
    if (ready) await admin.from('bookings').update({ card_ready: true }).eq('id', b.id);
    return json({ cardReady: ready, status: si.status });
  }

  assertTransition(action, b, role);

  if (action === 'confirm') {
    if (!b.card_ready) throw new HttpError(409, 'Waiting for the student to finish adding their card.');
    await admin.from('bookings').update({ status: 'confirmed' }).eq('id', b.id).eq('status', 'requested');
    await audit(user.id, 'booking.confirmed', b.id);
    return json({ status: 'confirmed' });
  }

  if (action === 'decline') {
    await admin.from('bookings').update({ status: 'cancelled', cancelled_by: user.id, cancel_reason: String(body.reason || 'Declined').slice(0, 300) }).eq('id', b.id);
    await audit(user.id, 'booking.declined', b.id);
    return json({ status: 'cancelled' });
  }

  if (action === 'cancel') {
    const fee = cancellationFee(b, role!);
    let feeCharged = 0;
    if (fee > 0) {
      const pi = await charge(b, fee, 'Late cancellation fee', 'late-' + b.id);
      const chargeId = String(pi.latest_charge);
      await admin.from('ledger').insert({ booking_id: b.id, party_id: b.student_id, kind: 'charge_late_cancel', amount: fee, stripe_ref: pi.id });
      // The late fee is instruction pay, so an affiliated school gets its usual share.
      const school = Math.round(fee * schoolPct * 100) / 100;
      await payout(b, { cfi: Math.round((fee - school) * 100) / 100, owner: 0, school }, chargeId, null, schoolId, 'late');
      feeCharged = fee;
    }
    await admin.from('bookings').update({ status: 'cancelled', cancelled_by: user.id, cancel_reason: String(body.reason || '').slice(0, 300) || null }).eq('id', b.id);
    await audit(user.id, 'booking.cancelled', b.id, { role, feeCharged });
    return json({ status: 'cancelled', feeCharged });
  }

  // complete
  const actual = validateActuals(body, b);
  const q = finalPrice(b.quote, actual);
  const pi = await charge(b, q.total, `Lesson ${new Date(b.starts_at).toDateString()}`, 'final-' + b.id);
  const chargeId = String(pi.latest_charge);
  await admin.from('bookings').update({ status: 'completed', actual_hobbs: actual.flightHours, final_split: { ...q.split, final: { total: q.total, instruction: q.instruction, ground: q.ground, aircraft: q.aircraft, bookingFee: q.bookingFee, protection: q.protection, flightHours: actual.flightHours, groundHours: actual.groundHours } }, payment_intent_id: pi.id, charge_id: chargeId }).eq('id', b.id);
  await admin.from('ledger').insert({ booking_id: b.id, party_id: b.student_id, kind: 'charge', amount: q.total, stripe_ref: pi.id });
  if (q.split.platform) await admin.from('ledger').insert({ booking_id: b.id, kind: 'fee', amount: q.split.platform });
  const plan = await payout(b, q.split, chargeId, plane, schoolId, 'final');
  await audit(user.id, 'booking.completed', b.id, { total: q.total, actual });
  return json({ status: 'completed', total: q.total, split: q.split, held: plan.held.map((h: any) => h.party) });
});
