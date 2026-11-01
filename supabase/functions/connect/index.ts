// POST /connect { for?: 'me' | schoolId } — start or resume payout setup (Stripe Connect,
// Accounts v2 recipient with the Express dashboard).
// Returns a Stripe-hosted onboarding link. Instructors and owners set up their own;
// a school admin sets up the school's account.
import { serve, json, admin, requireUser, releaseHeld, stripeV2, payoutStatus } from '../_shared/server.ts';
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
    const st = await payoutStatus(account);
    await admin.from(table).update({ payouts_ready: st.ready }).eq('id', id);
    const released = st.ready ? await releaseHeld(account, schoolId ? { schoolId } : { partyId: id }) : 0;
    return json({ ready: st.ready, started: true, status: st.status, needs: st.needs, released });
  }
  if (!account) {
    // Recipient account: receives transfers from RightSeat; Stripe hosts onboarding and the
    // Express dashboard; RightSeat pays Stripe fees and covers negative balances.
    const a = await stripeV2('POST', '/v2/core/accounts', {
      contact_email: email,
      display_name: name || undefined,
      dashboard: 'express',
      identity: { country: 'us', entity_type: schoolId ? 'company' : 'individual' },
      defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
      metadata: { rightseat_table: table, rightseat_id: id },
    }, `acct-v2-${table}-${id}`);
    account = a.id as string;
    await admin.from(table).update({ stripe_account_id: account }).eq('id', id);
  }
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/connect-return`;
  const link = await stripeV2('POST', '/v2/core/account_links', {
    account,
    use_case: { type: 'account_onboarding', account_onboarding: { configurations: ['recipient'], refresh_url: `${base}?state=refresh`, return_url: `${base}?state=done` } },
  });
  return json({ url: link.url });
});
