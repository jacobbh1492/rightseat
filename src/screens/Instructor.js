import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { useAuth } from '../backend/auth';
import { setUpPayouts, checkPayouts, fetchDebriefsIWrote, hoursFromFlights } from '../backend/bookings';
import { money2 } from '../logic';
import { C, Card, Button, SectionTitle, Row, Tag, Avatar } from '../ui';
import { Header } from './Details';
import { Teaching } from './Teaching';

// Instructor mode: the tabs a CFI (or plane owner) sees instead of the student ones.

export function Schedule({ nav }) {
  return <Teaching nav={nav} asTab />;
}

const initials = (n = '') => n.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const COLORS = ['#1F6FEB', '#0E9F6E', '#9333EA', '#F59E0B', '#DC2626', '#0891B2', '#DB2777'];
const colorFor = (id = '') => COLORS[[...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length];

function useRefresh() {
  const { refreshLive } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => { setRefreshing(true); try { await refreshLive(); } catch {} setRefreshing(false); };
  return [refreshing, refresh];
}

function SignedOut({ nav, what }) {
  return (
    <Card style={{ borderWidth: 1.5, borderColor: C.blue }}>
      <Text style={s.title}>Sign in to see {what}</Text>
      <Button title="Sign in" style={{ marginTop: 12 }} onPress={() => nav.push('SignIn')} />
    </Card>
  );
}

// Everyone you've taught (or who has a lesson booked with you).
function studentsFrom(teaching) {
  const by = {};
  for (const r of teaching.filter((x) => x.role === 'cfi')) {
    const st = by[r.studentId] ||= { id: r.studentId, name: r.studentName, lessons: [], completed: 0, hours: 0, next: null, last: null };
    st.lessons.push(r);
    if (r.status === 'Completed') {
      st.completed += 1; st.hours += r.actualHobbs || 0;
      if (!st.last || r.when > st.last.when) st.last = r;
    }
    if (['Pending', 'Confirmed'].includes(r.status) && new Date(r.when) > Date.now() - 6 * 3600e3 && (!st.next || r.when < st.next.when)) st.next = r;
  }
  return Object.values(by).sort((a, b) => (a.next ? 0 : 1) - (b.next ? 0 : 1) || (b.last?.when || '').localeCompare(a.last?.when || ''));
}

export function Students({ nav }) {
  const { teaching } = useStore();
  const auth = useAuth();
  const [refreshing, refresh] = useRefresh();
  useEffect(() => { refresh(); }, []);
  const list = studentsFrom(teaching);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 110 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Text style={s.h1}>Students</Text>
      <Pressable onPress={() => nav.push('Library')} accessibilityRole="button">
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Learning Library</Text>
            <Text style={s.sub}>Browse the lessons you can assign. To assign a pre-flight review, open a lesson on your Schedule.</Text>
          </View>
          <Text style={{ color: '#94A3B8', fontSize: 22 }}>›</Text>
        </Card>
      </Pressable>
      {!auth?.session ? <SignedOut nav={nav} what="your students" /> : list.length === 0 ? (
        <Text style={s.empty}>Students show up here once they book a lesson with you, with their lessons, hours and your debriefs.</Text>
      ) : list.map((st) => (
        <Pressable key={st.id} onPress={() => nav.push('StudentDetail', { id: st.id })} accessibilityRole="button" accessibilityLabel={`${st.name}, ${st.completed} lessons`}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Avatar initials={initials(st.name)} color={colorFor(st.id)} size={44} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.title}>{st.name}</Text>
                <Text style={s.sub}>{st.completed} lesson{st.completed === 1 ? '' : 's'} · {Math.round(st.hours * 10) / 10} hr with you</Text>
                <Text style={[s.sub, st.next && { color: C.blue, fontWeight: '700' }]}>
                  {st.next ? `Next: ${st.next.date} · ${st.next.time}${st.next.status === 'Pending' ? ' (request)' : ''}` : st.last ? `Last flew ${st.last.date}` : ''}
                </Text>
              </View>
              <Text style={{ color: '#94A3B8', fontSize: 22 }}>›</Text>
            </View>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function StudentDetail({ nav, params }) {
  const { teaching } = useStore();
  const auth = useAuth();
  const st = studentsFrom(teaching).find((x) => x.id === params.id);
  const [debriefs, setDebriefs] = useState([]);
  useEffect(() => {
    const uid = auth?.session?.user?.id;
    if (uid) fetchDebriefsIWrote(uid).then((d) => setDebriefs(d.filter((x) => x.student_id === params.id))).catch(() => {});
  }, [params.id]);
  if (!st) return null;
  const h = hoursFromFlights(st.lessons.filter((r) => r.status === 'Completed'));
  const lessons = [...st.lessons].sort((a, b) => b.when.localeCompare(a.when));
  const tag = { Completed: [C.green, '#E3F7EF'], Confirmed: [C.green, '#E3F7EF'], Pending: ['#B45309', '#FEF3C7'], Cancelled: [C.sub, '#EEF1F5'] };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={st.name} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Card>
          <Text style={s.kicker}>FLOWN WITH YOU</Text>
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            {[['Total', h.total], ['Night', h.night], ['Cross-country', h.dualXC], ['Instrument', h.instrument], ['Ground', h.ground]].map(([k, v]) => (
              <View key={k} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontWeight: '900', fontSize: 18, color: C.text }}>{v}</Text>
                <Text style={{ color: C.sub, fontSize: 11, textAlign: 'center' }}>{k}</Text>
              </View>
            ))}
          </View>
          <Button title={`Message ${st.name.split(' ')[0]}`} variant="outline" style={{ marginTop: 14 }} onPress={() => nav.push('Chat', { key: st.id, other: st.id, name: st.name })} />
        </Card>

        <SectionTitle>Your debriefs</SectionTitle>
        {debriefs.length === 0 && <Text style={s.empty}>Debriefs you write at close-out show here.</Text>}
        {debriefs.map((d) => (
          <Card key={d.id}>
            <View style={s.rowTop}>
              <Text style={s.title}>{new Date(d.flown_on + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
              <Tag label={d.acknowledged ? 'Read' : 'Unread'} color={d.acknowledged ? C.green : '#B45309'} bg={d.acknowledged ? '#E3F7EF' : '#FEF3C7'} />
            </View>
            {!!d.went_well && <Text style={s.body}><Text style={s.label}>Went well: </Text>{d.went_well}</Text>}
            {!!d.needs_work && <Text style={s.body}><Text style={s.label}>Needs work: </Text>{d.needs_work}</Text>}
            {!!d.next_plan && <Text style={s.body}><Text style={s.label}>Next: </Text>{d.next_plan}</Text>}
            {!!d.student_note && <Text style={[s.body, { fontStyle: 'italic' }]}>{st.name.split(' ')[0]}: “{d.student_note}”</Text>}
          </Card>
        ))}

        <SectionTitle>Lessons</SectionTitle>
        {lessons.map((r) => (
          <Card key={r.id}>
            <View style={s.rowTop}>
              <Text style={s.title}>{r.goal}</Text>
              <Tag label={r.status} color={tag[r.status][0]} bg={tag[r.status][1]} />
            </View>
            <Text style={s.sub}>{r.date} · {r.time}{r.tail ? ` · ${r.tail}` : ''}{r.actualHobbs ? ` · ${r.actualHobbs} hr Hobbs` : ''}</Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

export function Earnings({ nav }) {
  const { teaching } = useStore();
  const auth = useAuth();
  const [refreshing, refresh] = useRefresh();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { refresh(); }, []);
  const ready = !!auth?.account?.payouts_ready;

  const payouts = async () => {
    setErr(''); setBusy(true);
    try { await setUpPayouts(); await auth.refreshAccount(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const recheck = async () => {
    setErr(''); setBusy(true);
    try { await checkPayouts(); await auth.refreshAccount(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const done = teaching.filter((r) => r.status === 'Completed').sort((a, b) => b.when.localeCompare(a.when));
  const now = new Date();
  const sum = (rows) => rows.reduce((a, r) => a + (r.share || 0), 0);
  const month = sum(done.filter((r) => { const d = new Date(r.when); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }));
  const year = sum(done.filter((r) => new Date(r.when).getFullYear() === now.getFullYear()));
  const held = sum(done.filter((r) => r.payout === 'held'));
  const debriefDue = done.filter((r) => r.payout === 'debrief');
  const waiting = debriefDue.reduce((a, r) => a + (r.awaitingDebrief || 0), 0);
  const upcoming = sum(teaching.filter((r) => r.status === 'Confirmed'));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 110 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Text style={s.h1}>Earnings</Text>
      {!auth?.session ? <SignedOut nav={nav} what="your earnings" /> : (
        <>
          <View style={s.hero}>
            <Text style={{ color: '#9FB3D1', fontWeight: '700', fontSize: 12 }}>THIS MONTH</Text>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 32, marginTop: 2 }}>{money2(month)}</Text>
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <View style={{ flex: 1 }}><Text style={s.heroK}>This year</Text><Text style={s.heroV}>{money2(year)}</Text></View>
              <View style={{ flex: 1 }}><Text style={s.heroK}>Booked ahead</Text><Text style={s.heroV}>~{money2(upcoming)}</Text></View>
            </View>
          </View>

          {debriefDue.length > 0 && (
            <Pressable onPress={() => nav.push('WriteDebrief', { id: debriefDue[0].id })} accessibilityRole="button">
              <Card style={{ borderWidth: 1.5, borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }}>
                <Text style={s.title}>{money2(waiting)} waiting on {debriefDue.length > 1 ? `${debriefDue.length} debriefs` : 'a debrief'} ›</Text>
                <Text style={s.sub}>Lesson pay is released once the debrief is written. We’ll remind you 1, 3 and 7 days after each flight.</Text>
              </Card>
            </Pressable>
          )}
          <Card style={ready ? null : { borderWidth: 1.5, borderColor: C.blue }}>
            <Text style={s.kicker}>PAYOUTS</Text>
            {ready ? (
              <>
                <Text style={s.title}>Payouts are on ✓</Text>
                <Text style={s.sub}>Your share goes to your bank automatically once the lesson’s debrief is written (rentals: at close-out), usually within 2 business days.</Text>
              </>
            ) : (
              <>
                <Text style={s.title}>Set up payouts to get paid</Text>
                <Text style={s.sub}>Stripe handles this securely: your name, date of birth, last 4 of your SSN and a bank account. Takes about 5 minutes.{held > 0 ? ` ${money2(held)} is waiting for you.` : ''}</Text>
                <Button title={busy ? 'Opening Stripe…' : 'Set up payouts'} disabled={busy} style={{ marginTop: 12 }} onPress={payouts} />
                <Pressable onPress={recheck} style={{ marginTop: 10, alignSelf: 'center' }} accessibilityRole="button">
                  <Text style={{ color: C.blue, fontWeight: '700' }}>Already finished? Check again</Text>
                </Pressable>
              </>
            )}
            {!!err && <Text style={s.err}>{err}</Text>}
          </Card>

          <SectionTitle>Completed lessons</SectionTitle>
          {done.length === 0 && <Text style={s.empty}>Each lesson you close out shows here with your share.</Text>}
          {done.map((r) => (
            <Card key={r.id}>
              <View style={s.rowTop}>
                <Text style={s.title}>{r.studentName}</Text>
                <Text style={{ fontWeight: '900', color: C.navy, fontSize: 16 }}>{money2(r.share || 0)}</Text>
              </View>
              <Text style={s.sub}>{r.date} · {r.goal}{r.actualHobbs ? ` · ${r.actualHobbs} hr` : ''}{r.role === 'owner' ? ' · plane rental' : ''}</Text>
              <Row label={r.split?.status === 'accepted' ? 'Pilots paid' : 'Student paid'} value={money2(r.total)} />
              {r.payout === 'debrief' ? (
                <Pressable onPress={() => nav.push('WriteDebrief', { id: r.id })} accessibilityRole="button">
                  <Text style={[s.sub, { color: C.blue, fontWeight: '800' }]}>Write the debrief to get paid ›</Text>
                </Pressable>
              ) : (
                <Text style={[s.sub, { color: r.payout === 'paid' ? C.green : '#B45309', fontWeight: '700' }]}>{r.payout === 'paid' ? 'Sent to your bank' : 'Held until payouts are set up'}</Text>
              )}
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '900', color: C.text, marginTop: 6, marginBottom: 8 },
  title: { fontWeight: '900', color: C.text, fontSize: 16, flex: 1 },
  sub: { color: C.sub, marginTop: 2, fontSize: 13, lineHeight: 18 },
  body: { color: C.text, marginTop: 6, lineHeight: 20 },
  label: { fontWeight: '800' },
  kicker: { color: C.sub, fontSize: 12, fontWeight: '700' },
  empty: { color: C.sub, lineHeight: 20 },
  err: { color: '#B91C1C', fontWeight: '600', marginTop: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hero: { backgroundColor: C.navy, borderRadius: 18, padding: 18, marginBottom: 12 },
  heroK: { color: '#9FB3D1', fontSize: 12, fontWeight: '700' },
  heroV: { color: '#fff', fontWeight: '800', fontSize: 16, marginTop: 2 },
});
