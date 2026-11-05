import React, { useState } from 'react';
import { useAdmin, SUPPORT_REFUND_LIMIT } from '../store.jsx';
import { PageHeader, Stat, Badge, Btn, Table, Drawer, ReasonModal, Search, Segmented, KV, money } from '../ui.jsx';
import { fmtDate, fmtDateTime } from '../data/demo.js';
import { useLookups } from './core.jsx';

const daysUntil = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);

export function Listings() {
  const { db, setListing, can } = useAdmin();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(false);
  const rows = db.listings.filter((l) => (status === 'All' || l.status === status) && (!q || `${l.tail} ${l.make} ${l.model} ${l.ownerName} ${l.homeAirport}`.toLowerCase().includes(q.toLowerCase())));
  const l = sel && db.listings.find((x) => x.id === sel);
  const left = (x) => Math.round((x.next100At - x.hobbsTotal) * 10) / 10;

  return (
    <>
      <PageHeader title="Aircraft listings" subtitle="Bookings pause automatically when the 100-hr is due, insurance lapses or a grounding squawk is open." />
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Search tail, model, owner, airport" />
        <Segmented options={['All', 'Active', 'Paused']} value={status} onChange={setStatus} />
      </div>
      <Table
        rows={rows}
        onRow={(r) => setSel(r.id)}
        selectedId={sel}
        columns={[
          { key: 'tail', label: 'Aircraft', render: (r) => <><div className="strong">{r.tail}</div><div className="sub2">{r.year} {r.make} {r.model}</div></> },
          { key: 'ownerName', label: 'Listed by', render: (r) => <><div>{r.ownerName}</div><div className="sub2">{r.ownerType}</div></> },
          { key: 'homeAirport', label: 'Airport' },
          { key: 'wetRate', label: 'Wet rate', align: 'right', render: (r) => money(r.wetRate) },
          { key: 'hundred', label: '100-hr', align: 'right', sort: left, render: (r) => <Badge tone={left(r) < 10 ? 'warn' : 'neutral'}>{left(r)} hrs left</Badge> },
          { key: 'insuranceExpires', label: 'Insurance', render: (r) => <Badge tone={daysUntil(r.insuranceExpires) <= 0 ? 'bad' : daysUntil(r.insuranceExpires) < 30 ? 'warn' : 'neutral'}>{daysUntil(r.insuranceExpires) <= 0 ? 'Expired' : `${daysUntil(r.insuranceExpires)} days`}</Badge> },
          { key: 'squawks', label: 'Squawks', align: 'right', sort: (r) => r.squawks.filter((s) => s.status === 'open').length, render: (r) => r.squawks.filter((s) => s.status === 'open').length },
          { key: 'rating', label: 'Rating', align: 'right', render: (r) => `★ ${r.rating.toFixed(1)}` },
          { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
        ]}
      />
      <Drawer
        open={!!l}
        onClose={() => setSel(null)}
        title={l ? `${l.tail} · ${l.make} ${l.model}` : ''}
        footer={l && can('pauseListing') && (l.status === 'Active' ? <Btn kind="danger" onClick={() => setModal(true)}>Pause bookings</Btn> : <Btn kind="good" onClick={() => setModal(true)}>Resume bookings</Btn>)}
      >
        {l && (
          <>
            {l.status === 'Paused' && <div className="banner">Paused: {l.pausedReason}</div>}
            <KV rows={[
              ['Listed by', `${l.ownerName} (${l.ownerType})`], ['Home airport', l.homeAirport], ['Rates', `${money(l.wetRate)} wet · ${money(l.dryRate)} dry · ${money(l.blockRate)} block`],
              ['Hobbs', l.hobbsTotal], ['100-hr due at', `${l.next100At} (${left(l)} hrs left)`], ['Insurance expires', fmtDate(l.insuranceExpires)], ['Annual due', fmtDate(l.annualDue)],
              ['Insurance minimum', `${l.insuranceMinHours} hrs TT`], ['Solo rental', l.soloRental ? 'Allowed after checkout' : 'CFI required'], ['Rating', `★ ${l.rating.toFixed(1)} (${l.reviewCount})`],
            ]} />
            <div className="section-title">Squawks</div>
            {l.squawks.length === 0 && <div className="sub2">None reported.</div>}
            {l.squawks.map((s) => <div key={s.id} className="row between" style={{ padding: '6px 0' }}><span>{s.text}{s.grounding ? ' · grounding' : ''}</span><Badge>{s.status === 'open' ? 'Open' : 'Resolved'}</Badge></div>)}
            <div className="section-title">Bookings on this aircraft</div>
            <div className="sub2">{db.bookings.filter((b) => b.planeId === l.id && b.status === 'Completed').length} completed · {db.bookings.filter((b) => b.planeId === l.id && ['Pending', 'Confirmed'].includes(b.status)).length} upcoming</div>
          </>
        )}
      </Drawer>
      <ReasonModal
        open={modal}
        onClose={() => setModal(false)}
        title={l?.status === 'Active' ? `Pause ${l?.tail}?` : `Resume ${l?.tail}?`}
        body={l?.status === 'Active' ? 'New bookings are blocked and the owner is notified. Upcoming bookings stay and need your review.' : 'The aircraft becomes bookable again.'}
        confirmLabel={l?.status === 'Active' ? 'Pause' : 'Resume'}
        danger={l?.status === 'Active'}
        presets={l?.status === 'Active' ? ['Insurance lapsed', 'Grounding squawk', 'Owner request', 'Safety investigation'] : ['New policy verified', 'Squawk resolved', 'Owner request']}
        onConfirm={(reason) => setListing(l.id, l.status === 'Active', reason)}
      />
    </>
  );
}

export function Bookings() {
  const { db, refund, cancelBooking, can, me } = useAdmin();
  const { user, plane } = useLookups();
  const [tab, setTab] = useState('All');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null);
  const match = (b) => tab === 'All' || (tab === 'Upcoming' ? ['Pending', 'Confirmed'].includes(b.status) : tab === 'Disputed' ? !!b.dispute : b.status === tab);
  const rows = db.bookings.filter((b) => match(b) && (!q || `${b.id} ${user(b.studentId)?.name} ${user(b.cfiId)?.name || ''} ${plane(b.planeId)?.tail}`.toLowerCase().includes(q.toLowerCase())));
  const b = sel && db.bookings.find((x) => x.id === sel);
  const maxRefund = b ? Math.max(0, Math.round((b.total - b.refunded) * 100) / 100) : 0;
  const limit = me.role === 'Support' ? Math.min(maxRefund, SUPPORT_REFUND_LIMIT) : maxRefund;

  return (
    <>
      <PageHeader title="Bookings" subtitle={`${db.bookings.length} bookings · last 8 weeks and next 2`} />
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Search booking ID, student, CFI, tail" />
        <Segmented options={['All', 'Upcoming', 'Completed', 'Cancelled', 'Disputed']} value={tab} onChange={setTab} />
      </div>
      <Table
        rows={rows}
        onRow={(r) => setSel(r.id)}
        selectedId={sel}
        columns={[
          { key: 'id', label: 'Booking', render: (r) => <span className="strong">{r.id}</span> },
          { key: 'when', label: 'When', render: (r) => fmtDateTime(r.when) },
          { key: 'student', label: 'Student', sort: (r) => user(r.studentId)?.name, render: (r) => user(r.studentId)?.name },
          { key: 'cfi', label: 'Instructor', sort: (r) => user(r.cfiId)?.name || '', render: (r) => user(r.cfiId)?.name || <span className="sub2">Solo</span> },
          { key: 'plane', label: 'Aircraft', render: (r) => plane(r.planeId)?.tail },
          { key: 'goal', label: 'Lesson', render: (r) => <span className="sub2">{r.goal}</span> },
          { key: 'total', label: 'Total', align: 'right', render: (r) => <>{money(r.total, true)}{r.refunded ? <div className="sub2">−{money(r.refunded, true)} refunded</div> : null}</> },
          { key: 'status', label: 'Status', render: (r) => <><Badge>{r.status}</Badge>{r.dispute ? <> <Badge tone="bad">Dispute</Badge></> : null}</> },
        ]}
      />
      <Drawer
        open={!!b}
        onClose={() => setSel(null)}
        title={b ? `Booking ${b.id}` : ''}
        footer={b && can('refund') && (
          <>
            {['Pending', 'Confirmed'].includes(b.status) && <Btn kind="danger" onClick={() => setModal('cancel')}>Cancel booking</Btn>}
            {b.status === 'Completed' && maxRefund > 0 && <Btn kind="ghost" onClick={() => setModal('refund')}>Issue refund</Btn>}
          </>
        )}
      >
        {b && (
          <>
            <KV rows={[
              ['Status', <><Badge>{b.status}</Badge>{b.cancelReason ? <span className="sub2"> · {b.cancelReason}</span> : null}</>],
              ['When', fmtDateTime(b.when)], ['Lesson', b.goal], ['Student', user(b.studentId)?.name], ['Instructor', user(b.cfiId)?.name || 'Solo rental'],
              ['Aircraft', `${plane(b.planeId)?.tail} · ${plane(b.planeId)?.make} ${plane(b.planeId)?.model}`], ['Time', `${b.flightHours} hr flight${b.groundHours ? ` + ${b.groundHours} hr ground` : ''}`],
              ['Paid with', b.method === 'wallet' ? 'Wallet (prepaid)' : 'Card'], ['Repeat pair', b.repeat ? 'Yes · booking fee waived' : 'No · first booking'],
            ]} />
            <div className="section-title">Money</div>
            <KV rows={[
              ['Charged to student', money(b.total, true)], ['Booking fee', money(b.bookingFee, true)], ['Rental protection', money(b.protection, true)],
              ['Instructor payout', money(b.split.cfi, true)], b.split.school ? ['School share', `${money(b.split.school, true)} · ${b.split.schoolModel === 'employee' ? 'employee' : 'revenue share'}`] : null, ['Owner payout', money(b.split.owner, true)], ['Card processing', money(b.split.processing, true)],
              ['Positive Rate net', money(b.split.platform, true)], b.cancelFee ? ['Late-cancel fee', money(b.cancelFee, true)] : null, b.refunded ? ['Refunded', money(b.refunded, true)] : null,
            ]} />
            <div className="section-title">Timeline</div>
            <div className="timeline">{b.timeline.map((t, i) => <div key={i}><div>{t.text}</div><div className="sub2">{fmtDateTime(t.at)}</div></div>)}</div>
          </>
        )}
      </Drawer>
      <ReasonModal
        open={modal === 'refund'}
        onClose={() => setModal(null)}
        title={`Refund booking ${b?.id}`}
        body="Refunds go back to the original payment method. If payouts were already sent, the amount is recovered from the next payout."
        confirmLabel="Issue refund"
        amount={{ max: limit, default: limit, limitNote: me.role === 'Support' ? `Support limit ${money(SUPPORT_REFUND_LIMIT)}` : '' }}
        presets={['Weather goodwill', 'Hobbs correction', 'Instructor late', 'Aircraft issue']}
        onConfirm={(reason, amt) => refund(b.id, amt, reason)}
      />
      <ReasonModal
        open={modal === 'cancel'}
        onClose={() => setModal(null)}
        title={`Cancel booking ${b?.id}?`}
        body="Card and wallet holds are released. The student and instructor are notified."
        confirmLabel="Cancel booking"
        danger
        presets={['Weather', 'Aircraft grounded', 'User request', 'Safety concern']}
        onConfirm={(reason) => cancelBooking(b.id, reason)}
      />
    </>
  );
}

export function Payments() {
  const { db } = useAdmin();
  const { user, plane } = useLookups();
  const [tab, setTab] = useState('charges');
  const d30 = db.bookings.filter((b) => b.status === 'Completed' && Date.now() - new Date(b.when) < 30 * 864e5);
  const gmv = d30.reduce((a, b) => a + b.total, 0);
  const rev = d30.reduce((a, b) => a + b.split.platform, 0);
  const paid = db.payouts.filter((p) => p.status !== 'Scheduled').reduce((a, p) => a + p.amount, 0);
  const schoolShare = d30.reduce((a, b) => a + (b.split.school || 0), 0);
  const scheduled = db.payouts.filter((p) => p.status === 'Scheduled').reduce((a, p) => a + p.amount, 0);
  const refunds = db.bookings.filter((b) => b.refunded > 0);

  return (
    <>
      <PageHeader title="Payments & payouts" subtitle="Charges, payouts to instructors and owners, and refunds. Processed through Stripe Connect.">
        <Segmented options={[['charges', 'Charges'], ['payouts', 'Payouts'], ['refunds', `Refunds (${refunds.length})`]]} value={tab} onChange={setTab} />
      </PageHeader>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Charged · 30 days" value={money(gmv)} sub={`${d30.length} flights`} />
        <Stat label="Positive Rate net · 30 days" value={money(rev)} sub="After card processing" tone="good" />
        <Stat label="Paid out · 6 weeks" value={money(paid)} sub={`Instructors, owners, schools · ${money(schoolShare)} school share (30d)`} />
        <Stat label="Scheduled payouts" value={money(scheduled)} sub="Next payout run Friday" />
      </div>
      {tab === 'charges' && (
        <Table
          rows={d30}
          initialSort={{ key: 'when', dir: 'desc' }}
          columns={[
            { key: 'id', label: 'Booking', render: (r) => <span className="strong">{r.id}</span> },
            { key: 'when', label: 'Date', render: (r) => fmtDate(r.when) },
            { key: 'student', label: 'Charged to', render: (r) => user(r.studentId)?.name },
            { key: 'method', label: 'Method', render: (r) => (r.method === 'wallet' ? 'Wallet' : 'Card') },
            { key: 'total', label: 'Amount', align: 'right', render: (r) => money(r.total, true) },
            { key: 'cfi', label: 'To instructor', align: 'right', sort: (r) => r.split.cfi, render: (r) => money(r.split.cfi, true) },
            { key: 'school', label: 'To school', align: 'right', sort: (r) => r.split.school || 0, render: (r) => (r.split.school ? money(r.split.school, true) : <span className="sub2">—</span>) },
            { key: 'owner', label: 'To owner', align: 'right', sort: (r) => r.split.owner, render: (r) => <span title={plane(r.planeId)?.ownerName}>{money(r.split.owner, true)}</span> },
            { key: 'platform', label: 'Positive Rate', align: 'right', sort: (r) => r.split.platform, render: (r) => <span className="strong">{money(r.split.platform, true)}</span> },
          ]}
        />
      )}
      {tab === 'payouts' && (
        <Table
          rows={db.payouts}
          initialSort={{ key: 'at', dir: 'desc' }}
          columns={[
            { key: 'to', label: 'Paid to', render: (r) => <span className="strong">{r.to}</span> },
            { key: 'kind', label: 'Type' },
            { key: 'week', label: 'Period' },
            { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount, true) },
            { key: 'at', label: 'Date', render: (r) => fmtDate(r.at) },
            { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          ]}
        />
      )}
      {tab === 'refunds' && (
        <Table
          rows={refunds}
          empty="No refunds."
          columns={[
            { key: 'id', label: 'Booking', render: (r) => <span className="strong">{r.id}</span> },
            { key: 'student', label: 'Student', render: (r) => user(r.studentId)?.name },
            { key: 'total', label: 'Charged', align: 'right', render: (r) => money(r.total, true) },
            { key: 'refunded', label: 'Refunded', align: 'right', render: (r) => money(r.refunded, true) },
            { key: 'note', label: 'Reason', render: (r) => <span className="sub2">{(r.timeline.filter((t) => /Refund/.test(t.text)).pop() || {}).text || 'Dispute resolution'}</span> },
          ]}
        />
      )}
    </>
  );
}

export function Disputes() {
  const { db, resolveDispute, can } = useAdmin();
  const { user, plane } = useLookups();
  const [tab, setTab] = useState('Open');
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null);
  const rows = db.disputes.filter((d) => tab === 'All' || d.status === tab);
  const d = sel && db.disputes.find((x) => x.id === sel);
  const b = d && db.bookings.find((x) => x.id === d.bookingId);

  return (
    <>
      <PageHeader title="Disputes" subtitle="Payouts for a disputed booking are held until it’s resolved.">
        <Segmented options={['Open', 'Resolved', 'All']} value={tab} onChange={setTab} />
      </PageHeader>
      <Table
        rows={rows}
        onRow={(r) => setSel(r.id)}
        selectedId={sel}
        empty="No open disputes."
        columns={[
          { key: 'id', label: 'Dispute', render: (r) => <span className="strong">{r.id}</span> },
          { key: 'bookingId', label: 'Booking' },
          { key: 'student', label: 'Raised by', render: (r) => user(db.bookings.find((x) => x.id === r.bookingId)?.studentId)?.name },
          { key: 'reason', label: 'Reason' },
          { key: 'amount', label: 'At stake', align: 'right', render: (r) => money(r.amount, true) },
          { key: 'opened', label: 'Opened', render: (r) => fmtDate(r.opened) },
          { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
        ]}
      />
      <Drawer
        open={!!d}
        onClose={() => setSel(null)}
        title={d ? `${d.id} · ${d.reason}` : ''}
        footer={d && d.status === 'Open' && can('refund') && (
          <>
            <Btn kind="ghost" onClick={() => setModal('deny')}>Deny & release payout</Btn>
            <Btn kind="ghost" onClick={() => setModal('partial')}>Partial refund</Btn>
            <Btn onClick={() => setModal('full')}>Full refund of claim</Btn>
          </>
        )}
      >
        {d && b && (
          <>
            <div className="banner">{d.detail}</div>
            <KV rows={[
              ['Booking', `${b.id} · ${fmtDateTime(b.when)}`], ['Student', user(b.studentId)?.name], ['Instructor', user(b.cfiId)?.name || 'Solo'], ['Aircraft', plane(b.planeId)?.tail],
              ['Charged', money(b.total, true)], ['Claimed', money(d.amount, true)], ['Status', <Badge>{d.status}</Badge>], d.resolution ? ['Resolution', d.resolution] : null,
            ]} />
            <div className="section-title">Booking timeline</div>
            <div className="timeline">{b.timeline.map((t, i) => <div key={i}><div>{t.text}</div><div className="sub2">{fmtDateTime(t.at)}</div></div>)}</div>
          </>
        )}
      </Drawer>
      <ReasonModal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'deny' ? 'Deny dispute' : modal === 'partial' ? 'Partial refund' : 'Refund the claimed amount'}
        body={modal === 'deny' ? 'No refund. The held payout is released to the instructor and owner.' : 'The refund goes to the student; the rest of the payout is released.'}
        confirmLabel={modal === 'deny' ? 'Deny dispute' : 'Resolve with refund'}
        amount={modal === 'partial' ? { max: d?.amount || 0, default: Math.round((d?.amount || 0) * 50) / 100 } : null}
        presets={modal === 'deny' ? ['Hobbs photo matches billing', 'Within cancellation policy'] : ['Hobbs corrected', 'Instructor late', 'Aircraft issue']}
        onConfirm={(reason, amt) => resolveDispute(d.id, `${modal === 'deny' ? 'Denied' : modal === 'partial' ? 'Partial refund' : 'Full refund'}: ${reason}`, modal === 'deny' ? 0 : modal === 'partial' ? amt : d.amount)}
      />
    </>
  );
}
