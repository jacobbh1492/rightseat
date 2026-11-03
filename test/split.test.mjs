// Debrief-gated pay and shared solo rentals: the money math and rules the server uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDebrief, parseSplit, splitHoldUntil, splitShares, partnerSettlement, allocateToCharges, assertTransition, roleIn, priceBooking, finalPrice, DEBRIEF_PARTIES } from '../supabase/functions/_shared/bookings.js';

const NOW = new Date('2026-11-02T12:00:00Z');
const at = (h) => new Date(NOW.getTime() + h * 3600e3);
const cents = (n) => Math.round(n * 100);

test('a debrief needs all three parts', () => {
  assert.equal(parseDebrief({ wentWell: 'a', needsWork: 'b', nextPlan: 'c' }).complete, true);
  assert.equal(parseDebrief({ wentWell: 'a', needsWork: '  ', nextPlan: 'c' }).complete, false);
  assert.equal(parseDebrief(null).complete, false);
  assert.equal(parseDebrief({ wentWell: 'x'.repeat(5000), needsWork: 'b', nextPlan: 'c' }).wentWell.length, 2000);
});

test('only the instructor writes the debrief, after the lesson', () => {
  const b = { status: 'completed', cfi_id: 'c', student_id: 's', starts_at: at(-3).toISOString() };
  assert.doesNotThrow(() => assertTransition('debrief', b, 'cfi'));
  assert.throws(() => assertTransition('debrief', b, 'student'), /can’t do that/);
  assert.throws(() => assertTransition('debrief', { ...b, status: 'confirmed' }, 'cfi'), /already confirmed/);
  assert.deepEqual(DEBRIEF_PARTIES, ['cfi', 'school']); // plane rental is never held for a debrief
});

test('split invite rules', () => {
  assert.equal(parseSplit(null), null);
  assert.deepEqual(parseSplit({ email: ' Ben@Example.com ', bookerPct: 60 }), { email: 'ben@example.com', bookerPct: 60 });
  assert.throws(() => parseSplit({ email: 'ben@example.com', bookerPct: 45 }), /50–90%/);
  assert.throws(() => parseSplit({ email: 'ben@example.com', bookerPct: 95 }), /50–90%/);
  assert.throws(() => parseSplit({ email: 'ben@example.com', bookerPct: 62 }), /steps of 5/);
  assert.throws(() => parseSplit({ email: 'nope', bookerPct: 50 }), /email/);
  assert.throws(() => parseSplit({ email: 'ben@example.com', bookerPct: 50 }, { cfiId: 'c' }), /solo rentals/);
});

test('invite holds the plane 24 h, never past 2 h before the flight', () => {
  assert.equal(+splitHoldUntil(at(72), NOW), +at(24));
  assert.equal(+splitHoldUntil(at(10), NOW), +at(8));
  assert.throws(() => splitHoldUntil(at(2.1), NOW), /too soon/);
});

test('shares always add up to the total, to the cent', () => {
  for (const total of [0.01, 99.99, 312.47, 1000, 487.13]) {
    for (let pct = 50; pct <= 90; pct += 5) {
      const s = splitShares(total, pct);
      assert.equal(cents(s.booker) + cents(s.partner), cents(total), `${total} @ ${pct}`);
      assert.ok(s.booker >= s.partner);
    }
  }
  assert.deepEqual(splitShares(312.47, 65), { booker: 203.11, partner: 109.36 });
});

test('close-out settles the partner against their deposit', () => {
  const plane = { id: 'p', wet_rate: 165, details: {} };
  const est = priceBooking({ cfi: null, plane, affiliation: null, flightHours: 2, groundHours: 0, repeat: false, prepaid: false });
  const deposit = splitShares(est.total, 60).partner;
  const longer = finalPrice(est, { flightHours: 2.4, groundHours: 0 });
  const shorter = finalPrice(est, { flightHours: 1.6, groundHours: 0 });
  assert.ok(partnerSettlement(splitShares(longer.total, 60).partner, deposit) > 0);  // charge the difference
  assert.ok(partnerSettlement(splitShares(shorter.total, 60).partner, deposit) < 0); // refund the difference
  assert.equal(partnerSettlement(deposit, deposit), 0);
  // What both pay equals what the flight cost.
  const s = splitShares(longer.total, 60);
  assert.equal(cents(s.booker) + cents(deposit) + cents(partnerSettlement(s.partner, deposit)), cents(longer.total));
});

test('payouts spread across the charges they came from', () => {
  const out = allocateToCharges([{ party: 'owner', amount: 300 }], [{ id: 'ch_b', amount: 200.5 }, { id: 'ch_p', amount: 120 }]);
  assert.deepEqual(out, [{ party: 'owner', amount: 200.5, chargeId: 'ch_b' }, { party: 'owner', amount: 99.5, chargeId: 'ch_p' }]);
  const two = allocateToCharges([{ party: 'cfi', amount: 50 }, { party: 'owner', amount: 60 }], [{ id: 'a', amount: 70 }, { id: 'b', amount: 40 }]);
  assert.equal(two.reduce((a, x) => a + cents(x.amount), 0), 11000);
  assert.ok(two.every((x) => x.amount > 0));
  assert.throws(() => allocateToCharges([{ party: 'owner', amount: 100.01 }], [{ id: 'a', amount: 100 }]), /larger/);
});

test('the other pilot has their own role on the booking', () => {
  const b = { student_id: 's', cfi_id: null, plane_id: 'p' };
  assert.equal(roleIn(b, 'b2', { planeOwnerId: 'o', partnerId: 'b2' }), 'partner');
  assert.equal(roleIn(b, 's', { planeOwnerId: 'o', partnerId: 'b2' }), 'student');
  assert.equal(roleIn(b, 'b2', { planeOwnerId: 'o' }), null);
  assert.throws(() => assertTransition('confirm', { ...b, status: 'requested' }, 'partner'), /can’t do that/);
  assert.throws(() => assertTransition('cancel', { ...b, status: 'confirmed' }, 'partner'), /can’t do that/);
});
