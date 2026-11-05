import React, { useEffect, useState } from 'react';
import { useAdmin, canSee, ROLES } from './store.jsx';
import { Icon, Btn } from './ui.jsx';
import { Overview, Verification, Users } from './pages/core.jsx';
import { Listings, Bookings, Payments, Disputes } from './pages/ops.jsx';
import { Reviews, Trust, Automation, Config } from './pages/system.jsx';

const NAV = [
  { group: null, items: [{ key: 'overview', label: 'Overview', icon: 'overview', C: Overview }] },
  { group: 'Operations', items: [
    { key: 'bookings', label: 'Bookings', icon: 'calendar', C: Bookings },
    { key: 'payments', label: 'Payments & payouts', icon: 'dollar', C: Payments },
    { key: 'disputes', label: 'Disputes', icon: 'alert', C: Disputes },
  ] },
  { group: 'People & aircraft', items: [
    { key: 'users', label: 'Users', icon: 'users', C: Users },
    { key: 'listings', label: 'Aircraft listings', icon: 'plane', C: Listings },
  ] },
  { group: 'Trust', items: [
    { key: 'verification', label: 'Verification queue', icon: 'verify', C: Verification },
    { key: 'reviews', label: 'Reviews', icon: 'star', C: Reviews },
    { key: 'trust', label: 'Trust & safety', icon: 'flag', C: Trust },
  ] },
  { group: 'System', items: [
    { key: 'automation', label: 'Automation', icon: 'zap', C: Automation },
    { key: 'config', label: 'Settings & team', icon: 'settings', C: Config },
  ] },
];
const ALL = NAV.flatMap((g) => g.items);

function Login() {
  const { db, signIn } = useAdmin();
  const [email, setEmail] = useState(db.team[0].email);
  const [pw, setPw] = useState('');
  const go = (member) => signIn(member || db.team.find((t) => t.email === email.trim()) || db.team[0]);
  return (
    <div className="login">
      <div className="login-art">
        <div style={{ fontWeight: 900, fontSize: 22, color: '#93C5FD' }}>Positive Rate</div>
        <h1 style={{ fontSize: 40, lineHeight: 1.1, marginTop: 10 }}>Admin console</h1>
        <p style={{ color: '#B9C7DD', maxWidth: 420, fontSize: 15, lineHeight: 1.5 }}>Run the marketplace: bookings and payouts, verification, disputes, trust & safety. Every action is permissioned and logged.</p>
      </div>
      <div className="login-form">
        <form className="login-card" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <h1>Sign in</h1>
          <p className="muted">Team accounts only. Production adds SSO and required 2-step verification.</p>
          <label className="field"><span>Work email</span><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" /></label>
          <label className="field"><span>Password</span><input value={pw} onChange={(e) => setPw(e.target.value)} type="password" autoComplete="current-password" placeholder="Any password works in the demo" /></label>
          <Btn type="submit" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>Sign in</Btn>
          <div className="section-title" style={{ marginTop: 24 }}>Demo: sign in as</div>
          <div className="chips">
            {db.team.map((t) => <button type="button" key={t.id} className="chip" onClick={() => go(t)}>{t.name} · {t.role}</button>)}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const { me, db, toast, cfg, live, liveError, signOut, switchRole } = useAdmin();
  const readHash = () => (typeof window !== 'undefined' && window.location.hash.slice(1)) || 'overview';
  const [page, setPage] = useState(readHash);
  useEffect(() => {
    const on = () => setPage(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (k) => { setPage(k); try { window.location.hash = k; } catch { /* ignore */ } };

  if (!me) return <><Login />{toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}</>;

  const visible = ALL.filter((i) => canSee(me.role, i.key));
  const current = visible.find((i) => i.key === page) || visible[0];
  const counts = {
    verification: db.queue.filter((q) => q.state === 'pending').length,
    disputes: db.disputes.filter((d) => d.status === 'Open').length,
    reviews: db.reviews.filter((r) => r.status === 'Reported').length,
    trust: db.flags.filter((f) => f.status === 'Open').length,
  };
  const P = current.C;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Positive Rate <small>ADMIN</small></div>
        <nav className="nav" aria-label="Admin sections">
          {NAV.map((g) => {
            const items = g.items.filter((i) => canSee(me.role, i.key));
            if (!items.length) return null;
            return (
              <React.Fragment key={g.group || 'top'}>
                {g.group && <div className="nav-group">{g.group}</div>}
                {items.map((i) => (
                  <button key={i.key} className={current.key === i.key ? 'on' : ''} onClick={() => go(i.key)} aria-current={current.key === i.key ? 'page' : undefined}>
                    <Icon name={i.icon} /> {i.label}
                    {counts[i.key] ? <span className="count" aria-label={`${counts[i.key]} need attention`}>{counts[i.key]}</span> : null}
                  </button>
                ))}
              </React.Fragment>
            );
          })}
        </nav>
        <div className="side-foot">Signed in as {me.name}<br />{me.email}</div>
      </aside>
      <div className="main">
        <header className="top">
          <div className="row gap8">
            <span className={`env ${live ? 'live' : 'demo'}`}>{live ? (liveError ? 'Live · connection error' : 'Live server') : 'Demo data'}</span>
            {live && liveError && <span className="small" style={{ color: 'var(--bad)' }}>{liveError}</span>}
          </div>
          <div className="row gap12">
            <label className="row gap8 small muted" style={{ margin: 0 }}>
              View as
              <select value={me.role} onChange={(e) => switchRole(e.target.value)} aria-label="View as role" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '5px 8px' }}>
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <span className="avatar" aria-hidden="true">{me.name.split(' ').map((w) => w[0]).join('')}</span>
            <button className="link" onClick={signOut}><Icon name="logout" size={16} /> Sign out</button>
          </div>
        </header>
        <main className="content">
          <P go={go} />
        </main>
      </div>
      {toast && <div className={`toast ${toast.kind}`} role="status"><Icon name={toast.kind === 'err' ? 'alert' : 'check'} size={16} />{toast.text}</div>}
    </div>
  );
}
