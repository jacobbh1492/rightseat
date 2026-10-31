// FAA Airmen Certification Releasable Database.
// Download page: https://www.faa.gov/licenses_certificates/airmen_certification/releasable_airmen_download/
// Published monthly as a ZIP of CSVs: PILOT_BASIC, PILOT_CERT, NONPILOT_BASIC, NONPILOT_CERT.
// Notes from the FAA: certificate numbers are not included, airmen may withhold their address (not their certificates),
// medical data is informational only, and Inspection Authorization (IA) is NOT in the public file.
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { parseFaaCsv, col, faaDate, normName } from './csv.js';

const PILOT_LEVELS = { A: 'Airline Transport', C: 'Commercial', P: 'Private', V: 'Recreational', T: 'Sport', S: 'Student' };

export class AirmenIndex {
  constructor() {
    this.byId = new Map();
    this.byName = new Map(); // "LAST|FIRST" -> [uniqueId]
  }

  static fromZip(buffer) {
    const zip = new AdmZip(buffer);
    const files = {};
    for (const e of zip.getEntries()) files[path.basename(e.entryName).toUpperCase()] = e.getData().toString('latin1');
    return AirmenIndex.fromFiles(files);
  }

  static fromDir(dir) {
    const files = {};
    for (const f of fs.readdirSync(dir)) files[f.toUpperCase()] = fs.readFileSync(path.join(dir, f), 'latin1');
    return AirmenIndex.fromFiles(files);
  }

  static fromFiles(files) {
    const idx = new AirmenIndex();
    for (const kind of ['PILOT', 'NONPILOT']) {
      const basic = files[`${kind}_BASIC.CSV`];
      const cert = files[`${kind}_CERT.CSV`];
      if (basic) parseFaaCsv(basic).forEach((r) => idx.addBasic(r, kind));
      if (cert) parseFaaCsv(cert).forEach((r) => idx.addCert(r));
    }
    return idx;
  }

  addBasic(r, kind) {
    const id = col(r, 'UNIQUE ID');
    if (!id) return;
    const first = normName(col(r, 'FIRST & MIDDLE NAME', 'FIRST NAME'));
    const last = normName(col(r, 'LAST NAME & SUFFIX', 'LAST NAME'));
    const rec = this.byId.get(id) || { id, certs: [] };
    Object.assign(rec, {
      kind,
      first,
      last,
      city: normName(col(r, 'CITY')),
      state: col(r, 'STATE').toUpperCase(),
      medical: {
        class: col(r, 'MEDICAL CLASS', 'MED CLASS'),
        date: faaDate(col(r, 'MEDICAL DATE', 'MED DATE', 'MEDICAL DATE MEDICAL')),
        expires: faaDate(col(r, 'EXPIRE DATE', 'MEDICAL EXPIRE DATE', 'MED EXP DATE')),
      },
      basicMed: {
        course: faaDate(col(r, 'BASIC MED COURSE DATE')),
        cmec: faaDate(col(r, 'BASIC MED CMEC DATE')),
      },
    });
    this.byId.set(id, rec);
    const key = `${last.split(' ')[0]}|${first.split(' ')[0]}`;
    this.byName.set(key, [...new Set([...(this.byName.get(key) || []), id])]);
  }

  addCert(r) {
    const id = col(r, 'UNIQUE ID');
    if (!id) return;
    const ratings = Object.entries(r)
      .filter(([k]) => /^(RATINGS?\d*|TYPE ?RATING\d*)$/.test(k))
      .flatMap(([, v]) => String(v || '').split(/\s+/))
      .filter(Boolean);
    const rec = this.byId.get(id) || { id, certs: [] };
    rec.certs.push({
      type: col(r, 'CERTIFICATE TYPE', 'TYPE'),
      level: col(r, 'CERTIFICATE LEVEL', 'LEVEL'),
      expires: faaDate(col(r, 'CERTIFICATE EXPIRE DATE', 'EXPIRE DATE')),
      ratings,
    });
    this.byId.set(id, rec);
  }

  // Find candidates by name, optionally narrowed by state/city.
  find({ first, last, state, city }) {
    const f = normName(first).split(' ')[0];
    const l = normName(last).split(' ')[0];
    let ids = this.byName.get(`${l}|${f}`) || [];
    let recs = ids.map((id) => this.byId.get(id));
    if (state) {
      const narrowed = recs.filter((r) => !r.state || r.state === state.toUpperCase());
      if (narrowed.length) recs = narrowed;
    }
    if (city && recs.length > 1) {
      const narrowed = recs.filter((r) => r.city === normName(city));
      if (narrowed.length) recs = narrowed;
    }
    return recs.map(summarize);
  }
}

export function summarize(rec) {
  const pilot = rec.certs.find((c) => c.type === 'P');
  const cfi = rec.certs.find((c) => c.type === 'F');
  const mech = rec.certs.find((c) => c.type === 'M');
  return {
    id: rec.id,
    name: `${rec.first} ${rec.last}`,
    city: rec.city,
    state: rec.state,
    pilotLevel: pilot ? PILOT_LEVELS[pilot.level] || pilot.level : null,
    pilotRatings: pilot?.ratings || [],
    instructor: cfi ? { ratings: cfi.ratings, expires: cfi.expires } : null,
    mechanic: mech ? { ratings: mech.ratings } : null,
    medical: rec.medical,
    basicMed: rec.basicMed,
  };
}

// Human labels for common instructor rating codes (rating code after the "/").
export function cfiRatingLabels(ratings) {
  const map = { ASE: 'CFI (single-engine)', AME: 'MEI (multi-engine)', INSTA: 'CFII (airplane)', INSTH: 'CFII (helicopter)', ROTH: 'CFI (helicopter)', GL: 'CFI (glider)', SPORT: 'CFI-Sport' };
  return ratings.map((r) => map[r.split('/')[1]] || r);
}

export async function downloadAirmen(url = process.env.FAA_AIRMEN_ZIP_URL) {
  if (!url) throw new Error('Set FAA_AIRMEN_ZIP_URL to the CSV ZIP link on the FAA releasable airmen download page');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FAA airmen download failed: ${res.status}`);
  return AirmenIndex.fromZip(Buffer.from(await res.arrayBuffer()));
}
