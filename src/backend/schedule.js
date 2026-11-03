import { supabase } from './supabase';
import { normalizeSchedule, workingDays } from '../schedule';

// Instructor calendars on the server: working hours, time off, and busy times.
// See supabase/migrations/20261103000000_cfi_calendar.sql.

const fromRow = (row) => (row ? {
  timezone: row.timezone, weekly: row.weekly, minNoticeHours: row.min_notice_hours,
  maxDaysAhead: row.max_days_ahead, bufferMin: row.buffer_min, incrementMin: row.increment_min,
} : null);

// An instructor's schedule. With nothing saved yet, their old working-days list runs 8 AM – 6 PM.
export async function fetchSchedule(cfiId, legacyDays) {
  const { data, error } = await supabase.from('cfi_schedules').select('*').eq('cfi_id', cfiId).maybeSingle();
  if (error) throw error;
  return { schedule: normalizeSchedule(fromRow(data), legacyDays), saved: !!data };
}

export async function saveSchedule(cfiId, s) {
  const clean = normalizeSchedule(s);
  const { error } = await supabase.from('cfi_schedules').upsert({
    cfi_id: cfiId, timezone: clean.timezone, weekly: clean.weekly, min_notice_hours: clean.minNoticeHours,
    max_days_ahead: clean.maxDaysAhead, buffer_min: clean.bufferMin, increment_min: clean.incrementMin,
  }, { onConflict: 'cfi_id' });
  if (error) throw error;
  return { schedule: clean, days: workingDays(clean) };
}

// ---- time off (only the instructor can see these, labels included)
const shapeOff = (t) => ({ id: t.id, start: new Date(t.starts_at), end: new Date(t.ends_at), allDay: t.all_day, label: t.label || '' });

export async function fetchTimeOff(cfiId, from = new Date(Date.now() - 86400e3)) {
  const { data, error } = await supabase.from('cfi_time_off').select('id, starts_at, ends_at, all_day, label')
    .eq('cfi_id', cfiId).gt('ends_at', from.toISOString()).order('starts_at').limit(500);
  if (error) throw error;
  return (data || []).map(shapeOff);
}

export async function addTimeOff({ start, end, allDay, label }) {
  const { data, error } = await supabase.from('cfi_time_off')
    .insert({ starts_at: start.toISOString(), ends_at: end.toISOString(), all_day: !!allDay, label: (label || '').trim().slice(0, 80) })
    .select('id, starts_at, ends_at, all_day, label').single();
  if (error) throw error;
  return shapeOff(data);
}

export async function removeTimeOff(id) {
  const { error } = await supabase.from('cfi_time_off').delete().eq('id', id);
  if (error) throw error;
}

// Busy times (lessons and time off) without names or labels, for open slots.
export async function fetchBusy({ cfiId, planeId, from, to }) {
  const { data, error } = await supabase.rpc('busy_times', {
    p_cfi: cfiId || null, p_plane: planeId || null, p_from: from.toISOString(), p_to: to.toISOString(),
  });
  if (error) throw error;
  return (data || []).map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at), kind: b.kind }));
}
