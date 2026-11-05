// Training progress: combines lessons/hours logged in Positive Rate with a student's previous (self-reported) experience.
import { SYLLABUS } from './data';
import { PPL_MINIMUMS, r2 } from './logic';

export const ALL_LESSONS = SYLLABUS.flatMap((s) => s.lessons);
export const HOUR_KEYS = PPL_MINIMUMS.map((m) => m.key);

export const PROGRAMS = ['Private Pilot', 'Sport Pilot', 'Instrument Rating', 'Commercial Pilot'];
export const WHERE = ['Independent CFI (Part 61)', 'Flight school (Part 141)', 'Flight school (Part 61)', 'University program', 'Military', 'Other'];
export const LAST_FLIGHT = ['Within 30 days', '1–3 months ago', '3–12 months ago', 'Over a year ago'];

export const PRIOR_ENDORSEMENTS = [
  { name: 'Pre-solo aeronautical knowledge', ref: '61.87(b)' },
  { name: 'Pre-solo flight training', ref: '61.87(c)' },
  { name: 'Solo flight (90-day)', ref: '61.87(n)', hasExpiry: true },
  { name: 'Solo cross-country', ref: '61.93(c)' },
  { name: 'Knowledge test', ref: '61.35(a)(1)' },
  { name: 'Practical test', ref: '61.103(f) / 61.39' },
];

export const emptyPrior = () => ({
  program: 'Private Pilot',
  where: 'Independent CFI (Part 61)',
  school: '',
  aircraft: '',
  lastFlight: 'Within 30 days',
  soloed: false,
  soloDate: '',
  hours: Object.fromEntries(HOUR_KEYS.map((k) => [k, 0])),
  landings: 0,
  lessons: {}, // name -> 'done' | 'rusty'
  endorsements: [], // { name, ref, date, by, expires? }
  knowledgeTest: { passed: false, score: '', date: '' },
  files: [],
  source: 'manual', // manual | logbook-photo | foreflight
  status: 'self', // self | confirmed
  sharedWith: [],
  confirmedBy: null,
  cfiNotes: {}, // lesson -> 'confirmed' | 'needs'
});

// Simulated logbook read / CSV import (production: Document AI on logbook pages, or parse ForeFlight/MyFlightbook CSV).
export const DEMO_IMPORT = {
  hours: { total: 18.6, dual: 14.2, solo: 4.4, dualXC: 2.1, night: 0, instrument: 1.2, soloXC: 0, prep: 0 },
  landings: 96,
  lastFlightDate: 'Aug 2026',
  aircraft: 'Cessna 152, Cessna 172',
};

export function lessonState(t, name) {
  if (t.appDone.includes(name)) return 'app';
  const p = t.prior?.lessons?.[name];
  if (p === 'done') return t.prior.cfiNotes?.[name] === 'needs' ? 'rusty' : t.prior.status === 'confirmed' ? 'confirmed' : 'prior';
  if (p === 'rusty') return 'rusty';
  return 'todo';
}
export const isDone = (st) => st === 'app' || st === 'prior' || st === 'confirmed';
export const doneCount = (t) => ALL_LESSONS.filter((l) => isDone(lessonState(t, l))).length;
export const nextLessons = (t, n = 1) => ALL_LESSONS.filter((l) => !isDone(lessonState(t, l))).slice(0, n);

export function allHours(t) {
  const out = {};
  HOUR_KEYS.forEach((k) => (out[k] = r2((t.hours[k] || 0) + (t.prior?.hours?.[k] || 0))));
  return out;
}

export function allEndorsements(t) {
  const prior = (t.prior?.endorsements || []).map((e) => ({ ...e, prior: true, confirmed: t.prior.status === 'confirmed' }));
  return [...t.endorsements, ...prior];
}

export function upcomingEndorsements(t) {
  const have = new Set(allEndorsements(t).map((e) => e.name.split(' —')[0].replace(' (90-day)', '')));
  return t.upcomingEndorsements.filter((u) => !have.has(u.name));
}

export function hasPrior(t) {
  return !!t.prior && (HOUR_KEYS.some((k) => t.prior.hours[k] > 0) || Object.keys(t.prior.lessons).length > 0 || t.prior.endorsements.length > 0);
}
