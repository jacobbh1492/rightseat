// POST /booking-sweep — hourly housekeeping (.github/workflows/booking-sweep.yml).
// Service role only. Releases shared-flight invites that ran out, reminds instructors
// whose pay is waiting on a debrief (1, 3 and 7 days), and pays out debriefs that were
// written straight from the app (older app versions save them without telling us), and
// books reservations imported from Flight Schedule Pro once everyone needed has joined.
import { serve, json, admin } from '../_shared/server.ts';
import { HttpError } from '../_shared/bookings.js';
import { releaseDebrief } from '../_shared/payouts.ts';
import { convertAllReservations } from '../_shared/imports.ts';

serve(async (req) => {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), ...Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'))].filter(Boolean);
  if (!token || !keys.includes(token)) throw new HttpError(403, 'Not allowed.');

  const { data: sweeps, error } = await admin.rpc('booking_sweeps');
  if (error) throw error;

  // Debriefs that are written but whose pay is still waiting.
  const { data: waiting } = await admin.from('ledger').select('id, booking_id').in('kind', ['await_cfi', 'await_school']).order('created_at').limit(500);
  const ids = [...new Set((waiting || []).map((w: any) => w.booking_id))];
  let released = 0, failed = 0;
  if (ids.length) {
    const { data: done } = await admin.from('ledger').select('source_id').in('source_id', (waiting || []).map((w: any) => w.id));
    const settled = new Set((done || []).map((d: any) => d.source_id));
    const open = [...new Set((waiting || []).filter((w: any) => !settled.has(w.id)).map((w: any) => w.booking_id))];
    const { data: written } = open.length ? await admin.from('debriefs').select('booking_id').in('booking_id', open) : { data: [] };
    for (const d of written || []) {
      try {
        const { data: b } = await admin.from('bookings').select('*').eq('id', d.booking_id).single();
        const { data: aff } = b.affiliation_id ? await admin.from('affiliations').select('school_id').eq('id', b.affiliation_id).single() : { data: null };
        const r = await releaseDebrief(b, aff?.school_id || null);
        released += r.paid + r.held;
      } catch (e) {
        failed++;
        console.error('release', d.booking_id, e);
      }
    }
  }
  // Schools switching from Flight Schedule Pro: book imported reservations that are now ready.
  let importsBooked = 0;
  try { importsBooked = await convertAllReservations(); } catch (e) { console.error('imports', e); }
  return json({ ...sweeps, importsBooked, debriefPayReleased: Math.round(released * 100) / 100, failed });
});
