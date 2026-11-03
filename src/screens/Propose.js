import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { useAuth } from '../backend/auth';
import { proposeLesson } from '../backend/bookings';
import { quote, money2 } from '../logic';
import { C, Card, Button, Chip, Stepper, SectionTitle, Avatar } from '../ui';
import { Header } from './Details';
import { PlaneImage } from '../art';
import { MonthCalendar, TimeSheet, cmpDate, longDate } from '../calendarUi';
import { DEFAULT_TZ, todayIn, zonedTime, minutesLabel, tzAbbrev } from '../schedule';

// An instructor books a lesson for one of their students. It's sent as a proposal: the
// student accepts by adding their card, which confirms it. Until then it holds the time.

const GOALS = ['Private Pilot lesson', 'Dual cross-country', 'Night flying', 'Instrument lesson', 'Commercial maneuvers', 'Checkride prep', 'Flight review (BFR)', 'IPC', 'Aircraft checkout', 'Ground lesson'];
const isLive = (id) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id);
const initials = (n = '') => n.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// Your students: anyone with a lesson with you that wasn't cancelled.
function myStudents(teaching) {
  const by = {};
  for (const r of teaching) {
    if (r.role !== 'cfi' || !['Pending', 'Confirmed', 'Completed'].includes(r.status)) continue;
    const s = by[r.studentId] ||= { id: r.studentId, name: r.studentName, last: null };
    if (!s.last || r.when > s.last.when) s.last = r;
  }
  return Object.values(by).sort((a, b) => (b.last?.when || '').localeCompare(a.last?.when || ''));
}

export function ProposeLesson({ nav, params = {} }) {
  const { teaching, cfis, getPlane, refreshLive, affiliationFor } = useStore();
  const auth = useAuth();
  const uid = auth?.session?.user?.id;
  const me = cfis.find((c) => c.id === uid && c.live);
  const tz = params.tz || DEFAULT_TZ;
  const today = todayIn(tz);
  const students = myStudents(teaching);
  const lastWith = (sid) => students.find((s) => s.id === sid)?.last;

  const [studentId, setStudentId] = useState(params.studentId || students[0]?.id || null);
  const [date, setDate] = useState(params.date || null);
  const [month, setMonth] = useState({ y: (params.date || today).y, m: (params.date || today).m });
  const [startMin, setStartMin] = useState(params.startMin ?? null);
  const [picker, setPicker] = useState(false);
  const last = lastWith(studentId);
  const [planeId, setPlaneId] = useState(params.planeId !== undefined ? params.planeId : last?.planeId || null);
  const [flightHours, setFlightHours] = useState(last?.flightHours || 1.5);
  const [groundHours, setGroundHours] = useState(last?.groundHours ?? 0.5);
  const [goal, setGoal] = useState(params.goal || last?.goal || GOALS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(null);

  const myPlanes = (me?.aircraftIds || []).map(getPlane).filter((p) => p && isLive(p.id));
  const plane = planeId ? getPlane(planeId) : null;
  const student = students.find((s) => s.id === studentId);
  const start = date && startMin != null ? zonedTime(date.y, date.m, date.d, startMin, tz) : null;
  const q = useMemo(() => (me ? quote({ cfi: me, plane, flightHours, groundHours, repeat: true, prepaid: false, cfiPro: me.pro, method: 'card', affiliation: affiliationFor(me.id) }) : null),
    [me?.id, planeId, flightHours, groundHours]);
  const tooSoon = start && start.getTime() < Date.now() + 3 * 3600e3;
  const ready = me && student && start && !tooSoon && goal;

  const send = async () => {
    setErr(''); setBusy(true);
    try {
      const res = await proposeLesson({ studentId, planeId, startsAt: start.toISOString(), flightHours, groundHours, goal });
      await refreshLive().catch(() => {});
      setSent(res);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (sent) {
    const by = new Date(sent.booking.proposal_expires).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Lesson sent" />
        <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
          <View style={st.check}><Text style={{ color: '#fff', fontSize: 40, fontWeight: '900' }}>✓</Text></View>
          <Text style={{ fontSize: 22, fontWeight: '900', color: C.text, marginTop: 16 }}>Sent to {student.name.split(' ')[0]}</Text>
          <Text style={{ color: C.sub, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
            {longDate(date)} at {minutesLabel(startMin)}{plane ? ` in ${plane.tail}` : ''}. It’s on your calendar and holds the time. {student.name.split(' ')[0]} has until {by} to accept, and it’s confirmed as soon as they do.
          </Text>
          <Button title="Back to schedule" style={{ alignSelf: 'stretch', marginTop: 18 }} onPress={() => nav.pop()} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Book a lesson" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {!uid || !me ? (
          <Card><Text style={st.title}>Create your instructor profile first</Text><Text style={st.sub}>Then you can book lessons for your students.</Text></Card>
        ) : students.length === 0 ? (
          <Card><Text style={st.title}>No students yet</Text><Text style={st.sub}>Once a student books you, you can book their next lessons from here.</Text></Card>
        ) : (
          <>
            <Text style={st.sub}>Pick the student, time and plane. They get a notification to accept; it’s confirmed once they add their card.</Text>

            <SectionTitle>Student</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {students.map((s) => (
                <Pressable key={s.id} onPress={() => setStudentId(s.id)} style={[st.pick, studentId === s.id && st.pickOn]} accessibilityRole="button" accessibilityState={{ selected: studentId === s.id }}>
                  <Avatar initials={initials(s.name)} color={C.blue} size={40} />
                  <Text style={st.pickName} numberOfLines={1}>{s.name.split(' ')[0]}</Text>
                  <Text style={st.pickSub} numberOfLines={1}>{s.last ? s.last.date : ''}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <SectionTitle>Lesson</SectionTitle>
            <View style={st.chips}>{[...new Set([goal, ...GOALS])].map((g) => <Chip key={g} small label={g} active={goal === g} onPress={() => setGoal(g)} />)}</View>

            <SectionTitle>Day & time</SectionTitle>
            <MonthCalendar month={month} onMonth={setMonth} selected={date} onSelect={setDate} enabled={(dt) => cmpDate(dt, today) >= 0} minMonth={{ y: today.y, m: today.m }} />
            <Pressable onPress={() => setPicker(true)} style={st.timeBtn} accessibilityRole="button">
              <Text style={{ fontWeight: '800', color: startMin == null ? C.blue : C.text }}>{startMin == null ? 'Pick a start time' : `Starts ${minutesLabel(startMin)}`}</Text>
              <Text style={st.sub}>{tzAbbrev(tz, start || new Date())}</Text>
            </Pressable>
            {tooSoon && <Text style={st.warn}>Pick a time at least 3 hours from now so {student?.name.split(' ')[0] || 'they'} can accept.</Text>}

            <SectionTitle>How long</SectionTitle>
            <Card>
              <Stepper label="Flight (Hobbs)" value={flightHours} onChange={setFlightHours} min={0.5} />
              <Stepper label="Ground / briefing" value={groundHours} onChange={setGroundHours} />
            </Card>

            <SectionTitle>Plane</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {myPlanes.map((p) => (
                <Pressable key={p.id} onPress={() => setPlaneId(p.id)} style={[st.pick, planeId === p.id && st.pickOn]} accessibilityRole="button" accessibilityState={{ selected: planeId === p.id }}>
                  <PlaneImage plane={p} size={40} />
                  <Text style={st.pickName} numberOfLines={1}>{p.tail}</Text>
                  <Text style={st.pickSub} numberOfLines={1}>{p.make} {p.model.split(' ')[0]}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setPlaneId(null)} style={[st.pick, !planeId && st.pickOn]} accessibilityRole="button" accessibilityState={{ selected: !planeId }}>
                <View style={st.ownIcon}><Text style={{ fontSize: 20 }}>🛩️</Text></View>
                <Text style={st.pickName}>Their plane</Text>
                <Text style={st.pickSub}>or ground only</Text>
              </Pressable>
            </ScrollView>

            {q && (
              <Card style={{ marginTop: 16 }}>
                <Text style={st.sub}>Estimate for {student?.name.split(' ')[0]}</Text>
                <Text style={{ fontSize: 24, fontWeight: '900', color: C.navy }}>{money2(q.total)}</Text>
                <Text style={st.sub}>Charged after the flight for actual Hobbs time, like any lesson.</Text>
              </Card>
            )}
            {!!err && <Text style={st.err}>{err}</Text>}
          </>
        )}
      </ScrollView>
      {me && students.length > 0 && (
        <View style={st.cta}>
          <Button title={busy ? 'Sending…' : !student ? 'Pick a student' : !date ? 'Pick a day' : startMin == null ? 'Pick a time' : `Send to ${student.name.split(' ')[0]}`}
            disabled={busy || !ready} style={{ flex: 1 }} onPress={send} />
        </View>
      )}
      {picker && <TimeSheet visible title="Start time" value={startMin} min={0} max={1410} onPick={setStartMin} onClose={() => setPicker(false)} />}
    </View>
  );
}

const st = StyleSheet.create({
  title: { fontWeight: '900', color: C.text, fontSize: 16 },
  sub: { color: C.sub, fontSize: 13, lineHeight: 18 },
  warn: { color: '#B45309', fontWeight: '600', marginTop: 6 },
  err: { color: '#B91C1C', fontWeight: '600', marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  pick: { width: 96, alignItems: 'center', padding: 10, borderRadius: 14, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', marginRight: 8 },
  pickOn: { borderColor: C.blue, backgroundColor: '#EEF4FF' },
  pickName: { fontWeight: '800', color: C.text, marginTop: 6 },
  pickSub: { color: C.sub, fontSize: 11, marginTop: 1 },
  ownIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' },
  timeBtn: { marginTop: 10, minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  check: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: 16, paddingBottom: 28, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
