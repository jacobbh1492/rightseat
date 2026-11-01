import test from 'node:test';
import assert from 'node:assert/strict';
import { decideAirmen, decideAircraft } from '../src/jobs/faa-decide.js';

const cfi = (name, ratings = ['FLIGHT INSTRUCTOR/ASE']) => ({ id: name, name, city: 'ST PETERSBURG', state: 'FL', instructor: { ratings } });
const pilot = (name) => ({ id: name, name, city: 'TAMPA', state: 'FL', instructor: null });

test('airmen: exactly one instructor passes; anything else goes to a person', () => {
  assert.equal(decideAirmen([cfi('JACOB HENDERSON'), pilot('JACOB HENDERSON')]).status, 'passed');
  assert.equal(decideAirmen([cfi('A'), cfi('B')]).status, 'review');
  assert.equal(decideAirmen([pilot('A')]).status, 'review');
  assert.equal(decideAirmen([]).status, 'review');
  assert.notEqual(decideAirmen([]).status, 'failed'); // never auto-reject an instructor
});

test('aircraft: valid + matching make passes; invalid/expired fails; mismatch or unknown is reviewed', () => {
  const listing = { tail: 'N12345', make: 'Cessna', model: '172S' };
  const rec = { make: 'CESSNA', model: '172S', valid: true, statusCode: 'V', expires: new Date('2030-01-01') };
  assert.equal(decideAircraft(listing, rec).status, 'passed');
  assert.equal(decideAircraft(listing, { ...rec, valid: false, statusCode: 'D' }).status, 'failed');
  assert.equal(decideAircraft(listing, { ...rec, expires: new Date('2020-01-01') }).status, 'failed');
  assert.equal(decideAircraft(listing, { ...rec, make: 'PIPER' }).status, 'review');
  assert.equal(decideAircraft(listing, null).status, 'review');
});

test('aircraft registry with a byte-order mark (as the FAA ships it) still indexes by N-number', async () => {
  const { AircraftIndex } = await import('../src/faa/aircraft.js');
  const master = 'ï»¿N-NUMBER,SERIAL NUMBER,MFR MDL CODE,YEAR MFR,NAME,STATUS CODE,EXPIRATION DATE,\r\n12345,17280001,2072738,2006,JANE PILOT,V,20300131,\r\n';
  const ref = 'ï»¿CODE,MFR,MODEL,NO-ENG,NO-SEATS,\r\n2072738,CESSNA,172S,1,4,\r\n';
  const idx = AircraftIndex.fromFiles({ 'MASTER.TXT': master, 'ACFTREF.TXT': ref });
  const rec = idx.lookup('N12345');
  assert.equal(rec.make, 'CESSNA');
  assert.equal(rec.valid, true);
});
