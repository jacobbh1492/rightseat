// POST /payment-methods — the signed-in user's saved cards.
//  { action: 'list' }               → { cards: [{ id, brand, last4, expMonth, expYear, isDefault }] }
//  { action: 'setup' }              → Stripe sheet secrets to add a card (nothing is charged)
//  { action: 'default', id }        → make that card the default
//  { action: 'remove', id }         → remove a saved card
// Upcoming lessons are charged to the card saved when they were booked; if that card was
// removed, booking-action charges the default card instead (see charge()).
import { serve, json, stripe, requireUser, customerFor, audit } from '../_shared/server.ts';
import { HttpError } from '../_shared/bookings.js';

async function cardsFor(customer: string) {
  const [pms, cust] = await Promise.all([
    stripe.customers.listPaymentMethods(customer, { type: 'card', limit: 20 }),
    stripe.customers.retrieve(customer),
  ]);
  const def = (cust as any)?.invoice_settings?.default_payment_method;
  const defaultId = typeof def === 'string' ? def : def?.id || null;
  const cards = pms.data.map((pm) => ({
    id: pm.id,
    brand: pm.card?.brand || 'card',
    last4: pm.card?.last4 || '',
    expMonth: pm.card?.exp_month || null,
    expYear: pm.card?.exp_year || null,
    isDefault: pm.id === defaultId,
  }));
  // No default set yet: treat the newest card as the default.
  if (cards.length && !cards.some((c) => c.isDefault)) cards[0].isDefault = true;
  return cards;
}

async function owned(customer: string, id: string) {
  if (!/^pm_[A-Za-z0-9]+$/.test(id)) throw new HttpError(400, 'That card wasn’t found.');
  const pm = await stripe.paymentMethods.retrieve(id);
  if (pm.customer !== customer) throw new HttpError(404, 'That card wasn’t found.');
  return pm;
}

serve(async (req, body) => {
  const user = await requireUser(req);
  const customer = await customerFor(user);
  const action = String(body.action || 'list');

  if (action === 'list') return json({ cards: await cardsFor(customer) });

  if (action === 'setup') {
    const si = await stripe.setupIntents.create({
      customer, usage: 'off_session', payment_method_types: ['card'],
      metadata: { user_id: user.id, purpose: 'add_card' },
    });
    const ek = await stripe.ephemeralKeys.create({ customer }, { apiVersion: '2024-12-18.acacia' });
    return json({ payment: { customer, ephemeralKey: ek.secret, setupIntentClientSecret: si.client_secret } });
  }

  if (action === 'added') {
    // After the sheet: if this is their only card, make it the default.
    const cards = await cardsFor(customer);
    const cust: any = await stripe.customers.retrieve(customer);
    if (cards.length && !cust?.invoice_settings?.default_payment_method) {
      await stripe.customers.update(customer, { invoice_settings: { default_payment_method: cards[0].id } });
      cards.forEach((c, i) => (c.isDefault = i === 0));
    }
    await audit(user.id, 'card.added', user.id, { count: cards.length });
    return json({ cards });
  }

  if (action === 'default') {
    const pm = await owned(customer, String(body.id || ''));
    await stripe.customers.update(customer, { invoice_settings: { default_payment_method: pm.id } });
    await audit(user.id, 'card.default', user.id, { last4: pm.card?.last4 || null });
    return json({ cards: await cardsFor(customer) });
  }

  if (action === 'remove') {
    const pm = await owned(customer, String(body.id || ''));
    await stripe.paymentMethods.detach(pm.id);
    // If it was the default, promote the newest remaining card.
    const cust: any = await stripe.customers.retrieve(customer);
    const def = cust?.invoice_settings?.default_payment_method;
    if (!def || (typeof def === 'string' ? def : def.id) === pm.id) {
      const rest = await stripe.customers.listPaymentMethods(customer, { type: 'card', limit: 1 });
      await stripe.customers.update(customer, { invoice_settings: { default_payment_method: rest.data[0]?.id || '' } });
    }
    await audit(user.id, 'card.removed', user.id, { last4: pm.card?.last4 || null });
    return json({ cards: await cardsFor(customer) });
  }

  throw new HttpError(400, 'Unknown action.');
});
