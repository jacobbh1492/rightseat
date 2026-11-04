// GENERATED from src/aircraftStatus.js by scripts/sync-shared.js — do not edit here.
// Is the plane airworthy for this flight? Open squawks, the 100-hour and the annual.
// The app shows these on the plane page, the booking screen and the preflight screen; the
// server (book, booking-action confirm) enforces the blocking ones with the same code
// (copied by scripts/sync-shared.js).
//
//   plane:   { tail, hobbsTotal, next100At, annualDate }   annualDate: YYYY-MM-DD of the last annual
//   squawks: [{ id, text, grounding, status: 'open' | 'deferred' | 'fixed' }]
// Each check: { key, label, ok, blocking }

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const isYmd = (s) => typeof s === 'string' && YMD.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

const fmt = (ymd) => {
  if (!isYmd(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

// 14 CFR 91.409(a): an annual counts for the 12 calendar months after the month it was done,
// so it runs through the last day of the 12th month.
export function annualValidThrough(annualYmd) {
  if (!isYmd(annualYmd)) return null;
  const [y, m] = annualYmd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + 13, 0)).toISOString().slice(0, 10);
}

export const SQUAWK_STATUSES = ['open', 'deferred', 'fixed'];
export const openSquawks = (squawks) => (squawks || []).filter((q) => q.status === 'open' || q.status === 'deferred');
export const groundingSquawks = (squawks) => (squawks || []).filter((q) => q.status === 'open' && q.grounding);

// day: the flight's calendar date (YYYY-MM-DD). include100hr: false where renterChecks already shows it.
/** @param {{ plane: any, squawks?: any[], flightHours?: number, day: string, include100hr?: boolean }} opts */
export function aircraftChecks({ plane, squawks = [], flightHours = 1, day, include100hr = true }) {
  const tail = plane?.tail || 'The plane';
  const out = [];
  const grounding = groundingSquawks(squawks);
  out.push({
    key: 'grounding',
    label: grounding.length ? `Grounded: ${grounding[0].text}${grounding.length > 1 ? ` (+${grounding.length - 1} more)` : ''}` : 'No grounding squawks',
    ok: !grounding.length, blocking: true,
  });
  const other = openSquawks(squawks).filter((q) => !(q.status === 'open' && q.grounding));
  if (other.length) {
    out.push({ key: 'squawks', label: `${other.length} open squawk${other.length > 1 ? 's' : ''} (not grounding): ${other.map((q) => q.text).slice(0, 2).join('; ')}${other.length > 2 ? '…' : ''}`, ok: false, blocking: false });
  }
  if (include100hr) {
    const hobbs = Number(plane?.hobbsTotal || 0), next = Number(plane?.next100At || 0);
    if (hobbs > 0 && next > 0) {
      const left = Math.round((next - hobbs) * 10) / 10;
      out.push({ key: '100hr', label: `100-hr inspection current (${left > 0 ? left + ' hrs left' : 'overdue'})`, ok: left >= flightHours, blocking: true });
    }
  }
  const through = annualValidThrough(plane?.annualDate);
  if (through) {
    out.push({ key: 'annual', label: through >= day ? `Annual inspection current (through ${fmt(through)})` : `${tail}’s annual inspection expired ${fmt(through)}`, ok: through >= day, blocking: true });
  }
  return out;
}

export const blockingIssues = (checks) => checks.filter((c) => c.blocking && !c.ok);
