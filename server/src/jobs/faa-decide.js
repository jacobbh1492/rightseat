// Pure decisions for the nightly FAA job (kept separate so they're unit-tested).
// The job never rejects an instructor on its own: anything it can't confirm goes to
// a person ('review'). Aircraft with an invalid or expired registration fail outright,
// which pauses bookings until it's fixed.
import { cfiRatingLabels } from '../faa/airmen.js';

export function decideAirmen(candidates) {
  const withCfi = candidates.filter((c) => c.instructor);
  const brief = candidates.slice(0, 5).map((c) => ({ name: c.name, city: c.city, state: c.state, instructor: c.instructor ? { ratings: c.instructor.ratings } : null }));
  if (withCfi.length === 1) {
    const c = withCfi[0];
    return { status: 'passed', detail: { faaId: c.id, name: c.name, city: c.city, state: c.state, ratings: cfiRatingLabels(c.instructor.ratings || []) } };
  }
  if (withCfi.length > 1) return { status: 'review', detail: { reason: `${withCfi.length} flight instructors in the FAA registry share this name.`, candidates: brief } };
  if (candidates.length) return { status: 'review', detail: { reason: 'Found in the FAA registry, but without a flight instructor certificate. New certificates can take a month to appear in FAA data.', candidates: brief } };
  return { status: 'review', detail: { reason: 'No FAA record under the verified name. Check for a middle name or name change.', candidates: [] } };
}

const word = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim().split(/\s+/)[0] || '';

export function decideAircraft(listing, rec, now = new Date()) {
  if (!rec) return { status: 'review', detail: { reason: `${listing.tail} isn’t in the FAA Aircraft Registry. Check the tail number.` } };
  const facts = { faaMake: rec.make, faaModel: rec.model, year: rec.year, owner: rec.owner, registrantType: rec.registrantType, expires: rec.expires, statusCode: rec.statusCode };
  if (!rec.valid) return { status: 'failed', detail: { ...facts, reason: `The FAA shows this registration as not valid (status ${rec.statusCode || 'unknown'}).` } };
  if (rec.expires && rec.expires < now) return { status: 'failed', detail: { ...facts, reason: 'The FAA registration has expired.' } };
  if (rec.make && word(rec.make) !== word(listing.make)) {
    return { status: 'review', detail: { ...facts, reason: `Listed as ${listing.make} ${listing.model}; the FAA registry says ${rec.make} ${rec.model || ''}.`.trim() } };
  }
  return { status: 'passed', detail: facts };
}
