// Booking rules used by the server functions. Plain JavaScript with no imports
// beyond pricing.js, so the same code is unit-tested in Node (test/bookings.test.js).
import { quote, r2, FEES } from './pricing.js';

export const MAX_HOURS = 8;
export const HOLD_MINUTES_AFTER = 30; // turnaround buffer after each booking

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => { throw new HttpError(400, msg); };

// Validate and normalise a booking request from the app.
export function parseBookingRequest(body, now = new Date()) {
  const b = body || {};
  if (!b.cfiId && !b.planeId) bad('Choose an instructor, a plane, or both.');
  const flightHours = Number(b.flightHours);
  const groundHours = Number(b.groundHours || 0);
  if (!(flightHours > 0 && flightHours <= MAX_HOURS)) bad('Flight time must be between 0.1 and 8 hours.');
  if (!(groundHours >= 0 && groundHours <= MAX_HOURS)) bad('Ground time must be between 0 and 8 hours.');
  if (!b.cfiId && groundHours > 0) bad('Ground instruction needs an instructor.');
  const startsAt = new Date(b.startsAt);
  if (isNaN(startsAt)) bad('Pick a valid date and time.');
  if (startsAt.getTime() < now.getTime() + 60 * 60 * 1000) bad('Lessons must be booked at least 1 hour ahead.');
  if (startsAt.getTime() > now.getTime() + 180 * 24 * 3600 * 1000) bad('You can book up to 6 months ahead.');
  const goal = String(b.goal || '').trim().slice(0, 120);
  if (!goal) bad('Say what the lesson is for.');
  const endsAt = new Date(startsAt.getTime() + (flightHours + groundHours) * 3600 * 1000 + HOLD_MINUTES_AFTER * 60 * 1000);
  return { cfiId: b.cfiId || null, planeId: b.planeId || null, startsAt, endsAt, flightHours, groundHours, goal, prepaid: !!b.prepaid };
}

// Database rows -> the shapes pricing.quote() expects. For an employee-model
// affiliation the school's set rate replaces the instructor's own rate.
// schoolPro: the CFI's school or the plane's school is on School Pro ($5 booking fee).
// feeFree: the student has an active Short Final promo (no booking fee).
export function quoteInputs({ cfi, plane, affiliation, schoolPro, feeFree }) {
  const employeeRate = affiliation?.model === 'employee' && affiliation.set_rate ? Number(affiliation.set_rate) : null;
  const qCfi = cfi ? {
    flightRate: employeeRate ?? Number(cfi.flight_rate),
    groundRate: Number(cfi.ground_rate),
  } : null;
  const qPlane = plane ? {
    wetRate: Number(plane.wet_rate),
    blockRate: Number(plane.details?.blockRate ?? plane.wet_rate),
  } : null;
  const qAff = cfi && affiliation ? { model: affiliation.model, schoolPct: Number(affiliation.school_pct) } : null;
  return { cfi: qCfi, plane: qPlane, affiliation: qAff, cfiPro: !!cfi?.pro, schoolPro: !!schoolPro, feeFree: !!feeFree };
}

export function priceBooking({ cfi, plane, affiliation, flightHours, groundHours, repeat, prepaid, schoolPro, feeFree }) {
  const inputs = quoteInputs({ cfi, plane, affiliation, schoolPro, feeFree });
  const q = quote({ ...inputs, flightHours, groundHours, repeat, prepaid });
  return { ...q, inputs: { ...inputs, repeat: !!repeat, prepaid: !!prepaid } };
}

// Re-price at close-out with the actual Hobbs/ground time, using the rates frozen
// at booking (so a rate change after booking never changes what the student pays).
export function finalPrice(frozenQuote, { flightHours, groundHours }) {
  const i = frozenQuote.inputs;
  return quote({ cfi: i.cfi, plane: i.plane, affiliation: i.affiliation, cfiPro: i.cfiPro, schoolPro: i.schoolPro, feeFree: i.feeFree, repeat: i.repeat, prepaid: i.prepaid, flightHours, groundHours });
}

export function validateActuals(body, booked) {
  const flightHours = Number(body?.flightHours);
  const groundHours = Number(body?.groundHours ?? booked.ground_hours ?? 0);
  if (!(flightHours >= 0.1 && flightHours <= MAX_HOURS)) bad('Enter the actual Hobbs time (0.1–8.0).');
  if (!(groundHours >= 0 && groundHours <= MAX_HOURS)) bad('Ground time must be 0–8 hours.');
  return { flightHours: Math.round(flightHours * 10) / 10, groundHours: Math.round(groundHours * 10) / 10 };
}

// Who may do what to a booking.
export function roleIn(booking, userId, { planeOwnerId, schoolAdmin, partnerId } = {}) {
  if (booking.student_id === userId) return 'student';
  if (partnerId && partnerId === userId) return 'partner'; // the other pilot on a shared rental
  if (booking.cfi_id && booking.cfi_id === userId) return 'cfi';
  if (booking.plane_id && planeOwnerId === userId) return 'owner';
  if (schoolAdmin) return 'school';
  return null;
}

// The party who accepts a request: the instructor, or the plane owner for a solo rental.
export const approverRole = (booking) => (booking.cfi_id ? 'cfi' : 'owner');

const TRANSITIONS = {
  confirm: { from: ['requested'], by: ['approver'] },
  decline: { from: ['requested'], by: ['approver'] },
  cancel: { from: ['proposed', 'requested', 'confirmed'], by: ['student', 'cfi', 'owner', 'school'] },
  // A lesson the instructor proposed: the student accepts (and adds their card) or turns it down.
  accept: { from: ['proposed'], by: ['student'] },
  reject: { from: ['proposed'], by: ['student'] },
  debrief: { from: ['completed'], by: ['cfi'] },
  complete: { from: ['confirmed'], by: ['approver'] },
};
export function assertTransition(action, booking, role) {
  const t = TRANSITIONS[action];
  if (!t) bad('Unknown action.');
  if (!role) throw new HttpError(403, 'This isn’t your booking.');
  const allowed = t.by.flatMap((r) => (r === 'approver' ? [approverRole(booking)] : [r]));
  if (!allowed.includes(role)) throw new HttpError(403, 'You can’t do that on this booking.');
  if (!t.from.includes(booking.status)) throw new HttpError(409, `This booking is already ${booking.status}.`);
  if (action === 'complete' && new Date(booking.starts_at).getTime() > Date.now() + 15 * 60 * 1000) throw new HttpError(409, 'You can close out a lesson once it has started.');
}

// Cancellation fee: a student cancelling a confirmed lesson inside 24 hours pays
// half the instruction, which goes to the instructor. Everyone else: no charge.
export function cancellationFee(booking, role, now = new Date()) {
  if (role !== 'student' || booking.status !== 'confirmed' || !booking.cfi_id) return 0;
  const hours = (new Date(booking.starts_at).getTime() - now.getTime()) / 3600000;
  if (hours >= 24) return 0;
  const q = booking.quote || {};
  return r2(((q.instruction || 0) + (q.ground || 0)) * FEES.lateCancel);
}

// Turn a final split into Stripe transfers. Parties without a payout account
// ready are returned as `held` so the money can be released once they finish setup.
export function payoutPlan(split, { cfiAccount, ownerAccount, schoolAccount }) {
  const lines = [
    { party: 'cfi', amount: split.cfi, account: cfiAccount },
    { party: 'owner', amount: split.owner, account: ownerAccount },
    { party: 'school', amount: split.school, account: schoolAccount },
  ].filter((l) => l.amount > 0);
  return {
    transfers: lines.filter((l) => l.account).map((l) => ({ ...l, cents: Math.round(l.amount * 100) })),
    held: lines.filter((l) => !l.account),
  };
}

export const cents = (dollars) => Math.round(dollars * 100);

// ---- Debrief before pay: an instructor's share of a lesson is released once the
// debrief has all three parts.
export function parseDebrief(d) {
  const clean = (s) => String(s || '').trim().slice(0, 2000);
  const out = { wentWell: clean(d?.wentWell), needsWork: clean(d?.needsWork), nextPlan: clean(d?.nextPlan) };
  return { ...out, complete: !!(out.wentWell && out.needsWork && out.nextPlan) };
}
// Shares that wait for the debrief on a lesson with an instructor (instruction money:
// the instructor's and the school's). Plane rental is paid at close-out as usual.
export const DEBRIEF_PARTIES = ['cfi', 'school'];

// ---- Shared solo rentals: two pilots split the cost of one rental.
export const SPLIT_MIN_PCT = 50;  // the booker pays at least half (FAR 61.113(c) pro rata)
export const SPLIT_MAX_PCT = 90;
export const SPLIT_HOLD_HOURS = 24; // how long an invite holds the plane
export function parseSplit(split, { cfiId } = {}) {
  if (!split) return null;
  if (cfiId) bad('Cost sharing is for solo rentals (no instructor).');
  const email = String(split.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad('Enter the other pilot’s email.');
  const bookerPct = Number(split.bookerPct);
  if (!(bookerPct >= SPLIT_MIN_PCT && bookerPct <= SPLIT_MAX_PCT && bookerPct % 5 === 0)) bad(`Your share must be ${SPLIT_MIN_PCT}–${SPLIT_MAX_PCT}%, in steps of 5.`);
  return { email, bookerPct };
}
// The invite holds the plane for up to 24 hours, but never past 2 hours before the flight.
export function splitHoldUntil(startsAt, now = new Date()) {
  const t = Math.min(now.getTime() + SPLIT_HOLD_HOURS * 3600e3, new Date(startsAt).getTime() - 2 * 3600e3);
  if (t <= now.getTime() + 15 * 60e3) bad('That’s too soon to invite another pilot. Book at least 3 hours ahead to share the cost.');
  return new Date(t);
}
export function splitShares(total, bookerPct) {
  const booker = r2(total * bookerPct / 100);
  return { booker, partner: r2(total - booker) };
}
// At close-out: what the partner still owes (> 0, charged to their saved card) or
// gets back (< 0, refunded from the deposit).
export function partnerSettlement(partnerShare, deposit) {
  return r2(partnerShare - deposit);
}

// Pay each party from one or more charges (a shared rental is paid by two people).
// Stripe transfers are tied to the charge the money came from, and a transfer can't be
// bigger than its charge, so each party's amount is spread across the charges in order.
// Returns [{ party, amount, chargeId }].
export function allocateToCharges(lines, charges) {
  const left = charges.map((c) => ({ id: c.id, left: cents(c.amount) }));
  const out = [];
  for (const l of lines) {
    let need = cents(l.amount);
    for (const c of left) {
      if (need <= 0) break;
      const take = Math.min(need, c.left);
      if (take <= 0) continue;
      out.push({ party: l.party, amount: take / 100, chargeId: c.id });
      c.left -= take; need -= take;
    }
    if (need > 0) throw new HttpError(500, 'Payout is larger than what was charged.');
  }
  return out;
}

// ---- Lessons an instructor books for a student ("proposed" until the student accepts).
export const PROPOSAL_HOURS = 24;
// The student has 24 hours to accept, but never later than 2 hours before the lesson.
export function proposalExpires(startsAt, now = new Date()) {
  const t = Math.min(now.getTime() + PROPOSAL_HOURS * 3600e3, new Date(startsAt).getTime() - 2 * 3600e3);
  if (t <= now.getTime() + 15 * 60e3) bad('That’s too soon for the student to accept. Propose a lesson at least 3 hours ahead.');
  return new Date(t);
}
export function parseProposal(body, now = new Date()) {
  const studentId = String(body?.studentId || '');
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) bad('Pick a student.');
  return { studentId, ...parseBookingRequest({ ...body, cfiId: 'self' }, now) };
}

// ---- gift discovery flights
// A gift is money a buyer paid up front (gifts table). At close-out it pays for as much of
// the lesson as it covers; the student's saved card pays the rest. Stripe won't charge a
// card less than $0.50, so a tiny remainder is taken from the card and the gift covers
// a little less.
export const GIFT_MIN = 50;
export const GIFT_MAX = 1500;
export const STRIPE_MIN_CHARGE = 0.5;
export function giftUse(total, remaining) {
  const t = r2(Math.max(0, Number(total) || 0)), g = r2(Math.max(0, Number(remaining) || 0));
  if (!g) return { gift: 0, card: t };
  if (g >= t) return { gift: t, card: 0 };
  let card = r2(t - g);
  if (card < STRIPE_MIN_CHARGE) card = Math.min(t, STRIPE_MIN_CHARGE);
  return { gift: r2(t - card), card };
}
export function parseGift(body) {
  const amount = r2(Number(body?.amount));
  if (!(amount >= GIFT_MIN && amount <= GIFT_MAX)) throw new HttpError(400, `Pick an amount from $${GIFT_MIN} to $${GIFT_MAX}.`);
  const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const recipientName = clean(body?.recipientName, 80);
  if (!recipientName) throw new HttpError(400, 'Who’s the gift for?');
  const recipientEmail = clean(body?.recipientEmail, 200).toLowerCase();
  if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw new HttpError(400, 'That email doesn’t look right.');
  return { amount, recipientName, recipientEmail: recipientEmail || null, fromName: clean(body?.fromName, 80), message: clean(body?.message, 500), cfiId: typeof body?.cfiId === 'string' && body.cfiId ? body.cfiId : null };
}
// RS-XXXX-XXXX from an alphabet without look-alikes (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function giftCode(randomBytes) {
  const b = randomBytes(8);
  const ch = Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
  return `RS-${ch.slice(0, 4)}-${ch.slice(4, 8)}`;
}
export const normalizeGiftCode = (s) => {
  const x = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const core = x.startsWith('RS') ? x.slice(2) : x;
  return core.length === 8 ? `RS-${core.slice(0, 4)}-${core.slice(4)}` : null;
};
