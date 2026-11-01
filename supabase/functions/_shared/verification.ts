// Shared helpers for verification checks (see migrations/20261101000000_verification.sql).
import { admin } from './server.ts';

export async function upsertCheck(row: Record<string, unknown>) {
  const { error } = await admin.from('verifications').upsert({ checked_at: new Date().toISOString(), ...row }, { onConflict: 'subject_type,subject_id,check_type' });
  if (error) throw error;
}

// Record a finished Identity session for the instructor it belongs to. Used by the
// verify function (when the app checks back) and the Stripe webhook.
export async function recordIdentity(session: any) {
  const userId = session.metadata?.user_id;
  if (!userId) return null;
  if (session.status === 'verified') {
    const out = session.verified_outputs || {};
    const name = { first: out.first_name || '', last: out.last_name || '' };
    await upsertCheck({ subject_type: 'cfi', subject_id: userId, check_type: 'identity', status: 'passed',
      detail: { session: session.id, name, state: out.address?.state || null } });
    // The FAA job matches this verified name against the Airmen Registry.
    const { data: faa } = await admin.from('verifications').select('status').eq('subject_type', 'cfi').eq('subject_id', userId).eq('check_type', 'faa_airmen').maybeSingle();
    if (!faa || faa.status === 'failed') await upsertCheck({ subject_type: 'cfi', subject_id: userId, check_type: 'faa_airmen', status: 'pending', detail: { note: 'Queued for the next FAA registry check' } });
    return 'passed';
  }
  if (session.status === 'requires_input') {
    await upsertCheck({ subject_type: 'cfi', subject_id: userId, check_type: 'identity', status: 'failed',
      detail: { session: session.id, reason: session.last_error?.reason || session.last_error?.code || 'Stripe couldn’t verify the ID' } });
    return 'failed';
  }
  return session.status; // processing / canceled
}

