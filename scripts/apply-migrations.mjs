// Apply new SQL migrations to the live Supabase database through the Management API.
// Runs in GitHub Actions (deploy-supabase.yml) with SUPABASE_ACCESS_TOKEN.
// Applied migrations are recorded in public.deploy_migrations, so each runs once.
import fs from 'node:fs';
import path from 'node:path';

const REF = process.env.SUPABASE_PROJECT_REF || 'velhvzupamhlhbriyreq';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN is not set'); process.exit(1); }

// Applied by hand before automated deploys existed.
const BASELINE = ['20261031000000_init.sql', '20261031010000_payments.sql', '20261031020000_service_role_grants.sql'];

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : [];
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

await sql(`create table if not exists public.deploy_migrations (name text primary key, applied_at timestamptz not null default now());
revoke all on public.deploy_migrations from anon, authenticated;
insert into public.deploy_migrations (name) values ${BASELINE.map((n) => `(${lit(n)})`).join(', ')} on conflict do nothing;`);

const applied = new Set((await sql('select name from public.deploy_migrations')).map((r) => r.name));
const dir = path.join(process.cwd(), 'supabase/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
let count = 0;
for (const f of files) {
  if (applied.has(f)) continue;
  const body = fs.readFileSync(path.join(dir, f), 'utf8');
  console.log(`Applying ${f}…`);
  // One request = one transaction: the migration and its record succeed or fail together.
  await sql(`begin;\n${body}\n;insert into public.deploy_migrations (name) values (${lit(f)});\ncommit;`);
  count++;
}
console.log(count ? `Applied ${count} migration(s).` : 'Database is up to date.');
