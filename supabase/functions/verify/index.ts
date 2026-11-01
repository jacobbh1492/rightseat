// POST /verify { action, ... } — getting instructors and planes verified.
//
//  status                         my checks (instructor + my planes) and their state
//  identity                       start Stripe Identity (ID photo + selfie); returns a URL to open
//  identity_check                 re-check my latest Identity session (also done by the webhook)
//  insurance { planeId, path }    submit an uploaded insurance document for review
//  queue                          (staff) checks waiting for a person, with a link to the document
//  decide { id, decision, note }  (staff) pass or fail a check
//
// Automatic FAA checks (airmen and aircraft registries) run in a scheduled GitHub job
// (.github/workflows/faa-verify.yml) and write their results to the same table.
import { serve, json, admin, stripe, requireUser, audit } from '../_shared/server.ts';
import { HttpError } from '../_shared/bookings.js';
import { upsertCheck, recordIdentity } from '../_shared/verification.ts';

serve(async (req, body) => {
  const user = await requireUser(req);
  const action = String(body.action || '');
  const { data: me } = await admin.from('profiles').select('id, full_name, is_staff').eq('id', user.id).single();

  if (action === 'status') {
    const { data: planes } = await admin.from('planes').select('id, tail').eq('owner_id', user.id);
    const ids = (planes || []).map((p) => p.id);
    const { data: checks } = await admin.from('verifications').select('subject_type, subject_id, check_type, status, detail, checked_at')
      .or(`and(subject_type.eq.cfi,subject_id.eq.${user.id})${ids.length ? `,and(subject_type.eq.plane,subject_id.in.(${ids.join(',')}))` : ''}`);
    return json({ checks: checks || [], planes: planes || [] });
  }

  if (action === 'identity') {
    const { data: cfi } = await admin.from('cfis').select('id').eq('id', user.id).maybeSingle();
    if (!cfi) throw new HttpError(400, 'Create your instructor profile first.');
    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      options: { document: { require_matching_selfie: true, require_live_capture: true } },
      metadata: { user_id: user.id },
      provided_details: user.email ? { email: user.email } : undefined,
      return_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/connect-return?state=done`,
    });
    await upsertCheck({ subject_type: 'cfi', subject_id: user.id, check_type: 'identity', status: 'pending', detail: { session: session.id } });
    await audit(user.id, 'verify.identity_started', user.id, { session: session.id });
    return json({ url: session.url });
  }

  if (action === 'identity_check') {
    const { data: row } = await admin.from('verifications').select('status, detail').eq('subject_type', 'cfi').eq('subject_id', user.id).eq('check_type', 'identity').maybeSingle();
    const sessionId = (row?.detail as any)?.session;
    if (!sessionId) return json({ status: 'none' });
    if (row?.status === 'passed') return json({ status: 'passed' });
    const session = await stripe.identity.verificationSessions.retrieve(sessionId, { expand: ['verified_outputs'] });
    return json({ status: await recordIdentity(session) });
  }

  if (action === 'insurance') {
    const planeId = String(body.planeId || '');
    const path = String(body.path || '');
    const { data: plane } = await admin.from('planes').select('id, owner_id, tail').eq('id', planeId).maybeSingle();
    if (!plane || plane.owner_id !== user.id) throw new HttpError(403, 'That isn’t your plane.');
    if (!path.startsWith(`${user.id}/`)) throw new HttpError(400, 'Upload the document first.');
    const { data: doc, error } = await admin.from('documents').insert({ owner_id: user.id, plane_id: planeId, doc_type: 'insurance', path, status: 'review' }).select('id').single();
    if (error) throw error;
    await upsertCheck({ subject_type: 'plane', subject_id: planeId, check_type: 'insurance', status: 'review', document_id: doc.id,
      detail: { note: 'Waiting for RightSeat to review the policy', tail: plane.tail } });
    return json({ status: 'review' });
  }

  // ---- staff only
  if (!me?.is_staff) throw new HttpError(403, 'Staff only.');

  if (action === 'queue') {
    const { data: rows } = await admin.from('verifications').select('*').in('status', ['review', 'pending']).order('checked_at');
    const cfiIds = (rows || []).filter((r) => r.subject_type === 'cfi').map((r) => r.subject_id);
    const planeIds = (rows || []).filter((r) => r.subject_type === 'plane').map((r) => r.subject_id);
    const [{ data: people }, { data: planes }] = await Promise.all([
      cfiIds.length ? admin.from('profiles').select('id, full_name').in('id', cfiIds) : { data: [] },
      planeIds.length ? admin.from('planes').select('id, tail, make, model, owner_id').in('id', planeIds) : { data: [] },
    ]);
    const items = [];
    for (const r of rows || []) {
      let url = null;
      if (r.document_id) {
        const { data: d } = await admin.from('documents').select('path').eq('id', r.document_id).single();
        if (d) url = (await admin.storage.from('documents').createSignedUrl(d.path, 60 * 30)).data?.signedUrl || null;
      }
      const p = (planes || []).find((x) => x.id === r.subject_id);
      items.push({
        id: r.id, check: r.check_type, status: r.status, detail: r.detail, checkedAt: r.checked_at, documentUrl: url,
        subject: r.subject_type === 'cfi'
          ? { type: 'cfi', id: r.subject_id, label: (people || []).find((x) => x.id === r.subject_id)?.full_name || 'Instructor' }
          : { type: 'plane', id: r.subject_id, label: p ? `${p.tail} · ${p.make} ${p.model}` : 'Plane' },
      });
    }
    return json({ items });
  }

  if (action === 'decide') {
    const decision = String(body.decision || '');
    if (!['passed', 'failed'].includes(decision)) throw new HttpError(400, 'Decision must be passed or failed.');
    const { data: row } = await admin.from('verifications').select('*').eq('id', String(body.id || '')).maybeSingle();
    if (!row) throw new HttpError(404, 'Not found.');
    const note = String(body.note || '').slice(0, 500);
    const { error } = await admin.from('verifications').update({
      status: decision, reviewed_by: user.id, checked_at: new Date().toISOString(),
      detail: { ...(row.detail || {}), reviewNote: note || null, reviewedAt: new Date().toISOString() },
    }).eq('id', row.id);
    if (error) throw error;
    if (row.document_id) await admin.from('documents').update({ status: decision === 'passed' ? 'approved' : 'rejected', reviewer_id: user.id, review_note: note || null }).eq('id', row.document_id);
    await audit(user.id, `verify.${decision}`, row.subject_id, { check: row.check_type, note });
    return json({ status: decision });
  }

  throw new HttpError(400, 'Unknown action.');
});
