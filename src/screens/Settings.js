// Account basics: edit profile, notification settings, help & support.
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { useStore } from '../store';
import { useAuth } from '../backend/auth';
import { updateMyProfile, saveNotifyOff } from '../backend/profiles';
import { AIRPORTS } from '../data';
import { C, Card, Field, Toggle, Button, Avatar, Chip, Icon, pickImages, ListRow } from '../ui';
import { Header } from './Details';

const SITE = 'https://positiverate.app';
const SUPPORT_EMAIL = 'support@positiverate.app';

export function EditProfile({ nav }) {
  const auth = useAuth();
  const { profile, setProfile, pilot } = useStore();
  const a = auth?.account || {};
  const uid = auth?.session?.user?.id;
  const [name, setName] = useState(a.full_name || pilot.name || '');
  const [phone, setPhone] = useState(a.phone || '');
  const [airport, setAirport] = useState(a.home_airport || profile.airport || 'KPIE');
  const [photo, setPhoto] = useState(a.avatar_url || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const initials = (name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      if (uid) { await updateMyProfile(uid, { name, phone, airport, photo }); await auth.refreshAccount?.(); }
      setProfile({ airport });
      nav.pop();
    } catch (e) { setErr(e.message || 'Couldn’t save. Try again.'); }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Edit profile" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <Avatar photo={photo} initials={initials} color={C.navy} size={88} />
          <Pressable onPress={async () => { const [u] = await pickImages(false); if (u) setPhoto(u); }} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityRole="button">
            <Text style={{ color: C.blue, fontWeight: '800' }}>{photo ? 'Change photo' : 'Add photo'}</Text>
          </Pressable>
        </View>
        <Field label="Full name" value={name} onChangeText={setName} placeholder="e.g. Alex Rivera" />
        <Field label="Email" value={auth?.session?.user?.email || ''} editable={false} />
        <Text style={s.hint}>To change your email, message support.</Text>
        <Field label="Mobile number (optional)" value={phone} onChangeText={setPhone} placeholder="e.g. (727) 555-0142" keyboardType="phone-pad" />
        <Text style={s.hint}>Shared only with your instructor or the plane’s owner on the day of a booking, so you can reach each other at the airport.</Text>
        <Text style={s.label}>Home airport</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {AIRPORTS.map((x) => <Chip key={x.code} small label={x.code} active={airport === x.code} onPress={() => setAirport(x.code)} />)}
        </View>
        {!!err && <Text style={s.err} accessibilityLiveRegion="polite">{err}</Text>}
      </ScrollView>
      <View style={s.cta}>
        <Button title={busy ? 'Saving…' : 'Save'} disabled={busy || !name.trim()} style={{ flex: 1 }} onPress={save} />
      </View>
    </View>
  );
}

const CATEGORIES = [
  ['bookings', 'Bookings', 'Requests, confirmations, changes and shared flights'],
  ['messages', 'Messages', 'New messages from instructors, students and owners'],
  ['training', 'Training', 'Debriefs, preflight checks and training requests'],
  ['aircraft', 'Aircraft', 'Squawks, mechanics, checkouts and plane access'],
  ['account', 'Account', 'Verification results and document reminders'],
];

export function NotificationSettings({ nav }) {
  const auth = useAuth();
  const uid = auth?.session?.user?.id;
  const [off, setOff] = useState(auth?.account?.notify_off || []);
  const [err, setErr] = useState('');
  const toggle = async (key, on) => {
    const next = on ? off.filter((k) => k !== key) : [...off, key];
    setOff(next); setErr('');
    try { if (uid) { await saveNotifyOff(uid, next); auth.refreshAccount?.(); } } catch (e) { setErr(e.message || 'Couldn’t save.'); setOff(off); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Notifications" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={s.hint}>Push notifications on this phone. Everything still shows in the app.</Text>
        <Card style={{ paddingVertical: 4 }}>
          {CATEGORIES.map(([k, t, d], i) => (
            <View key={k} style={i > 0 && { borderTopWidth: 1, borderTopColor: C.line }}>
              <Toggle label={t} hint={d} value={!off.includes(k)} onValueChange={(v) => toggle(k, v)} />
            </View>
          ))}
        </Card>
        <Card style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.sky, borderColor: C.sky }}>
          <Icon name="alert" size={20} color={C.navy} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontWeight: '800', color: C.text }}>Safety alerts are always on</Text>
            <Text style={s.body}>A grounded plane or a cancelled flight always notifies you, so you never drive to the airport for nothing.</Text>
          </View>
        </Card>
        {!uid && <Text style={s.hint}>Sign in to change these.</Text>}
        {!!err && <Text style={s.err}>{err}</Text>}
      </ScrollView>
    </View>
  );
}

const TOPICS = [
  ['When am I charged?', 'Your card is saved when you book, but you’re charged after the flight, once the instructor or owner closes it out with the actual Hobbs time. You’ll get a receipt in Lessons.'],
  ['What happens if the weather is bad?', 'Cancelling for weather is free once your instructor or the owner confirms it. If they cancel for any reason, you’re never charged.'],
  ['What’s a checkout and do I need one?', 'Owners require a checkout flight before you rent their plane solo. Book one from the plane’s page; the owner approves you after it’s flown.'],
  ['How do instructor payouts work?', 'Your share goes to your bank through Stripe about 2 business days after you write the debrief. Set up payouts from the Earnings tab.'],
  ['Cancellation fees', 'Cancel more than 24 hours ahead and it’s free. Inside 24 hours, half the instruction is charged, unless it’s weather or maintenance. Solo rentals have no late fee.'],
  ['Something went wrong with a flight', 'Open the receipt in Lessons and tap Report a problem. Add photos if you have them. We reply within one business day.'],
];

export function Help({ nav }) {
  const [open, setOpen] = useState(null);
  const auth = useAuth();
  const mail = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Positive Rate help')}${auth?.session?.user?.email ? `&body=${encodeURIComponent(`Account: ${auth.session.user.email}\n\n`)}` : ''}`).catch(() => {});
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Help & support" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={s.section}>Common questions</Text>
        <Card style={{ paddingVertical: 2 }}>
          {TOPICS.map(([q, a], i) => (
            <Pressable key={q} onPress={() => setOpen(open === i ? null : i)} style={[s.q, i > 0 && { borderTopWidth: 1, borderTopColor: C.line }]} accessibilityRole="button" accessibilityState={{ expanded: open === i }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontWeight: '800', color: C.text }}>{q}</Text>
                <Icon name={open === i ? 'minus' : 'plus'} size={18} color={C.sub} />
              </View>
              {open === i && <Text style={[s.body, { marginTop: 6 }]}>{a}</Text>}
            </Pressable>
          ))}
        </Card>
        <Text style={s.section}>Still need help?</Text>
        <Card>
          <Text style={{ fontWeight: '800', color: C.text }}>Email the Positive Rate team</Text>
          <Text style={s.body}>A real person replies within one business day, usually much sooner.</Text>
          <Button title="Email support" icon="send" style={{ marginTop: 10 }} onPress={mail} />
        </Card>
        <Text style={s.section}>Legal</Text>
        <Card style={{ paddingVertical: 2 }}>
          <ListRow first icon="file" title="Terms of Service" onPress={() => Linking.openURL(`${SITE}/terms`).catch(() => {})} />
          <ListRow icon="shield" title="Privacy Policy" onPress={() => Linking.openURL(`${SITE}/privacy`).catch(() => {})} />
        </Card>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  hint: { color: C.sub, fontSize: 13, lineHeight: 18, marginTop: -4, marginBottom: 12 },
  body: { color: C.body, lineHeight: 20, marginTop: 2 },
  label: { color: C.sub, fontWeight: '700', marginBottom: 8 },
  err: { color: C.red, fontWeight: '600', marginTop: 10 },
  section: { fontSize: 13, fontWeight: '800', color: C.sub, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  q: { paddingVertical: 14 },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: 16, paddingBottom: 30, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
