// Admin API used by the web admin console (admin/). Every write is audit-logged with the acting team member.
import express from 'express';
import { reviewDecision } from './verify/pipeline.js';
import { syncAircraftJob, syncAirmenJob, expirationSweep, brokerReminderJob } from './jobs/jobs.js';
import { downloadAirmen } from './faa/airmen.js';

const DEFAULT_SETTINGS = {
  fees: { studentNew: 0.06, cfiNew: 0.05, owner: 0.08, protectionPerHr: 9, deposit: 500, lateCancel: 0.5, instantPayout: 0.015 },
  minimums: { renterLiability: 1000000, renterDamage: 25000, instructorLiability: 1000000, ownerLiability: 1000000, autoApproveConfidence: 0.9 },
  plans: { cfiPro: 29, schoolStarter: 99, schoolPro: 249 },
};

export function adminRouter(deps) {
  const { db } = deps;
  const r = express.Router();
  r.use(express.json());

  // CORS for the admin console's origin (set ADMIN_ORIGIN in production; defaults to any origin).
  r.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', process.env.ADMIN_ORIGIN || '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, x-reviewer');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  // TODO before launch: replace the shared key with per-member SSO tokens + roles.
  r.use((req, res, next) => (req.header('x-admin-key') && req.header('x-admin-key') === process.env.ADMIN_KEY ? next() : res.status(403).json({ error: 'forbidden' })));
  const actor = (req) => req.header('x-reviewer') || 'admin';
  const audit = (req, action, target, note = '') => db.log({ kind: 'admin', actor: actor(req), action, target, note });

  r.get('/queue', (req, res) => {
    res.json(db.listQueue(req.query.state || 'pending').map((q) => ({ ...q, doc: db.state.docs.find((d) => d.id === q.docId) || null })));
  });
  r.post('/queue/:id', async (req, res) => {
    const { decision, note } = req.body || {};
    if (!['approved', 'rejected', 'reupload'].includes(decision)) return res.status(400).json({ error: 'decision must be approved | rejected | reupload' });
    const doc = await reviewDecision(db, req.params.id, decision, note, actor(req));
    audit(req, decision === 'approved' ? 'Approved document' : decision === 'reupload' ? 'Requested re-upload' : 'Rejected document', `${doc.type} · ${doc.userId}`, note);
    res.json(doc);
  });

  r.get('/users', (req, res) => {
    res.json(db.listUsers().map((u) => {
      const id = db.currentDoc(u.id, 'id');
      return { id: u.id, name: u.name, email: u.email || '', role: u.role || 'Student', airport: u.airport || '', stage: u.stage || '', joined: u.joined || new Date().toISOString(), status: u.status || 'Active', verified: id?.status === 'approved' ? 'Verified' : 'Pending', notes: u.notes || [] };
    }));
  });
  r.post('/users/:id', (req, res) => {
    const u = db.getUser(req.params.id);
    if (!u) return res.status(404).json({ error: 'not found' });
    const { status, reason } = req.body || {};
    if (!['Active', 'Suspended'].includes(status)) return res.status(400).json({ error: 'status must be Active | Suspended' });
    db.upsertUser({ id: u.id, status, statusReason: reason });
    audit(req, status === 'Suspended' ? 'Suspended user' : 'Reinstated user', u.name, reason);
    res.json(db.getUser(u.id));
  });

  r.get('/listings', (req, res) => res.json(db.listListings().map((l) => ({ ...l, serverId: l.id }))));
  r.post('/listings/:id/:action', (req, res) => {
    if (!['pause', 'resume'].includes(req.params.action)) return res.status(404).json({ error: 'unknown action' });
    const l = db.getListing(req.params.id);
    if (!l) return res.status(404).json({ error: 'not found' });
    const pause = req.params.action === 'pause';
    db.upsertListing({ id: l.id, paused: pause, pausedReason: pause ? req.body?.reason || 'Paused by admin' : null });
    audit(req, pause ? 'Paused listing' : 'Resumed listing', l.tail, req.body?.reason);
    res.json(db.getListing(l.id));
  });

  r.get('/settings', (req, res) => res.json(db.state.settings || DEFAULT_SETTINGS));
  r.put('/settings', (req, res) => {
    const cur = db.state.settings || structuredClone(DEFAULT_SETTINGS);
    for (const [group, vals] of Object.entries(req.body || {})) {
      if (!cur[group]) return res.status(400).json({ error: `unknown group ${group}` });
      for (const [k, v] of Object.entries(vals)) {
        if (!(k in cur[group]) || typeof v !== 'number' || v < 0) return res.status(400).json({ error: `bad value for ${group}.${k}` });
        audit(req, 'Changed setting', `${group}.${k}`, `${cur[group][k]} → ${v}`);
        cur[group][k] = v;
      }
    }
    db.state.settings = cur;
    db.save();
    res.json(cur);
  });

  r.get('/audit', (req, res) => {
    res.json(db.state.events.filter((e) => e.kind === 'admin').reverse().slice(0, 500).map((e) => ({ at: new Date(e.at).toISOString(), actor: e.actor, action: e.action, target: e.target, note: e.note })));
  });

  r.post('/jobs/:name/run', async (req, res) => {
    const jobs = {
      aircraft: async () => (deps.aircraft ? syncAircraftJob({ db, aircraft: deps.aircraft }) : { error: 'aircraft registry not loaded' }),
      airmen: async () => syncAirmenJob({ db, airmen: deps.airmen || (await downloadAirmen()) }),
      sweep: () => expirationSweep({ db }),
      broker: () => brokerReminderJob({ db, baseUrl: deps.baseUrl }),
    };
    if (!jobs[req.params.name]) return res.status(404).json({ error: 'unknown job' });
    try {
      const result = await jobs[req.params.name]();
      audit(req, 'Ran job', req.params.name);
      res.json({ ok: true, result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return r;
}
