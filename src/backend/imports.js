import { supabase, callFn } from './supabase';

// Switching a school from Flight Schedule Pro (supabase/functions/school-import).
export const setUpSchool = ({ name, homeAirport }) => callFn('school-import', { action: 'setup', name, homeAirport });
export const importFile = ({ schoolId, kind, text, fileName, defaultRate }) =>
  callFn('school-import', { action: 'import', schoolId, kind, text, fileName, defaultRate, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
export const refreshImport = (schoolId) => callFn('school-import', { action: 'refresh', schoolId });

// The school this account runs, if any (a real school row, not the sample schools).
export async function fetchMySchool(uid) {
  const { data } = await supabase.from('school_admins').select('school_id, schools(id, name, home_airport, published)').eq('user_id', uid).limit(1).maybeSingle();
  return data?.schools || null;
}

export async function fetchImportStatus(schoolId) {
  const [inv, res] = await Promise.all([
    supabase.from('school_invites').select('id, email, full_name, role, status, joined_at, affiliation_id').eq('school_id', schoolId).neq('status', 'removed').order('full_name'),
    supabase.from('school_import_reservations').select('id, starts_at, goal, student_name, student_email, instructor_name, tail, status, note, booking_id').eq('school_id', schoolId).order('starts_at'),
  ]);
  if (inv.error) throw inv.error;
  if (res.error) throw res.error;
  return { people: inv.data, reservations: res.data };
}

export { readPickedFile } from './readFile';
