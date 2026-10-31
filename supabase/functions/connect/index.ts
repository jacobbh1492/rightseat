// POST /connect { for?: 'me' | schoolId } — start or resume payout setup (Stripe Connect Express).
// Returns a Stripe-hosted onboarding link. Instructors and owners set up their own;
// a school admin sets up the school's account.
import { serve, json, admin, stripe, requireUser } from '../_shared/server.ts';
import { HttpError } from '../_shared/bookings.js';

serve(async (req, body) => {
  const user = await requireUser(req);
  const schoolId = body.for && body.for !== 'me' ? String(body.for) : null;
  let table = 'profiles', id = user.id, name: string | undefined, email = user.email;
  if (schoolId) {
    const { count } = await admin.from('school_admins').select('user_id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('user_id', user.id);
    if (!count) throw new HttpError(403, 'Only a school admin can set up the school’s payouts.');
    table = 'schools'; id = schoolId;
  }
  const { data: row } = await admin.from(table).select(schoolId ? 'stripe_account_id, name' : 'stripe_account_id, full_name').eq('id', id).single();
  name = (row as any)?.name || (row as any)?.full_name;
  let account = (row as any)?.stripe_account_id as string | null;
  // { check: true } — called when the person comes back to the app: refresh status.
  if (body.check) {
    if (!account) return json({ ready: false, started: false });
    const a = await stripe.accounts.retrieve(account);
    const ready = !!(a.details_submitted && a.payouts_enabled && a.capabilities?.transfers === 'active');
    await admin.from(table).update({ payouts_ready: ready }).eq('id', id);
    return json({ ready, started: true, needs: a.requirements?.currently_due?.length || 0 });
  }
  if (!account) {
    const a = await stripe.accounts.create({
      type: 'express', country: 'US', email,
      business_type: schoolId ? 'company' : 'individual',
      capabilities: { transfers: { requested: true } },
      business_profile: { mcc: '8299', product_description: schoolId ? 'Flight school instruction and aircraft rental' : 'Flight instruction and aircraft rental', name },
      metadata: { rightseat_table: table, rightseat_id: id },
    }, { idempotencyKey: `acct-${table}-${id}` });
    account = a.id;
    await admin.from(table).update({ stripe_account_id: account }).eq('id', id);
  }
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/connect-return`;
  const link = await stripe.accountLinks.create({
    account, type: 'account_onboarding',
    refresh_url: `${base}?state=refresh`, return_url: `${base}?state=done`,
  });
  return json({ url: link.url });
});
