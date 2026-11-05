// Run one SQL file against the live database (Management API) and print the result.
// Used by .github/workflows/demo-sql.yml to load or inspect demo data.
import fs from 'node:fs';
const REF = process.env.SUPABASE_PROJECT_REF || 'velhvzupamhlhbriyreq';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const file = process.argv[2];
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: fs.readFileSync(file, 'utf8') }),
});
const text = await res.text();
console.log(res.status);
console.log(text);
if (!res.ok) process.exit(1);
