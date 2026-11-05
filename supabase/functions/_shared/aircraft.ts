// Airworthiness on the server: open grounding squawks, the 100-hour and the annual
// (the same rules the app shows: aircraftStatus.js).
import { admin } from './server.ts';
import { aircraftChecks, blockingIssues } from './aircraftStatus.js';
import { ymdIn } from './renterChecks.js';
import { HttpError } from './bookings.js';

export async function assertAirworthy(plane: any, start: Date, flightHours: number) {
  const { data: squawks } = await admin.from('squawks').select('text, grounding, status').eq('plane_id', plane.id).in('status', ['open', 'deferred']);
  const checks = aircraftChecks({
    plane: { tail: plane.tail, hobbsTotal: plane.hobbs_total, next100At: plane.next_100_at, annualDate: plane.annual_date },
    squawks: (squawks || []) as any[], flightHours, day: ymdIn(start),
  });
  const bad = blockingIssues(checks);
  if (bad.length) throw new HttpError(409, `${plane.tail} can’t be booked right now: ${bad.map((b: any) => b.label).join('; ')}.`);
}
