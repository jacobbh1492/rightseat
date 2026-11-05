// Squawks & airworthiness, pilot currency, preflight, matching and gift math.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aircraftChecks, annualValidThrough, blockingIssues } from '../src/aircraftStatus.js';
import { renterChecks, failing, passengerCurrentThrough } from '../src/renterChecks.js';
import { flightCategory, ceilingOf, parseMetar, weatherChecks, verdict, IMSAFE } from '../src/preflight.js';
import { matchCfis, scoreCfi } from '../src/matching.js';
import { giftUse, parseGift, giftCode, normalizeGiftCode } from '../supabase/functions/_shared/bookings.js';

const keys = (cs) => cs.map((c) => c.key);

test('aircraft status: server copy matches the app', () => {
  const app = fs.readFileSync(new URL('../src/aircraftStatus.js', import.meta.url), 'utf8');
  const fn = fs.readFileSync(new URL('../supabase/functions/_shared/aircraftStatus.js', import.meta.url), 'utf8');
  assert.equal(fn.replace(/^\/\/ GENERATED.*\n/, ''), app);
});

test('a grounding squawk blocks; others only warn; fixed ones disappear', () => {
  const plane = { tail: 'N1', hobbsTotal: 0, next100At: 0 };
  const sq = [
    { text: 'Left mag rough', grounding: true, status: 'open' },
    { text: 'Nav light', grounding: false, status: 'open' },
    { text: 'Old', grounding: true, status: 'fixed' },
  ];
  const c = aircraftChecks({ plane, squawks: sq, day: '2026-11-10' });
  assert.deepEqual(keys(blockingIssues(c)), ['grounding']);
  assert.match(c.find((x) => x.key === 'grounding').label, /Left mag/);
  assert.equal(c.find((x) => x.key === 'squawks').blocking, false);
  assert.deepEqual(keys(blockingIssues(aircraftChecks({ plane, squawks: [sq[1], sq[2]], day: '2026-11-10' }))), []);
});

test('annual runs through the end of the 12th calendar month', () => {
  assert.equal(annualValidThrough('2025-11-03'), '2026-11-30');
  assert.equal(annualValidThrough('2026-02-28'), '2027-02-28');
  assert.equal(annualValidThrough('bad'), null);
  const plane = { tail: 'N1', annualDate: '2025-10-15' };
  assert.deepEqual(keys(blockingIssues(aircraftChecks({ plane, day: '2026-11-01' }))), ['annual']);
  assert.deepEqual(keys(blockingIssues(aircraftChecks({ plane, day: '2026-10-31' }))), []);
});

test('100-hr: blocks a flight that would run past it', () => {
  const plane = { tail: 'N1', hobbsTotal: 1000, next100At: 1001 };
  assert.deepEqual(keys(blockingIssues(aircraftChecks({ plane, flightHours: 1.5, day: '2026-11-10' }))), ['100hr']);
  assert.equal(aircraftChecks({ plane, flightHours: 1.5, day: '2026-11-10', include100hr: false }).some((c) => c.key === '100hr'), false);
});

const pvt = { certificate: 'Private', medicalClass: '3rd class', medicalExpires: '2028-05-31', flightReviewDate: '2025-06-10', totalHours: 300 };
const ok = { status: 'approved' };
const start = new Date('2026-11-10T15:00:00Z');

test('owner recency rule blocks only when the owner sets it', () => {
  const plane = { tail: 'N1', soloRental: true };
  assert.deepEqual(keys(failing(renterChecks({ profile: pvt, checkout: ok, plane, start }))), []);
  const strict = { ...plane, recentFlightDays: 60 };
  assert.deepEqual(keys(failing(renterChecks({ profile: pvt, checkout: ok, plane: strict, start }))), ['recent']);
  assert.deepEqual(keys(failing(renterChecks({ profile: { ...pvt, lastFlightDate: '2026-09-15' }, checkout: ok, plane: strict, start }))), []);
  assert.deepEqual(keys(failing(renterChecks({ profile: { ...pvt, lastFlightDate: '2026-09-01' }, checkout: ok, plane: strict, start }))), ['recent']);
});

test('passenger currency (61.57) is a heads-up, never a block', () => {
  assert.equal(passengerCurrentThrough('2026-09-01'), '2026-11-30');
  const plane = { tail: 'N1', soloRental: true };
  const c = renterChecks({ profile: { ...pvt, dayLandingsDate: '2026-10-01' }, checkout: ok, plane, start });
  assert.equal(c.find((x) => x.key === 'dayCurrency').ok, true);
  assert.equal(c.find((x) => x.key === 'nightCurrency').ok, false);
  assert.equal(c.find((x) => x.key === 'nightCurrency').blocking, false);
  const stale = renterChecks({ profile: { ...pvt, dayLandingsDate: '2026-07-01' }, checkout: ok, plane, start });
  assert.equal(stale.find((x) => x.key === 'dayCurrency').ok, false);
  assert.deepEqual(keys(failing(stale)), []);
  // Student pilots can't carry passengers at all: no currency rows.
  const st = renterChecks({ profile: { ...pvt, certificate: 'Student' }, checkout: { status: 'approved', soloUntil: '2026-12-01' }, plane, start });
  assert.equal(st.some((x) => x.key === 'dayCurrency'), false);
});

test('flight categories', () => {
  assert.equal(flightCategory(null, 10), 'VFR');
  assert.equal(flightCategory(3000, 10), 'MVFR');
  assert.equal(flightCategory(3100, 5), 'MVFR');
  assert.equal(flightCategory(900, 10), 'IFR');
  assert.equal(flightCategory(5000, 0.5), 'LIFR');
  assert.equal(ceilingOf([{ cover: 'SCT', base: 1500 }, { cover: 'BKN', base: 2500 }, { cover: 'OVC', base: 4000 }]), 2500);
  assert.equal(ceilingOf([{ cover: 'FEW', base: 800 }]), null);
});

test('METAR parsing and weather heads-ups', () => {
  const m = parseMetar({ icaoId: 'KPIE', rawOb: 'METAR KPIE 042053Z 26018G28KT 10SM SCT040 BKN250 24/12 A3002', obsTime: 1762289580, wdir: 260, wspd: 18, wgst: 28, visib: '10+', altim: 1016.6, temp: 24, dewp: 12, clouds: [{ cover: 'SCT', base: 4000 }, { cover: 'BKN', base: 25000 }], fltCat: 'VFR' });
  assert.equal(m.category, 'VFR');
  assert.equal(m.ceiling, 25000);
  assert.equal(m.altimeterInHg, 30.02);
  const solo = weatherChecks(m, { solo: true, now: new Date(1762289580 * 1000) });
  assert.equal(solo.find((c) => c.key === 'wind').ok, false);
  assert.ok(solo.every((c) => !c.blocking));
  assert.equal(weatherChecks(null)[0].ok, false);
  const ts = parseMetar({ icaoId: 'KPIE', rawOb: 'KPIE 042053Z 09010KT 5SM TSRA SCT030CB 28/24 A2990', wspd: 10, visib: 5, clouds: [], fltCat: 'MVFR', wxString: 'TSRA' });
  assert.ok(weatherChecks(ts).some((c) => c.key === 'ts'));
});

test('verdict: blockers are no-go, open questions are caution', () => {
  const allSafe = Object.fromEntries(IMSAFE.map((i) => [i.key, true]));
  assert.equal(verdict([{ ok: true, blocking: true }], allSafe), 'go');
  assert.equal(verdict([{ ok: true, blocking: true }], {}), 'caution');
  assert.equal(verdict([{ ok: false, blocking: false }], allSafe), 'caution');
  assert.equal(verdict([{ ok: false, blocking: true }], allSafe), 'no-go');
  assert.equal(verdict([], { ...allSafe, fatigue: false }), 'no-go');
});

test('matching: needs the right certificate, prefers the right airport and budget', () => {
  const base = { certs: ['CFI'], specialties: ['Private Pilot'], homeAirport: 'KPIE', availability: ['Sat'], timeOfDay: ['Daytime'], flightRate: 70, aircraftIds: ['p'], reviewCount: 0, rating: 0, published: true };
  const planes = [{ id: 'p', wetRate: 150, make: 'Cessna', model: '172', avionics: ['Garmin G1000'], category: 'Single' }];
  assert.equal(scoreCfi(base, planes, { goal: 'Instrument' }), null);
  assert.ok(scoreCfi({ ...base, certs: ['CFI', 'CFII'] }, planes, { goal: 'Instrument' }));
  assert.equal(scoreCfi(base, planes, { goal: 'Tailwheel' }), null);
  const near = { ...base, id: 'a' }, far = { ...base, id: 'b', homeAirport: 'KLAL' };
  const ranked = matchCfis({ cfis: [far, near], planes, request: { goal: 'Private Pilot', airport: 'KPIE', days: ['Sat'], maxRate: 250, glass: true } });
  assert.deepEqual(ranked.map((m) => m.cfi.id), ['a', 'b']);
  assert.equal(ranked[0].combinedRate, 220);
  assert.ok(ranked[0].reasons.some((r) => /KPIE/.test(r)));
  assert.ok(ranked[1].concerns.some((r) => /KLAL/.test(r)));
  // Live instructors who aren't verified can't be booked, so they aren't matched.
  assert.equal(matchCfis({ cfis: [{ ...near, live: true, verified: false }], planes, request: { goal: 'Private Pilot' } }).length, 0);
});

test('gift covers what it can; the card pays the rest (min $0.50)', () => {
  assert.deepEqual(giftUse(180, 200), { gift: 180, card: 0 });
  assert.deepEqual(giftUse(250, 200), { gift: 200, card: 50 });
  assert.deepEqual(giftUse(200.2, 200), { gift: 199.7, card: 0.5 });
  assert.deepEqual(giftUse(100, 0), { gift: 0, card: 100 });
  assert.deepEqual(giftUse(0.3, 0), { gift: 0, card: 0.3 });
});

test('gift input and codes', () => {
  assert.throws(() => parseGift({ amount: 10, recipientName: 'A' }), /from \$50/);
  assert.throws(() => parseGift({ amount: 200 }), /Who/);
  assert.throws(() => parseGift({ amount: 200, recipientName: 'Sam', recipientEmail: 'nope' }), /email/);
  const g = parseGift({ amount: '199.999', recipientName: '  Sam  Lee ', recipientEmail: 'SAM@x.com', message: 'Happy birthday!' });
  assert.equal(g.amount, 200);
  assert.equal(g.recipientName, 'Sam Lee');
  assert.equal(g.recipientEmail, 'sam@x.com');
  const code = giftCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
  assert.match(code, /^RS-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(normalizeGiftCode(code.toLowerCase().replace(/-/g, ' ')), code);
  assert.equal(normalizeGiftCode('RS-123'), null);
});
