// Solo-renter checks (src/renterChecks.js): the same rules the app shows and the server enforces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renterChecks, failing, profileGaps, flightReviewValidThrough, ymdIn } from '../src/renterChecks.js';

const plane = { tail: 'N123AB', soloRental: true, insuranceMinHours: 100, hobbsTotal: 0, next100At: 0 };
const pvt = { certificate: 'Private', medicalClass: '3rd class', medicalExpires: '2028-05-31', flightReviewDate: '2025-06-10', totalHours: 142.5 };
const ok = { status: 'approved', soloUntil: null };
const start = new Date('2026-11-10T15:00:00Z');
const keys = (cs) => failing(cs).map((c) => c.key);

test('server copy matches the app', () => {
  const app = fs.readFileSync(new URL('../src/renterChecks.js', import.meta.url), 'utf8');
  const fn = fs.readFileSync(new URL('../supabase/functions/_shared/renterChecks.js', import.meta.url), 'utf8');
  assert.equal(fn.replace(/^\/\/ GENERATED.*\n/, ''), app);
});

test('the same pilot gets the same answer on every plane', () => {
  // The bug: checks used a sample pilot checked out only in one sample plane.
  const noProfile = (p) => keys(renterChecks({ profile: null, checkout: ok, plane: p, start }));
  assert.deepEqual(noProfile(plane), ['profile']);
  assert.deepEqual(noProfile({ ...plane, tail: 'N999ZZ', insuranceMinHours: 0 }), ['profile']);
  const expired = { ...pvt, medicalExpires: '2026-10-31' };
  for (const p of [plane, { ...plane, tail: 'N999ZZ' }]) assert.ok(keys(renterChecks({ profile: expired, checkout: ok, plane: p, start })).includes('medical'));
});

test('a current private pilot, checked out, passes', () => {
  assert.deepEqual(keys(renterChecks({ profile: pvt, checkout: ok, plane, start })), []);
});

test('each requirement can fail on its own', () => {
  assert.deepEqual(keys(renterChecks({ profile: pvt, checkout: null, plane, start })), ['checkout']);
  assert.deepEqual(keys(renterChecks({ profile: pvt, checkout: { status: 'requested' }, plane, start })), ['checkout']);
  assert.equal(renterChecks({ profile: pvt, checkout: { status: 'requested' }, plane, start }).find((c) => c.key === 'checkout').fix, null); // waiting on owner
  assert.deepEqual(keys(renterChecks({ profile: { ...pvt, totalHours: 99 }, checkout: ok, plane, start })), ['insurance']);
  assert.deepEqual(keys(renterChecks({ profile: { ...pvt, flightReviewDate: '2024-10-15' }, checkout: ok, plane, start })), ['review']);
  assert.deepEqual(keys(renterChecks({ profile: pvt, checkout: ok, plane: { ...plane, soloRental: false }, start })), ['solo']);
  assert.deepEqual(keys(renterChecks({ profile: { ...pvt, medicalClass: 'Driver’s license (Sport only)' }, checkout: ok, plane, start })), ['medicalType']);
});

test('100-hr is only checked when the owner keeps the numbers', () => {
  assert.equal(renterChecks({ profile: pvt, checkout: ok, plane, start }).some((c) => c.key === '100hr'), false);
  const due = { ...plane, hobbsTotal: 4521.3, next100At: 4522.0 };
  assert.deepEqual(keys(renterChecks({ profile: pvt, checkout: ok, plane: due, flightHours: 1.5, start })), ['100hr']);
  assert.deepEqual(keys(renterChecks({ profile: pvt, checkout: ok, plane: { ...due, next100At: 4560 }, flightHours: 1.5, start })), []);
});

test('student pilots need a current solo endorsement from the checkout, not a flight review', () => {
  const stu = { certificate: 'Student', medicalClass: '3rd class', medicalExpires: '2028-05-31', flightReviewDate: null, totalHours: 120 };
  assert.deepEqual(profileGaps(stu), []);
  assert.deepEqual(keys(renterChecks({ profile: stu, checkout: { status: 'approved', soloUntil: '2026-12-01' }, plane, start })), []);
  assert.deepEqual(keys(renterChecks({ profile: stu, checkout: { status: 'approved', soloUntil: '2026-11-09' }, plane, start })), ['endorsement']);
  assert.deepEqual(keys(renterChecks({ profile: stu, checkout: { status: 'approved', soloUntil: null }, plane, start })), ['endorsement']);
});

test('flight review lasts 24 calendar months (61.56)', () => {
  assert.equal(flightReviewValidThrough('2025-06-10'), '2027-06-30');
  assert.equal(flightReviewValidThrough('2024-12-01'), '2026-12-31');
  assert.equal(flightReviewValidThrough('2025-02-28'), '2027-02-28');
  assert.equal(flightReviewValidThrough('nope'), null);
});

test('dates use the local calendar day of the flight', () => {
  assert.equal(ymdIn(new Date('2026-11-11T03:00:00Z'), 'America/New_York'), '2026-11-10');
});
