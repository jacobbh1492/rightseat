import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { C, Button, Icon, Logo } from '../ui';
import { useAuth } from '../backend/auth';

const RESEND_SECONDS = 30;

// Email + 6-digit code. mode 'new' (create account, asks for a name) or 'existing' (log in).
// Used at the end of onboarding, from Account, and whenever a signed-out user tries to book.
export default function SignIn({ mode, title, subtitle, askName, step, onDone, onCancel, onSwitch }) {
  const isNew = mode ? mode === 'new' : askName !== false;
  const { sendCode, verifyCode } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [wait, setWait] = useState(0);
  const codeRef = useRef(null);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async () => {
    setBusy(true); setErr('');
    try { await sendCode(email); setSent(true); setCode(''); setWait(RESEND_SECONDS); setTimeout(() => codeRef.current?.focus(), 250); }
    catch (e) { setErr(friendly(e)); }
    setBusy(false);
  };
  const verify = async (value = code) => {
    if (value.length < 6) return;
    setBusy(true); setErr('');
    try { await verifyCode(email, value); await onDone?.({ name: name.trim() }); }
    catch (e) { setErr(friendly(e)); setBusy(false); }
  };
  const heading = sent ? 'Enter your code' : title || (isNew ? 'Create your account' : 'Welcome back');
  const lede = sent ? `We sent a 6-digit code to ${email.trim()}.` : subtitle || (isNew ? 'Last step. We’ll email you a 6-digit code. No password needed.' : 'Enter your email and we’ll send you a 6-digit code.');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={a.top}>
        {onCancel ? (
          <Pressable onPress={sent ? () => { setSent(false); setCode(''); setErr(''); } : onCancel} style={a.back} accessibilityRole="button" accessibilityLabel="Back">
            <Icon name="back" size={24} color={C.navy} />
          </Pressable>
        ) : <View style={a.back} />}
        {step ? (
          <>
            <View style={{ flex: 1, flexDirection: 'row', paddingRight: 8 }}>
              {Array.from({ length: step.of }, (_, i) => <View key={i} style={[a.seg, i < step.n && { backgroundColor: C.amber }]} />)}
            </View>
            <Text style={a.count}>{step.n} of {step.of}</Text>
          </>
        ) : <Text style={a.navTitle}>{isNew ? 'Create account' : 'Log in'}</Text>}
        {!step && <View style={a.back} />}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {!isNew && !sent ? <View style={{ marginRight: 12 }}><Logo size={40} /></View> : null}
          <Text style={a.q} accessibilityRole="header">{heading}</Text>
        </View>
        <Text style={a.qs}>{lede}</Text>

        {!sent ? (
          <>
            {isNew && (
              <>
                <Text style={a.label}>Your name</Text>
                <TextInput style={a.input} value={name} onChangeText={setName} placeholder="e.g. Alex Rivera" placeholderTextColor={C.placeholder}
                  autoComplete="name" textContentType="name" returnKeyType="next" accessibilityLabel="Your name" />
              </>
            )}
            <Text style={a.label}>Email</Text>
            <TextInput style={a.input} value={email} onChangeText={setEmail} placeholder="e.g. alex@email.com" placeholderTextColor={C.placeholder}
              autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress"
              returnKeyType="send" onSubmitEditing={() => validEmail && send()} accessibilityLabel="Email" />
            <Button title={busy ? 'Sending…' : 'Email me a code'} disabled={!validEmail || busy || (isNew && !name.trim())} onPress={send} style={{ marginTop: 18 }} />
            {isNew && <Text style={a.legal}>By continuing you agree to the Terms of Service and Privacy Policy.</Text>}
            {onSwitch && (
              <View style={a.switchRow}>
                <Text style={{ color: C.sub, fontSize: 14 }}>{isNew ? 'Already have an account?' : 'New to Positive Rate?'}</Text>
                <Pressable onPress={onSwitch} style={a.link} accessibilityRole="button">
                  <Text style={{ color: C.blue, fontWeight: '700', fontSize: 14 }}>{isNew ? 'Log in' : 'Create an account'}</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : (
          <>
            {/* One real input (so iOS/Android code autofill works) drawn as six boxes. */}
            <Pressable onPress={() => codeRef.current?.focus()} style={a.boxes} accessible accessibilityRole="none" accessibilityLabel={`6-digit code, ${code.length} of 6 entered`}>
              {Array.from({ length: 6 }, (_, i) => {
                const active = i === Math.min(code.length, 5);
                return (
                  <View key={i} style={[a.box, active && a.boxActive, !!err && a.boxErr]}>
                    <Text style={a.boxText}>{code[i] || ''}</Text>
                  </View>
                );
              })}
            </Pressable>
            <TextInput
              ref={codeRef}
              style={a.hidden}
              value={code}
              onChangeText={(t) => { const v = t.replace(/\D/g, '').slice(0, 6); setCode(v); setErr(''); if (v.length === 6) verify(v); }}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              accessibilityLabel="6-digit code"
            />
            {!!err && <Text style={a.err} accessibilityRole="alert" accessibilityLiveRegion="polite">{err}</Text>}
            {busy ? <ActivityIndicator style={{ marginTop: 18 }} color={C.navy} /> : <Button title="Verify" disabled={code.length < 6} onPress={() => verify()} style={{ marginTop: 18 }} />}
            <View style={a.switchRow}>
              <Pressable onPress={send} disabled={busy || wait > 0} style={a.link} accessibilityRole="button" accessibilityState={{ disabled: busy || wait > 0 }}>
                <Text style={{ color: wait > 0 ? C.sub : C.blue, fontWeight: '700' }}>{wait > 0 ? `Resend code in 0:${String(wait).padStart(2, '0')}` : 'Resend code'}</Text>
              </Pressable>
              <Pressable onPress={() => { setSent(false); setCode(''); setErr(''); }} style={a.link} accessibilityRole="button">
                <Text style={{ color: C.blue, fontWeight: '700' }}>Use a different email</Text>
              </Pressable>
            </View>
          </>
        )}
        {!!err && !sent && <Text style={a.err} accessibilityRole="alert" accessibilityLiveRegion="polite">{err}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendly(e) {
  const m = String(e?.message || e);
  if (/expired/i.test(m)) return 'That code expired. Tap Resend code for a new one.';
  if (/invalid/i.test(m)) return 'That code didn’t match. Check the latest email, or resend.';
  if (/rate|too many|seconds/i.test(m)) return 'Too many tries. Wait a minute, then send a new code.';
  if (/network|fetch/i.test(m)) return 'No connection. Check your signal and try again.';
  return m;
}

const a = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingRight: 16, paddingTop: 8, minHeight: 56 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: C.text },
  seg: { flex: 1, height: 5, borderRadius: 999, backgroundColor: C.line, marginRight: 6 },
  count: { fontSize: 13, fontWeight: '700', color: C.sub },
  q: { fontSize: 28, lineHeight: 32, fontWeight: '800', color: C.text, letterSpacing: -0.4, flexShrink: 1 },
  qs: { color: C.sub, fontSize: 15, marginTop: 6, marginBottom: 14, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, minHeight: 50, fontSize: 16, color: C.text },
  legal: { color: C.sub, fontSize: 12, lineHeight: 17, marginTop: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 10 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  box: { width: 48, height: 58, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  boxActive: { borderWidth: 2, borderColor: C.navy },
  boxErr: { borderColor: C.red },
  boxText: { fontSize: 26, fontWeight: '800', color: C.text },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  err: { color: C.red, marginTop: 12, fontWeight: '600', lineHeight: 20 },
});
