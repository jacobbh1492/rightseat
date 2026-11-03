// Lessons an instructor books for a student: who can do what, and the accept deadline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTransition, proposalExpires, parseProposal } from '../supabase/functions/_shared/bookings.js';

const NOW = new Date('2026-11-03T12:00:00Z');
const at = (h) => new Date(NOW.getTime() + h * 3600e3);
const b = { status: 'proposed', cfi_id: 'c', student_id: 's', starts_at: at(48).toISOString() };

test('the student accepts or declines; either side can call it off; nobody else', () => {
  assert.doesNotThrow(() => assertTransition('accept', b, 'student'));
  assert.doesNotThrow(() => assertTransition('reject', b, 'student'));
  assert.doesNotThrow(() => assertTransition('cancel', b, 'cfi'));     // instructor withdraws
  assert.doesNotThrow(() => assertTransition('cancel', b, 'student'));
  assert.throws(() => assertTransition('accept', b, 'cfi'), /can’t do that/);
  assert.throws(() => assertTransition('confirm', b, 'cfi'), /already proposed/); // no second approval step
  assert.throws(() => assertTransition('accept', { ...b, status: 'confirmed' }, 'student'), /already confirmed/);
  assert.throws(() => assertTransition('complete', b, 'cfi'), /already proposed/);
});

test('24 hours to accept, but never later than 2 hours before the lesson', () => {
  assert.equal(+proposalExpires(at(72), NOW), +at(24));
  assert.equal(+proposalExpires(at(6), NOW), +at(4));
  assert.throws(() => proposalExpires(at(2.2), NOW), /at least 3 hours ahead/);
});

test('a proposal needs a student and the usual lesson details', () => {
  const ok = parseProposal({ studentId: '11111111-1111-4111-8111-111111111111', startsAt: at(30).toISOString(), flightHours: 1.5, groundHours: 0.5, goal: 'Steep turns' }, NOW);
  assert.equal(ok.studentId, '11111111-1111-4111-8111-111111111111');
  assert.equal(ok.groundHours, 0.5);
  assert.throws(() => parseProposal({ startsAt: at(30).toISOString(), flightHours: 1, goal: 'x' }, NOW), /Pick a student/);
  assert.throws(() => parseProposal({ studentId: '11111111-1111-4111-8111-111111111111', startsAt: at(30).toISOString(), flightHours: 1, goal: '' }, NOW), /what the lesson is for/);
});
