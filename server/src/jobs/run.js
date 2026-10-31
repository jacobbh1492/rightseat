// Run a job once from the command line: node src/jobs/run.js aircraft|airmen|sweep|broker
import { createDb } from '../db.js';
import { downloadAircraft } from '../faa/aircraft.js';
import { downloadAirmen } from '../faa/airmen.js';
import { syncAircraftJob, syncAirmenJob, expirationSweep, brokerReminderJob } from './jobs.js';

const db = createDb();
const job = process.argv[2];
const jobs = {
  aircraft: async () => syncAircraftJob({ db, aircraft: await downloadAircraft() }),
  airmen: async () => syncAirmenJob({ db, airmen: await downloadAirmen() }),
  sweep: () => expirationSweep({ db }),
  broker: () => brokerReminderJob({ db, baseUrl: process.env.BASE_URL || '' }),
};
if (!jobs[job]) {
  console.error('Usage: node src/jobs/run.js aircraft|airmen|sweep|broker');
  process.exit(1);
}
console.log(JSON.stringify(await jobs[job](), null, 2));
