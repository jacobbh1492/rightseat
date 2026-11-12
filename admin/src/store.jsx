import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { buildDemo } from './data/demo.js';
import { readSession, sendCode, verifyCode, signOutLive, callAccounts, toUser } from './accounts.js';

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
  accounts: ['Owner', 'Admin', 'Support'],
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
  // Live account tools (Supabase): staff session + load state.
  const [sb, setSb] = useState(readSession);
  const [acctState, setAcctState] = useState({ loading: false, error: null, loadedAt: null });
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

  // ---------- Live accounts (Supabase admin-accounts function) ----------
  const accounts = async (body) => {
    try {
      const { data, session } = await callAccounts(sb, body);
      if (session.access_token !== sb.access_token) setSb(session);
      return data;
    } catch (e) {
      if (e.status === 401) { signOutLive(); setSb(null); }
      throw e;
    }
  };
  const ACCT_ROLES = ['CFI', 'Owner', 'School'];
  const loadAccounts = async () => {
    if (!sb) return;
    setAcctState((x) => ({ ...x, loading: true, error: null }));
    try {
      const { accounts: list } = await accounts({ action: 'list' });
      setDb((d) => ({ ...d, users: [...d.users.filter((u) => !ACCT_ROLES.includes(u.role)), ...list.map(toUser)] }));
      setAcctState({ loading: false, error: null, loadedAt: new Date().toISOString() });
    } catch (e) {
      setAcctState({ loading: false, error: e.message, loadedAt: null });
    }
  };
  useEffect(() => { if (me && sb) loadAccounts(); }, [me?.id, sb?.email]);
  const upsertUser = (u) => setDb((d) => ({ ...d, users: d.users.some((x) => x.id === u.id) ? d.users.map((x) => (x.id === u.id ? { ...x, ...u, notes: x.notes } : x)) : [u, ...d.users] }));

  // Demo mode: apply a create/update to the in-browser data so the screens behave the same.
  const KIND_ROLE = { cfi: 'CFI', owner: 'Owner', school: 'School' };
  const demoStage = (a) => (a.kind === 'cfi' ? (a.cfi.certs || []).join(' · ') : a.kind === 'owner' ? `${(a.planes || []).length} aircraft` : (a.school.trainingTypes || []).join(' & ') || 'Starter');
  const splitList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => x.trim()).filter(Boolean);
  const demoCreate = (kind, f) => {
    const email = f.email.trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === email && u.role === KIND_ROLE[kind])) throw new Error(`${email} already has a ${KIND_ROLE[kind]} account.`);
    const id = `${kind}-${Date.now()}`;
    const a = { id, kind, name: kind === 'school' ? f.schoolName.trim() : f.name.trim(), email, phone: f.phone || '', airport: f.airport.toUpperCase(), published: false, verified: false, planes: [] };
    if (kind === 'cfi') a.cfi = { certs: splitList(f.certs).length ? splitList(f.certs) : ['CFI'], flightRate: Number(f.flightRate), groundRate: Number(f.groundRate || 0), discoveryPrice: f.discoveryPrice === '' ? null : Number(f.discoveryPrice), specialties: splitList(f.specialties), bio: f.bio || '' };
    if (kind === 'school') {
      a.contacts = [{ id: id + '-admin', name: f.name.trim(), email, phone: f.phone || '', airport: a.airport }];
      a.school = { website: f.website || '', about: f.about || '', trainingTypes: splitList(f.trainingTypes), plan: f.plan, termsModel: f.termsModel, schoolPct: Number(f.schoolPct) };
    }
    return { id, name: a.name, email, role: KIND_ROLE[kind], airport: a.airport, stage: demoStage(a), joined: new Date().toISOString(), status: 'Active', verified: 'Pending', notes: [], account: a };
  };
  const demoUpdate = (u, ch) => {
    const a = structuredClone(u.account);
    for (const k of ['name', 'email', 'phone', 'airport']) if (k in ch) a[k] = k === 'airport' ? ch[k].toUpperCase() : ch[k];
    if (ch.cfi) a.cfi = { ...a.cfi, ...ch.cfi, ...(ch.cfi.certs !== undefined ? { certs: splitList(ch.cfi.certs) } : {}), ...(ch.cfi.specialties !== undefined ? { specialties: splitList(ch.cfi.specialties) } : {}) };
    if (ch.school) a.school = { ...a.school, ...ch.school, ...(ch.school.trainingTypes !== undefined ? { trainingTypes: splitList(ch.school.trainingTypes) } : {}) };
    if (ch.contact) a.contacts = a.contacts.map((c) => (c.id === ch.contact.id ? { ...c, ...ch.contact } : c));
    if (ch.planes) a.planes = a.planes.map((p) => ({ ...p, ...(ch.planes.find((x) => x.id === p.id) || {}) }));
    if (a.kind === 'school' && a.contacts?.[0]) a.email = a.contacts[0].email;
    return { ...u, name: a.name, email: a.email, airport: a.airport, stage: demoStage(a), account: a };
  };

  const value = useMemo(() => ({
    db, me, cfg, toast, live: !!live, liveError,
    sb, acctState, loadAccounts,
    sendStaffCode: (email) => sendCode(email),
    verifyStaffCode: async (email, code) => { const s = await verifyCode(email, code); setSb(s); notify(`Connected as ${s.email}.`); },
    disconnectStaff: () => { signOutLive(); setSb(null); setDb((d) => ({ ...d, users: buildDemo().users.filter((u) => ['CFI', 'Owner', 'School'].includes(u.role)).concat(d.users.filter((u) => !['CFI', 'Owner', 'School'].includes(u.role))) })); },

    // Create a CFI, flight school or plane-owner account. Returns the new user row.
    createAccount: async (kind, form, reason) => {
      let u;
      if (sb) {
        const { account } = await accounts({ action: 'create', kind, reason, ...form });
        u = toUser(account);
      } else {
        u = demoCreate(kind, form);
      }
      upsertUser(u);
      audit(`Created ${KIND_ROLE[kind] === 'School' ? 'flight school' : KIND_ROLE[kind] === 'Owner' ? 'plane owner' : 'CFI'} account`, `${u.name} <${u.email}>`, reason);
      notify(sb ? `${u.name} created. They sign in to the app with ${u.email}.` : `${u.name} created (demo data only).`);
      return u;
    },
    // Save edits. `changes` holds only the fields that changed.
    updateAccount: async (userId, changes, reason) => {
      const u = db.users.find((x) => x.id === userId);
      let next;
      if (sb && u.live) {
        const { account } = await accounts({ action: 'update', kind: u.account.kind, id: u.account.id, reason, ...changes });
        next = toUser(account);
      } else {
        next = demoUpdate(u, changes);
      }
      upsertUser(next);
      audit('Edited account details', `${next.name} (${next.role})`, reason);
      notify(`${next.name} updated.`);
      return next;
    },
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
  }), [db, me, cfg, toast, live, liveError, sb, acctState]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAdmin = () => useContext(Ctx);
