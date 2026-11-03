// The renter's pilot profile and plane checkouts (see src/renterChecks.js).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

// Screens that show renter checks refresh when the profile or a checkout changes elsewhere.
const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn());

const fromRow = (p) => p && ({
  certificate: p.certificate, medicalClass: p.medical_class, medicalExpires: p.medical_expires,
  flightReviewDate: p.flight_review_date, totalHours: Number(p.total_hours), updatedAt: p.updated_at,
});
const fromCheckout = (c) => c && ({
  id: c.id, planeId: c.plane_id, pilotId: c.pilot_id, status: c.status, soloUntil: c.solo_until,
  note: c.note, requestedAt: c.requested_at, decidedAt: c.decided_at,
});

export async function fetchPilotProfile(uid) {
  const { data, error } = await supabase.from('pilot_profiles').select('*').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  return fromRow(data);
}

export async function savePilotProfile(uid, p) {
  const row = {
    user_id: uid, certificate: p.certificate, medical_class: p.medicalClass, medical_expires: p.medicalExpires,
    flight_review_date: p.certificate === 'Student' ? (p.flightReviewDate || null) : p.flightReviewDate, total_hours: Number(p.totalHours),
  };
  const { data, error } = await supabase.from('pilot_profiles').upsert(row).select().single();
  if (error) throw error;
  changed();
  return fromRow(data);
}

export async function fetchMyCheckouts(uid) {
  const { data, error } = await supabase.from('plane_checkouts').select('*').eq('pilot_id', uid);
  if (error) throw error;
  return (data || []).map(fromCheckout);
}

export async function requestCheckout(planeId, note = '') {
  const { data, error } = await supabase.rpc('request_checkout', { p_plane: planeId, p_note: note });
  if (error) throw error;
  changed();
  return fromCheckout(data);
}

// Owner side: checkout requests and approvals for planes they manage, with each pilot's profile.
export async function fetchPlaneCheckouts(planeIds) {
  if (!planeIds.length) return [];
  const { data, error } = await supabase.from('plane_checkouts').select('*').in('plane_id', planeIds).order('requested_at', { ascending: false });
  if (error) throw error;
  const pilots = [...new Set((data || []).map((c) => c.pilot_id))];
  const [{ data: profiles }, { data: names }] = pilots.length ? await Promise.all([
    supabase.from('pilot_profiles').select('*').in('user_id', pilots),
    supabase.from('profiles').select('id, full_name').in('id', pilots),
  ]) : [{ data: [] }, { data: [] }];
  const profileBy = Object.fromEntries((profiles || []).map((p) => [p.user_id, fromRow(p)]));
  const nameBy = Object.fromEntries((names || []).map((p) => [p.id, p.full_name || 'Pilot']));
  return (data || []).map((c) => ({ ...fromCheckout(c), pilotName: nameBy[c.pilot_id] || 'Pilot', profile: profileBy[c.pilot_id] || null }));
}

// status: approved | declined | revoked. soloUntil (YYYY-MM-DD) for student pilots.
export async function decideCheckout(id, status, soloUntil = null) {
  const { data, error } = await supabase.rpc('decide_checkout', { p_id: id, p_status: status, p_solo_until: soloUntil });
  if (error) throw error;
  return fromCheckout(data);
}

// The signed-in pilot's profile and checkouts, for booking screens.
export function usePilot() {
  const auth = useAuth();
  const uid = auth?.session?.user?.id || null;
  const [state, setState] = useState({ loading: !!uid, profile: null, checkouts: [], error: '' });
  const refresh = useCallback(async () => {
    if (!uid) { setState({ loading: false, profile: null, checkouts: [], error: '' }); return; }
    try {
      const [profile, checkouts] = await Promise.all([fetchPilotProfile(uid), fetchMyCheckouts(uid)]);
      setState({ loading: false, profile, checkouts, error: '' });
    } catch (e) { setState((s) => ({ ...s, loading: false, error: e.message })); }
  }, [uid]);
  useEffect(() => { refresh(); listeners.add(refresh); return () => listeners.delete(refresh); }, [refresh]);
  return { ...state, uid, signedIn: !!uid, refresh, checkoutFor: (planeId) => state.checkouts.find((c) => c.planeId === planeId) || null };
}
