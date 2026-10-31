// Minimal JSON-file store so the automation runs end to end today.
// Swap for Postgres (same function names) before launch.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createDb(file = process.env.DB_FILE || path.resolve('data/db.json')) {
  const empty = { users: {}, listings: {}, docs: [], queue: [], tokens: {}, reminders: [], events: [] };
  let state = empty;
  if (file && fs.existsSync(file)) state = { ...empty, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
  };
  const id = () => crypto.randomUUID();

  return {
    state,
    save,
    getUser: (uid) => state.users[uid],
    upsertUser: (u) => { state.users[u.id] = { ...(state.users[u.id] || {}), ...u }; save(); return state.users[u.id]; },
    getListing: (lid) => state.listings[lid],
    upsertListing: (l) => { state.listings[l.id] = { ...(state.listings[l.id] || {}), ...l }; save(); return state.listings[l.id]; },
    listListings: () => Object.values(state.listings),
    listUsers: () => Object.values(state.users),

    // Latest doc of a type for a subject (user or listing).
    currentDoc: (subjectId, type) => state.docs.filter((d) => d.subjectId === subjectId && d.type === type).sort((a, b) => b.createdAt - a.createdAt)[0],
    listCurrentDocs: () => {
      const latest = new Map();
      for (const d of state.docs) {
        const k = `${d.subjectId}|${d.type}`;
        if (!latest.has(k) || latest.get(k).createdAt < d.createdAt) latest.set(k, d);
      }
      return [...latest.values()];
    },
    saveDoc: (doc) => { const d = { id: id(), createdAt: Date.now(), ...doc }; state.docs.push(d); save(); return d; },
    updateDoc: (docId, patch) => { const d = state.docs.find((x) => x.id === docId); Object.assign(d, patch); save(); return d; },

    enqueue: (item) => { const q = { id: id(), createdAt: Date.now(), state: 'pending', ...item }; state.queue.push(q); save(); return q; },
    listQueue: (st = 'pending') => state.queue.filter((q) => q.state === st),
    decideQueue: (qid, decision, note, reviewer) => { const q = state.queue.find((x) => x.id === qid); Object.assign(q, { state: decision, note, reviewer, decidedAt: Date.now() }); save(); return q; },

    createToken: (payload, ttlDays = 14) => { const t = crypto.randomBytes(24).toString('base64url'); state.tokens[t] = { ...payload, exp: Date.now() + ttlDays * 864e5 }; save(); return t; },
    useToken: (t) => { const p = state.tokens[t]; if (!p || p.exp < Date.now()) return null; delete state.tokens[t]; save(); return p; },

    reminderSent: (docId, days) => state.reminders.some((r) => r.docId === docId && r.days === days),
    markReminder: (docId, days) => { state.reminders.push({ docId, days, at: Date.now() }); save(); },
    log: (event) => { state.events.push({ at: Date.now(), ...event }); save(); },
  };
}
