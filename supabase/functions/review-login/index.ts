// POST /review-login — sign-in for Apple's App Review account only.
// The app signs people in with a 6-digit code sent by email, which Apple's reviewer
// can't receive. For exactly REVIEW_EMAIL, a fixed 6-digit code (Supabase secret
// REVIEW_LOGIN_CODE) is accepted instead and exchanged for a normal one-time sign-in
// token. Any other email is refused; no secret set → the door is closed.
// Throttled: 10 wrong codes in an hour locks it until the hour passes.
import { serve, json, admin, audit } from '../_shared/server.ts';
import { HttpError } from '../_shared/bookings.js';

const REVIEW_EMAIL = 'appreview@positiverateflying.com';

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

serve(async (_req, body) => {
  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.code || '').trim();
  const secret = (Deno.env.get('REVIEW_LOGIN_CODE') || '').trim();
  if (email !== REVIEW_EMAIL || !/^\d{6}$/.test(secret)) throw new HttpError(400, 'That code didn’t work. Check it, or send a new one.');

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from('audit_log').select('id', { count: 'exact', head: true })
    .eq('action', 'review_login.failed').gte('created_at', since);
  if ((count || 0) >= 10) throw new HttpError(429, 'Too many tries. Wait a minute, then send a new code.');

  if (!same(code, secret)) {
    await audit(null, 'review_login.failed', REVIEW_EMAIL);
    throw new HttpError(400, 'That code didn’t work. Check it, or send a new one.');
  }

  // Make sure the account exists (first review), then mint a one-time sign-in token.
  const { error: createErr } = await admin.auth.admin.createUser({ email: REVIEW_EMAIL, email_confirm: true });
  if (createErr && !/already|registered|exists/i.test(createErr.message)) throw createErr;
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: REVIEW_EMAIL });
  if (error || !data?.properties?.hashed_token) throw error || new Error('No sign-in token');
  await audit(null, 'review_login.ok', REVIEW_EMAIL);
  return json({ token_hash: data.properties.hashed_token });
});
