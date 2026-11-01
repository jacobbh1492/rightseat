import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase, callFn } from './supabase';

// Live bookings the signed-in user is part of: as the student, the instructor,
// or the plane owner. Row-level security on the server decides what's visible.
const STATUS = { requested: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', no_show: 'Cancelled', disputed: 'Completed' };

const timeLabel = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dateLabel = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export async function fetchMyBookings(userId) {
  const { data: rows, error } = await supabase.from('bookings')
    .select('id, student_id, cfi_id, plane_id, starts_at, goal, flight_hours, ground_hours, status, quote, actual_hobbs, final_split, card_ready, cancel_reason, cancelled_by')
    .order('starts_at', { ascending: false }).limit(200);
  if (error) throw error;
  const planeIds = [...new Set(rows.map((b) => b.plane_id).filter(Boolean))];
  const people = [...new Set(rows.flatMap((b) => [b.student_id, b.cfi_id]).filter(Boolean))];
  const [{ data: planes }, { data: profiles }, { data: ledger }] = await Promise.all([
    planeIds.length ? supabase.from('planes').select('id, tail, make, model, owner_id').in('id', planeIds) : { data: [] },
    people.length ? supabase.from('profiles').select('id, full_name').in('id', people) : { data: [] },
    supabase.from('ledger').select('booking_id, kind, amount').eq('party_id', userId),
  ]);
  const planeBy = Object.fromEntries((planes || []).map((p) => [p.id, p]));
  const nameBy = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name || 'Pilot']));

  return rows.map((b) => {
    const plane = planeBy[b.plane_id];
    const role = b.student_id === userId ? 'student' : b.cfi_id === userId ? 'cfi' : plane?.owner_id === userId ? 'owner' : null;
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
      quote: b.quote, total: final ? final.total : b.quote?.total || 0, final,
      actualHobbs: b.actual_hobbs != null ? Number(b.actual_hobbs) : null,
      share, method: 'card',
      // For the instructor/owner: was their share paid out, or held until payouts are set up?
      payout: mine.some((l) => l.kind.startsWith('payout_')) ? 'paid' : mine.some((l) => l.kind.startsWith('held_')) ? 'held' : null,
      cancel: b.status === 'cancelled' ? { reason: b.cancel_reason || 'Cancelled', fee: lateFee ? Number(lateFee.amount) : 0 } : undefined,
    };
  }).filter((r) => r.role);
}

// confirm | decline | cancel | complete  (see supabase/functions/booking-action)
export const bookingAction = (bookingId, action, extra = {}) => callFn('booking-action', { bookingId, action, ...extra });

// Payouts (Stripe Connect Express). Opens Stripe's hosted setup, then re-checks status.
export async function setUpPayouts() {
  const { url } = await callFn('connect', {});
  if (Platform.OS === 'web') window.open(url, '_blank');
  else await WebBrowser.openAuthSessionAsync(url, 'rightseat://payouts');
  return checkPayouts();
}
export const checkPayouts = () => callFn('connect', { check: true });
