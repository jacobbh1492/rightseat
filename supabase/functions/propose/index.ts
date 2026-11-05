// POST /propose — an instructor books a lesson for one of their students.
// Priced on the server like any booking. It starts as "proposed" and holds the
// instructor's time and the plane; the student accepts by saving their card
// (booking-action accept → card), which confirms it. The instructor already chose the
// time, so it can sit outside their published hours; it can't overlap other lessons,
// time off or the plane's bookings.
import { feeContext } from '../_shared/feeContext.ts';
import { serve, json, admin, requireUser, audit } from '../_shared/server.ts';
import { parseProposal, priceBooking, proposalExpires, HttpError } from '../_shared/bookings.js';
import { normalizeSchedule } from '../_shared/schedule.js';

serve(async (req, body) => {
  const user = await requireUser(req);
  const r = parseProposal(body);
  const [{ data: cfi }, { data: student }, planeRes] = await Promise.all([
    admin.from('cfis').select('*').eq('id', user.id).maybeSingle(),
    admin.from('profiles').select('id, full_name').eq('id', r.studentId).maybeSingle(),
    r.planeId ? admin.from('planes').select('*').eq('id', r.planeId).single() : Promise.resolve({ data: null }),
  ]);
  const plane = planeRes.data;
  if (!cfi || !cfi.published) throw new HttpError(403, 'Only instructors with a published profile can book lessons for students.');
  if (!cfi.verified) throw new HttpError(409, 'You can book students once Positive Rate has verified your certificate.');
  if (!student || student.id === user.id) throw new HttpError(404, 'Student not found.');
  if (r.planeId && (!plane || !plane.published)) throw new HttpError(404, 'That plane isn’t available to book right now.');
  if (plane && !(plane.airworthy_verified && plane.insured)) throw new HttpError(409, 'That plane’s registration and insurance are still being verified.');

  // Only your own students: someone who has booked you before.
  const { count: history } = await admin.from('bookings').select('id', { count: 'exact', head: true })
    .eq('cfi_id', user.id).eq('student_id', student.id).in('status', ['requested', 'confirmed', 'completed']);
  if (!history) throw new HttpError(403, 'You can book lessons for students who have booked you before.');

  // The instructor's buffer after each lesson, like any booking.
  const { data: row } = await admin.from('cfi_schedules').select('*').eq('cfi_id', user.id).maybeSingle();
  const schedule = normalizeSchedule(row ? { timezone: row.timezone, weekly: row.weekly, minNoticeHours: row.min_notice_hours, maxDaysAhead: row.max_days_ahead, bufferMin: row.buffer_min, incrementMin: row.increment_min } : null, cfi.availability);
  const durationMin = Math.round((r.flightHours + r.groundHours) * 60);
  r.endsAt = new Date(r.startsAt.getTime() + (durationMin + schedule.bufferMin) * 60e3);
  const expires = proposalExpires(r.startsAt);

  // Clashes: time off, other lessons (including pending proposals), and the plane.
  const { count: off } = await admin.from('cfi_time_off').select('id', { count: 'exact', head: true })
    .eq('cfi_id', user.id).lt('starts_at', r.endsAt.toISOString()).gt('ends_at', r.startsAt.toISOString());
  if (off) throw new HttpError(409, 'You’ve blocked that time off. Unblock it on your calendar first.');
  const nowIso = new Date().toISOString();
  const overlap = async (col: string, id: string) => {
    const { count } = await admin.from('bookings').select('id', { count: 'exact', head: true })
      .eq(col, id).lt('starts_at', r.endsAt.toISOString()).gt('ends_at', r.startsAt.toISOString())
      .or(`status.eq.confirmed,and(status.eq.requested,card_ready.eq.true),and(status.eq.proposed,proposal_expires.gt.${nowIso})`)
      .or(`split_pending.eq.false,hold_until.gt.${nowIso}`);
    return (count || 0) > 0;
  };
  if (await overlap('cfi_id', user.id)) throw new HttpError(409, 'You already have a lesson then.');
  if (plane && await overlap('plane_id', plane.id)) throw new HttpError(409, `${plane.tail} is already booked then.`);

  const { data: affiliation } = await admin.from('affiliations').select('*').eq('cfi_id', user.id).eq('status', 'active').maybeSingle();
  const { count: prior } = await admin.from('bookings').select('id', { count: 'exact', head: true })
    .eq('student_id', student.id).eq('cfi_id', user.id).in('status', ['confirmed', 'completed']);
  const fees = await feeContext({ studentId: student.id, affiliation, plane });
  const q = priceBooking({ cfi, plane, affiliation, flightHours: r.flightHours, groundHours: r.groundHours, repeat: (prior || 0) > 0, prepaid: false, ...fees });

  const { data: booking, error } = await admin.from('bookings').insert({
    student_id: student.id, cfi_id: user.id, plane_id: plane?.id || null, affiliation_id: affiliation?.id || null,
    starts_at: r.startsAt.toISOString(), ends_at: r.endsAt.toISOString(), goal: r.goal,
    flight_hours: r.flightHours, ground_hours: r.groundHours, status: 'proposed', quote: q,
    proposed_by: user.id, proposal_expires: expires.toISOString(),
  }).select('id, status, starts_at, proposal_expires').single();
  if (error) throw error;
  await audit(user.id, 'booking.proposed', booking.id, { student: student.id, total: q.total });
  return json({ booking, quote: { total: q.total, instruction: q.instruction, ground: q.ground, aircraft: q.aircraft, bookingFee: q.bookingFee, waivedFee: q.waivedFee } }, 201);
});
