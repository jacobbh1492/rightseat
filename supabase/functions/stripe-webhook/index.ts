// POST /stripe-webhook — events from Stripe (signature-verified, each processed once).
//  setup_intent.succeeded  → the student's card is saved; the request goes to the instructor.
//  account.updated         → mark an instructor/owner/school ready (or not) for payouts.
//  payment_intent.succeeded → a shared-flight deposit went through (if the app didn't report it).
//  payment_intent.payment_failed → record it for follow-up.
//  identity.verification_session.* → record an instructor's ID check (see verify function).
import Stripe from 'npm:stripe@17';
import { admin, stripe, releaseHeld } from '../_shared/server.ts';
import { recordIdentity } from '../_shared/verification.ts';
import { finalizeDeposit } from '../_shared/splits.ts';

const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  // Two Stripe endpoints point here: one for this account's events, one for
  // connected accounts (payout setup). Each has its own signing secret.
  const secrets = [Deno.env.get('STRIPE_WEBHOOK_SECRET'), Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')].filter(Boolean) as string[];
  if (!secrets.length) return new Response('not configured', { status: 503 });
  const raw = await req.text();
  const sig = req.headers.get('stripe-signature') || '';
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try { event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, crypto); break; } catch { /* try next */ }
  }
  if (!event) return new Response('bad signature', { status: 400 });
  const { error: insErr } = await admin.from('stripe_events').insert({ id: event.id, type: event.type });
  if (insErr?.code === '23505') return new Response('duplicate', { status: 200 }); // already processed
  if (insErr) { console.error('stripe_events insert', insErr); return new Response('error', { status: 500 }); } // Stripe retries

  try {
    if (event.type === 'setup_intent.succeeded') {
      const si = event.data.object as Stripe.SetupIntent;
      if (si.metadata?.booking_id) await admin.from('bookings').update({ card_ready: true }).eq('id', si.metadata.booking_id).eq('setup_intent_id', si.id);
    } else if (event.type === 'account.updated') {
      const a = event.data.object as Stripe.Account;
      const ready = !!(a.details_submitted && a.payouts_enabled && a.capabilities?.transfers === 'active');
      await admin.from('profiles').update({ payouts_ready: ready }).eq('stripe_account_id', a.id);
      await admin.from('schools').update({ payouts_ready: ready }).eq('stripe_account_id', a.id);
      if (ready) {
        const { data: p } = await admin.from('profiles').select('id').eq('stripe_account_id', a.id).maybeSingle();
        if (p) await releaseHeld(a.id, { partyId: p.id });
        const { data: s } = await admin.from('schools').select('id').eq('stripe_account_id', a.id).maybeSingle();
        if (s) await releaseHeld(a.id, { schoolId: s.id });
      }
    } else if (event.type === 'identity.verification_session.verified' || event.type === 'identity.verification_session.requires_input') {
      const s = event.data.object as Stripe.Identity.VerificationSession;
      await recordIdentity(await stripe.identity.verificationSessions.retrieve(s.id, { expand: ['verified_outputs'] }));
    } else if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.split_id) await finalizeDeposit(pi);
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      await admin.from('audit_log').insert({ action: 'payment.failed', target: pi.metadata?.booking_id || pi.id, detail: { code: pi.last_payment_error?.code, message: pi.last_payment_error?.message } });
    }
  } catch (e) {
    console.error(e);
    await admin.from('stripe_events').delete().eq('id', event.id); // let Stripe retry
    return new Response('error', { status: 500 });
  }
  return new Response('ok', { status: 200 });
});
