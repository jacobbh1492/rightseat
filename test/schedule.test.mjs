// Scheduling rules (src/schedule.js): time zones, open start times, and the server's check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeSchedule, openSlots, checkBooking, zonedTime, zonedParts, cleanRanges, workingDays,
  addDays, minutesLabel, DEFAULT_SCHEDULE,
} from '../src/schedule.js';

const TZ = 'America/New_York';
const sched = (over = {}) => normalizeSchedule({ ...DEFAULT_SCHEDULE, timezone: TZ, ...over });
const NOW = new Date('2026-11-02T12:00:00Z'); // Mon Nov 2, 7:00 AM Eastern

test('server copy matches the app', () => {
  const app = fs.readFileSync(new URL('../src/schedule.js', import.meta.url), 'utf8');
  const fn = fs.readFileSync(new URL('../supabase/functions/_shared/schedule.js', import.meta.url), 'utf8');
  assert.equal(fn.split('\n').slice(1).join('\n'), app, 'run: node scripts/sync-shared.js');
});

test('wall clock to instant, including daylight-saving changes', () => {
  assert.equal(zonedTime(2026, 11, 2, 8 * 60, TZ).toISOString(), '2026-11-02T13:00:00.000Z'); // EST
  assert.equal(zonedTime(2026, 10, 30, 8 * 60, TZ).toISOString(), '2026-10-30T12:00:00.000Z'); // EDT
  assert.equal(zonedTime(2027, 3, 14, 10 * 60, TZ).toISOString(), '2027-03-14T14:00:00.000Z'); // spring forward day
  const p = zonedParts(new Date('2026-11-02T13:30:00Z'), TZ);
  assert.deepEqual([p.y, p.m, p.d, p.minutes, p.dow], [2026, 11, 2, 510, 1]);
  assert.equal(zonedTime(2026, 11, 2, 8 * 60, 'America/Los_Angeles').toISOString(), '2026-11-02T16:00:00.000Z');
});

test('ranges are cleaned: snapped, sorted, merged, too-short dropped', () => {
  assert.deepEqual(cleanRanges([[780, 1080], [480, 720], [700, 800], [100, 110], [-60, 10], [1400, 1500]]), [[480, 1080]]);
  assert.deepEqual(cleanRanges([[481, 719]]), [[480, 720]]);
  assert.deepEqual(cleanRanges('nope'), []);
});

test('legacy working days become 8–6 until hours are saved; bad settings fall back', () => {
  const s = normalizeSchedule(null, ['Sat', 'Sun']);
  assert.deepEqual(workingDays(s), ['Sun', 'Sat']);
  assert.deepEqual(s.weekly.sat, [[480, 1080]]);
  const bad = normalizeSchedule({ timezone: 'Mars/Base', bufferMin: 7, incrementMin: 5, minNoticeHours: 0, maxDaysAhead: 999 });
  assert.equal(bad.timezone, TZ);
  assert.deepEqual([bad.bufferMin, bad.incrementMin, bad.minNoticeHours, bad.maxDaysAhead], [30, 30, 2, 60]);
});

test('open slots: within hours, lesson must fit, notice and buffer respected', () => {
  const s = sched({ weekly: { mon: [[480, 720], [780, 1080]] }, minNoticeHours: 2, bufferMin: 30, incrementMin: 30 });
  const day = { y: 2026, m: 11, d: 2 };
  const slots = openSlots({ schedule: s, date: day, durationMin: 120, busy: [], now: NOW }).map((d) => minutesLabel(zonedParts(d, TZ).minutes));
  // Now is 7 AM; 2 h notice → 9:00 earliest. A 2-hour lesson must end by 12:00 / 6:00 PM.
  assert.deepEqual(slots, ['9:00 AM', '9:30 AM', '10:00 AM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM', '4:00 PM']);
  // A lesson 2:00–3:30 PM (busy until 4:00 with its buffer) blocks starts whose lesson+buffer overlaps it.
  const busy = [{ start: zonedTime(2026, 11, 2, 14 * 60, TZ), end: zonedTime(2026, 11, 2, 16 * 60, TZ) }];
  const around = openSlots({ schedule: s, date: day, durationMin: 60, busy, now: NOW }).map((d) => minutesLabel(zonedParts(d, TZ).minutes));
  assert.ok(!around.includes('12:30 PM'), 'lunch break is not working time');
  assert.ok(!around.includes('1:00 PM'), '1:00–2:00 plus its 30 min buffer runs into the 2:00 lesson');
  assert.ok(!around.includes('3:30 PM'), 'still busy until 4:00');
  assert.ok(around.includes('4:00 PM'));
  assert.ok(around.includes('11:00 AM'), 'ends at noon; buffer may run past working hours');
});

test('buffer after the new lesson must be clear of the next busy time', () => {
  const s = sched({ weekly: { tue: [[480, 1080]] }, bufferMin: 30, incrementMin: 30, minNoticeHours: 1 });
  const day = { y: 2026, m: 11, d: 3 };
  const busy = [{ start: zonedTime(2026, 11, 3, 11 * 60, TZ), end: zonedTime(2026, 11, 3, 12 * 60, TZ) }];
  const labels = openSlots({ schedule: s, date: day, durationMin: 60, busy, now: NOW }).map((d) => minutesLabel(zonedParts(d, TZ).minutes));
  assert.ok(labels.includes('9:30 AM'));       // 9:30–10:30, buffer to 11:00 → ok
  assert.ok(!labels.includes('10:00 AM'));     // buffer runs into 11:00
  assert.ok(!labels.includes('11:30 AM'));
  assert.ok(labels.includes('12:00 PM'));
});

test('days off, booking window and time off', () => {
  const s = sched({ maxDaysAhead: 14 });
  assert.equal(openSlots({ schedule: s, date: { y: 2026, m: 11, d: 7 }, durationMin: 60, busy: [], now: NOW }).length, 0, 'Saturday off');
  assert.equal(openSlots({ schedule: s, date: addDays({ y: 2026, m: 11, d: 2 }, 21), durationMin: 60, busy: [], now: NOW }).length, 0, 'past window');
  const allDay = [{ start: zonedTime(2026, 11, 4, 0, TZ), end: zonedTime(2026, 11, 5, 0, TZ) }];
  assert.equal(openSlots({ schedule: s, date: { y: 2026, m: 11, d: 4 }, durationMin: 60, busy: allDay, now: NOW }).length, 0, 'time off');
});

test('server check matches the slots', () => {
  const s = sched({ weekly: { mon: [[480, 720]] }, minNoticeHours: 2 });
  const at = (h) => zonedTime(2026, 11, 2, h * 60, TZ);
  assert.equal(checkBooking({ schedule: s, start: at(10), durationMin: 90, busy: [], now: NOW }), null);
  assert.match(checkBooking({ schedule: s, start: at(8), durationMin: 60, busy: [], now: NOW }), /notice/);
  assert.match(checkBooking({ schedule: s, start: at(11), durationMin: 90, busy: [], now: NOW }), /working hours/);
  assert.match(checkBooking({ schedule: s, start: at(13), durationMin: 60, busy: [], now: NOW }), /working hours/);
  assert.match(checkBooking({ schedule: s, start: at(10), durationMin: 60, busy: [{ start: at(11), end: at(12) }], now: NOW }), /isn’t available/);
  assert.match(checkBooking({ schedule: s, start: zonedTime(2027, 3, 1, 600, TZ), durationMin: 60, busy: [], now: NOW }), /days ahead/);
});
