// Flight Schedule Pro switch-over, server side: book imported reservations once everyone
// needed has joined. Used by the school-import function and the hourly booking sweep.
import { admin, audit } from './server.ts';
import { priceBooking } from './bookings.js';
import { feeContext } from './feeContext.ts';
import { matchReservation, importedProposalExpires } from './fspImport.js';

// The school's people (invites + instructors already affiliated) and fleet, in the shape
// matchReservation expects.
async function schoolContext(schoolId: string) {
  const [{ data: invites }, { data: affs }, { data: planes }] = await Promise.all([
    admin.from('school_invites').select('email, full_name, role, status, user_id').eq('school_id', schoolId).neq('status', 'removed'),
    admin.from('affiliations').select('cfi_id').eq('school_id', schoolId).eq('status', 'active'),
    admin.from('planes').select('id, tail, published, airworthy_verified, insured').eq('school_id', schoolId),
  ]);
  const ids = [...new Set([...(invites || []).filter((i: any) => i.user_id).map((i: any) => i.user_id), ...(affs || []).map((a: any) => a.cfi_id)])];
  const [{ data: cfis }, { data: profiles }] = ids.length
    ? await Promise.all([
      admin.from('cfis').select('id, published, verified').in('id', ids),
      admin.from('profiles').select('id, full_name').in('id', ids),
    ])
    : [{ data: [] }, { data: [] }];
  const ready = new Set((cfis || []).filter((c: any) => c.published && c.verified).map((c: any) => c.id));
  const nameOf = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.full_name]));
  const people = (invites || []).map((i: any) => ({
    userId: i.user_id, email: i.email, name: i.full_name || nameOf[i.user_id] || '', role: i.role,
    joined: i.status === 'joined' && !!i.user_id, cfiReady: ready.has(i.user_id),
  }));
  for (const a of affs || []) {
    if (!people.some((p: any) => p.userId === a.cfi_id && p.role === 'cfi'))
      people.push({ userId: a.cfi_id, email: '', name: nameOf[a.cfi_id] || '', role: 'cfi', joined: true, cfiReady: ready.has(a.cfi_id) });
  }
  const fleet = (planes || []).map((p: any) => ({ id: p.id, tail: p.tail, ready: p.published && p.airworthy_verified && p.insured }));
  return { people, planes: fleet, raw: planes || [] };
}

async function clashes(col: string, id: string, start: string, end: string) {
  const nowIso = new Date().toISOString();
  const { count } = await admin.from('bookings').select('id', { count: 'exact', head: true })
    .eq(col, id).lt('starts_at', end).gt('ends_at', start)
    .or(`status.eq.confirmed,and(status.eq.requested,card_ready.eq.true),and(status.eq.proposed,proposal_expires.gt.${nowIso})`);
  return (count || 0) > 0;
}

// Book every waiting reservation of a school that's ready. Returns counts by outcome.
export async function convertReservations(schoolId: string) {
  const { data: rows } = await admin.from('school_import_reservations').select('*').eq('school_id', schoolId).eq('status', 'waiting').order('starts_at').limit(1000);
  const out = { booked: 0, waiting: 0, skipped: 0, expired: 0 };
  if (!rows?.length) return out;
  const ctx = await schoolContext(schoolId);
  const now = new Date();
  for (const r of rows) {
    const m = matchReservation(r, { people: ctx.people, planes: ctx.planes, now });
    if (m.status !== 'ready') {
      if (m.status !== r.status || m.note !== r.note) await admin.from('school_import_reservations').update({ status: m.status, note: m.note, updated_at: now.toISOString() }).eq('id', r.id);
      out[m.status as 'waiting' | 'skipped' | 'expired']++;
      continue;
    }
    const skip = async (note: string) => {
      await admin.from('school_import_reservations').update({ status: 'skipped', note, updated_at: now.toISOString() }).eq('id', r.id);
      out.skipped++;
    };
    if (await clashes('cfi_id', m.cfiId, r.starts_at, r.ends_at)) { await skip('The instructor already has a Positive Rate lesson then.'); continue; }
    if (m.planeId && await clashes('plane_id', m.planeId, r.starts_at, r.ends_at)) { await skip(`${r.tail} is already booked then on Positive Rate.`); continue; }
    const [{ data: cfi }, planeRes, { data: affiliation }] = await Promise.all([
      admin.from('cfis').select('*').eq('id', m.cfiId).single(),
      m.planeId ? admin.from('planes').select('*').eq('id', m.planeId).single() : Promise.resolve({ data: null }),
      admin.from('affiliations').select('*').eq('cfi_id', m.cfiId).eq('status', 'active').maybeSingle(),
    ]);
    const plane = planeRes.data;
    const fees = await feeContext({ studentId: m.studentId, affiliation, plane });
    const flightHours = Number(r.flight_hours);
    const q = priceBooking({ cfi, plane, affiliation, flightHours, groundHours: 0, repeat: false, prepaid: false, ...fees });
    const expires = importedProposalExpires(r.starts_at, now);
    const { data: booking, error } = await admin.from('bookings').insert({
      student_id: m.studentId, cfi_id: m.cfiId, plane_id: m.planeId, affiliation_id: affiliation?.id || null,
      starts_at: r.starts_at, ends_at: r.ends_at, goal: r.goal, flight_hours: flightHours, ground_hours: 0,
      status: 'proposed', quote: q, proposed_by: m.cfiId, proposal_expires: expires.toISOString(),
    }).select('id').single();
    if (error) { console.error('import booking', r.id, error); await skip('Couldn’t book this one. Book it by hand.'); continue; }
    await admin.from('school_import_reservations').update({ status: 'booked', note: '', booking_id: booking.id, updated_at: now.toISOString() }).eq('id', r.id);
    await audit(null, 'booking.imported', booking.id, { school: schoolId, reservation: r.id, total: q.total });
    out.booked++;
  }
  return out;
}

// Every school with reservations still waiting (the hourly sweep).
export async function convertAllReservations() {
  const { data } = await admin.from('school_import_reservations').select('school_id').eq('status', 'waiting').limit(5000);
  const schools = [...new Set((data || []).map((d: any) => d.school_id))];
  let booked = 0;
  for (const s of schools) {
    await admin.rpc('link_school_invites', { p_school: s });
    booked += (await convertReservations(s)).booked;
  }
  return booked;
}
