// POST /gift { action, ... } — gift a flight lesson.
//  create { amount, recipientName, recipientEmail?, fromName?, message?, cfiId? }
//         → a PaymentIntent the buyer pays in Stripe's sheet. Charged now; Positive Rate holds the
//           money until the recipient flies (paid out at that lesson's close-out).
//  paid   { giftId } → after the sheet: checks with Stripe and returns the code to pass on.
// Redeeming a code is the claim_gift database function; spending it is booking-action.
import { serve, json, admin, stripe, requireUser, customerFor, audit } from '../_shared/server.ts';
import { parseGift, HttpError } from '../_shared/bookings.js';
import { activateGift } from '../_shared/gifts.ts';

const shape = (g: any) => ({
  id: g.id, code: g.status === 'pending' ? null : g.code, amount: Number(g.amount), remaining: Number(g.remaining), status: g.status,
  recipientName: g.recipient_name, recipientEmail: g.recipient_email, fromName: g.from_name, message: g.message, cfiId: g.cfi_id,
});

serve(async (req, body) => {
  const user = await requireUser(req);
  const action = String(body.action || '');

  if (action === 'create') {
    const g = parseGift(body);
    if (g.cfiId) {
      const { data: c } = await admin.from('cfis').select('id, published').eq('id', g.cfiId).maybeSingle();
      if (!c?.published) g.cfiId = null;
    }
    // Don't let unpaid drafts pile up.
    const { count } = await admin.from('gifts').select('id', { count: 'exact', head: true }).eq('buyer_id', user.id).eq('status', 'pending')
      .gt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    if ((count || 0) >= 10) throw new HttpError(429, 'Too many unfinished gifts today. Try again tomorrow.');
    const { data: gift, error } = await admin.from('gifts').insert({
      buyer_id: user.id, amount: g.amount, remaining: 0, recipient_name: g.recipientName, recipient_email: g.recipientEmail,
      from_name: g.fromName, message: g.message, cfi_id: g.cfiId, status: 'pending',
    }).select().single();
    if (error) throw error;
    const customer = await customerFor(user);
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(g.amount * 100), currency: 'usd', customer, payment_method_types: ['card'],
      description: `Positive Rate gift flight for ${g.recipientName}`, metadata: { gift_id: gift.id, user_id: user.id },
    }, { idempotencyKey: 'gift-' + gift.id });
    await admin.from('gifts').update({ payment_intent_id: pi.id }).eq('id', gift.id);
    const ek = await stripe.ephemeralKeys.create({ customer }, { apiVersion: '2024-12-18.acacia' });
    await audit(user.id, 'gift.created', gift.id, { amount: g.amount });
    return json({ gift: shape(gift), payment: { paymentIntentClientSecret: pi.client_secret, customer, ephemeralKey: ek.secret } }, 201);
  }

  if (action === 'paid') {
    const { data: g } = await admin.from('gifts').select('*').eq('id', String(body.giftId || '')).maybeSingle();
    if (!g || g.buyer_id !== user.id) throw new HttpError(404, 'Gift not found.');
    if (g.status !== 'pending') return json({ gift: shape(g) });
    if (!g.payment_intent_id) return json({ gift: shape(g) });
    const pi = await stripe.paymentIntents.retrieve(g.payment_intent_id);
    const done = await activateGift(pi);
    return json({ gift: shape(done || g) });
  }

  throw new HttpError(400, 'Unknown action.');
});
