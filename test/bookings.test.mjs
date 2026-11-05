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
  assert.equal(q.total, Math.round((112.5 + 27.5 + 247.5 + 10) * 100) / 100); // flat $10 booking fee
  const emp = quoteInputs({ cfi, plane, affiliation: { model: 'employee', set_rate: 60, school_pct: 0.4 } });
  assert.equal(emp.cfi.flightRate, 60); assert.equal(emp.affiliation.schoolPct, 0.4);
  const split = priceBooking({ cfi, plane, affiliation: { model: 'split', school_pct: 0.3 }, flightHours: 1, groundHours: 0, repeat: true }).split;
  assert.equal(split.school, 22.5); assert.equal(split.cfi, 52.5);
});

test('close-out re-prices with actual Hobbs but frozen rates', () => {
  const booked = priceBooking({ cfi, plane, affiliation: null, flightHours: 1.5, groundHours: 0, repeat: true });
  const fin = finalPrice(booked, { flightHours: 1.8, groundHours: 0 });
  assert.equal(fin.instruction, 135); assert.equal(fin.aircraft, 297); assert.equal(fin.bookingFee, 10); // repeat lessons still pay the fee
  assert.throws(() => validateActuals({ flightHours: 0 }, {}), /Hobbs/);
  assert.deepEqual(validateActuals({ flightHours: 1.84 }, { ground_hours: 0.5 }), { flightHours: 1.8, groundHours: 0.5 });
});

test('booking fee: $10 on every booking, $5 with School Pro, $0 with Short Final (frozen at booking)', () => {
  const first = priceBooking({ cfi, plane, affiliation: null, flightHours: 1, groundHours: 0, repeat: false });
  const again = priceBooking({ cfi, plane, affiliation: null, flightHours: 1, groundHours: 0, repeat: true });
  const solo = priceBooking({ cfi: null, plane, affiliation: null, flightHours: 1, groundHours: 0, repeat: true });
  assert.equal(first.bookingFee, 10); assert.equal(again.bookingFee, 10); assert.equal(solo.bookingFee, 10);
  assert.equal(first.split.cfiFee, 3.75); assert.equal(again.split.cfiFee, 0); // CFI's new-student fee still only on the first lesson
  const pro = priceBooking({ cfi, plane, affiliation: null, flightHours: 1, groundHours: 0, repeat: true, schoolPro: true });
  assert.equal(pro.bookingFee, 5); assert.equal(pro.total, 75 + 165 + 5);
  const free = priceBooking({ cfi, plane, affiliation: null, flightHours: 1, groundHours: 0, repeat: true, schoolPro: true, feeFree: true });
  assert.equal(free.bookingFee, 0); assert.equal(free.waivedFee, 5); assert.equal(free.total, 75 + 165);
  // the promo in force at booking decides the close-out, even if it has ended by then
  assert.equal(finalPrice(free, { flightHours: 1.3, groundHours: 0 }).bookingFee, 0);
  assert.equal(finalPrice(pro, { flightHours: 1.3, groundHours: 0 }).bookingFee, 5);
});

test('promo codes: spelling-insensitive, three launch codes, windows stack', async () => {
  const { normalizePromo, promoFor, promoEnds, isActive, PROMOS } = await import('../src/promos.js');
  assert.equal(normalizePromo(' Hold Short '), 'holdshort'); assert.equal(normalizePromo('SHORT-FINAL'), 'shortfinal');
  assert.equal(promoFor('Runup').kind, 'cfi_pro'); assert.equal(promoFor('runup').months, 12);
  assert.equal(promoFor('hold short').kind, 'school_pro'); assert.equal(promoFor('Hold Short').months, 12);
  assert.equal(promoFor('Short Final').kind, 'fee_free'); assert.equal(promoFor('Short Final').months, 3);
  assert.equal(promoFor('Go Around'), null);
  assert.equal(Object.keys(PROMOS).length, 3);
  assert.equal(promoEnds(3, new Date('2026-11-03T00:00:00Z')).toISOString(), '2027-02-03T00:00:00.000Z');
  assert.equal(promoEnds(12, new Date('2026-11-03T00:00:00Z'), '2027-01-01T00:00:00Z').toISOString(), '2028-01-01T00:00:00.000Z');
  assert.ok(isActive('2027-01-01', new Date('2026-12-31'))); assert.ok(!isActive('2026-12-01', new Date('2026-12-31'))); assert.ok(!isActive(null));
  const fn = fs.readFileSync(new URL('../supabase/functions/_shared/promos.js', import.meta.url), 'utf8');
  assert.equal(fn.split('\n').slice(1).join('\n'), fs.readFileSync(new URL('../src/promos.js', import.meta.url), 'utf8'), 'run: node scripts/sync-shared.js');
  // the migration seeds the same codes the app knows about
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261108000000_flat_fee_promos.sql', import.meta.url), 'utf8');
  for (const [code, p] of Object.entries(PROMOS)) assert.match(sql, new RegExp(`'${code}',\\s+'${p.label}',\\s+'${p.kind}',\\s+${p.months}\\)`));
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
  // (relative to the real clock: the rule compares with Date.now())
  assert.throws(() => assertTransition('complete', { ...b, status: 'confirmed', starts_at: new Date(Date.now() + 48 * 3600000).toISOString() }, 'cfi'), /once it has started/);
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
