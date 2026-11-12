import React, { useEffect, useMemo, useState } from 'react';

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

export const money = (n, cents = false) => (n < 0 ? '−' : '') + '$' + Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
export const pct = (n) => `${(n * 100).toFixed(n * 100 % 1 ? 1 : 0)}%`;

// ---------- Icons (same stroke set as the app) ----------
const ICONS = {
  overview: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  verify: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  plane: 'M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 2v4M8 2v4M3 10h18',
  dollar: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  alert: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.8 1.2 6.9-6.2-3.2-6.2 3.2L7 14.1 2 9.3l6.9-1z',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  x: 'M18 6L6 18M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  table: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',
  chart: 'M12 20V10M18 20V4M6 20v-4',
  plus: 'M12 5v14M5 12h14',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
};
export function Icon({ name, size = 18, color = 'currentColor', sw = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] || ICONS.file} />
    </svg>
  );
}

const STATUS = {
  good: ['Active', 'Verified', 'Completed', 'Confirmed', 'Paid', 'Published', 'Resolved', 'Approved', 'approved', 'Healthy', 'Instant · paid'],
  warn: ['Pending', 'Scheduled', 'Open', 'Reported', 'review', 'pending', 'Invited', 'reupload'],
  bad: ['Suspended', 'Cancelled', 'Paused', 'Hidden', 'rejected', 'Failed', 'Expired'],
};
export function Badge({ children, tone }) {
  const t = tone || (STATUS.good.includes(children) ? 'good' : STATUS.warn.includes(children) ? 'warn' : STATUS.bad.includes(children) ? 'bad' : 'neutral');
  return <span className={`badge badge-${t}`}>{children}</span>;
}

export function Btn({ children, kind = 'primary', icon, small, ...rest }) {
  return (
    <button className={`btn btn-${kind}${small ? ' btn-sm' : ''}`} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="row gap8">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, tone, onClick }) {
  return (
    <div className={`stat${onClick ? ' clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className={`stat-sub ${tone || ''}`}>{sub}</div>}
    </div>
  );
}

export function Search({ value, onChange, placeholder }) {
  return (
    <label className="search">
      <Icon name="search" size={16} color="#64748B" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => {
        const [k, label] = Array.isArray(o) ? o : [o, o];
        return <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>;
      })}
    </div>
  );
}

// Sortable table. columns: [{ key, label, render?, sort?: (row) => value, align? }]
export function Table({ columns, rows, onRow, selectedId, empty = 'Nothing here.', initialSort }) {
  const [sort, setSort] = useState(initialSort || null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const get = col.sort || ((r) => r[col.key]);
    return [...rows].sort((a, b) => (get(a) > get(b) ? 1 : get(a) < get(b) ? -1 : 0) * (sort.dir === 'asc' ? 1 : -1));
  }, [rows, sort, columns]);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align || 'left' }} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button className="th-btn" onClick={() => setSort(sort?.key === c.key && sort.dir === 'desc' ? { key: c.key, dir: 'asc' } : { key: c.key, dir: 'desc' })}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} onClick={onRow ? () => onRow(r) : undefined} className={`${onRow ? 'clickable' : ''}${selectedId === r.id ? ' selected' : ''}`} tabIndex={onRow ? 0 : undefined} onKeyDown={(e) => onRow && e.key === 'Enter' && onRow(r)}>
              {columns.map((c) => <td key={c.key} style={{ textAlign: c.align || 'left' }}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && <div className="empty">{empty}</div>}
    </div>
  );
}

export function Drawer({ open, onClose, title, children, footer }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={title}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}

// Confirmation that requires a reason. Every destructive admin action is explained and logged.
export function ReasonModal({ open, title, body, confirmLabel, danger, presets = [], onConfirm, onClose, amount }) {
  const [reason, setReason] = useState('');
  const [amt, setAmt] = useState(amount?.default ?? '');
  useEffect(() => { if (open) setAmt(amount?.default ?? ''); }, [open]);
  useEscape(open, onClose);
  if (!open) return null;
  const amtNum = Number(amt);
  const amtBad = amount && (!(amtNum > 0) || amtNum > amount.max);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {body && <p className="muted">{body}</p>}
        {amount && (
          <label className="field">
            <span>Amount (max {money(amount.max, true)}{amount.limitNote ? ` · ${amount.limitNote}` : ''})</span>
            <input type="number" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </label>
        )}
        {presets.length > 0 && <div className="chips">{presets.map((p) => <button key={p} className={`chip${reason === p ? ' on' : ''}`} onClick={() => setReason(p)}>{p}</button>)}</div>}
        <label className="field">
          <span>Reason (saved to the audit log)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </label>
        <div className="row gap8 end">
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind={danger ? 'danger' : 'primary'} disabled={reason.trim().length < 3 || amtBad} onClick={() => { onConfirm(reason.trim(), amtNum); setReason(''); onClose(); }}>{confirmLabel}</Btn>
        </div>
      </div>
    </>
  );
}

export function KV({ rows }) {
  return (
    <dl className="kv">
      {rows.filter(Boolean).map(([k, v]) => (
        <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>
      ))}
    </dl>
  );
}

// ---------- Charts: single series, one hue, hover tooltip, table view toggle ----------
export function WeeklyChart({ title, data, format = (v) => v, type = 'bar', height = 220, caption }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const W = 640, H = height, padL = 48, padR = 12, padT = 16, padB = 28;
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const m = max / p; return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
  const x = (i) => padL + ((W - padL - padR) / data.length) * (i + 0.5);
  const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
  const bw = Math.min(36, ((W - padL - padR) / data.length) * 0.62);
  const ticks = [0, nice / 2, nice];
  return (
    <div className="card chart">
      <div className="row between">
        <div><h3>{title}</h3>{caption && <div className="muted small">{caption}</div>}</div>
        <button className="link" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}><Icon name={asTable ? 'chart' : 'table'} size={14} /> {asTable ? 'Chart' : 'Table'}</button>
      </div>
      {asTable ? (
        <table className="mini"><tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td style={{ textAlign: 'right' }}>{format(d.value)}</td></tr>)}</tbody></table>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${title}. ${data.map((d) => `${d.label}: ${format(d.value)}`).join('; ')}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#EEF1F5" />
                <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748B">{format(t)}</text>
              </g>
            ))}
            {data.map((d, i) => (i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && <text key={d.label} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748B">{d.label}</text>)}
            {type === 'bar'
              ? data.map((d, i) => {
                  const h = Math.max(0, H - padB - y(d.value));
                  const top = y(d.value);
                  return (
                    <g key={d.label}>
                      <path d={`M${x(i) - bw / 2},${H - padB} V${top + 4} Q${x(i) - bw / 2},${top} ${x(i) - bw / 2 + 4},${top} H${x(i) + bw / 2 - 4} Q${x(i) + bw / 2},${top} ${x(i) + bw / 2},${top + 4} V${H - padB} Z`}
                        fill={hover === i ? '#4C8DF6' : '#1F6FEB'} style={{ display: h < 1 ? 'none' : undefined }} />
                      <rect x={x(i) - (W - padL - padR) / data.length / 2} y={padT} width={(W - padL - padR) / data.length} height={H - padT - padB} fill="transparent"
                        onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.label}: ${format(d.value)}`} />
                    </g>
                  );
                })
              : (
                <>
                  <path d={data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ')} fill="none" stroke="#1F6FEB" strokeWidth="2" strokeLinejoin="round" />
                  {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="#94A3B8" strokeDasharray="3 3" />}
                  {hover != null && <circle cx={x(hover)} cy={y(data[hover].value)} r="5" fill="#1F6FEB" stroke="#fff" strokeWidth="2" />}
                  <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="transparent"
                    onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * (W - padL - padR); setHover(Math.max(0, Math.min(data.length - 1, Math.floor(px / ((W - padL - padR) / data.length))))); }}
                    onMouseLeave={() => setHover(null)} />
                </>
              )}
          </svg>
          {hover != null && (
            <div className="tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(data[hover].value) / H) * 100}%` }}>
              <strong>{format(data[hover].value)}</strong>
              <span>{data[hover].label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
