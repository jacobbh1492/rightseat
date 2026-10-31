// Long-running scheduler. Run one instance (e.g. a small worker dyno / container).
import cron from 'node-cron';
import { createDb } from '../db.js';
import { downloadAircraft } from '../faa/aircraft.js';
import { downloadAirmen } from '../faa/airmen.js';
import { syncAircraftJob, syncAirmenJob, expirationSweep, brokerReminderJob } from './jobs.js';

const db = createDb();
const baseUrl = process.env.BASE_URL || '';
const safe = (name, fn) => async () => {
  try {
    console.log(`[${new Date().toISOString()}] ${name} start`);
    console.log(name, await fn());
  } catch (e) {
    console.error(name, 'failed', e);
  }
};

// FAA refreshes the aircraft registry at 11:30 pm Central, so pull at 12:15 am Central.
cron.schedule('15 0 * * *', safe('syncAircraft', async () => syncAircraftJob({ db, aircraft: await downloadAircraft() })), { timezone: 'America/Chicago' });
// Airmen file is published monthly; check on the 3rd.
cron.schedule('0 3 3 * *', safe('syncAirmen', async () => syncAirmenJob({ db, airmen: await downloadAirmen() })), { timezone: 'America/Chicago' });
cron.schedule('0 6 * * *', safe('expirationSweep', () => expirationSweep({ db })), { timezone: 'America/New_York' });
cron.schedule('0 10 * * *', safe('brokerReminders', () => brokerReminderJob({ db, baseUrl })), { timezone: 'America/New_York' });

console.log('RightSeat verification scheduler running');
