// Connection to the live Positive Rate backend (Supabase) for the account tools.
// Staff sign in with the same email-code flow as the app; the access token is sent to the
// admin-accounts Edge Function, which checks the account is on the admin team.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../src/backend/config.js';

const KEY = 'pr-admin-sb';
const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };

export const readSession = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const writeSession = (s) => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* storage unavailable */ } };

async function auth(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || `Sign-in error ${res.status}`);
  return data;
}
const toSession = (d) => ({ email: d.user?.email, access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 });

// Only existing accounts can get a code here (no sign-ups from the console).
export const sendCode = (email) => auth('otp', { email: email.trim().toLowerCase(), create_user: false });
export async function verifyCode(email, token) {
  const s = toSession(await auth('verify', { type: 'email', email: email.trim().toLowerCase(), token: token.trim() }));
  writeSession(s);
  return s;
}
export const signOutLive = () => writeSession(null);

async function fresh(session) {
  if (session.expires_at - Date.now() > 60_000) return session;
  const s = toSession(await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
  s.email = s.email || session.email;
  writeSession(s);
  return s;
}

// Call admin-accounts. Returns { data, session } so the caller can keep the refreshed session.
export async function callAccounts(session, body) {
  const s = await fresh(session);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-accounts`, {
    method: 'POST',
    headers: { ...headers, Authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Server error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return { data, session: s };
}

// Live account → the console's user row.
const ROLE = { cfi: 'CFI', owner: 'Owner', school: 'School' };
export function toUser(a) {
  const stage = a.kind === 'cfi' ? (a.cfi?.certs || []).join(' · ')
    : a.kind === 'owner' ? `${a.planes?.length || 0} aircraft`
    : (a.school?.trainingTypes || []).join(' & ') || (a.school?.plan === 'pro' ? 'School Pro' : 'Starter');
  return {
    id: `${a.kind}:${a.id}`, name: a.name || '(no name)', email: a.email, role: ROLE[a.kind], airport: a.airport || '—', stage,
    joined: a.joined, status: a.suspended ? 'Suspended' : 'Active', verified: a.verified ? 'Verified' : 'Pending', pro: a.pro,
    notes: [], account: a, live: true,
  };
}
