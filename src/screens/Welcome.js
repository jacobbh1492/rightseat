import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { AIRPORTS } from '../data';
import { C, Button, Icon } from '../ui';
import { AircraftArt } from '../art';
import { useAuth } from '../backend/auth';
import SignIn from './SignIn';

const ROLES = [
  { key: 'learn', icon: 'grad', title: 'Learn to fly', sub: 'Find an instructor and a plane' },
  { key: 'rent', icon: 'plane', title: 'Rent a plane', sub: 'I’m already a pilot' },
  { key: 'teach', icon: 'users', title: 'Teach as a CFI', sub: 'Get students, get paid' },
  { key: 'own', icon: 'key', title: 'List my plane', sub: 'Earn from rentals' },
  { key: 'school', icon: 'school', title: 'Run a flight school', sub: 'Fleet, instructors, students' },
];
const STAGES = [
  { key: 'new', title: 'Haven’t started', sub: 'A discovery flight is the best first step' },
  { key: 'student', title: 'Student pilot', sub: 'Working toward a certificate' },
  { key: 'returning', title: 'Coming back', sub: 'Trained before and taking a break' },
  { key: 'certificated', title: 'Licensed pilot', sub: 'Private or higher, adding ratings' },
];

export default function Welcome() {
  const { setProfile } = useStore();
  const [step, setStep] = useState(0);
  const [roles, setRoles] = useState([]);
  const [stage, setStage] = useState(null);
  const [airport, setAirport] = useState('KPIE');
  const learner = roles.includes('learn') || roles.includes('rent');
  const steps = learner ? 4 : 3;
  const auth = useAuth();
  const [signin, setSignin] = useState(null); // 'new' | 'existing'
  const local = () => setProfile({ onboarded: true, roles, stage, airport });
  // Signed in already? Save answers to the account. Otherwise create the account first.
  const finish = async () => {
    if (auth?.session) { try { await auth.saveProfile({ roles, airport }); } catch {} local(); }
    else setSignin('new');
  };

  if (signin) {
    return (
      <SignIn
        title={signin === 'existing' ? 'Welcome back' : 'Create your account'}
        subtitle={signin === 'existing' ? 'Enter your email and we’ll send you a 6-digit code.' : 'Last step. We’ll email you a 6-digit code. No password needed.'}
        askName={signin === 'new'}
        onCancel={() => setSignin(null)}
        onDone={async ({ name }) => {
          if (signin === 'new') { try { await auth.saveProfile({ name, roles, airport }); } catch {} local(); }
          // returning users are routed by App once their profile loads
        }}
      />
    );
  }
  const toggle = (k) => setRoles(roles.includes(k) ? roles.filter((x) => x !== k) : [...roles, k]);

  if (step === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: C.navy }}>
        <View style={{ height: 260, overflow: 'hidden' }}>
          <AircraftArt kind="highwing" color="#1F6FEB" tail="N4821R" height={260} scene="sky" />
        </View>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
          <Text style={w.brand}>Positive Rate</Text>
          <Text style={w.hero}>Train. Rent. Fly.</Text>
          {[
            ['shieldCheck', 'Every CFI and aircraft verified', 'FAA records, insurance and maintenance checked'],
            ['book', 'Your training record, in one place', 'Hours, lessons, debriefs and endorsements'],
            ['dollar', 'Clear, upfront pricing', 'Instructor + plane, all-in, before you book'],
          ].map(([icon, t, s]) => (
            <View key={t} style={w.point}>
              <View style={w.pointIcon}><Icon name={icon} size={20} color="#93C5FD" /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{t}</Text>
                <Text style={{ color: '#9FB3D1', fontSize: 13, marginTop: 2 }}>{s}</Text>
              </View>
            </View>
          ))}
          <Button title="Get started" style={{ marginTop: 24 }} onPress={() => setStep(1)} />
          <Pressable onPress={() => setSignin('existing')} style={{ alignItems: 'center', marginTop: 16 }} accessibilityRole="button">
            <Text style={{ color: '#fff', fontWeight: '800' }}>I already have an account</Text>
          </Pressable>
          <Pressable onPress={() => setProfile({ onboarded: true, guest: true, roles: ['learn', 'rent', 'teach', 'own', 'school'], stage: 'student' })} style={{ alignItems: 'center', marginTop: 12 }} accessibilityRole="button">
            <Text style={{ color: '#9FB3D1', fontWeight: '700' }}>Skip, just browse</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={w.top}>
        <Pressable onPress={() => setStep(step - 1)} hitSlop={12} accessibilityLabel="Back"><Icon name="back" size={24} color={C.text} /></Pressable>
        <View style={w.dots}>{Array.from({ length: steps - 1 }, (_, i) => <View key={i} style={[w.dot, i < step && { backgroundColor: C.blue, width: 22 }]} />)}</View>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {step === 1 && (
          <>
            <Text style={w.q}>What brings you to Positive Rate?</Text>
            <Text style={w.qs}>Pick all that apply. We’ll set up the app around you.</Text>
            {ROLES.map((r) => {
              const on = roles.includes(r.key);
              return (
                <Pressable key={r.key} onPress={() => toggle(r.key)} style={[w.option, on && w.optionOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                  <View style={[w.optIcon, on && { backgroundColor: C.blue }]}><Icon name={r.icon} size={22} color={on ? '#fff' : C.blue} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={w.optTitle}>{r.title}</Text>
                    <Text style={w.optSub}>{r.sub}</Text>
                  </View>
                  <View style={[w.check, on && { backgroundColor: C.blue, borderColor: C.blue }]}>{on && <Icon name="check" size={14} color="#fff" strokeWidth={3} />}</View>
                </Pressable>
              );
            })}
          </>
        )}
        {step === 2 && learner && (
          <>
            <Text style={w.q}>Where are you in your flying?</Text>
            <Text style={w.qs}>So we can suggest the right next step.</Text>
            {STAGES.map((st) => (
              <Pressable key={st.key} onPress={() => setStage(st.key)} style={[w.option, stage === st.key && w.optionOn]} accessibilityRole="radio" accessibilityState={{ selected: stage === st.key }}>
                <View style={{ flex: 1 }}>
                  <Text style={w.optTitle}>{st.title}</Text>
                  <Text style={w.optSub}>{st.sub}</Text>
                </View>
                <View style={[w.radio, stage === st.key && { borderColor: C.blue }]}>{stage === st.key && <View style={w.radioDot} />}</View>
              </Pressable>
            ))}
          </>
        )}
        {step === steps - 1 && (
          <>
            <Text style={w.q}>Where do you fly?</Text>
            <Text style={w.qs}>Your home airport. You can change it any time.</Text>
            {AIRPORTS.map((a) => (
              <Pressable key={a.code} onPress={() => setAirport(a.code)} style={[w.option, airport === a.code && w.optionOn]} accessibilityRole="radio" accessibilityState={{ selected: airport === a.code }}>
                <View style={[w.optIcon, airport === a.code && { backgroundColor: C.blue }]}><Icon name="pin" size={20} color={airport === a.code ? '#fff' : C.blue} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={w.optTitle}>{a.code}</Text>
                  <Text style={w.optSub}>{a.name}</Text>
                </View>
                <View style={[w.radio, airport === a.code && { borderColor: C.blue }]}>{airport === a.code && <View style={w.radioDot} />}</View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
      <View style={w.foot}>
        <Button
          title={step === steps - 1 ? 'Start exploring' : 'Continue'}
          disabled={(step === 1 && !roles.length) || (step === 2 && learner && !stage)}
          style={{ flex: 1 }}
          onPress={() => (step === steps - 1 ? finish() : setStep(step + 1))}
        />
      </View>
    </View>
  );
}

const w = StyleSheet.create({
  brand: { color: '#fff', fontWeight: '900', fontSize: 40, lineHeight: 46, letterSpacing: -0.5 },
  hero: { color: '#93C5FD', fontSize: 22, fontWeight: '800', marginTop: 6, marginBottom: 22 },
  point: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  pointIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(147,197,253,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: C.bg },
  dots: { flexDirection: 'row' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D7DEE8', marginHorizontal: 3 },
  q: { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: -0.4 },
  qs: { color: C.sub, fontSize: 15, marginTop: 6, marginBottom: 18 },
  option: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 2, borderColor: '#fff', minHeight: 64 },
  optionOn: { borderColor: C.blue, backgroundColor: '#F5F9FF' },
  optIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  optTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  optSub: { fontSize: 13, color: C.sub, marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.blue },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 26, backgroundColor: C.bg, flexDirection: 'row' },
});
