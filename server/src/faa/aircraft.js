// FAA Releasable Aircraft Database — refreshed daily at 11:30 pm Central.
// https://www.faa.gov/licenses_certificates/aircraft_certification/aircraft_registry/releasable_aircraft_download/
// ZIP contains MASTER.txt (registrations) and ACFTREF.txt (make/model reference), among others.
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { parseFaaCsv, col, faaDate } from './csv.js';

export const AIRCRAFT_ZIP_URL = 'https://registry.faa.gov/database/ReleasableAircraft.zip';

const REGISTRANT = { 1: 'Individual', 2: 'Partnership', 3: 'Corporation', 4: 'Co-Owned', 5: 'Government', 7: 'LLC', 8: 'Non-citizen corporation', 9: 'Non-citizen co-owned' };

export class AircraftIndex {
  constructor() {
    this.byTail = new Map();
    this.models = new Map();
  }

  static fromZip(buffer) {
    const zip = new AdmZip(buffer);
    const files = {};
    for (const e of zip.getEntries()) {
      const name = path.basename(e.entryName).toUpperCase();
      if (name === 'MASTER.TXT' || name === 'ACFTREF.TXT') files[name] = e.getData().toString('latin1');
    }
    return AircraftIndex.fromFiles(files);
  }

  static fromDir(dir) {
    const files = {};
    for (const f of fs.readdirSync(dir)) files[f.toUpperCase()] = fs.readFileSync(path.join(dir, f), 'latin1');
    return AircraftIndex.fromFiles(files);
  }

  static fromFiles(files) {
    const idx = new AircraftIndex();
    if (files['ACFTREF.TXT']) {
      for (const r of parseFaaCsv(files['ACFTREF.TXT'])) {
        idx.models.set(col(r, 'CODE'), { make: col(r, 'MFR'), model: col(r, 'MODEL'), engines: +col(r, 'NO-ENG') || null, seats: +col(r, 'NO-SEATS') || null });
      }
    }
    if (files['MASTER.TXT']) {
      for (const r of parseFaaCsv(files['MASTER.TXT'])) {
        const n = col(r, 'N-NUMBER').toUpperCase();
        if (n) idx.byTail.set(n, r);
      }
    }
    return idx;
  }

  lookup(tail) {
    const n = String(tail || '').toUpperCase().replace(/^N/, '').trim();
    const r = this.byTail.get(n);
    if (!r) return null;
    const m = this.models.get(col(r, 'MFR MDL CODE')) || {};
    const statusCode = col(r, 'STATUS CODE');
    return {
      tail: 'N' + n,
      serial: col(r, 'SERIAL NUMBER'),
      make: m.make || null,
      model: m.model || null,
      year: +col(r, 'YEAR MFR') || null,
      owner: col(r, 'NAME'),
      otherNames: [1, 2, 3, 4, 5].map((i) => col(r, `OTHER NAMES(${i})`)).filter(Boolean),
      registrantType: REGISTRANT[col(r, 'TYPE REGISTRANT')] || col(r, 'TYPE REGISTRANT'),
      city: col(r, 'CITY'),
      state: col(r, 'STATE'),
      statusCode,
      valid: statusCode === 'V',
      certIssued: faaDate(col(r, 'CERT ISSUE DATE')),
      airworthinessDate: faaDate(col(r, 'AIR WORTH DATE')),
      expires: faaDate(col(r, 'EXPIRATION DATE')),
      modeSHex: col(r, 'MODE S CODE HEX'),
    };
  }
}

export async function downloadAircraft(url = AIRCRAFT_ZIP_URL) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FAA aircraft download failed: ${res.status}`);
  return AircraftIndex.fromZip(Buffer.from(await res.arrayBuffer()));
}
