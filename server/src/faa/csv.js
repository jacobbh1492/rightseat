import { parse } from 'csv-parse/sync';

// FAA files are comma-delimited with padded values, trailing commas and occasionally
// inconsistent header spacing. Normalize headers to UPPERCASE single-spaced keys and trim values.
// The aircraft registry isn't quoted at all and has stray " inside names, so it parses with quoting off.
export function parseFaaCsv(text, { quoted = true } = {}) {
  const rows = parse(text, { columns: (h) => h.map(normHeader), skip_empty_lines: true, relax_column_count: true, relax_quotes: true, trim: true, bom: true, ...(quoted ? {} : { quote: false }) });
  return rows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) if (k) out[k] = typeof v === 'string' ? v.trim() : v;
    return out;
  });
}

// FAA files start with a UTF-8 byte-order mark; read as latin1 it shows up as "ï»¿".
export const normHeader = (h) => String(h || '').replace(/^(\ufeff|\u00ef\u00bb\u00bf)+/, '').replace(/\ufeff/g, '').trim().replace(/\s+/g, ' ').toUpperCase();

// Read the first present column among aliases (FAA has renamed columns across releases).
export function col(row, ...names) {
  for (const n of names) {
    const v = row[normHeader(n)];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

// FAA dates come as MMYYYY (airmen) or YYYYMMDD (aircraft).
export function faaDate(s) {
  s = String(s || '').trim();
  if (/^\d{8}$/.test(s)) return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  if (/^\d{6}$/.test(s)) return new Date(Date.UTC(+s.slice(2, 6), +s.slice(0, 2) - 1, 1));
  if (/^\d{7}$/.test(s)) return faaDate('0' + s);
  return null;
}

export const normName = (s) => String(s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
