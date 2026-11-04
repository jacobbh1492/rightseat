// Squawks, inspections and mechanic access (migration 20261109000000_squawks_mechanics_currency.sql).
import { supabase } from './supabase';

const listeners = new Set();
export const onMaintenanceChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = () => listeners.forEach((fn) => fn());

const photoUrl = (path) => supabase.storage.from('squawk-photos').getPublicUrl(path).data.publicUrl;

export const squawkFromRow = (q, names = {}) => ({
  id: q.id, planeId: q.plane_id, text: q.text, grounding: !!q.grounding, status: q.status,
  photos: (q.photos || []).map(photoUrl), reportedBy: q.reported_by, reporterName: names[q.reported_by] || null,
  resolvedNote: q.resolved_note || '', resolvedAt: q.resolved_at, createdAt: q.created_at, bookingId: q.booking_id,
  date: new Date(q.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
});

// Open and deferred squawks for some planes (listings, booking checks).
export async function fetchOpenSquawks(planeIds) {
  if (!planeIds.length) return [];
  const { data, error } = await supabase.from('squawks').select('*').in('plane_id', planeIds).in('status', ['open', 'deferred']).order('created_at', { ascending: false });
  if (error) return []; // guests can't read squawks; listings still render
  return (data || []).map((q) => squawkFromRow(q));
}

// Everything for one plane's maintenance view: squawks (recent fixed ones too), inspections, mechanics.
export async function fetchMaintenance(planeId) {
  const [{ data: sq, error: e1 }, { data: log }, { data: mechs }, { data: plane }] = await Promise.all([
    supabase.from('squawks').select('*').eq('plane_id', planeId).order('created_at', { ascending: false }).limit(60),
    supabase.from('plane_maintenance').select('*').eq('plane_id', planeId).order('done_on', { ascending: false }).limit(20),
    supabase.from('plane_mechanics').select('*').eq('plane_id', planeId).in('status', ['invited', 'active']).order('created_at'),
    supabase.from('planes').select('id, tail, make, model, hobbs_total, next_100_at, annual_date, owner_id').eq('id', planeId).maybeSingle(),
  ]);
  if (e1) throw e1;
  const people = [...new Set((sq || []).map((q) => q.reported_by).concat((log || []).map((l) => l.logged_by)).filter(Boolean))];
  const { data: names } = people.length ? await supabase.from('profiles').select('id, full_name').in('id', people) : { data: [] };
  const nameBy = Object.fromEntries((names || []).map((p) => [p.id, p.full_name || 'Pilot']));
  return {
    plane: plane && { id: plane.id, tail: plane.tail, make: plane.make, model: plane.model, hobbsTotal: Number(plane.hobbs_total || 0), next100At: Number(plane.next_100_at || 0), annualDate: plane.annual_date, ownerId: plane.owner_id },
    squawks: (sq || []).map((q) => squawkFromRow(q, nameBy)),
    log: (log || []).map((l) => ({ id: l.id, kind: l.kind, doneOn: l.done_on, hobbs: l.hobbs == null ? null : Number(l.hobbs), note: l.note, by: nameBy[l.logged_by] || '' })),
    mechanics: (mechs || []).map((m) => ({ id: m.id, email: m.email, name: m.name, status: m.status, userId: m.user_id })),
  };
}

// Photos are uploaded first (to the reporter's own folder), then attached to the squawk.
export async function uploadSquawkPhotos(uid, uris) {
  const paths = [];
  for (const uri of (uris || []).slice(0, 4)) {
    const res = await fetch(uri);
    const body = await res.arrayBuffer();
    const type = res.headers.get('content-type') || 'image/jpeg';
    const ext = ((String(uri).match(/\.(jpe?g|png|heic|webp)(\?|$)/i) || [])[1] || 'jpg').toLowerCase();
    const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('squawk-photos').upload(path, body, { contentType: type });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

export async function reportSquawk({ planeId, text, grounding, photoPaths = [], bookingId = null }) {
  const { data, error } = await supabase.rpc('report_squawk', { p_plane: planeId, p_text: text, p_grounding: !!grounding, p_photos: photoPaths, p_booking: bookingId });
  if (error) throw error;
  changed();
  return squawkFromRow(data);
}

// status: open | deferred | fixed. grounding: optional change.
export async function updateSquawk(id, status, note = null, grounding = null) {
  const { data, error } = await supabase.rpc('update_squawk', { p_id: id, p_status: status, p_note: note, p_grounding: grounding });
  if (error) throw error;
  changed();
  return squawkFromRow(data);
}

export async function logInspection(planeId, kind, doneOn, hobbs = null, note = '') {
  const { error } = await supabase.rpc('log_inspection', { p_plane: planeId, p_kind: kind, p_done_on: doneOn, p_hobbs: hobbs, p_note: note });
  if (error) throw error;
  changed();
}

export async function inviteMechanic(planeId, email, name = '') {
  const { error } = await supabase.rpc('invite_mechanic', { p_plane: planeId, p_email: email, p_name: name });
  if (error) throw error;
}
export async function removeMechanic(id) {
  const { error } = await supabase.rpc('remove_mechanic', { p_id: id });
  if (error) throw error;
}
export async function respondMechanicInvite(id, accept) {
  const { error } = await supabase.rpc('respond_mechanic_invite', { p_id: id, p_accept: accept });
  if (error) throw error;
  changed();
}

// The signed-in mechanic's invites and planes. (RLS shows rows for their user or email.)
export async function fetchMyMechanicAccess() {
  const { data, error } = await supabase.from('plane_mechanics').select('*').in('status', ['invited', 'active']);
  if (error) throw error;
  const { data: { user } } = await supabase.auth.getUser();
  const mine = (data || []).filter((m) => m.user_id === user?.id || m.email === (user?.email || '').toLowerCase());
  // Invites can't see the plane yet; the owner's name says who it's from.
  const planeIds = [...new Set(mine.filter((m) => m.status === 'active').map((m) => m.plane_id))];
  const owners = [...new Set(mine.map((m) => m.invited_by).filter(Boolean))];
  const [{ data: planes }, { data: names }] = await Promise.all([
    planeIds.length ? supabase.from('planes').select('id, tail, make, model, home_airport').in('id', planeIds) : { data: [] },
    owners.length ? supabase.from('profiles').select('id, full_name').in('id', owners) : { data: [] },
  ]);
  const planeBy = Object.fromEntries((planes || []).map((p) => [p.id, p]));
  const nameBy = Object.fromEntries((names || []).map((p) => [p.id, p.full_name || 'A plane owner']));
  return mine.map((m) => ({ id: m.id, planeId: m.plane_id, status: m.status, from: nameBy[m.invited_by] || 'A plane owner', plane: planeBy[m.plane_id] || null }));
}

// Owner: change renter rules stored in the plane's details (e.g. recentFlightDays).
export async function setPlaneDetails(planeId, patch) {
  const { data: row, error: e1 } = await supabase.from('planes').select('details').eq('id', planeId).single();
  if (e1) throw e1;
  const { error } = await supabase.from('planes').update({ details: { ...(row.details || {}), ...patch } }).eq('id', planeId);
  if (error) throw error;
  changed();
}
