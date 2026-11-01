// Common plumbing for every function: CORS, JSON responses, the signed-in user,
// a service-role database client and the Stripe client.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { HttpError } from './bookings.js';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  const first = Object.values(keys)[0];
  if (!first) throw new Error('No service key available');
  return String(first);
}

export const admin: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

export async function requireUser(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in to continue.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your session expired. Sign in again.');
  return data.user;
}

export async function audit(actor: string | null, action: string, target: string, detail: unknown = null) {
  await admin.from('audit_log').insert({ actor_id: actor, action, target, detail });
}

// Wrap a handler: preflight, JSON body, and friendly errors (never leak internals).
export function serve(handler: (req: Request, body: any) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      if (!Deno.env.get('STRIPE_SECRET_KEY')) throw new HttpError(503, 'Payments aren’t configured yet.');
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      return await handler(req, body);
    } catch (e) {
      if (e instanceof HttpError) {
        console.warn(`${new URL(req.url).pathname} ${e.status}: ${e.message}`); // shows in Supabase logs
        return json({ error: e.message }, e.status);
      }
      if (e?.type?.startsWith?.('Stripe')) {
        console.error('stripe', e.type, e.code, e.message);
        const msg = e.code === 'card_declined' || e.type === 'StripeCardError' ? 'The card was declined. Update your payment method and try again.' : 'Payment service error. Try again in a moment.';
        return json({ error: msg, code: e.code || null }, 402);
      }
      console.error(e);
      return json({ error: 'Something went wrong on our side. Try again.' }, 500);
    }
  });
}

// Stripe customer for a student (created once, stored on the profile).
export async function customerFor(user: { id: string; email?: string }) {
  const { data: p } = await admin.from('profiles').select('stripe_customer_id, full_name').eq('id', user.id).single();
  if (p?.stripe_customer_id) return p.stripe_customer_id as string;
  const c = await stripe.customers.create({ email: user.email, name: p?.full_name || undefined, metadata: { user_id: user.id } }, { idempotencyKey: 'cust-' + user.id });
  await admin.from('profiles').update({ stripe_customer_id: c.id }).eq('id', user.id);
  return c.id;
}

// Pay out money that was held because the instructor/owner/school hadn't finished
// payout setup when the lesson closed. Runs when their Stripe account becomes ready.
// Safe to run repeatedly: each held row is paid once (idempotency key + payout row).
export async function releaseHeld(account: string, who: { partyId?: string; schoolId?: string }) {
  let q = admin.from('ledger').select('id, booking_id, kind, amount').like('kind', 'held_%');
  q = who.schoolId ? q.eq('school_id', who.schoolId) : q.eq('party_id', who.partyId!);
  const { data: held } = await q;
  let released = 0;
  for (const h of held || []) {
    const party = h.kind.slice('held_'.length);
    const payoutKind = 'payout_' + party;
    let paid = admin.from('ledger').select('id', { count: 'exact', head: true }).eq('booking_id', h.booking_id).eq('kind', payoutKind);
    paid = who.schoolId ? paid.eq('school_id', who.schoolId) : paid.eq('party_id', who.partyId!);
    const { count } = await paid;
    if (count) continue;
    // The charge the money came from: the lesson charge, or the late-cancel fee.
    const { data: b } = await admin.from('bookings').select('charge_id, status').eq('id', h.booking_id).single();
    let chargeId = b?.charge_id as string | null;
    if (!chargeId) {
      const { data: late } = await admin.from('ledger').select('stripe_ref').eq('booking_id', h.booking_id).eq('kind', 'charge_late_cancel').maybeSingle();
      if (late?.stripe_ref) chargeId = String((await stripe.paymentIntents.retrieve(late.stripe_ref)).latest_charge);
    }
    if (!chargeId) continue;
    const tr = await stripe.transfers.create({
      amount: Math.round(Number(h.amount) * 100), currency: 'usd', destination: account, source_transaction: chargeId,
      transfer_group: h.booking_id, metadata: { booking_id: h.booking_id, party, released_from: h.id },
    }, { idempotencyKey: 'release-' + h.id });
    await admin.from('ledger').insert({ booking_id: h.booking_id, party_id: who.partyId || null, school_id: who.schoolId || null, kind: payoutKind, amount: h.amount, stripe_ref: tr.id });
    released += Number(h.amount);
  }
  return Math.round(released * 100) / 100;
}

// ---- Stripe Accounts v2 (payout accounts for instructors, owners and schools).
// Stripe now creates new connected accounts through the v2 API. The Node SDK
// doesn't cover it yet, so these call the REST endpoints directly.
const STRIPE_V2_VERSION = '2026-10-28.preview';
export async function stripeV2(method: 'GET' | 'POST', path: string, body?: unknown, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
    'Stripe-Version': STRIPE_V2_VERSION,
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch('https://api.stripe.com' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.error?.message || `Stripe ${res.status}`);
    err.type = 'StripeV2Error'; err.code = data?.error?.code || null; err.status = res.status;
    throw err;
  }
  return data;
}

// Ready for payouts = the recipient's transfers capability is active.
export async function payoutStatus(account: string) {
  const a = await stripeV2('GET', `/v2/core/accounts/${account}?include=configuration.recipient&include=requirements`);
  const cap = a?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers;
  const due = (a?.requirements?.entries || []).filter((e: any) => e?.minimum_deadline?.status === 'currently_due' || e?.minimum_deadline?.status === 'past_due').length;
  return { ready: cap?.status === 'active', status: cap?.status || 'unknown', needs: due };
}
