// Nightly FAA verification (GitHub Actions: .github/workflows/faa-verify.yml).
//  - Instructors whose identity is verified are matched against the FAA Airmen Registry.
//  - Every listed plane is checked against the FAA Aircraft Registry (new ones and
//    re-checks, so a deregistered or expired aircraft stops being bookable).
// Results go to public.verifications; a database trigger updates the listing flags.
// Talks to the database through the Supabase Management API (SUPABASE_ACCESS_TOKEN).
import { AirmenIndex } from '../faa/airmen.js';
import { downloadAircraft } from '../faa/aircraft.js';
import { decideAirmen, decideAircraft } from './faa-decide.js';

const REF = process.env.SUPABASE_PROJECT_REF || 'velhvzupamhlhbriyreq';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
// The sandbox test listing (supabase/seed/test_listing.sql) is fake; never check it.
const SKIP = new Set(['a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001']);

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : [];
}
const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
async function record(type, id, check, { status, detail }) {
  await sql(`insert into public.verifications (subject_type, subject_id, check_type, status, detail, checked_at)
    values (${lit(type)}, ${lit(id)}, ${lit(check)}, ${lit(status)}, ${lit(JSON.stringify({ ...detail, source: 'faa-nightly' }))}::jsonb, now())
    on conflict (subject_type, subject_id, check_type) do update
      set status = excluded.status, detail = excluded.detail, checked_at = now()
      where public.verifications.reviewed_by is null or excluded.status = 'failed'`);
}

// The FAA publishes the airmen CSV ZIP monthly with a dated file name; find the current link.
async function airmenZipUrl() {
  if (process.env.FAA_AIRMEN_ZIP_URL) return process.env.FAA_AIRMEN_ZIP_URL;
  const page = 'https://www.faa.gov/licenses_certificates/airmen_certification/releasable_airmen_download';
  const html = await (await fetch(page, { headers: { 'User-Agent': 'RightSeat-verification/1.0' } })).text();
  const links = [...html.matchAll(/href="([^"]+\.zip)"/gi)].map((m) => new URL(m[1], page).href);
  const csv = links.find((l) => /CS\d{6}\.zip$/i.test(l)) || links.find((l) => /csv/i.test(l));
  if (!csv) throw new Error(`No airmen CSV ZIP link found on ${page} (links: ${links.join(', ') || 'none'})`);
  return csv;
}

async function main() {
  if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN is not set');

  // ---- instructors
  const cfis = (await sql(`select v.subject_id as id, i.detail as identity from public.verifications v
      join public.verifications i on i.subject_type = 'cfi' and i.subject_id = v.subject_id and i.check_type = 'identity' and i.status = 'passed'
      where v.subject_type = 'cfi' and v.check_type = 'faa_airmen' and v.status = 'pending'`)).filter((r) => !SKIP.has(r.id));
  console.log(`Instructors waiting for the FAA check: ${cfis.length}`);
  if (cfis.length) {
    const url = await airmenZipUrl();
    console.log(`Downloading airmen registry ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Airmen download failed: ${res.status}`);
    const idx = AirmenIndex.fromZip(Buffer.from(await res.arrayBuffer()));
    console.log(`Airmen records: ${idx.byId.size}`);
    for (const c of cfis) {
      const id = typeof c.identity === 'string' ? JSON.parse(c.identity) : c.identity;
      const result = decideAirmen(idx.find({ first: id?.name?.first, last: id?.name?.last, state: id?.state }));
      await record('cfi', c.id, 'faa_airmen', result);
      console.log(`  instructor ${c.id}: ${result.status}`);
    }
  }

  // ---- planes (all listings, so registrations are re-checked nightly)
  const planes = (await sql(`select id, tail, make, model from public.planes`)).filter((p) => !SKIP.has(p.id));
  console.log(`Planes to check: ${planes.length}`);
  if (planes.length) {
    console.log('Downloading aircraft registry');
    const idx = await downloadAircraft();
    console.log(`Aircraft records: ${idx.byTail.size}`);
    for (const p of planes) {
      const result = decideAircraft(p, idx.lookup(p.tail));
      await record('plane', p.id, 'faa_aircraft', result);
      console.log(`  ${p.tail}: ${result.status}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
