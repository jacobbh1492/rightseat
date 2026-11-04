// Launch promo codes: what the signed-in user has redeemed, and redeeming a new one.
import { supabase, callFn } from './supabase';

export async function fetchMyPromos(uid) {
  const { data, error } = await supabase.from('promo_redemptions').select('code, kind, school_id, ends_at').eq('user_id', uid);
  if (error) throw error;
  return (data || []).map((r) => ({ code: r.code, kind: r.kind, schoolId: r.school_id, endsAt: r.ends_at }));
}

export const redeemPromoCode = (code) => callFn('promo', { code });
