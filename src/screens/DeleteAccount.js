import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Share } from 'react-native';
import { useAuth } from '../backend/auth';
import { supabase, callFn } from '../backend/supabase';
import { C, Card, Button, Field, Icon } from '../ui';
import { useStore } from '../store';
import { fetchDebriefs, trainingRecordText } from '../backend/bookings';
import { Header } from './Details';

const GOES = [
  'Your name, photo, phone and home airport',
  'Your instructor profile and plane listings (taken down)',
  'Your messages and notifications',
  'Your training record and debriefs',
  'Uploaded documents and photos',
  'Your saved card',
];
const STAYS = [
  'Past booking, payment and payout records, which we must keep for tax and accounting. They show "Deleted user" instead of your name.',
  'Reviews you wrote, without your name.',
  'Verification results, kept as a safety record.',
];

export function DeleteAccount({ nav }) {
  const auth = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ready = typed.trim().toUpperCase() === 'DELETE';

  const go = async () => {
    setBusy(true); setErr('');
    try {
      await callFn('delete-account', { confirm: 'DELETE' });
      await supabase.auth.signOut({ scope: 'local' }); // the account is already gone server-side
      nav.pop();
    } catch (e) {
      setErr(e.message || 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  const list = (items, icon, color) => items.map((t) => (
    <View key={t} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 }}>
      <Icon name={icon} size={16} color={color} />
      <Text style={{ color: C.text, marginLeft: 8, flex: 1, lineHeight: 20 }}>{t}</Text>
    </View>
  ));
  const { requests } = useStore();
  const [saving, setSaving] = useState(false);
  const keepRecord = async () => {
    setSaving(true); setErr('');
    try {
      const uid = auth?.session?.user?.id;
      const flights = requests.filter((r) => r.live && r.status === 'Completed' && r.role !== 'partner').sort((a, b) => new Date(b.when) - new Date(a.when));
      const debriefs = uid ? await fetchDebriefs(uid) : [];
      await Share.share({ title: 'My training record', message: trainingRecordText({ name: auth?.account?.full_name, flights, debriefs }) });
    } catch (e) { setErr(e.message || 'Couldn’t export your record.'); }
    setSaving(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Delete account" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card style={{ backgroundColor: C.redBg, borderColor: C.red }}>
          <Text style={{ fontWeight: '900', color: C.red }}>This can’t be undone</Text>
        </Card>
        <Text style={{ color: C.text, fontSize: 15, lineHeight: 22 }}>
          This permanently deletes your Positive Rate account{auth?.session?.user?.email ? ` (${auth.session.user.email})` : ''}. It can't be undone.
        </Text>
        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '800', color: C.text }}>What we delete</Text>
          {list(GOES, 'x', C.red)}
        </Card>
        <Card style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '800', color: C.text }}>What we keep</Text>
          {list(STAYS, 'lock', C.sub)}
        </Card>
        <Text style={{ color: C.sub, marginTop: 12, lineHeight: 20 }}>
          If you have a confirmed lesson coming up, cancel or finish it first. If lesson pay is still waiting to be sent to you, set up payouts first so you don't lose it.
        </Text>
        <Card style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '800', color: C.text }}>Keep your training record first</Text>
          <Text style={{ color: C.sub, marginTop: 4, lineHeight: 20 }}>Your flights, hours and debriefs belong to you. Save a copy before you go.</Text>
          <Button title={saving ? 'Preparing…' : 'Download my training record'} icon="upload" variant="outline" disabled={saving} style={{ marginTop: 10 }} onPress={keepRecord} />
        </Card>
        <View style={{ marginTop: 18 }}>
          <Field label="Type DELETE to confirm" value={typed} onChangeText={setTyped} placeholder="DELETE" />
        </View>
        {!!err && <Text style={{ color: '#B91C1C', fontWeight: '700', marginBottom: 12 }}>{err}</Text>}
        <Pressable onPress={go} disabled={!ready || busy} style={[{ minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? C.red : '#E2E8F0' }]} accessibilityRole="button" accessibilityState={{ disabled: !ready || busy }}>
          <Text style={{ color: ready ? '#fff' : C.sub, fontWeight: '900', fontSize: 16 }}>{busy ? 'Deleting…' : 'Delete my account'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
