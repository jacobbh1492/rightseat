import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { C, Button, Icon } from '../ui';
import { useAuth } from '../backend/auth';

// Email + 6-digit code sign-in. Used at the end of onboarding, from Account, and
// whenever a signed-out user tries to book.
export default function SignIn({ title = 'Create your account', subtitle = 'We’ll email you a 6-digit code. No password needed.', askName = true, onDone, onCancel }) {
  const { sendCode, verifyCode } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const codeRef = useRef(null);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  const send = async () => {
    setBusy(true); setErr('');
    try { await sendCode(email); setSent(true); setTimeout(() => codeRef.current?.focus(), 200); }
    catch (e) { setErr(friendly(e)); }
    setBusy(false);
  };
  const verify = async (value = code) => {
    if (value.length < 6) return;
    setBusy(true); setErr('');
    try { await verifyCode(email, value); await onDone?.({ name: name.trim() }); }
    catch (e) { setErr(friendly(e)); setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={a.top}>
        {onCancel ? <Pressable onPress={sent ? () => { setSent(false); setCode(''); setErr(''); } : onCancel} hitSlop={12} accessibilityLabel="Back"><Icon name="back" size={24} color={C.text} /></Pressable> : <View />}
      </View>
      <View style={{ padding: 20 }}>
        <Text style={a.q}>{sent ? 'Check your email' : title}</Text>
        <Text style={a.qs}>{sent ? `Enter the 6-digit code we sent to ${email.trim()}.` : subtitle}</Text>

        {!sent ? (
          <>
            {askName && (
              <>
                <Text style={a.label}>Your name</Text>
                <TextInput style={a.input} value={name} onChangeText={setName} placeholder="First and last name" autoComplete="name" textContentType="name" returnKeyType="next" />
              </>
            )}
            <Text style={a.label}>Email</Text>
            <TextInput style={a.input} value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="send" onSubmitEditing={() => validEmail && send()} />
            <Button title={busy ? 'Sending…' : 'Email me a code'} disabled={!validEmail || busy || (askName && !name.trim())} onPress={send} style={{ marginTop: 18 }} />
          </>
        ) : (
          <>
            <TextInput
              ref={codeRef}
              style={[a.input, a.code]}
              value={code}
              onChangeText={(t) => { const v = t.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) verify(v); }}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              placeholder="••••••"
              maxLength={6}
              accessibilityLabel="6-digit code"
            />
            {busy ? <ActivityIndicator style={{ marginTop: 18 }} color={C.blue} /> : <Button title="Verify" disabled={code.length < 6} onPress={() => verify()} style={{ marginTop: 18 }} />}
            <Pressable onPress={send} disabled={busy} style={{ alignItems: 'center', marginTop: 16 }} accessibilityRole="button">
              <Text style={{ color: C.blue, fontWeight: '700' }}>Send a new code</Text>
            </Pressable>
          </>
        )}
        {!!err && <Text style={a.err} accessibilityLiveRegion="polite">{err}</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

function friendly(e) {
  const m = String(e?.message || e);
  if (/expired|invalid/i.test(m)) return 'That code didn’t work. Check it, or send a new one.';
  if (/rate|too many|seconds/i.test(m)) return 'Too many tries. Wait a minute, then send a new code.';
  if (/network|fetch/i.test(m)) return 'No connection. Check your signal and try again.';
  return m;
}

const a = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  q: { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: -0.4 },
  qs: { color: C.sub, fontSize: 15, marginTop: 6, marginBottom: 18, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '800', color: C.sub, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#D7DEE8', paddingHorizontal: 14, paddingVertical: 14, fontSize: 17, color: C.text },
  code: { fontSize: 30, letterSpacing: 12, textAlign: 'center', fontWeight: '800' },
  err: { color: '#B91C1C', marginTop: 14, fontWeight: '600' },
});
