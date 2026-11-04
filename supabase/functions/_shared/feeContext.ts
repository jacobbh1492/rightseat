// Booking-fee context for pricing: is the CFI's or plane's school on School Pro, and
// does the student have an active Short Final (no booking fee) promo?
import { admin } from './server.ts';

export async function feeContext({ studentId, affiliation, plane }: { studentId: string; affiliation?: any; plane?: any }) {
  const schoolIds = [affiliation?.school_id, plane?.school_id].filter(Boolean);
  const now = new Date().toISOString();
  const [schools, promo] = await Promise.all([
    schoolIds.length ? admin.from('schools').select('plan').in('id', schoolIds) : Promise.resolve({ data: [] as any[] }),
    admin.from('promo_redemptions').select('id', { count: 'exact', head: true }).eq('user_id', studentId).eq('kind', 'fee_free').gt('ends_at', now),
  ]);
  return {
    schoolPro: (schools.data || []).some((s: any) => s.plan === 'pro'),
    feeFree: (promo.count || 0) > 0,
  };
}
