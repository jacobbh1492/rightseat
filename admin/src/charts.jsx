import React, { useEffect, useRef, useState } from 'react';

// Charts follow the dataviz rules: thin marks, recessive grid, one axis, single-series = no legend box,
// hover tooltip on every chart, and a table view for every chart.

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const niceMax = (v) => {
  const p = Math.pow(10, Math.floor(Math.log10(v || 1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v) || v;
};

function TableView({ data, fmt, label }) {
  return (
    <table className="mini-table">
      <thead><tr><th>{label}</th><th className="num">Value</th></tr></thead>
      <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="num">{fmt(d.value)}</td></tr>)}</tbody>
    </table>
  );
}

export function LineChart({ data, fmt = (v) => v, height = 220, title, xLabel = 'Week' }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const pad = { l: 48, r: 14, t: 12, b: 28 };
  const max = niceMax(Math.max(...data.map((d) => d.value)) * 1.08);
  const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join('');
  const area = `${path}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - pad.l) / (w - pad.l - pad.r)) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };
  return (
    <div className="viz-root" ref={ref}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="viz-toggle" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>{asTable ? 'Show chart' : 'View as table'}</button>
      </div>
      {asTable ? <TableView data={data} fmt={fmt} label={xLabel} /> : (
        <svg width={w} height={height} role="img" aria-label={title} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: 'block', touchAction: 'pan-y' }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="#eef1f5" strokeWidth="1" />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{fmt(t)}</text>
            </g>
          ))}
          {data.map((d, i) => (i % Math.ceil(data.length / 6) === 0 || i === data.length - 1) && (
            <text key={d.label} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="#64748b">{d.label}</text>
          ))}
          <path d={area} fill="var(--series-1)" opacity="0.08" />
          <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" />
          <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r="4" fill="var(--series-1)" stroke="#fff" strokeWidth="2" />
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke="#94a3b8" strokeWidth="1" />
              <circle cx={x(hover)} cy={y(data[hover].value)} r="5" fill="var(--series-1)" stroke="#fff" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {!asTable && hover != null && (
        <div className="viz-tip" style={{ left: Math.min(Math.max(0, x(hover) - 60), w - 140), top: 24 }}>
          <strong>{fmt(data[hover].value)}</strong>{data[hover].label}{data[hover].note ? ` · ${data[hover].note}` : ''}
        </div>
      )}
    </div>
  );
}

export function BarList({ data, fmt = (v) => v, title, label = 'Category' }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(...data.map((d) => d.value)) || 1;
  return (
    <div className="viz-root">
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="viz-toggle" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>{asTable ? 'Show chart' : 'View as table'}</button>
      </div>
      {asTable ? <TableView data={data} fmt={fmt} label={label} /> : (
        <div role="img" aria-label={title}>
          {data.map((d, i) => (
            <div key={d.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 34%) 1fr auto', alignItems: 'center', gap: 10, padding: '6px 0' }}
              onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{d.label}</span>
              <div style={{ height: 14, background: '#f1f4f8', borderRadius: 4 }}>
                <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: 'var(--series-1)', borderRadius: 4, opacity: hover == null || hover === i ? 1 : 0.55 }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, minWidth: 60, textAlign: 'right' }}>{fmt(d.value)}</span>
            </div>
          ))}
        </div>
      )}
      {!asTable && hover != null && data[hover].note && (
        <div className="viz-tip" style={{ right: 0, top: 30 + hover * 26 }}><strong>{fmt(data[hover].value)}</strong>{data[hover].note}</div>
      )}
    </div>
  );
}
