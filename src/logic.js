// Business rules: fees, quotes, safety/insurance checks, scheduling, messaging guardrails, ranking, metrics.

import { FEES, r2, quote } from './pricing';
export { FEES, r2, quote };

export const SLOTS = [
  { h: 8, label: '8:00 AM' },
  { h: 10, label: '10:00 AM' },
  { h: 12, label: '12:00 PM' },
  { h: 14, label: '2:00 PM' },
  { h: 16, label: '4:00 PM' },
  { h: 18, label: '6:00 PM' },
];

export const money2 = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function dayAt(offsetDays, hour = 8) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays, hour).toISOString();
}
export const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const timeLabel = (iso) => {
  const h = new Date(iso).getHours();
  return SLOTS.find((s) => s.h === h)?.label || new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
export const hoursUntil = (iso) => (new Date(iso).getTime() - Date.now()) / 3600000;
export const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

const ACTIVE = ['Pending', 'Confirmed'];

// A pair is "repeat" once they've had a confirmed or completed booking together.
export function isRepeat(requests, { cfiId, planeId }) {
  if (cfiId) return requests.some((r) => r.cfiId === cfiId && ['Confirmed', 'Completed'].includes(r.status));
  return requests.some((r) => !r.cfiId && r.planeId === planeId && r.status === 'Completed');
}

// Pre-booking safety + insurance checks. Anything `blocking` stops the booking.
export function bookingChecks({ pilot, cfi, plane, flightHours }) {
  const out = [];
  out.push({ label: 'Pilot ID verified', ok: !!pilot.idVerified, blocking: true });
  if (plane) {
    const left = r2(plane.next100At - plane.hobbsTotal);
    out.push({ label: `100-hr inspection current (${left > 0 ? left + ' hrs left' : 'overdue'})`, ok: left >= flightHours, blocking: true });
    const grounding = (plane.squawks || []).find((s) => s.status === 'open' && s.grounding);
    out.push({ label: grounding ? `Grounding squawk: ${grounding.text}` : 'No grounding squawks', ok: !grounding, blocking: true });
  }
  if (cfi && plane) {
    out.push({ label: `Instructor meets insurance min (${plane.insuranceMinHours} hrs)`, ok: cfi.totalHours >= plane.insuranceMinHours, blocking: true });
    out.push({ label: `${cfi.name.split(' ')[0]} checked out in ${plane.tail}`, ok: cfi.aircraftIds.includes(plane.id), blocking: false });
  }
  if (!cfi && plane) {
    out.push({ label: 'Aircraft allows solo rental', ok: plane.soloRental, blocking: true });
    out.push({ label: `Medical current (${pilot.medical})`, ok: pilot.medicalValid, blocking: true });
    if (pilot.certificate === 'Student') {
      const e = (pilot.soloEndorsements || []).find((x) => x.planeId === plane.id);
      const valid = e && hoursUntil(e.expires) > 0;
      out.push({ label: valid ? `Solo endorsement for ${plane.tail} (exp ${dateLabel(e.expires)})` : `Solo endorsement for ${plane.tail}`, ok: !!valid, blocking: true });
    }
    out.push({ label: `Meets insurance min (${plane.insuranceMinHours} hrs TT)`, ok: pilot.totalHours >= plane.insuranceMinHours, blocking: true });
    out.push({ label: `Checked out in ${plane.tail}`, ok: (pilot.checkouts || []).includes(plane.id), blocking: true });
  }
  return out;
}

// Deterministic "other customers" busy slots so calendars look real.
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
export function slotStatus({ cfi, plane, day, hour, requests, ignoreId }) {
  const dow = day.toLocaleDateString('en-US', { weekday: 'short' });
  if (cfi && !cfi.availability.includes(dow)) return 'off';
  const k = dayKey(day);
  const clash = requests.filter((r) => r.id !== ignoreId && ACTIVE.includes(r.status) && r.when && dayKey(new Date(r.when)) === k && new Date(r.when).getHours() === hour);
  if (cfi && clash.some((r) => r.cfiId === cfi.id)) return 'cfi';
  if (plane && clash.some((r) => r.planeId === plane.id)) return 'plane';
  if (cfi && hash(cfi.id + k + hour) % 10 < 3) return 'cfi';
  if (plane && hash(plane.id + k + hour) % 10 < 2) return 'plane';
  if (new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour) < new Date()) return 'off';
  return 'free';
}

// Messaging guardrails: hide contact info before the first booking; nudge on off-app payment talk.
const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const OFFAPP = /\b(venmo|zelle|cash ?app|paypal|pay (you|me) (in )?cash|cash only|off the app|outside the app|text me|call me|my (cell|number))\b/i;
export function scanMessage(text, hasBooking) {
  const contact = new RegExp(PHONE.source).test(text) || new RegExp(EMAIL.source).test(text);
  const offApp = OFFAPP.test(text);
  let out = text;
  if (!hasBooking && contact) out = text.replace(PHONE, '[number hidden until first booking]').replace(EMAIL, '[email hidden until first booking]');
  return { text: out, masked: out !== text, flagged: contact || offApp, offApp };
}

export const cfiScore = (c) => c.rating * 20 + Math.log10((c.reviewCount || 0) + 1) * 10 + (c.platformHours || 0) / 40 + (c.pro ? 4 : 0);

// FAA 61.109(a) private pilot (ASEL) minimums.
export const PPL_MINIMUMS = [
  { key: 'total', label: 'Total time', req: 40 },
  { key: 'dual', label: 'Dual instruction', req: 20 },
  { key: 'solo', label: 'Solo', req: 10 },
  { key: 'dualXC', label: 'Dual cross-country', req: 3 },
  { key: 'night', label: 'Night (dual)', req: 3 },
  { key: 'instrument', label: 'Instrument (dual)', req: 3 },
  { key: 'soloXC', label: 'Solo cross-country', req: 5 },
  { key: 'prep', label: 'Checkride prep (60 days)', req: 3 },
];

export function costProjection(training, cfi, plane, totalHours = training.hours.total) {
  const target = training.targetHours;
  const remaining = Math.max(0, target - totalHours);
  const dualShare = 0.6;
  const hourly = cfi && plane ? cfi.flightRate + plane.wetRate : 240;
  const soloHourly = plane ? plane.wetRate : 165;
  const ground = remaining * 0.3 * (cfi ? cfi.groundRate : 55);
  const est = remaining * dualShare * hourly + remaining * (1 - dualShare) * soloHourly + ground + 1200; // + written, DPE fee, headset/charts misc
  return { remaining: r2(remaining), est: Math.round(est), projected: Math.round(training.spent + est) };
}

// Founder metrics: repeat-booking rate and leakage watchlist.
export function pairMetrics(seedPairs, requests, getCfi) {
  const live = {};
  requests.filter((r) => r.cfiId && r.status === 'Completed').forEach((r) => {
    live[r.cfiId] = live[r.cfiId] || { student: 'You (demo)', cfiId: r.cfiId, lessons: 0, lastDays: 0, flags: 0 };
    live[r.cfiId].lessons++;
  });
  const pairs = [...seedPairs, ...Object.values(live)].map((p) => ({ ...p, cfi: getCfi(p.cfiId) }));
  const rebooked = pairs.filter((p) => p.lessons >= 2).length;
  const watch = pairs.filter((p) => (p.lessons <= 2 && p.lastDays > 21) || p.flags > 0);
  return { pairs, rate: pairs.length ? Math.round((rebooked / pairs.length) * 100) : 0, watch };
}
