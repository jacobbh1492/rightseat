// Scheduled automation. Each job is a pure-ish function of (deps) so it can be tested with fixtures.
import { daysUntil, namesMatch } from '../verify/rules.js';
import { notifyUser, sendEmail } from '../notify.js';

export const REMINDER_DAYS = [30, 14, 3];

// Nightly: re-check every listed aircraft against the FAA registry.
export async function syncAircraftJob({ db, aircraft, now = new Date() }) {
  const changes = [];
  for (const l of db.listListings()) {
    const r = aircraft.lookup(l.tail);
    const problems = [];
    if (!r) problems.push('No longer in FAA registry (deregistered or N-number changed)');
    else {
      if (!r.valid) problems.push(`Registration status ${r.statusCode}`);
      if (r.expires && daysUntil(r.expires, now) <= 0) problems.push('Registration expired');
      if (l.ownerName && ![r.owner, ...r.otherNames].some((o) => namesMatch(o, l.ownerName) || o.toUpperCase().includes(l.ownerName.toUpperCase()))) problems.push(`Registered owner changed to ${r.owner}`);
    }
    if (problems.length) {
      changes.push({ tail: l.tail, problems });
      db.upsertListing({ id: l.id, paused: true, pausedReason: problems.join('; ') });
      await notifyUser(db.getUser(l.ownerId), { title: `${l.tail} paused`, body: `We paused bookings: ${problems.join('; ')}. Update your registration in RightSeat to resume.` });
    } else if (l.paused && /registr|owner/i.test(l.pausedReason || '')) {
      db.upsertListing({ id: l.id, paused: false, pausedReason: null });
    }
  }
  db.log({ kind: 'job', job: 'syncAircraft', checked: db.listListings().length, changes: changes.length });
  return changes;
}

// Monthly: re-check every verified pilot and instructor certificate.
export async function syncAirmenJob({ db, airmen }) {
  const changes = [];
  for (const d of db.listCurrentDocs().filter((x) => ['pilotCert', 'cfiCert'].includes(x.type) && x.status === 'approved')) {
    const u = db.getUser(d.userId);
    const idDoc = db.currentDoc(u.id, 'id');
    const [first, ...rest] = (idDoc?.fields.name || u.name).split(' ');
    const m = airmen.find({ first, last: rest[rest.length - 1], state: u.state, city: u.city });
    const lost = !m.length || (d.type === 'cfiCert' && !m.some((x) => x.instructor));
    if (lost) {
      changes.push({ user: u.name, type: d.type });
      db.updateDoc(d.id, { status: 'review', reasons: ['Monthly FAA sync: record no longer matches'] });
      db.enqueue({ docId: d.id, type: d.type, who: u.name, reasons: ['Monthly FAA sync: record no longer matches'], confidence: 1 });
    } else if (d.type === 'cfiCert') {
      const ratings = m.find((x) => x.instructor)?.instructor.ratings || [];
      if (JSON.stringify(ratings) !== JSON.stringify(d.fields.ratings || [])) {
        db.updateDoc(d.id, { fields: { ...d.fields, ratings } });
        changes.push({ user: u.name, type: 'ratingsUpdated', ratings });
      }
    }
  }
  db.log({ kind: 'job', job: 'syncAirmen', changes: changes.length });
  return changes;
}

// Daily: reminders at 30/14/3 days, then expire + pause.
export async function expirationSweep({ db, now = new Date() }) {
  const out = { reminders: 0, expired: 0 };
  for (const d of db.listCurrentDocs().filter((x) => x.status === 'approved' && x.expires)) {
    const days = daysUntil(d.expires, now);
    const user = db.getUser(d.userId);
    if (days <= 0) {
      db.updateDoc(d.id, { status: 'expired' });
      if (d.subjectKind === 'listing') db.upsertListing({ id: d.subjectId, paused: true, pausedReason: `${d.type} expired` });
      await notifyUser(user, { title: 'Document expired', body: `Your ${d.type} expired. ${d.subjectKind === 'listing' ? 'Bookings are paused' : 'Bookings that need it are blocked'} until you upload a current one.` });
      out.expired++;
      continue;
    }
    const due = REMINDER_DAYS.filter((r) => days <= r && !db.reminderSent(d.id, r)).sort((a, b) => a - b)[0];
    if (due != null) {
      await notifyUser(user, { title: `Expires in ${days} days`, body: `Your ${d.type} expires ${d.expires}. Upload the renewal in RightSeat. It verifies in seconds.` });
      REMINDER_DAYS.filter((r) => r >= due).forEach((r) => db.reminderSent(d.id, r) || db.markReminder(d.id, r));
      out.reminders++;
    }
  }
  db.log({ kind: 'job', job: 'expirationSweep', ...out });
  return out;
}

// Daily: nudge brokers who haven't confirmed in 3+ days.
export async function brokerReminderJob({ db, baseUrl = '', now = Date.now() }) {
  let sent = 0;
  for (const d of db.listCurrentDocs().filter((x) => x.status === 'awaiting_broker')) {
    if (now - d.createdAt < 3 * 864e5 || db.reminderSent(d.id, 'broker-' + Math.floor((now - d.createdAt) / (3 * 864e5)))) continue;
    const token = db.createToken({ docId: d.id });
    await sendEmail({ to: d.fields.broker, subject: `Reminder: confirm insurance for ${d.fields.tail}`, text: `Please confirm: ${baseUrl}/broker/confirm/${token}` });
    db.markReminder(d.id, 'broker-' + Math.floor((now - d.createdAt) / (3 * 864e5)));
    sent++;
  }
  return sent;
}
