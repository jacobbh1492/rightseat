// Solo-renter checks on the server, with the pilot's profile and the owner's checkout
// from the database (the same rules the app shows: renterChecks.js).
import { admin } from './server.ts';
import { renterChecks, failing } from './renterChecks.js';
import { HttpError } from './bookings.js';

export async function assertRenterReady(userId: string, plane: any, flightHours: number, start: Date, who = 'You') {
  const [{ data: p }, { data: c }] = await Promise.all([
    admin.from('pilot_profiles').select('*').eq('user_id', userId).maybeSingle(),
    admin.from('plane_checkouts').select('status, solo_until').eq('plane_id', plane.id).eq('pilot_id', userId).maybeSingle(),
  ]);
  const checks = renterChecks({
    profile: p ? { certificate: p.certificate, medicalClass: p.medical_class, medicalExpires: p.medical_expires, flightReviewDate: p.flight_review_date, totalHours: Number(p.total_hours) } : null,
    checkout: c ? { status: c.status, soloUntil: c.solo_until } : null,
    plane: { tail: plane.tail, soloRental: plane.details?.soloRental !== false, insuranceMinHours: Number(plane.details?.insuranceMinHours || 0), hobbsTotal: plane.hobbs_total, next100At: plane.next_100_at },
    flightHours, start,
  });
  const bad = failing(checks);
  if (bad.length) throw new HttpError(409, `${who === 'You' ? 'You can’t rent this plane solo yet' : who + ' can’t rent this plane solo yet'}: ${bad.map((b) => b.label.replace(/^Pilot profile: /, '')).join('; ')}.`);
}
