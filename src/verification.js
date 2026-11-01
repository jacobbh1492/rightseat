// Document verification: what we collect, where each check comes from, and how a decision is made.
// In production the "extract" step is AI document reading on the server and the FAA/Stripe checks are real lookups
// (see /server). In the app prototype, extraction is simulated with demo scenarios.

export const MINIMUMS = {
  renterLiability: 1000000,
  renterDamage: 25000,
  ownerLiability: 1000000,
  instructorLiability: 1000000,
};

const now = () => new Date();
const addMonths = (m, d = now()) => new Date(d.getFullYear(), d.getMonth() + m, Math.min(d.getDate(), 28));
const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
// Dates are shown as "Mar 1, 2030". The iPhone's JavaScript engine (Hermes) can't parse
// that format with new Date(), so read it by hand.
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const parse = (s) => {
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(String(s || '').trim());
  if (m && MONTHS[m[1].toLowerCase()] != null) return new Date(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  return new Date(s);
};
const usd = (n) => '$' + Number(n).toLocaleString('en-US');
const num = (s) => Number(String(s).replace(/[^0-9.]/g, '')) || 0;
const daysUntil = (s) => Math.ceil((parse(s).getTime() - Date.now()) / 86400000);
const sameName = (a = '', b = '') => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

export const SOURCES = {
  stripe: 'Stripe Identity',
  faaAirmen: 'FAA Airmen Registry',
  faaAircraft: 'FAA Aircraft Registry',
  ai: 'Document AI',
  rules: 'RightSeat rules',
  broker: 'Broker email',
  checkr: 'Background check provider',
  app: 'RightSeat records',
};

export const DOC_TYPES = {
  id: {
    title: 'Government ID',
    group: 'pilot',
    how: 'ID photo + live selfie, checked by Stripe Identity',
    input: 'identity',
    sources: ['stripe'],
    fields: [['name', 'Full name'], ['docType', 'Document'], ['dob', 'Date of birth'], ['expires', 'Expires']],
    expiryField: 'expires',
  },
  pilotCert: {
    title: 'Pilot certificate',
    group: 'pilot',
    how: 'Matched to the FAA Airmen Registry (re-checked monthly)',
    input: 'faa',
    sources: ['faaAirmen', 'ai'],
    fields: [['name', 'Name on certificate'], ['level', 'Certificate'], ['ratings', 'Ratings'], ['location', 'City / state']],
  },
  medical: {
    title: 'Medical certificate or BasicMed',
    group: 'pilot',
    how: 'Photo read by Document AI, cross-checked with FAA medical class/date',
    input: 'upload',
    sources: ['ai', 'faaAirmen', 'rules'],
    fields: [['name', 'Name'], ['class', 'Class'], ['examDate', 'Exam date'], ['expires', 'Valid for solo until'], ['limitations', 'Limitations']],
    expiryField: 'expires',
  },
  logbook: {
    title: 'Flight hours (logbook)',
    group: 'pilot',
    how: 'Import from ForeFlight / MyFlightbook or logbook photos. Marked self-reported, then replaced by verified in-app hours.',
    input: 'upload',
    sources: ['ai', 'app'],
    fields: [['total', 'Total time'], ['pic', 'PIC'], ['dual', 'Dual received'], ['lastFlight', 'Last flight']],
  },
  renterIns: {
    title: 'Renter’s insurance (optional)',
    group: 'pilot',
    how: 'Policy declarations page read by Document AI, checked against minimums',
    input: 'upload',
    sources: ['ai', 'rules'],
    fields: [['insured', 'Named insured'], ['carrier', 'Carrier'], ['policy', 'Policy #'], ['liability', 'Liability limit'], ['damage', 'Aircraft damage limit'], ['expires', 'Expires']],
    expiryField: 'expires',
    optional: true,
  },
  cfiCert: {
    title: 'Flight instructor certificate',
    group: 'cfi',
    how: 'Matched to FAA Airmen Registry type “F” ratings (re-checked monthly)',
    input: 'faa',
    sources: ['faaAirmen', 'ai'],
    fields: [['name', 'Name'], ['ratings', 'Instructor ratings'], ['pilotLevel', 'Pilot certificate'], ['location', 'City / state']],
  },
  cfiIns: {
    title: 'Instructor liability insurance',
    group: 'cfi',
    how: 'Declarations page read by Document AI, checked against minimums',
    input: 'upload',
    sources: ['ai', 'rules'],
    fields: [['insured', 'Named insured'], ['carrier', 'Carrier'], ['policy', 'Policy #'], ['liability', 'Liability limit'], ['expires', 'Expires']],
    expiryField: 'expires',
  },
  background: {
    title: 'Background check (optional)',
    group: 'cfi',
    how: 'Run by a background-check provider with your consent. Earns a “Background checked” badge.',
    input: 'consent',
    sources: ['checkr'],
    fields: [['name', 'Name'], ['package', 'Package'], ['result', 'Result'], ['completed', 'Completed']],
    optional: true,
  },
  registration: {
    title: 'FAA registration',
    group: 'aircraft',
    how: 'N-number matched to the FAA Aircraft Registry (synced nightly)',
    input: 'faaAircraft',
    sources: ['faaAircraft'],
    fields: [['tail', 'N-number'], ['makeModel', 'Make / model'], ['year', 'Year'], ['serial', 'Serial #'], ['owner', 'Registered owner'], ['status', 'Status'], ['expires', 'Registration expires']],
    expiryField: 'expires',
  },
  airworthiness: {
    title: 'Airworthiness certificate',
    group: 'aircraft',
    how: 'Photo read by Document AI; serial matched to FAA registry',
    input: 'upload',
    sources: ['ai', 'faaAircraft'],
    fields: [['tail', 'N-number'], ['serial', 'Serial #'], ['category', 'Category']],
  },
  ownerIns: {
    title: 'Aircraft insurance (COI)',
    group: 'aircraft',
    how: 'Certificate of insurance read by Document AI, then confirmed with your broker by automatic email',
    input: 'upload',
    sources: ['ai', 'rules', 'broker'],
    fields: [['insured', 'Named insured'], ['tail', 'Aircraft'], ['carrier', 'Carrier'], ['policy', 'Policy #'], ['use', 'Approved use'], ['liability', 'Liability limit'], ['additional', 'Additional insured'], ['broker', 'Broker email'], ['expires', 'Expires']],
    expiryField: 'expires',
  },
  annual: {
    title: 'Annual inspection',
    group: 'aircraft',
    how: 'Logbook entry read by Document AI; mechanic matched in FAA registry; IA card checked',
    input: 'upload',
    sources: ['ai', 'faaAirmen', 'rules'],
    fields: [['date', 'Date'], ['hobbs', 'Hobbs at inspection'], ['signer', 'Signed by'], ['certNo', 'A&P certificate #'], ['ia', 'IA #']],
    expiryField: 'due',
  },
  hundredHr: {
    title: '100-hour inspection',
    group: 'aircraft',
    how: 'Logbook entry read by Document AI; sets the 100-hr countdown automatically',
    input: 'upload',
    sources: ['ai', 'faaAirmen', 'app'],
    fields: [['date', 'Date'], ['hobbs', 'Hobbs at inspection'], ['signer', 'Signed by'], ['certNo', 'A&P certificate #']],
  },
};

export const GROUPS = [
  { key: 'pilot', title: 'You as a pilot', note: 'Needed to book lessons and rent solo' },
  { key: 'cfi', title: 'Instructor', note: 'Needed before your CFI profile goes live' },
  { key: 'aircraft', title: 'Aircraft', note: 'Needed before a plane can be booked' },
];

export const SCENARIOS = [
  { key: 'clean', label: 'Clean document' },
  { key: 'review', label: 'Needs a human look' },
  { key: 'problem', label: 'Problem' },
];

// ---------- Simulated AI extraction (production: server/verify/extract.js) ----------
export function extract(type, scenario, ctx) {
  const name = ctx.name;
  const p = ctx.plane;
  const s = scenario;
  const conf = s === 'review' ? 0.78 : 0.97;
  const f = (() => {
    switch (type) {
      case 'id':
        return { name, docType: 'Florida driver license', dob: 'Mar 14, 1994', expires: fmt(s === 'problem' ? addMonths(-2) : addMonths(40)) };
      case 'pilotCert':
        return { name, level: ctx.certificate === 'Student' ? 'Student pilot' : `${ctx.certificate} pilot`, ratings: ctx.certificate === 'Student' ? '—' : 'ASEL', location: 'St. Petersburg, FL', matches: s === 'review' ? 2 : s === 'problem' ? 0 : 1 };
      case 'medical':
        return { name: s === 'review' ? 'Samuel J. Carter' : name, class: 'Third class', examDate: fmt(addMonths(-5)), expires: fmt(s === 'problem' ? addMonths(-1) : addMonths(19)), limitations: s === 'review' ? 'Must wear corrective lenses' : 'None', faaClass: 'Third', faaDate: fmt(addMonths(-5)) };
      case 'logbook':
        return { total: String(ctx.totalHours), pic: '5.2', dual: String(ctx.dual || 19.1), lastFlight: fmt(addMonths(0)) };
      case 'renterIns':
        return { insured: name, carrier: 'Sample Aviation Insurance Co.', policy: 'RNT-448120', liability: usd(s === 'problem' ? 100000 : 1000000), damage: usd(s === 'review' ? 15000 : 25000), expires: fmt(addMonths(11)) };
      case 'cfiCert':
        return { name, ratings: 'CFI (ASE) · CFII (INSTA)', pilotLevel: 'Commercial ASEL/AMEL, Instrument', location: 'St. Petersburg, FL', matches: s === 'review' ? 2 : s === 'problem' ? 0 : 1 };
      case 'cfiIns':
        return { insured: name, carrier: 'Sample Aviation Insurance Co.', policy: 'CFI-20931', liability: usd(1000000), expires: fmt(s === 'problem' ? addMonths(-1) : addMonths(9)) };
      case 'background':
        return { name, package: 'Standard + MVR', result: s === 'review' ? 'Consider' : 'Clear', completed: fmt(addMonths(0)) };
      case 'registration':
        return { tail: p.tail, makeModel: `${p.make.toUpperCase()} ${p.model.split(' ')[0]}`, year: String(p.year), serial: p.serial || '28-7816' + p.tail.slice(-3).replace(/\D/g, '0'), owner: s === 'review' ? `${p.ownerName.toUpperCase()} LLC TRUSTEE` : p.ownerName.toUpperCase(), status: s === 'problem' ? 'Expired' : 'Valid', expires: fmt(s === 'problem' ? addMonths(-3) : addMonths(52)), listedMakeModel: `${p.make} ${p.model}`, listedOwner: p.ownerName };
      case 'airworthiness':
        return { tail: p.tail, serial: s === 'review' ? '28-78160XX' : p.serial || '28-7816' + p.tail.slice(-3).replace(/\D/g, '0'), category: 'Normal / Utility', faaSerial: p.serial || '28-7816' + p.tail.slice(-3).replace(/\D/g, '0') };
      case 'ownerIns':
        return { insured: p.ownerName, tail: p.tail, carrier: 'Sample Aviation Insurance Co.', policy: 'AC-77120', use: s === 'problem' ? 'Pleasure & business' : 'Rental & flight instruction', liability: usd(1000000), additional: s === 'review' ? '' : 'RightSeat Inc.', broker: 'certs@samplebroker.example', expires: fmt(addMonths(8)) };
      case 'annual':
        return { date: fmt(addMonths(s === 'problem' ? -13 : -2)), hobbs: String(Math.round((p.hobbsTotal - 40) * 10) / 10), signer: 'R. Delgado', certNo: 'A&P 3412xxxxx', ia: s === 'review' ? '' : 'IA on file', due: fmt(addMonths(s === 'problem' ? -1 : 10)) };
      case 'hundredHr':
        return { date: fmt(addMonths(-1)), hobbs: String(Math.round((p.next100At - 100) * 10) / 10), signer: 'R. Delgado', certNo: 'A&P 3412xxxxx' };
      default:
        return {};
    }
  })();
  return { fields: f, confidence: conf };
}

// ---------- Automated checks ----------
const pass = (label, source, detail) => ({ label, level: 'pass', source, detail });
const warn = (label, source, detail) => ({ label, level: 'warn', source, detail });
const fail = (label, source, detail) => ({ label, level: 'fail', source, detail });

export function runChecks(type, f, ctx, confidence) {
  const c = [];
  const readable = confidence >= 0.9 ? pass('Document read clearly', 'ai', `${Math.round(confidence * 100)}% confidence`) : warn('Parts of the document were hard to read', 'ai', `${Math.round(confidence * 100)}% confidence`);
  const nameCheck = (n) => (sameName(n, ctx.name) ? pass('Name matches verified ID', 'stripe') : warn(`Name “${n}” differs from ID “${ctx.name}”`, 'stripe', 'Could be a middle name or nickname'));
  const notExpired = (d, label = 'Not expired') => (daysUntil(d) > 0 ? pass(`${label} (${daysUntil(d)} days left)`, 'rules') : fail(`Expired ${d}`, 'rules'));

  switch (type) {
    case 'id':
      c.push(pass('Document is authentic (security features, MRZ/barcode)', 'stripe'));
      c.push(pass('Live selfie matches ID photo', 'stripe'));
      c.push(notExpired(f.expires, 'ID not expired'));
      break;
    case 'pilotCert':
    case 'cfiCert':
      c.push(nameCheck(f.name));
      if (f.matches === 1) c.push(pass(`Exactly 1 FAA record for ${f.name} in ${f.location}`, 'faaAirmen'));
      else if (f.matches > 1) c.push(warn(`${f.matches} FAA records share this name in FL. Reviewer matches the certificate photo.`, 'faaAirmen'));
      else c.push(fail('No matching FAA airman record found', 'faaAirmen', 'Check spelling or upload the certificate'));
      if (type === 'cfiCert' && f.matches) c.push(pass('Active flight instructor (type F) ratings on record', 'faaAirmen', f.ratings));
      if (type === 'pilotCert' && f.matches) c.push(pass(`Certificate level on record: ${f.level}`, 'faaAirmen'));
      break;
    case 'medical':
      c.push(readable);
      c.push(nameCheck(f.name));
      c.push(notExpired(f.expires, 'Valid for solo'));
      c.push(f.faaClass && f.class.startsWith(f.faaClass) ? pass(`FAA record shows ${f.faaClass} class, ${f.faaDate}`, 'faaAirmen', 'FAA lists medical data for information only') : warn('FAA medical data differs', 'faaAirmen'));
      if (f.limitations && f.limitations !== 'None') c.push(warn(`Limitation: ${f.limitations}`, 'ai', 'Shown to CFIs and owners; not disqualifying'));
      break;
    case 'logbook':
      c.push(pass('Totals imported', 'ai'));
      c.push(Math.abs(num(f.total) - ctx.totalHours) < 1 ? pass('Matches hours logged in RightSeat', 'app') : warn('Differs from RightSeat-logged hours', 'app'));
      c.push(warn('Marked “self-reported” until flown on RightSeat', 'rules'));
      break;
    case 'renterIns':
    case 'cfiIns':
      c.push(readable);
      c.push(nameCheck(f.insured));
      c.push(notExpired(f.expires, 'Policy active'));
      c.push(num(f.liability) >= (type === 'cfiIns' ? MINIMUMS.instructorLiability : MINIMUMS.renterLiability) ? pass(`Liability ${f.liability} meets minimum`, 'rules') : fail(`Liability ${f.liability} below ${usd(MINIMUMS.renterLiability)} minimum`, 'rules'));
      if (type === 'renterIns') c.push(num(f.damage) >= MINIMUMS.renterDamage ? pass(`Aircraft damage ${f.damage} meets minimum`, 'rules') : warn(`Aircraft damage ${f.damage} below ${usd(MINIMUMS.renterDamage)} suggested`, 'rules'));
      break;
    case 'background':
      c.push(pass('Consent and disclosure signed', 'checkr'));
      c.push(f.result === 'Clear' ? pass('Result: Clear', 'checkr') : warn('Result: Consider. Goes to human review (adverse-action rules apply)', 'checkr'));
      break;
    case 'registration':
      c.push(pass(`${f.tail} found in FAA Aircraft Registry`, 'faaAircraft'));
      c.push(f.listedMakeModel.toUpperCase().startsWith(f.makeModel.split(' ')[0]) ? pass(`Make/model matches listing (${f.makeModel})`, 'faaAircraft') : warn('Make/model differs from listing', 'faaAircraft'));
      c.push(sameName(f.owner, f.listedOwner) ? pass('Registered owner matches lister', 'faaAircraft') : warn(`Registered to “${f.owner}”. Confirm lister has authority (LLC / trust / leaseback)`, 'faaAircraft'));
      c.push(f.status === 'Valid' ? pass('Registration status valid', 'faaAircraft') : fail(`Registration status: ${f.status}`, 'faaAircraft'));
      c.push(notExpired(f.expires, 'Registration current'));
      break;
    case 'airworthiness':
      c.push(readable);
      c.push(f.serial === f.faaSerial ? pass('Serial matches FAA registry', 'faaAircraft') : warn(`Serial read as ${f.serial}; registry has ${f.faaSerial}`, 'faaAircraft'));
      break;
    case 'ownerIns':
      c.push(readable);
      c.push(pass(`${f.tail} listed on policy`, 'ai'));
      c.push(/rental|instruction/i.test(f.use) ? pass(`Approved use: ${f.use}`, 'rules') : fail(`Approved use “${f.use}” doesn’t cover rental or instruction`, 'rules'));
      c.push(num(f.liability) >= MINIMUMS.ownerLiability ? pass(`Liability ${f.liability} meets minimum`, 'rules') : fail('Liability below minimum', 'rules'));
      c.push(f.additional ? pass(`Additional insured: ${f.additional}`, 'ai') : warn('RightSeat not listed as additional insured', 'ai', 'Ask broker to add, or reviewer accepts'));
      c.push(notExpired(f.expires, 'Policy active'));
      c.push(pass(`Auto-confirmation emailed to ${f.broker}`, 'broker', 'Approves automatically when broker clicks confirm'));
      break;
    case 'annual':
      c.push(readable);
      c.push(daysUntil(f.due) > 0 ? pass(`Within 12 calendar months (due ${f.due})`, 'rules') : fail(`Annual overdue since ${f.due}`, 'rules'));
      c.push(pass(`${f.signer} found as Mechanic (A&P) in FAA registry`, 'faaAirmen'));
      c.push(f.ia ? pass('Inspection Authorization card on file', 'rules', 'IA is not in public FAA data, so it is checked from the card') : warn('No IA on file. Upload the IA card (not in public FAA data)', 'rules'));
      break;
    case 'hundredHr':
      c.push(readable);
      c.push(pass(`${f.signer} found as Mechanic (A&P) in FAA registry`, 'faaAirmen'));
      c.push(pass(`100-hr countdown set: next due at Hobbs ${Math.round((num(f.hobbs) + 100) * 10) / 10}`, 'app'));
      break;
    default:
  }
  return c;
}

export function decide(checks, confidence, userEdited) {
  if (checks.some((x) => x.level === 'fail')) return { decision: 'rejected', reasons: checks.filter((x) => x.level === 'fail').map((x) => x.label) };
  const warns = checks.filter((x) => x.level === 'warn' && !/self-reported/i.test(x.label));
  if (warns.length || confidence < 0.9 || userEdited) {
    return { decision: 'review', reasons: [...warns.map((x) => x.label), ...(userEdited ? ['You corrected a field we read'] : [])] };
  }
  return { decision: 'approved', reasons: [] };
}

export function statusOf(doc) {
  if (!doc) return { key: 'missing', label: 'Not started', color: '#5B6474', bg: '#EEF1F5' };
  if (doc.status === 'review') return { key: 'review', label: 'In review', color: '#B45309', bg: '#FEF3C7' };
  if (doc.status === 'rejected') return { key: 'rejected', label: 'Needs attention', color: '#DC2626', bg: '#FEE2E2' };
  const exp = doc.expires && daysUntil(doc.expires);
  if (exp != null && exp <= 0) return { key: 'expired', label: 'Expired', color: '#DC2626', bg: '#FEE2E2' };
  if (exp != null && exp <= 30) return { key: 'expiring', label: `Expires in ${exp}d`, color: '#B45309', bg: '#FEF3C7' };
  return { key: 'approved', label: doc.selfReported ? 'Self-reported' : doc.by === 'auto' ? 'Verified · auto' : 'Verified', color: '#0E9F6E', bg: '#E3F7EF' };
}

export const expiryOf = (type, fields) => {
  const k = DOC_TYPES[type].expiryField;
  return k ? fields[k] : null;
};
export { daysUntil, fmt, addMonths };
