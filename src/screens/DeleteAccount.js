import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useAuth } from '../backend/auth';
import { supabase, callFn } from '../backend/supabase';
import { C, Card, Button, Field } from '../ui';
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

  const list = (items) => items.map((t) => <Text key={t} style={{ color: C.text, marginTop: 6, lineHeight: 20 }}>•  {t}</Text>);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Delete account" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: C.text, fontSize: 15, lineHeight: 22 }}>
          This permanently deletes your Positive Rate account{auth?.session?.user?.email ? ` (${auth.session.user.email})` : ''}. It can't be undone.
        </Text>
        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '800', color: C.text }}>What we delete</Text>
          {list(GOES)}
        </Card>
        <Card style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '800', color: C.text }}>What we keep</Text>
          {list(STAYS)}
        </Card>
        <Text style={{ color: C.sub, marginTop: 12, lineHeight: 20 }}>
          If you have a confirmed lesson coming up, cancel or finish it first. If lesson pay is still waiting to be sent to you, set up payouts first so you don't lose it.
        </Text>
        <View style={{ marginTop: 18 }}>
          <Field label="Type DELETE to confirm" value={typed} onChangeText={setTyped} placeholder="DELETE" />
        </View>
        {!!err && <Text style={{ color: '#B91C1C', fontWeight: '700', marginBottom: 12 }}>{err}</Text>}
        <Button title={busy ? 'Deleting…' : 'Delete my account'} onPress={go} disabled={!ready || busy} style={{ backgroundColor: ready ? '#B91C1C' : undefined }} />
      </ScrollView>
    </View>
  );
}
