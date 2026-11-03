// Lessons an instructor booked for a student: confirmed once the student's card is
// saved, unless the proposal ran out first. Used by booking-action and the Stripe webhook.
import { admin, audit } from './server.ts';

export async function confirmProposalIfReady(bookingId: string) {
  const { data: b } = await admin.from('bookings').select('id, status, card_ready, proposal_expires, student_id').eq('id', bookingId).single();
  if (!b || b.status !== 'proposed') return b?.status || null;
  if (!b.card_ready) return 'proposed';
  if (b.proposal_expires && new Date(b.proposal_expires).getTime() <= Date.now()) return 'proposed'; // the sweep releases it
  const { data: won } = await admin.from('bookings').update({ status: 'confirmed' }).eq('id', b.id).eq('status', 'proposed').select('id');
  if (won?.length) await audit(b.student_id, 'booking.proposal_accepted', b.id);
  return 'confirmed';
}
