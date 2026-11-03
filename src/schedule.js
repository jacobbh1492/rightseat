// Scheduling rules shared by the app and the booking server (synced to
// supabase/functions/_shared/schedule.js by scripts/sync-shared.js). Plain JavaScript,
// no imports, so it runs in React Native, Node tests and Deno.
//
// A schedule is an instructor's working hours in their own time zone:
//   weekly:  { mon: [[480, 720], [780, 1080]], ... }  minutes after local midnight
//   timezone, minNoticeHours, maxDaysAhead, bufferMin (after each lesson), incrementMin (start times)
// "busy" is a list of { start: Date, end: Date } intervals the instructor (or plane)
// can't be booked: other lessons (their end already includes the buffer) and time off.

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_NAMES = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
export const DAY_SHORT = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
export const DEFAULT_TZ = 'America/New_York';
export const NOTICE_OPTIONS = [1, 2, 4, 8, 12, 24, 48];       // hours
export const AHEAD_OPTIONS = [14, 30, 60, 90, 180];           // days
export const BUFFER_OPTIONS = [0, 15, 30, 45, 60];            // minutes after each lesson
export const INCREMENT_OPTIONS = [15, 30, 60];                // minutes between start times
export const TIMEZONES = [
  ['America/New_York', 'Eastern'], ['America/Chicago', 'Central'], ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona'], ['America/Los_Angeles', 'Pacific'], ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'], ['America/Puerto_Rico', 'Atlantic (PR, USVI)'],
];

const weekdays = (ranges) => ({ sun: [], mon: ranges, tue: ranges, wed: ranges, thu: ranges, fri: ranges, sat: [] });
export const DEFAULT_SCHEDULE = {
  timezone: DEFAULT_TZ, weekly: weekdays([[480, 1080]]),
  minNoticeHours: 2, maxDaysAhead: 60, bufferMin: 30, incrementMin: 30,
};
// Solo rentals (no instructor): the plane can be booked 6 AM – 9 PM any day.
export const PLANE_SCHEDULE = {
  timezone: DEFAULT_TZ, weekly: Object.fromEntries(DAY_KEYS.map((k) => [k, [[360, 1260]]])),
  minNoticeHours: 1, maxDaysAhead: 60, bufferMin: 30, incrementMin: 30,
};

const pick = (v, options, fallback) => (options.includes(Number(v)) ? Number(v) : fallback);

// Clean up one day's ranges: whole quarter-hours inside the day, sorted, overlaps merged.
export function cleanRanges(ranges) {
  const ok = (Array.isArray(ranges) ? ranges : [])
    .map((r) => [Math.round(Number(r?.[0]) / 15) * 15 || 0, Math.round(Number(r?.[1]) / 15) * 15 || 0])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b <= 1440 && b - a >= 30)
    .sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const r of ok) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else out.push([...r]);
  }
  return out;
}

// From what's stored (or nothing yet). `legacyDays` (e.g. ['Mon','Wed']) is the old
// working-days list: until an instructor saves hours, those days run 8 AM – 6 PM.
export function normalizeSchedule(raw, legacyDays) {
  const base = { ...DEFAULT_SCHEDULE };
  if (!raw && Array.isArray(legacyDays) && legacyDays.length) {
    base.weekly = Object.fromEntries(DAY_KEYS.map((k) => [k, legacyDays.includes(DAY_SHORT[k]) ? [[480, 1080]] : []]));
  }
  const s = raw || {};
  const weekly = Object.fromEntries(DAY_KEYS.map((k) => [k, cleanRanges((s.weekly || base.weekly)[k])]));
  return {
    timezone: validTimeZone(s.timezone) ? s.timezone : base.timezone,
    weekly,
    minNoticeHours: pick(s.minNoticeHours, NOTICE_OPTIONS, base.minNoticeHours),
    maxDaysAhead: pick(s.maxDaysAhead, AHEAD_OPTIONS, base.maxDaysAhead),
    bufferMin: pick(s.bufferMin, BUFFER_OPTIONS, base.bufferMin),
    incrementMin: pick(s.incrementMin, INCREMENT_OPTIONS, base.incrementMin),
  };
}

// Days with any working hours, as the old ['Mon', ...] list (shown on profiles).
export const workingDays = (schedule) => DAY_KEYS.filter((k) => schedule.weekly[k]?.length).map((k) => DAY_SHORT[k]);

// ---- time zones (Intl only, no libraries)
const fmtCache = {};
function formatter(tz) {
  return fmtCache[tz] ||= new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short',
  });
}
export function validTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { formatter(tz).format(new Date()); return true; } catch { return false; }
}
// Wall-clock parts of an instant in a time zone.
export function zonedParts(date, tz) {
  const o = {};
  for (const p of formatter(tz).formatToParts(date)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, minutes: (+o.hour % 24) * 60 + +o.minute, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday) };
}
// The instant when the wall clock in `tz` reads y-m-d + minutes.
export function zonedTime(y, m, d, minutes, tz) {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const offsetAt = (t) => { const p = zonedParts(new Date(t), tz); return Date.UTC(p.y, p.m - 1, p.d, 0, p.minutes) - t; };
  const o1 = offsetAt(guess);
  let t = guess - o1;
  const o2 = offsetAt(t);
  if (o2 !== o1) t = guess - o2; // crossed a daylight-saving change
  return new Date(t);
}
// A calendar date (no time) as { y, m, d }, and stepping by days.
export const dateKey = ({ y, m, d }) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export function addDays({ y, m, d }, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
export const dayOfWeek = ({ y, m, d }) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
export const todayIn = (tz, now = new Date()) => { const p = zonedParts(now, tz); return { y: p.y, m: p.m, d: p.d }; };

const overlaps = (busy, start, end) => (busy || []).some((b) => b.start < end && b.end > start);

// Start times open on one calendar day (in the schedule's time zone) for a lesson of
// `durationMin` minutes: inside working hours, after the notice period, within the
// booking window, and clear of busy times (the buffer after the lesson must be clear too).
export function openSlots({ schedule, date, durationMin, busy, now = new Date() }) {
  const s = schedule;
  const earliest = now.getTime() + Math.max(1, s.minNoticeHours) * 3600e3;
  const latest = now.getTime() + s.maxDaysAhead * 86400e3;
  const out = [];
  for (const [a, b] of s.weekly[DAY_KEYS[dayOfWeek(date)]] || []) {
    for (let t = Math.ceil(a / s.incrementMin) * s.incrementMin; t + durationMin <= b; t += s.incrementMin) {
      const start = zonedTime(date.y, date.m, date.d, t, s.timezone);
      if (start.getTime() < earliest || start.getTime() > latest) continue;
      const end = new Date(start.getTime() + (durationMin + s.bufferMin) * 60e3);
      if (!overlaps(busy, start, end)) out.push(start);
    }
  }
  return out;
}

// The server's check for one requested start time. Returns null, or why it can't be booked.
export function checkBooking({ schedule, start, durationMin, busy, now = new Date() }) {
  const s = schedule;
  if (start.getTime() < now.getTime() + Math.max(1, s.minNoticeHours) * 3600e3) {
    return `This instructor needs at least ${s.minNoticeHours} hour${s.minNoticeHours === 1 ? '' : 's'}’ notice. Pick a later time.`;
  }
  if (start.getTime() > now.getTime() + s.maxDaysAhead * 86400e3) return `This instructor takes bookings up to ${s.maxDaysAhead} days ahead.`;
  const p = zonedParts(start, s.timezone);
  const inHours = (s.weekly[DAY_KEYS[p.dow]] || []).some(([a, b]) => p.minutes >= a && p.minutes + durationMin <= b);
  if (!inHours) return 'That time is outside the instructor’s working hours. Pick another time.';
  const end = new Date(start.getTime() + (durationMin + s.bufferMin) * 60e3);
  if (overlaps(busy, start, end)) return 'The instructor isn’t available then. Pick another time.';
  return null;
}

// "8:00 AM" for minutes after midnight, and an instant shown in a time zone.
export function minutesLabel(min) {
  const h = Math.floor(min / 60) % 24, mm = min % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export const timeIn = (date, tz) => minutesLabel(zonedParts(date, tz).minutes);
export function tzAbbrev(tz, date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || tz;
  } catch { return tz; }
}
