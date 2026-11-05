// Reading Flight Schedule Pro exports for a school switching to Positive Rate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, matchColumns, readImport, parseWhen, roleOf, cleanTail } from '../src/fspImport.js';

const NOW = '2026-11-05T12:00:00Z';
const TZ = 'America/New_York';

test('CSV: quotes, commas and line breaks inside fields, BOM, tabs', () => {
  assert.deepEqual(parseCsv('﻿Name,Notes\r\n"Doe, Jane","said ""hi""\nthen left"\r\n'), [['Name', 'Notes'], ['Doe, Jane', 'said "hi"\nthen left']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a;b\n1;2\n\n'), [['a', 'b'], ['1', '2']]);
});

test('columns match FSP-style headers regardless of case and punctuation', () => {
  const { map, unmatched } = matchColumns(['First Name', 'Last Name', 'E-mail Address', 'User Type', 'Favorite Color'], 'people');
  assert.equal(map.firstName, 0); assert.equal(map.lastName, 1); assert.equal(map.email, 2); assert.equal(map.role, 3);
  assert.deepEqual(unmatched, ['Favorite Color']);
});

test('people: roles, bad emails, staff and duplicates are explained', () => {
  const csv = `First Name,Last Name,Email,Role,Phone
Jake,Miller,JAKE@example.com,Instructor,727-555-0101
Maya,Torres,maya@example.com,Student,
Pat,Desk,pat@example.com,Administrator,
No,Email,,Student,
Maya,Again,maya@example.com,Renter,`;
  const r = readImport('people', csv);
  assert.deepEqual(r.rows.map((x) => [x.name, x.email, x.role]), [['Jake Miller', 'jake@example.com', 'cfi'], ['Maya Torres', 'maya@example.com', 'student']]);
  assert.equal(r.skipped.length, 3);
  assert.match(r.skipped.map((s) => s.why).join(' '), /staff.*no valid email.*twice/s);
});

test('roles', () => {
  assert.equal(roleOf('CFII'), 'cfi'); assert.equal(roleOf('Flight Instructor'), 'cfi');
  assert.equal(roleOf('Renter'), 'student'); assert.equal(roleOf(''), 'student');
  assert.equal(roleOf('Dispatcher'), 'staff');
});

test('a file missing required columns says which', () => {
  assert.deepEqual(readImport('people', 'Name,Phone\nA,1').missing, ['Email']);
  assert.deepEqual(readImport('reservations', 'Aircraft\nN1').missing, ['Start or Date', 'Student or Student email']);
});

test('aircraft: tails, split make/model, rates, default rate', () => {
  const csv = `Tail Number,Aircraft Type,Year,Rental Rate,Hobbs,Location
172SP,Cessna 172S,2006,$165.00,"5,012.3",KPIE (St. Pete)
N8812Q,Piper PA-28-181,1979,,4100,KPIE
N8812Q,Piper PA-28-181,1979,150,4100,KPIE
,Cessna 152,1980,120,,`;
  const r = readImport('aircraft', csv, { now: NOW });
  assert.deepEqual(r.rows.map((x) => [x.line, x.tail]), [[2, 'N172SP'], [4, 'N8812Q']]);
  assert.deepEqual([r.rows[0].tail, r.rows[0].make, r.rows[0].model, r.rows[0].rate, r.rows[0].hobbs, r.rows[0].airport], ['N172SP', 'Cessna', '172S', 165, 5012.3, 'KPIE']);
  assert.match(r.skipped[0].why, /N8812Q has no hourly rate/);
  assert.match(r.skipped[1].why, /isn't a tail number/);
  const withDefault = readImport('aircraft', csv, { now: NOW, defaultRate: 150 });
  assert.deepEqual(withDefault.rows.map((x) => x.tail), ['N172SP', 'N8812Q']);
  assert.match(withDefault.skipped[0].why, /listed twice/);
  assert.equal(cleanTail('n-123ab'), 'N123AB');
});

test('times are read in the school’s time zone', () => {
  assert.equal(parseWhen('11/12/2026 2:30 PM', TZ).toISOString(), '2026-11-12T19:30:00.000Z');
  assert.equal(parseWhen('2026-07-04 08:00', TZ).toISOString(), '2026-07-04T12:00:00.000Z'); // daylight time
  assert.equal(parseWhen('11/12/26', TZ, '12:15 am').toISOString(), '2026-11-12T05:15:00.000Z');
  assert.equal(parseWhen('2026-11-12T14:00:00Z', TZ).toISOString(), '2026-11-12T14:00:00.000Z');
  assert.equal(parseWhen('next tuesday', TZ), null);
});

test('reservations: past, cancelled and duplicates left out; block time becomes flight time', () => {
  const csv = `Start,End,Customer,Customer Email,Instructor,Aircraft,Reservation Type,Status
11/12/2026 9:00 AM,11/12/2026 11:00 AM,Maya Torres,maya@example.com,Jake Miller,N172SP,Private Pilot Lesson,Confirmed
11/1/2026 9:00 AM,11/1/2026 11:00 AM,Maya Torres,maya@example.com,Jake Miller,N172SP,Lesson,Confirmed
11/13/2026 9:00 AM,11/13/2026 10:00 AM,Luke Bennett,,,8812Q,,Cancelled
11/14/2026 1:00 PM,11/14/2026 2:00 PM,Luke Bennett,,,8812Q,,
11/14/2026 1:00 PM,11/14/2026 2:00 PM,Luke Bennett,,,8812Q,,`;
  const r = readImport('reservations', csv, { tz: TZ, now: NOW });
  assert.equal(r.rows.length, 2);
  const [a, b] = r.rows;
  assert.deepEqual([a.startsAt, a.flightHours, a.instructor, a.tail, a.goal], ['2026-11-12T14:00:00.000Z', 1.5, 'Jake Miller', 'N172SP', 'Private Pilot Lesson']);
  assert.deepEqual([b.student, b.instructor, b.tail, b.goal, b.flightHours], ['Luke Bennett', null, 'N8812Q', 'Rental', 1]);
  assert.deepEqual(r.skipped.map((s) => s.why), ['Already happened.', 'Cancelled in FSP.', 'Listed twice.']);
});

test('reservations with a date column and separate times', () => {
  const csv = `Date,Start Time,End Time,Student,Aircraft
11/20/2026,3:00 PM,5:30 PM,Maya Torres,N172SP
11/20/2026,11:00 PM,1:00 AM,Maya Torres,N172SP`;
  const r = readImport('reservations', csv, { tz: TZ, now: NOW });
  assert.equal(r.rows[0].startsAt, '2026-11-20T20:00:00.000Z');
  assert.equal(r.rows[0].endsAt, '2026-11-20T22:30:00.000Z');
  assert.equal(r.rows[0].flightHours, 2);
  assert.equal(r.rows[1].endsAt, '2026-11-21T06:00:00.000Z'); // past midnight
});

import { matchReservation, importedProposalExpires } from '../src/fspImport.js';
test('imported reservations wait for people and planes, then book', () => {
  const now = new Date(NOW);
  const r = { starts_at: '2026-11-12T14:00:00Z', student_name: 'Maya Torres', student_email: 'maya@example.com', instructor_name: 'Jake Miller', instructor_email: null, tail: 'N172SP' };
  const people = [
    { userId: null, email: 'maya@example.com', name: 'Maya Torres', role: 'student', joined: false },
    { userId: 'c1', email: 'jake@example.com', name: 'Jake Miller', role: 'cfi', joined: true, cfiReady: false },
  ];
  const planes = [{ id: 'p1', tail: 'N172SP', ready: false }];
  const w = matchReservation(r, { people, planes, now });
  assert.equal(w.status, 'waiting');
  assert.match(w.note, /Maya Torres to join · Jake Miller’s instructor profile .* · N172SP’s registration/);
  people[0] = { ...people[0], userId: 's1', joined: true };
  people[1].cfiReady = true; planes[0].ready = true;
  assert.deepEqual(matchReservation(r, { people, planes, now }), { status: 'ready', note: '', studentId: 's1', cfiId: 'c1', planeId: 'p1' });
  assert.equal(matchReservation({ ...r, instructor_name: null }, { people, planes, now }).status, 'skipped');
  assert.equal(matchReservation({ ...r, starts_at: '2026-11-05T14:00:00Z' }, { people, planes, now }).status, 'expired');
  assert.match(matchReservation({ ...r, tail: 'N999ZZ' }, { people, planes, now }).note, /N999ZZ isn’t in your imported aircraft/);
  assert.equal(importedProposalExpires('2026-11-06T14:00:00Z', now).toISOString(), '2026-11-06T12:00:00.000Z');
  assert.equal(importedProposalExpires('2026-12-30T14:00:00Z', now).toISOString(), '2026-11-12T12:00:00.000Z');
});
