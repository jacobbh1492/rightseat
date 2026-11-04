// "Get matched": a student describes what they want, and we rank instructors by how well
// they fit. Each match comes with plain reasons, so the student sees why it was picked.
//
//   request: { goal, airport, days: ['Mon'…], times: ['Early AM'…], maxRate (combined $/hr, 0 = any),
//              needPlane, glass, styles: ['Patient'…] }
//   cfis/planes: the app's listing shapes (src/backend/listings.js, src/data.js)

export const MATCH_GOALS = ['Discovery flight', 'Private Pilot', 'Instrument', 'Commercial', 'Multi-engine', 'Flight review (BFR)', 'Tailwheel', 'CFI training'];
export const MATCH_STYLES = ['Patient', 'Structured', 'Fast-paced', 'Lots of ground', 'Scenario-based'];

// What an instructor needs on their certificate or profile to teach each goal.
const NEEDS = {
  'Discovery flight': { specialty: 'Discovery flights' },
  'Private Pilot': { specialty: 'Private Pilot' },
  Instrument: { cert: 'CFII', specialty: 'Instrument' },
  Commercial: { specialty: 'Commercial' },
  'Multi-engine': { cert: 'MEI', specialty: 'Multi-engine' },
  'Flight review (BFR)': { specialty: 'Flight review (BFR)' },
  Tailwheel: { specialty: 'Tailwheel' },
  'CFI training': { specialty: 'CFI training' },
};

const GLASS = /G1000|G3X|G5|Aspen|GTN|glass/i;
const STYLE_WORDS = {
  Patient: /patien|calm|relax|nervous|anxious/i,
  Structured: /structur|syllab|plan|organi[sz]|checklist|acs/i,
  'Fast-paced': /fast|accelerat|intens|quick|efficien/i,
  'Lots of ground': /ground|brief|whiteboard|theory|explain/i,
  'Scenario-based': /scenario|real.world|cross.country|adm|decision/i,
};

const r1 = (n) => Math.round(n * 10) / 10;

// The plane they'd fly together: the cheapest one the instructor flies that fits the request.
function bestPlane(cfi, planes, request) {
  const theirs = (cfi.aircraftIds || []).map((id) => planes.find((p) => p.id === id)).filter(Boolean);
  const fits = theirs.filter((p) => (request.goal === 'Multi-engine' ? /multi|twin/i.test(p.category || '') : true)
    && (request.goal === 'Instrument' ? p.ifr !== false : true));
  const pool = fits.length ? fits : theirs;
  const glassFirst = request.glass ? pool.filter((p) => (p.avionics || []).some((a) => GLASS.test(a))) : [];
  return [...(glassFirst.length ? glassFirst : pool)].sort((a, b) => a.wetRate - b.wetRate)[0] || null;
}

export function scoreCfi(cfi, planes, request) {
  const need = NEEDS[request.goal] || {};
  const certs = cfi.certs || [];
  const specialties = cfi.specialties || [];
  const reasons = [], concerns = [];
  let score = 0;

  // Hard filter: they must be able to teach it.
  if (need.cert && !certs.includes(need.cert)) return null;
  if (specialties.includes(need.specialty)) { score += 30; reasons.push(`Teaches ${request.goal === 'Discovery flight' ? 'discovery flights' : request.goal}`); }
  else if (need.cert) score += 15; // has the CFII/MEI, just doesn't list it as a focus
  else if (['Tailwheel', 'CFI training'].includes(request.goal)) return null; // needs specific experience
  else score += 8; // any CFI can teach it; it's not their focus

  // Where.
  const airport = String(request.airport || '').toUpperCase();
  if (airport && cfi.homeAirport === airport) { score += 20; reasons.push(`Based at ${airport}`); }
  else if (airport && (cfi.alsoTeachesAt || []).includes(airport)) { score += 14; reasons.push(`Also teaches at ${airport}`); }
  else if (airport) { score -= 10; concerns.push(`Based at ${cfi.homeAirport}`); }

  // When.
  const days = request.days || [];
  const overlap = days.filter((d) => (cfi.availability || []).includes(d));
  if (days.length) {
    if (overlap.length) { score += Math.min(15, overlap.length * 5); reasons.push(`Available ${overlap.slice(0, 3).join(', ')}${overlap.length > 3 ? '…' : ''}`); }
    else { score -= 15; concerns.push('Not available on your days'); }
  }
  const times = request.times || [];
  if (times.length && times.some((t) => (cfi.timeOfDay || []).includes(t))) { score += 6; }
  else if (times.length && (cfi.timeOfDay || []).length) concerns.push(`Usually flies ${(cfi.timeOfDay || []).join(', ').toLowerCase()}`);

  // Plane and cost.
  const plane = request.needPlane === false ? null : bestPlane(cfi, planes, request);
  const combined = Number(cfi.flightRate || 0) + (plane ? Number(plane.wetRate || 0) : 0);
  if (request.needPlane !== false && !plane) { score -= 12; concerns.push('Doesn’t list a plane'); }
  else if (plane && request.glass && (plane.avionics || []).some((a) => GLASS.test(a))) { score += 6; reasons.push(`Flies a glass-cockpit ${plane.make} ${plane.model}`); }
  else if (request.needPlane === false && cfi.teachesInYourPlane) { score += 8; reasons.push('Teaches in your plane'); }
  const max = Number(request.maxRate || 0);
  if (max > 0) {
    if (combined <= max) { score += 10; reasons.push(`$${Math.round(combined)}/hr${plane ? ' with the plane' : ''}, within budget`); }
    else { score -= Math.min(25, Math.round((combined - max) / 5)); concerns.push(`$${Math.round(combined - max)}/hr over budget`); }
  }

  // Track record (RightSeat reviews count more than self-reported numbers).
  if (cfi.reviewCount >= 3 && cfi.rating >= 4.7) { score += 8; reasons.push(`${Number(cfi.rating).toFixed(1)}★ from ${cfi.reviewCount} students`); }
  else if (cfi.reviewCount > 0) score += Math.max(0, (Number(cfi.rating) - 4) * 4);
  if (request.goal !== 'Discovery flight' && Number(cfi.passRate) >= 90 && Number(cfi.checkridesSent) >= 5) { score += 5; reasons.push(`${cfi.passRate}% first-time pass rate`); }
  if (Number(cfi.totalHours) >= 1500) score += 3;
  if (cfi.verified) score += 4;

  // Teaching style.
  const text = `${cfi.teachingStyle || ''} ${cfi.bio || ''}`;
  const styleHits = (request.styles || []).filter((st) => STYLE_WORDS[st]?.test(text));
  if (styleHits.length) { score += styleHits.length * 5; reasons.push(`${styleHits.join(' & ')} teaching style`); }

  return { cfi, plane, score: Math.round(score), combinedRate: r1(combined), reasons: reasons.slice(0, 4), concerns: concerns.slice(0, 2) };
}

// Ranked matches (best first). Unpublished or unbookable instructors are left out.
export function matchCfis({ cfis = [], planes = [], request, limit = 5 }) {
  return cfis
    .filter((c) => c.published !== false && !(c.live && !c.verified))
    .map((c) => scoreCfi(c, planes, request))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.combinedRate - b.combinedRate)
    .slice(0, limit);
}

// 0–100, for the "fit" bar.
export const fitPercent = (m, top) => Math.max(10, Math.min(100, Math.round((m.score / Math.max(1, top || m.score)) * 100)));
