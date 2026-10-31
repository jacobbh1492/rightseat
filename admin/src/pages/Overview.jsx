import React from 'react';
import { useAdmin } from '../store';
import { Stat, money, Icon } from '../ui';
import { LineChart, BarList } from '../charts';

const DAY = 864e5;

export default function Overview() {
  const { d } = useAdmin();
  const now = Date.now();
  const inLast = (b, days) => now - new Date(b.when).getTime() < days * DAY && new Date(b.when).getTime() <= now;
  const billable = d.bookings.filter((b) => b.status !== 'cancelled');
  const last30 = billable.filter((b) => inLast(b, 30));
  const prev30 = billable.filter((b) => !inLast(b, 30) && inLast(b, 60));
  const gmv = last30.reduce((a, b) => a + b.total, 0);
  const gmvPrev = prev30.reduce((a, b) => a + b.total, 0);
  const rev = last30.reduce((a, b) => a + b.revenue, 0);
  const students = new Set(last30.map((b) => b.studentId)).size;
  const cfis = new Set(last30.map((b) => b.cfiId).filter(Boolean)).size;
  const rebook = Math.round((d.pairs.filter((p) => p.lessons >= 2).length / d.pairs.length) * 100);
  const change = gmvPrev ? Math.round(((gmv - gmvPrev) / gmvPrev) * 100) : 0;

  // weekly booked volume, last 12 weeks
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = now - (11 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    const v = billable.filter((b) => { const t = new Date(b.when).getTime(); return t > start && t <= end; });
    return { label: new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: Math.round(v.reduce((a, b) => a + b.total, 0)), note: `${v.length} flights` };
  });
  const sources = [
    { label: 'Owner fees (8%)', value: Math.round(last30.reduce((a, b) => a + b.fees.ownerHost, 0)), note: 'On every rental' },
    { label: 'Student booking fees', value: Math.round(last30.reduce((a, b) => a + b.fees.booking, 0)), note: 'First lesson with a new CFI only' },
    { label: 'CFI fees (new students)', value: Math.round(last30.reduce((a, b) => a + b.fees.cfiHost, 0)), note: '0% for CFI Pro' },
    { label: 'Card processing (cost)', value: Math.round(last30.reduce((a, b) => a + b.fees.processing, 0)), note: 'Paid to Stripe; wallet bookings avoid it' },
  ];

  const pendingDocs = d.queue.filter((q) => !q.state).length;
  const openDisputes = d.disputes.filter((x) => x.status === 'open').length;
  const failedPayouts = d.payouts.filter((p) => p.status === 'failed').length;
  const reported = d.reviews.filter((r) => r.reported).length;
  const flagged = d.flagged.filter((m) => !m.action).length;
  const paused = d.aircraft.filter((a) => a.status === 'paused').length;
  const alerts = [
    [pendingDocs, 'documents need review', 'verification', 'shield', '#b45309', '#fef3c7'],
    [openDisputes, 'open disputes', 'disputes', 'alert', '#dc2626', '#fee2e2'],
    [failedPayouts, 'failed payout', 'payouts', 'dollar', '#dc2626', '#fee2e2'],
    [reported, 'reported reviews', 'reviews', 'star', '#7c3aed', '#f3e8ff'],
    [flagged, 'flagged messages', 'trust', 'chat', '#b45309', '#fef3c7'],
    [paused, 'listing auto-paused', 'listings', 'plane', '#475569', '#eef1f5'],
  ].filter((a) => a[0] > 0);

  return (
    <>
      <div className="grid g4">
        <Stat label="Booked · last 30 days" value={money(gmv)} sub={`${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% vs prior 30 days`} />
        <Stat label="RightSeat revenue · 30 days" value={money(rev)} sub={`${((rev / gmv) * 100).toFixed(1)}% take rate`} />
        <Stat label="Student–CFI rebooking" value={`${rebook}%`} sub="Pairs with 2+ lessons in the app" />
        <Stat label="Active · 30 days" value={`${students} / ${cfis}`} sub="Students / instructors who flew" />
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <h2>Booked volume per week</h2>
          <LineChart data={weeks} fmt={(v) => money(v)} title="Booked volume per week, last 12 weeks" />
        </div>
        <div className="card">
          <h2>Revenue by source · 30 days</h2>
          <BarList data={sources} fmt={(v) => money(v)} title="RightSeat revenue by source, last 30 days" label="Source" />
        </div>
      </div>

      <div className="section-title">Needs attention</div>
      <div className="card">
        {alerts.length === 0 && <div className="empty">All clear.</div>}
        {alerts.map(([n, label, page, icon, fg, bg]) => (
          <a key={label} href={`#${page}`} className="alert-row">
            <span className="alert-icon" style={{ background: bg }}><Icon name={icon} color={fg} /></span>
            <span style={{ flex: 1 }}><strong>{n}</strong> {label}</span>
            <Icon name="chevron" color="#94a3b8" />
          </a>
        ))}
      </div>
    </>
  );
}
