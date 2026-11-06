// Gift flights (gift function + claim_gift). Buying goes through Stripe's sheet: see
// useGiftPurchase in payments.native.js.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

export const giftFromRow = (g) => ({
  id: g.id, code: g.code, amount: Number(g.amount), remaining: Number(g.remaining), status: g.status,
  recipientName: g.recipient_name, recipientEmail: g.recipient_email, fromName: g.from_name, message: g.message,
  cfiId: g.cfi_id, buyerId: g.buyer_id, recipientId: g.recipient_id, createdAt: g.created_at,
});

// Gifts the user bought (to pass on) and gifts they redeemed (to spend).
export async function fetchMyGifts(uid) {
  const { data, error } = await supabase.from('gifts').select('*').or(`buyer_id.eq.${uid},recipient_id.eq.${uid}`).neq('status', 'pending').order('created_at', { ascending: false });
  if (error) throw error;
  const all = (data || []).map(giftFromRow);
  return {
    sent: all.filter((g) => g.buyerId === uid),
    received: all.filter((g) => g.recipientId === uid),
  };
}

// Usable on a lesson with an instructor: redeemed by this user with money left.
export const spendable = (received) => (received || []).filter((g) => ['claimed', 'active'].includes(g.status) && g.remaining > 0);

export async function claimGift(code) {
  const { data, error } = await supabase.rpc('claim_gift', { p_code: code });
  if (error) throw error;
  return giftFromRow(data);
}

export const giftShareText = (g, appUrl = 'https://positiverateflying.com') =>
  `${g.fromName ? g.fromName + ' sent' : 'You’ve got'} a $${Math.round(g.amount)} flight lesson on Positive Rate ✈️${g.message ? `\n\n“${g.message}”` : ''}\n\nYour gift code: ${g.code}\n\nGet the Positive Rate app (${appUrl}), sign in, and enter the code under Account → Gifts. Then book a discovery flight with any instructor.`;

// The signed-in user's gifts, for the booking screen and Account → Gifts.
export function useMyGifts() {
  const auth = useAuth();
  const uid = auth?.session?.user?.id || null;
  const [state, setState] = useState({ loading: !!uid, sent: [], received: [], error: '' });
  const refresh = useCallback(async () => {
    if (!uid) { setState({ loading: false, sent: [], received: [], error: '' }); return; }
    try { setState({ loading: false, ...(await fetchMyGifts(uid)), error: '' }); }
    catch (e) { setState((s) => ({ ...s, loading: false, error: e.message })); }
  }, [uid]);
  useEffect(() => { refresh(); }, [refresh]);
  return { ...state, uid, refresh };
}
