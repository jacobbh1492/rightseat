// One entry point for every document: read it, enrich with FAA data, run rules, decide, save, route.
import { runChecks, decide } from './rules.js';
import { extractDocument } from './extract.js';
import { sendEmail, notifyUser } from '../notify.js';

const EXPIRY_FIELD = { medical: 'expires', renterIns: 'expires', cfiIns: 'expires', ownerIns: 'expires', registration: 'expires' };

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  return { first: parts[0] || '', last: parts[parts.length - 1] || '' };
}

/**
 * @param deps { db, airmen: AirmenIndex, aircraft: AircraftIndex, extract?: fn, now?: Date, baseUrl }
 * @param input { type, userId, listingId?, file?: {base64, mediaType}, corrections?: {} }
 */
export async function verifyDocument(deps, input) {
  const { db, airmen, aircraft } = deps;
  const extract = deps.extract || extractDocument;
  const now = deps.now || new Date();
  const user = db.getUser(input.userId);
  if (!user) throw new Error('Unknown user');
  const idDoc = db.currentDoc(user.id, 'id');
  if (!idDoc || idDoc.status !== 'approved') throw new Error('Verify government ID first');
  const verifiedName = idDoc.fields.name;
  const listing = input.listingId ? db.getListing(input.listingId) : null;

  let fields = {};
  let confidence = 1;
  const ctx = { verifiedName, now, listing };

  // 1. Read the document (if there is one)
  if (input.file) {
    const r = await extract({ type: input.type, base64: input.file.base64, mediaType: input.file.mediaType });
    fields = r.fields;
    confidence = r.confidence;
  }
  const userEdited = !!(input.corrections && Object.keys(input.corrections).length);
  if (userEdited) fields = { ...fields, ...input.corrections };
  fields._confidence = confidence;

  // 2. Enrich with authoritative data
  if (['pilotCert', 'cfiCert', 'medical'].includes(input.type)) {
    ctx.faaMatches = airmen ? airmen.find({ ...splitName(verifiedName), state: user.state, city: user.city }) : [];
  }
  if (['registration', 'airworthiness'].includes(input.type)) {
    ctx.aircraftRecord = aircraft?.lookup(listing.tail) || null;
    if (input.type === 'registration' && ctx.aircraftRecord) {
      const r = ctx.aircraftRecord;
      fields = { ...fields, tail: r.tail, makeModel: `${r.make} ${r.model}`, year: r.year, serial: r.serial, owner: r.owner, status: r.valid ? 'Valid' : r.statusCode, expires: r.expires?.toISOString().slice(0, 10) };
    }
  }
  if (['annual', 'hundredHr'].includes(input.type) && fields.signer) {
    ctx.mechanicMatches = airmen ? airmen.find(splitName(fields.signer)).filter((m) => m.mechanic) : [];
    const ia = db.currentDoc(input.listingId, 'iaCard');
    ctx.iaOnFile = ia?.status === 'approved' && splitName(ia.fields.name).last.toUpperCase() === splitName(fields.signer).last.toUpperCase();
  }

  // 3. Rules + decision
  const checks = runChecks(input.type, fields, ctx);
  const { decision, reasons } = decide(checks, confidence, userEdited);
  delete fields._confidence;

  // Owner insurance: even a clean COI waits for the broker to click confirm.
  let status = decision;
  if (input.type === 'ownerIns' && decision === 'approved' && fields.broker) status = 'awaiting_broker';

  const expField = EXPIRY_FIELD[input.type];
  const doc = db.saveDoc({
    subjectId: listing ? listing.id : user.id,
    subjectKind: listing ? 'listing' : 'user',
    userId: user.id,
    type: input.type,
    status,
    by: status === 'approved' ? 'auto' : null,
    fields,
    confidence,
    checks,
    reasons,
    expires: expField ? fields[expField] || null : null,
  });

  // 4. Route
  if (decision === 'review') db.enqueue({ docId: doc.id, type: input.type, who: user.name, reasons, confidence });
  if (status === 'awaiting_broker') {
    const token = db.createToken({ docId: doc.id });
    await sendEmail({
      to: fields.broker,
      subject: `Please confirm insurance for ${listing.tail}`,
      text: `${user.name} listed ${listing.tail} on RightSeat with policy ${fields.policy} (${fields.carrier}), expiring ${fields.expires}.\n\nConfirm this certificate is accurate: ${deps.baseUrl || ''}/broker/confirm/${token}\n\nIf anything is wrong, simply reply to this email.`,
    });
  }
  if (input.type === 'hundredHr' && status === 'approved' && listing) {
    const h = Number(String(fields.hobbs).replace(/[^0-9.]/g, ''));
    if (h) db.upsertListing({ id: listing.id, next100At: Math.round((h + 100) * 10) / 10 });
  }
  if (decision === 'rejected') await notifyUser(user, { title: 'Document needs attention', body: reasons.join('\n') });
  db.log({ kind: 'verify', type: input.type, docId: doc.id, decision: status });
  return doc;
}

// Broker clicked the link in the confirmation email.
export function confirmBroker(db, token) {
  const p = db.useToken(token);
  if (!p) return null;
  return db.updateDoc(p.docId, { status: 'approved', by: 'broker' });
}

// Reviewer decision from the admin queue.
export async function reviewDecision(db, qid, decision, note, reviewer) {
  const q = db.decideQueue(qid, decision, note, reviewer);
  const doc = db.updateDoc(q.docId, { status: decision === 'approved' ? 'approved' : 'rejected', by: decision === 'approved' ? 'reviewer' : null, note });
  await notifyUser(db.getUser(doc.userId), {
    title: decision === 'approved' ? 'Document verified' : 'Document needs attention',
    body: decision === 'approved' ? 'Your document was approved.' : note || 'Please re-upload.',
  });
  return doc;
}
