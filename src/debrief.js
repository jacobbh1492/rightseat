// Post-flight debriefs: structure, quick-pick options, seed history and helpers.
import { dayAt, dateLabel } from './logic';

export const GRADES = [
  { key: 'intro', label: 'Introduced', color: '#5B6474', bg: '#EEF1F5' },
  { key: 'practice', label: 'Needs practice', color: '#B45309', bg: '#FEF3C7' },
  { key: 'solid', label: 'Solid', color: '#1D4ED8', bg: '#DBEAFE' },
  { key: 'acs', label: 'Checkride standard', color: '#0E9F6E', bg: '#E3F7EF' },
];
export const gradeOf = (k) => GRADES.find((g) => g.key === k) || GRADES[0];

export const MANEUVERS = [
  'Preflight & checklists', 'Radio calls', 'Normal takeoff & landing', 'Crosswind landing', 'Short-field takeoff & landing', 'Soft-field takeoff & landing',
  'Go-around', 'Slow flight', 'Power-off stall', 'Power-on stall', 'Steep turns', 'Ground reference', 'Emergency procedures', 'Pattern work',
  'Pilotage & dead reckoning', 'Flight following / ATC', 'Basic attitude instrument', 'ADM & risk management',
];

export const HOMEWORK = [
  'Chair-fly the pattern', 'Review ACS for today’s maneuvers', 'PHAK ch. 16 – Navigation', 'Plan the XC: nav log + W&B',
  'Study airspace on the sectional', 'Review emergency checklist', 'Watch your landing video', 'Practice radio calls (LiveATC)',
];

const d = (n, h) => dayAt(n, h);

export const SEED_DEBRIEFS = [
  {
    id: 'db0', requestId: 'r0', cfiId: 'c1', planeId: 'p1', when: d(-3, 8), goal: 'Short & soft field landings', flightHours: 1.5, groundHours: 0.5,
    conditions: { wind: '220@12G17', notes: 'Gusty crosswind on 22' },
    grades: [
      { item: 'Short-field takeoff & landing', grade: 'solid' },
      { item: 'Soft-field takeoff & landing', grade: 'practice' },
      { item: 'Crosswind landing', grade: 'practice' },
      { item: 'Go-around', grade: 'acs' },
    ],
    wentWell: 'Great airspeed control on short-field approaches. Every landing within 200 ft of the aim point. Good decision to go around when the gust pushed you high.',
    needsWork: 'Soft-field: you’re letting the nosewheel down too early. Keep back pressure all the way through the rollout. Crosswind: aileron input fades in the flare; keep adding as you slow.',
    nextPlan: 'Dual cross-country KPIE → KLAL → KBKV → KPIE. We’ll warm up with 2 soft-field landings at KBKV.',
    homework: [{ text: 'Plan the XC: nav log + W&B', done: false }, { text: 'Review ACS for today’s maneuvers', done: true }],
    acknowledged: false,
    studentNote: '',
  },
  {
    id: 'db1', requestId: null, cfiId: 'c1', planeId: 'p1', when: d(-10, 10), goal: 'Supervised solo pattern', flightHours: 1.2, groundHours: 0.3,
    conditions: { wind: 'Calm', notes: '' },
    grades: [
      { item: 'Pattern work', grade: 'solid' },
      { item: 'Normal takeoff & landing', grade: 'acs' },
      { item: 'Radio calls', grade: 'solid' },
    ],
    wentWell: 'Three solid solo laps. Radio calls were clear and on time. Nice stabilized approaches.',
    needsWork: 'Downwind spacing drifts wide when you’re busy with the radio. Pick a ground reference for your downwind leg.',
    nextPlan: 'Short- and soft-field takeoffs and landings.',
    homework: [{ text: 'Chair-fly the pattern', done: true }],
    acknowledged: true,
    lockedAt: 'Oct 21',
    studentNote: 'Thanks! Will use the road on the east side as my downwind reference.',
  },
  {
    id: 'db2', requestId: null, cfiId: 'c1', planeId: 'p1', when: d(-24, 8), goal: 'Ground reference maneuvers', flightHours: 1.4, groundHours: 0.5,
    conditions: { wind: '090@8', notes: '' },
    grades: [
      { item: 'Ground reference', grade: 'solid' },
      { item: 'Steep turns', grade: 'practice' },
      { item: 'Crosswind landing', grade: 'practice' },
    ],
    wentWell: 'Turns around a point were consistent once you started adjusting bank early for the wind.',
    needsWork: 'Steep turns: losing ~150 ft. Add back pressure and a touch of power as you roll in. Crosswind landings drifting left.',
    nextPlan: 'Pre-solo review and stage check.',
    homework: [{ text: 'Review ACS for today’s maneuvers', done: true }],
    acknowledged: true,
    lockedAt: 'Oct 8',
    studentNote: '',
    amendments: [
      { id: 'am1', at: 'Oct 9', by: 'c1', type: 'Correction', text: 'Steep turns: I recorded “Needs practice” but on review of the last two you held altitude within 100 ft. Updating to Solid.', gradeChanges: [{ item: 'Steep turns', from: 'practice', to: 'solid' }], read: true },
    ],
  },
];

export const withLabels = (db) => ({ ...db, date: dateLabel(db.when) });

// Items graded "Introduced" or "Needs practice" in more than one debrief, plus their most recent grade.
export function focusAreas(debriefs) {
  const map = {};
  [...debriefs].sort((a, b) => new Date(a.when) - new Date(b.when)).forEach((d) =>
    effectiveGrades(d).forEach((g) => {
      const m = (map[g.item] = map[g.item] || { item: g.item, weak: 0, seen: 0, latest: null });
      m.seen++;
      if (g.grade === 'practice' || g.grade === 'intro') m.weak++;
      m.latest = g.grade;
    })
  );
  return Object.values(map)
    .filter((m) => m.weak > 0)
    .sort((a, b) => b.weak - a.weak || (a.latest === 'practice' ? -1 : 1));
}

export const isEmptyDebrief = (d) => !d || (!(d.grades || []).length && !d.wentWell?.trim() && !d.needsWork?.trim() && !d.nextPlan?.trim());

// ---------- Locking & amendments ----------
// A debrief locks when the student marks it reviewed, or 7 days after the flight, whichever comes first.
// After that the original is never changed; the CFI adds dated amendments instead (like a logbook correction).
export const LOCK_DAYS = 7;
export function lockInfo(db) {
  if (db.pending) return { locked: false };
  if (db.lockedAt) return { locked: true, reason: `Locked ${db.lockedAt} when the student reviewed it` };
  const age = (Date.now() - new Date(db.when).getTime()) / 86400000;
  if (age >= LOCK_DAYS) return { locked: true, reason: `Locked automatically ${LOCK_DAYS} days after the flight` };
  return { locked: false, reason: `Editable until the student reviews it or ${LOCK_DAYS} days after the flight` };
}
export const AMEND_TYPES = ['Correction', 'Clarification', 'Added detail'];

// Grades after applying amendments in order; each entry remembers its original grade if changed.
export function effectiveGrades(db) {
  const g = (db.grades || []).map((x) => ({ ...x, original: x.grade }));
  (db.amendments || []).forEach((a) =>
    (a.gradeChanges || []).forEach((c) => {
      const row = g.find((x) => x.item === c.item);
      if (row) row.grade = c.to;
    })
  );
  return g.map((x) => ({ ...x, amended: x.grade !== x.original }));
}
export const unreadAmendments = (db) => (db.amendments || []).filter((a) => !a.read).length;
