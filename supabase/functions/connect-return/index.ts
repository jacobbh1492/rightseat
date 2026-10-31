// GET /connect-return — Stripe sends people here after payout setup. We bounce them
// straight back into the app (rightseat://payouts), which re-checks their status.
Deno.serve((req) => {
  const state = new URL(req.url).searchParams.get('state') === 'refresh' ? 'refresh' : 'done';
  return new Response(null, { status: 302, headers: { Location: `rightseat://payouts?state=${state}` } });
});
