import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, BackHandler, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/store';
import Welcome from './src/screens/Welcome';
import SignIn from './src/screens/SignIn';
import { AuthProvider, useAuth, appRolesFrom } from './src/backend/auth';
import { Icon } from './src/icons';
import { C } from './src/ui';
import Explore from './src/screens/Explore';
import { CfiDetail, PlaneDetail, SchoolDetail } from './src/screens/Details';
import { RequestLesson, Lessons, LeaveReview, CancelLesson, CloseOut, Receipt } from './src/screens/Booking';
import Training from './src/screens/Training';
import { Inbox, Chat, Wallet } from './src/screens/Inbox';
import { CfiDashboard, OwnerDashboard, Plans, Credentials, Insights } from './src/screens/Dashboards';
import { PriorExperience, PriorReview } from './src/screens/Prior';
import { SchoolDashboard, AffiliationReview, JoinSchool } from './src/screens/School';
import { DebriefView, DebriefList, EditDebrief, StudentFile, AmendDebrief } from './src/screens/Debrief';
import { VerificationCenter, DocUpload, ReviewQueue, ReviewDetail, AutomationMonitor } from './src/screens/Verify';
import { Me, CfiForm, PlaneForm, SchoolForm } from './src/screens/Me';

const TABS = [
  { key: 'Explore', icon: 'search', label: 'Explore' },
  { key: 'Lessons', icon: 'calendar', label: 'Lessons' },
  { key: 'Training', icon: 'book', label: 'Training' },
  { key: 'Inbox', icon: 'chat', label: 'Inbox' },
  { key: 'Me', icon: 'user', label: 'Account' },
];
const TAB_SCREENS = { Explore, Lessons, Training, Inbox, Me };
const SignInScreen = ({ nav, params }) => <SignIn askName={false} title="Sign in" subtitle={params?.reason || 'We’ll email you a 6-digit code. No password needed.'} onCancel={nav.pop} onDone={() => nav.pop()} />;
const STACK_SCREENS = { SignIn: SignInScreen, Cfi: CfiDetail, Plane: PlaneDetail, School: SchoolDetail, Review: LeaveReview, Request: RequestLesson, CfiForm, PlaneForm, SchoolForm, Cancel: CancelLesson, CloseOut, Receipt, Chat, Wallet, CfiDashboard, OwnerDashboard, Plans, Credentials, Insights, Verification: VerificationCenter, DocUpload, ReviewQueue, ReviewDetail, Automation: AutomationMonitor, PriorExperience, PriorReview, Debrief: DebriefView, Debriefs: DebriefList, EditDebrief, StudentFile, AmendDebrief, SchoolDashboard, AffiliationReview, JoinSchool };

function Shell() {
  const { profile, setProfile, training, requests } = useStore();
  const auth = useAuth();
  // A returning, signed-in user skips onboarding: load their saved answers.
  useEffect(() => {
    const a = auth.account;
    if (a?.onboarded && !profile.onboarded) setProfile({ onboarded: true, guest: false, roles: appRolesFrom(a.roles), airport: a.home_airport || 'KPIE', name: a.full_name });
    if (!auth.session && profile.onboarded && !profile.guest) setProfile({ onboarded: false });
  }, [auth.account?.id, auth.session?.user?.id]);
  const [tab, setTab] = useState('Explore');
  const badges = {
    Training: training.debriefs.filter((d) => !d.pending && (!d.acknowledged || (d.amendments || []).some((a) => !a.read))).length,
    Lessons: requests.filter((r) => r.status === 'Pending').length,
  };
  const [stack, setStack] = useState([]);

  const nav = {
    push: (name, params = {}) => setStack((s) => [...s, { name, params, key: name + Date.now() }]),
    pop: () => setStack((s) => s.slice(0, -1)),
    replace: (name, params = {}) => setStack((s) => [...s.slice(0, -1), { name, params, key: name + Date.now() }]),
    goTab: (t) => { setStack([]); setTab(t); },
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length) { nav.pop(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [stack.length]);

  const top = stack[stack.length - 1];
  if (!auth.ready) return <View style={{ flex: 1, backgroundColor: C.navy }} />;
  if (!profile.onboarded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.navy }} edges={['top']}>
        <StatusBar style="light" />
        <Welcome />
      </SafeAreaView>
    );
  }
  const TabScreen = TAB_SCREENS[tab];
  const StackScreen = top ? STACK_SCREENS[top.name] : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: top ? '#fff' : C.navy }} edges={['top']}>
      <StatusBar style={top ? 'dark' : 'light'} />
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {StackScreen ? (
          <StackScreen key={top.key} nav={nav} params={top.params} />
        ) : (
          <>
            <TabScreen nav={nav} />
            <SafeAreaView edges={['bottom']} style={st.tabbar}>
              {TABS.map((t) => {
                const on = t.key === tab;
                return (
                  <Pressable key={t.key} onPress={() => setTab(t.key)} style={st.tab} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }}>
                    <View style={[st.iconWrap, on && { backgroundColor: C.sky }]}>
                      <Icon name={t.icon} size={22} color={on ? C.blue : '#7A8699'} strokeWidth={on ? 2.4 : 2} />
                      {badges[t.key] ? <View style={st.badge}><Text style={st.badgeText}>{badges[t.key]}</Text></View> : null}
                    </View>
                    <Text style={[st.label, on && { color: C.blue }]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </SafeAreaView>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StoreProvider>
          <View style={st.webFrame}>
            <Shell />
          </View>
        </StoreProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  webFrame: Platform.OS === 'web'
    ? { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', overflow: 'hidden', backgroundColor: C.bg }
    : { flex: 1 },
  tabbar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, paddingBottom: Platform.OS === 'web' ? 10 : 0 },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 2, minHeight: 48 },
  iconWrap: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  label: { fontSize: 11, color: '#7A8699', fontWeight: '700', marginTop: 2 },
});
