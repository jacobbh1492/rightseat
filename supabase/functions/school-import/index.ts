// POST /school-import — switching a school from Flight Schedule Pro.
//   { action: 'setup', name, homeAirport }            create the school (or return the caller's)
//   { action: 'import', schoolId, kind, text, fileName, tz, defaultRate }
//        kind people | aircraft | reservations: the CSV export, read with _shared/fspImport.js
//   { action: 'refresh', schoolId }                    link people who've joined, book what's ready
// Only the school's admins can import. Nothing here charges anyone: imported reservations
// become lessons the student accepts by saving a card, like any instructor-booked lesson.
import { serve, json, admin, requireUser, audit } from '../_shared/server.ts';
import { HttpError } from '../_shared/bookings.js';
import { readImport, IMPORT_KINDS } from '../_shared/fspImport.js';
import { validTimeZone } from '../_shared/schedule.js';
import { convertReservations } from '../_shared/imports.ts';

const AIRPORT = /^[A-Z0-9]{3,4}$/;

async function mySchool(uid: string) {
  const { data } = await admin.from('school_admins').select('school_id, schools(id, name, home_airport, published)').eq('user_id', uid).limit(1).maybeSingle();
  return (data as any)?.schools || null;
}

serve(async (req, body) => {
  const user = await requireUser(req);
  const action = String(body.action || '');

  if (action === 'setup') {
    const existing = await mySchool(user.id);
    if (existing) return json({ school: existing });
    const name = String(body.name || '').trim().slice(0, 120);
    const homeAirport = String(body.homeAirport || '').trim().toUpperCase();
    if (name.length < 2) throw new HttpError(400, 'Enter your school’s name.');
    if (!AIRPORT.test(homeAirport)) throw new HttpError(400, 'Enter your home airport’s code, like KPIE.');
    const { data: school, error } = await admin.from('schools').insert({ name, home_airport: homeAirport, details: { switchedFrom: 'Flight Schedule Pro' } }).select('id, name, home_airport, published').single();
    if (error) throw error;
    await admin.from('school_admins').insert({ school_id: school.id, user_id: user.id });
    const { data: prof } = await admin.from('profiles').select('roles').eq('id', user.id).single();
    await admin.from('profiles').update({ roles: [...new Set([...(prof?.roles || []), 'school_admin'])] }).eq('id', user.id);
    await audit(user.id, 'school.created', school.id, { via: 'fsp-import' });
    return json({ school }, 201);
  }

  const schoolId = String(body.schoolId || '');
  const { count: isAdmin } = await admin.from('school_admins').select('user_id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('user_id', user.id);
  if (!isAdmin) throw new HttpError(403, 'Only your school’s admins can import.');
  const { data: school } = await admin.from('schools').select('*').eq('id', schoolId).single();

  if (action === 'refresh') {
    const linked = (await admin.rpc('link_school_invites', { p_school: schoolId })).data || 0;
    const res = await convertReservations(schoolId);
    return json({ linked, ...res });
  }

  if (action !== 'import') throw new HttpError(400, 'Unknown action.');
  const kind = String(body.kind || '');
  if (!IMPORT_KINDS.includes(kind)) throw new HttpError(400, 'Pick what you’re importing.');
  const tz = validTimeZone(String(body.tz || '')) ? String(body.tz) : 'America/New_York';
  let parsed: any;
  try { parsed = readImport(kind, String(body.text || ''), { tz, defaultRate: body.defaultRate, homeAirport: school.home_airport }); }
  catch (e) { throw new HttpError(400, (e as Error).message); }
  if (parsed.missing.length) throw new HttpError(400, `This file needs a column for: ${parsed.missing.join(', ')}.`);
  if (!parsed.rows.length) throw new HttpError(400, 'Nothing in this file can be imported. Check the rows that were left out.');

  const { data: batch, error: be } = await admin.from('school_imports').insert({
    school_id: schoolId, kind, file_name: String(body.fileName || '').slice(0, 200) || null, created_by: user.id,
    counts: { rows: parsed.rows.length, leftOut: parsed.skipped.length },
  }).select('id').single();
  if (be) throw be;
  const results: any[] = []; // per-row outcomes beyond "added"

  if (kind === 'people') {
    // Re-importing updates people who haven't joined yet; joined people keep their account details.
    const emails = parsed.rows.map((r: any) => r.email);
    const { data: had } = await admin.from('school_invites').select('email, status').eq('school_id', schoolId).in('email', emails);
    const joined = new Set((had || []).filter((h: any) => h.status === 'joined').map((h: any) => h.email));
    const fresh = parsed.rows.filter((r: any) => !joined.has(r.email));
    if (fresh.length) {
      const { error } = await admin.from('school_invites').upsert(fresh.map((r: any) => ({
        school_id: schoolId, import_id: batch.id, email: r.email, full_name: r.name, phone: r.phone, role: r.role, status: 'invited',
      })), { onConflict: 'school_id,email' });
      if (error) throw error;
    }
    const { data: linked } = await admin.rpc('link_school_invites', { p_school: schoolId });
    await audit(user.id, 'school.import', schoolId, { kind, rows: parsed.rows.length, linked });
    return json({ kind, added: fresh.length, alreadyJoined: joined.size, linked: linked || 0, leftOut: parsed.skipped });
  }

  if (kind === 'aircraft') {
    const tails = parsed.rows.map((r: any) => r.tail);
    const { data: existing } = await admin.from('planes').select('id, tail, school_id').in('tail', tails);
    const byTail = Object.fromEntries((existing || []).map((p: any) => [p.tail, p]));
    let added = 0, updated = 0;
    for (const r of parsed.rows) {
      const had = byTail[r.tail];
      if (had && had.school_id !== schoolId) { results.push({ line: r.line, why: `${r.tail} is already listed on Positive Rate by someone else. Contact support to move it.` }); continue; }
      if (had) {
        // Already ours: refresh the meters and rate, leave verification alone.
        await admin.from('planes').update({ wet_rate: r.rate, ...(r.hobbs != null ? { hobbs_total: r.hobbs } : {}), ...(r.next100 != null ? { next_100_at: r.next100 } : {}) }).eq('id', had.id);
        updated++;
        continue;
      }
      const { error } = await admin.from('planes').insert({
        owner_id: user.id, school_id: schoolId, owner_type: 'Flight school', tail: r.tail, make: r.make, model: r.model, year: r.year,
        category: r.category, home_airport: r.airport || school.home_airport, wet_rate: r.rate, hobbs_total: r.hobbs, next_100_at: r.next100,
        details: { importedFrom: 'Flight Schedule Pro', ...(r.annualDue ? { annualDue: r.annualDue } : {}) }, published: false,
      });
      if (error) { results.push({ line: r.line, why: `${r.tail} couldn’t be added.` }); console.error('import plane', r.tail, error); continue; }
      added++;
    }
    await audit(user.id, 'school.import', schoolId, { kind, added, updated });
    return json({ kind, added, updated, leftOut: [...parsed.skipped, ...results] });
  }

  // reservations
  const { data: had } = await admin.from('school_import_reservations').select('fingerprint').eq('school_id', schoolId).in('fingerprint', parsed.rows.map((r: any) => r.fingerprint));
  const dupes = new Set((had || []).map((h: any) => h.fingerprint));
  const fresh = parsed.rows.filter((r: any) => !dupes.has(r.fingerprint));
  if (fresh.length) {
    const { error } = await admin.from('school_import_reservations').insert(fresh.map((r: any) => ({
      school_id: schoolId, import_id: batch.id, fingerprint: r.fingerprint, starts_at: r.startsAt, ends_at: r.endsAt,
      flight_hours: r.flightHours, goal: r.goal, student_name: r.student, student_email: r.studentEmail,
      instructor_name: r.instructor, instructor_email: r.instructorEmail, tail: r.tail,
    })));
    if (error) throw error;
  }
  await admin.rpc('link_school_invites', { p_school: schoolId });
  const outcome = await convertReservations(schoolId);
  await audit(user.id, 'school.import', schoolId, { kind, added: fresh.length, ...outcome });
  return json({ kind, added: fresh.length, alreadyImported: dupes.size, ...outcome, leftOut: parsed.skipped });
});
