// Builds supabase/demo/run.sql: demo lessons in Jacob's CFI queue (sandbox Stripe only).
// Everything uses fixed ids (d000… students, e000… bookings), so it can be re-run or removed.
import fs from 'node:fs';
import { quote } from '../../src/pricing.js';

const JACOB = '24b9cbd5-53ce-4a4a-bd52-32b09b913190';
const TEST = 'a0000000-0000-4000-8000-000000000001'; // "Test Pilot (sandbox)"
const MAYA = 'd0000000-0000-4000-8000-000000000001';
const LUKE = 'd0000000-0000-4000-8000-000000000002';
const PLANE = 'b0000000-0000-4000-8000-000000000001';
const CUSTOMER = 'cus_VXnH92cxHlqV1f';              // sandbox customer
const CARD_SI = 'seti_1UXS6LA2ow9bJ7z2ufetEbKz';    // succeeded test-card setup
const cfi = { flightRate: 70, groundRate: 50 };
const plane = { wetRate: 160, blockRate: 150 };
const q = (fh, gh) => {
  const r = quote({ cfi, plane, flightHours: fh, groundHours: gh, repeat: false, prepaid: false, cfiPro: false });
  return { ...r, inputs: { cfi, plane, cfiPro: false, repeat: false, prepaid: false, affiliation: null } };
};
const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const js = (o) => `${lit(JSON.stringify(o))}::jsonb`;
const bid = (n) => `e0000000-0000-4000-8000-00000000000${n}`;

const lessons = [
  { n: 1, student: MAYA, at: '2026-11-07T14:00:00Z', fh: 1.5, gh: 0.5, goal: 'Pattern work & landings', status: 'requested', card: true },
  { n: 2, student: LUKE, at: '2026-11-08T18:00:00Z', fh: 1.0, gh: 0, goal: 'Discovery flight', status: 'requested', card: false },
  { n: 3, student: TEST, at: '2026-11-09T15:00:00Z', fh: 1.5, gh: 0.5, goal: 'Steep turns & slow flight', status: 'confirmed', card: true },
  { n: 4, student: MAYA, at: '2026-11-05T13:00:00Z', fh: 1.3, gh: 0.3, goal: 'Short & soft field takeoffs and landings', status: 'confirmed', card: true },
  { n: 5, student: LUKE, at: '2026-11-11T21:00:00Z', fh: 1.2, gh: 0.3, goal: 'Ground reference maneuvers', status: 'proposed', card: false, proposed: '2026-11-07T21:00:00Z' },
  { n: 6, student: TEST, at: '2026-11-03T14:00:00Z', fh: 1.4, gh: 0.5, goal: 'Stalls & emergency procedures', status: 'completed', card: true, hobbs: 1.4, pay: 'await_cfi' },
  { n: 7, student: MAYA, at: '2026-11-01T15:00:00Z', fh: 1.2, gh: 0.5, goal: 'First lesson: the four fundamentals', status: 'completed', card: true, hobbs: 1.1, pay: 'held_cfi', debrief: true },
  { n: 8, student: LUKE, at: '2026-10-30T19:00:00Z', fh: 1.0, gh: 0, goal: 'Discovery flight', status: 'cancelled', card: false, cancel: 'Weather. Student will rebook.' },
];

let sql = `begin;
-- clean slate for demo rows
delete from public.ledger where booking_id::text like 'e0000000-%';
delete from public.debriefs where booking_id::text like 'e0000000-%';
delete from public.preflight_reviews where booking_id::text like 'e0000000-%';
delete from public.notifications where data->>'bookingId' like 'e0000000-%' or data->>'booking_id' like 'e0000000-%';
delete from public.bookings where id::text like 'e0000000-%';

-- two demo students who can't sign in (no password, unconfirmed test address)
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at) values
 ('00000000-0000-0000-0000-000000000000', '${MAYA}', 'authenticated', 'authenticated', 'demo-student-1@mail.flyingrightseat.com', '{"full_name":"Maya Torres (demo)"}', '{"provider":"email","providers":["email"]}', now(), now()),
 ('00000000-0000-0000-0000-000000000000', '${LUKE}', 'authenticated', 'authenticated', 'demo-student-2@mail.flyingrightseat.com', '{"full_name":"Luke Bennett (demo)"}', '{"provider":"email","providers":["email"]}', now(), now())
on conflict (id) do nothing;
insert into public.profiles (id, full_name, roles, home_airport, onboarded, stripe_customer_id) values
 ('${MAYA}', 'Maya Torres (demo)', '{student}', 'KPIE', true, '${CUSTOMER}'),
 ('${LUKE}', 'Luke Bennett (demo)', '{student}', 'KPIE', true, '${CUSTOMER}')
on conflict (id) do update set full_name = excluded.full_name, onboarded = true, stripe_customer_id = excluded.stripe_customer_id;
`;

for (const l of lessons) {
  const qt = q(l.fh, l.gh);
  const end = new Date(new Date(l.at).getTime() + (l.fh + l.gh) * 3600e3).toISOString();
  let final = null;
  if (l.status === 'completed') {
    const f = q(l.hobbs, l.gh);
    final = { ...f.split, final: { total: f.total, instruction: f.instruction, ground: f.ground, aircraft: f.aircraft, bookingFee: f.bookingFee, protection: f.protection, flightHours: l.hobbs, groundHours: l.gh } };
    l.share = f.split.cfi;
  }
  sql += `insert into public.bookings (id, student_id, cfi_id, plane_id, starts_at, ends_at, goal, flight_hours, ground_hours, status, quote, card_ready, setup_intent_id, actual_hobbs, final_split, proposed_by, proposal_expires, cancel_reason, cancelled_by)
values ('${bid(l.n)}', '${l.student}', '${JACOB}', '${PLANE}', '${l.at}', '${end}', ${lit(l.goal)}, ${l.fh}, ${l.gh}, '${l.status}', ${js(qt)}, ${l.card}, ${l.card ? lit(CARD_SI) : 'null'}, ${l.hobbs ?? 'null'}, ${final ? js(final) : 'null'}, ${l.proposed ? `'${JACOB}'` : 'null'}, ${lit(l.proposed)}, ${lit(l.cancel)}, ${l.cancel ? `'${l.student}'` : 'null'});\n`;
  if (l.pay) sql += `insert into public.ledger (booking_id, party_id, kind, amount) values ('${bid(l.n)}', '${JACOB}', '${l.pay}', ${l.share});\n`;
  if (l.debrief) sql += `insert into public.debriefs (booking_id, student_id, cfi_id, flown_on, went_well, needs_work, next_plan, locked_at) values ('${bid(l.n)}', '${l.student}', '${JACOB}', '${l.at.slice(0, 10)}', 'Good preflight and checklist use. Held altitude within 100 ft in straight and level.', 'Coordination in turns; trim more often.', 'Slow flight and power-off stalls, then pattern work.', now());\n`;
}

sql += `
-- a message thread so the Inbox has something in it
insert into public.threads (a, b, last_message_at) values ('${MAYA}', '${JACOB}', now()) on conflict (a, b) do update set last_message_at = now();
insert into public.messages (thread_id, sender_id, body, created_at)
select id, '${MAYA}', 'Hi Jacob! Looking forward to Saturday. Should I bring anything besides my logbook and headset?', now() from public.threads where a = '${MAYA}' and b = '${JACOB}'
  and not exists (select 1 from public.messages m join public.threads t on t.id = m.thread_id where t.a = '${MAYA}' and t.b = '${JACOB}');
commit;
select b.goal, b.status, b.starts_at, s.full_name as student, (select string_agg(kind || ' ' || amount, ', ') from public.ledger l where l.booking_id = b.id) as pay
from public.bookings b join public.profiles s on s.id = b.student_id where b.id::text like 'e0000000-%' order by b.starts_at;
`;
fs.writeFileSync(new URL('./run.sql', import.meta.url), sql);
console.log('wrote run.sql');
