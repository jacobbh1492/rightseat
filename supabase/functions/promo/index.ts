// POST /promo { code, schoolId? } — redeem a launch promo code.
//   Runup       → CFI Pro free for 12 months (needs an instructor profile)
//   Hold Short  → School Pro free for 12 months (needs a school you run; one per school)
//   Short Final → no booking fee for 3 months (anyone who books lessons or rentals)
// Each person can use each code once. The hourly sweep switches perks off when they end.
import { serve, json, admin, requireUser, audit } from '../_shared/server.ts';
import { HttpError } from '../_shared/bookings.js';
import { normalizePromo, promoEnds } from '../_shared/promos.js';

serve(async (req, body) => {
  const user = await requireUser(req);
  const code = normalizePromo(body?.code);
  if (!code) throw new HttpError(400, 'Enter a promo code.');
  const { data: promo } = await admin.from('promo_codes').select('*').eq('code', code).maybeSingle();
  if (!promo || !promo.active) throw new HttpError(404, 'That code isn’t valid. Check the spelling and try again.');

  const { data: used } = await admin.from('promo_redemptions').select('id').eq('code', code).eq('user_id', user.id).maybeSingle();
  if (used) throw new HttpError(409, `You’ve already used ${promo.label}.`);

  let schoolId: string | null = null;
  if (promo.kind === 'cfi_pro') {
    const { data: cfi } = await admin.from('cfis').select('id').eq('id', user.id).maybeSingle();
    if (!cfi) throw new HttpError(409, 'Runup is for instructors. Create your CFI profile first, then enter the code.');
  } else if (promo.kind === 'school_pro') {
    let q = admin.from('school_admins').select('school_id').eq('user_id', user.id);
    if (body?.schoolId) q = q.eq('school_id', body.schoolId);
    const { data: runs } = await q.limit(1);
    schoolId = runs?.[0]?.school_id || null;
    if (!schoolId) throw new HttpError(409, 'Hold Short is for flight schools. Set up your school first, then enter the code.');
    const { data: taken } = await admin.from('promo_redemptions').select('id').eq('code', code).eq('school_id', schoolId).maybeSingle();
    if (taken) throw new HttpError(409, 'Your school has already used Hold Short.');
  }
  // A window that's still running (from another code of the same kind) is extended, not cut short.
  const { data: open } = await admin.from('promo_redemptions').select('ends_at')
    .eq('kind', promo.kind).gt('ends_at', new Date().toISOString())
    .eq(schoolId ? 'school_id' : 'user_id', schoolId || user.id).order('ends_at', { ascending: false }).limit(1);
  const endsAt = promoEnds(promo.months, new Date(), open?.[0]?.ends_at || null);

  const { error } = await admin.from('promo_redemptions').insert({ code, kind: promo.kind, user_id: user.id, school_id: schoolId, ends_at: endsAt.toISOString() });
  if (error) {
    if (error.code === '23505') throw new HttpError(409, `${promo.label} has already been used here.`);
    throw error;
  }
  if (promo.kind === 'cfi_pro') await admin.from('cfis').update({ pro: true }).eq('id', user.id);
  if (promo.kind === 'school_pro') await admin.from('schools').update({ plan: 'pro' }).eq('id', schoolId);
  await audit(user.id, 'promo.redeem', code, { kind: promo.kind, schoolId, endsAt });

  return json({ code: promo.label, kind: promo.kind, schoolId, endsAt: endsAt.toISOString() });
});
