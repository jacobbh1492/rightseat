import { LESSONS, DIAG } from './content.js';

// Library order and sections. Lesson ids are what the database stores (pre-flight
// reviews and studied marks), so never rename an id; add new ones instead.
export const GROUPS = [
  { name: 'Takeoffs & Landings', ids: ['normal-takeoff', 'normal-landing', 'soft-takeoff', 'soft-landing', 'short-takeoff', 'short-landing', 'forward-slip', 'go-around', 'power-off-180'] },
  { name: 'Performance Maneuvers', ids: ['steep-turns', 'steep-spiral', 'chandelle', 'lazy-eight'] },
  { name: 'Ground Reference', ids: ['rectangular-course', 's-turns', 'turns-around-point', 'eights-on-pylons'] },
  { name: 'Slow Flight & Stalls', ids: ['slow-flight', 'power-off-stall', 'power-on-stall', 'accelerated-stall', 'spin-awareness'] },
  { name: 'Emergency Operations', ids: ['emergency-descent', 'emergency-landing'] },
  { name: 'Instrument Rating', ids: ['ir-flight', 'ir-unusual', 'ir-holding', 'ir-tracking', 'ir-departure', 'ir-npa', 'ir-precision', 'ir-missed', 'ir-circling', 'ir-landing', 'ir-lostcomm', 'ir-partial'] },
  { name: 'Multi-Engine', ids: ['me-critical', 'me-before-vmc', 'me-after-liftoff', 'me-maneuvering', 'me-vmc', 'me-oei-landing', 'me-oei-instruments', 'me-oei-approach'] },
];

export const ALL_IDS = GROUPS.flatMap((g) => g.ids);
export const LESSON_COUNT = ALL_IDS.length;

export const getLesson = (id) => (LESSONS[id] ? { id, ...LESSONS[id] } : null);

// Which certificates a lesson applies to (badges and filters).
export function certsOf(L) {
  const ir = L.kind === 'ir';
  return {
    pvt: !ir && !!L.pvt,
    com: !ir && !!L.com,
    ir,
    me: L.kind === 'me' || !!L.me,
  };
}

export const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pvt', label: 'Private' },
  { key: 'com', label: 'Commercial' },
  { key: 'ir', label: 'Instrument' },
  { key: 'me', label: 'Multi-Engine' },
];

export const matchesFilter = (L, f) => f === 'all' || certsOf(L)[f];

// Standards to show for a certificate: 'pvt' | 'com'. Instrument lessons only have pvt.
export function standardsFor(L, cert) {
  const rows = cert === 'com' && L.com ? L.com : L.pvt || L.com || [];
  return rows.map(([k, v]) => ({ k, v }));
}

export function acsRef(L, cert) {
  if (L.kind === 'ir') return { book: 'Instrument Rating ACS', code: 'FAA-S-ACS-8C', task: L.acsP };
  if (cert === 'com' && L.acsC) return { book: 'Commercial Pilot ACS', code: 'FAA-S-ACS-7B', task: L.acsC };
  if (L.acsP) return { book: 'Private Pilot ACS', code: 'FAA-S-ACS-6C', task: L.acsP };
  return { book: 'Commercial Pilot ACS', code: 'FAA-S-ACS-7B', task: L.acsC };
}

// FAA handbook references for the "Read more" list.
export function refsOf(L) {
  if (L.refs) return L.refs.map(([book, code, ch]) => ({ book, code, ch }));
  const out = [{ book: 'Airplane Flying Handbook', code: 'FAA-H-8083-3C', ch: L.afh }];
  if (L.phak) out.push({ book: "Pilot's Handbook of Aeronautical Knowledge", code: 'FAA-H-8083-25C', ch: L.phak });
  return out;
}

export const diagramFor = (id) => (DIAG[id] ? DIAG[id]() : null);

export const searchLessons = (q) => {
  const t = q.trim().toLowerCase();
  if (!t) return ALL_IDS;
  return ALL_IDS.filter((id) => {
    const L = LESSONS[id];
    return [L.title, L.area, L.acsP, L.acsC].filter(Boolean).some((s) => s.toLowerCase().includes(t));
  });
};
