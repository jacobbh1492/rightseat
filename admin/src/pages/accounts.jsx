// Create and edit accounts for CFIs, flight schools and plane owners.
import React, { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../store.jsx';
import { Btn, Segmented, KV, Badge, money } from '../ui.jsx';

const KINDS = [['cfi', 'CFI'], ['school', 'Flight school'], ['owner', 'Plane owner']];
const ROLE_KIND = { CFI: 'cfi', School: 'school', Owner: 'owner' };
export const isAccountRole = (role) => !!ROLE_KIND[role];
const CREATE_REASONS = ['Onboarding call', 'Signed up in person', 'Requested by email', 'Migrating from another platform'];
const EDIT_REASONS = ['Requested by the account holder', 'Correcting a typo', 'Rate change', 'Contact details changed'];
const join = (a) => (a || []).join(', ');
const str = (v) => (v === null || v === undefined ? '' : String(v));

// Flat form state from an account (or blanks for a new one).
function toForm(kind, a) {
  const c = a?.cfi || {}; const s = a?.school || {}; const contact = a?.contacts?.[0] || {};
  return {
    name: kind === 'school' ? str(contact.name) : str(a?.name), email: kind === 'school' ? str(contact.email) : str(a?.email),
    phone: kind === 'school' ? str(contact.phone) : str(a?.phone), airport: str(a?.airport === '—' ? '' : a?.airport),
    schoolName: kind === 'school' ? str(a?.name) : '', schoolPhone: kind === 'school' ? str(a?.phone) : '',
    certs: a ? join(c.certs) : 'CFI', flightRate: str(c.flightRate), groundRate: str(c.groundRate), discoveryPrice: str(c.discoveryPrice), specialties: join(c.specialties), bio: str(c.bio),
    website: str(s.website), about: str(s.about), trainingTypes: join(s.trainingTypes), plan: s.plan || 'starter', termsModel: s.termsModel || 'split',
    schoolPct: s.schoolPct === undefined ? '25' : String(Math.round(Number(s.schoolPct) * 1000) / 10),
    planes: (a?.planes || []).map((p) => ({ id: p.id, tail: p.tail, make: p.make, model: p.model, wetRate: str(p.wetRate), dryRate: str(p.dryRate), airport: str(p.airport) })),
  };
}

function validate(kind, f) {
  const e = {};
  const need = (k, label) => { if (!String(f[k] || '').trim()) e[k] = `${label} is required`; };
  const num = (k, label, { min = 0, max = 3000, required } = {}) => {
    if (String(f[k]).trim() === '') { if (required) e[k] = `${label} is required`; return; }
    const n = Number(f[k]); if (!Number.isFinite(n) || n < min || n > max) e[k] = `${label}: $${min}–$${max}`;
  };
  need('name', kind === 'school' ? 'Contact name' : 'Full name');
  need('email', 'Email');
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email';
  if (!/^[A-Za-z0-9]{3,4}$/.test(f.airport.trim())) e.airport = 'Airport code like KPIE';
  if (kind === 'cfi') { num('flightRate', 'Flight rate', { min: 1, max: 1000, required: true }); num('groundRate', 'Ground rate', { max: 1000 }); num('discoveryPrice', 'Discovery flight', { max: 2000 }); }
  if (kind === 'school') {
    need('schoolName', 'School name');
    const p = Number(f.schoolPct); if (!(p >= 0 && p <= 80) || String(f.schoolPct).trim() === '') e.schoolPct = '0–80%';
  }
  f.planes.forEach((p, i) => {
    const w = Number(p.wetRate); if (!(w >= 1 && w <= 3000)) e[`plane${i}`] = `${p.tail}: wet rate $1–$3,000`;
    if (p.dryRate !== '' && !(Number(p.dryRate) >= 0 && Number(p.dryRate) <= 3000)) e[`plane${i}`] = `${p.tail}: dry rate $0–$3,000`;
    if (!/^[A-Za-z0-9]{3,4}$/.test(p.airport.trim())) e[`plane${i}`] = `${p.tail}: airport code like KPIE`;
  });
  return e;
}

const numOrNull = (v) => (String(v).trim() === '' ? null : Number(v));

// What the server's "create" action takes.
function createPayload(kind, f) {
  const base = { name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone.trim(), airport: f.airport.trim().toUpperCase() };
  if (kind === 'cfi') return { ...base, certs: f.certs, flightRate: Number(f.flightRate), groundRate: Number(f.groundRate || 0), discoveryPrice: numOrNull(f.discoveryPrice), specialties: f.specialties, bio: f.bio.trim() };
  if (kind === 'school') return { ...base, phone: f.schoolPhone.trim() || f.phone.trim(), schoolName: f.schoolName.trim(), website: f.website.trim(), about: f.about.trim(), trainingTypes: f.trainingTypes, plan: f.plan, termsModel: f.termsModel, schoolPct: Number(f.schoolPct) / 100 };
  return base;
}

// Only what changed, in the server's "update" shape.
function changesFor(kind, a, init, f) {
  const ch = {};
  const diff = (k) => String(f[k]).trim() !== String(init[k]).trim();
  const set = (obj, key, k, conv = (v) => v.trim()) => { if (diff(k)) obj[key] = conv(f[k]); };
  if (kind === 'school') {
    set(ch, 'name', 'schoolName'); set(ch, 'airport', 'airport', (v) => v.trim().toUpperCase()); set(ch, 'phone', 'schoolPhone');
    const s = {};
    set(s, 'website', 'website'); set(s, 'about', 'about'); set(s, 'trainingTypes', 'trainingTypes'); set(s, 'plan', 'plan'); set(s, 'termsModel', 'termsModel');
    set(s, 'schoolPct', 'schoolPct', (v) => Number(v) / 100);
    if (Object.keys(s).length) ch.school = s;
    const contact = a.contacts?.[0];
    if (contact) {
      const c = {};
      set(c, 'name', 'name'); set(c, 'email', 'email', (v) => v.trim().toLowerCase()); set(c, 'phone', 'phone');
      if (Object.keys(c).length) ch.contact = { id: contact.id, ...c };
    }
  } else {
    set(ch, 'name', 'name'); set(ch, 'email', 'email', (v) => v.trim().toLowerCase()); set(ch, 'phone', 'phone'); set(ch, 'airport', 'airport', (v) => v.trim().toUpperCase());
  }
  if (kind === 'cfi') {
    const c = {};
    set(c, 'certs', 'certs'); set(c, 'specialties', 'specialties'); set(c, 'bio', 'bio');
    set(c, 'flightRate', 'flightRate', Number); set(c, 'groundRate', 'groundRate', (v) => Number(v || 0)); set(c, 'discoveryPrice', 'discoveryPrice', numOrNull);
    if (Object.keys(c).length) ch.cfi = c;
  }
  const planes = f.planes.map((p, i) => {
    const o = init.planes[i]; const out = { id: p.id };
    if (p.wetRate !== o.wetRate) out.wetRate = Number(p.wetRate);
    if (p.dryRate !== o.dryRate) out.dryRate = numOrNull(p.dryRate);
    if (p.airport.trim().toUpperCase() !== o.airport) out.airport = p.airport.trim().toUpperCase();
    return out;
  }).filter((p) => Object.keys(p).length > 1);
  if (planes.length) ch.planes = planes;
  return ch;
}

function Field({ label, err, children, hint }) {
  return (
    <label className="field">
      <span>{label}{err && <em className="field-err"> · {err}</em>}</span>
      {children}
      {hint && <small className="sub2">{hint}</small>}
    </label>
  );
}

// user: existing user row to edit, or null to create.
export function AccountForm({ open, onClose, user, onSaved }) {
  const { createAccount, updateAccount, sb } = useAdmin();
  const editing = !!user;
  const [kind, setKind] = useState(editing ? ROLE_KIND[user.role] : 'cfi');
  const init = useMemo(() => toForm(kind, editing ? user.account : null), [kind, user?.id, open]);
  const [f, setF] = useState(init);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setKind(editing ? ROLE_KIND[user.role] : kind); setReason(''); setErr(null); setTouched(false); } }, [open, user?.id]);
  useEffect(() => { setF(init); }, [init]);
  useEffect(() => { if (!open) return undefined; const on = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on); }, [open]);
  if (!open) return null;

  const up = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const upPlane = (i, k) => (e) => setF((x) => ({ ...x, planes: x.planes.map((p, j) => (j === i ? { ...p, [k]: e.target.value } : p)) }));
  const errors = validate(kind, f);
  const changes = editing ? changesFor(kind, user.account, init, f) : null;
  const nothingChanged = editing && Object.keys(changes).length === 0;
  const bad = Object.keys(errors).length > 0;
  const shown = touched ? errors : {};

  const save = async () => {
    setTouched(true);
    if (bad || reason.trim().length < 3 || nothingChanged) return;
    setBusy(true); setErr(null);
    try {
      const u = editing ? await updateAccount(user.id, changes, reason.trim()) : await createAccount(kind, createPayload(kind, f), reason.trim());
      onSaved?.(u);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const title = editing ? `Edit ${user.name}` : 'New account';
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal wide" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {!sb && <div className="banner">Demo data: changes stay in this browser. Connect to Positive Rate in Settings &amp; team → Data source to create and edit real accounts.</div>}
        {editing && sb && !user.live && <div className="banner">This is a demo account, so changes stay in this browser.</div>}
        {!editing && (
          <div style={{ margin: '10px 0 4px' }}>
            <Segmented options={KINDS} value={kind} onChange={setKind} />
            <p className="sub2" style={{ marginTop: 8 }}>
              {sb ? 'They sign in to the app with this email (they get a 6-digit code). If the email already has an account, the role is added to it.' : 'In live mode they sign in to the app with this email.'}
              {kind === 'cfi' && ' Their profile stays hidden until they pass verification and publish it.'}
              {kind === 'owner' && ' They add aircraft in the app; each plane goes through FAA registry and insurance checks.'}
              {kind === 'school' && ' The contact becomes the school’s admin and can invite instructors from the School dashboard.'}
            </p>
          </div>
        )}

        <div className="form-scroll">
          {kind === 'school' && (
            <>
              <div className="section-title">School</div>
              <div className="form-grid">
                <Field label="School name" err={shown.schoolName}><input value={f.schoolName} onChange={up('schoolName')} /></Field>
                <Field label="Home airport" err={shown.airport}><input value={f.airport} onChange={up('airport')} placeholder="KPIE" maxLength={4} /></Field>
                <Field label="School phone"><input value={f.schoolPhone} onChange={up('schoolPhone')} type="tel" /></Field>
                <Field label="Website"><input value={f.website} onChange={up('website')} placeholder="example.com" /></Field>
                <Field label="Training types" hint="Comma-separated, e.g. Part 61, Part 141"><input value={f.trainingTypes} onChange={up('trainingTypes')} /></Field>
                <Field label="Plan">
                  <select value={f.plan} onChange={up('plan')}><option value="starter">Starter</option><option value="pro">School Pro</option></select>
                </Field>
                <Field label="Instructor model">
                  <select value={f.termsModel} onChange={up('termsModel')}><option value="split">Revenue share</option><option value="employee">Employee (school sets rate)</option></select>
                </Field>
                <Field label="School share of instruction (%)" err={shown.schoolPct}><input value={f.schoolPct} onChange={up('schoolPct')} type="number" min="0" max="80" step="0.5" /></Field>
              </div>
              <Field label="About"><textarea rows={3} value={f.about} onChange={up('about')} /></Field>
              <div className="section-title">Contact (school admin)</div>
            </>
          )}
          {kind !== 'school' && <div className="section-title">{kind === 'cfi' ? 'Instructor' : 'Owner'}</div>}
          <div className="form-grid">
            <Field label={kind === 'school' ? 'Contact name' : 'Full name'} err={shown.name}><input value={f.name} onChange={up('name')} autoComplete="off" /></Field>
            <Field label="Email (app sign-in)" err={shown.email}><input value={f.email} onChange={up('email')} type="email" autoComplete="off" /></Field>
            <Field label="Phone"><input value={f.phone} onChange={up('phone')} type="tel" /></Field>
            {kind !== 'school' && <Field label="Home airport" err={shown.airport}><input value={f.airport} onChange={up('airport')} placeholder="KPIE" maxLength={4} /></Field>}
          </div>
          {editing && kind === 'school' && (user.account.contacts?.length || 0) > 1 && <p className="sub2">Editing the first of {user.account.contacts.length} school admins.</p>}

          {kind === 'cfi' && (
            <>
              <div className="section-title">Rates &amp; profile</div>
              <div className="form-grid">
                <Field label="Flight rate ($/hr)" err={shown.flightRate}><input value={f.flightRate} onChange={up('flightRate')} type="number" min="1" step="1" /></Field>
                <Field label="Ground rate ($/hr)" err={shown.groundRate}><input value={f.groundRate} onChange={up('groundRate')} type="number" min="0" step="1" /></Field>
                <Field label="Discovery flight ($)" err={shown.discoveryPrice} hint="Leave blank if not offered"><input value={f.discoveryPrice} onChange={up('discoveryPrice')} type="number" min="0" step="1" /></Field>
                <Field label="Certificates" hint="Comma-separated, e.g. CFI, CFII, MEI"><input value={f.certs} onChange={up('certs')} /></Field>
              </div>
              <Field label="Specialties" hint="Comma-separated, e.g. Private Pilot, Instrument, Tailwheel"><input value={f.specialties} onChange={up('specialties')} /></Field>
              <Field label="Bio"><textarea rows={3} value={f.bio} onChange={up('bio')} /></Field>
            </>
          )}

          {editing && f.planes.length > 0 && (
            <>
              <div className="section-title">Aircraft</div>
              <p className="sub2" style={{ marginTop: -4 }}>Tail number, make and model come from the FAA registry check and can’t be edited here.</p>
              {f.planes.map((p, i) => (
                <div key={p.id} className="plane-row">
                  <div className="strong" style={{ flex: '0 0 190px' }}>{p.tail}<div className="sub2">{p.make} {p.model}</div></div>
                  <Field label="Wet $/hr"><input value={p.wetRate} onChange={upPlane(i, 'wetRate')} type="number" min="1" /></Field>
                  <Field label="Dry $/hr"><input value={p.dryRate} onChange={upPlane(i, 'dryRate')} type="number" min="0" /></Field>
                  <Field label="Airport"><input value={p.airport} onChange={upPlane(i, 'airport')} maxLength={4} /></Field>
                  {shown[`plane${i}`] && <div className="field-err" style={{ flexBasis: '100%' }}>{shown[`plane${i}`]}</div>}
                </div>
              ))}
            </>
          )}

          <div className="section-title">Reason</div>
          <div className="chips">{(editing ? EDIT_REASONS : CREATE_REASONS).map((p) => <button type="button" key={p} className={`chip${reason === p ? ' on' : ''}`} onClick={() => setReason(p)}>{p}</button>)}</div>
          <Field label="Reason (saved to the audit log)" err={touched && reason.trim().length < 3 ? 'required' : null}><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
        </div>

        {err && <div className="banner bad">{err}</div>}
        <div className="row gap8 end" style={{ marginTop: 10 }}>
          {nothingChanged && <span className="sub2" style={{ marginRight: 'auto' }}>No changes yet.</span>}
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={busy || nothingChanged}>{busy ? 'Saving…' : editing ? 'Save changes' : `Create ${kind === 'cfi' ? 'CFI' : kind === 'school' ? 'flight school' : 'plane owner'} account`}</Btn>
        </div>
      </div>
    </>
  );
}

// Read-only account details for the Users drawer.
export function AccountDetails({ user }) {
  const a = user.account;
  if (!a) return null;
  const c = a.cfi; const s = a.school;
  return (
    <>
      <div className="section-title">Account details</div>
      <KV rows={[
        ['Phone', a.phone || '—'],
        c && ['Rates', `${money(c.flightRate)}/hr flight · ${money(c.groundRate)}/hr ground${c.discoveryPrice ? ` · ${money(c.discoveryPrice)} discovery` : ''}`],
        c && ['Certificates', (c.certs || []).join(', ') || '—'],
        c && ['Specialties', (c.specialties || []).join(', ') || '—'],
        c && ['Bio', c.bio || '—'],
        s && ['Website', s.website || '—'],
        s && ['Plan', s.plan === 'pro' ? 'School Pro' : 'Starter'],
        s && ['Instructor terms', s.termsModel === 'employee' ? `Employee model · school keeps ${Math.round(s.schoolPct * 100)}%` : `Revenue share · school keeps ${Math.round(s.schoolPct * 100)}%`],
        s && ['Contacts', (a.contacts || []).map((x) => `${x.name} <${x.email}>`).join(', ') || '—'],
        ['Profile', <Badge tone={a.published ? undefined : 'neutral'}>{a.published ? 'Published' : 'Not published yet'}</Badge>],
      ]} />
      {(a.planes || []).length > 0 && (
        <>
          <div className="section-title">Aircraft</div>
          {a.planes.map((p) => (
            <div key={p.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid #F1F4F8' }}>
              <div><div className="strong">{p.tail}</div><div className="sub2">{p.make} {p.model} · {p.airport}</div></div>
              <div style={{ textAlign: 'right' }}>{money(p.wetRate)}/hr wet{p.dryRate ? <div className="sub2">{money(p.dryRate)}/hr dry</div> : null}</div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
