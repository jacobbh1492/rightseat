import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { useAuth } from '../backend/auth';
import { bookingAction, setUpPayouts, checkPayouts, writeDebrief } from '../backend/bookings';
import { quote } from '../pricing';
import { money2, r2 } from '../logic';
import { C, Card, Button, SectionTitle, Row, Tag, Field, Stepper, Toggle } from '../ui';
import { Header } from './Details';

// Instructor (and plane owner) side of live bookings: answer requests, close out
// lessons with Hobbs time, see what you earned, and set up payouts.

const CLOSE_OUT_EARLY_MIN = 15; // matches the server: close-out opens 15 min before start
const canCloseOut = (r) => new Date(r.when).getTime() <= Date.now() + CLOSE_OUT_EARLY_MIN * 60 * 1000;
const role = (r) => (r.role === 'owner' ? 'owner' : 'instructor');

export function Teaching({ nav, asTab }) {
  const { teaching, refreshLive } = useStore();
  const auth = useAuth();
  const [busy, setBusy] = useState(null); // `${id}:${action}`
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const ready = !!auth?.account?.payouts_ready;

  const refresh = async () => {
    setRefreshing(true);
    try { await refreshLive(); } catch (e) { setErr(e.message); }
    setRefreshing(false);
  };
  useEffect(() => { refresh(); }, []);

  const act = async (r, action, extra) => {
    setErr(''); setBusy(`${r.id}:${action}`);
    try { await bookingAction(r.id, action, extra); await refreshLive(); }
    catch (e) { setErr(e.message); }
    setBusy(null);
  };

  const payouts = async () => {
    setErr(''); setPayoutBusy(true);
    try { await setUpPayouts(); await auth.refreshAccount(); }
    catch (e) { setErr(e.message); }
    setPayoutBusy(false);
  };
  const recheck = async () => {
    setPayoutBusy(true);
    try { await checkPayouts(); await auth.refreshAccount(); } catch (e) { setErr(e.message); }
    setPayoutBusy(false);
  };

  const requests = teaching.filter((r) => r.status === 'Pending').sort((a, b) => new Date(a.when) - new Date(b.when));
  const upcoming = teaching.filter((r) => r.status === 'Confirmed').sort((a, b) => new Date(a.when) - new Date(b.when));
  const done = teaching.filter((r) => ['Completed', 'Cancelled'].includes(r.status)).sort((a, b) => new Date(b.when) - new Date(a.when)).slice(0, asTab ? 5 : 20);
  const held = teaching.filter((r) => r.payout === 'held').reduce((a, r) => a + (r.share || 0), 0);

  const who = (r) => `${r.studentName}${r.tail ? ` · ${r.tail}` : ''}`;
  const hours = (r) => `${r.flightHours} hr flight${r.groundHours ? ` + ${r.groundHours} hr ground` : ''}`;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {!asTab && <Header nav={nav} title="Lesson requests" />}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: asTab ? 110 : 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {asTab && <Text style={ts.h1}>Schedule</Text>}
        {asTab && !auth?.session && (
          <Card style={{ borderWidth: 1.5, borderColor: C.blue }}>
            <Text style={ts.title}>Sign in to see your lessons</Text>
            <Text style={ts.sub}>Lesson requests from students show up here to confirm, then close out after the flight.</Text>
            <Button title="Sign in" style={{ marginTop: 12 }} onPress={() => nav.push('SignIn')} />
          </Card>
        )}
        {asTab && auth?.session && !ready && (
          <Pressable onPress={() => nav.goTab('Earnings')} accessibilityRole="button">
            <Card style={{ borderWidth: 1.5, borderColor: C.blue }}>
              <Text style={ts.title}>Set up payouts to get paid ›</Text>
              <Text style={ts.sub}>{held > 0 ? `${money2(held)} is waiting for you. ` : ''}Takes about 5 minutes in Earnings.</Text>
            </Card>
          </Pressable>
        )}
        {/* Payouts */}
        {!asTab && <Card style={ready ? null : { borderWidth: 1.5, borderColor: C.blue }}>
          <Text style={ts.kicker}>PAYOUTS</Text>
          {ready ? (
            <>
              <Text style={ts.title}>Payouts are on ✓</Text>
              <Text style={ts.sub}>Your share is sent to your bank automatically when you close out a lesson.</Text>
            </>
          ) : (
            <>
              <Text style={ts.title}>Set up payouts to get paid</Text>
              <Text style={ts.sub}>
                Stripe handles this securely: your name, date of birth, last 4 of your SSN and a bank account. Takes about 5 minutes.
                {held > 0 ? ` ${money2(held)} is waiting for you.` : ''}
              </Text>
              <Button title={payoutBusy ? 'Opening Stripe…' : 'Set up payouts'} disabled={payoutBusy} style={{ marginTop: 12 }} onPress={payouts} />
              <Pressable onPress={recheck} style={{ marginTop: 10, alignSelf: 'center' }} accessibilityRole="button">
                <Text style={{ color: C.blue, fontWeight: '700' }}>Already finished? Check again</Text>
              </Pressable>
            </>
          )}
        </Card>}

        {!!err && <Text style={ts.err} accessibilityLiveRegion="polite">{err}</Text>}

        {(!asTab || auth?.session) && <>
        <SectionTitle>New requests</SectionTitle>
        {requests.length === 0 && <Text style={ts.empty}>No new requests. Pull down to refresh.</Text>}
        {requests.map((r) => (
          <Card key={r.id}>
            <View style={ts.rowTop}>
              <Text style={ts.title}>{r.goal}</Text>
              <Tag label="Request" color="#B45309" bg="#FEF3C7" />
            </View>
            <Text style={ts.sub}>{r.date} · {r.time}</Text>
            <Text style={ts.sub}>{who(r)} · {hours(r)}</Text>
            <Text style={[ts.sub, { color: C.text, fontWeight: '700', marginTop: 6 }]}>You earn about {money2(r.share || 0)}</Text>
            <Pressable onPress={() => nav.push('Chat', { key: r.studentId, other: r.studentId, name: r.studentName })} style={{ marginTop: 6 }} accessibilityRole="button">
              <Text style={{ color: C.blue, fontWeight: '700' }}>Message {r.studentName.split(' ')[0]} ›</Text>
            </Pressable>
            {!r.cardReady && <Text style={ts.warn}>Waiting for the student to finish adding their card.</Text>}
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <Button title={busy === `${r.id}:decline` ? 'Declining…' : 'Decline'} variant="outline" disabled={!!busy} style={{ flex: 0.6, marginRight: 8, paddingVertical: 10 }}
                onPress={() => act(r, 'decline', { reason: `Declined by ${role(r)}` })} />
              <Button title={busy === `${r.id}:confirm` ? 'Confirming…' : 'Confirm'} disabled={!!busy || !r.cardReady} style={{ flex: 1, paddingVertical: 10 }}
                onPress={() => act(r, 'confirm')} />
            </View>
          </Card>
        ))}

        <SectionTitle>Upcoming</SectionTitle>
        {upcoming.length === 0 && <Text style={ts.empty}>Nothing confirmed yet.</Text>}
        {upcoming.map((r) => (
          <Card key={r.id}>
            <View style={ts.rowTop}>
              <Text style={ts.title}>{r.goal}</Text>
              <Tag label="Confirmed" color={C.green} bg="#E3F7EF" />
            </View>
            <Text style={ts.sub}>{r.date} · {r.time}</Text>
            <Text style={ts.sub}>{who(r)} · {hours(r)} booked</Text>
            <Pressable onPress={() => nav.push('Chat', { key: r.studentId, other: r.studentId, name: r.studentName })} style={{ marginTop: 6 }} accessibilityRole="button">
              <Text style={{ color: C.blue, fontWeight: '700' }}>Message {r.studentName.split(' ')[0]} ›</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <Button title={busy === `${r.id}:cancel` ? 'Cancelling…' : 'Cancel'} variant="outline" disabled={!!busy} style={{ flex: 0.6, marginRight: 8, paddingVertical: 10 }}
                onPress={() => act(r, 'cancel', { reason: `Cancelled by ${role(r)}` })} />
              <Button title={canCloseOut(r) ? 'Close out' : 'Close out after start'} disabled={!!busy || !canCloseOut(r)} style={{ flex: 1, paddingVertical: 10 }}
                onPress={() => nav.push('LiveCloseOut', { id: r.id })} />
            </View>
            {!canCloseOut(r) && <Text style={[ts.empty, { marginTop: 6, fontSize: 12 }]}>Opens 15 minutes before the lesson starts. Cancelling as the {role(r)} is always free for the student.</Text>}
          </Card>
        ))}

        <SectionTitle>Recent</SectionTitle>
        {asTab && done.length > 0 && <Pressable onPress={() => nav.goTab('Earnings')} style={{ marginBottom: 8 }} accessibilityRole="button"><Text style={{ color: C.blue, fontWeight: '700' }}>All lessons and earnings ›</Text></Pressable>}
        {done.length === 0 && <Text style={ts.empty}>Completed lessons show here with what you earned.</Text>}
        {done.map((r) => (
          <Card key={r.id}>
            <View style={ts.rowTop}>
              <Text style={ts.title}>{r.goal}</Text>
              <Tag label={r.status} color={r.status === 'Completed' ? C.green : C.sub} bg={r.status === 'Completed' ? '#E3F7EF' : '#EEF1F5'} />
            </View>
            <Text style={ts.sub}>{r.date} · {who(r)}{r.actualHobbs ? ` · ${r.actualHobbs} hr Hobbs` : ''}</Text>
            {r.status === 'Completed' && (
              <>
                <Row label="Student paid" value={money2(r.total)} />
                <Row bold label="Your share" value={money2(r.share || 0)} />
                <Text style={[ts.sub, { color: r.payout === 'paid' ? C.green : '#B45309', fontWeight: '700' }]}>
                  {r.payout === 'paid' ? 'Sent to your bank' : 'Held until you set up payouts'}
                </Text>
              </>
            )}
            {r.status === 'Cancelled' && <Text style={ts.sub}>{r.cancel?.reason}{r.cancel?.fee ? ` · late fee ${money2(r.cancel.fee)}` : ''}</Text>}
          </Card>
        ))}
        </>}
      </ScrollView>
    </View>
  );
}

export function LiveCloseOut({ nav, params }) {
  const { teaching, refreshLive } = useStore();
  const r = teaching.find((x) => x.id === params.id);
  const [hobbsOut, setOut] = useState('');
  const [hobbsIn, setIn] = useState('');
  const [ground, setGround] = useState(r?.groundHours || 0);
  const [night, setNight] = useState(/night/i.test(r?.goal || ''));
  const [xc, setXc] = useState(/cross/i.test(r?.goal || ''));
  const [inst, setInst] = useState(0);
  const [debrief, setDebrief] = useState({ wentWell: '', needsWork: '', nextPlan: '' });
  const [debriefNote, setDebriefNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  if (!r) return null;

  const fh = hobbsOut !== '' && hobbsIn !== '' ? r2(Math.round((+hobbsIn - +hobbsOut) * 10) / 10) : 0;
  const valid = fh >= 0.1 && fh <= 8;
  const i = r.quote?.inputs;
  const est = valid && i ? quote({ cfi: i.cfi, plane: i.plane, affiliation: i.affiliation, cfiPro: i.cfiPro, repeat: i.repeat, prepaid: i.prepaid, flightHours: fh, groundHours: r.cfiId ? ground : 0 }) : null;

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const res = await bookingAction(r.id, 'complete', { flightHours: fh, groundHours: r.cfiId ? ground : 0, night, xc, instrumentHours: r.cfiId ? inst : 0 });
      setResult(res);
      // The debrief goes to the student's training record (instructors only).
      if (r.role === 'cfi' && (debrief.wentWell || debrief.needsWork || debrief.nextPlan)) {
        try {
          await writeDebrief({ bookingId: r.id, studentId: r.studentId, cfiId: r.cfiId, flownOn: r.when.slice(0, 10), ...debrief });
          setDebriefNote('Debrief saved to the student’s training record.');
        } catch (e) { setDebriefNote(`The charge went through, but the debrief didn’t save: ${e.message}`); }
      }
      refreshLive().catch(() => {});
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (result) {
    const mine = r.role === 'owner' ? result.split.owner : result.split.cfi;
    const held = (result.held || []).includes(r.role === 'owner' ? 'owner' : 'cfi');
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Lesson closed out" />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Card>
            <Text style={{ fontWeight: '900', fontSize: 20, color: C.text }}>Done ✓</Text>
            <Text style={[ts.sub, { marginTop: 4 }]}>{r.studentName}’s card was charged for {fh} hr{r.cfiId && ground ? ` + ${ground} hr ground` : ''}.</Text>
            <View style={{ marginTop: 10 }}>
              <Row label="Student paid" value={money2(result.total)} />
              <Row bold label="Your share" value={money2(mine)} />
            </View>
            <Text style={[ts.sub, { marginTop: 8, color: held ? '#B45309' : C.green, fontWeight: '700' }]}>
              {held ? 'Held for you until you set up payouts.' : 'On its way to your bank (usually 2 business days).'}
            </Text>
            {!!debriefNote && <Text style={[ts.sub, { marginTop: 8 }]}>{debriefNote}</Text>}
            <Button title="Done" style={{ marginTop: 14 }} onPress={nav.pop} />
          </Card>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Close out" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
        <Card>
          <Text style={ts.title}>{r.goal}</Text>
          <Text style={ts.sub}>{r.date} · {r.time} · {r.studentName}{r.tail ? ` · ${r.tail}` : ''}</Text>
          <Text style={ts.sub}>Booked: {r.flightHours} hr{r.groundHours ? ` + ${r.groundHours} hr ground` : ''}</Text>
        </Card>
        <SectionTitle>Hobbs</SectionTitle>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Hobbs out" keyboardType="decimal-pad" value={hobbsOut} onChangeText={setOut} placeholder="e.g. 4521.3" /></View>
          <View style={{ flex: 1 }}><Field label="Hobbs in" keyboardType="decimal-pad" value={hobbsIn} onChangeText={setIn} placeholder="e.g. 4522.7" /></View>
        </View>
        <Text style={{ color: valid || !hobbsIn ? C.navy : '#B91C1C', fontWeight: '800', marginBottom: 6 }}>
          {hobbsIn && hobbsOut ? (valid ? `Flight time: ${fh} hr` : 'Check the Hobbs times (0.1 to 8.0 hr).') : 'Enter Hobbs out and in.'}
        </Text>
        {r.cfiId ? <Card><Stepper label="Ground instruction" value={ground} onChange={setGround} /></Card> : null}

        <SectionTitle>Log to the training record</SectionTitle>
        <Toggle label="Night" value={night} onValueChange={setNight} />
        <Toggle label="Cross-country" value={xc} onValueChange={setXc} />
        {r.cfiId ? <Card><Stepper label="Simulated instrument" value={inst} onChange={(v) => setInst(Math.min(v, fh || v))} step={0.1} /></Card> : null}

        {r.role === 'cfi' && (
          <>
            <SectionTitle>Debrief (optional)</SectionTitle>
            <Text style={[ts.sub, { marginBottom: 6 }]}>Saved to the student’s training record. Once they read it, it’s locked.</Text>
            <Field label="What went well" multiline value={debrief.wentWell} onChangeText={(t) => setDebrief((d) => ({ ...d, wentWell: t }))} placeholder="Smooth radio calls, good energy management on final" />
            <Field label="Needs work" multiline value={debrief.needsWork} onChangeText={(t) => setDebrief((d) => ({ ...d, needsWork: t }))} placeholder="Holding altitude in steep turns" />
            <Field label="Next lesson" multiline value={debrief.nextPlan} onChangeText={(t) => setDebrief((d) => ({ ...d, nextPlan: t }))} placeholder="Slow flight and power-off stalls" />
          </>
        )}

        {est && (
          <>
            <SectionTitle>The student will be charged</SectionTitle>
            <Card>
              {est.instruction > 0 && <Row label={`Instruction · ${fh} hr`} value={money2(est.instruction)} />}
              {est.ground > 0 && <Row label={`Ground · ${ground} hr`} value={money2(est.ground)} />}
              {est.aircraft > 0 && <Row label={`Plane · ${fh} hr`} value={money2(est.aircraft)} />}
              {est.bookingFee > 0 && <Row label="Booking fee" value={money2(est.bookingFee)} />}
              <Row bold label="Total" value={money2(est.total)} />
              <View style={{ height: 1, backgroundColor: C.line, marginVertical: 8 }} />
              <Row bold label="Your share" value={money2(r.role === 'owner' ? est.split.owner : est.split.cfi)} />
            </Card>
          </>
        )}
        {!!err && <Text style={ts.err} accessibilityLiveRegion="polite">{err}</Text>}
      </ScrollView>
      <View style={ts.cta}>
        <Button title={busy ? 'Charging…' : valid ? `Close out ${fh} hr & charge` : 'Enter Hobbs times'} disabled={busy || !valid} style={{ flex: 1 }} onPress={submit} />
      </View>
    </View>
  );
}

const ts = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '900', color: C.text, marginTop: 6, marginBottom: 4 },
  kicker: { color: C.sub, fontSize: 12, fontWeight: '700' },
  title: { fontWeight: '900', color: C.text, fontSize: 16, flex: 1 },
  sub: { color: C.sub, marginTop: 2, fontSize: 13, lineHeight: 18 },
  warn: { color: '#B45309', marginTop: 6, fontSize: 13, fontWeight: '600' },
  err: { color: '#B91C1C', fontWeight: '600', marginTop: 10 },
  empty: { color: C.sub },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: 16, paddingBottom: 28, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
