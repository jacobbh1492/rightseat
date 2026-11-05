// Gift discovery flights: the buyer's payment went through, so the gift gets its code.
// Safe to call more than once (the app and the Stripe webhook both report it).
import { admin, audit } from './server.ts';
import { giftCode } from './bookings.js';

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export async function activateGift(pi: any) {
  const giftId = pi?.metadata?.gift_id;
  if (!giftId || pi.status !== 'succeeded') return null;
  const { data: g } = await admin.from('gifts').select('*').eq('id', giftId).single();
  if (!g || g.payment_intent_id !== pi.id) return null;
  if (g.status !== 'pending') return g;
  if (Math.round(Number(g.amount) * 100) !== pi.amount_received) {
    await audit(g.buyer_id, 'gift.amount_mismatch', g.id, { expected: g.amount, received: pi.amount_received / 100 });
    return null;
  }
  for (let i = 0; i < 5; i++) {
    const { data: won, error } = await admin.from('gifts').update({
      status: 'active', code: giftCode(random), remaining: g.amount, charge_id: String(pi.latest_charge), paid_at: new Date().toISOString(),
    }).eq('id', g.id).eq('status', 'pending').select().maybeSingle();
    if (error?.code === '23505') continue; // code collision: draw another
    if (error) throw error;
    if (!won) break; // the other report got there first
    await admin.from('ledger').insert({ party_id: g.buyer_id, kind: 'charge_gift', amount: g.amount, stripe_ref: pi.id });
    await audit(g.buyer_id, 'gift.paid', g.id, { amount: g.amount });
    // Already on RightSeat? Tell them (they still redeem the code, so it's theirs to keep or pass on).
    if (g.recipient_email) {
      const { data: uid } = await admin.rpc('user_id_by_email', { p_email: g.recipient_email });
      if (uid && uid !== g.buyer_id) {
        await admin.from('notifications').insert({ user_id: uid, kind: 'gift_received', title: `${g.from_name || 'Someone'} sent you a flight ✈️`,
          body: `A $${Number(g.amount).toFixed(0)} gift toward a flight lesson. Your code: ${won.code}`, data: { screen: 'Gifts', params: { code: won.code } } });
      }
    }
    return won;
  }
  const { data: now } = await admin.from('gifts').select('*').eq('id', g.id).single();
  return now;
}
