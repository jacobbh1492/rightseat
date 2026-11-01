// Server booking rules + guard that the functions' pricing copy matches the app's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseBookingRequest, quoteInputs, priceBooking, finalPrice, assertTransition, roleIn, cancellationFee, payoutPlan, validateActuals } from '../supabase/functions/_shared/bookings.js';

const NOW = new Date('2026-11-02T12:00:00Z');
const at = (h) => new Date(NOW.getTime() + h * 3600000).toISOString();
const cfi = { id: 'c', flight_rate: 75, ground_rate: 55, pro: false };
const plane = { id: 'p', wet_rate: 165, details: { blockRate: 155 } };

test('pricing copy in functions matches the app', () => {
  const app = fs.readFileSync(new URL('../src/pricing.js', import.meta.url), 'utf8');
  const fn = fs.readFileSync(new URL('../supabase/functions/_shared/pricing.js', import.meta.url), 'utf8');
  assert.equal(fn.split('\n').slice(1).join('\n'), app, 'run: node scripts/sync-shared.js');
});

test('booking request validation', () => {
  const ok = parseBookingRequest({ cfiId: 'c', planeId: 'p', startsAt: at(48), flightHours: 1.5, groundHours: 0.5, goal: 'PPL' }, NOW);
  assert.equal((ok.endsAt - ok.startsAt) / 60000, 150); // 2h + 30 min turnaround
  for (const [body, msg] of [
    [{ startsAt: at(48), flightHours: 1, goal: 'x' }, /Choose/],
    [{ cfiId: 'c', startsAt: at(48), flightHours: 0, goal: 'x' }, /Flight time/],
    [{ cfiId: 'c', startsAt: at(0.5), flightHours: 1, goal: 'x' }, /1 hour ahead/],
    [{ planeId: 'p', startsAt: at(48), flightHours: 1, groundHours: 1, goal: 'x' }, /Ground instruction needs/],
    [{ cfiId: 'c', startsAt: at(48), flightHours: 1, goal: ' ' }, /what the lesson/],
    [{ cfiId: 'c', startsAt: at(24 * 200), flightHours: 1, goal: 'x' }, /6 months/],
  ]) assert.throws(() => parseBookingRequest(body, NOW), msg);
});

test('server price = app price; employee rate overrides CFI rate', () => {
  const q = priceBooking({ cfi, plane, affiliation: null, flightHours: 1.5, groundHours: 0.5, repeat: false });
  assert.equal(q.instruction, 112.5); assert.equal(q.aircraft, 247.5);
  assert.equal(q.total, Math.round((112.5 + 27.5 + 247.5 + (112.5 + 27.5 + 247.5) * 0.06) * 100) / 100);
  const emp = quoteInputs({ cfi, plane, affiliation: { model: 'employee', set_rate: 60, school_pct: 0.4 } });
  assert.equal(emp.cfi.flightRate, 60); assert.equal(emp.affiliation.schoolPct, 0.4);
  const split = priceBooking({ cfi, plane, affiliation: { model: 'split', school_pct: 0.3 }, flightHours: 1, groundHours: 0, repeat: true }).split;
  assert.equal(split.school, 22.5); assert.equal(split.cfi, 52.5);
});

test('close-out re-prices with actual Hobbs but frozen rates', () => {
  const booked = priceBooking({ cfi, plane, affiliation: null, flightHours: 1.5, groundHours: 0, repeat: true });
  const fin = finalPrice(booked, { flightHours: 1.8, groundHours: 0 });
  assert.equal(fin.instruction, 135); assert.equal(fin.aircraft, 297); assert.equal(fin.bookingFee, 0);
  assert.throws(() => validateActuals({ flightHours: 0 }, {}), /Hobbs/);
  assert.deepEqual(validateActuals({ flightHours: 1.84 }, { ground_hours: 0.5 }), { flightHours: 1.8, groundHours: 0.5 });
});

test('who can do what', () => {
  const b = { student_id: 's', cfi_id: 'c', plane_id: 'p', status: 'requested', starts_at: at(48) };
  assert.equal(roleIn(b, 'x', { planeOwnerId: 'o' }), null);
  assert.throws(() => assertTransition('confirm', b, null), /isn’t your booking/);
  assert.throws(() => assertTransition('confirm', b, 'student'), /can’t do that/);
  assert.throws(() => assertTransition('confirm', b, 'owner'), /can’t do that/); // dual lesson: CFI approves
  assert.doesNotThrow(() => assertTransition('confirm', b, 'cfi'));
  const solo = { ...b, cfi_id: null };
  assert.doesNotThrow(() => assertTransition('confirm', solo, 'owner'));
  assert.throws(() => assertTransition('complete', { ...b, status: 'confirmed' }, 'cfi'), /once it has started/);
  assert.doesNotThrow(() => assertTransition('complete', { ...b, status: 'confirmed', starts_at: new Date(Date.now() - 3600000).toISOString() }, 'cfi'));
  assert.throws(() => assertTransition('cancel', { ...b, status: 'completed' }, 'student'), /already completed/);
});

test('late cancellation: only students, only confirmed, only inside 24 h', () => {
  const b = { student_id: 's', cfi_id: 'c', status: 'confirmed', starts_at: at(10), quote: { instruction: 112.5, ground: 27.5 } };
  assert.equal(cancellationFee(b, 'student', NOW), 70);
  assert.equal(cancellationFee({ ...b, starts_at: at(30) }, 'student', NOW), 0);
  assert.equal(cancellationFee(b, 'cfi', NOW), 0);
  assert.equal(cancellationFee({ ...b, status: 'requested' }, 'student', NOW), 0);
  assert.equal(cancellationFee({ ...b, cfi_id: null }, 'student', NOW), 0);
});

test('payout plan holds money for anyone without payouts set up', () => {
  const p = payoutPlan({ cfi: 52.5, owner: 151.8, school: 22.5 }, { cfiAccount: 'acct_c', ownerAccount: null, schoolAccount: 'acct_s' });
  assert.deepEqual(p.transfers.map((t) => [t.party, t.cents]), [['cfi', 5250], ['school', 2250]]);
  assert.deepEqual(p.held.map((h) => h.party), ['owner']);
  assert.equal(payoutPlan({ cfi: 10, owner: 0, school: 0 }, {}).held.length, 1);
});
