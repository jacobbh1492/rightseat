// "Get matched" training requests (migration 20261109010000_matching_gifts.sql).
import { supabase } from './supabase';

// request: { goal, airport, days, times, maxRate, needPlane, glass, styles, note }
// matches: [{ cfi, reasons }] (1–3)
export async function sendTrainingRequest(request, matches) {
  const { data, error } = await supabase.rpc('send_training_request', {
    p: request,
    p_matches: matches.map((m) => ({ cfiId: m.cfi.id, reasons: m.reasons })),
  });
  if (error) throw error;
  return data;
}

const reqFromRow = (r) => ({
  id: r.id, studentId: r.student_id, goal: r.goal, airport: r.airport, days: r.days || [], times: r.times || [],
  maxRate: r.max_rate == null ? null : Number(r.max_rate), needPlane: r.need_plane, glass: r.glass, styles: r.styles || [],
  note: r.note || '', status: r.status, createdAt: r.created_at,
});

// Student: their requests and each instructor's answer.
export async function fetchMyTrainingRequests(uid) {
  const { data: reqs, error } = await supabase.from('training_requests').select('*').eq('student_id', uid).order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  const ids = (reqs || []).map((r) => r.id);
  const { data: sent } = ids.length ? await supabase.from('training_request_cfis').select('*').in('request_id', ids) : { data: [] };
  return (reqs || []).map((r) => ({
    ...reqFromRow(r),
    cfis: (sent || []).filter((s) => s.request_id === r.id).map((s) => ({ cfiId: s.cfi_id, status: s.status, reply: s.reply, reasons: s.reasons || [], respondedAt: s.responded_at })),
  }));
}

// Instructor: requests sent to them.
export async function fetchRequestsForCfi(uid) {
  const { data: rows, error } = await supabase.from('training_request_cfis').select('*').eq('cfi_id', uid).limit(50);
  if (error) throw error;
  const ids = (rows || []).map((r) => r.request_id);
  const { data: reqs } = ids.length ? await supabase.from('training_requests').select('*').in('id', ids) : { data: [] };
  const students = [...new Set((reqs || []).map((r) => r.student_id))];
  const { data: names } = students.length ? await supabase.from('profiles').select('id, full_name, home_airport').in('id', students) : { data: [] };
  const nameBy = Object.fromEntries((names || []).map((p) => [p.id, p.full_name || 'A student']));
  return (rows || []).map((s) => {
    const r = (reqs || []).find((x) => x.id === s.request_id);
    return r ? { ...reqFromRow(r), studentName: nameBy[r.student_id] || 'A student', myStatus: s.status, myReply: s.reply, reasons: s.reasons || [] } : null;
  }).filter(Boolean).sort((a, b) => (a.myStatus === 'sent' ? 0 : 1) - (b.myStatus === 'sent' ? 0 : 1) || new Date(b.createdAt) - new Date(a.createdAt));
}

export async function respondTrainingRequest(requestId, interested, reply = '') {
  const { error } = await supabase.rpc('respond_training_request', { p_request: requestId, p_interested: interested, p_reply: reply });
  if (error) throw error;
}

export async function closeTrainingRequest(requestId) {
  const { error } = await supabase.rpc('close_training_request', { p_request: requestId });
  if (error) throw error;
}
