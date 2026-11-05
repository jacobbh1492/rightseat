// Switching from Flight Schedule Pro: read the CSV exports a school downloads from FSP
// (people, aircraft, upcoming reservations) and turn them into rows we can import.
// Shared by the app (preview before import) and the server (the import itself), so both
// read a file exactly the same way. Keep this file dependency-free apart from schedule.js;
// scripts/sync-shared.js copies it to supabase/functions/_shared/.
import { zonedTime } from './schedule.js';

export const IMPORT_KINDS = ['people', 'aircraft', 'reservations'];
export const MAX_ROWS = 5000;
export const MAX_BYTES = 3 * 1024 * 1024;

// ---------------------------------------------------------------- CSV
// RFC 4180: quoted fields, doubled quotes, commas and line breaks inside quotes.
// Also reads tab-separated and semicolon-separated files (Excel in some regions).
export function parseCsv(text) {
  let s = String(text || '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // byte-order mark from Excel
  const firstLine = s.slice(0, s.search(/\r?\n|$/));
  const count = (ch) => firstLine.split(ch).length - 1;
  const sep = [',', '\t', ';'].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ''));
}

// ---------------------------------------------------------------- columns
// Header names FSP and similar tools use, per field. Matching ignores case, spaces and
// punctuation, so "E-mail Address" matches "email address".
const FIELDS = {
  people: {
    fullName: ['name', 'full name', 'user', 'user name', 'member', 'member name', 'customer', 'customer name', 'display name', 'pilot', 'student name', 'instructor name'],
    firstName: ['first name', 'first', 'given name', 'firstname'],
    lastName: ['last name', 'last', 'surname', 'family name', 'lastname'],
    email: ['email', 'email address', 'e-mail', 'user email', 'primary email', 'login', 'username'],
    phone: ['phone', 'phone number', 'mobile', 'mobile phone', 'cell', 'cell phone', 'primary phone', 'home phone'],
    role: ['role', 'roles', 'user role', 'user type', 'type', 'member type', 'account type', 'user roles', 'groups', 'group'],
  },
  aircraft: {
    tail: ['tail', 'tail number', 'tail #', 'tail no', 'registration', 'n number', 'n-number', 'aircraft', 'aircraft id', 'aircraft registration', 'ident'],
    make: ['make', 'manufacturer', 'aircraft make'],
    model: ['model', 'aircraft model', 'aircraft type', 'type', 'make model', 'make/model', 'make and model'],
    year: ['year', 'model year', 'year built'],
    category: ['category', 'class', 'engine type', 'aircraft class'],
    rate: ['rate', 'hourly rate', 'wet rate', 'rental rate', 'price', 'price per hour', 'rate per hour', 'hobbs rate', 'tach rate', 'rental price', 'standard rate'],
    hobbs: ['hobbs', 'current hobbs', 'hobbs time', 'hobbs meter', 'hobbs total', 'hobbs out'],
    next100: ['next 100 hour', 'next 100hr', '100 hour due', '100hr due', '100 hr due', 'next 100 hr', 'next 100', '100 hour inspection due'],
    annualDue: ['annual due', 'annual', 'next annual', 'annual inspection due', 'annual inspection'],
    airport: ['location', 'home base', 'base', 'airport', 'home airport', 'home location', 'based at'],
  },
  reservations: {
    start: ['start', 'start time', 'start date time', 'starts', 'begin', 'from', 'departure', 'reservation start', 'scheduled start', 'start datetime'],
    end: ['end', 'end time', 'end date time', 'ends', 'to', 'return', 'reservation end', 'scheduled end', 'end datetime'],
    date: ['date', 'start date', 'reservation date', 'day'],
    startTime: ['time', 'start time of day', 'begin time', 'out time'],
    endTime: ['end time of day', 'return time', 'in time'],
    student: ['student', 'customer', 'renter', 'pilot', 'member', 'user', 'pilot name', 'student name', 'customer name', 'reserved for', 'pic'],
    studentEmail: ['student email', 'customer email', 'renter email', 'pilot email', 'member email', 'user email', 'email'],
    instructor: ['instructor', 'cfi', 'instructor name', 'flight instructor'],
    instructorEmail: ['instructor email', 'cfi email'],
    aircraft: ['aircraft', 'tail', 'tail number', 'resource', 'aircraft tail', 'aircraft registration', 'registration', 'equipment'],
    goal: ['reservation type', 'activity', 'activity type', 'flight type', 'lesson', 'description', 'title', 'purpose', 'type', 'comments', 'notes'],
    status: ['status', 'reservation status'],
  },
};
const key = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9#]+/g, '');

// Which column holds which field. A header can only fill one field (the first that
// claims it, in the order above), so "Start Time" isn't read as both start and time.
export function matchColumns(headers, kind) {
  const fields = FIELDS[kind];
  if (!fields) throw new Error('Unknown import type.');
  const keys = headers.map(key);
  const used = new Set();
  const map = {};
  for (const [field, names] of Object.entries(fields)) {
    for (const n of names) {
      const i = keys.findIndex((k, j) => k === key(n) && !used.has(j));
      if (i >= 0) { map[field] = i; used.add(i); break; }
    }
  }
  const unmatched = headers.filter((_, i) => !used.has(i) && headers[i]);
  return { map, unmatched };
}

export const FIELD_LABELS = {
  fullName: 'Name', firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone', role: 'Role',
  tail: 'Tail number', make: 'Make', model: 'Model', year: 'Year', category: 'Category', rate: 'Hourly rate', hobbs: 'Hobbs',
  next100: 'Next 100-hour', annualDue: 'Annual due', airport: 'Home airport',
  start: 'Start', end: 'End', date: 'Date', startTime: 'Start time', endTime: 'End time', student: 'Student', studentEmail: 'Student email',
  instructor: 'Instructor', instructorEmail: 'Instructor email', aircraft: 'Aircraft', goal: 'Lesson', status: 'Status',
};

// ---------------------------------------------------------------- values
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const cleanEmail = (v) => { const e = String(v || '').trim().toLowerCase(); return EMAIL.test(e) ? e : ''; };
const num = (v) => { const n = parseFloat(String(v || '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null; };
const r1 = (n) => Math.round(n * 10) / 10;
export const cleanTail = (v) => {
  const t = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!t) return '';
  return /^\d/.test(t) ? 'N' + t : t; // "172SP" → "N172SP"; keeps foreign registrations
};
export const nameKey = (v) => String(v || '').toLowerCase().replace(/[^a-z]/g, '');

// FSP roles → ours. Staff without a teaching role aren't imported (add them by hand).
export function roleOf(v) {
  const r = String(v || '').toLowerCase();
  if (/instructor|\bcfi|cfii|\bmei\b/.test(r)) return 'cfi';
  if (/admin|owner|manager|dispatch|schedul|staff|mechanic|maintenance|front desk/.test(r)) return 'staff';
  return 'student'; // students, renters, members, customers, pilots, and blank
}

// "11/12/2026 2:30 PM", "2026-11-12 14:30", "11/12/26 14:30", ISO with offset.
// Times without a zone are wall-clock times at the school (tz).
export function parseWhen(v, tz, timeV) {
  let s = String(v || '').trim();
  if (timeV) s = `${s} ${String(timeV).trim()}`;
  if (!s) return null;
  if (/\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) { const d = new Date(s); return isNaN(d) ? null : d; }
  let y, m, d, rest;
  let x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s]*(.*)$/);
  if (x) [, y, m, d, rest] = x;
  else if ((x = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*,?\s*(.*)$/))) { [, m, d, y, rest] = x; if (y.length === 2) y = '20' + y; }
  else return null;
  let minutes = 0;
  if (rest) {
    const t = rest.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap])?\.?m?\.?$/i);
    if (!t) return null;
    let h = +t[1];
    const ap = t[3]?.toLowerCase();
    if (ap === 'p' && h < 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    if (h > 23 || +(t[2] || 0) > 59) return null;
    minutes = h * 60 + +(t[2] || 0);
  }
  [y, m, d] = [+y, +m, +d];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return zonedTime(y, m, d, minutes, tz);
}

// ---------------------------------------------------------------- rows
// Turns a parsed file into importable rows, with a reason for every row left out.
// opts: { tz, now, defaultRate, homeAirport }
export function readImport(kind, text, opts = {}) {
  if (String(text || '').length > MAX_BYTES) throw new Error('That file is too big. Export a smaller date range or split it up.');
  const table = parseCsv(text);
  if (table.length < 2) throw new Error('That file has no rows. Export it as CSV with a header row.');
  if (table.length - 1 > MAX_ROWS) throw new Error(`That file has ${table.length - 1} rows. Import up to ${MAX_ROWS} at a time.`);
  const [headers, ...body] = table;
  const { map, unmatched } = matchColumns(headers, kind);
  const get = (row, f) => (map[f] != null ? row[map[f]] || '' : '');
  const out = { kind, headers, map, unmatched, rows: [], skipped: [], missing: [] };
  const need = { people: [['email']], aircraft: [['tail']], reservations: [['start', 'date'], ['student', 'studentEmail']] }[kind];
  for (const alts of need) if (!alts.some((f) => map[f] != null)) out.missing.push(alts.map((f) => FIELD_LABELS[f]).join(' or '));
  if (kind === 'people' && map.fullName == null && map.firstName == null) out.missing.push('Name');
  if (out.missing.length) return out;
  const tz = opts.tz || 'America/New_York';
  const now = opts.now ? new Date(opts.now) : new Date();
  const skip = (line, why) => out.skipped.push({ line, why });

  if (kind === 'people') {
    const seen = new Set();
    body.forEach((row, i) => {
      const line = i + 2;
      const name = (get(row, 'fullName') || `${get(row, 'firstName')} ${get(row, 'lastName')}`).replace(/\s+/g, ' ').trim();
      const email = cleanEmail(get(row, 'email'));
      const role = roleOf(get(row, 'role'));
      if (!email) return skip(line, `${name || 'This person'} has no valid email.`);
      if (!name) return skip(line, `${email} has no name.`);
      if (role === 'staff') return skip(line, `${name} is staff (${get(row, 'role')}). Add staff by hand.`);
      if (seen.has(email)) return skip(line, `${email} is listed twice.`);
      seen.add(email);
      out.rows.push({ line, name: name.slice(0, 120), email, phone: get(row, 'phone').slice(0, 40) || null, role });
    });
  }

  if (kind === 'aircraft') {
    const seen = new Set();
    body.forEach((row, i) => {
      const line = i + 2;
      const tail = cleanTail(get(row, 'tail'));
      if (!tail || tail.length < 2 || tail.length > 8) return skip(line, `"${get(row, 'tail') || '(blank)'}" isn't a tail number.`);
      if (seen.has(tail)) return skip(line, `${tail} is listed twice.`);
      let make = get(row, 'make'), model = get(row, 'model');
      if (!make && model.includes(' ')) [make, model] = [model.split(' ')[0], model.split(' ').slice(1).join(' ')];
      if (!make || !model) return skip(line, `${tail} needs a make and model.`);
      const rate = num(get(row, 'rate')) ?? (opts.defaultRate ? num(opts.defaultRate) : null);
      if (!rate || rate < 20 || rate > 5000) return skip(line, `${tail} has no hourly rate.`);
      const year = num(get(row, 'year'));
      const hobbs = num(get(row, 'hobbs'));
      const next100 = num(get(row, 'next100'));
      const cat = get(row, 'category').toLowerCase();
      seen.add(tail);
      out.rows.push({
        line, tail, make: make.slice(0, 60), model: model.slice(0, 80),
        year: year && year > 1900 && year <= now.getFullYear() + 1 ? Math.round(year) : null,
        category: /multi|twin|mel/.test(cat) ? 'Multi' : 'Single',
        rate: Math.round(rate * 100) / 100,
        hobbs: hobbs != null && hobbs >= 0 ? r1(hobbs) : null,
        next100: next100 != null && next100 > 0 ? r1(next100) : null,
        annualDue: get(row, 'annualDue').slice(0, 20) || null,
        airport: (get(row, 'airport').toUpperCase().match(/\b[A-Z0-9]{3,4}\b/) || [opts.homeAirport || null])[0],
      });
    });
  }

  if (kind === 'reservations') {
    const seen = new Set();
    body.forEach((row, i) => {
      const line = i + 2;
      // A date column plus separate start/end times ("Date", "Start Time", "End Time").
      const hasDate = (v) => /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(v);
      const when = (f, tf) => {
        const v = get(row, f);
        if (map[f] != null && hasDate(v)) return parseWhen(v, tz);
        const t = map[f] != null ? v : get(row, tf);
        return map.date != null && t ? parseWhen(get(row, 'date'), tz, t) : map.date != null && f === 'start' && !t ? parseWhen(get(row, 'date'), tz) : null;
      };
      const start = when('start', 'startTime');
      if (!start) return skip(line, `Couldn't read the start time "${get(row, 'start') || get(row, 'date')}".`);
      let end = when('end', 'endTime');
      if (end && end <= start) end = new Date(end.getTime() + 86400e3); // end time only, past midnight
      if (!end) end = new Date(start.getTime() + 2 * 3600e3);
      const status = get(row, 'status').toLowerCase();
      if (/cancel|no.?show|declin|delet/.test(status)) return skip(line, 'Cancelled in FSP.');
      if (start <= now) return skip(line, 'Already happened.');
      const blockHr = (end - start) / 3600e3;
      if (blockHr > 12) return skip(line, 'Longer than 12 hours. Rebook multi-day trips by hand.');
      const student = get(row, 'student').replace(/\s+/g, ' ').trim();
      const studentEmail = cleanEmail(get(row, 'studentEmail'));
      if (!student && !studentEmail) return skip(line, 'No student or renter.');
      const instructor = get(row, 'instructor').replace(/\s+/g, ' ').trim();
      const instructorEmail = cleanEmail(get(row, 'instructorEmail'));
      const tail = cleanTail(get(row, 'aircraft'));
      // A reservation blocks the plane; we book flight time and let close-out record the actual Hobbs.
      const flightHours = Math.max(0.5, Math.min(8, r1(blockHr >= 1.5 ? blockHr - 0.5 : blockHr)));
      const fp = [start.toISOString(), studentEmail || nameKey(student), tail].join('|');
      if (seen.has(fp)) return skip(line, 'Listed twice.');
      seen.add(fp);
      out.rows.push({
        line, startsAt: start.toISOString(), endsAt: end.toISOString(), flightHours,
        student: student.slice(0, 120) || null, studentEmail: studentEmail || null,
        instructor: instructor.slice(0, 120) || null, instructorEmail: instructorEmail || null,
        tail: tail || null, goal: (get(row, 'goal') || (instructor ? 'Flight lesson' : 'Rental')).slice(0, 120), fingerprint: fp,
      });
    });
  }
  return out;
}

// Plain-English summary for the preview.
export function summary(r) {
  const n = r.rows.length;
  const what = { people: n === 1 ? 'person' : 'people', aircraft: n === 1 ? 'aircraft' : 'aircraft', reservations: n === 1 ? 'reservation' : 'reservations' }[r.kind];
  return `${n} ${what} ready${r.skipped.length ? ` · ${r.skipped.length} left out` : ''}`;
}

// ---------------------------------------------------------------- reservations → lessons
// Decide what an imported reservation is waiting on, or who and what it books.
// people: [{ userId|null, email, name, role, joined, cfiReady }] — the school's invites
//   plus instructors already affiliated (cfiReady = published, verified instructor profile).
// planes: [{ id, tail, ready }] — the school's fleet (ready = registration and insurance verified).
export const SWITCH_MIN_HOURS = 3; // sooner than this, the student can't reasonably accept in time
export function matchReservation(r, { people, planes, now = new Date() }) {
  if (new Date(r.starts_at).getTime() < new Date(now).getTime() + SWITCH_MIN_HOURS * 3600e3)
    return { status: 'expired', note: 'Too close to the switch. Keep this one in Flight Schedule Pro.' };
  const find = (email, name, role) => {
    const byRole = people.filter((p) => !role || p.role === role);
    return (email && byRole.find((p) => p.email === email)) || (name && byRole.find((p) => nameKey(p.name) === nameKey(name))) || null;
  };
  const studentName = r.student_name || r.student_email;
  const student = find(r.student_email, r.student_name, null);
  if (!r.instructor_name && !r.instructor_email)
    return { status: 'skipped', note: `Solo rental. Ask ${studentName} to book it in the app.` };
  const cfi = find(r.instructor_email, r.instructor_name, 'cfi');
  const plane = r.tail ? planes.find((p) => p.tail === r.tail) : null;
  const waiting = [];
  if (!student) waiting.push(`${studentName} isn’t in your imported people`);
  else if (!student.joined) waiting.push(`${student.name || studentName} to join`);
  const cfiName = r.instructor_name || r.instructor_email;
  if (!cfi) waiting.push(`${cfiName} isn’t in your imported instructors`);
  else if (!cfi.joined) waiting.push(`${cfi.name || cfiName} to join`);
  else if (!cfi.cfiReady) waiting.push(`${cfi.name || cfiName}’s instructor profile to be published and verified`);
  if (r.tail && !plane) waiting.push(`${r.tail} isn’t in your imported aircraft`);
  else if (plane && !plane.ready) waiting.push(`${r.tail}’s registration and insurance to be verified`);
  if (waiting.length) return { status: 'waiting', note: 'Waiting on ' + waiting.join(' · ') + '.' };
  if (student.userId === cfi.userId) return { status: 'skipped', note: 'The student and instructor are the same person.' };
  return { status: 'ready', note: '', studentId: student.userId, cfiId: cfi.userId, planeId: plane?.id || null };
}

// Imported lessons give the student longer to accept than a normal proposal: a week,
// or until 2 hours before the lesson.
export const importedProposalExpires = (startsAt, now = new Date()) =>
  new Date(Math.min(new Date(now).getTime() + 7 * 86400e3, new Date(startsAt).getTime() - 2 * 3600e3));
