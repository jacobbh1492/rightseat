import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { useAuth } from '../backend/auth';
import { hoursFromFlights, fetchDebriefs, acknowledgeDebrief } from '../backend/bookings';
import { PPL_MINIMUMS } from '../logic';
import { C, Card, SectionTitle, Button, Field, Tag } from '../ui';

// The signed-in student's real training record: hours from completed RightSeat flights
// (logged by the instructor at close-out) and their instructors' debriefs.
// Minimums that need things RightSeat doesn't record yet (checkride prep window) are left out.
const SHOWN = PPL_MINIMUMS.filter((m) => m.key !== 'prep');

export default function LiveTraining({ nav }) {
  const auth = useAuth();
  const uid = auth.session.user.id;
  const { requests, refreshLive, getCfi } = useStore();
  const [debriefs, setDebriefs] = useState([]);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try { await refreshLive(); setDebriefs(await fetchDebriefs(uid)); } catch (e) { setErr(e.message); }
    setRefreshing(false);
  };
  useEffect(() => { load(); }, [uid]);

  const flights = requests.filter((r) => r.live && r.status === 'Completed').sort((a, b) => new Date(b.when) - new Date(a.when));
  const H = hoursFromFlights(flights);
  const met = SHOWN.filter((m) => H[m.key] >= m.req).length;
  const instructors = [...new Set(flights.map((f) => f.cfiId).filter(Boolean))];
  const nameOf = (id) => getCfi(id)?.name || flights.find((f) => f.cfiId === id)?.cfiName || 'Your instructor';

  const ack = async (d) => {
    setErr(''); setBusy(d.id);
    try { await acknowledgeDebrief(d.id, (notes[d.id] || '').trim()); setDebriefs(await fetchDebriefs(uid)); } catch (e) { setErr(e.message); }
    setBusy(null);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <View style={l.hero}>
        <Text style={l.kicker}>MY TRAINING</Text>
        <Text style={l.title}>Private Pilot (ASEL)</Text>
        <Text style={{ color: '#D6E2F3', marginTop: 6 }}>
          {instructors.length ? `With ${instructors.map(nameOf).join(', ')}` : 'Book a lesson to start your record'}
        </Text>
        <View style={l.stats}>
          <View style={l.stat}><Text style={l.big}>{H.total}</Text><Text style={l.small}>hrs on RightSeat</Text></View>
          <View style={l.stat}><Text style={l.big}>{flights.length}</Text><Text style={l.small}>flights</Text></View>
          <View style={l.stat}><Text style={l.big}>{met}/{SHOWN.length}</Text><Text style={l.small}>FAA mins met</Text></View>
        </View>
      </View>

      <View style={{ padding: 16 }}>
        {!!err && <Text style={l.err}>{err}</Text>}

        <SectionTitle>Toward FAA minimums (61.109)</SectionTitle>
        <Card>
          {SHOWN.map((m) => {
            const v = H[m.key] || 0;
            const pct = Math.min(1, v / m.req);
            return (
              <View key={m.key} style={{ marginBottom: 10 }}>
                <View style={l.row}>
                  <Text style={{ color: C.text, fontWeight: '600' }}>{m.label}</Text>
                  <Text style={{ color: v >= m.req ? C.green : C.sub, fontWeight: '700' }}>{v} / {m.req} hr</Text>
                </View>
                <View style={l.bar}><View style={[l.fill, { width: `${pct * 100}%`, backgroundColor: v >= m.req ? C.green : C.blue }]} /></View>
              </View>
            );
          })}
          <Text style={l.sub}>Counts flights closed out on RightSeat. Your logbook is still the official record, and hours from before RightSeat aren’t included.</Text>
        </Card>

        <SectionTitle>Debriefs</SectionTitle>
        {debriefs.length === 0 && <Text style={l.sub}>After each lesson your instructor can write what went well and what’s next. It shows up here.</Text>}
        {debriefs.map((d) => (
          <Card key={d.id} style={!d.acknowledged ? { borderLeftWidth: 4, borderLeftColor: C.blue } : null}>
            <View style={l.row}>
              <Text style={{ fontWeight: '900', color: C.text }}>{new Date(d.flown_on + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
              {d.acknowledged ? <Tag label="Read" color={C.green} bg="#E3F7EF" /> : <Tag label="New" />}
            </View>
            <Text style={l.sub}>{nameOf(d.cfi_id)}</Text>
            {!!d.went_well && <><Text style={l.label}>What went well</Text><Text style={l.body}>{d.went_well}</Text></>}
            {!!d.needs_work && <><Text style={l.label}>Needs work</Text><Text style={l.body}>{d.needs_work}</Text></>}
            {!!d.next_plan && <><Text style={l.label}>Next lesson</Text><Text style={l.body}>{d.next_plan}</Text></>}
            {!!d.student_note && <><Text style={l.label}>Your note</Text><Text style={l.body}>{d.student_note}</Text></>}
            {!d.acknowledged && (
              <>
                <Field label="Add a note (optional)" value={notes[d.id] || ''} onChangeText={(t) => setNotes((n) => ({ ...n, [d.id]: t }))} placeholder="Questions for next time" />
                <Button title={busy === d.id ? 'Saving…' : 'Mark as read'} disabled={!!busy} style={{ paddingVertical: 10 }} onPress={() => ack(d)} />
              </>
            )}
          </Card>
        ))}

        <SectionTitle>Flights</SectionTitle>
        {flights.length === 0 && <Text style={l.sub}>No completed flights yet.</Text>}
        {flights.map((f) => (
          <Card key={f.id}>
            <View style={l.row}>
              <Text style={{ fontWeight: '800', color: C.text, flex: 1 }}>{f.goal}</Text>
              <Text style={{ color: C.navy, fontWeight: '800' }}>{f.actualHobbs} hr</Text>
            </View>
            <Text style={l.sub}>
              {f.date} · {f.cfiId ? `Dual with ${nameOf(f.cfiId)}` : 'Solo'}{f.tail ? ` · ${f.tail}` : ''}
              {[f.conditions?.night && 'night', f.conditions?.xc && 'cross-country', f.conditions?.instrumentHours ? `${f.conditions.instrumentHours} hr sim instrument` : null].filter(Boolean).map((x) => ` · ${x}`).join('')}
            </Text>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

const l = StyleSheet.create({
  hero: { backgroundColor: C.navy, padding: 20, paddingTop: 16 },
  kicker: { color: '#9FB3D1', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  title: { color: '#fff', fontWeight: '900', fontSize: 24, marginTop: 4 },
  stats: { flexDirection: 'row', marginTop: 16 },
  stat: { flex: 1 },
  big: { color: '#fff', fontSize: 24, fontWeight: '900' },
  small: { color: '#9FB3D1', fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bar: { height: 8, backgroundColor: '#EEF1F5', borderRadius: 4, marginTop: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  sub: { color: C.sub, fontSize: 13, marginTop: 4, lineHeight: 18 },
  label: { color: C.sub, fontSize: 12, fontWeight: '800', marginTop: 10 },
  body: { color: C.text, lineHeight: 20, marginTop: 2 },
  err: { color: '#B91C1C', fontWeight: '600', marginBottom: 8 },
});
