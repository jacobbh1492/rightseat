import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';
import { unregisterPush } from './push';

// Session + profile for the signed-in user. Sign-in is a 6-digit code sent by email
// (no passwords to forget, works the same on iPhone, Android and web).
const Ctx = createContext(null);

const ROLE_MAP = { learn: 'student', rent: 'student', teach: 'cfi', own: 'owner', school: 'school_admin' };

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState(null); // row from public.profiles
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    // Keep tokens fresh only while the app is in the foreground.
    const app = Platform.OS === 'web' ? null : AppState.addEventListener('change', (st) => (st === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()));
    return () => { sub.subscription.unsubscribe(); app?.remove(); };
  }, []);

  useEffect(() => {
    if (!session) { setAccount(null); return; }
    const uid = session.user.id;
    const load = () => supabase.from('profiles').select('*').eq('id', uid).single().then(({ data }) => setAccount(data));
    load();
    // A school that switched from Flight Schedule Pro may have imported this email:
    // join it (adds the role, and an instructor's invite to the school's terms).
    supabase.rpc('claim_school_invites').then(({ data }) => { if (data?.length) load(); }, () => {});
  }, [session?.user?.id]);

  const value = {
    ready,
    session,
    user: session?.user || null,
    account,
    sendCode: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
      if (error) throw error;
    },
    verifyCode: async (email, token) => {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email' });
      if (error) throw error;
    },
    // Save onboarding answers to the account.
    saveProfile: async ({ name, roles = [], airport }) => {
      // Read the user fresh: right after verifyCode the session state above hasn't re-rendered yet.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Keep roles a school gave this person when it imported them from Flight Schedule Pro.
      const { data: invites } = await supabase.from('school_invites').select('role').eq('user_id', user.id).eq('status', 'joined');
      const dbRoles = [...new Set([...roles.map((r) => ROLE_MAP[r]), ...(invites || []).map((i) => i.role)].filter(Boolean))];
      const patch = { onboarded: true, roles: dbRoles.length ? dbRoles : ['student'], home_airport: airport };
      if (name) patch.full_name = name;
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', user.id).select().single();
      if (error) throw error;
      setAccount(data);
    },
    // Re-read the profile (e.g. after payout setup changes payouts_ready).
    refreshAccount: async () => {
      if (!session) return null;
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (data) setAccount(data);
      return data;
    },
    // Unregister this phone first (needs the session), then sign out.
    signOut: async () => { try { await unregisterPush(); } catch {} return supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const appRolesFrom = (dbRoles = []) => {
  const out = [];
  if (dbRoles.includes('student')) out.push('learn', 'rent');
  if (dbRoles.includes('cfi')) out.push('teach');
  if (dbRoles.includes('owner')) out.push('own');
  if (dbRoles.includes('school_admin')) out.push('school');
  return out;
};
