import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase, callFn } from './supabase';

// Live bookings the signed-in user is part of: as the student, the instructor,
// the plane owner, or the other pilot on a shared rental (role 'partner'). Row-level security on the server decides what's visible.
const STATUS = { proposed: 'Proposed', requested: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', no_show: 'Cancelled', disputed: 'Completed' };

const timeLabel = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dateLabel = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export async function fetchMyBookings(userId) {
  const { data: rows, error } = await supabase.from('bookings')
    .select('id, student_id, cfi_id, plane_id, starts_at, goal, flight_hours, ground_hours, status, quote, actual_hobbs, final_split, card_ready, cancel_reason, cancelled_by, conditions, split_pending, hold_until, proposed_by, proposal_expires, purpose, gift_id')
    .order('starts_at', { ascending: false }).limit(200);
  if (error) throw error;
  const planeIds = [...new Set(rows.map((b) => b.plane_id).filter(Boolean))];
  const soloIds = rows.filter((b) => !b.cfi_id && b.plane_id).map((b) => b.id);
  const { data: splits } = soloIds.length
    ? await supabase.from('booking_splits').select('booking_id, booker_id, partner_id, booker_pct, status, deposit, invited_at').in('booking_id', soloIds)
    : { data: [] };
  const splitBy = Object.fromEntries((splits || []).map((x) => [x.booking_id, x]));
  const people = [...new Set([...rows.flatMap((b) => [b.student_id, b.cfi_id]), ...(splits || []).map((x) => x.partner_id)].filter(Boolean))];
  const [{ data: planes }, { data: profiles }, { data: ledger }, { data: myReviews }] = await Promise.all([
    planeIds.length ? supabase.from('planes').select('id, tail, make, model, owner_id').in('id', planeIds) : { data: [] },
    people.length ? supabase.from('profiles').select('id, full_name').in('id', people) : { data: [] },
    supabase.from('ledger').select('booking_id, kind, amount').eq('party_id', userId),
    supabase.from('reviews').select('booking_id, subject').eq('author_id', userId),
  ]);
  const planeBy = Object.fromEntries((planes || []).map((p) => [p.id, p]));
  const nameBy = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name || 'Pilot']));

  return rows.map((b) => {
    const plane = planeBy[b.plane_id];
    const sp = splitBy[b.id];
    const role = b.student_id === userId ? 'student' : b.cfi_id === userId ? 'cfi' : plane?.owner_id === userId ? 'owner' : sp?.partner_id === userId ? 'partner' : null;
    // Shared rental: who pays what. Live shares only (a cancelled invite is just history).
    const shareLive = sp && ['invited', 'declined', 'accepted'].includes(sp.status);
    const estTotal = b.quote?.total || 0;
    const bookerEst = sp ? Math.round(estTotal * sp.booker_pct) / 100 : estTotal;
    const split = sp && (shareLive || sp.status === 'expired' || (b.status === 'completed' && sp.status === 'accepted')) ? {
      status: sp.status, bookerPct: sp.booker_pct, partnerPct: 100 - sp.booker_pct,
      bookerName: nameBy[b.student_id] || 'Pilot', partnerName: nameBy[sp.partner_id] || 'Pilot',
      partnerId: sp.partner_id, deposit: sp.deposit != null ? Number(sp.deposit) : null,
      holdUntil: b.hold_until, pending: !!b.split_pending,
      bookerEst, partnerEst: Math.round((estTotal - bookerEst) * 100) / 100,
      // after the flight: the server's numbers
      bookerFinal: b.final_split?.final?.charged ?? null, partnerFinal: b.final_split?.final?.partnerShare ?? null,
    } : null;
    const when = new Date(b.starts_at);
    const final = b.final_split?.final || null;
    const mine = (ledger || []).filter((l) => l.booking_id === b.id);
    const share = role === 'cfi' ? b.final_split?.cfi ?? b.quote?.split?.cfi : role === 'owner' ? b.final_split?.owner ?? b.quote?.split?.owner : null;
    const lateFee = mine.find((l) => l.kind === 'charge_late_cancel');
    return {
      id: b.id, live: true, role,
      cfiId: b.cfi_id, planeId: b.plane_id, studentId: b.student_id,
      studentName: nameBy[b.student_id] || 'Student', cfiName: b.cfi_id ? nameBy[b.cfi_id] : null,
      tail: plane?.tail || null, planeName: plane ? `${plane.make} ${plane.model}` : null,
      when: b.starts_at, date: dateLabel(when), time: timeLabel(when),
      goal: b.goal, flightHours: Number(b.flight_hours), groundHours: Number(b.ground_hours),
      status: STATUS[b.status] || 'Pending', rawStatus: b.status, cardReady: !!b.card_ready,
      // Booked by the instructor for the student, waiting for the student to accept.
      proposal: b.status === 'proposed' ? { expires: b.proposal_expires, by: b.proposed_by } : null,
      checkoutFlight: b.purpose === 'checkout', // a rental flown with the owner to check the renter out
      quote: b.quote, total: final ? final.total : b.quote?.total || 0, final, split,
      // what this person pays on a shared rental (the whole thing otherwise)
      myTotal: split && split.status === 'accepted' && role !== 'owner'
        ? (role === 'partner' ? (split.partnerFinal ?? split.partnerEst) : (split.bookerFinal ?? split.bookerEst))
        : (final ? (final.charged ?? final.total) : b.quote?.total || 0),
      actualHobbs: b.actual_hobbs != null ? Number(b.actual_hobbs) : null,
      conditions: b.conditions || {}, actualGround: b.final_split?.final?.groundHours ?? null,
      share, method: 'card', giftApplied: Number(final?.giftApplied || 0), usesGift: !!b.gift_id,
      reviewedCfi: (myReviews || []).some((x) => x.booking_id === b.id && x.subject === 'cfi'),
      reviewedPlane: (myReviews || []).some((x) => x.booking_id === b.id && x.subject === 'plane'),
      // For the instructor/owner: was their share paid out, or held until payouts are set up?
      // 'debrief' = waiting for the instructor's debrief before it's released.
      payout: mine.some((l) => l.kind.startsWith('payout_')) ? 'paid' : mine.some((l) => l.kind.startsWith('held_')) ? 'held' : mine.some((l) => l.kind.startsWith('await_')) ? 'debrief' : null,
      awaitingDebrief: Math.round(mine.filter((l) => l.kind.startsWith('await_')).reduce((a, l) => a + Number(l.amount), 0) * 100) / 100,
      cancel: b.status === 'cancelled' ? { reason: b.cancel_reason || 'Cancelled', fee: lateFee ? Number(lateFee.amount) : 0 } : undefined,
    };
  }).filter((r) => r.role);
}

// confirm | decline | cancel | complete | debrief  (see supabase/functions/booking-action)
export const bookingAction = (bookingId, action, extra = {}) => callFn('booking-action', { bookingId, action, ...extra });

// An instructor books a lesson for one of their students (see supabase/functions/propose).
export const proposeLesson = ({ studentId, planeId, startsAt, flightHours, groundHours, goal }) =>
  callFn('propose', { studentId, planeId: planeId || null, startsAt, flightHours, groundHours, goal });

// Shared rentals: accept is in payments (it needs Stripe's sheet); decline | leave | solo here.
export const splitAction = (bookingId, action) => callFn('split', { bookingId, action });

// The instructor's debrief for a lesson: saved by the server, which then releases their pay.
export const submitDebrief = (bookingId, { wentWell, needsWork, nextPlan, flownOn }) =>
  bookingAction(bookingId, 'debrief', { wentWell, needsWork, nextPlan, flownOn });

// Payouts (Stripe Connect Express). Opens Stripe's hosted setup, then re-checks status.
export async function setUpPayouts() {
  const { url } = await callFn('connect', {});
  if (Platform.OS === 'web') window.open(url, '_blank');
  else await WebBrowser.openAuthSessionAsync(url, 'rightseat://payouts');
  return checkPayouts();
}
export const checkPayouts = () => callFn('connect', { check: true });

// ---- training record
// Hours from completed RightSeat flights, in the keys the FAA-minimums view uses.
export function hoursFromFlights(flights) {
  const h = { total: 0, dual: 0, solo: 0, dualXC: 0, soloXC: 0, night: 0, instrument: 0, ground: 0, prep: 0 };
  const r1 = (n) => Math.round(n * 10) / 10;
  for (const f of flights) {
    const fh = f.actualHobbs || 0;
    const dual = !!f.cfiId;
    h.total += fh;
    if (dual) h.dual += fh; else h.solo += fh;
    if (f.conditions?.xc) { if (dual) h.dualXC += fh; else h.soloXC += fh; }
    if (f.conditions?.night && dual) h.night += fh;
    if (dual) h.instrument += f.conditions?.instrumentHours || 0;
    h.ground += f.actualGround ?? f.groundHours ?? 0;
  }
  for (const k of Object.keys(h)) h[k] = r1(h[k]);
  return h;
}

export async function fetchDebriefs(uid) {
  const { data, error } = await supabase.from('debriefs').select('*').eq('student_id', uid).order('flown_on', { ascending: false });
  if (error) throw error;
  return data;
}

// Written by the instructor at close-out (the database checks it's their booking).
export async function writeDebrief({ bookingId, studentId, cfiId, flownOn, wentWell, needsWork, nextPlan }) {
  const { error } = await supabase.from('debriefs').insert({
    booking_id: bookingId, student_id: studentId, cfi_id: cfiId, flown_on: flownOn,
    went_well: wentWell || '', needs_work: needsWork || '', next_plan: nextPlan || '',
  });
  if (error) throw error;
}

// The student marks a debrief read (locks the instructor's text; they can add a note).
export async function acknowledgeDebrief(id, note) {
  const patch = { acknowledged: true };
  if (note) patch.student_note = note;
  const { error } = await supabase.from('debriefs').update(patch).eq('id', id);
  if (error) throw error;
}

// Debriefs this instructor wrote (for the Students tab).
export async function fetchDebriefsIWrote(uid) {
  const { data, error } = await supabase.from('debriefs').select('id, booking_id, student_id, flown_on, went_well, needs_work, next_plan, acknowledged, student_note').eq('cfi_id', uid).order('flown_on', { ascending: false });
  if (error) throw error;
  return data;
}
