// Deterministic sample data for the admin console's demo mode (no server needed).
// Mirrors the shapes the server's /api/admin endpoints return.

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(42);
const pick = (a) => a[Math.floor(R() * a.length)];
const between = (a, b) => a + R() * (b - a);
const round2 = (n) => Math.round(n * 100) / 100;
const DAY = 864e5;
const now = Date.now();
const daysAgo = (d, h = 9) => { const x = new Date(now - d * DAY); x.setHours(h, 0, 0, 0); return x.toISOString(); };

export const FEES = { studentNew: 10, cfiNew: 0.05, owner: 0.08, protectionPerHr: 0, deposit: 0, instantPayout: 0.015, lateCancel: 0.5, autoApproveConfidence: 0.9, renterLiability: 1000000, ownerLiability: 1000000 };

const CFIS = [
  ['c1', 'Marcus Reyes', 'KPIE', 75, 4.9, 47, 1180, true, 'Gulf Coast Flight Academy'],
  ['c2', 'Sarah Whitfield', 'KCLW', 65, 5.0, 23, 340, false, null],
  ['c3', 'Tom Okafor', 'KBKV', 70, 4.9, 61, 610, false, null],
  ['c4', 'Priya Nandakumar', 'KVDF', 90, 4.8, 29, 890, true, 'Skyline Aviation'],
  ['c5', 'Jenna Liu', 'KPIE', 68, 4.8, 33, 720, false, 'Gulf Coast Flight Academy'],
  ['c6', 'Dana Whitlock', 'KVDF', 72, 0, 0, 0, false, null],
  ['c7', 'Luis Ortega', 'KSPG', 70, 4.7, 18, 260, false, null],
  ['c8', 'Hannah Brooks', 'KLAL', 66, 4.9, 12, 150, false, null],
];
const PLANES = [
  ['p1', 'N4821R', 'Cessna 172S', 'Gulf Coast Flight Academy', 'Flight school', 'KPIE', 165, 27.7, 0, 4.9],
  ['p2', 'N7340P', 'Piper PA-28-161', 'Bay Area Flyers Club', 'Flying club', 'KCLW', 139, 6.5, 1, 4.7],
  ['p3', 'N36SE', 'Piper PA-44-180', 'Gulf Coast Flight Academy', 'Flight school', 'KPIE', 349, 64.6, 0, 4.8],
  ['p4', 'N22CW', 'Piper J-3 Cub', 'Ray Thompson', 'Private owner', 'KBKV', 135, 89.9, 0, 5.0],
  ['p5', 'N815SR', 'Cirrus SR20 G6', 'Skyline Aviation (leaseback)', 'Leaseback', 'KVDF', 255, 79.3, 0, 4.9],
  ['p6', 'N152GC', 'Cessna 152', 'Gulf Coast Flight Academy', 'Flight school', 'KPIE', 125, 51.8, 0, 4.6],
  ['p7', 'N5512K', 'Cessna 172N', 'Mike Daley', 'Private owner', 'KSPG', 149, 41.0, 2, 4.5],
  ['p8', 'N91DA', 'Diamond DA40', 'Lakeland Aero Rentals', 'Rental fleet', 'KLAL', 199, 12.2, 0, 4.8],
];
const FIRST = ['Sam', 'Alyssa', 'Ben', 'Nina', 'Greg', 'Chris', 'Omar', 'Leah', 'Tyler', 'Mark', 'Kevin', 'Ava', 'Ethan', 'Maya', 'Noah', 'Zoe', 'Liam', 'Isabel', 'Caleb', 'Grace', 'Diego', 'Harper', 'Jordan', 'Riley', 'Wes', 'Tess', 'Owen', 'Lily'];
const LAST = ['Carter', 'Kim', 'Torres', 'Rossi', 'Patel', 'Diaz', 'Hassan', 'Moore', 'Bishop', 'Wright', 'Shah', 'Nguyen', 'Price', 'Lopez', 'Reed', 'Hart', 'Cole', 'Vega', 'Ford', 'Lane', 'Ruiz', 'Park', 'Fox', 'Gray', 'Bell', 'Ward', 'Nash', 'Rowe'];
const AIRPORTS = ['KPIE', 'KSPG', 'KCLW', 'KVDF', 'KLAL', 'KBKV'];

export function buildDemo() {
  const users = [];
  CFIS.forEach(([id, name, airport, rate, rating, reviews, rsHours, pro, school], i) =>
    users.push({ id, name, role: 'cfi', email: `${name.split(' ')[0].toLowerCase()}@example.com`, airport, joined: daysAgo(300 - i * 25), status: id === 'c6' ? 'pending' : 'active', rate, rating, reviews, rsHours, pro, school, verification: { id: 'approved', cfiCert: id === 'c6' ? 'review' : 'approved', cfiIns: id === 'c3' ? 'review' : 'approved', background: ['c1', 'c2', 'c4'].includes(id) ? 'approved' : 'missing' } })
  );
  FIRST.forEach((f, i) =>
    users.push({ id: 'u' + (i + 1), name: `${f} ${LAST[i]}`, role: 'student', email: `${f.toLowerCase()}.${LAST[i].toLowerCase()}@example.com`, airport: pick(AIRPORTS), joined: daysAgo(Math.floor(between(3, 200))), status: i === 13 ? 'suspended' : 'active', verification: { id: i % 9 === 4 ? 'review' : 'approved', medical: i % 7 === 3 ? 'review' : i % 5 === 0 ? 'missing' : 'approved', pilotCert: 'approved' } })
  );
  [['o1', 'Bay Area Flyers Club'], ['o2', 'Ray Thompson'], ['o3', 'Mike Daley'], ['o4', 'Lakeland Aero Rentals'], ['o5', 'Skyline Aviation (leaseback)']].forEach(([id, name], i) =>
    users.push({ id, name, role: 'owner', email: `owner${i + 1}@example.com`, airport: pick(AIRPORTS), joined: daysAgo(250 - i * 30), status: 'active', verification: { id: 'approved', registration: id === 'o5' ? 'review' : 'approved', ownerIns: id === 'o2' ? 'expired' : 'approved' } })
  );
  [['s1', 'Gulf Coast Flight Academy', 'KPIE', 'School Pro'], ['s2', 'Skyline Aviation', 'KVDF', 'School Starter']].forEach(([id, name, airport, plan]) =>
    users.push({ id, name, role: 'school', email: `admin@${name.split(' ')[0].toLowerCase()}.example`, airport, joined: daysAgo(280), status: 'active', plan, verification: { id: 'approved' } })
  );

  const aircraft = PLANES.map(([id, tail, model, owner, ownerType, airport, rate, to100, squawks, rating]) => ({
    id, tail, model, owner, ownerType, airport, rate, hoursTo100: to100, openSquawks: squawks, rating, featured: id === 'p1',
    status: id === 'p4' ? 'paused' : id === 'p7' ? 'pending' : 'live',
    pauseReason: id === 'p4' ? 'Insurance expired (auto-paused)' : null,
    insuranceExp: daysAgo(-(id === 'p4' ? -1 : 60 + Math.floor(R() * 300))),
  }));

  const students = users.filter((u) => u.role === 'student');
  const GOALS = ['Private Pilot lesson', 'Dual cross-country', 'Night flying', 'Instrument lesson', 'Discovery flight', 'Flight review (BFR)', 'Assessment flight', 'Solo rental', 'Multi-engine', 'Tailwheel'];
  const bookings = [];
  const pairSeen = new Set();
  for (let i = 0; i < 150; i++) {
    const d = Math.floor(between(-10, 84));
    const st = students[Math.floor(Math.pow(R(), 1.6) * students.length)];
    const solo = R() < 0.12;
    const cfiRow = solo ? null : CFIS[Math.floor(Math.pow(R(), 1.3) * 5)];
    const plane = PLANES[Math.floor(R() * PLANES.length)];
    const hours = round2(pick([1, 1.2, 1.5, 1.5, 1.8, 2, 2.5]));
    const ground = solo ? 0 : pick([0, 0.5, 0.5, 1]);
    const key = `${st.id}|${cfiRow ? cfiRow[0] : plane[0]}`;
    const repeat = pairSeen.has(key);
    pairSeen.add(key);
    const instruction = cfiRow ? cfiRow[3] * hours + 55 * ground : 0;
    const aircraftAmt = plane[6] * hours;
    const sub = instruction + aircraftAmt;
    const bookingFee = repeat ? 0 : FEES.studentNew; // flat $ booking fee
    const protection = round2(FEES.protectionPerHr * hours);
    const total = round2(sub + bookingFee + protection);
    const cfiHost = cfiRow && !repeat && !cfiRow[7] ? round2(instruction * FEES.cfiNew) : 0;
    const ownerHost = round2(aircraftAmt * FEES.owner);
    const method = R() < 0.55 ? 'wallet' : 'card';
    const processing = method === 'card' ? round2(total * 0.029 + 0.3) : 0;
    let status = d < 0 ? 'upcoming' : R() < 0.07 ? 'cancelled' : 'completed';
    const when = daysAgo(d, pick([8, 10, 12, 14, 16]));
    bookings.push({
      id: 'B' + String(1040 + i), when, studentId: st.id, studentName: st.name, cfiId: cfiRow?.[0] || null, cfiName: cfiRow?.[1] || null, planeId: plane[0], tail: plane[1], model: plane[2], airport: plane[5],
      goal: solo ? 'Solo rental' : pick(GOALS.slice(0, 7)), hours, ground, total, method, repeat, status,
      fees: { booking: bookingFee, cfiHost, ownerHost, protection, processing },
      payout: { cfi: round2(instruction - cfiHost), owner: round2(aircraftAmt - ownerHost) },
      revenue: round2(bookingFee + cfiHost + ownerHost - processing),
      cancel: status === 'cancelled' ? { reason: pick(['Weather', 'Weather', 'Aircraft maintenance / squawk', 'Personal / schedule change']), fee: 0 } : null,
    });
  }
  bookings.sort((a, b) => new Date(b.when) - new Date(a.when));
  // a few disputes
  const disputes = [
    ['Hobbs time looks wrong', 'Student says Hobbs was 1.3, billed 1.8. Owner photo of Hobbs requested.'],
    ['Instructor no-show / late', 'CFI arrived 40 min late; student asks for ground time to be waived.'],
    ['Aircraft issue during flight', 'Alternator light on climb-out, returned after 0.4. Student billed full block.'],
  ].map(([reason, detail], i) => {
    const b = bookings.filter((x) => x.status === 'completed')[3 + i * 7];
    b.status = 'disputed';
    return { id: 'D' + (201 + i), bookingId: b.id, reason, detail, opened: daysAgo(i + 1), amount: b.total, status: 'open', resolution: null };
  });
  disputes.push({ id: 'D198', bookingId: bookings.filter((x) => x.status === 'completed')[40].id, reason: 'Charged incorrectly', detail: 'Card charged twice for one lesson.', opened: daysAgo(12), amount: 312.4, status: 'resolved', resolution: 'Refunded duplicate charge ($312.40)' });

  const payouts = [];
  let pid = 5000;
  for (let w = 0; w < 6; w++) {
    CFIS.slice(0, 5).forEach(([id, name, , , , , , pro]) => {
      const amt = round2(between(380, 1600));
      payouts.push({ id: 'PO' + pid++, payeeId: id, payee: name, role: 'Instructor', amount: amt, fee: w === 0 && !pro && R() < 0.4 ? round2(amt * 0.015) : 0, instant: w === 0 && R() < 0.4, status: w === 0 ? pick(['pending', 'in_transit']) : 'paid', date: daysAgo(w * 7 + 1) });
    });
    ['Gulf Coast Flight Academy', 'Bay Area Flyers Club', 'Skyline Aviation (leaseback)', 'Ray Thompson'].forEach((name, k) => {
      payouts.push({ id: 'PO' + pid++, payeeId: 'o' + (k + 1), payee: name, role: 'Aircraft owner', amount: round2(between(600, 3200)), fee: 0, instant: false, status: w === 0 ? 'pending' : 'paid', date: daysAgo(w * 7 + 2) });
    });
  }
  payouts.push({ id: 'PO' + pid++, payeeId: 'c3', payee: 'Tom Okafor', role: 'Instructor', amount: 842.5, fee: 0, instant: false, status: 'failed', failure: 'Bank account closed: ask payee to update payout details', date: daysAgo(3) });

  const REVIEW_TEXT = [
    [5, 'Passed my checkride first try. Always prepared.'], [5, 'Super patient with my landings.'], [4, 'Great plane, a bit hard to schedule on weekends.'],
    [5, 'Clean, well maintained, squawks fixed fast.'], [3, 'Lesson ran long and I was billed for the extra ground time without warning.'], [5, 'Best instructor I’ve had.'],
    [2, 'Plane had a flat strut and the owner didn’t answer. Lost my morning.'], [5, 'Got back in the air after 12 years away.'], [4, 'Good value, old paint.'],
  ];
  const reviews = Array.from({ length: 24 }, (_, i) => {
    const [rating, text] = REVIEW_TEXT[i % REVIEW_TEXT.length];
    const cfi = i % 3 !== 2;
    return { id: 'R' + (700 + i), targetType: cfi ? 'Instructor' : 'Aircraft', target: cfi ? CFIS[i % 5][1] : PLANES[i % 6][1], author: students[i % students.length].name, rating, text, date: daysAgo(i * 3 + 1), verified: true, bookingId: bookings[i * 4].id, reported: [4, 6, 15].includes(i), reportReason: i === 4 ? 'Reported by CFI: “billing was explained before the lesson”' : i === 6 ? 'Reported by owner: “strut was inflated at preflight”' : i === 15 ? 'Reported: possible harassment' : null, hidden: false };
  });
  reviews[15].text = 'Instructor was rude and kept texting during the flight. Would not recommend.';

  const flagged = [
    { id: 'M1', from: 'Leah Moore', to: 'Priya Nandakumar', text: 'Can you just text me at [number hidden until first booking]? I can venmo you', reason: 'Contact + off-app payment', at: daysAgo(1, 19), action: null },
    { id: 'M2', from: 'Greg Patel', to: 'Sarah Whitfield', text: 'Want to do the next one cash? Cheaper for both of us', reason: 'Off-app payment', at: daysAgo(2, 12), action: null },
    { id: 'M3', from: 'Tom Okafor', to: 'Tyler Bishop', text: 'Call me at 727-555-0177 and we’ll sort out the Cub', reason: 'Contact shared after booking (allowed)', at: daysAgo(4, 9), action: 'allowed' },
    { id: 'M4', from: 'Kevin Shah', to: 'N7340P · Bay Area Flyers Club', text: 'Is there a way to rent outside the app to skip the fee?', reason: 'Off-app payment', at: daysAgo(5, 15), action: null },
  ];
  const pairs = [
    { student: 'Alyssa Kim', cfi: 'Marcus Reyes', lessons: 31, lastDays: 3, flags: 0 }, { student: 'Ben Torres', cfi: 'Marcus Reyes', lessons: 12, lastDays: 6, flags: 0 },
    { student: 'Nina Rossi', cfi: 'Sarah Whitfield', lessons: 18, lastDays: 2, flags: 0 }, { student: 'Greg Patel', cfi: 'Sarah Whitfield', lessons: 1, lastDays: 34, flags: 1 },
    { student: 'Chris Diaz', cfi: 'Tom Okafor', lessons: 6, lastDays: 12, flags: 0 }, { student: 'Omar Hassan', cfi: 'Jenna Liu', lessons: 14, lastDays: 4, flags: 0 },
    { student: 'Leah Moore', cfi: 'Priya Nandakumar', lessons: 2, lastDays: 29, flags: 2 }, { student: 'Tyler Bishop', cfi: 'Tom Okafor', lessons: 1, lastDays: 45, flags: 0 },
    { student: 'Mark Wright', cfi: 'Priya Nandakumar', lessons: 5, lastDays: 9, flags: 0 }, { student: 'Sam Carter', cfi: 'Marcus Reyes', lessons: 10, lastDays: 3, flags: 0 },
  ];

  const queue = [
    { id: 'V1', who: 'Tom Okafor', role: 'Instructor', docType: 'Instructor liability insurance', submitted: daysAgo(0, 8), confidence: 0.84, reasons: ['Name “Thomas A. Okafor” is a variation of ID name “Tom Okafor”', 'Parts of the document were hard to read'],
      fields: { 'Named insured': 'Thomas A. Okafor', Carrier: 'Sample Aviation Insurance Co.', 'Policy #': 'CFI-20931', 'Liability limit': '$1,000,000', Expires: 'Jul 2027' },
      checks: [['warn', 'Parts of the document were hard to read', 'Document AI · 84%'], ['warn', 'Name is a variation of verified ID', 'Stripe Identity'], ['pass', 'Policy active (243 days left)', 'Rules'], ['pass', 'Liability $1,000,000 meets minimum', 'Rules']] },
    { id: 'V2', who: 'Bay Area Flyers Club', role: 'Aircraft · N7340P', docType: 'Annual inspection', submitted: daysAgo(0, 6), confidence: 0.78, reasons: ['No IA card on file (IA is not in public FAA data)', 'Parts of the document were hard to read'],
      fields: { Date: 'Aug 28, 2026', 'Hobbs at inspection': '9770', 'Signed by': 'R. Delgado', 'A&P certificate #': 'A&P 3412xxxxx', 'IA #': '—' },
      checks: [['warn', 'Parts of the document were hard to read', 'Document AI · 78%'], ['pass', 'Within 12 calendar months', 'Rules'], ['pass', 'R. Delgado found as Mechanic (A&P)', 'FAA Airmen Registry'], ['warn', 'No IA card on file', 'Rules']] },
    { id: 'V3', who: 'Dana Whitlock', role: 'New instructor', docType: 'Flight instructor certificate', submitted: daysAgo(0, 5), confidence: 0.97, reasons: ['2 FAA records share this name in FL. Match the certificate photo.'],
      fields: { Name: 'Dana Whitlock', 'Instructor ratings': 'CFI (ASE) · CFII (INSTA)', 'City / state': 'Tampa, FL' },
      checks: [['warn', '2 FAA records share this name in FL', 'FAA Airmen Registry'], ['pass', 'Name matches verified ID', 'Stripe Identity']] },
    { id: 'V4', who: 'Kevin Shah', role: 'Renter', docType: 'Medical certificate', submitted: daysAgo(0, 3), confidence: 0.61, reasons: ['Parts of the document were hard to read'],
      fields: { Name: 'Kevin Shah', Class: 'Third class', 'Exam date': 'May 2026', 'Valid until': 'May 2028', Limitations: 'None' },
      checks: [['warn', 'Parts of the document were hard to read', 'Document AI · 61%'], ['pass', 'Name matches verified ID', 'Stripe Identity'], ['pass', 'Valid for solo', 'Rules']] },
    { id: 'V5', who: 'Skyline Aviation', role: 'Aircraft · N815SR', docType: 'FAA registration', submitted: daysAgo(1, 16), confidence: 1, reasons: ['Registered to “SKYLINE PARTNERS INC”. Confirm the lister has authority (leaseback).'],
      fields: { 'N-number': 'N815SR', 'Make / model': 'CIRRUS SR20', Year: '2014', 'Registered owner': 'SKYLINE PARTNERS INC', Status: 'Valid', Expires: 'Jun 2030' },
      checks: [['pass', 'N815SR found in FAA Aircraft Registry', 'FAA Aircraft Registry'], ['pass', 'Registration status valid', 'FAA Aircraft Registry'], ['warn', 'Registered owner differs from lister', 'FAA Aircraft Registry']] },
  ];

  const jobs = [
    { id: 'aircraft', name: 'FAA Aircraft Registry sync', schedule: 'Nightly · 12:15 AM CT', last: daysAgo(0, 0), result: 'Re-checked 8 aircraft · 0 changes', health: 'ok' },
    { id: 'airmen', name: 'FAA Airmen Registry sync', schedule: 'Monthly · 3rd', last: daysAgo(28, 3), result: 'Re-checked 41 pilots & CFIs · 1 change: Dana Whitlock added CFII', health: 'ok' },
    { id: 'sweep', name: 'Expiration sweep', schedule: 'Daily · 6:00 AM ET', last: daysAgo(0, 6), result: '3 reminders sent · 1 listing auto-paused (N22CW)', health: 'ok' },
    { id: 'broker', name: 'Broker insurance confirmations', schedule: 'Daily · 10:00 AM ET', last: daysAgo(1, 10), result: '2 awaiting broker reply', health: 'warn' },
    { id: 'stripe', name: 'Stripe webhooks', schedule: 'Real-time', last: daysAgo(0, 9), result: 'Healthy · last event 4 min ago', health: 'ok' },
  ];

  const audit = [
    { id: 'A3', at: daysAgo(1, 15), actor: 'You', action: 'Approved document', target: 'Mark Wright · Medical certificate', note: 'Matches photo' },
    { id: 'A2', at: daysAgo(2, 11), actor: 'You', action: 'Resolved dispute', target: 'D198', note: 'Refunded duplicate charge ($312.40)' },
    { id: 'A1', at: daysAgo(4, 9), actor: 'System', action: 'Auto-paused listing', target: 'N22CW', note: 'Insurance expired' },
  ];

  return { users, aircraft, bookings, disputes, payouts, reviews, flagged, pairs, queue, jobs, audit, settings: { ...FEES } };
}
