// POST /delete-account { confirm: "DELETE" } — permanently delete the signed-in user's account.
//
// What happens (matches the Privacy Policy):
//  - Refused while there's a confirmed upcoming lesson, or pay still waiting to be sent to
//    them; the message says what to do first.
//  - Open requests are cancelled at no charge (theirs) or declined (ones sent to them).
//  - Listings are unpublished; messages, notifications, push tokens, their training record
//    and debriefs, photos and the saved Stripe card are deleted.
//  - Booking, payment and payout records are kept for tax and accounting, under an
//    anonymized profile ("Deleted user"); reviews they wrote stay without their name.
//  - The sign-in is removed (soft delete, email released so it can sign up again).
import { serve, json, admin, stripe, requireUser, audit } from '../_shared/server.ts';
import { HttpError } from '../_shared/bookings.js';

const ok = (r: { error: any }) => { if (r.error) throw r.error; };

serve(async (req, body) => {
  const user = await requireUser(req);
  if (String(body.confirm || '') !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.');
  const uid = user.id;

  const { data: planes } = await admin.from('planes').select('id').eq('owner_id', uid);
  const planeIds = (planes || []).map((p) => p.id);
  const mine = `student_id.eq.${uid},cfi_id.eq.${uid}${planeIds.length ? `,plane_id.in.(${planeIds.join(',')})` : ''}`;

  // 1. Nothing in flight.
  const { data: confirmed } = await admin.from('bookings').select('id, starts_at').or(mine).eq('status', 'confirmed');
  if (confirmed?.length) {
    throw new HttpError(409, `You have ${confirmed.length} confirmed lesson${confirmed.length > 1 ? 's' : ''}. Cancel or complete ${confirmed.length > 1 ? 'them' : 'it'} first, then delete your account.`);
  }
  const { data: held } = await admin.from('ledger').select('booking_id, kind, amount').eq('party_id', uid).like('kind', 'held_%');
  let owed = 0;
  for (const h of held || []) {
    const { count } = await admin.from('ledger').select('id', { count: 'exact', head: true }).eq('booking_id', h.booking_id).eq('party_id', uid).eq('kind', 'payout_' + h.kind.slice(5));
    if (!count) owed += Number(h.amount);
  }
  if (owed > 0) throw new HttpError(409, `$${owed.toFixed(2)} in lesson pay is still waiting for you. Set up payouts to receive it, or contact support, before deleting your account.`);

  // 2. Close open requests (no charges are made for requests).
  const { data: open } = await admin.from('bookings').select('id, student_id').or(mine).eq('status', 'requested');
  for (const b of open || []) {
    ok(await admin.from('bookings').update({ status: 'cancelled', cancelled_by: uid, cancel_reason: b.student_id === uid ? 'Account deleted' : 'Declined: instructor or owner left RightSeat' }).eq('id', b.id));
  }

  // 3. Take listings down (rows stay so past bookings still make sense).
  ok(await admin.from('cfis').update({ published: false }).eq('id', uid));
  ok(await admin.from('cfi_planes').delete().eq('cfi_id', uid));
  if (planeIds.length) ok(await admin.from('planes').update({ published: false }).in('id', planeIds));

  // 4. Delete personal content.
  ok(await admin.from('push_tokens').delete().eq('user_id', uid));
  ok(await admin.from('notifications').delete().eq('user_id', uid));
  ok(await admin.from('threads').delete().or(`a.eq.${uid},b.eq.${uid}`)); // messages go with their threads
  ok(await admin.from('debriefs').delete().eq('student_id', uid));
  ok(await admin.from('training').delete().eq('student_id', uid));
  ok(await admin.from('reviews').update({ author_name: 'Former RightSeat pilot' }).eq('author_id', uid));
  for (const [bucket, prefix] of [['avatars', uid], ['plane-photos', uid], ['documents', uid]] as const) {
    const { data: files } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    const paths: string[] = [];
    for (const f of files || []) {
      if (f.id) paths.push(`${prefix}/${f.name}`);
      else { // a folder (one per plane)
        const { data: inner } = await admin.storage.from(bucket).list(`${prefix}/${f.name}`, { limit: 1000 });
        for (const g of inner || []) paths.push(`${prefix}/${f.name}/${g.name}`);
      }
    }
    if (paths.length) await admin.storage.from(bucket).remove(paths);
  }
  if (planeIds.length) ok(await admin.from('plane_photos').delete().in('plane_id', planeIds));

  // 5. Saved card at Stripe (past charges stay in Stripe's records).
  const { data: prof } = await admin.from('profiles').select('stripe_customer_id').eq('id', uid).single();
  if (prof?.stripe_customer_id) {
    try { await stripe.customers.del(prof.stripe_customer_id); } catch (e) { console.warn('customer delete', (e as any)?.message); }
  }

  // 6. Anonymize the profile that past bookings point to.
  ok(await admin.from('profiles').update({
    full_name: 'Deleted user', avatar_url: null, phone: null, home_airport: null,
    roles: [], onboarded: false, stripe_customer_id: null, payouts_ready: false,
  }).eq('id', uid));
  await audit(uid, 'account.deleted', uid, {});

  // 7. Remove the sign-in. Soft delete scrubs the email and phone (so they can sign up again
  //    later) while keeping the row the booking history points to.
  ok(await admin.auth.admin.deleteUser(uid, true));

  return json({ deleted: true });
});
