// Learning Library content checks: every lesson is complete, every diagram builds,
// and lesson ids are ones the database accepts (see 20261102000000_learning_library.sql).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, DIAG } from '../src/library/content.js';
import { GROUPS, ALL_IDS, getLesson, certsOf, standardsFor, acsRef, refsOf, searchLessons } from '../src/library/index.js';

test('every lesson is listed once, and every listed lesson exists', () => {
  assert.equal(new Set(ALL_IDS).size, ALL_IDS.length, 'duplicate id in GROUPS');
  assert.deepEqual([...ALL_IDS].sort(), Object.keys(LESSONS).sort());
  assert.equal(ALL_IDS.length, 44);
  assert.ok(GROUPS.every((g) => g.ids.length > 0));
});

test('lesson ids fit the database check', () => {
  for (const id of ALL_IDS) assert.match(id, /^[a-z0-9-]{2,40}$/);
});

test('each lesson has the full study content', () => {
  for (const id of ALL_IDS) {
    const L = getLesson(id);
    for (const k of ['title', 'area', 'why', 'cap', 'view', 'alt']) assert.ok(L[k]?.trim(), `${id}.${k}`);
    assert.ok(L.steps.length >= 4, `${id} steps`);
    assert.ok(L.errors.length >= 3, `${id} errors`);
    assert.ok(L.qc.length >= 2 && L.qc.every((q) => q.q && q.a), `${id} quick check`);
    assert.ok(L.setup.length >= 2, `${id} setup`);
    assert.ok(L.pvt || L.com, `${id} standards`);
    assert.ok(refsOf(L).every((r) => r.book && r.code && r.ch), `${id} refs`);
    const c = certsOf(L);
    assert.ok(c.pvt || c.com || c.ir, `${id} certificate`);
    for (const cert of ['pvt', 'com']) {
      assert.ok(standardsFor(L, cert).length > 0, `${id} ${cert} standards`);
      assert.match(acsRef(L, cert).task, /^(PA|CA|IR)\./, `${id} ACS code`);
    }
  }
});

test('every diagram builds with valid path data', () => {
  const layers = ['sky', 'ground', 'brown', 'surface', 'dash', 'ref', 'ghost', 'track', 'wind', 'windHead', 'arrows', 'dots', 'planes'];
  for (const id of ALL_IDS) {
    const d = DIAG[id]();
    for (const k of layers) assert.doesNotMatch(d[k], /NaN|undefined/, `${id}.${k}`);
    assert.ok(d.track || d.sky || d.planes, `${id} draws something`);
    for (let i = 0; i < 8; i++) assert.equal(typeof d['l' + i].t, 'string');
  }
});

test('search finds lessons by name and ACS code', () => {
  assert.ok(searchLessons('steep').includes('steep-turns'));
  assert.ok(searchLessons('IR.III.B').includes('ir-holding'));
  assert.equal(searchLessons('').length, 44);
});
