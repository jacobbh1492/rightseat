// POST /book — request a lesson or rental.
// Prices it on the server (the app's number is only an estimate), checks the
// instructor and plane are free, saves the student's card for charging at close-out,
// and creates the booking as "requested" for the instructor/owner to confirm.
// A solo rental can be shared: the booker invites another pilot and picks their own share;
// the request only goes to the owner once that pilot accepts and pays a deposit (split function).
import { feeContext } from '../_shared/feeContext.ts';
import { serve, json, admin, stripe, requireUser, customerFor, audit } from '../_shared/server.ts';
import { parseBookingRequest, priceBooking, parseSplit, splitHoldUntil, splitShares, giftUse, HttpError } from '../_shared/bookings.js';
import { normalizeSchedule, checkBooking } from '../_shared/schedule.js';
import { assertRenterReady } from '../_shared/renter.ts';
import { assertAirworthy } from '../_shared/aircraft.ts';

serve(async (req, body) => {
  const user = await requireUser(req);
  const r = parseBookingRequest(body);
  // Optional: share a solo rental with another pilot ({ email, bookerPct }).
  const share = parseSplit(body.split, { cfiId: r.cfiId });
  // Optional: this rental is the renter's checkout flight, with the owner on board.
  const checkoutFlight = body.checkout === true;
  if (checkoutFlight && (r.cfiId || !r.planeId)) throw new HttpError(400, 'A checkout flight with the owner is a plane rental without an instructor.');
  if (checkoutFlight && share) throw new HttpError(400, 'A checkout flight can’t be shared.');

  const [cfiRes, planeRes] = await Promise.all([
    r.cfiId ? admin.from('cfis').select('*').eq('id', r.cfiId).single() : Promise.resolve({ data: null }),
    r.planeId ? admin.from('planes').select('*').eq('id', r.planeId).single() : Promise.resolve({ data: null }),
  ]);
  const cfi = cfiRes.data, plane = planeRes.data;
  if (r.cfiId && (!cfi || !cfi.published)) throw new HttpError(404, 'That instructor isn’t taking bookings right now.');
  if (r.planeId && (!plane || !plane.published)) throw new HttpError(404, 'That plane isn’t available to book right now.');
  // Only verified instructors and planes can be booked (certificate; registration + insurance).
  if (cfi && !cfi.verified) throw new HttpError(409, 'This instructor is still being verified by Positive Rate. Try again soon.');
  if (plane && !(plane.airworthy_verified && plane.insured)) throw new HttpError(409, 'This plane’s registration and insurance are still being verified. Try again soon.');
  if (cfi && cfi.id === user.id) throw new HttpError(400, 'You can’t book yourself.');
  if (plane && !cfi && plane.owner_id === user.id) throw new HttpError(400, 'You can’t rent your own plane.');
  if (plane && !cfi && plane.details?.soloRental === false) throw new HttpError(400, 'This plane is dual-only. Add an instructor.');

  // Grounding squawks, the 100-hour and the annual (any booking in the plane).
  if (plane) await assertAirworthy(plane, r.startsAt, r.flightHours);

  // A gift (gift function): pays for a lesson with an instructor, applied at close-out.
  let gift: any = null;
  if (body.giftId) {
    if (!cfi) throw new HttpError(400, 'Gifts pay for flights with an instructor.');
    const { data: g } = await admin.from('gifts').select('id, remaining, status, recipient_id').eq('id', String(body.giftId)).maybeSingle();
    if (!g || g.recipient_id !== user.id || !['claimed', 'active'].includes(g.status) || !(Number(g.remaining) > 0)) throw new HttpError(409, 'That gift isn’t available. Check Account → Gifts.');
    gift = g;
  }

  // Renting without an instructor: the pilot's profile (medical, flight review, hours) and
  // the owner's checkout in this plane.
  if (checkoutFlight) {
    if (!['owner', 'either'].includes(plane.details?.checkoutBy)) throw new HttpError(409, 'This plane’s checkouts are done with a CFI. Book one with an instructor.');
    const { data: done } = await admin.from('plane_checkouts').select('status').eq('plane_id', plane.id).eq('pilot_id', user.id).maybeSingle();
    if (done?.status === 'approved') throw new HttpError(409, 'You’re already checked out in this plane. Book it as a solo rental.');
    await assertRenterReady(user.id, plane, r.flightHours, r.startsAt, 'You', { forCheckout: true });
  } else if (plane && !cfi) await assertRenterReady(user.id, plane, r.flightHours, r.startsAt);

  let partnerId: string | null = null, holdUntil: Date | null = null;
  if (share) {
    if (!plane) throw new HttpError(400, 'Cost sharing is for plane rentals.');
    const { data: found } = await admin.rpc('user_id_by_email', { p_email: share.email });
    partnerId = found ? String(found) : null;
    if (!partnerId) throw new HttpError(404, 'No Positive Rate pilot uses that email. Ask them to join first, then invite them.');
    if (partnerId === user.id) throw new HttpError(400, 'Invite someone other than yourself.');
    if (partnerId === plane.owner_id) throw new HttpError(400, 'The plane’s owner can’t share the cost of renting it.');
    holdUntil = splitHoldUntil(r.startsAt);
  }

  // The instructor's calendar: working hours, notice, booking window and time off.
  // Their buffer after each lesson sets how long the booking holds the slot.
  if (cfi) {
    const { data: row } = await admin.from('cfi_schedules').select('*').eq('cfi_id', cfi.id).maybeSingle();
    const schedule = normalizeSchedule(row ? {
      timezone: row.timezone, weekly: row.weekly, minNoticeHours: row.min_notice_hours,
      maxDaysAhead: row.max_days_ahead, bufferMin: row.buffer_min, incrementMin: row.increment_min,
    } : null, cfi.availability);
    const durationMin = Math.round((r.flightHours + r.groundHours) * 60);
    r.endsAt = new Date(r.startsAt.getTime() + (durationMin + schedule.bufferMin) * 60 * 1000);
    const { data: off } = await admin.from('cfi_time_off').select('starts_at, ends_at').eq('cfi_id', cfi.id)
      .lt('starts_at', r.endsAt.toISOString()).gt('ends_at', r.startsAt.toISOString());
    const busy = (off || []).map((t: any) => ({ start: new Date(t.starts_at), end: new Date(t.ends_at) }));
    const why = checkBooking({ schedule, start: r.startsAt, durationMin, busy, now: new Date() });
    if (why) throw new HttpError(409, why);
  }

  // Retrying? Drop this student's own earlier requests for an overlapping time whose card never saved.
  await admin.from('bookings').update({ status: 'cancelled', cancelled_by: user.id, cancel_reason: 'Replaced by a new request' })
    .eq('student_id', user.id).eq('status', 'requested').eq('card_ready', false)
    .lt('starts_at', r.endsAt.toISOString()).gt('ends_at', r.startsAt.toISOString());

  // Double-booking check (instructor and plane), including turnaround buffer.
  const overlap = async (col: string, id: string) => {
    const { count } = await admin.from('bookings').select('id', { count: 'exact', head: true })
      .eq(col, id).in('status', ['proposed', 'requested', 'confirmed'])
      .lt('starts_at', r.endsAt.toISOString()).gt('ends_at', r.startsAt.toISOString())
      // a request whose card was never saved stops holding the slot after 30 minutes;
      // a lesson an instructor proposed holds it until the student's deadline
      .or(`card_ready.eq.true,status.eq.confirmed,and(status.eq.proposed,proposal_expires.gt.${new Date().toISOString()}),and(status.eq.requested,created_at.gt.${new Date(Date.now() - 30 * 60 * 1000).toISOString()})`)
      // a shared rental waiting on the other pilot holds the slot until its invite runs out
      .or(`split_pending.eq.false,hold_until.gt.${new Date().toISOString()}`);
    return (count || 0) > 0;
  };
  if (cfi && await overlap('cfi_id', cfi.id)) throw new HttpError(409, 'The instructor is already booked then. Pick another time.');
  if (plane && await overlap('plane_id', plane.id)) throw new HttpError(409, 'The plane is already booked then. Pick another time.');

  const { data: affiliation } = cfi
    ? await admin.from('affiliations').select('*').eq('cfi_id', cfi.id).eq('status', 'active').maybeSingle()
    : { data: null };

  // Repeat pair = no CFI new-student fee. (The student always pays the booking fee.)
  let rq = admin.from('bookings').select('id', { count: 'exact', head: true }).eq('student_id', user.id).in('status', ['confirmed', 'completed']);
  rq = cfi ? rq.eq('cfi_id', cfi.id) : rq.is('cfi_id', null).eq('plane_id', plane!.id).eq('status', 'completed');
  const { count: prior } = await rq;

  const fees = await feeContext({ studentId: user.id, affiliation, plane });
  const q = priceBooking({ cfi, plane, affiliation, flightHours: r.flightHours, groundHours: r.groundHours, repeat: (prior || 0) > 0, prepaid: r.prepaid, ...fees });

  const customer = await customerFor(user);
  const { data: booking, error } = await admin.from('bookings').insert({
    student_id: user.id, cfi_id: cfi?.id || null, plane_id: plane?.id || null, affiliation_id: affiliation?.id || null,
    starts_at: r.startsAt.toISOString(), ends_at: r.endsAt.toISOString(), goal: r.goal,
    flight_hours: r.flightHours, ground_hours: r.groundHours, status: 'requested', quote: q,
    split_pending: !!share, hold_until: holdUntil?.toISOString() || null,
    purpose: checkoutFlight ? 'checkout' : null, gift_id: gift?.id || null,
  }).select().single();
  if (error) throw error;
  // A checkout flight also puts the renter on the owner's checkout list.
  if (checkoutFlight) {
    await admin.from('plane_checkouts').upsert({ plane_id: plane.id, pilot_id: user.id, status: 'requested', note: 'Checkout flight booked' }, { onConflict: 'plane_id,pilot_id' });
  }
  // The invite is sent once the booker's card is saved (notify_booking).
  if (share) {
    const { error: se } = await admin.from('booking_splits').insert({ booking_id: booking.id, booker_id: user.id, partner_id: partnerId, booker_pct: share.bookerPct });
    if (se) throw se;
  }

  // Save the card now; it's charged for the actual Hobbs time at close-out.
  const si = await stripe.setupIntents.create({
    customer, usage: 'off_session', payment_method_types: ['card'],
    metadata: { booking_id: booking.id, user_id: user.id },
  }, { idempotencyKey: 'si-' + booking.id });
  const ek = await stripe.ephemeralKeys.create({ customer }, { apiVersion: '2024-12-18.acacia' });
  await admin.from('bookings').update({ setup_intent_id: si.id }).eq('id', booking.id);
  await audit(user.id, 'booking.requested', booking.id, { total: q.total, shared: share ? share.bookerPct : null });

  return json({
    booking: { id: booking.id, status: booking.status, startsAt: booking.starts_at },
    split: share ? { bookerPct: share.bookerPct, holdUntil, ...splitShares(q.total, share.bookerPct) } : null,
    quote: { total: q.total, bookingFee: q.bookingFee, waivedFee: q.waivedFee, protection: q.protection, deposit: q.deposit, instruction: q.instruction, ground: q.ground, aircraft: q.aircraft,
      giftEstimate: gift ? giftUse(q.total, Number(gift.remaining)).gift : 0 },
    payment: { setupIntentClientSecret: si.client_secret, customer, ephemeralKey: ek.secret },
  }, 201);
});
