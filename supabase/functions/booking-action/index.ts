// POST /booking-action { bookingId, action: confirm | decline | cancel | complete, ... }
//  confirm/decline — the instructor (or the owner, for a solo rental) answers a request.
//  cancel          — anyone on the booking; a student inside 24 h of a confirmed lesson
//                    pays the late-cancel fee, which goes to the instructor.
//  complete        — close-out with actual Hobbs/ground time: charge the saved card(s),
//                    then pay the owner their share. On a lesson the instructor's (and
//                    school's) share waits for the debrief, sent with the close-out or later.
//  debrief         — the instructor writes the debrief; their waiting pay is released.
// Shared solo rentals (see the split function): the booker pays their share and the other
// pilot's deposit covers theirs, with any difference charged or refunded at close-out.
import { serve, json, admin, stripe, requireUser, audit, customerFor } from '../_shared/server.ts';
import { confirmProposalIfReady } from '../_shared/proposals.ts';
import { assertTransition, roleIn, finalPrice, validateActuals, cancellationFee, cents, parseDebrief, splitShares, partnerSettlement, HttpError } from '../_shared/bookings.js';
import { payShares, releaseDebrief, type Charge } from '../_shared/payouts.ts';
import { loadSplit, refundDeposit } from '../_shared/splits.ts';
import { assertAirworthy } from '../_shared/aircraft.ts';
import { ymdIn } from '../_shared/renterChecks.js';

async function load(id: string) {
  const { data: b } = await admin.from('bookings').select('*').eq('id', id).single();
  if (!b) throw new HttpError(404, 'Booking not found.');
  const { data: plane } = b.plane_id ? await admin.from('planes').select('id, owner_id, school_id, tail, hobbs_total, next_100_at, annual_date').eq('id', b.plane_id).single() : { data: null };
  const { data: aff } = b.affiliation_id ? await admin.from('affiliations').select('school_id, school_pct').eq('id', b.affiliation_id).single() : { data: null };
  const split = b.plane_id && !b.cfi_id ? await loadSplit(b.id) : null;
  return { b, plane, split, schoolId: aff?.school_id || null, schoolPct: Number(aff?.school_pct || 0) };
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

// Save the instructor's debrief for a lesson (once). Returns false if it's incomplete.
async function saveDebrief(b: any, raw: any) {
  const { data: have } = await admin.from('debriefs').select('id').eq('booking_id', b.id).maybeSingle();
  if (have) return true;
  const d = parseDebrief(raw);
  if (!d.complete) return false;
  const flownOn = /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.flownOn || '')) ? raw.flownOn : String(b.starts_at).slice(0, 10);
  const { error } = await admin.from('debriefs').insert({
    booking_id: b.id, student_id: b.student_id, cfi_id: b.cfi_id, flown_on: flownOn,
    went_well: d.wentWell, needs_work: d.needsWork, next_plan: d.nextPlan,
  });
  if (error && error.code !== '23505') throw error; // 23505: written a moment ago
  return true;
}

// Sandbox only: lets the dashboard play the seeded Test Instructor so the confirm and
// close-out flow can be exercised end to end. Inert with live Stripe keys, and only
// touches bookings on the test listing (supabase/seed/test_listing.sql).
const SANDBOX_CFI = 'a0000000-0000-4000-8000-000000000001';
const sandboxAllowed = (req: Request) =>
  req.headers.get('x-rightseat-sandbox') === 'act-as-test-cfi' && /^(sk|rk)_test_/.test(Deno.env.get('STRIPE_SECRET_KEY') || '');

serve(async (req, body) => {
  const sandbox = sandboxAllowed(req);
  const user = sandbox ? { id: SANDBOX_CFI } : await requireUser(req);
  const { b, plane, split, schoolId, schoolPct } = await load(String(body.bookingId || ''));
  if (sandbox && b.cfi_id !== SANDBOX_CFI) throw new HttpError(403, 'Sandbox mode only works on the test listing.');
  const role = roleIn(b, user.id, { planeOwnerId: plane?.owner_id, schoolAdmin: await isSchoolAdmin(user.id, schoolId), partnerId: split?.status === 'accepted' ? split.partner_id : null });
  const action = String(body.action || '');

  // The student's app asks this right after Stripe's card sheet closes: we check with
  // Stripe directly instead of trusting the sheet, so a request is only "sent" with a saved card.
  if (action === 'card') {
    if (role !== 'student') throw new HttpError(403, 'This isn’t your booking.');
    if (b.card_ready) return json({ cardReady: true, bookingStatus: b.status === 'proposed' ? await confirmProposalIfReady(b.id) : b.status });
    if (!b.setup_intent_id) return json({ cardReady: false });
    const si = await stripe.setupIntents.retrieve(b.setup_intent_id);
    const ready = si.status === 'succeeded' && !!si.payment_method;
    if (ready) await admin.from('bookings').update({ card_ready: true }).eq('id', b.id);
    // A lesson the instructor proposed is confirmed the moment the student's card is saved.
    const status = ready && b.status === 'proposed' ? await confirmProposalIfReady(b.id) : b.status;
    return json({ cardReady: ready, status: si.status, bookingStatus: status });
  }

  assertTransition(action, b, role);

  // The student accepts a lesson their instructor booked: save a card for it (Stripe's
  // sheet), then the app calls "card", which confirms the lesson.
  if (action === 'accept') {
    if (b.proposal_expires && new Date(b.proposal_expires).getTime() <= Date.now()) throw new HttpError(409, 'This lesson wasn’t accepted in time. Ask your instructor to book it again.');
    const { data: me } = await admin.auth.admin.getUserById(user.id);
    const customer = await customerFor({ id: user.id, email: me?.user?.email });
    let si = b.setup_intent_id ? await stripe.setupIntents.retrieve(b.setup_intent_id) : null;
    if (!si || si.status === 'canceled') {
      si = await stripe.setupIntents.create({ customer, usage: 'off_session', payment_method_types: ['card'], metadata: { booking_id: b.id, user_id: user.id } }, { idempotencyKey: 'si-' + b.id });
      await admin.from('bookings').update({ setup_intent_id: si.id }).eq('id', b.id);
    }
    if (si.status === 'succeeded') {
      await admin.from('bookings').update({ card_ready: true }).eq('id', b.id);
      return json({ status: await confirmProposalIfReady(b.id) });
    }
    const ek = await stripe.ephemeralKeys.create({ customer }, { apiVersion: '2024-12-18.acacia' });
    return json({ status: 'proposed', payment: { setupIntentClientSecret: si.client_secret, customer, ephemeralKey: ek.secret } });
  }

  if (action === 'reject') {
    await admin.from('bookings').update({ status: 'cancelled', cancelled_by: user.id, cancel_reason: String(body.reason || 'Student declined').slice(0, 300) }).eq('id', b.id).eq('status', 'proposed');
    await audit(user.id, 'booking.proposal_declined', b.id);
    return json({ status: 'cancelled' });
  }

  if (action === 'confirm') {
    if (!b.card_ready) throw new HttpError(409, 'Waiting for the student to finish adding their card.');
    if (b.split_pending) throw new HttpError(409, 'Waiting for the other pilot to accept and pay their deposit.');
    if (plane) await assertAirworthy(plane, new Date(b.starts_at), Number(b.flight_hours || 1));
    await admin.from('bookings').update({ status: 'confirmed' }).eq('id', b.id).eq('status', 'requested');
    await audit(user.id, 'booking.confirmed', b.id);
    return json({ status: 'confirmed' });
  }

  if (action === 'decline') {
    await admin.from('bookings').update({ status: 'cancelled', cancelled_by: user.id, cancel_reason: String(body.reason || 'Declined').slice(0, 300), split_pending: false }).eq('id', b.id);
    await endSplit(split, 'declined by owner');
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
      await payShares({ b, plane: null, schoolId, split: { cfi: Math.round((fee - school) * 100) / 100, owner: 0, school }, charges: [{ id: chargeId, amount: fee }], kind: 'late' });
      feeCharged = fee;
    }
    await admin.from('bookings').update({ status: 'cancelled', cancelled_by: user.id, cancel_reason: String(body.reason || '').slice(0, 300) || null, split_pending: false }).eq('id', b.id);
    await endSplit(split, 'booking cancelled');
    await audit(user.id, 'booking.cancelled', b.id, { role, feeCharged });
    return json({ status: 'cancelled', feeCharged });
  }

  if (action === 'debrief') {
    if (!(await saveDebrief(b, body))) throw new HttpError(400, 'Fill in what went well, what needs work and the plan for next time.');
    const released = await releaseDebrief(b, schoolId);
    await audit(user.id, 'booking.debriefed', b.id, released);
    return json({ status: 'debriefed', ...released });
  }

  // complete
  const actual = validateActuals(body, b);
  const q = finalPrice(b.quote, actual);
  // Logged to the student's training record (simulated instrument can't exceed the flight).
  const conditions = {
    night: !!body.night, xc: !!body.xc,
    instrumentHours: Math.max(0, Math.min(actual.flightHours, Math.round(Number(body.instrumentHours || 0) * 10) / 10)),
  };
  const when = new Date(b.starts_at).toDateString();
  const shared = split?.status === 'accepted' ? split : null;
  const charges: Charge[] = [];
  let bookerAmount = q.total, partnerShare = 0, settle = 0, coveredByBooker = 0;
  if (shared) ({ booker: bookerAmount, partner: partnerShare } = splitShares(q.total, shared.booker_pct));

  // A gift pays first (once, even if close-out is retried); the saved card pays the rest.
  let giftUsed = 0, giftCharge: string | null = null;
  if (b.gift_id && !shared) {
    const { data: g } = await admin.from('gifts').select('charge_id').eq('id', b.gift_id).single();
    if (g?.charge_id) {
      const { data: used, error: ge } = await admin.rpc('apply_gift', { p_booking: b.id, p_total: bookerAmount });
      if (ge) throw ge;
      giftUsed = Number(used || 0);
      if (giftUsed > 0) {
        giftCharge = g.charge_id;
        charges.push({ id: giftCharge!, amount: giftUsed });
        const { count } = await admin.from('ledger').select('id', { count: 'exact', head: true }).eq('booking_id', b.id).eq('kind', 'gift_applied');
        if (!count) await admin.from('ledger').insert({ booking_id: b.id, party_id: b.student_id, kind: 'gift_applied', amount: giftUsed, stripe_ref: giftCharge });
      }
    }
  }
  const cardAmount = Math.round((bookerAmount - giftUsed) * 100) / 100;
  let pi: any = null, chargeId: string | null = null;
  if (cardAmount > 0) {
    pi = await charge(b, cardAmount, (shared ? 'Shared flight ' : 'Lesson ') + when, 'final-' + b.id);
    chargeId = String(pi.latest_charge);
    charges.push({ id: chargeId, amount: cardAmount });
    await admin.from('ledger').insert({ booking_id: b.id, party_id: b.student_id, kind: 'charge', amount: cardAmount, stripe_ref: pi.id });
  }

  if (shared) {
    // The other pilot's deposit covers their share of the estimate; settle the difference.
    settle = partnerSettlement(partnerShare, Number(shared.deposit || 0));
    let depositKept = Number(shared.deposit || 0);
    if (settle < 0) {
      const rf = await stripe.refunds.create({ charge: shared.deposit_charge_id, amount: cents(-settle), metadata: { booking_id: b.id, split_id: shared.id } }, { idempotencyKey: 'split-diff-' + b.id });
      await admin.from('ledger').insert({ booking_id: b.id, party_id: shared.partner_id, kind: 'refund_split_diff', amount: -settle, stripe_ref: rf.id });
      depositKept = Math.round((depositKept + settle) * 100) / 100;
    }
    if (depositKept > 0) charges.push({ id: shared.deposit_charge_id, amount: depositKept });
    if (settle > 0) {
      try {
        const customer = await customerFor({ id: shared.partner_id });
        const extra = await stripe.paymentIntents.create({
          amount: cents(settle), currency: 'usd', customer, payment_method: shared.partner_pm, off_session: true, confirm: true,
          description: 'Shared flight ' + when + ' (difference from deposit)', transfer_group: b.id, metadata: { booking_id: b.id, split_id: shared.id },
        }, { idempotencyKey: 'split-extra-' + b.id });
        charges.push({ id: String(extra.latest_charge), amount: settle });
        await admin.from('ledger').insert({ booking_id: b.id, party_id: shared.partner_id, kind: 'charge_split_diff', amount: settle, stripe_ref: extra.id });
      } catch (e) {
        if (!e?.type?.startsWith?.('Stripe')) throw e;
        // Their saved card didn't go through: the booker covers it so the owner is paid in full.
        const cover = await charge(b, settle, 'Shared flight ' + when + ' (other pilot’s card declined)', 'split-cover-' + b.id);
        charges.push({ id: String(cover.latest_charge), amount: settle });
        await admin.from('ledger').insert({ booking_id: b.id, party_id: b.student_id, kind: 'charge_split_cover', amount: settle, stripe_ref: cover.id });
        coveredByBooker = settle;
        await audit(null, 'split.partner_card_failed', b.id, { amount: settle, code: e.code || null });
      }
    }
  }

  const finalLine: any = { total: q.total, instruction: q.instruction, ground: q.ground, aircraft: q.aircraft, bookingFee: q.bookingFee, protection: q.protection, flightHours: actual.flightHours, groundHours: actual.groundHours };
  if (giftUsed) Object.assign(finalLine, { giftApplied: giftUsed, charged: cardAmount });
  if (shared) Object.assign(finalLine, { charged: Math.round((bookerAmount + coveredByBooker) * 100) / 100, bookerPct: shared.booker_pct, partnerShare, partnerDiff: coveredByBooker ? 0 : settle, coveredByBooker });
  await admin.from('bookings').update({ status: 'completed', actual_hobbs: actual.flightHours, conditions, final_split: { ...q.split, final: finalLine }, payment_intent_id: pi?.id || null, charge_id: chargeId || giftCharge }).eq('id', b.id);
  if (q.split.platform) await admin.from('ledger').insert({ booking_id: b.id, kind: 'fee', amount: q.split.platform });

  // Everyone who flew it has a recent flight now (owners' recency rules, src/renterChecks.js).
  const flownOn = ymdIn(new Date(b.starts_at));
  const flew = [b.student_id, b.cfi_id, shared?.partner_id].filter(Boolean);
  await admin.from('pilot_profiles').update({ last_flight_date: flownOn }).in('user_id', flew).or(`last_flight_date.is.null,last_flight_date.lt.${flownOn}`);

  // A checkout flight with the owner: record the result. A pass checks the renter out.
  let checkoutResult: string | null = null;
  if (b.purpose === 'checkout' && plane) {
    checkoutResult = body.checkoutResult === 'approved' ? 'approved' : 'more';
    await admin.from('plane_checkouts').upsert({
      plane_id: plane.id, pilot_id: b.student_id, status: checkoutResult === 'approved' ? 'approved' : 'requested',
      note: checkoutResult === 'approved' ? 'Checked out by the owner on a checkout flight' : 'Needs more time before solo',
      decided_by: user.id, decided_at: new Date().toISOString(),
    }, { onConflict: 'plane_id,pilot_id' });
    await admin.from('notifications').insert({
      user_id: b.student_id, kind: checkoutResult === 'approved' ? 'checkout_approved' : 'checkout_more',
      title: checkoutResult === 'approved' ? 'You’re checked out ✓' : 'Checkout: a bit more time',
      body: checkoutResult === 'approved' ? `You can rent ${plane.tail} solo now.` : `The owner of ${plane.tail} wants another checkout flight before you rent it solo.`,
      data: { screen: 'Lessons' },
    });
  }

  // The owner is paid now. On a lesson, the instructor's and school's shares wait for the debrief.
  const paid = await payShares({ b, plane, schoolId, split: q.split, charges, kind: 'final', awaitDebrief: !!b.cfi_id });
  let released = null;
  if (b.cfi_id && body.debrief && await saveDebrief(b, body.debrief)) released = await releaseDebrief(b, schoolId);
  await audit(user.id, 'booking.completed', b.id, { total: q.total, actual, shared: !!shared, checkoutResult });
  return json({
    status: 'completed', total: q.total, split: q.split, held: paid.held, giftApplied: giftUsed, charged: cardAmount,
    awaitingDebrief: b.cfi_id && !released ? (q.split.cfi || 0) : 0,
    debriefReleased: released,
    shared: shared ? { bookerAmount, partnerShare, settle, coveredByBooker } : null,
    checkoutResult,
  });
});

// The booking is off: refund the other pilot's deposit and close the invite.
async function endSplit(split: any, why: string) {
  if (!split || !['invited', 'declined', 'accepted'].includes(split.status)) return;
  await refundDeposit(split, why);
  await admin.from('booking_splits').update({ status: 'cancelled' }).eq('id', split.id);
}
