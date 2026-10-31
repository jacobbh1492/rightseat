import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { buildDemo } from './data/demo.js';

// ---------- Roles & permissions ----------
export const ROLES = ['Owner', 'Admin', 'Reviewer', 'Support'];
const PAGE_ACCESS = {
  Owner: '*',
  Admin: '*',
  Reviewer: ['overview', 'verification', 'reviews', 'trust', 'automation', 'listings'],
  Support: ['overview', 'users', 'bookings', 'payments', 'disputes', 'reviews', 'trust', 'listings'],
};
const ACTION_ACCESS = {
  verify: ['Owner', 'Admin', 'Reviewer'],
  suspend: ['Owner', 'Admin', 'Support'],
  refund: ['Owner', 'Admin', 'Support'],
  pauseListing: ['Owner', 'Admin', 'Reviewer', 'Support'],
  moderate: ['Owner', 'Admin', 'Reviewer', 'Support'],
  runJob: ['Owner', 'Admin', 'Reviewer'],
  settings: ['Owner'],
  team: ['Owner'],
};
export const SUPPORT_REFUND_LIMIT = 250;
export const canSee = (role, page) => PAGE_ACCESS[role] === '*' || PAGE_ACCESS[role].includes(page);
export const canDo = (role, action) => ACTION_ACCESS[action]?.includes(role);

const Ctx = createContext(null);
const readCfg = () => { try { return JSON.parse(localStorage.getItem('rs-admin-cfg') || '{}'); } catch { return {}; } };
const writeCfg = (c) => { try { localStorage.setItem('rs-admin-cfg', JSON.stringify(c)); } catch { /* storage unavailable */ } };

export function AdminProvider({ children }) {
  const [db, setDb] = useState(buildDemo);
  const [me, setMe] = useState(null); // signed-in admin (team member)
  const [cfg, setCfg] = useState(() => ({ mode: 'demo', apiUrl: '', adminKey: '', ...readCfg() }));
  const [toast, setToast] = useState(null);
  const [liveError, setLiveError] = useState(null);
  const notify = (text, kind = 'ok') => { setToast({ text, kind, id: Date.now() }); setTimeout(() => setToast(null), 3200); };

  const audit = (action, target, note = '') =>
    setDb((d) => ({ ...d, audit: [{ at: new Date().toISOString(), actor: me?.name || 'Admin', action, target, note }, ...d.audit] }));
  const patch = (key, id, p) => setDb((d) => ({ ...d, [key]: d[key].map((x) => (x.id === id ? { ...x, ...(typeof p === 'function' ? p(x) : p) } : x)) }));

  // ---------- Live server adapter (verification server /api/admin/*) ----------
  const live = cfg.mode === 'live' && cfg.apiUrl;
  const api = async (path, opts = {}) => {
    const res = await fetch(cfg.apiUrl.replace(/\/$/, '') + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': cfg.adminKey, 'x-reviewer': me?.name || 'admin', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  };
  const refreshLive = async () => {
    if (!live) return;
    try {
      const [queue, users, listings, settings, auditLog] = await Promise.all([
        api('/api/admin/queue'), api('/api/admin/users'), api('/api/admin/listings'), api('/api/admin/settings'), api('/api/admin/audit'),
      ]);
      setDb((d) => ({
        ...d,
        queue: queue.map((q) => ({ id: q.id, who: q.who, role: q.role || q.subjectKind || '', type: q.type, fields: q.doc?.fields || {}, checks: q.doc?.checks || [], confidence: q.confidence ?? 1, reasons: q.reasons || [], submitted: new Date(q.createdAt).toISOString(), state: 'pending' })),
        users: users.length ? users : d.users,
        listings: listings.length ? listings.map((l) => ({ ...d.listings.find((x) => x.tail === l.tail), ...l, status: l.paused ? 'Paused' : 'Active' })) : d.listings,
        settings: { ...d.settings, ...settings },
        audit: auditLog.length ? auditLog : d.audit,
      }));
      setLiveError(null);
    } catch (e) {
      setLiveError(e.message);
    }
  };
  useEffect(() => { if (me) refreshLive(); }, [cfg.mode, cfg.apiUrl, cfg.adminKey, me?.id]);

  const value = useMemo(() => ({
    db, me, cfg, toast, live: !!live, liveError,
    signIn: (member) => setMe(member),
    signOut: () => setMe(null),
    switchRole: (role) => setMe((m) => ({ ...m, role })),
    setConfig: (c) => { const n = { ...cfg, ...c }; setCfg(n); writeCfg(n); },
    refreshLive,
    notify,
    can: (action) => canDo(me?.role, action),

    decideDoc: async (qid, decision, note) => {
      const q = db.queue.find((x) => x.id === qid);
      if (live) { await api(`/api/admin/queue/${qid}`, { method: 'POST', body: { decision, note } }); await refreshLive(); }
      else patch('queue', qid, { state: decision, note, decidedBy: me.name, decidedAt: new Date().toISOString() });
      audit(decision === 'approved' ? 'Approved document' : decision === 'reupload' ? 'Requested re-upload' : 'Rejected document', `${q.who} · ${q.type}`, note);
      notify(decision === 'approved' ? 'Approved. The user has been notified.' : 'Sent back to the user.');
    },
    setUserStatus: async (id, status, reason) => {
      const u = db.users.find((x) => x.id === id);
      if (live) await api(`/api/admin/users/${id}`, { method: 'POST', body: { status, reason } }).catch(() => {});
      patch('users', id, { status });
      audit(status === 'Suspended' ? 'Suspended user' : 'Reinstated user', u.name, reason);
      notify(`${u.name} ${status === 'Suspended' ? 'suspended' : 'reinstated'}.`);
    },
    addUserNote: (id, text) => {
      patch('users', id, (u) => ({ notes: [{ at: new Date().toISOString(), by: me.name, text }, ...u.notes] }));
      audit('Added note', db.users.find((x) => x.id === id).name, text);
    },
    setListing: async (id, pause, reason) => {
      const l = db.listings.find((x) => x.id === id);
      if (live) { await api(`/api/admin/listings/${l.serverId || id}/${pause ? 'pause' : 'resume'}`, { method: 'POST', body: { reason } }).catch(() => {}); }
      patch('listings', id, { status: pause ? 'Paused' : 'Active', pausedReason: pause ? reason : null });
      audit(pause ? 'Paused listing' : 'Resumed listing', `${l.tail} · ${l.make} ${l.model}`, reason);
      notify(`${l.tail} ${pause ? 'paused. New bookings are blocked' : 'is bookable again'}.`);
    },
    refund: (bookingId, amount, reason) => {
      const b = db.bookings.find((x) => x.id === bookingId);
      patch('bookings', bookingId, (x) => ({ refunded: Math.round((x.refunded + amount) * 100) / 100, timeline: [...x.timeline, { at: new Date().toISOString(), text: `Refund $${amount.toFixed(2)} by ${me.name}: ${reason}` }] }));
      audit('Issued refund', `Booking ${bookingId}`, `$${amount.toFixed(2)}: ${reason}`);
      notify(`Refunded $${amount.toFixed(2)} on ${bookingId}.`);
      return b;
    },
    cancelBooking: (bookingId, reason) => {
      patch('bookings', bookingId, (x) => ({ status: 'Cancelled', cancelReason: reason, timeline: [...x.timeline, { at: new Date().toISOString(), text: `Cancelled by ${me.name}: ${reason}` }] }));
      audit('Cancelled booking', `Booking ${bookingId}`, reason);
      notify(`Booking ${bookingId} cancelled. Holds released.`);
    },
    resolveDispute: (id, resolution, amount) => {
      const dsp = db.disputes.find((x) => x.id === id);
      patch('disputes', id, { status: 'Resolved', resolution, refunded: amount });
      if (amount > 0) patch('bookings', dsp.bookingId, (x) => ({ refunded: Math.round((x.refunded + amount) * 100) / 100 }));
      audit('Resolved dispute', `${id} · booking ${dsp.bookingId}`, `${resolution}${amount ? ` · refund $${amount.toFixed(2)}` : ''}`);
      notify('Dispute resolved. Both parties notified, payout released.');
    },
    moderateReview: (id, status, note) => {
      const r = db.reviews.find((x) => x.id === id);
      patch('reviews', id, { status });
      audit(status === 'Hidden' ? 'Hid review' : 'Kept review', `${r.name} → ${r.target}`, note);
      notify(status === 'Hidden' ? 'Review hidden.' : 'Review kept published.');
    },
    actOnFlag: (id, action) => {
      const f = db.flags.find((x) => x.id === id);
      patch('flags', id, { status: action });
      audit(`Flag: ${action.toLowerCase()}`, `${f.from} → ${f.to}`, f.reason);
      notify(action === 'Warned' ? `${f.from} was sent a reminder about off-app payments.` : 'Flag dismissed.');
    },
    runJob: async (key) => {
      if (live) await api(`/api/admin/jobs/${key}/run`, { method: 'POST' }).catch((e) => notify(e.message, 'err'));
      setDb((d) => ({ ...d, jobs: d.jobs.map((j) => (j.key === key ? { ...j, last: new Date().toISOString() } : j)) }));
      audit('Ran job', db.jobs.find((j) => j.key === key).name);
      notify('Job started.');
    },
    updateSetting: async (group, key, val, label, from) => {
      setDb((d) => ({ ...d, settings: { ...d.settings, [group]: { ...d.settings[group], [key]: val } } }));
      if (live) await api('/api/admin/settings', { method: 'PUT', body: { [group]: { [key]: val } } }).catch(() => {});
      audit('Changed setting', label, `${from} → ${val}`);
    },
    inviteMember: (name, email, role) => {
      setDb((d) => ({ ...d, team: [...d.team, { id: 't' + Date.now(), name, email, role, lastActive: null, invited: true }] }));
      audit('Invited team member', `${name} <${email}>`, role);
      notify(`Invite sent to ${email}.`);
    },
    setMemberRole: (id, role) => {
      const m = db.team.find((x) => x.id === id);
      setDb((d) => ({ ...d, team: d.team.map((x) => (x.id === id ? { ...x, role } : x)) }));
      audit('Changed team role', m.name, `${m.role} → ${role}`);
    },
  }), [db, me, cfg, toast, live, liveError]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAdmin = () => useContext(Ctx);
