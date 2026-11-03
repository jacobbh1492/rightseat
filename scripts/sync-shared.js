// Copies app modules the server functions also need. Run: node scripts/sync-shared.js
// CI fails if the copies drift (see test/shared.test.js).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const files = [
  ['src/pricing.js', 'supabase/functions/_shared/pricing.js'],
  ['src/schedule.js', 'supabase/functions/_shared/schedule.js'],
  ['src/renterChecks.js', 'supabase/functions/_shared/renterChecks.js'],
];
for (const [from, to] of files) {
  const src = fs.readFileSync(path.join(root, from), 'utf8');
  fs.writeFileSync(path.join(root, to), '// GENERATED from ' + from + ' by scripts/sync-shared.js — do not edit here.\n' + src);
  console.log('synced', to);
}
