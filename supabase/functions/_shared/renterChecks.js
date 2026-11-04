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

const addDays = (ymd, n) => {
  if (!isYmd(ymd)) return null;
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// 14 CFR 61.57(a)/(b): three takeoffs and landings within the preceding 90 days to carry
// passengers (at night: to a full stop, between an hour after sunset and an hour before
// sunrise). The pilot enters the date of the oldest of their last three; it's current
// through 90 days after that.
export const passengerCurrentThrough = (oldestOfLastThreeYmd) => addDays(oldestOfLastThreeYmd, 90);

// Owners can require a recent flight before a solo rental (an insurance or club rule).
export const RECENT_FLIGHT_OPTIONS = [0, 30, 60, 90];

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
//   profile:  { certificate, medicalClass, medicalExpires, flightReviewDate, totalHours,
//               lastFlightDate, dayLandingsDate, nightLandingsDate }  (the last three optional)
//   checkout: { status: 'requested' | 'approved' | 'declined' | 'revoked', soloUntil } or null
//   plane:    { tail, soloRental, insuranceMinHours, hobbsTotal, next100At, recentFlightDays }
// Each check: { key, label, ok, blocking, fix: 'profile' | 'checkout' | null }
// forCheckout: the checkout flight itself, flown with the owner on board. Being checked out
// isn't required for it, but student pilots need a CFI (only a CFI can endorse them for solo).
export const CHECKOUT_BY = ['cfi', 'owner', 'either'];
export const ownerChecksOut = (plane) => ['owner', 'either'].includes(plane?.checkoutBy);
export function renterChecks({ profile, checkout, plane, flightHours = 1, start = new Date(), tz = 'America/New_York', forCheckout = false }) {
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
    // The owner's recency rule (off unless they set one).
    const recent = Number(plane?.recentFlightDays || 0);
    if (recent > 0) {
      const last = isYmd(profile.lastFlightDate) ? profile.lastFlightDate : null;
      out.push({ key: 'recent', label: last ? `Flown in the last ${recent} days (owner’s rule; last flight ${fmt(last)})` : `Owner requires a flight in the last ${recent} days: add your last flight date`,
        ok: !!last && addDays(last, recent) >= day && last <= day, blocking: true, fix: 'profile' });
    }
    // Passenger currency: not needed to fly alone, so a heads-up rather than a block.
    if (!student) {
      const dayThrough = passengerCurrentThrough(profile.dayLandingsDate);
      const nightThrough = passengerCurrentThrough(profile.nightLandingsDate);
      out.push({ key: 'dayCurrency', label: dayThrough ? (dayThrough >= day ? `Day passenger currency (61.57) through ${fmt(dayThrough)}` : `Not current to carry passengers (61.57): 3 takeoffs & landings needed`) : 'Add your recent landings to check passenger currency (61.57)',
        ok: !!dayThrough && dayThrough >= day, blocking: false, fix: 'profile' });
      if (nightThrough && nightThrough >= day) out.push({ key: 'nightCurrency', label: `Night passenger currency through ${fmt(nightThrough)}`, ok: true, blocking: false, fix: null });
      else out.push({ key: 'nightCurrency', label: 'Not night current for passengers (3 full-stop night landings in 90 days)', ok: false, blocking: false, fix: 'profile' });
    }
    if (student && forCheckout) {
      out.push({ key: 'student', label: 'Student pilots get checked out by a CFI (for the solo endorsement)', ok: false, blocking: true, fix: null });
    } else if (student) {
      const until = checkout?.status === 'approved' ? checkout.soloUntil : null;
      out.push({ key: 'endorsement', label: until ? `Solo endorsement for ${tail} (through ${fmt(until)})` : `Solo endorsement for ${tail} (shown to the owner at checkout)`,
        ok: !!until && until >= day, blocking: true, fix: 'checkout' });
    }
  }
  if (forCheckout) {
    out.push({ key: 'ownerCheckout', label: `${tail}’s owner does checkouts`, ok: ownerChecksOut(plane), blocking: true, fix: null });
    return out;
  }
  const st = checkout?.status;
  out.push({ key: 'checkout', label: st === 'approved' ? `Checked out in ${tail} by the owner` : st === 'requested' ? `Checkout in ${tail} requested · waiting for the owner` : `Checked out in ${tail}`,
    ok: st === 'approved', blocking: true, fix: st === 'requested' ? null : 'checkout' });
  return out;
}

export const failing = (checks) => checks.filter((c) => c.blocking && !c.ok);
