// Deterministic demo dataset for the admin console, built from the app's own seed data and fee rules
// so numbers match what users see in the app.
import { CFIS, PLANES, SCHOOLS, AIRPORTS, SEED_PAIRS, AFFILIATIONS } from '../../../src/data.js';
import { quote, FEES, r2 } from '../../../src/logic.js';
import { extract, runChecks, decide, MINIMUMS } from '../../../src/verification.js';

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const day = (n, h = 10) => { const d = new Date(); d.setHours(h, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString(); };
export const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const FIRST = ['Sam', 'Alyssa', 'Ben', 'Nina', 'Greg', 'Chris', 'Omar', 'Leah', 'Tyler', 'Mark', 'Kevin', 'Dana', 'Jordan', 'Priscilla', 'Luis', 'Hannah', 'Eli', 'Maya', 'Noah', 'Grace', 'Ethan', 'Zoe', 'Caleb', 'Ava', 'Isaac', 'Mia', 'Owen', 'Lily', 'Ryan', 'Sofia', 'Wyatt', 'Chloe', 'Aaron', 'Ivy'];
const LAST = ['Carter', 'Kim', 'Thompson', 'Rossi', 'Patel', 'Diaz', 'Hassan', 'Morgan', 'Brooks', 'Webb', 'Shah', 'Fields', 'Reed', 'Nguyen', 'Garcia', 'Cole', 'Price', 'Bell', 'Ward', 'Ortiz', 'James', 'Lee', 'Foster', 'Hughes', 'Gray', 'Ruiz', 'Kelly', 'Long', 'Stone', 'Perry', 'Hayes', 'Ford', 'Ross', 'Lane'];
const STAGES = ['Discovery', 'Student pilot', 'Student pilot', 'Student pilot', 'Private pilot', 'Instrument student', 'Returning pilot'];

export function buildDemo() {
  seed = 42;
  const students = FIRST.map((f, i) => ({
    id: 'u' + (i + 1),
    name: `${f} ${LAST[i]}`,
    email: `${f.toLowerCase()}.${LAST[i].toLowerCase()}@example.com`,
    role: 'Student',
    airport: pick(AIRPORTS).code,
    stage: STAGES[i % STAGES.length],
    joined: day(-Math.floor(rnd() * 120) - 3),
    status: i === 17 ? 'Suspended' : 'Active',
    verified: i % 9 === 4 ? 'Pending' : 'Verified',
    notes: [],
  }));

  const cfiUsers = CFIS.map((c) => ({
    id: c.id, name: c.name, email: `${c.name.split(' ')[0].toLowerCase()}@cfi.example`, role: 'CFI', airport: c.homeAirport,
    stage: c.certs.join(' · '), joined: day(-200 - Math.floor(rnd() * 200)), status: 'Active', verified: c.id === 'c3' ? 'Pending' : 'Verified',
    pro: c.pro, schoolId: c.schoolId || null, notes: [],
  }));
  const ownerNames = [...new Set(PLANES.filter((p) => p.ownerType !== 'Flight school').map((p) => p.ownerName))];
  const owners = ownerNames.map((n, i) => ({
    id: 'o' + (i + 1), name: n, email: `owner${i + 1}@example.com`, role: 'Owner', airport: PLANES.find((p) => p.ownerName === n).homeAirport,
    stage: `${PLANES.filter((p) => p.ownerName === n).length} aircraft`, joined: day(-150 - i * 20), status: 'Active', verified: 'Verified', notes: [],
  }));
  const schoolUsers = SCHOOLS.map((s) => ({ id: s.id, name: s.name, email: `admin@${s.website}`, role: 'School', airport: s.homeAirport, stage: s.trainingTypes.join(' & '), joined: day(-300), status: 'Active', verified: 'Verified', notes: [] }));

  // ---- bookings over the last 8 weeks + next 2
  const bookings = [];
  const completedPairs = new Set();
  let n = 1;
  for (let d = -56; d <= 12; d++) {
    const perDay = d > 0 ? 1 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * (3 + Math.floor((d + 56) / 14)));
    for (let k = 0; k < perDay; k++) {
      const st = pick(students);
      if (st.status === 'Suspended' && d > -20) continue;
      const solo = rnd() < 0.12;
      const cfi = solo ? null : pick(CFIS);
      const pid = cfi ? pick(cfi.aircraftIds) : null;
      const plane = cfi ? PLANES.find((p) => p.id === pid) : pick(PLANES.filter((p) => p.soloRental));
      const fh = r2(1 + Math.round(rnd() * 4) * 0.25);
      const gh = cfi ? 0.5 : 0;
      const pairKey = `${st.id}|${cfi ? cfi.id : plane.id}`;
      const repeat = completedPairs.has(pairKey);
      const method = rnd() < 0.45 ? 'wallet' : 'card';
      const aff = cfi ? AFFILIATIONS.find((a) => a.cfiId === cfi.id && a.status === 'active') : null;
      const q = quote({ cfi, plane, flightHours: fh, groundHours: gh, repeat, prepaid: method === 'wallet', cfiPro: cfi?.pro, method, affiliation: aff });
      let status = d > 0 ? (rnd() < 0.7 ? 'Confirmed' : 'Pending') : 'Completed';
      if (d <= 0 && rnd() < 0.07) status = 'Cancelled';
      const when = day(d, pick([8, 10, 12, 14, 16, 18]));
      const b = {
        id: 'B' + String(1000 + n++), studentId: st.id, cfiId: cfi?.id || null, planeId: plane.id, when, flightHours: fh, groundHours: gh,
        goal: solo ? 'Solo rental' : pick(['Private Pilot lesson', 'Instrument lesson', 'Dual cross-country', 'Discovery flight', 'Flight review (BFR)', 'Night flying', 'Assessment flight']),
        status, repeat, method, schoolId: aff?.schoolId || null, total: q.total, split: q.split, bookingFee: q.bookingFee, protection: q.protection, cancelFee: 0, refunded: 0, timeline: [],
      };
      if (status === 'Cancelled') {
        b.cancelReason = pick(['Weather', 'Weather', 'Personal / schedule change', 'Aircraft maintenance / squawk']);
        b.cancelFee = b.cancelReason.startsWith('Personal') && rnd() < 0.5 && cfi ? r2(cfi.flightRate * fh * FEES.lateCancel) : 0;
      }
      if (status === 'Completed') completedPairs.add(pairKey);
      b.timeline = [
        { at: day(d - 3, 9), text: 'Requested by student' },
        ...(status !== 'Pending' ? [{ at: day(d - 2, 11), text: `Confirmed by ${cfi ? cfi.name : plane.ownerName}` }] : []),
        ...(status === 'Completed' ? [{ at: day(d, 19), text: `Closed out · Hobbs ${fh} hr · charged ${method === 'wallet' ? 'wallet' : 'card'}` }, { at: day(d + 2, 9), text: 'Payouts sent' }] : []),
        ...(status === 'Cancelled' ? [{ at: day(d - 1, 8), text: `Cancelled · ${b.cancelReason}${b.cancelFee ? ` · fee $${b.cancelFee}` : ''}` }] : []),
      ];
      bookings.push(b);
    }
  }
  bookings.reverse();

  // ---- disputes
  const done = bookings.filter((b) => b.status === 'Completed');
  const disputes = [
    { id: 'D1', bookingId: done[3].id, reason: 'Hobbs time looks wrong', detail: 'Student says engine was running ~0.2 hr less than billed.', amount: r2(done[3].total * 0.12), status: 'Open', opened: day(-2) },
    { id: 'D2', bookingId: done[9].id, reason: 'Instructor no-show / late', detail: 'CFI arrived 35 minutes late; lesson shortened.', amount: r2(done[9].total * 0.25), status: 'Open', opened: day(-4) },
    { id: 'D3', bookingId: done[20].id, reason: 'Aircraft issue during flight', detail: 'Alternator light; returned early. Owner agreed to waive rental.', amount: done[20].split.owner, status: 'Resolved', resolution: 'Partial refund (aircraft portion)', opened: day(-12) },
    { id: 'D4', bookingId: done[31].id, reason: 'Charged incorrectly', detail: 'Booked with wallet but card was charged.', amount: done[31].total, status: 'Resolved', resolution: 'Moved charge to wallet; card refunded', opened: day(-20) },
  ];
  disputes.forEach((x) => (bookings.find((b) => b.id === x.bookingId).dispute = x.id));

  // ---- payouts (weekly per CFI / owner)
  const payouts = [];
  for (let w = 0; w < 6; w++) {
    const start = day(-7 * (w + 1)); const end = day(-7 * w);
    const inWeek = done.filter((b) => b.when >= start && b.when < end);
    const by = {};
    inWeek.forEach((b) => {
      if (b.cfiId) by[b.cfiId] = (by[b.cfiId] || 0) + b.split.cfi;
      if (b.split.school) by['school:' + b.schoolId] = (by['school:' + b.schoolId] || 0) + b.split.school;
      const pl = PLANES.find((p) => p.id === b.planeId);
      by['plane:' + pl.ownerName] = (by['plane:' + pl.ownerName] || 0) + b.split.owner;
    });
    Object.entries(by).forEach(([k, amt]) => {
      const isSchool = k.startsWith('school:');
      const isCfi = !k.startsWith('plane:') && !isSchool;
      payouts.push({ id: `P${w}${k}`, to: isSchool ? SCHOOLS.find((x) => x.id === k.slice(7)).name : isCfi ? CFIS.find((c) => c.id === k).name : k.slice(6), kind: isSchool ? 'Flight school (instruction share)' : isCfi ? 'Instructor' : 'Aircraft owner', amount: r2(amt), week: fmtDate(start) + '–' + fmtDate(end), status: w === 0 ? (rnd() < 0.4 ? 'Instant · paid' : 'Scheduled') : 'Paid', at: end });
    });
  }

  // ---- reviews (moderation)
  const reviews = [
    ...CFIS.flatMap((c) => c.reviews.map((r, i) => ({ id: `R-${c.id}-${i}`, target: c.name, kind: 'Instructor', ...r, status: 'Published' }))),
    ...PLANES.flatMap((p) => (p.reviews || []).map((r, i) => ({ id: `R-${p.id}-${i}`, target: `${p.tail} · ${p.make} ${p.model}`, kind: 'Aircraft', ...r, status: 'Published' }))),
    { id: 'R-x1', target: 'Tom Okafor', kind: 'Instructor', name: 'Tyler B.', verified: true, role: 'Student', lesson: 'Tailwheel', date: 'Oct 2026', rating: 1, text: 'Total scam, call me instead at 813-555-0101 and I’ll tell you about a better CFI.', tags: [], status: 'Reported', reportReason: 'Contains contact info / solicitation' },
    { id: 'R-x2', target: 'N7340P · Piper PA-28-161', kind: 'Aircraft', name: 'Leah M.', verified: true, role: 'Renter', lesson: 'Solo rental', date: 'Oct 2026', rating: 2, text: 'Left nav light was out and nobody told me before the flight.', tags: ['Accurate squawk list'], status: 'Reported', reportReason: 'Owner disputes accuracy' },
  ];

  // ---- flagged messages
  const flags = [
    { id: 'F1', from: 'Leah Morgan', to: 'Priya Nandakumar', text: 'Can you just text me at [number hidden] and I can venmo you?', reason: 'Phone number + Venmo', masked: true, at: day(-1, 15), status: 'Open' },
    { id: 'F2', from: 'Greg Patel', to: 'Sarah Whitfield', text: 'Want to skip the app fee next time? I can pay cash.', reason: 'Off-app payment', masked: false, at: day(-3, 11), status: 'Open' },
    { id: 'F3', from: 'Leah Morgan', to: 'Priya Nandakumar', text: 'My email is [email hidden]', reason: 'Email address', masked: true, at: day(-5, 9), status: 'Open' },
    { id: 'F4', from: 'Tyler Brooks', to: 'Tom Okafor', text: 'call me', reason: 'Off-app contact', masked: false, at: day(-9, 18), status: 'Dismissed' },
  ];

  // ---- verification queue (same rules as the app/server)
  const mk = (id, who, role, type, ctx, scenario, overrides, submitted) => {
    const ex = extract(type, scenario, ctx);
    const fields = { ...ex.fields, ...(overrides.fields || {}) };
    const confidence = overrides.confidence ?? ex.confidence;
    const checks = runChecks(type, fields, ctx, confidence);
    return { id, who, role, type, fields, checks, confidence, reasons: decide(checks, confidence, false).reasons, submitted, state: 'pending' };
  };
  const p2 = PLANES.find((p) => p.id === 'p2');
  const p5 = PLANES.find((p) => p.id === 'p5');
  const queue = [
    mk('v1', 'Tom Okafor', 'Instructor', 'cfiIns', { name: 'Tom Okafor' }, 'clean', { fields: { insured: 'Thomas A. Okafor' }, confidence: 0.84 }, day(0, 9)),
    mk('v2', 'Bay Area Flyers Club', 'Aircraft · N7340P', 'annual', { name: 'Bay Area Flyers Club', plane: p2 }, 'review', {}, day(0, 8)),
    mk('v3', 'Dana Fields', 'New instructor', 'cfiCert', { name: 'Dana Fields' }, 'review', {}, day(-1, 16)),
    mk('v4', 'Kevin Shah', 'Renter', 'medical', { name: 'Kevin Shah' }, 'clean', { confidence: 0.61 }, day(-1, 11)),
    mk('v5', 'Skyline Aviation', 'Aircraft · N815SR', 'registration', { name: 'Skyline Aviation', plane: p5 }, 'review', {}, day(-2, 14)),
  ];

  const listings = PLANES.map((p) => ({
    ...p, status: p.id === 'p4' ? 'Paused' : 'Active', pausedReason: p.id === 'p4' ? 'Insurance expired (auto-paused)' : null,
    insuranceExpires: day(p.id === 'p4' ? -1 : 60 + Math.floor(rnd() * 200)), annualDue: day(30 + Math.floor(rnd() * 300)),
  }));

  const jobs = [
    { key: 'aircraft', name: 'FAA aircraft registry sync', schedule: 'Nightly · 12:15 AM CT', last: day(0, 1), result: 'Re-checked 52 aircraft · 0 changes', status: 'Healthy' },
    { key: 'airmen', name: 'FAA airmen registry sync', schedule: 'Monthly · 3rd', last: day(-28, 3), result: 'Re-checked 138 pilots & CFIs · 1 rating added', status: 'Healthy' },
    { key: 'sweep', name: 'Expiration sweep', schedule: 'Daily · 6:00 AM ET', last: day(0, 6), result: '3 reminders · 1 listing auto-paused', status: 'Healthy' },
    { key: 'broker', name: 'Broker confirmations', schedule: 'Daily · 10:00 AM ET', last: day(0, 10), result: '2 awaiting reply · 9 confirmed this month', status: 'Healthy' },
    { key: 'stripe', name: 'Stripe webhooks', schedule: 'Real-time', last: day(0, 9), result: '47 identity checks · 0 failed deliveries', status: 'Healthy' },
  ];

  const settings = {
    fees: { studentNew: FEES.studentNew, cfiNew: FEES.cfiNew, owner: FEES.owner, protectionPerHr: FEES.protectionPerHr, deposit: FEES.deposit, lateCancel: FEES.lateCancel, instantPayout: FEES.instantPayout },
    minimums: { ...MINIMUMS, autoApproveConfidence: 0.9 },
    plans: { cfiPro: 29, schoolStarter: 99, schoolPro: 249 },
  };

  const team = [
    { id: 't1', name: 'Jacob Henderson', email: 'jacob@rightseat.example', role: 'Owner', lastActive: day(0, 10) },
    { id: 't2', name: 'Maria Lopez', email: 'maria@rightseat.example', role: 'Reviewer', lastActive: day(0, 8) },
    { id: 't3', name: 'Dev Patel', email: 'dev@rightseat.example', role: 'Support', lastActive: day(-1, 17) },
  ];

  const audit = [
    { at: day(0, 8), actor: 'Maria Lopez', action: 'Approved document', target: 'Jenna Liu · Instructor liability insurance', note: 'Name variation OK' },
    { at: day(-1, 17), actor: 'Dev Patel', action: 'Issued refund', target: 'Booking ' + done[31].id, note: 'Moved charge to wallet; card refunded' },
    { at: day(-1, 6), actor: 'System', action: 'Auto-paused listing', target: 'N22CW · Piper J-3 Cub', note: 'Insurance expired' },
    { at: day(-2, 14), actor: 'Jacob Henderson', action: 'Changed setting', target: 'Instant payout fee', note: '1.0% → 1.5%' },
  ];

  return { users: [...students, ...cfiUsers, ...owners, ...schoolUsers], bookings, disputes, payouts, reviews, flags, queue, listings, jobs, settings, team, audit, pairs: SEED_PAIRS, cfis: CFIS, planes: PLANES, schools: SCHOOLS };
}
