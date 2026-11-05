import React, { useMemo, useState } from 'react';
import { useAdmin } from '../store.jsx';
import { PageHeader, Stat, WeeklyChart, Badge, Btn, Table, Drawer, ReasonModal, Search, Segmented, KV, Icon, money, pct } from '../ui.jsx';
import { fmtDate, fmtDateTime } from '../data/demo.js';
import { DOC_TYPES, SOURCES } from '../../../src/verification.js';

export const useLookups = () => {
  const { db } = useAdmin();
  return useMemo(() => {
    const users = Object.fromEntries(db.users.map((u) => [u.id, u]));
    const planes = Object.fromEntries(db.listings.map((p) => [p.id, p]));
    return { user: (id) => users[id], plane: (id) => planes[id] };
  }, [db.users, db.listings]);
};

function weekly(bookings, fn) {
  const out = [];
  const now = new Date();
  for (let w = 7; w >= 0; w--) {
    const end = new Date(now); end.setDate(end.getDate() - 7 * w);
    const start = new Date(end); start.setDate(start.getDate() - 7);
    const inW = bookings.filter((b) => b.status === 'Completed' && new Date(b.when) >= start && new Date(b.when) < end);
    out.push({ label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: fn(inW) });
  }
  return out;
}

export function Overview({ go }) {
  const { db } = useAdmin();
  const now = Date.now();
  const inDays = (b, from, to) => { const t = new Date(b.when).getTime(); return t >= now - from * 864e5 && t < now - to * 864e5; };
  const done = db.bookings.filter((b) => b.status === 'Completed');
  const last7 = done.filter((b) => inDays(b, 7, 0)).length;
  const prev7 = done.filter((b) => inDays(b, 14, 7)).length;
  const d30 = done.filter((b) => inDays(b, 30, 0));
  const gmv = d30.reduce((a, b) => a + b.total, 0);
  const rev = d30.reduce((a, b) => a + b.split.platform, 0);
  const activeStudents = new Set(d30.map((b) => b.studentId)).size;
  const rebook = Math.round((db.pairs.filter((p) => p.lessons >= 2).length / db.pairs.length) * 100);
  const upcoming = db.bookings.filter((b) => ['Pending', 'Confirmed'].includes(b.status)).length;
  const change = prev7 ? Math.round(((last7 - prev7) / prev7) * 100) : 0;

  const attention = [
    { n: db.queue.filter((q) => q.state === 'pending').length, label: 'documents waiting for review', icon: 'verify', page: 'verification', tone: 'warn' },
    { n: db.disputes.filter((d) => d.status === 'Open').length, label: 'open disputes (payouts on hold)', icon: 'alert', page: 'disputes', tone: 'bad' },
    { n: db.reviews.filter((r) => r.status === 'Reported').length, label: 'reported reviews', icon: 'star', page: 'reviews', tone: 'warn' },
    { n: db.flags.filter((f) => f.status === 'Open').length, label: 'flagged messages (off-app contact)', icon: 'flag', page: 'trust', tone: 'warn' },
    { n: db.listings.filter((l) => l.status === 'Paused').length, label: 'paused aircraft listings', icon: 'plane', page: 'listings', tone: 'neutral' },
    { n: db.bookings.filter((b) => b.status === 'Pending').length, label: 'booking requests not yet confirmed', icon: 'calendar', page: 'bookings', tone: 'neutral' },
  ].filter((x) => x.n > 0);
  const toneBg = { warn: ['#FEF3C7', '#B45309'], bad: ['#FEE2E2', '#DC2626'], neutral: ['#EEF1F5', '#64748B'] };

  return (
    <>
      <PageHeader title="Overview" subtitle={`Marketplace health · ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`} />
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Lessons flown · 7 days" value={last7} sub={`${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% vs prior week`} tone={change >= 0 ? 'good' : 'bad'} onClick={() => go('bookings')} />
        <Stat label="Booked · 30 days" value={money(gmv)} sub={`${d30.length} completed flights`} onClick={() => go('payments')} />
        <Stat label="Positive Rate revenue · 30 days" value={money(rev)} sub={`${pct(rev / gmv)} take rate after card fees`} onClick={() => go('payments')} />
        <Stat label="Student–CFI rebooking" value={`${rebook}%`} sub="Goal 80%+. Watch leakage" tone={rebook >= 80 ? 'good' : 'warn'} onClick={() => go('trust')} />
      </div>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Active students · 30 days" value={activeStudents} sub={`${db.users.filter((u) => u.role === 'Student').length} total accounts`} onClick={() => go('users')} />
        <Stat label="Instructors" value={db.users.filter((u) => u.role === 'CFI').length} sub={`${db.cfis.filter((c) => c.pro).length} on CFI Pro`} onClick={() => go('users')} />
        <Stat label="Aircraft listed" value={db.listings.length} sub={`${db.listings.filter((l) => l.status === 'Paused').length} paused`} onClick={() => go('listings')} />
        <Stat label="Upcoming bookings" value={upcoming} sub="Next 14 days" onClick={() => go('bookings')} />
      </div>
      <div className="grid g2" style={{ marginBottom: 16 }}>
        <WeeklyChart title="Lessons flown per week" caption="Completed flights, last 8 weeks" data={weekly(db.bookings, (b) => b.length)} />
        <WeeklyChart title="Positive Rate revenue per week" caption="Booking + host fees, after card processing" type="line" data={weekly(db.bookings, (b) => Math.round(b.reduce((a, x) => a + x.split.platform, 0)))} format={(v) => money(v)} />
      </div>
      <div className="grid g2">
        <div className="card">
          <h3>Needs attention</h3>
          {attention.length === 0 && <div className="empty">All clear.</div>}
          {attention.map((a) => (
            <div key={a.page + a.label} className="alert-row" role="button" tabIndex={0} onClick={() => go(a.page)} onKeyDown={(e) => e.key === 'Enter' && go(a.page)}>
              <div className="alert-ico" style={{ background: toneBg[a.tone][0], color: toneBg[a.tone][1] }}><Icon name={a.icon} /></div>
              <div style={{ flex: 1 }}><span className="strong">{a.n}</span> {a.label}</div>
              <span className="link">Open ›</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="row between"><h3>Recent admin activity</h3><button className="link" onClick={() => go('config')}>Audit log ›</button></div>
          {db.audit.slice(0, 6).map((e, i) => (
            <div key={i} className="alert-row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1 }}>
                <div><span className="strong">{e.actor}</span> {e.action.toLowerCase()} · {e.target}</div>
                {e.note && <div className="sub2">{e.note}</div>}
              </div>
              <span className="sub2">{fmtDateTime(e.at)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const NOTES = ['Name variation OK', 'Matches certificate photo', 'Authority confirmed (LLC/leaseback)', 'Need a clearer photo', 'Upload IA card', 'Add Positive Rate as additional insured'];

export function Verification() {
  const { db, decideDoc, can } = useAdmin();
  const [tab, setTab] = useState('pending');
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null);
  const rows = db.queue.filter((q) => (tab === 'pending' ? q.state === 'pending' : q.state !== 'pending'));
  const q = sel && db.queue.find((x) => x.id === sel);
  const LV = { pass: ['✓', 'var(--good)'], warn: ['!', 'var(--warn)'], fail: ['✕', 'var(--bad)'] };

  return (
    <>
      <PageHeader title="Verification queue" subtitle="Only documents automation couldn’t approve on its own. Clean documents never reach this list.">
        <Segmented options={[['pending', `Pending (${db.queue.filter((x) => x.state === 'pending').length})`], ['done', 'Decided']]} value={tab} onChange={setTab} />
      </PageHeader>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Auto-approved · 30 days" value="412" sub="78% with no human" tone="good" />
        <Stat label="Waiting" value={db.queue.filter((x) => x.state === 'pending').length} sub="Target: under 4 hours" />
        <Stat label="Median review time" value="2 min" />
        <Stat label="Rejected · 30 days" value="14" sub="Mostly expired documents" />
      </div>
      <Table
        rows={rows}
        onRow={(r) => setSel(r.id)}
        selectedId={sel}
        empty={tab === 'pending' ? 'Queue is clear. Everything else was handled automatically.' : 'No decisions yet.'}
        columns={[
          { key: 'who', label: 'Submitted by', render: (r) => <><div className="strong">{r.who}</div><div className="sub2">{r.role}</div></> },
          { key: 'type', label: 'Document', render: (r) => DOC_TYPES[r.type]?.title || r.type },
          { key: 'reasons', label: 'Why it’s here', render: (r) => <span className="sub2">{r.reasons[0] || '—'}</span> },
          { key: 'confidence', label: 'Read confidence', align: 'right', render: (r) => <Badge tone={r.confidence < 0.8 ? 'warn' : 'neutral'}>{Math.round(r.confidence * 100)}%</Badge> },
          { key: 'submitted', label: 'Submitted', render: (r) => fmtDateTime(r.submitted) },
          ...(tab === 'done' ? [{ key: 'state', label: 'Decision', render: (r) => <><Badge>{r.state}</Badge> <span className="sub2">{r.decidedBy}</span></> }] : []),
        ]}
      />
      <Drawer
        open={!!q}
        onClose={() => setSel(null)}
        title={q ? `${DOC_TYPES[q.type]?.title} · ${q.who}` : ''}
        footer={q && q.state === 'pending' && can('verify') && (
          <>
            <Btn kind="ghost" onClick={() => setModal('reupload')}>Ask to re-upload</Btn>
            <Btn kind="danger" onClick={() => setModal('rejected')}>Reject</Btn>
            <Btn kind="good" onClick={() => setModal('approved')} icon="check">Approve</Btn>
          </>
        )}
      >
        {q && (
          <>
            {!can('verify') && <div className="banner">Your role can view but not decide verification items.</div>}
            <div className="doc">
              <div className="t"><span>{DOC_TYPES[q.type]?.title.toUpperCase()}</span><span style={{ color: '#C2410C' }}>EXTRACTED</span></div>
              {(DOC_TYPES[q.type]?.fields || []).map(([k, label]) => <div className="r" key={k}><b>{label}</b><span>{q.fields[k] || '—'}</span></div>)}
            </div>
            <div className="section-title">Why it’s here</div>
            {q.reasons.map((r) => <div key={r} className="banner" style={{ marginBottom: 6 }}>{r}</div>)}
            <div className="section-title">Automated checks</div>
            {q.checks.map((c, i) => (
              <div className="check" key={i}>
                <span className="i" style={{ color: LV[c.level][1] }}>{LV[c.level][0]}</span>
                <div><div>{c.label}</div><div className="sub2">{SOURCES[c.source] || c.source}{c.detail ? ` · ${c.detail}` : ''}</div></div>
              </div>
            ))}
            {q.state !== 'pending' && <><div className="section-title">Decision</div><KV rows={[['Result', <Badge>{q.state}</Badge>], ['By', q.decidedBy], ['Note', q.note || '—']]} /></>}
          </>
        )}
      </Drawer>
      <ReasonModal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'approved' ? 'Approve document' : modal === 'reupload' ? 'Ask for a new upload' : 'Reject document'}
        body={modal === 'approved' ? 'The user is notified and the badge goes live.' : 'The user is told what to fix. Nothing shows on their profile until it passes.'}
        confirmLabel={modal === 'approved' ? 'Approve' : modal === 'reupload' ? 'Send request' : 'Reject'}
        danger={modal === 'rejected'}
        presets={NOTES}
        onConfirm={(note) => { decideDoc(q.id, modal, note); setSel(null); }}
      />
    </>
  );
}

export function Users() {
  const { db, setUserStatus, addUserNote, can } = useAdmin();
  const [role, setRole] = useState('All');
  const [status, setStatus] = useState('All');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(false);
  const [note, setNote] = useState('');
  const { plane } = useLookups();

  const stats = useMemo(() => {
    const m = {};
    db.bookings.forEach((b) => {
      const add = (id, k, v) => { m[id] = m[id] || { bookings: 0, money: 0 }; m[id].bookings += k; m[id].money += v; };
      if (b.status !== 'Completed') return;
      add(b.studentId, 1, b.total);
      if (b.cfiId) add(b.cfiId, 1, b.split.cfi);
    });
    return m;
  }, [db.bookings]);
  const rows = db.users.filter((u) =>
    (role === 'All' || u.role === role) && (status === 'All' || u.status === status) &&
    (!q || `${u.name} ${u.email} ${u.airport}`.toLowerCase().includes(q.toLowerCase())));
  const u = sel && db.users.find((x) => x.id === sel);
  const uBookings = u ? db.bookings.filter((b) => b.studentId === u.id || b.cfiId === u.id).slice(0, 8) : [];

  return (
    <>
      <PageHeader title="Users" subtitle={`${db.users.length} accounts`} />
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Search name, email or airport" />
        <Segmented options={['All', 'Student', 'CFI', 'Owner', 'School']} value={role} onChange={setRole} />
        <Segmented options={['All', 'Active', 'Suspended']} value={status} onChange={setStatus} />
      </div>
      <Table
        rows={rows}
        onRow={(r) => setSel(r.id)}
        selectedId={sel}
        initialSort={{ key: 'joined', dir: 'desc' }}
        columns={[
          { key: 'name', label: 'Name', render: (r) => <><div className="strong">{r.name}</div><div className="sub2">{r.email}</div></> },
          { key: 'role', label: 'Role', render: (r) => <Badge tone={r.role === 'CFI' ? 'blue' : r.role === 'Owner' ? 'purple' : 'neutral'}>{r.role}{r.pro ? ' · Pro' : ''}</Badge> },
          { key: 'stage', label: 'Details', render: (r) => <span className="sub2">{r.stage}</span> },
          { key: 'airport', label: 'Airport' },
          { key: 'bookings', label: 'Flights', align: 'right', sort: (r) => stats[r.id]?.bookings || 0, render: (r) => stats[r.id]?.bookings || 0 },
          { key: 'money', label: 'Spent / earned', align: 'right', sort: (r) => stats[r.id]?.money || 0, render: (r) => money(stats[r.id]?.money || 0) },
          { key: 'verified', label: 'Verification', render: (r) => <Badge>{r.verified}</Badge> },
          { key: 'joined', label: 'Joined', render: (r) => fmtDate(r.joined) },
          { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
        ]}
      />
      <Drawer
        open={!!u}
        onClose={() => setSel(null)}
        title={u?.name}
        footer={u && can('suspend') && (u.status === 'Active'
          ? <Btn kind="danger" onClick={() => setModal(true)}>Suspend account</Btn>
          : <Btn kind="good" onClick={() => setModal(true)}>Reinstate account</Btn>)}
      >
        {u && (
          <>
            <KV rows={[
              ['Role', <Badge>{u.role}</Badge>], ['Email', u.email], ['Home airport', u.airport], ['Details', u.stage], ['Joined', fmtDate(u.joined)],
              ['Verification', <Badge>{u.verified}</Badge>], ['Status', <Badge>{u.status}</Badge>],
              ['Completed flights', stats[u.id]?.bookings || 0], [u.role === 'Student' ? 'Total spent' : 'Total earned', money(stats[u.id]?.money || 0, true)],
            ]} />
            <div className="section-title">Recent bookings</div>
            {uBookings.length === 0 && <div className="sub2">No bookings.</div>}
            {uBookings.map((b) => (
              <div key={b.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid #F1F4F8' }}>
                <div><div className="strong">{b.goal}</div><div className="sub2">{b.id} · {fmtDate(b.when)} · {plane(b.planeId)?.tail}</div></div>
                <div style={{ textAlign: 'right' }}><div>{money(b.total, true)}</div><Badge>{b.status}</Badge></div>
              </div>
            ))}
            <div className="section-title">Internal notes</div>
            <div className="row gap8">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (visible to the team only)" style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px' }} aria-label="Add internal note" />
              <Btn small disabled={!note.trim()} onClick={() => { addUserNote(u.id, note.trim()); setNote(''); }}>Add</Btn>
            </div>
            {u.notes.map((n, i) => <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #F1F4F8' }}><div>{n.text}</div><div className="sub2">{n.by} · {fmtDateTime(n.at)}</div></div>)}
          </>
        )}
      </Drawer>
      <ReasonModal
        open={modal}
        onClose={() => setModal(false)}
        title={u?.status === 'Active' ? `Suspend ${u?.name}?` : `Reinstate ${u?.name}?`}
        body={u?.status === 'Active' ? 'They can’t sign in, book, or be booked. Upcoming bookings are cancelled with full refunds. They’re emailed the reason.' : 'They can sign in and book again.'}
        confirmLabel={u?.status === 'Active' ? 'Suspend' : 'Reinstate'}
        danger={u?.status === 'Active'}
        presets={u?.status === 'Active' ? ['Repeated off-app payments', 'Fraudulent documents', 'Safety concern', 'Harassment'] : ['Appeal accepted', 'Documents verified']}
        onConfirm={(reason) => setUserStatus(u.id, u.status === 'Active' ? 'Suspended' : 'Active', reason)}
      />
    </>
  );
}
