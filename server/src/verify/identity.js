// Stripe Identity: government ID + live selfie. The app opens the hosted flow with the client_secret;
// results arrive by webhook, so nothing blocks on the user's phone.
let stripe;
async function getStripe() {
  if (!stripe) {
    const { default: Stripe } = await import('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

export async function createIdentitySession(userId) {
  const s = await getStripe();
  const session = await s.identity.verificationSessions.create({
    type: 'document',
    metadata: { user_id: userId },
    options: { document: { require_matching_selfie: true, require_live_capture: true, allowed_types: ['driving_license', 'passport', 'id_card'] } },
  });
  return { id: session.id, client_secret: session.client_secret };
}

export async function constructEvent(rawBody, signature) {
  const s = await getStripe();
  return s.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

// Returns a doc record for the pipeline/db, or null for events we ignore.
export async function handleIdentityEvent(event) {
  const session = event.data.object;
  const userId = session.metadata?.user_id;
  if (event.type === 'identity.verification_session.verified') {
    const s = await getStripe();
    const full = await s.identity.verificationSessions.retrieve(session.id, { expand: ['verified_outputs'] });
    const o = full.verified_outputs || {};
    return {
      userId,
      type: 'id',
      status: 'approved',
      by: 'auto',
      fields: { name: [o.first_name, o.last_name].filter(Boolean).join(' '), dob: o.dob ? `${o.dob.year}-${String(o.dob.month).padStart(2, '0')}-${String(o.dob.day).padStart(2, '0')}` : '' },
      checks: [
        { label: 'Document is authentic', level: 'pass', source: 'stripe' },
        { label: 'Live selfie matches ID photo', level: 'pass', source: 'stripe' },
      ],
    };
  }
  if (event.type === 'identity.verification_session.requires_input') {
    return { userId, type: 'id', status: 'rejected', reasons: [session.last_error?.reason || 'Verification could not be completed'], checks: [] };
  }
  return null;
}
