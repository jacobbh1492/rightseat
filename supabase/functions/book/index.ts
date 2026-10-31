// POST /book — request a lesson or rental.
// Prices it on the server (the app's number is only an estimate), checks the
// instructor and plane are free, saves the student's card for charging at close-out,
// and creates the booking as "requested" for the instructor/owner to confirm.
import { serve, json, admin, stripe, requireUser, customerFor, audit } from '../_shared/server.ts';
import { parseBookingRequest, priceBooking, HttpError } from '../_shared/bookings.js';

serve(async (req, body) => {
  const user = await requireUser(req);
  const r = parseBookingRequest(body);

  const [cfiRes, planeRes] = await Promise.all([
    r.cfiId ? admin.from('cfis').select('*').eq('id', r.cfiId).single() : Promise.resolve({ data: null }),
    r.planeId ? admin.from('planes').select('*').eq('id', r.planeId).single() : Promise.resolve({ data: null }),
  ]);
  const cfi = cfiRes.data, plane = planeRes.data;
  if (r.cfiId && (!cfi || !cfi.published)) throw new HttpError(404, 'That instructor isn’t taking bookings right now.');
  if (r.planeId && (!plane || !plane.published)) throw new HttpError(404, 'That plane isn’t available to book right now.');
  if (cfi && cfi.id === user.id) throw new HttpError(400, 'You can’t book yourself.');
  if (plane && !cfi && plane.owner_id === user.id) throw new HttpError(400, 'You can’t rent your own plane.');
  if (plane && !cfi && plane.details?.soloRental === false) throw new HttpError(400, 'This plane is dual-only. Add an instructor.');

  // Retrying? Drop this student's own earlier requests for an overlapping time whose card never saved.
  await admin.from('bookings').update({ status: 'cancelled', cancelled_by: user.id, cancel_reason: 'Replaced by a new request' })
    .eq('student_id', user.id).eq('status', 'requested').eq('card_ready', false)
    .lt('starts_at', r.endsAt.toISOString()).gt('ends_at', r.startsAt.toISOString());

  // Double-booking check (instructor and plane), including turnaround buffer.
  const overlap = async (col: string, id: string) => {
    const { count } = await admin.from('bookings').select('id', { count: 'exact', head: true })
      .eq(col, id).in('status', ['requested', 'confirmed'])
      .lt('starts_at', r.endsAt.toISOString()).gt('ends_at', r.startsAt.toISOString())
      // a request whose card was never saved stops holding the slot after 30 minutes
      .or(`card_ready.eq.true,status.eq.confirmed,created_at.gt.${new Date(Date.now() - 30 * 60 * 1000).toISOString()}`);
    return (count || 0) > 0;
  };
  if (cfi && await overlap('cfi_id', cfi.id)) throw new HttpError(409, 'The instructor is already booked then. Pick another time.');
  if (plane && await overlap('plane_id', plane.id)) throw new HttpError(409, 'The plane is already booked then. Pick another time.');

  const { data: affiliation } = cfi
    ? await admin.from('affiliations').select('*').eq('cfi_id', cfi.id).eq('status', 'active').maybeSingle()
    : { data: null };

  // Repeat pair = no student booking fee (and no CFI new-student fee).
  let rq = admin.from('bookings').select('id', { count: 'exact', head: true }).eq('student_id', user.id).in('status', ['confirmed', 'completed']);
  rq = cfi ? rq.eq('cfi_id', cfi.id) : rq.is('cfi_id', null).eq('plane_id', plane!.id).eq('status', 'completed');
  const { count: prior } = await rq;

  const q = priceBooking({ cfi, plane, affiliation, flightHours: r.flightHours, groundHours: r.groundHours, repeat: (prior || 0) > 0, prepaid: r.prepaid });

  const customer = await customerFor(user);
  const { data: booking, error } = await admin.from('bookings').insert({
    student_id: user.id, cfi_id: cfi?.id || null, plane_id: plane?.id || null, affiliation_id: affiliation?.id || null,
    starts_at: r.startsAt.toISOString(), ends_at: r.endsAt.toISOString(), goal: r.goal,
    flight_hours: r.flightHours, ground_hours: r.groundHours, status: 'requested', quote: q,
  }).select().single();
  if (error) throw error;

  // Save the card now; it's charged for the actual Hobbs time at close-out.
  const si = await stripe.setupIntents.create({
    customer, usage: 'off_session', payment_method_types: ['card'],
    metadata: { booking_id: booking.id, user_id: user.id },
  }, { idempotencyKey: 'si-' + booking.id });
  const ek = await stripe.ephemeralKeys.create({ customer }, { apiVersion: '2024-12-18.acacia' });
  await admin.from('bookings').update({ setup_intent_id: si.id }).eq('id', booking.id);
  await audit(user.id, 'booking.requested', booking.id, { total: q.total });

  return json({
    booking: { id: booking.id, status: booking.status, startsAt: booking.starts_at },
    quote: { total: q.total, bookingFee: q.bookingFee, protection: q.protection, deposit: q.deposit, instruction: q.instruction, ground: q.ground, aircraft: q.aircraft },
    payment: { setupIntentClientSecret: si.client_secret, customer, ephemeralKey: ek.secret },
  }, 201);
});
