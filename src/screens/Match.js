import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { C, Card, Button, Field, Chip, SectionTitle, Tag, Toggle, Avatar, Steps, Icon } from '../ui';
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

  const [step, setStep] = useState(0); // 0 preferences · 1 matches
  const strength = (m) => (fitPercent(m, top) >= 80 ? ['Strong match', C.green, C.greenBg] : ['Good match', C.navy, C.sky]);
  const summary = [req.goal, req.airport, req.days.length ? req.days.join(', ') : 'any day', req.times.length ? req.times.join(', ').toLowerCase() : null,
    req.maxRate ? `up to $${req.maxRate}/hr` : null, req.needPlane ? (req.glass ? 'glass cockpit' : 'needs a plane') : 'own plane'].filter(Boolean).join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={step ? { pop: () => setStep(0) } : nav} title="Get matched" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Steps labels={['Preferences', 'Matches']} current={step} />
        {step === 0 && (
          <>
            <Text style={ms.sub}>Tell us what you’re after. Next, we rank instructors by fit and you message up to 3.</Text>
            <SectionTitle>Training for</SectionTitle>
            <View style={ms.wrap}>{MATCH_GOALS.map((g) => <Chip key={g} small label={g} active={req.goal === g} onPress={() => set('goal')(g)} />)}</View>
            <SectionTitle>Airport</SectionTitle>
            <View style={ms.wrap}>{AIRPORTS.map((a) => <Chip key={a.code} small label={a.code} active={req.airport === a.code} onPress={() => set('airport')(a.code)} />)}</View>
            <SectionTitle>When can you fly?</SectionTitle>
            <View style={ms.days}>
              {DAYS.map((d) => {
                const on = req.days.includes(d);
                return (
                  <Pressable key={d} onPress={() => toggle('days', d)} style={[ms.day, on && ms.dayOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                    <Text style={{ fontWeight: '700', color: on ? '#fff' : C.text, fontSize: 13 }}>{d}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={[ms.wrap, { marginTop: 8 }]}>{TIMES.filter((t) => t !== 'Weekends only').map((t) => <Chip key={t} small label={t} active={req.times.includes(t)} onPress={() => toggle('times', t)} />)}</View>
            <SectionTitle>Budget per flight hour (instructor + plane)</SectionTitle>
            <View style={ms.wrap}>{BUDGETS.map((b) => <Chip key={b} small label={b ? `Up to $${b}` : 'Any'} active={req.maxRate === b} onPress={() => set('maxRate')(b)} />)}</View>
            <Toggle label="I need a plane" hint="Off if you’ll train in your own" value={req.needPlane} onValueChange={set('needPlane')} />
            {req.needPlane && <Toggle label="Prefer a glass cockpit" value={req.glass} onValueChange={set('glass')} />}
            <SectionTitle>Teaching style you like</SectionTitle>
            <View style={ms.wrap}>{MATCH_STYLES.map((st) => <Chip key={st} small label={st} active={req.styles.includes(st)} onPress={() => toggle('styles', st)} />)}</View>
            <Field label="Anything else? (optional)" value={req.note} onChangeText={(t) => setReq((r) => ({ ...r, note: t }))} multiline placeholder="e.g. Restarting after 3 years, about 25 hours logged" />
          </>
        )}
        {step === 1 && (
          <>
            <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={ms.kicker}>Matched on</Text>
                <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{summary}</Text>
              </View>
              <Pressable onPress={() => setStep(0)} style={ms.link} accessibilityRole="button"><Text style={{ color: C.blue, fontWeight: '700' }}>Edit</Text></Pressable>
            </Card>
            {matches.length === 0 && <Text style={ms.sub}>No instructors teach that here yet. Try another airport or goal.</Text>}
            {matches.length > 0 && <Text style={[ms.sub, { marginBottom: 10 }]}>Pick up to 3. They’ll answer in Inbox.</Text>}
            {matches.map((m) => {
              const on = picked.includes(m.cfi.id);
              const [label, fg, bg] = strength(m);
              const reason = [...m.reasons.slice(0, 2), ...m.concerns.slice(0, 1).map((x) => x.toLowerCase())].join(' · ');
              return (
                <Card key={m.cfi.id} style={on ? { borderWidth: 2, borderColor: C.navy } : null}>
                  <Pressable onPress={() => pick(m.cfi.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !on && picked.length >= 3 }}
                    accessibilityLabel={`${m.cfi.name}, ${label}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[ms.check, on && { backgroundColor: C.navy, borderColor: C.navy }]}>{on && <Icon name="check" size={16} color="#fff" strokeWidth={3} />}</View>
                    <Avatar initials={m.cfi.initials} color={m.cfi.color} size={44} photo={m.cfi.photo} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontWeight: '800', color: C.text, fontSize: 15 }}>{m.cfi.name}</Text>
                      <Text style={ms.sub}>{m.cfi.certs.join(', ')} · {m.cfi.homeAirport}{m.combinedRate ? ` · $${Math.round(m.combinedRate)}/hr` : ''}</Text>
                    </View>
                    <Tag label={label} color={fg} bg={bg} />
                  </Pressable>
                  {!!reason && <Text style={[ms.sub, { marginTop: 8 }]}>{reason}</Text>}
                  <Pressable onPress={() => nav.push('Cfi', { id: m.cfi.id })} style={ms.link} accessibilityRole="button"><Text style={{ color: C.blue, fontWeight: '700' }}>View profile</Text></Pressable>
                </Card>
              );
            })}
            {sampleOnly && <Text style={[ms.sub, { color: C.amberDark }]}>Sample instructors can’t get requests. Pick instructors listed on Positive Rate.</Text>}
            {!!err && <Text style={ms.err}>{err}</Text>}
          </>
        )}
      </ScrollView>
      <View style={ms.cta}>
        {step === 0
          ? <Button title="See my matches" style={{ flex: 1 }} onPress={() => setStep(1)} />
          : <Button title={busy ? 'Sending…' : picked.length ? `Message ${picked.length} instructor${picked.length > 1 ? 's' : ''}` : 'Pick up to 3 instructors'}
              disabled={busy || !picked.length || sampleOnly} style={{ flex: 1 }} onPress={send} />}
      </View>
    </View>
  );
}

const ANSWER = { sent: ['Waiting', '#B45309', '#FEF3C7'], interested: ['Interested', C.green, '#DDF3E8'], declined: ['Not a fit', C.sub, '#EEF1F5'] };

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
        {params?.sent && <Card style={{ backgroundColor: '#DDF3E8' }}><Text style={{ fontWeight: '800', color: C.green }}>Request sent ✓ We’ll notify you when an instructor answers.</Text></Card>}
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
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.chevron, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  days: { flexDirection: 'row' },
  day: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  dayOn: { backgroundColor: C.navy, borderColor: C.navy },
  kicker: { color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  link: { minHeight: 44, justifyContent: 'center' },
  answer: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: 16, paddingBottom: 28, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
