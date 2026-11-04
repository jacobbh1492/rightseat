import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { C, Card, Button, Field, Chip, SectionTitle, Tag, Toggle, Avatar } from '../ui';
import { Header } from './Details';
import { useStore } from '../store';
import { useAuth } from '../backend/auth';
import { AIRPORTS, DAYS, TIMES } from '../data';
import { MATCH_GOALS, MATCH_STYLES, matchCfis, fitPercent } from '../matching';
import { sendTrainingRequest, fetchMyTrainingRequests, fetchRequestsForCfi, respondTrainingRequest, closeTrainingRequest } from '../backend/matches';

const BUDGETS = [0, 200, 250, 300];
const goalFromStage = (stage) => ({ new: 'Discovery flight', student: 'Private Pilot', returning: 'Private Pilot', certificated: 'Instrument' }[stage] || 'Private Pilot');

// Tell us what you want; we rank instructors and you send a request to your top picks.
export function GetMatched({ nav, params }) {
  const { cfis, planes, profile } = useStore();
  const auth = useAuth();
  const [req, setReq] = useState({
    goal: params?.goal || goalFromStage(profile.stage), airport: profile.airport || 'KPIE', days: [], times: [], maxRate: 0,
    needPlane: true, glass: false, styles: [], note: '',
  });
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (v) => { setReq((r) => ({ ...r, [k]: v })); setPicked([]); };
  const toggle = (k, v) => set(k)(req[k].includes(v) ? req[k].filter((x) => x !== v) : [...req[k], v]);
  const matches = useMemo(() => matchCfis({ cfis, planes, request: req, limit: 6 }), [cfis, planes, req]);
  const top = matches[0]?.score || 1;
  const pick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));
  const chosen = matches.filter((m) => picked.includes(m.cfi.id));
  const sampleOnly = chosen.some((m) => !m.cfi.live);

  const send = async () => {
    if (!auth?.session) { nav.push('SignIn', { reason: 'Sign in to send your request. We’ll email you a 6-digit code.' }); return; }
    setErr(''); setBusy(true);
    try {
      await sendTrainingRequest({ ...req, maxRate: req.maxRate || null }, chosen);
      nav.replace('MyMatches', { sent: true });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Get matched" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Text style={ms.sub}>Tell us what you’re after. We rank instructors by fit, and you send your request to up to 3. They answer here.</Text>

        <SectionTitle>Training for</SectionTitle>
        <View style={ms.wrap}>{MATCH_GOALS.map((g) => <Chip key={g} small label={g} active={req.goal === g} onPress={() => set('goal')(g)} />)}</View>
        <SectionTitle>Airport</SectionTitle>
        <View style={ms.wrap}>{AIRPORTS.map((a) => <Chip key={a.code} small label={a.code} active={req.airport === a.code} onPress={() => set('airport')(a.code)} />)}</View>
        <SectionTitle>When can you fly?</SectionTitle>
        <View style={ms.wrap}>{DAYS.map((d) => <Chip key={d} small label={d} active={req.days.includes(d)} onPress={() => toggle('days', d)} />)}</View>
        <View style={ms.wrap}>{TIMES.map((t) => <Chip key={t} small label={t} active={req.times.includes(t)} onPress={() => toggle('times', t)} />)}</View>
        <SectionTitle>Budget per flight hour (instructor + plane)</SectionTitle>
        <View style={ms.wrap}>{BUDGETS.map((b) => <Chip key={b} small label={b ? `Up to $${b}` : 'Any'} active={req.maxRate === b} onPress={() => set('maxRate')(b)} />)}</View>
        <Toggle label="I need a plane" hint="Off if you’ll train in your own" value={req.needPlane} onValueChange={set('needPlane')} />
        {req.needPlane && <Toggle label="Prefer a glass cockpit" value={req.glass} onValueChange={set('glass')} />}
        <SectionTitle>Teaching style you like</SectionTitle>
        <View style={ms.wrap}>{MATCH_STYLES.map((st) => <Chip key={st} small label={st} active={req.styles.includes(st)} onPress={() => toggle('styles', st)} />)}</View>
        <Field label="Anything else? (optional)" value={req.note} onChangeText={(t) => setReq((r) => ({ ...r, note: t }))} multiline placeholder="Restarting after 3 years, about 25 hours logged. Want to finish by summer." />

        <SectionTitle>Your best matches</SectionTitle>
        {matches.length === 0 && <Text style={ms.sub}>No instructors teach that here yet. Try another airport or goal.</Text>}
        {matches.map((m) => {
          const on = picked.includes(m.cfi.id);
          return (
            <Card key={m.cfi.id} style={on ? { borderWidth: 2, borderColor: C.blue } : null}>
              <Pressable onPress={() => pick(m.cfi.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Avatar initials={m.cfi.initials} color={m.cfi.color} size={44} photo={m.cfi.photo} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontWeight: '900', color: C.text, fontSize: 15 }}>{m.cfi.name}</Text>
                  <Text style={ms.sub}>{m.cfi.certs.join(', ')} · {m.cfi.homeAirport}{m.combinedRate ? ` · $${Math.round(m.combinedRate)}/hr${m.plane ? ` with ${m.plane.tail}` : ''}` : ''}</Text>
                  <View style={ms.bar}><View style={[ms.barFill, { width: `${fitPercent(m, top)}%` }]} /></View>
                </View>
                <View style={[ms.check, on && { backgroundColor: C.blue, borderColor: C.blue }]}>{on && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}</View>
              </Pressable>
              {m.reasons.map((x) => <Text key={x} style={[ms.sub, { color: C.green, marginTop: 4 }]}>✓ {x}</Text>)}
              {m.concerns.map((x) => <Text key={x} style={[ms.sub, { color: '#B45309', marginTop: 2 }]}>! {x}</Text>)}
              <Pressable onPress={() => nav.push('Cfi', { id: m.cfi.id })} style={{ marginTop: 6 }} accessibilityRole="button"><Text style={{ color: C.blue, fontWeight: '700' }}>View profile ›</Text></Pressable>
            </Card>
          );
        })}
        {sampleOnly && <Text style={[ms.sub, { color: '#B45309' }]}>Sample instructors can’t get requests. Pick instructors listed on RightSeat.</Text>}
        {!!err && <Text style={ms.err}>{err}</Text>}
      </ScrollView>
      <View style={ms.cta}>
        <Button title={busy ? 'Sending…' : picked.length ? `Send to ${picked.length} instructor${picked.length > 1 ? 's' : ''}` : 'Pick up to 3 instructors'}
          disabled={busy || !picked.length || sampleOnly} style={{ flex: 1 }} onPress={send} />
      </View>
    </View>
  );
}

const ANSWER = { sent: ['Waiting', '#B45309', '#FEF3C7'], interested: ['Interested', C.green, '#E3F7EF'], declined: ['Not a fit', C.sub, '#EEF1F5'] };

// Student: requests you sent and who answered.
export function MyMatches({ nav, params }) {
  const { getCfi } = useStore();
  const auth = useAuth();
  const uid = auth?.session?.user?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const load = async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try { setRows(await fetchMyTrainingRequests(uid)); setErr(''); } catch (e) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [uid]);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Your matches" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {params?.sent && <Card style={{ backgroundColor: '#E3F7EF' }}><Text style={{ fontWeight: '800', color: C.green }}>Request sent ✓ We’ll notify you when an instructor answers.</Text></Card>}
        {!!err && <Text style={ms.err}>{err}</Text>}
        {!loading && rows.length === 0 && (
          <Card>
            <Text style={ms.sub}>No requests yet.</Text>
            <Button title="Get matched" style={{ marginTop: 10 }} onPress={() => nav.replace('GetMatched')} />
          </Card>
        )}
        {rows.map((r) => (
          <Card key={r.id}>
            <View style={ms.rowTop}>
              <Text style={{ fontWeight: '900', color: C.text, fontSize: 15, flex: 1 }}>{r.goal}{r.airport ? ` · ${r.airport}` : ''}</Text>
              {r.status === 'closed' && <Tag label="Closed" color={C.sub} bg="#EEF1F5" />}
            </View>
            <Text style={ms.sub}>{new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{r.days.length ? ` · ${r.days.join(', ')}` : ''}</Text>
            {r.cfis.map((x) => {
              const c = getCfi(x.cfiId);
              const a = ANSWER[x.status] || ANSWER.sent;
              return (
                <View key={x.cfiId} style={ms.answer}>
                  <View style={ms.rowTop}>
                    <Text style={{ fontWeight: '800', color: C.text, flex: 1 }}>{c?.name || 'Instructor'}</Text>
                    <Tag label={a[0]} color={a[1]} bg={a[2]} />
                  </View>
                  {!!x.reply && <Text style={[ms.sub, { marginTop: 4 }]}>“{x.reply}”</Text>}
                  {x.status === 'interested' && (
                    <View style={{ flexDirection: 'row', marginTop: 8 }}>
                      <Button title="Message" variant="outline" small style={{ flex: 1, marginRight: 8 }} onPress={() => nav.push('Chat', { key: x.cfiId })} />
                      <Button title="Book a lesson" small style={{ flex: 1 }} onPress={() => nav.push('Request', { cfiId: x.cfiId, goal: r.goal === 'Discovery flight' ? 'Discovery flight' : undefined })} />
                    </View>
                  )}
                </View>
              );
            })}
            {r.status === 'open' && (
              <Pressable onPress={async () => { try { await closeTrainingRequest(r.id); load(); } catch (e) { setErr(e.message); } }} style={{ marginTop: 8 }} accessibilityRole="button">
                <Text style={{ color: C.sub, fontWeight: '700' }}>Found my instructor · close request</Text>
              </Pressable>
            )}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

// Instructor: students who picked you as a top match.
export function StudentRequests({ nav }) {
  const auth = useAuth();
  const uid = auth?.session?.user?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [reply, setReply] = useState({});
  const [busy, setBusy] = useState(null);
  const load = async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try { setRows(await fetchRequestsForCfi(uid)); setErr(''); } catch (e) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [uid]);
  const answer = async (r, yes) => {
    setBusy(r.id + yes); setErr('');
    try { await respondTrainingRequest(r.id, yes, reply[r.id] || ''); await load(); } catch (e) { setErr(e.message); }
    setBusy(null);
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Student requests" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} keyboardShouldPersistTaps="handled">
        <Text style={ms.sub}>Students who used Get matched and picked you. Answer quickly: they usually pick whoever replies first.</Text>
        {!!err && <Text style={ms.err}>{err}</Text>}
        {!loading && rows.length === 0 && <Text style={[ms.sub, { marginTop: 12 }]}>No requests yet. A complete profile with your hours, specialties and availability helps you match.</Text>}
        {rows.map((r) => (
          <Card key={r.id}>
            <View style={ms.rowTop}>
              <Text style={{ fontWeight: '900', color: C.text, fontSize: 15, flex: 1 }}>{r.studentName.split(' ')[0]} · {r.goal}</Text>
              {r.myStatus !== 'sent' && <Tag label={ANSWER[r.myStatus][0]} color={ANSWER[r.myStatus][1]} bg={ANSWER[r.myStatus][2]} />}
            </View>
            <Text style={ms.sub}>
              {[r.airport, r.days.join(', '), r.times.join(', '), r.maxRate ? `up to $${Math.round(r.maxRate)}/hr` : null, r.needPlane ? 'needs a plane' : 'has a plane', r.glass ? 'likes glass' : null].filter(Boolean).join(' · ')}
            </Text>
            {r.styles.length > 0 && <Text style={ms.sub}>Likes: {r.styles.join(', ')}</Text>}
            {!!r.note && <Text style={[ms.sub, { marginTop: 6, color: C.text }]}>“{r.note}”</Text>}
            {r.reasons.length > 0 && <Text style={[ms.sub, { marginTop: 6, color: C.green }]}>Why you matched: {r.reasons.join(' · ')}</Text>}
            {r.status === 'closed' && <Text style={[ms.sub, { marginTop: 6 }]}>The student closed this request.</Text>}
            {r.status === 'open' && r.myStatus === 'sent' && (
              <>
                <Field value={reply[r.id] || ''} onChangeText={(t) => setReply((x) => ({ ...x, [r.id]: t }))} multiline placeholder={`Hi ${r.studentName.split(' ')[0]}! I fly ${r.days[0] || 'most days'} out of ${r.airport || 'my home field'}…`} />
                <View style={{ flexDirection: 'row' }}>
                  <Button title={busy === r.id + false ? '…' : 'Not a fit'} variant="outline" small disabled={!!busy} style={{ flex: 0.6, marginRight: 8 }} onPress={() => answer(r, false)} />
                  <Button title={busy === r.id + true ? 'Sending…' : 'I’m interested'} small disabled={!!busy} style={{ flex: 1 }} onPress={() => answer(r, true)} />
                </View>
              </>
            )}
            {r.myStatus === 'interested' && (
              <Button title={`Message ${r.studentName.split(' ')[0]}`} variant="outline" small style={{ marginTop: 8 }}
                onPress={() => nav.push('Chat', { key: r.studentId, other: r.studentId, name: r.studentName })} />
            )}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const ms = StyleSheet.create({
  sub: { color: C.sub, fontSize: 13, lineHeight: 18 },
  err: { color: '#B91C1C', fontWeight: '600', marginTop: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#E2E8F0', marginTop: 6, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: C.green },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  answer: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: 16, paddingBottom: 28, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
