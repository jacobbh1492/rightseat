import React, { useState } from 'react';
import { useAdmin, ROLES } from '../store.jsx';
import { PageHeader, Stat, Badge, Btn, Table, ReasonModal, Segmented, Search, money } from '../ui.jsx';
import { fmtDate, fmtDateTime } from '../data/demo.js';

export function Reviews() {
  const { db, moderateReview, can } = useAdmin();
  const [tab, setTab] = useState('Reported');
  const [act, setAct] = useState(null);
  const rows = db.reviews.filter((r) => tab === 'All' || r.status === tab);
  return (
    <>
      <PageHeader title="Reviews" subtitle="Only people with a completed booking can review. Hide a review only if it breaks the rules, not because it’s negative.">
        <Segmented options={[['Reported', `Reported (${db.reviews.filter((r) => r.status === 'Reported').length})`], 'Published', 'Hidden', 'All']} value={tab} onChange={setTab} />
      </PageHeader>
      <Table
        rows={rows}
        empty="Nothing reported."
        columns={[
          { key: 'text', label: 'Review', render: (r) => <><div style={{ maxWidth: 520 }}>“{r.text}”</div>{r.reportReason && <div className="sub2" style={{ color: 'var(--warn)' }}>Reported: {r.reportReason}</div>}</> },
          { key: 'rating', label: 'Rating', render: (r) => `${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}` },
          { key: 'target', label: 'About', render: (r) => <><div>{r.target}</div><div className="sub2">{r.kind}</div></> },
          { key: 'name', label: 'By', render: (r) => <><div>{r.name}</div><div className="sub2">{r.verified ? `Verified ${r.role.toLowerCase()}` : 'Unverified'} · {r.date}</div></> },
          { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          { key: 'act', label: '', render: (r) => can('moderate') && (
            <div className="row gap8">
              {r.status !== 'Published' && <Btn small kind="ghost" onClick={() => setAct({ r, status: 'Published' })}>Keep</Btn>}
              {r.status !== 'Hidden' && <Btn small kind="danger" onClick={() => setAct({ r, status: 'Hidden' })}>Hide</Btn>}
            </div>
          ) },
        ]}
      />
      <ReasonModal
        open={!!act}
        onClose={() => setAct(null)}
        title={act?.status === 'Hidden' ? 'Hide this review?' : 'Keep this review published?'}
        body={act?.status === 'Hidden' ? 'The reviewer is told why and can edit and resubmit.' : 'The report is closed and the reporter is notified.'}
        confirmLabel={act?.status === 'Hidden' ? 'Hide review' : 'Keep published'}
        danger={act?.status === 'Hidden'}
        presets={act?.status === 'Hidden' ? ['Contains contact info', 'Harassment or hate', 'Not about this booking', 'Spam'] : ['Honest negative experience', 'Factual, no policy violation']}
        onConfirm={(note) => moderateReview(act.r.id, act.status, note)}
      />
    </>
  );
}

export function Trust() {
  const { db, actOnFlag, can } = useAdmin();
  const name = (id) => db.users.find((u) => u.id === id)?.name || db.cfis.find((c) => c.id === id)?.name;
  const pairs = db.pairs.map((p, i) => ({ ...p, id: 'pair' + i, cfi: name(p.cfiId) }));
  const watch = pairs.filter((p) => (p.lessons <= 2 && p.lastDays > 21) || p.flags > 0);
  const rate = Math.round((pairs.filter((p) => p.lessons >= 2).length / pairs.length) * 100);
  return (
    <>
      <PageHeader title="Trust & safety" subtitle="Off-app contact, payment leakage and student–CFI pairs that went quiet." />
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Rebooking rate" value={`${rate}%`} sub="Pairs with 2+ lessons in the app" tone={rate >= 80 ? 'good' : 'warn'} />
        <Stat label="Open message flags" value={db.flags.filter((f) => f.status === 'Open').length} sub="Contact info or off-app payment" />
        <Stat label="Leakage watchlist" value={watch.length} sub="Quiet after 1–2 lessons, or flagged" />
        <Stat label="Contact info hidden · 30 days" value="23" sub="Automatically, before first booking" />
      </div>
      <div className="section-title">Flagged messages</div>
      <Table
        rows={db.flags}
        columns={[
          { key: 'text', label: 'Message', render: (r) => <><div>“{r.text}”</div>{r.masked && <div className="sub2">Contact info was hidden automatically</div>}</> },
          { key: 'from', label: 'From → to', render: (r) => <><div className="strong">{r.from}</div><div className="sub2">to {r.to}</div></> },
          { key: 'reason', label: 'Flag', render: (r) => <Badge tone="warn">{r.reason}</Badge> },
          { key: 'at', label: 'When', render: (r) => fmtDateTime(r.at) },
          { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          { key: 'act', label: '', render: (r) => r.status === 'Open' && can('moderate') && (
            <div className="row gap8">
              <Btn small kind="ghost" onClick={() => actOnFlag(r.id, 'Dismissed')}>Dismiss</Btn>
              <Btn small onClick={() => actOnFlag(r.id, 'Warned')}>Send reminder</Btn>
            </div>
          ) },
        ]}
      />
      <div className="section-title" style={{ marginTop: 24 }}>Leakage watchlist</div>
      <Table
        rows={watch}
        columns={[
          { key: 'student', label: 'Student', render: (r) => <span className="strong">{r.student}</span> },
          { key: 'cfi', label: 'Instructor' },
          { key: 'lessons', label: 'Lessons in app', align: 'right' },
          { key: 'lastDays', label: 'Last booking', render: (r) => `${r.lastDays} days ago` },
          { key: 'flags', label: 'Flags', align: 'right' },
          { key: 'suggest', label: 'Suggested action', render: (r) => <span className="sub2">{r.flags ? 'Review messages; remind both about protections' : 'Send “book your next lesson” nudge with fee waiver'}</span> },
        ]}
      />
    </>
  );
}

export function Automation() {
  const { db, runJob, can } = useAdmin();
  const exp = [
    ...db.listings.map((l) => ({ id: 'ins' + l.id, what: 'Aircraft insurance', who: `${l.tail} · ${l.ownerName}`, date: l.insuranceExpires })),
    ...db.listings.map((l) => ({ id: 'ann' + l.id, what: 'Annual inspection', who: `${l.tail} · ${l.ownerName}`, date: l.annualDue })),
  ].map((e) => ({ ...e, days: Math.ceil((new Date(e.date) - Date.now()) / 864e5) })).filter((e) => e.days < 120).sort((a, b) => a.days - b.days);
  return (
    <>
      <PageHeader title="Automation" subtitle="Scheduled checks that keep verification current without anyone doing it by hand." />
      <Table
        rows={db.jobs.map((j) => ({ ...j, id: j.key }))}
        columns={[
          { key: 'name', label: 'Job', render: (r) => <span className="strong">{r.name}</span> },
          { key: 'schedule', label: 'Schedule' },
          { key: 'last', label: 'Last run', render: (r) => fmtDateTime(r.last) },
          { key: 'result', label: 'Result', render: (r) => <span className="sub2">{r.result}</span> },
          { key: 'status', label: 'Health', render: (r) => <Badge>{r.status}</Badge> },
          { key: 'run', label: '', render: (r) => r.key !== 'stripe' && can('runJob') && <Btn small kind="ghost" icon="refresh" onClick={() => runJob(r.key)}>Run now</Btn> },
        ]}
      />
      <div className="section-title" style={{ marginTop: 24 }}>Expiring in the next 120 days</div>
      <Table
        rows={exp}
        initialSort={{ key: 'days', dir: 'asc' }}
        columns={[
          { key: 'who', label: 'Aircraft', render: (r) => <span className="strong">{r.who}</span> },
          { key: 'what', label: 'Document' },
          { key: 'date', label: 'Expires', render: (r) => fmtDate(r.date) },
          { key: 'days', label: 'Days left', align: 'right', render: (r) => <Badge tone={r.days <= 0 ? 'bad' : r.days <= 30 ? 'warn' : 'neutral'}>{r.days <= 0 ? 'Expired · paused' : `${r.days} days`}</Badge> },
          { key: 'rem', label: 'Reminders', render: (r) => <span className="sub2">{[30, 14, 3].map((d) => (r.days <= d ? `${d}d ✓` : `${d}d`)).join(' · ')}</span> },
        ]}
      />
    </>
  );
}

function SettingRow({ label, hint, value, format, parse, onSave, disabled }) {
  const [v, setV] = useState(format(value));
  const dirty = v !== format(value);
  return (
    <div className="row between" style={{ padding: '12px 0', borderTop: '1px solid #F1F4F8', gap: 16 }}>
      <div><div className="strong">{label}</div>{hint && <div className="sub2">{hint}</div>}</div>
      <div className="row gap8">
        <input value={v} onChange={(e) => setV(e.target.value)} disabled={disabled} aria-label={label} style={{ width: 110, border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', textAlign: 'right' }} />
        <Btn small disabled={!dirty || disabled || parse(v) == null} onClick={() => onSave(parse(v), format(value), v)}>Save</Btn>
      </div>
    </div>
  );
}

export function Config() {
  const { db, cfg, setConfig, updateSetting, inviteMember, setMemberRole, can, refreshLive, live, liveError, notify } = useAdmin();
  const [tab, setTab] = useState('fees');
  const [inv, setInv] = useState({ name: '', email: '', role: 'Reviewer' });
  const [q, setQ] = useState('');
  const editable = can('settings');
  const pctF = (x) => `${Math.round(x * 1000) / 10}%`;
  const pctP = (s) => { const n = parseFloat(String(s).replace('%', '')); return isNaN(n) || n < 0 || n > 50 ? null : Math.round(n * 10) / 1000; };
  const usdF = (x) => `$${x}`;
  const usdP = (s) => { const n = parseFloat(String(s).replace(/[$,]/g, '')); return isNaN(n) || n < 0 ? null : n; };
  const F = db.settings.fees;
  const M = db.settings.minimums;
  const save = (group, key, label) => (val, from, raw) => { updateSetting(group, key, val, label, from); notify(`${label} set to ${raw}.`); };
  const audit = db.audit.filter((e) => !q || `${e.actor} ${e.action} ${e.target} ${e.note}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Settings & team">
        <Segmented options={[['fees', 'Fees & pricing'], ['rules', 'Verification rules'], ['team', 'Team & roles'], ['data', 'Data source'], ['audit', 'Audit log']]} value={tab} onChange={setTab} />
      </PageHeader>
      {!editable && ['fees', 'rules'].includes(tab) && <div className="banner">Only the Owner role can change pricing and rules. You can view them.</div>}

      {tab === 'fees' && (
        <div className="grid g2">
          <div className="card">
            <h3>Marketplace fees</h3>
            <SettingRow label="Student booking fee" hint="Flat fee on every lesson and rental ($5 with School Pro schools; waived during a Short Final promo)" value={F.studentNew} format={usdF} parse={usdP} onSave={save('fees', 'studentNew', 'Student booking fee')} disabled={!editable} />
            <SettingRow label="CFI host fee" hint="New students only; 0% on CFI Pro" value={F.cfiNew} format={pctF} parse={pctP} onSave={save('fees', 'cfiNew', 'CFI host fee')} disabled={!editable} />
            <SettingRow label="Aircraft owner fee" hint="Share of rental revenue" value={F.owner} format={pctF} parse={pctP} onSave={save('fees', 'owner', 'Owner fee')} disabled={!editable} />
            <SettingRow label="Instant payout fee" hint="Free on CFI Pro" value={F.instantPayout} format={pctF} parse={pctP} onSave={save('fees', 'instantPayout', 'Instant payout fee')} disabled={!editable} />
          </div>
          <div className="card">
            <h3>Protection & policies</h3>
            <SettingRow label="Rental protection" hint="Per flight hour, added to rentals" value={F.protectionPerHr} format={usdF} parse={usdP} onSave={save('fees', 'protectionPerHr', 'Rental protection per hour')} disabled={!editable} />
            <SettingRow label="Solo rental deposit" hint="Card hold, released at close-out" value={F.deposit} format={usdF} parse={usdP} onSave={save('fees', 'deposit', 'Solo rental deposit')} disabled={!editable} />
            <SettingRow label="Late-cancel fee" hint="Share of instruction for personal cancellations under 24 hrs" value={F.lateCancel} format={pctF} parse={(s) => { const n = parseFloat(s); return isNaN(n) || n < 0 || n > 100 ? null : n / 100; }} onSave={save('fees', 'lateCancel', 'Late-cancel fee')} disabled={!editable} />
            <SettingRow label="CFI Pro price" hint="Monthly" value={db.settings.plans.cfiPro} format={usdF} parse={usdP} onSave={save('plans', 'cfiPro', 'CFI Pro price')} disabled={!editable} />
          </div>
        </div>
      )}

      {tab === 'rules' && (
        <div className="card" style={{ maxWidth: 720 }}>
          <h3>Automatic verification</h3>
          <SettingRow label="Auto-approve confidence" hint="Documents read below this go to a person" value={M.autoApproveConfidence} format={pctF} parse={(s) => { const n = parseFloat(s); return isNaN(n) || n < 50 || n > 100 ? null : n / 100; }} onSave={save('minimums', 'autoApproveConfidence', 'Auto-approve confidence')} disabled={!editable} />
          <SettingRow label="Renter liability minimum" value={M.renterLiability} format={(x) => `$${x.toLocaleString()}`} parse={usdP} onSave={save('minimums', 'renterLiability', 'Renter liability minimum')} disabled={!editable} />
          <SettingRow label="Renter aircraft-damage minimum" value={M.renterDamage} format={(x) => `$${x.toLocaleString()}`} parse={usdP} onSave={save('minimums', 'renterDamage', 'Renter damage minimum')} disabled={!editable} />
          <SettingRow label="Instructor liability minimum" value={M.instructorLiability} format={(x) => `$${x.toLocaleString()}`} parse={usdP} onSave={save('minimums', 'instructorLiability', 'Instructor liability minimum')} disabled={!editable} />
          <SettingRow label="Owner liability minimum" value={M.ownerLiability} format={(x) => `$${x.toLocaleString()}`} parse={usdP} onSave={save('minimums', 'ownerLiability', 'Owner liability minimum')} disabled={!editable} />
        </div>
      )}

      {tab === 'team' && (
        <div className="grid g2">
          <div>
            <Table
              rows={db.team}
              columns={[
                { key: 'name', label: 'Member', render: (r) => <><div className="strong">{r.name}</div><div className="sub2">{r.email}</div></> },
                { key: 'role', label: 'Role', render: (r) => (can('team') && r.role !== 'Owner'
                  ? <select value={r.role} onChange={(e) => setMemberRole(r.id, e.target.value)} aria-label={`Role for ${r.name}`} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '5px 8px' }}>{ROLES.filter((x) => x !== 'Owner').map((x) => <option key={x}>{x}</option>)}</select>
                  : <Badge tone="blue">{r.role}</Badge>) },
                { key: 'lastActive', label: 'Last active', render: (r) => (r.invited ? <Badge>Invited</Badge> : fmtDateTime(r.lastActive)) },
              ]}
            />
            {can('team') && (
              <div className="card" style={{ marginTop: 16 }}>
                <h3>Invite a team member</h3>
                <div className="row gap8 wrap" style={{ marginTop: 8 }}>
                  <input placeholder="Name" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} aria-label="Name" style={{ flex: 1, minWidth: 140, border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px' }} />
                  <input placeholder="Work email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} aria-label="Email" style={{ flex: 1.4, minWidth: 180, border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px' }} />
                  <select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })} aria-label="Role" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px' }}>{ROLES.filter((x) => x !== 'Owner').map((x) => <option key={x}>{x}</option>)}</select>
                  <Btn disabled={!inv.name.trim() || !/@/.test(inv.email)} onClick={() => { inviteMember(inv.name.trim(), inv.email.trim(), inv.role); setInv({ name: '', email: '', role: 'Reviewer' }); }}>Send invite</Btn>
                </div>
              </div>
            )}
          </div>
          <div className="card">
            <h3>What each role can do</h3>
            {[
              ['Owner', 'Everything, including fees, rules and the team.'],
              ['Admin', 'All operations: refunds, suspensions, listings, verification. Can’t change fees or the team.'],
              ['Reviewer', 'Verification queue, reviews, trust & safety, automation. No money actions.'],
              ['Support', 'Users, bookings, disputes, payments. Refunds up to $250; larger ones need an Admin.'],
            ].map(([r, d]) => <div key={r} style={{ padding: '10px 0', borderTop: '1px solid #F1F4F8' }}><Badge tone="blue">{r}</Badge><div className="sub2" style={{ marginTop: 4 }}>{d}</div></div>)}
            <div className="sub2" style={{ marginTop: 12 }}>Try it: switch “View as” in the top bar.</div>
          </div>
        </div>
      )}

      {tab === 'data' && (
        <div className="card" style={{ maxWidth: 720 }}>
          <h3>Data source</h3>
          <p className="muted">Demo uses built-in sample data. Live connects to your Positive Rate server (the <code>server/</code> folder). Verification queue, users, listings, settings, jobs and the audit log are live; bookings and payments switch over when the booking backend is built.</p>
          <div className="row gap8" style={{ margin: '12px 0' }}>
            <Segmented options={[['demo', 'Demo data'], ['live', 'Live server']]} value={cfg.mode} onChange={(m) => setConfig({ mode: m })} />
          </div>
          {cfg.mode === 'live' && (
            <>
              <label className="field"><span>Server URL</span><input value={cfg.apiUrl} onChange={(e) => setConfig({ apiUrl: e.target.value })} placeholder="https://api.yourdomain.com" /></label>
              <label className="field"><span>Admin key (ADMIN_KEY on the server)</span><input type="password" value={cfg.adminKey} onChange={(e) => setConfig({ adminKey: e.target.value })} /></label>
              <div className="row gap8">
                <Btn icon="refresh" onClick={refreshLive}>Test connection</Btn>
                {live && !liveError && <Badge>Connected</Badge>}
                {liveError && <span className="small" style={{ color: 'var(--bad)' }}>{liveError}</span>}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <>
          <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Search actor, action, target" /></div>
          <Table
            rows={audit.map((e, i) => ({ ...e, id: i }))}
            columns={[
              { key: 'at', label: 'When', render: (r) => fmtDateTime(r.at) },
              { key: 'actor', label: 'Who', render: (r) => <span className="strong">{r.actor}</span> },
              { key: 'action', label: 'Action' },
              { key: 'target', label: 'Target' },
              { key: 'note', label: 'Reason / detail', render: (r) => <span className="sub2">{r.note}</span> },
            ]}
          />
        </>
      )}
    </>
  );
}
