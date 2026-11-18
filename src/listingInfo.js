// Small display helpers shared by the Explore cards and profile screens.
import { normalizeSchedule, openSlots, zonedParts, addDays, DEFAULT_TZ } from './schedule';
import { openSquawks, groundingSquawks } from './aircraftStatus';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const timeLabel = (d, tz) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });

// First open hour in the instructor's working hours (ignores bookings; the booking screen checks those).
export function nextOpening(cfi, now = new Date()) {
  if (!cfi) return null;
  const schedule = normalizeSchedule(cfi.schedule || null, cfi.availability);
  if (!schedule) return null;
  const tz = schedule.timezone || DEFAULT_TZ;
  const today = zonedParts(now, tz);
  for (let i = 0; i < 14; i++) {
    const day = addDays({ y: today.y, m: today.m, d: today.d }, i);
    const slot = openSlots({ schedule, date: day, durationMin: 60, busy: [], now })[0];
    if (slot) {
      const p = zonedParts(slot, tz);
      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAYS[p.dow];
      return { at: slot, label: `${dayName} ${timeLabel(slot, tz)}` };
    }
  }
  return null;
}

// Maintenance status for cards: { label, ok }. Green only when it's genuinely good news.
export function planeStatus(p) {
  if (!p) return null;
  if (groundingSquawks(p.squawks).length) return { label: 'Grounded · open squawk', ok: false };
  if (p.next100At != null && p.hobbsTotal != null && p.next100At > 0) {
    const left = Math.round((p.next100At - p.hobbsTotal) * 10) / 10;
    if (left <= 0) return { label: '100-hr inspection due', ok: false };
    return { label: `100-hr in ${left} hrs`, ok: left > 5 };
  }
  const open = openSquawks(p.squawks).length;
  return open ? { label: `${open} open squawk${open === 1 ? '' : 's'}`, ok: false } : { label: 'No open squawks', ok: true };
}

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// The next 7 days with whether the instructor works that day (for the profile strip).
export function weekStrip(cfi, now = new Date()) {
  const schedule = normalizeSchedule(cfi?.schedule || null, cfi?.availability);
  const tz = schedule?.timezone || DEFAULT_TZ;
  const today = zonedParts(now, tz);
  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays({ y: today.y, m: today.m, d: today.d }, i);
    const dow = new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay();
    return { key: `${d.m}-${d.d}`, day: DAYS[dow], date: d.d, open: !!schedule?.weekly?.[keys[dow]]?.length };
  });
}
