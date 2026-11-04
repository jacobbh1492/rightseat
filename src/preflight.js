// Preflight go/no-go: weather at the departure airport, the plane's status and the pilot's
// checks on one screen. Weather comes from the FAA's Aviation Weather Center
// (aviationweather.gov), which is free and needs no key. This is a planning aid, not an
// official briefing (14 CFR 91.103): the screen says so and links to one.

export const AWC = 'https://aviationweather.gov/api/data';

// FAA flight categories (AIM 7-1-7 / AWC): ceiling = lowest broken, overcast or vertical visibility.
export function ceilingOf(clouds = [], vertVis = null) {
  const layers = (clouds || []).filter((c) => ['BKN', 'OVC', 'OVX'].includes(c.cover) && Number.isFinite(Number(c.base))).map((c) => Number(c.base));
  if (Number.isFinite(Number(vertVis)) && vertVis !== null) layers.push(Number(vertVis) * (Number(vertVis) < 100 ? 100 : 1));
  return layers.length ? Math.min(...layers) : null;
}

export const visibilityOf = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace('+', ''));
  return Number.isFinite(n) ? n : null;
};

export function flightCategory(ceilingFt, visSm) {
  const c = ceilingFt ?? Infinity, v = visSm ?? Infinity;
  if (c < 500 || v < 1) return 'LIFR';
  if (c < 1000 || v < 3) return 'IFR';
  if (c <= 3000 || v <= 5) return 'MVFR';
  return 'VFR';
}

export const CATEGORY_INFO = {
  VFR: { label: 'VFR', color: '#059669', bg: '#E3F7EF' },
  MVFR: { label: 'Marginal VFR', color: '#1F6FEB', bg: '#E6F0FF' },
  IFR: { label: 'IFR', color: '#DC2626', bg: '#FEE2E2' },
  LIFR: { label: 'Low IFR', color: '#C026D3', bg: '#FAE8FF' },
};

// One METAR from AWC's JSON (/metar?format=json) in the shape the screen uses.
export function parseMetar(m) {
  if (!m || !m.rawOb) return null;
  const ceiling = ceilingOf(m.clouds, m.vertVis);
  const vis = visibilityOf(m.visib);
  const category = ['VFR', 'MVFR', 'IFR', 'LIFR'].includes(m.fltCat) ? m.fltCat : flightCategory(ceiling, vis);
  const observed = Number.isFinite(Number(m.obsTime)) ? new Date(Number(m.obsTime) * 1000) : (m.reportTime ? new Date(m.reportTime) : null);
  return {
    station: m.icaoId, name: m.name || m.icaoId, raw: m.rawOb, category, ceiling, visibility: vis, visibilityText: m.visib == null ? '' : String(m.visib),
    windDir: m.wdir, windSpeed: Number(m.wspd || 0), gust: Number(m.wgst || 0) || null, temp: m.temp, dewpoint: m.dewp,
    altimeterInHg: Number.isFinite(Number(m.altim)) ? Math.round((Number(m.altim) / 33.8639) * 100) / 100 : null,
    weather: m.wxString || '', observed,
  };
}

export const windText = (w) => {
  if (!w) return '';
  if (!w.windSpeed) return 'Calm';
  const dir = w.windDir === 'VRB' ? 'Variable' : `${String(w.windDir).padStart(3, '0')}°`;
  return `${dir} at ${w.windSpeed} kt${w.gust ? `, gusting ${w.gust}` : ''}`;
};

// Weather heads-ups (never blocking: the pilot in command decides).
//   solo: no instructor on board, so student-style limits are worth flagging.
export function weatherChecks(w, { solo = false, now = new Date() } = {}) {
  if (!w) return [{ key: 'wx', label: 'Weather unavailable. Get a briefing before you fly.', ok: false, blocking: false }];
  const out = [];
  const info = CATEGORY_INFO[w.category] || CATEGORY_INFO.VFR;
  out.push({ key: 'category', label: `${info.label} at ${w.station}${w.ceiling ? ` · ceiling ${w.ceiling.toLocaleString('en-US')} ft` : ''}${w.visibility != null ? ` · ${w.visibilityText} SM` : ''}`,
    ok: w.category === 'VFR', blocking: false });
  const wind = Math.max(w.windSpeed || 0, w.gust || 0);
  const spread = w.gust ? w.gust - (w.windSpeed || 0) : 0;
  const windLimit = solo ? 15 : 25;
  out.push({ key: 'wind', label: `Wind ${windText(w).toLowerCase()}${wind > windLimit ? ` (above ${windLimit} kt${solo ? ', a common solo limit' : ''})` : spread >= 10 ? ' (gusty)' : ''}`,
    ok: wind <= windLimit && spread < 10, blocking: false });
  if (w.temp != null && w.dewpoint != null && w.temp - w.dewpoint <= 2 && w.category === 'VFR') {
    out.push({ key: 'spread', label: `Temp/dewpoint spread ${Math.round((w.temp - w.dewpoint) * 10) / 10}°C: fog or low clouds may form`, ok: false, blocking: false });
  }
  const body = String(w.raw || '').split(' RMK')[0].split(' ').slice(2).join(' ');
  if (/TS/.test(w.weather || '') || /TS|CB(\s|$)/.test(body)) out.push({ key: 'ts', label: 'Thunderstorms reported', ok: false, blocking: false });
  if (w.observed && now - w.observed > 2 * 60 * 60 * 1000) out.push({ key: 'old', label: 'This report is over 2 hours old', ok: false, blocking: false });
  return out;
}

// I'M SAFE: the pilot's own fitness to fly (FAA Risk Management Handbook, PHAK ch. 2).
export const IMSAFE = [
  { key: 'illness', label: 'Illness', ask: 'Feeling well, no symptoms?' },
  { key: 'medication', label: 'Medication', ask: 'No medication that affects flying?' },
  { key: 'stress', label: 'Stress', ask: 'Not under unusual pressure today?' },
  { key: 'alcohol', label: 'Alcohol', ask: 'Nothing in the last 8 hours (and under .04)?' },
  { key: 'fatigue', label: 'Fatigue', ask: 'Rested?' },
  { key: 'emotion', label: 'Emotion / eating', ask: 'Calm, fed and hydrated?' },
];

// go | caution | no-go. Blocking failures (aircraft or pilot) are a no-go; anything else
// unresolved, including an unanswered I'M SAFE item, is caution.
export function verdict(checks, imsafe = {}) {
  if (checks.some((c) => c.blocking && !c.ok)) return 'no-go';
  if (IMSAFE.some((i) => imsafe[i.key] === false)) return 'no-go';
  if (checks.some((c) => !c.ok) || IMSAFE.some((i) => imsafe[i.key] !== true)) return 'caution';
  return 'go';
}

export async function fetchWeather(station, fetchImpl = fetch) {
  const id = String(station || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(id)) throw new Error('Unknown airport');
  const [m, t] = await Promise.all([
    fetchImpl(`${AWC}/metar?ids=${id}&format=json`).then((r) => (r.ok ? r.json() : [])),
    fetchImpl(`${AWC}/taf?ids=${id}&format=raw`).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
  ]);
  const metar = parseMetar(Array.isArray(m) ? m[0] : null);
  return { metar, taf: String(t || '').trim() };
}
