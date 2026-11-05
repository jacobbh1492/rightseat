// Automated checks + decision. Each check is pass / warn / fail with the source it came from.
// Decision: any fail -> rejected (user fixes & re-uploads); any warn, low AI confidence or user-corrected field -> human review;
// otherwise approved automatically.

export const MINIMUMS = {
  renterLiability: 1_000_000,
  renterDamage: 25_000,
  instructorLiability: 1_000_000,
  ownerLiability: 1_000_000,
  autoApproveConfidence: 0.9,
};

const pass = (label, source, detail) => ({ label, level: 'pass', source, detail });
const warn = (label, source, detail) => ({ label, level: 'warn', source, detail });
const fail = (label, source, detail) => ({ label, level: 'fail', source, detail });

export const money = (s) => Number(String(s ?? '').replace(/[^0-9.]/g, '')) || 0;
export const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
export const daysUntil = (d, now = new Date()) => (d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000) : null);

// "SAMUEL JAMES CARTER" vs "Sam Carter": last names must match; first names match on equality, prefix, or initial.
export function namesMatch(a, b) {
  const A = norm(a).split(' ');
  const B = norm(b).split(' ');
  if (!A.length || !B.length) return false;
  if (A[A.length - 1] !== B[B.length - 1]) return false;
  const fa = A[0], fb = B[0];
  return fa === fb || fa.startsWith(fb) || fb.startsWith(fa);
}
// Same first and last name; middle names/initials are ignored.
export const exactName = (a, b) => {
  const A = norm(a).split(' ');
  const B = norm(b).split(' ');
  return A[0] === B[0] && A[A.length - 1] === B[B.length - 1];
};

export function checkName(docName, verifiedName) {
  if (exactName(docName, verifiedName)) return pass('Name matches verified ID', 'stripe');
  if (namesMatch(docName, verifiedName)) return warn(`Name “${docName}” is a variation of ID name “${verifiedName}”`, 'stripe');
  return fail(`Name “${docName}” doesn’t match ID name “${verifiedName}”`, 'stripe');
}

function notExpired(date, label, now) {
  const d = daysUntil(date, now);
  if (d == null) return warn(`${label}: no date found`, 'ai');
  return d > 0 ? pass(`${label} (${d} days left)`, 'rules') : fail(`${label}: expired`, 'rules');
}

function confidenceCheck(conf) {
  return conf >= MINIMUMS.autoApproveConfidence
    ? pass('Document read clearly', 'ai', `${Math.round(conf * 100)}% confidence`)
    : warn('Parts of the document were hard to read', 'ai', `${Math.round(conf * 100)}% confidence`);
}

// ctx: { verifiedName, now, faaMatches, aircraftRecord, listing, iaOnFile, mechanicMatches }
export function runChecks(type, f, ctx) {
  const now = ctx.now || new Date();
  const c = [];
  switch (type) {
    case 'pilotCert':
    case 'cfiCert': {
      const m = ctx.faaMatches || [];
      if (m.length === 0) c.push(fail('No matching FAA airman record', 'faaAirmen', 'Check spelling or upload the certificate photo'));
      else if (m.length > 1) c.push(warn(`${m.length} FAA records share this name. Reviewer matches the certificate photo.`, 'faaAirmen'));
      else c.push(pass(`FAA record found: ${m[0].name}, ${m[0].city} ${m[0].state}`, 'faaAirmen'));
      if (m.length === 1) {
        if (type === 'pilotCert') c.push(m[0].pilotLevel ? pass(`Pilot certificate on record: ${m[0].pilotLevel}`, 'faaAirmen') : fail('No pilot certificate on FAA record', 'faaAirmen'));
        if (type === 'cfiCert') c.push(m[0].instructor ? pass(`Flight instructor ratings on record: ${m[0].instructor.ratings.join(', ')}`, 'faaAirmen') : fail('No flight instructor certificate on FAA record', 'faaAirmen'));
        c.push(checkName(m[0].name, ctx.verifiedName));
      }
      break;
    }
    case 'medical': {
      c.push(confidenceCheck(f._confidence));
      c.push(checkName(f.name, ctx.verifiedName));
      c.push(notExpired(f.expires, 'Medical valid', now));
      const faa = ctx.faaMatches?.[0]?.medical;
      if (faa?.class) c.push(String(f.class || '').startsWith(['', 'First', 'Second', 'Third'][+faa.class]) ? pass('Class matches FAA record', 'faaAirmen', 'FAA medical data is informational') : warn('Class differs from FAA record', 'faaAirmen'));
      if (f.limitations && !/none/i.test(f.limitations)) c.push(warn(`Limitation: ${f.limitations}`, 'ai'));
      break;
    }
    case 'renterIns':
    case 'cfiIns': {
      c.push(confidenceCheck(f._confidence));
      c.push(checkName(f.insured, ctx.verifiedName));
      c.push(notExpired(f.expires, 'Policy active', now));
      const minL = type === 'cfiIns' ? MINIMUMS.instructorLiability : MINIMUMS.renterLiability;
      c.push(money(f.liability) >= minL ? pass(`Liability ${f.liability} meets minimum`, 'rules') : fail(`Liability below $${minL.toLocaleString()} minimum`, 'rules'));
      if (type === 'renterIns') c.push(money(f.damage) >= MINIMUMS.renterDamage ? pass('Aircraft damage limit meets minimum', 'rules') : warn('Aircraft damage limit below suggested minimum', 'rules'));
      break;
    }
    case 'registration': {
      const r = ctx.aircraftRecord;
      const L = ctx.listing;
      if (!r) { c.push(fail(`${L.tail} not found in FAA Aircraft Registry`, 'faaAircraft')); break; }
      c.push(pass(`${r.tail} found in FAA Aircraft Registry`, 'faaAircraft'));
      c.push(r.valid ? pass('Registration status valid', 'faaAircraft') : fail(`Registration status code ${r.statusCode}`, 'faaAircraft'));
      c.push(notExpired(r.expires, 'Registration current', now));
      c.push(norm(r.make).includes(norm(L.make).split(' ')[0]) ? pass(`Make matches listing (${r.make} ${r.model})`, 'faaAircraft') : warn(`Registry make/model ${r.make} ${r.model} differs from listing`, 'faaAircraft'));
      if (L.serial) c.push(norm(r.serial) === norm(L.serial) ? pass('Serial matches listing', 'faaAircraft') : warn('Serial differs from listing', 'faaAircraft'));
      const owners = [r.owner, ...r.otherNames];
      c.push(owners.some((o) => namesMatch(o, L.ownerName) || norm(o).includes(norm(L.ownerName))) ? pass('Registered owner matches lister', 'faaAircraft') : warn(`Registered to “${r.owner}”. Confirm lister has authority`, 'faaAircraft'));
      break;
    }
    case 'airworthiness': {
      const r = ctx.aircraftRecord;
      c.push(confidenceCheck(f._confidence));
      c.push(r && norm(f.serial) === norm(r.serial) ? pass('Serial matches FAA registry', 'faaAircraft') : warn('Serial differs from FAA registry', 'faaAircraft'));
      break;
    }
    case 'ownerIns': {
      const L = ctx.listing;
      c.push(confidenceCheck(f._confidence));
      c.push(String(f.tail || '').toUpperCase().includes(L.tail.toUpperCase().replace(/^N/, '')) ? pass(`${L.tail} listed on policy`, 'ai') : fail(`${L.tail} not found on policy`, 'ai'));
      c.push(/rental|instruction|commercial/i.test(f.use || '') ? pass(`Approved use: ${f.use}`, 'rules') : fail(`Approved use “${f.use || 'unknown'}” doesn’t cover rental or instruction`, 'rules'));
      c.push(money(f.liability) >= MINIMUMS.ownerLiability ? pass('Liability meets minimum', 'rules') : fail('Liability below minimum', 'rules'));
      c.push(/rightseat|positive\s*rate/i.test(f.additional || '') ? pass('Positive Rate is additional insured', 'ai') : warn('Positive Rate not listed as additional insured', 'ai'));
      c.push(notExpired(f.expires, 'Policy active', now));
      break;
    }
    case 'annual':
    case 'hundredHr': {
      c.push(confidenceCheck(f._confidence));
      const mech = ctx.mechanicMatches || [];
      c.push(mech.length >= 1 && mech.some((m) => m.mechanic) ? pass(`${f.signer} found as Mechanic in FAA registry`, 'faaAirmen') : warn(`Couldn’t confirm ${f.signer || 'signer'} as an FAA mechanic`, 'faaAirmen'));
      if (type === 'annual') {
        const signed = f.date ? new Date(f.date) : null;
        const due = signed ? new Date(Date.UTC(signed.getUTCFullYear() + 1, signed.getUTCMonth() + 1, 0)) : null; // end of 12th calendar month
        c.push(due ? (due > now ? pass(`Within 12 calendar months (due ${due.toISOString().slice(0, 10)})`, 'rules') : fail('Annual is overdue', 'rules')) : warn('No inspection date found', 'ai'));
        c.push(ctx.iaOnFile ? pass('Inspection Authorization card on file', 'rules', 'IA is not in public FAA data') : warn('No IA card on file (IA is not in public FAA data)', 'rules'));
      }
      break;
    }
    default:
      c.push(warn('Unknown document type', 'rules'));
  }
  return c;
}

export function decide(checks, confidence = 1, userEdited = false) {
  const fails = checks.filter((x) => x.level === 'fail');
  if (fails.length) return { decision: 'rejected', reasons: fails.map((x) => x.label) };
  const warns = checks.filter((x) => x.level === 'warn');
  if (warns.length || confidence < MINIMUMS.autoApproveConfidence || userEdited) {
    return { decision: 'review', reasons: [...warns.map((x) => x.label), ...(userEdited ? ['User corrected an extracted field'] : [])] };
  }
  return { decision: 'approved', reasons: [] };
}
