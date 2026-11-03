// POST /split { bookingId, action, ... } — sharing the cost of a solo rental.
//  accept  — the invited pilot confirms they're current and meet the rental requirements
//            (attest: true) and gets a payment sheet for their deposit: their share of the
//            estimate. Their card is saved for any difference at close-out.
//  paid    — the app reports the deposit went through; checked with Stripe, then the
//            booking goes to the owner. (The webhook does the same if the app closes.)
//  decline — the invited pilot says no. The booker can fly solo or cancel.
//  leave   — the other pilot backs out after accepting; their deposit is refunded and the
//            booker pays the full cost (they can still cancel at no charge).
//  solo    — the booker drops the share and pays the full cost.
import { serve, json, admin, stripe, requireUser, customerFor, audit } from '../_shared/server.ts';
import { splitShares, cents, HttpError } from '../_shared/bookings.js';
import { loadSplit, finalizeDeposit, refundDeposit } from '../_shared/splits.ts';

serve(async (_req, body) => {
  const user = await requireUser(_req);
  const bookingId = String(body.bookingId || '');
  const action = String(body.action || '');
  const { data: b } = await admin.from('bookings').select('*').eq('id', bookingId).single();
  const s = b ? await loadSplit(b.id) : null;
  if (!b || !s) throw new HttpError(404, 'Shared flight not found.');
  const isPartner = s.partner_id === user.id, isBooker = s.booker_id === user.id;
  if (!isPartner && !isBooker) throw new HttpError(403, 'This isn’t your flight.');
  const open = b.status === 'requested' || b.status === 'confirmed';
  if (!open) throw new HttpError(409, `This flight is already ${b.status}.`);

  if (action === 'accept') {
    if (!isPartner) throw new HttpError(403, 'Only the invited pilot can accept.');
    if (s.status === 'accepted') return json({ status: 'accepted' });
    if (s.status !== 'invited' || !b.split_pending) throw new HttpError(409, 'This invite is no longer open.');
    if (b.hold_until && new Date(b.hold_until).getTime() <= Date.now()) throw new HttpError(409, 'This invite has run out.');
    if (!b.card_ready) throw new HttpError(409, 'The booker hasn’t finished booking yet.');
    if (body.attest !== true) throw new HttpError(400, 'Confirm you’re current and meet the rental requirements.');
    const deposit = splitShares(Number(b.quote?.total || 0), s.booker_pct).partner;
    if (!(deposit > 0)) throw new HttpError(409, 'Nothing to pay on this flight.');
    const customer = await customerFor(user);
    // Reuse the payment if they opened the sheet before (same amount, still unpaid).
    let pi = s.deposit_pi_id ? await stripe.paymentIntents.retrieve(s.deposit_pi_id) : null;
    if (pi?.status === 'succeeded') return json({ status: (await finalizeDeposit(pi)).status || 'accepted' });
    if (!pi || pi.amount !== cents(deposit) || pi.status === 'canceled') {
      pi = await stripe.paymentIntents.create({
        amount: cents(deposit), currency: 'usd', customer, payment_method_types: ['card'],
        setup_future_usage: 'off_session', description: 'Shared flight deposit', transfer_group: b.id,
        metadata: { booking_id: b.id, split_id: s.id, user_id: user.id },
      }, { idempotencyKey: `dep-${s.id}-${cents(deposit)}` });
    }
    await admin.from('booking_splits').update({ deposit, deposit_pi_id: pi.id, attested_at: new Date().toISOString() }).eq('id', s.id);
    const ek = await stripe.ephemeralKeys.create({ customer }, { apiVersion: '2024-12-18.acacia' });
    await audit(user.id, 'split.deposit_started', b.id, { deposit });
    return json({ status: 'invited', deposit, payment: { paymentIntentClientSecret: pi.client_secret, customer, ephemeralKey: ek.secret } });
  }

  if (action === 'paid') {
    if (!isPartner) throw new HttpError(403, 'Only the invited pilot can pay the deposit.');
    if (s.status === 'accepted') return json({ status: 'accepted' });
    if (!s.deposit_pi_id) return json({ status: s.status });
    const pi = await stripe.paymentIntents.retrieve(s.deposit_pi_id);
    if (pi.status !== 'succeeded') return json({ status: s.status, payment: pi.status });
    const r = await finalizeDeposit(pi);
    if (r.refunded) throw new HttpError(409, 'This invite closed before your deposit went through, so it was refunded.');
    return json({ status: 'accepted' });
  }

  if (action === 'decline') {
    if (!isPartner) throw new HttpError(403, 'Only the invited pilot can decline.');
    if (s.status !== 'invited') throw new HttpError(409, 'This invite is no longer open.');
    await admin.from('booking_splits').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', s.id).eq('status', 'invited');
    await audit(user.id, 'split.declined', b.id);
    return json({ status: 'declined' });
  }

  if (action === 'leave') {
    if (!isPartner) throw new HttpError(403, 'Only the other pilot can leave the flight.');
    if (s.status !== 'accepted') throw new HttpError(409, 'You haven’t joined this flight.');
    if (new Date(b.starts_at).getTime() <= Date.now()) throw new HttpError(409, 'The flight has started.');
    const refunded = await refundDeposit(s, 'partner left');
    await admin.from('booking_splits').update({ status: 'left', responded_at: new Date().toISOString() }).eq('id', s.id);
    await audit(user.id, 'split.left', b.id, { refunded });
    return json({ status: 'left', refunded });
  }

  if (action === 'solo') {
    if (!isBooker) throw new HttpError(403, 'Only the booker can change this.');
    if (!['invited', 'declined', 'accepted'].includes(s.status)) return json({ status: 'solo' });
    if (s.status === 'invited' && s.deposit_pi_id) {
      // They may be paying right now: only cancel a deposit that hasn't gone through.
      const pi = await stripe.paymentIntents.retrieve(s.deposit_pi_id);
      if (pi.status === 'succeeded') throw new HttpError(409, 'The other pilot just paid their deposit. Refresh to see the shared flight.');
      if (pi.status !== 'canceled') await stripe.paymentIntents.cancel(pi.id).catch(() => null);
    }
    const refunded = await refundDeposit(s, 'booker went solo');
    await admin.from('booking_splits').update({ status: 'cancelled' }).eq('id', s.id);
    await admin.from('bookings').update({ split_pending: false, hold_until: null }).eq('id', b.id);
    if (s.status === 'accepted') {
      await admin.from('notifications').insert({ user_id: s.partner_id, kind: 'split_removed', title: 'Shared flight changed', body: 'The booker is flying solo. Your deposit is refunded.', data: { screen: 'Lessons' } });
    }
    await audit(user.id, 'split.solo', b.id, { refunded });
    return json({ status: 'solo', refunded });
  }

  throw new HttpError(400, 'Unknown action.');
});
