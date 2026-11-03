import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { useAuth } from '../backend/auth';
import { bookingAction, setUpPayouts, checkPayouts, submitDebrief } from '../backend/bookings';
import { quote } from '../pricing';
import { money2, r2 } from '../logic';
import { C, Card, Button, SectionTitle, Row, Tag, Field, Stepper, Toggle } from '../ui';
import { Header } from './Details';
import { useLibrary } from '../library/useLibrary';
import { ReviewChip } from './Library';
import { CalendarCard } from './Availability';

// Instructor (and plane owner) side of live bookings: answer requests, close out
// lessons with Hobbs time, see what you earned, and set up payouts.

const CLOSE_OUT_EARLY_MIN = 15; // matches the server: close-out opens 15 min before start
const canCloseOut = (r) => new Date(r.when).getTime() <= Date.now() + CLOSE_OUT_EARLY_MIN * 60 * 1000;
const role = (r) => (r.role === 'owner' ? 'owner' : 'instructor');

export function Teaching({ nav, asTab }) {
  const { teaching, refreshLive, myPlaneIds } = useStore();
  const auth = useAuth();
  const [busy, setBusy] = useState(null); // `${id}:${action}`
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const ready = !!auth?.account?.payouts_ready;

  const lib = useLibrary();
  const refresh = async () => {
    setRefreshing(true);
    try { await Promise.all([refreshLive(), lib.refresh()]); } catch (e) { setErr(e.message); }
    setRefreshing(false);
  };
  useEffect(() => { refresh(); }, []);
  // Instructors can assign a pre-flight review from the Learning Library.
  const review = (r) => {
    if (r.role !== 'cfi') return null;
    const rv = lib.reviews.find((x) => x.bookingId === r.id);
    if (rv) return <ReviewChip review={rv} onPress={() => nav.push('AssignReview', { bookingId: r.id })} />;
    return (
      <Pressable onPress={() => nav.push('AssignReview', { bookingId: r.id })} style={ts.assign} accessibilityRole="button">
        <Text style={{ color: C.blue, fontWeight: '700' }}>+ Assign pre-flight review</Text>
      </Pressable>
    );
  };

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
  const needDebrief = teaching.filter((r) => r.payout === 'debrief');
  const waitingOnDebriefs = needDebrief.reduce((a, r) => a + (r.awaitingDebrief || 0), 0);

  // A shared rental shows both pilots.
  const sharedWith = (r) => (r.split && r.split.status === 'accepted' ? ` + ${r.split.partnerName.split(' ')[0]}` : '');
  const who = (r) => `${r.studentName}${sharedWith(r)}${r.tail ? ` · ${r.tail}` : ''}`;
  const hours = (r) => `${r.flightHours} hr flight${r.groundHours ? ` + ${r.groundHours} hr ground` : ''}`;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {!asTab && <Header nav={nav} title="Lesson requests" />}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: asTab ? 110 : 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {asTab && <Text style={ts.h1}>Schedule</Text>}
        {asTab && auth?.session && <CalendarCard nav={nav} />}
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

        {auth?.session && needDebrief.length > 0 && (
          <Pressable onPress={() => nav.push('WriteDebrief', { id: needDebrief[0].id })} accessibilityRole="button">
            <Card style={{ borderWidth: 1.5, borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }}>
              <Text style={ts.title}>Write {needDebrief.length > 1 ? `${needDebrief.length} debriefs` : 'your debrief'} to get paid ›</Text>
              <Text style={ts.sub}>{money2(waitingOnDebriefs)} is waiting. Your pay for a lesson is released once its debrief is written.</Text>
            </Card>
          </Pressable>
        )}
        {auth?.session && (myPlaneIds || []).length > 0 && (
          <Pressable onPress={() => nav.push('Checkouts')} accessibilityRole="button">
            <Card><Text style={ts.title}>Renter checkouts ›</Text><Text style={ts.sub}>Approve who can rent your plane{myPlaneIds.length > 1 ? 's' : ''} solo.</Text></Card>
          </Pressable>
        )}
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
            {r.split?.pending && <Text style={ts.warn}>Shared flight: waiting for {r.split.partnerName.split(' ')[0]} to accept and pay their deposit.</Text>}
            {r.split?.status === 'accepted' && <Text style={ts.sub}>Shared flight: {r.split.bookerName.split(' ')[0]} {r.split.bookerPct}% · {r.split.partnerName.split(' ')[0]} {r.split.partnerPct}%. Both pilots are checked like solo renters.</Text>}
            {review(r)}
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <Button title={busy === `${r.id}:decline` ? 'Declining…' : 'Decline'} variant="outline" disabled={!!busy} style={{ flex: 0.6, marginRight: 8, paddingVertical: 10 }}
                onPress={() => act(r, 'decline', { reason: `Declined by ${role(r)}` })} />
              <Button title={busy === `${r.id}:confirm` ? 'Confirming…' : 'Confirm'} disabled={!!busy || !r.cardReady || !!r.split?.pending} style={{ flex: 1, paddingVertical: 10 }}
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
            {review(r)}
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
                <Row label={r.split?.status === 'accepted' ? 'Pilots paid' : 'Student paid'} value={money2(r.total)} />
                <Row bold label="Your share" value={money2(r.share || 0)} />
                {r.payout === 'debrief' ? (
                  <Button title={`Write debrief to get paid ${money2(r.awaitingDebrief || r.share || 0)}`} style={{ marginTop: 8, paddingVertical: 10 }}
                    onPress={() => nav.push('WriteDebrief', { id: r.id })} />
                ) : (
                  <Text style={[ts.sub, { color: r.payout === 'paid' ? C.green : '#B45309', fontWeight: '700' }]}>
                    {r.payout === 'paid' ? 'Sent to your bank' : 'Held until you set up payouts'}
                  </Text>
                )}
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  if (!r) return null;

  const fh = hobbsOut !== '' && hobbsIn !== '' ? r2(Math.round((+hobbsIn - +hobbsOut) * 10) / 10) : 0;
  const valid = fh >= 0.1 && fh <= 8;
  const i = r.quote?.inputs;
  const est = valid && i ? quote({ cfi: i.cfi, plane: i.plane, affiliation: i.affiliation, cfiPro: i.cfiPro, repeat: i.repeat, prepaid: i.prepaid, flightHours: fh, groundHours: r.cfiId ? ground : 0 }) : null;

  const debriefDone = !!(debrief.wentWell.trim() && debrief.needsWork.trim() && debrief.nextPlan.trim());
  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      // On a lesson, the debrief goes with the close-out: the server saves it to the
      // student's training record and releases the instructor's pay. Without it, the pay waits.
      const res = await bookingAction(r.id, 'complete', {
        flightHours: fh, groundHours: r.cfiId ? ground : 0, night, xc, instrumentHours: r.cfiId ? inst : 0,
        debrief: r.role === 'cfi' && debriefDone ? { ...debrief, flownOn: r.when.slice(0, 10) } : undefined,
      });
      setResult(res);
      refreshLive().catch(() => {});
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (result) {
    const mine = r.role === 'owner' ? result.split.owner : result.split.cfi;
    const held = (result.held || []).includes(r.role === 'owner' ? 'owner' : 'cfi') || (result.debriefReleased?.held > 0 && r.role === 'cfi');
    const waiting = r.role === 'cfi' && !result.debriefReleased;
    const sh = result.shared;
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Lesson closed out" />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Card>
            <Text style={{ fontWeight: '900', fontSize: 20, color: C.text }}>Done ✓</Text>
            <Text style={[ts.sub, { marginTop: 4 }]}>
              {sh ? `${r.studentName.split(' ')[0]} and ${r.split?.partnerName?.split(' ')[0] || 'the other pilot'} were charged their shares` : `${r.studentName}’s card was charged`} for {fh} hr{r.cfiId && ground ? ` + ${ground} hr ground` : ''}.
            </Text>
            <View style={{ marginTop: 10 }}>
              <Row label={sh ? 'Pilots paid' : 'Student paid'} value={money2(result.total)} />
              {sh && <Row label={`  ${r.studentName.split(' ')[0]} · ${r.split?.bookerPct}%`} value={money2(sh.bookerAmount + (sh.coveredByBooker || 0))} />}
              {sh && <Row label={`  ${r.split?.partnerName?.split(' ')[0] || 'Other pilot'} · ${r.split?.partnerPct}%`} value={money2(sh.coveredByBooker ? sh.partnerShare - sh.coveredByBooker : sh.partnerShare)} />}
              <Row bold label="Your share" value={money2(mine)} />
            </View>
            <Text style={[ts.sub, { marginTop: 8, color: held || waiting ? '#B45309' : C.green, fontWeight: '700' }]}>
              {waiting ? 'Waiting for your debrief. Write it to release your pay.' : held ? 'Held for you until you set up payouts.' : 'On its way to your bank (usually 2 business days).'}
            </Text>
            {r.role === 'cfi' && result.debriefReleased && <Text style={[ts.sub, { marginTop: 8 }]}>Debrief saved to {r.studentName.split(' ')[0]}’s training record.</Text>}
            {waiting && <Button title="Write debrief now" style={{ marginTop: 14 }} onPress={() => nav.replace ? nav.replace('WriteDebrief', { id: r.id }) : nav.push('WriteDebrief', { id: r.id })} />}
            <Button title="Done" variant={waiting ? 'outline' : undefined} style={{ marginTop: waiting ? 8 : 14 }} onPress={nav.pop} />
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
            <SectionTitle>Debrief</SectionTitle>
            <Text style={[ts.sub, { marginBottom: 6 }]}>Your pay for this lesson is released once the debrief is written (all three parts). It’s saved to the student’s training record and locked once they read it. You can also write it later.</Text>
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
        <Button title={busy ? 'Charging…' : !valid ? 'Enter Hobbs times' : r.role === 'cfi' && !debriefDone ? `Close out ${fh} hr · debrief later` : `Close out ${fh} hr & charge`} disabled={busy || !valid} style={{ flex: 1 }} onPress={submit} />
      </View>
    </View>
  );
}

// Write the debrief for a closed-out lesson; the server saves it and releases the pay.
export function WriteDebrief({ nav, params }) {
  const { teaching, refreshLive } = useStore();
  const r = teaching.find((x) => x.id === params.id);
  const [d, setD] = useState({ wentWell: '', needsWork: '', nextPlan: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  useEffect(() => { if (!r) refreshLive().catch(() => {}); }, []);
  if (!r) return (<View style={{ flex: 1, backgroundColor: C.bg }}><Header nav={nav} title="Debrief" /><Text style={[ts.empty, { padding: 24, textAlign: 'center' }]}>Loading the lesson…</Text></View>);
  const ok = !!(d.wentWell.trim() && d.needsWork.trim() && d.nextPlan.trim());
  const amount = r.awaitingDebrief || r.share || 0;
  const submit = async () => {
    setErr(''); setBusy(true);
    try { setDone(await submitDebrief(r.id, { ...d, flownOn: r.when.slice(0, 10) })); refreshLive().catch(() => {}); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  if (done || r.payout === 'paid' || r.payout === 'held') {
    const heldNow = done ? done.held > 0 : r.payout === 'held';
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Debrief" />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Card>
            <Text style={{ fontWeight: '900', fontSize: 20, color: C.text }}>Debrief saved ✓</Text>
            <Text style={[ts.sub, { marginTop: 4 }]}>It’s in {r.studentName.split(' ')[0]}’s training record.</Text>
            <Text style={[ts.sub, { marginTop: 8, color: heldNow ? '#B45309' : C.green, fontWeight: '700' }]}>
              {heldNow ? `${money2(amount)} is held for you until you set up payouts.` : `${money2(done ? done.paid || amount : amount)} is on its way to your bank (usually 2 business days).`}
            </Text>
            <Button title="Done" style={{ marginTop: 14 }} onPress={nav.pop} />
          </Card>
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Write debrief" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
        <Card>
          <Text style={ts.title}>{r.goal}</Text>
          <Text style={ts.sub}>{r.date} · {r.studentName}{r.tail ? ` · ${r.tail}` : ''}{r.actualHobbs ? ` · ${r.actualHobbs} hr` : ''}</Text>
          <Text style={[ts.sub, { color: '#B45309', fontWeight: '700', marginTop: 6 }]}>{money2(amount)} is released when you save this.</Text>
        </Card>
        <Field label="What went well" multiline value={d.wentWell} onChangeText={(t) => setD((x) => ({ ...x, wentWell: t }))} placeholder="Smooth radio calls, good energy management on final" />
        <Field label="Needs work" multiline value={d.needsWork} onChangeText={(t) => setD((x) => ({ ...x, needsWork: t }))} placeholder="Holding altitude in steep turns" />
        <Field label="Next lesson" multiline value={d.nextPlan} onChangeText={(t) => setD((x) => ({ ...x, nextPlan: t }))} placeholder="Slow flight and power-off stalls" />
        <Text style={ts.sub}>Saved to the student’s training record. Once they read it, it’s locked (you can add an amendment).</Text>
        {!!err && <Text style={ts.err} accessibilityLiveRegion="polite">{err}</Text>}
      </ScrollView>
      <View style={ts.cta}>
        <Button title={busy ? 'Saving…' : ok ? `Save debrief & get paid ${money2(amount)}` : 'Fill in all three parts'} disabled={busy || !ok} style={{ flex: 1 }} onPress={submit} />
      </View>
    </View>
  );
}

const ts = StyleSheet.create({
  assign: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9DBDF5', backgroundColor: C.sky, marginTop: 10 },
  h1:{ fontSize: 28, fontWeight: '900', color: C.text, marginTop: 6, marginBottom: 4 },
  kicker: { color: C.sub, fontSize: 12, fontWeight: '700' },
  title: { fontWeight: '900', color: C.text, fontSize: 16, flex: 1 },
  sub: { color: C.sub, marginTop: 2, fontSize: 13, lineHeight: 18 },
  warn: { color: '#B45309', marginTop: 6, fontSize: 13, fontWeight: '600' },
  err: { color: '#B91C1C', fontWeight: '600', marginTop: 10 },
  empty: { color: C.sub },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: 16, paddingBottom: 28, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
