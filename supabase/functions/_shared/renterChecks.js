// GENERATED from src/renterChecks.js by scripts/sync-shared.js — do not edit here.
// Checks for renting a plane without an instructor (solo rentals, and both pilots on a
// shared rental). The app shows them while booking; the server (book, split) enforces
// them with the same code (copied by scripts/sync-shared.js).
//
//  - The pilot's own profile: certificate, medical, flight review, total hours.
//    Applies to every plane.
//  - The plane owner's checkout: the owner marks a pilot checked out in their plane
//    (and, for a student pilot, records the solo endorsement they saw and its expiry).

export const CERTIFICATES = ['Student', 'Sport', 'Recreational', 'Private', 'Commercial', 'ATP'];
export const MEDICALS = ['1st class', '2nd class', '3rd class', 'BasicMed', 'Driver’s license (Sport only)'];

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const isYmd = (s) => typeof s === 'string' && YMD.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

// The calendar date of a moment in a time zone, as YYYY-MM-DD.
export function ymdIn(date, tz = 'America/New_York') {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
}

// 14 CFR 61.56(c): a flight review counts for 24 calendar months, through the last day of
// the 24th month after the month it was done.
export function flightReviewValidThrough(reviewYmd) {
  if (!isYmd(reviewYmd)) return null;
  const [y, m] = reviewYmd.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + 25, 0)); // day 0 of the month after = last day of month+24
  return last.toISOString().slice(0, 10);
}

const fmt = (ymd) => {
  if (!isYmd(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

// What's missing from a pilot profile (empty = complete).
export function profileGaps(p) {
  if (!p) return ['certificate', 'medical', 'flight review', 'total hours'];
  const gaps = [];
  if (!CERTIFICATES.includes(p.certificate)) gaps.push('certificate');
  if (!MEDICALS.includes(p.medicalClass) || !isYmd(p.medicalExpires)) gaps.push('medical');
  if (p.certificate !== 'Student' && !isYmd(p.flightReviewDate)) gaps.push('flight review');
  if (!(Number(p.totalHours) >= 0) || p.totalHours === null || p.totalHours === '') gaps.push('total hours');
  return gaps;
}

// The checks for one pilot, one plane, one flight.
//   profile:  { certificate, medicalClass, medicalExpires, flightReviewDate, totalHours }
//   checkout: { status: 'requested' | 'approved' | 'declined' | 'revoked', soloUntil } or null
//   plane:    { tail, soloRental, insuranceMinHours, hobbsTotal, next100At }
// Each check: { key, label, ok, blocking, fix: 'profile' | 'checkout' | null }
export function renterChecks({ profile, checkout, plane, flightHours = 1, start = new Date(), tz = 'America/New_York' }) {
  const day = ymdIn(start, tz);
  const tail = plane?.tail || 'this plane';
  const out = [];
  out.push({ key: 'solo', label: 'Plane allows solo rental', ok: plane?.soloRental !== false, blocking: true, fix: null });
  // Only checked when the owner keeps the Hobbs and next-100-hour numbers up to date.
  const hobbs = Number(plane?.hobbsTotal || 0), next = Number(plane?.next100At || 0);
  if (hobbs > 0 && next > 0) {
    const left = Math.round((next - hobbs) * 10) / 10;
    out.push({ key: '100hr', label: `100-hr inspection current (${left > 0 ? left + ' hrs left' : 'overdue'})`, ok: left >= flightHours, blocking: true, fix: null });
  }

  const gaps = profileGaps(profile);
  if (gaps.length) {
    out.push({ key: 'profile', label: `Pilot profile: add your ${gaps.join(', ')}`, ok: false, blocking: true, fix: 'profile' });
  } else {
    const student = profile.certificate === 'Student';
    out.push({ key: 'medical', label: `${profile.medicalClass === 'Driver’s license (Sport only)' ? 'Driver’s license' : profile.medicalClass} valid (through ${fmt(profile.medicalExpires)})`,
      ok: profile.medicalExpires >= day, blocking: true, fix: 'profile' });
    if (profile.medicalClass === 'Driver’s license (Sport only)' && profile.certificate !== 'Sport') {
      out.push({ key: 'medicalType', label: 'A driver’s license only counts as a medical for sport pilots', ok: false, blocking: true, fix: 'profile' });
    }
    if (!student) {
      const through = flightReviewValidThrough(profile.flightReviewDate);
      out.push({ key: 'review', label: `Flight review current (through ${fmt(through)})`, ok: !!through && through >= day, blocking: true, fix: 'profile' });
    }
    const min = Number(plane?.insuranceMinHours || 0);
    if (min > 0) out.push({ key: 'insurance', label: `Meets insurance minimum (${min} hrs total; you have ${Number(profile.totalHours)})`, ok: Number(profile.totalHours) >= min, blocking: true, fix: 'profile' });
    if (student) {
      const until = checkout?.status === 'approved' ? checkout.soloUntil : null;
      out.push({ key: 'endorsement', label: until ? `Solo endorsement for ${tail} (through ${fmt(until)})` : `Solo endorsement for ${tail} (shown to the owner at checkout)`,
        ok: !!until && until >= day, blocking: true, fix: 'checkout' });
    }
  }
  const st = checkout?.status;
  out.push({ key: 'checkout', label: st === 'approved' ? `Checked out in ${tail} by the owner` : st === 'requested' ? `Checkout in ${tail} requested · waiting for the owner` : `Checked out in ${tail}`,
    ok: st === 'approved', blocking: true, fix: st === 'requested' ? null : 'checkout' });
  return out;
}

export const failing = (checks) => checks.filter((c) => c.blocking && !c.ok);
