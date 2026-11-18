import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput } from 'react-native';
import * as Location from 'expo-location';
import { useStore } from '../store';
import { AIRPORTS, milesBetween } from '../data';
import { C, Button, Icon, Logo, Banner } from '../ui';
import { useAuth } from '../backend/auth';
import SignIn from './SignIn';

const ROLES = [
  { key: 'learn', icon: 'grad', title: 'Learn to fly', sub: 'Book a vetted instructor and plane' },
  { key: 'rent', icon: 'plane', title: 'Rent a plane', sub: 'I’m already a pilot' },
  { key: 'teach', icon: 'users', title: 'Teach as a CFI', sub: 'Get found by students, get paid' },
  { key: 'own', icon: 'key', title: 'List my plane', sub: 'Earn from rentals, you set the rules' },
  { key: 'school', icon: 'school', title: 'Run a flight school', sub: 'Fleet, instructors and students' },
];
const STAGES = [
  { key: 'new', title: 'Haven’t started', sub: 'A discovery flight is the best first step', unlocks: 'We’ll show discovery flights near you and what a first lesson looks like.' },
  { key: 'student', title: 'Student pilot', sub: 'Working toward a certificate', unlocks: 'We’ll track your FAA minimums (61.109) and suggest instructors who teach Private Pilot.' },
  { key: 'returning', title: 'Coming back', sub: 'Trained before and taking a break', unlocks: 'We’ll help you log past training and find a CFI for a refresher or flight review.' },
  { key: 'certificated', title: 'Licensed pilot', sub: 'Private or higher, adding ratings', unlocks: 'We’ll show rentals you’re eligible for and instructors for your next rating.' },
];
const BENEFITS = [
  ['shield', 'Vetted instructors and planes', 'CFI certificates checked with the FAA; insurance and inspections on file'],
  ['book', 'Your training record, in one place', 'Hours, debriefs and FAA minimums, yours to keep'],
  ['tag', 'One price before you book', 'Instructor + plane, all-in, no surprises'],
];
const TOTAL = 4; // roles · stage · airport · account: the count never changes mid-way

export default function Welcome() {
  const { setProfile } = useStore();
  const auth = useAuth();
  const [step, setStep] = useState(0);
  const [roles, setRoles] = useState([]);
  const [stage, setStage] = useState(null);
  const [airport, setAirport] = useState('KPIE');
  const [signin, setSignin] = useState(null); // 'new' | 'existing'
  const learner = roles.includes('learn') || roles.includes('rent');
  const local = () => setProfile({ onboarded: true, roles, stage, airport });
  // Signed in already? Save answers to the account. Otherwise create the account (step 4).
  const finish = async () => {
    if (auth?.session) { try { await auth.saveProfile({ roles, airport }); } catch {} local(); }
    else setSignin('new');
  };
  const browse = () => setProfile({ onboarded: true, guest: true, roles: ['learn', 'rent', 'teach', 'own', 'school'], stage: 'student' });

  if (signin) {
    return (
      <SignIn
        mode={signin}
        step={signin === 'new' ? { n: TOTAL, of: TOTAL } : null}
        onSwitch={() => setSignin(signin === 'new' ? 'existing' : 'new')}
        onCancel={() => setSignin(null)}
        onDone={async ({ name }) => {
          if (signin === 'new') { try { await auth.saveProfile({ name, roles, airport }); } catch {} local(); }
          // returning users are routed by App once their profile loads
        }}
      />
    );
  }

  if (step === 0) {
    return (
      <View style={w.hero}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 40, paddingBottom: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Logo size={34} />
            <Text style={w.brand}>Positive Rate</Text>
          </View>
          <Text style={w.h1} accessibilityRole="header">Train. Rent. <Text style={{ color: C.amber }}>Fly.</Text></Text>
          <Text style={w.lede}>One place for student pilots, renters, instructors, aircraft owners and flight schools.</Text>
          {BENEFITS.map(([icon, t, s]) => (
            <View key={t} style={w.point} accessible>
              <View style={w.pointIcon}><Icon name={icon} size={20} color={C.amber} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t}</Text>
                <Text style={{ color: '#C9D4E5', fontSize: 13, marginTop: 2, lineHeight: 18 }}>{s}</Text>
              </View>
            </View>
          ))}
          <View style={{ flex: 1, minHeight: 24 }} />
          <Button title="Get started" onPress={() => setStep(1)} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Pressable onPress={browse} style={w.quiet} accessibilityRole="button"><Text style={{ color: '#fff', fontWeight: '700' }}>Browse without an account</Text></Pressable>
            <Pressable onPress={() => setSignin('existing')} style={w.quiet} accessibilityRole="button"><Text style={{ color: '#C9D4E5', fontWeight: '700' }}>Log in</Text></Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  const toggle = (k) => setRoles(roles.includes(k) ? roles.filter((x) => x !== k) : [...roles, k]);
  // Stage only matters to learners; others skip it but the counter stays "of 4".
  const next = () => {
    if (step === 1) setStep(learner ? 2 : 3);
    else if (step === 2) setStep(3);
    else finish();
  };
  const back = () => setStep(step === 3 && !learner ? 1 : step - 1);
  const cta = step === 1 ? (roles.length ? `Continue · ${roles.length} selected` : 'Pick at least one') : 'Continue';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Progress step={step} onBack={back} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <>
            <Text style={w.q} accessibilityRole="header">What brings you to Positive Rate?</Text>
            <Text style={w.qs}>Pick all that apply. You can add more later in Account.</Text>
            {ROLES.map((r) => (
              <Choice key={r.key} icon={r.icon} title={r.title} sub={r.sub} on={roles.includes(r.key)} onPress={() => toggle(r.key)} />
            ))}
          </>
        )}
        {step === 2 && (
          <>
            <Text style={w.q} accessibilityRole="header">Where are you in your flying?</Text>
            <Text style={w.qs}>So we can suggest the right next step.</Text>
            {STAGES.map((st) => (
              <Choice key={st.key} single title={st.title} sub={st.sub} on={stage === st.key} onPress={() => setStage(st.key)} />
            ))}
            {stage && <Banner tone="navy" icon="book" title={STAGES.find((x) => x.key === stage).title}>{STAGES.find((x) => x.key === stage).unlocks}</Banner>}
          </>
        )}
        {step === 3 && <AirportStep value={airport} onChange={setAirport} />}
      </ScrollView>
      <View style={w.foot}>
        <Button title={cta} disabled={(step === 1 && !roles.length) || (step === 2 && !stage) || (step === 3 && !airport)} style={{ flex: 1 }} onPress={next} />
      </View>
    </View>
  );
}

function Progress({ step, onBack }) {
  return (
    <View style={w.top} accessible={false}>
      <Pressable onPress={onBack} style={w.backBtn} accessibilityRole="button" accessibilityLabel="Back"><Icon name="back" size={24} color={C.navy} /></Pressable>
      <View style={{ flex: 1, flexDirection: 'row', paddingRight: 8 }}>
        {Array.from({ length: TOTAL }, (_, i) => <View key={i} style={[w.seg, i < step && { backgroundColor: C.amber }]} />)}
      </View>
      <Text style={w.count} accessibilityLabel={`Step ${step} of ${TOTAL}`}>{step} of {TOTAL}</Text>
    </View>
  );
}

function Choice({ icon, title, sub, on, onPress, single }) {
  return (
    <Pressable onPress={onPress} style={[w.option, on && w.optionOn]} accessibilityRole={single ? 'radio' : 'checkbox'} accessibilityState={{ checked: on }}>
      {icon ? <View style={[w.optIcon, on && { backgroundColor: C.amberBg }]}><Icon name={icon} size={22} color={C.navy} /></View> : null}
      <View style={{ flex: 1 }}>
        <Text style={w.optTitle}>{title}</Text>
        <Text style={w.optSub}>{sub}</Text>
      </View>
      <View style={[single ? w.radio : w.check, on && { backgroundColor: C.navy, borderColor: C.navy }]}>
        {on && <Icon name="check" size={16} color="#fff" strokeWidth={3} />}
      </View>
    </Pressable>
  );
}

// Home airport: search any field, use location, or pick from nearby.
function AirportStep({ value, onChange }) {
  const [q, setQ] = useState('');
  const [here, setHere] = useState(null);
  const [locErr, setLocErr] = useState('');
  const origin = here || AIRPORTS.find((a) => a.code === value) || AIRPORTS[0];
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hits = AIRPORTS.filter((a) => !t || a.code.toLowerCase().includes(t) || a.name.toLowerCase().includes(t) || (a.city || '').toLowerCase().includes(t));
    return hits.map((a) => ({ ...a, mi: Math.round(milesBetween(origin, a)) })).sort((x, y) => x.mi - y.mi);
  }, [q, origin.lat, origin.lon]);
  const typed = q.trim().toUpperCase();
  const customOk = /^[A-Z0-9]{3,4}$/.test(typed) && !AIRPORTS.some((a) => a.code === typed);
  const locate = async () => {
    setLocErr('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocErr('Location is off. Search for your airport instead.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      setHere(me);
      const nearest = [...AIRPORTS].sort((a, b) => milesBetween(me, a) - milesBetween(me, b))[0];
      if (nearest) onChange(nearest.code);
    } catch { setLocErr('Couldn’t get your location. Search for your airport instead.'); }
  };
  return (
    <>
      <Text style={w.q} accessibilityRole="header">Where do you fly?</Text>
      <Text style={w.qs}>Your home airport. You can change it any time.</Text>
      <View style={w.search}>
        <Icon name="search" size={20} color={C.sub} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search any airport, city or ICAO code" placeholderTextColor={C.placeholder}
          autoCapitalize="characters" autoCorrect={false} style={w.searchInput} accessibilityLabel="Search airports" />
      </View>
      <Pressable onPress={locate} style={w.locate} accessibilityRole="button">
        <Icon name="pin" size={16} color={C.blue} />
        <Text style={{ color: C.blue, fontWeight: '700', marginLeft: 6 }}>Use my location</Text>
      </Pressable>
      {!!locErr && <Text style={{ color: C.red, marginBottom: 8 }}>{locErr}</Text>}
      <Text style={w.label}>{q ? 'Results' : 'Near you'}</Text>
      {list.map((a) => (
        <Choice key={a.code} single icon="pin" title={`${a.code} · ${a.name}`} sub={a.mi < 1 ? 'Closest' : `${a.mi} mi`} on={value === a.code} onPress={() => onChange(a.code)} />
      ))}
      {customOk && (
        <Choice single icon="pin" title={typed} sub="Use this airport code" on={value === typed} onPress={() => onChange(typed)} />
      )}
      {!list.length && !customOk && <Text style={w.optSub}>No match. Type the 4-letter ICAO code, like KPIE.</Text>}
    </>
  );
}

const w = StyleSheet.create({
  hero: { flex: 1, backgroundColor: C.navy },
  brand: { color: '#fff', fontWeight: '800', fontSize: 19, marginLeft: 10 },
  h1: { color: '#fff', fontWeight: '800', fontSize: 46, lineHeight: 50, letterSpacing: -1, marginTop: 28 },
  lede: { color: '#C9D4E5', fontSize: 16, lineHeight: 23, marginTop: 10, marginBottom: 12 },
  point: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 16 },
  pointIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#163056', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  quiet: { minHeight: 44, justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 8, paddingRight: 16, backgroundColor: C.bg },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  seg: { flex: 1, height: 5, borderRadius: 999, backgroundColor: C.line, marginRight: 6 },
  count: { fontSize: 13, fontWeight: '700', color: C.sub },
  q: { fontSize: 28, lineHeight: 32, fontWeight: '800', color: C.text, letterSpacing: -0.4, marginTop: 8 },
  qs: { color: C.sub, fontSize: 15, marginTop: 6, marginBottom: 16, lineHeight: 21 },
  option: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10, borderWidth: 1, borderColor: C.line, minHeight: 68 },
  optionOn: { borderWidth: 2, borderColor: C.navy },
  optIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  optTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  optSub: { fontSize: 13, color: C.sub, marginTop: 2, lineHeight: 18 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.chevron, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.chevron, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, minHeight: 50 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: C.text, paddingVertical: 12 },
  locate: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: C.sub, marginTop: 4, marginBottom: 8 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 26, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row' },
});
