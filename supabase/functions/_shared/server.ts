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
