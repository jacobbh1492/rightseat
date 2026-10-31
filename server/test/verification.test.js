import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AirmenIndex, cfiRatingLabels } from '../src/faa/airmen.js';
import { AircraftIndex } from '../src/faa/aircraft.js';
import { runChecks, decide, namesMatch } from '../src/verify/rules.js';
import { createDb } from '../src/db.js';
import { verifyDocument, confirmBroker, reviewDecision } from '../src/verify/pipeline.js';
import { syncAircraftJob, expirationSweep, syncAirmenJob } from '../src/jobs/jobs.js';

process.env.PUSH_DISABLED = '1';
const here = path.dirname(fileURLToPath(import.meta.url));
const airmen = AirmenIndex.fromDir(path.join(here, 'fixtures/airmen'));
const aircraft = AircraftIndex.fromDir(path.join(here, 'fixtures/aircraft'));
const NOW = new Date('2026-10-30T12:00:00Z');
const quiet = () => { const l = console.log; console.log = () => {}; return () => (console.log = l); };

test('airmen: finds pilot by first name + last name, parses medical and ratings', () => {
  const m = airmen.find({ first: 'Samuel', last: 'Carter', state: 'FL' });
  assert.equal(m.length, 1);
  assert.equal(m[0].pilotLevel, 'Student');
  assert.equal(m[0].medical.class, '3');
  assert.equal(m[0].medical.expires.toISOString().slice(0, 7), '2028-05');
});

test('airmen: CFI ratings from type F certificate', () => {
  const [m] = airmen.find({ first: 'Marcus', last: 'Reyes' });
  assert.deepEqual(m.instructor.ratings, ['F/ASE', 'F/AME', 'F/INSTA']);
  assert.deepEqual(cfiRatingLabels(m.instructor.ratings), ['CFI (single-engine)', 'MEI (multi-engine)', 'CFII (airplane)']);
});

test('airmen: duplicate names narrowed by city', () => {
  assert.equal(airmen.find({ first: 'Dana', last: 'Whitlock', state: 'FL' }).length, 2);
  assert.equal(airmen.find({ first: 'Dana', last: 'Whitlock', state: 'FL', city: 'Tampa' }).length, 1);
});

test('airmen: mechanics from non-pilot file', () => {
  const [m] = airmen.find({ first: 'Raul', last: 'Delgado' });
  assert.ok(m.mechanic);
});

test('aircraft: lookup joins MASTER + ACFTREF', () => {
  const r = aircraft.lookup('N7340P');
  assert.equal(r.make, 'PIPER');
  assert.equal(r.model, 'PA-28-161');
  assert.equal(r.year, 1978);
  assert.equal(r.valid, true);
  assert.equal(r.registrantType, 'LLC');
  assert.equal(r.expires.toISOString().slice(0, 10), '2031-01-31');
  assert.equal(aircraft.lookup('N99999'), null);
});

test('rules: names', () => {
  assert.ok(namesMatch('SAMUEL JAMES CARTER', 'Sam Carter'));
  assert.ok(!namesMatch('Sam Carter', 'Sam Cartwright'));
});

test('rules: clean owner insurance auto-approves; wrong use rejects; missing additional insured goes to review', () => {
  const listing = { tail: 'N7340P', ownerName: 'Bay Area Flyers Club' };
  const base = { tail: 'N7340P', use: 'Rental & flight instruction', liability: '$1,000,000', additional: 'RightSeat Inc.', expires: '2027-06-01', _confidence: 0.97 };
  assert.equal(decide(runChecks('ownerIns', base, { listing, now: NOW }), 0.97).decision, 'approved');
  assert.equal(decide(runChecks('ownerIns', { ...base, use: 'Pleasure & business' }, { listing, now: NOW }), 0.97).decision, 'rejected');
  assert.equal(decide(runChecks('ownerIns', { ...base, additional: '' }, { listing, now: NOW }), 0.97).decision, 'review');
});

test('rules: low confidence or user corrections always go to a human', () => {
  const checks = [{ level: 'pass' }];
  assert.equal(decide(checks, 0.7).decision, 'review');
  assert.equal(decide(checks, 0.99, true).decision, 'review');
  assert.equal(decide(checks, 0.99).decision, 'approved');
});

function setup() {
  const db = createDb(null);
  db.upsertUser({ id: 'u1', name: 'Sam Carter', email: 'sam@example.com', city: 'St Petersburg', state: 'FL' });
  db.saveDoc({ subjectId: 'u1', subjectKind: 'user', userId: 'u1', type: 'id', status: 'approved', fields: { name: 'Samuel Carter' } });
  db.upsertUser({ id: 'o1', name: 'Bay Area Flyers Club', email: 'club@example.com' });
  db.saveDoc({ subjectId: 'o1', subjectKind: 'user', userId: 'o1', type: 'id', status: 'approved', fields: { name: 'Dan Miller' } });
  db.upsertListing({ id: 'l1', tail: 'N7340P', make: 'Piper', ownerName: 'Bay Area Flyers Club', ownerId: 'o1' });
  return db;
}
const fakeExtract = (fields, confidence = 0.97) => async () => ({ fields: { ...fields }, confidence });

test('pipeline: pilot certificate verified from FAA data with no upload', async () => {
  const db = setup();
  const doc = await verifyDocument({ db, airmen, aircraft, now: NOW }, { type: 'pilotCert', userId: 'u1' });
  assert.equal(doc.status, 'approved');
});

test('pipeline: registration pulls the FAA record and approves', async () => {
  const db = setup();
  const doc = await verifyDocument({ db, airmen, aircraft, now: NOW }, { type: 'registration', userId: 'o1', listingId: 'l1' });
  assert.equal(doc.status, 'approved', JSON.stringify(doc.checks));
  assert.equal(doc.fields.year, 1978);
});

test('pipeline: medical read by AI, expired one is rejected', async () => {
  const db = setup();
  const restore = quiet();
  const doc = await verifyDocument(
    { db, airmen, aircraft, now: NOW, extract: fakeExtract({ name: 'Samuel Carter', class: 'Third class', examDate: '2024-05-01', expires: '2026-05-31', limitations: 'None' }) },
    { type: 'medical', userId: 'u1', file: { base64: 'x', mediaType: 'image/jpeg' } }
  );
  restore();
  assert.equal(doc.status, 'rejected');
});

test('pipeline: clean COI waits for broker, broker link approves it', async () => {
  const db = setup();
  const restore = quiet();
  const doc = await verifyDocument(
    { db, airmen, aircraft, now: NOW, baseUrl: 'https://api.example', extract: fakeExtract({ insured: 'Bay Area Flyers Club', tail: 'N7340P', carrier: 'X', policy: 'P1', use: 'Rental', liability: '1000000', additional: 'RightSeat Inc', broker: 'b@x.com', expires: '2027-06-01' }) },
    { type: 'ownerIns', userId: 'o1', listingId: 'l1', file: { base64: 'x', mediaType: 'application/pdf' } }
  );
  restore();
  assert.equal(doc.status, 'awaiting_broker');
  const token = Object.keys(db.state.tokens)[0];
  assert.equal(confirmBroker(db, token).status, 'approved');
  assert.equal(confirmBroker(db, token), null, 'token is single-use');
});

test('pipeline: annual without IA card goes to review, reviewer approves', async () => {
  const db = setup();
  const doc = await verifyDocument(
    { db, airmen, aircraft, now: NOW, extract: fakeExtract({ date: '2026-08-28', hobbs: '9770', signer: 'Raul Delgado', certNo: '123', ia: '' }) },
    { type: 'annual', userId: 'o1', listingId: 'l1', file: { base64: 'x', mediaType: 'image/jpeg' } }
  );
  assert.equal(doc.status, 'review');
  const [q] = db.listQueue();
  const restore = quiet();
  await reviewDecision(db, q.id, 'approved', 'IA card checked', 'jacob');
  restore();
  assert.equal(db.currentDoc('l1', 'annual').status, 'approved');
});

test('jobs: nightly aircraft sync pauses listings with invalid registration', async () => {
  const db = setup();
  db.upsertListing({ id: 'l2', tail: 'N22CW', make: 'Piper', ownerName: 'Ray Thompson', ownerId: 'o1' });
  const restore = quiet();
  const changes = await syncAircraftJob({ db, aircraft, now: NOW });
  restore();
  assert.equal(changes.length, 1);
  assert.equal(db.getListing('l2').paused, true);
  assert.ok(!db.getListing('l1').paused);
});

test('jobs: expiration sweep sends one reminder per threshold and expires + pauses', async () => {
  const db = setup();
  db.saveDoc({ subjectId: 'l1', subjectKind: 'listing', userId: 'o1', type: 'ownerIns', status: 'approved', expires: '2026-11-12', fields: {} });
  db.saveDoc({ subjectId: 'u1', subjectKind: 'user', userId: 'u1', type: 'medical', status: 'approved', expires: '2026-10-01', fields: {} });
  const restore = quiet();
  const r1 = await expirationSweep({ db, now: NOW });
  const r2 = await expirationSweep({ db, now: NOW });
  restore();
  assert.deepEqual(r1, { reminders: 1, expired: 1 });
  assert.deepEqual(r2, { reminders: 0, expired: 0 });
  assert.equal(db.currentDoc('u1', 'medical').status, 'expired');
});

test('jobs: monthly airmen sync re-queues a CFI whose instructor certificate disappeared', async () => {
  const db = setup();
  db.upsertUser({ id: 'u3', name: 'Dana Whitlock', city: 'Orlando', state: 'FL' });
  db.saveDoc({ subjectId: 'u3', subjectKind: 'user', userId: 'u3', type: 'id', status: 'approved', fields: { name: 'Dana Whitlock' } });
  db.saveDoc({ subjectId: 'u3', subjectKind: 'user', userId: 'u3', type: 'cfiCert', status: 'approved', fields: {} });
  const changes = await syncAirmenJob({ db, airmen });
  assert.equal(changes[0].type, 'cfiCert');
  assert.equal(db.listQueue().length, 1);
});

test('extract: forced tool call parsed into fields + overall confidence', async () => {
  const { extractDocument } = await import('../src/verify/extract.js');
  let sent;
  const client = { messages: { create: async (req) => { sent = req; return { content: [{ type: 'tool_use', input: {
    name: { value: 'Samuel Carter', confidence: 0.98 }, class: { value: 'Third class', confidence: 0.95 }, examDate: { value: '2026-05-12', confidence: 0.82 },
    expires: { value: '', confidence: 0.3 }, limitations: { value: 'None', confidence: 0.99 }, is_expected_document: true, legible: true } }] }; } } };
  const r = await extractDocument({ type: 'medical', base64: 'abc', mediaType: 'image/jpeg' }, { client });
  assert.equal(sent.tool_choice.name, 'record_document');
  assert.equal(sent.messages[0].content[0].type, 'image');
  assert.equal(r.fields.name, 'Samuel Carter');
  assert.equal(r.confidence, 0.82); // empty fields don't drag confidence down; lowest read field does
});

test('admin API: auth, queue decision, listings, settings validation, audit log', async () => {
  const express = (await import('express')).default;
  const { adminRouter } = await import('../src/admin.js');
  process.env.ADMIN_KEY = 'k';
  const db = setup();
  await verifyDocument({ db, airmen, aircraft, now: NOW, extract: fakeExtract({ date: '2026-08-28', hobbs: '9770', signer: 'Raul Delgado', certNo: '1', ia: '' }) },
    { type: 'annual', userId: 'o1', listingId: 'l1', file: { base64: 'x', mediaType: 'image/jpeg' } });
  const app = express(); app.use('/api/admin', adminRouter({ db, aircraft }));
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}/api/admin`;
  const call = (path, opts = {}) => fetch(base + path, { ...opts, headers: { 'content-type': 'application/json', 'x-admin-key': 'k', 'x-reviewer': 'Maria', ...(opts.headers || {}) }, body: opts.body && JSON.stringify(opts.body) });
  const restore = quiet();
  try {
    assert.equal((await fetch(base + '/queue')).status, 403);
    const q = await (await call('/queue')).json();
    assert.equal(q.length, 1); assert.ok(q[0].doc.checks.length);
    assert.equal((await call(`/queue/${q[0].id}`, { method: 'POST', body: { decision: 'maybe' } })).status, 400);
    assert.equal((await (await call(`/queue/${q[0].id}`, { method: 'POST', body: { decision: 'approved', note: 'IA card checked' } })).json()).status, 'approved');
    assert.equal((await (await call('/listings/l1/pause', { method: 'POST', body: { reason: 'Insurance lapsed' } })).json()).paused, true);
    assert.equal((await call('/settings', { method: 'PUT', body: { fees: { studentNew: -1 } } })).status, 400);
    assert.equal((await (await call('/settings', { method: 'PUT', body: { fees: { studentNew: 0.05 } } })).json()).fees.studentNew, 0.05);
    const log = await (await call('/audit')).json();
    assert.deepEqual(log.map((e) => e.action), ['Changed setting', 'Paused listing', 'Approved document']);
    assert.equal(log[2].actor, 'Maria');
    assert.equal((await call('/queue', { method: 'OPTIONS' })).status, 204);
  } finally { restore(); srv.close(); }
});
