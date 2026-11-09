import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useStore, money } from '../store';
import { SYLLABUS } from '../data';
import { PPL_MINIMUMS, costProjection, hoursUntil, money2, r2 } from '../logic';
import { ALL_LESSONS, lessonState, doneCount, nextLessons, allHours, allEndorsements, upcomingEndorsements, hasPrior } from '../progress';
import { C, Card, Avatar, SectionTitle, Button, Row, Tag, Chip, Toggle } from '../ui';
import { DebriefCard, FocusAreas } from './Debrief';
import { useAuth } from '../backend/auth';
import LiveTraining from './LiveTraining';
import { LibraryCard } from './Library';

function Bar({ value, extra = 0, max, color = C.blue }) {
  const a = Math.max(0, Math.min(1, max ? value / max : 0));
  const b = Math.max(0, Math.min(1 - a, max ? extra / max : 0));
  const full = a + b >= 1;
  return (
    <View style={t.bar}>
      <View style={[t.barFill, { width: `${a * 100}%`, backgroundColor: full ? C.green : color }]} />
      {b > 0 && <View style={[t.barFill, { width: `${b * 100}%`, backgroundColor: full ? '#86EFAC' : '#93C5FD' }]} />}
    </View>
  );
}

const STATE_UI = {
  app: { icon: '✓', color: '#fff', bg: C.green, border: C.green, tag: null },
  confirmed: { icon: '✓', color: '#fff', bg: '#60A5FA', border: '#60A5FA', tag: ['Prior · confirmed', '#1D4ED8', '#DBEAFE'] },
  prior: { icon: '✓', color: '#60A5FA', bg: '#fff', border: '#93C5FD', tag: ['Prior · self-reported', '#1D4ED8', '#EFF6FF'] },
  rusty: { icon: '↺', color: '#B45309', bg: '#FEF3C7', border: '#F59E0B', tag: ['Review', '#B45309', '#FEF3C7'] },
  todo: { icon: '', color: C.sub, bg: '#fff', border: C.line, tag: null },
};

// Signed in: the real training record. Guests see the sample one.
export default function Training({ nav }) {
  const auth = useAuth();
  if (auth?.session) return <LiveTraining nav={nav} />;
  return <DemoTraining nav={nav} />;
}

function DemoTraining({ nav }) {
  const { training, getCfi, getPlane, available, markLessonPrior, setSharing, cfis } = useStore();
  const debriefs = [...training.debriefs].sort((a, b) => new Date(b.when) - new Date(a.when));
  const unread = debriefs.filter((d) => !d.acknowledged && !d.pending).length;
  const [open, setOpen] = useState(1);
  const [editing, setEditing] = useState(null);
  const cfi = getCfi(training.cfiId);
  const plane = getPlane(training.planeId);
  const H = allHours(training);
  const P = training.prior?.hours || {};
  const done = doneCount(training);
  const pct = Math.round((done / ALL_LESSONS.length) * 100);
  const nextLesson = nextLessons(training, 1)[0];
  const proj = costProjection(training, cfi, plane, H.total);
  const metCount = PPL_MINIMUMS.filter((m) => H[m.key] >= m.req).length;
  const prior = hasPrior(training) ? training.prior : null;
  const confirmedBy = prior?.confirmedBy ? getCfi(prior.confirmedBy) : null;
  let idx = 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 110 }}>
      <View style={t.hero}>
        <Text style={t.kicker}>MY TRAINING</Text>
        <Text style={t.title}>{training.program}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          {cfi && <Avatar initials={cfi.initials} color={cfi.color} photo={cfi.photo} size={30} />}
          <Text style={{ color: '#D6E2F3', marginLeft: 8 }}>with {cfi?.name} · {plane?.tail}</Text>
        </View>
        <View style={t.ringRow}>
          <View style={t.stat}><Text style={t.big}>{pct}%</Text><Text style={t.small}>syllabus</Text></View>
          <View style={t.stat}><Text style={t.big}>{H.total}</Text><Text style={t.small}>total hrs{prior ? ` (${r2(P.total || 0)} prior)` : ''}</Text></View>
          <View style={t.stat}><Text style={t.big}>{metCount}/{PPL_MINIMUMS.length}</Text><Text style={t.small}>FAA mins met</Text></View>
        </View>
        <Bar value={training.appDone.length} extra={done - training.appDone.length} max={ALL_LESSONS.length} color="#60A5FA" />
      </View>

      <View style={{ padding: 16 }}>
        <LibraryCard nav={nav} />
        {prior ? (
          <Card style={{ borderLeftWidth: 4, borderLeftColor: prior.status === 'confirmed' ? C.green : '#60A5FA' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontWeight: '900', color: C.text, fontSize: 16 }}>Previous experience</Text>
              <Tag label={prior.status === 'confirmed' ? `Confirmed by ${confirmedBy?.name.split(' ')[0] || 'CFI'}` : 'Self-reported'} color={prior.status === 'confirmed' ? C.green : '#1D4ED8'} bg={prior.status === 'confirmed' ? '#E3F7EF' : '#EFF6FF'} />
            </View>
            <Text style={{ color: C.sub, marginTop: 4, fontSize: 13 }}>
              {r2(P.total || 0)} hrs · {Object.values(prior.lessons).filter((v) => v === 'done').length} lessons covered · {prior.endorsements.length} endorsements{prior.where ? ` · ${prior.where}` : ''}
            </Text>
            {prior.status !== 'confirmed' && (
              <Text style={{ color: C.navy, fontSize: 12, marginTop: 6 }}>Shared with {cfi?.name.split(' ')[0]}. They’ll confirm it after reviewing your logbook, usually on an assessment flight.</Text>
            )}
            <Pressable onPress={() => nav.push('PriorExperience', {})}><Text style={{ color: C.blue, fontWeight: '800', marginTop: 8 }}>Update ›</Text></Pressable>
          </Card>
        ) : (
          <Card style={{ backgroundColor: C.sky }}>
            <Text style={{ fontWeight: '900', color: C.navy, fontSize: 16 }}>Trained somewhere before?</Text>
            <Text style={{ color: C.navy, marginTop: 4, lineHeight: 19 }}>Add your previous hours, lessons and endorsements so your CFI picks up where you left off. Snap your logbook and we’ll fill it in.</Text>
            <Button title="Add previous experience" style={{ marginTop: 10, paddingVertical: 12 }} onPress={() => nav.push('PriorExperience', {})} />
          </Card>
        )}

        {nextLesson && (
          <Card style={{ borderLeftWidth: 4, borderLeftColor: C.blue }}>
            <Text style={{ color: C.sub, fontSize: 12, fontWeight: '700' }}>NEXT UP</Text>
            <Text style={{ fontWeight: '900', fontSize: 17, color: C.text, marginTop: 2 }}>{nextLesson}</Text>
            <Text style={{ color: C.sub, marginTop: 2 }}>with {cfi?.name.split(' ')[0]} in {plane?.tail}</Text>
            <Button title="Book next lesson" style={{ marginTop: 10, paddingVertical: 12 }}
              onPress={() => nav.push('Request', { cfiId: cfi?.id, planeId: plane?.id, goal: /cross/i.test(nextLesson) ? 'Dual cross-country' : /night/i.test(nextLesson) ? 'Night flying' : 'Private Pilot lesson', flightHours: /cross/i.test(nextLesson) ? 2 : 1.5 })} />
          </Card>
        )}

        <SectionTitle right={<Pressable onPress={() => nav.push('Debriefs')}><Text style={{ color: C.blue, fontWeight: '700' }}>All {debriefs.length} ›</Text></Pressable>}>
          Debriefs{unread ? ` · ${unread} new` : ''}
        </SectionTitle>
        {debriefs.slice(0, 2).map((d) => <DebriefCard key={d.id} db={d} nav={nav} />)}
        <Text style={t.subhead}>Recurring focus areas</Text>
        <FocusAreas debriefs={debriefs} />

        <SectionTitle>Who can see my record</SectionTitle>
        <Card>
          {training.sharing.cfiIds.map((id) => cfis.find((c) => c.id === id)).filter(Boolean).map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
              <Avatar initials={c.initials} color={c.color} photo={c.photo} size={30} />
              <Text style={{ flex: 1, marginLeft: 10, color: C.text, fontWeight: '600' }}>{c.name}</Text>
              <Pressable onPress={() => nav.push('StudentFile', { viewerId: c.id, preview: true })}><Text style={{ color: C.blue, fontWeight: '700', fontSize: 12 }}>See what they see</Text></Pressable>
              {c.id !== training.cfiId && (
                <Pressable onPress={() => setSharing({ cfiIds: training.sharing.cfiIds.filter((x) => x !== c.id) })} hitSlop={8}><Text style={{ color: C.sub, fontSize: 18, marginLeft: 10 }}>×</Text></Pressable>
              )}
            </View>
          ))}
          <Toggle label="Include debrief notes" hint="Lets a new CFI read past debriefs so they pick up where you left off" value={training.sharing.includeDebriefs} onValueChange={(v) => setSharing({ includeDebriefs: v })} />
          <Text style={t.note}>Your record and debriefs belong to you. They stay with you if you change instructors, and you choose who sees them.</Text>
        </Card>

        <SectionTitle>Cost to checkride</SectionTitle>
        <Card>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}><Text style={t.label}>Spent on Positive Rate</Text><Text style={t.money}>{money(training.spent)}</Text></View>
            <View style={{ flex: 1 }}><Text style={t.label}>Est. remaining</Text><Text style={t.money}>{money(proj.est)}</Text></View>
            <View style={{ flex: 1 }}><Text style={t.label}>Projected</Text><Text style={[t.money, { color: C.blue }]}>{money(proj.projected)}</Text></View>
          </View>
          <Bar value={training.spent} max={proj.projected} color={C.navy} />
          <Text style={t.note}>
            Based on ~{training.targetHours} hrs to checkride ({proj.remaining} to go{prior ? ', counting your previous hours' : ''}), your CFI’s rate, {plane?.tail} at {money(plane?.wetRate || 0)}/hr, plus the written test, examiner fee and supplies.
          </Text>
        </Card>

        <SectionTitle>FAA minimums · 61.109</SectionTitle>
        <Card>
          {PPL_MINIMUMS.map((m) => (
            <View key={m.key} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: C.text, fontWeight: '600' }}>{H[m.key] >= m.req ? '✓ ' : ''}{m.label}</Text>
                <Text style={{ color: C.sub, fontWeight: '700' }}>{H[m.key]} / {m.req} hr</Text>
              </View>
              <Bar value={training.hours[m.key]} extra={P[m.key] || 0} max={m.req} />
            </View>
          ))}
          {prior && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <View style={[t.legend, { backgroundColor: C.blue }]} /><Text style={t.legendText}>Logged in Positive Rate</Text>
              <View style={[t.legend, { backgroundColor: '#93C5FD', marginLeft: 12 }]} /><Text style={t.legendText}>Previous ({prior.status === 'confirmed' ? 'confirmed' : 'self-reported'})</Text>
            </View>
          )}
          <Text style={t.note}>
            Knowledge test: {training.knowledgeTest.status} ({training.knowledgeTest.score}%) · {training.knowledgeTest.date}
          </Text>
        </Card>

        <SectionTitle>Syllabus</SectionTitle>
        <Text style={t.note}>Tap a lesson to mark something you covered in previous training. Your CFI confirms it.</Text>
        {SYLLABUS.map((s, si) => {
          const start = idx;
          idx += s.lessons.length;
          const stageDone = s.lessons.filter((l) => ['app', 'prior', 'confirmed'].includes(lessonState(training, l))).length;
          return (
            <Card key={s.stage}>
              <Pressable onPress={() => setOpen(open === si ? -1 : si)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontWeight: '800', color: C.text }}>{s.stage}</Text>
                <Text style={{ color: stageDone === s.lessons.length ? C.green : C.sub, fontWeight: '700' }}>{stageDone}/{s.lessons.length} {open === si ? '▾' : '▸'}</Text>
              </Pressable>
              {open === si && s.lessons.map((l) => {
                const st = lessonState(training, l);
                const ui = STATE_UI[st];
                const isNext = l === nextLesson;
                return (
                  <View key={l}>
                    <Pressable onPress={() => st !== 'app' && setEditing(editing === l ? null : l)} style={t.lesson}>
                      <View style={[t.dot, { backgroundColor: ui.bg, borderColor: isNext && st === 'todo' ? C.blue : ui.border }]}>
                        <Text style={{ color: ui.color, fontSize: 11, fontWeight: '900' }}>{ui.icon}</Text>
                      </View>
                      <Text style={{ flex: 1, color: st === 'todo' ? C.sub : C.text, fontWeight: isNext ? '800' : '500' }}>{l}</Text>
                      {ui.tag ? <Tag label={ui.tag[0]} color={ui.tag[1]} bg={ui.tag[2]} /> : isNext ? <Tag label="Next" /> : null}
                    </Pressable>
                    {editing === l && (
                      <View style={t.editRow}>
                        <Chip small label="Done before" active={training.prior?.lessons?.[l] === 'done'} onPress={() => { markLessonPrior(l, 'done'); setEditing(null); }} />
                        <Chip small label="Done, but rusty" active={training.prior?.lessons?.[l] === 'rusty'} onPress={() => { markLessonPrior(l, 'rusty'); setEditing(null); }} />
                        <Chip small label="Not yet" active={!training.prior?.lessons?.[l]} onPress={() => { markLessonPrior(l, null); setEditing(null); }} />
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
          );
        })}

        <SectionTitle>Endorsements</SectionTitle>
        <Card>
          {allEndorsements(training).map((e, i) => {
            const days = e.expires ? Math.ceil(hoursUntil(e.expires) / 24) : null;
            return (
              <View key={i} style={t.endorse}>
                <Text style={{ color: e.prior && !e.confirmed ? '#60A5FA' : C.green, fontWeight: '900', width: 22 }}>✓</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: '700' }}>{e.name}</Text>
                  <Text style={{ color: C.sub, fontSize: 12 }}>{e.ref} · {e.date || 'date not entered'}{e.by ? ` · ${e.by}` : ''}</Text>
                </View>
                {e.prior ? <Tag label={e.confirmed ? 'Prior · confirmed' : 'Self-reported'} color="#1D4ED8" bg="#EFF6FF" />
                  : days != null ? <Tag label={days > 0 ? `${days} days left` : 'Expired'} color={days < 14 ? '#B45309' : C.green} bg={days < 14 ? '#FEF3C7' : '#E3F7EF'} /> : null}
              </View>
            );
          })}
          {upcomingEndorsements(training).map((e) => (
            <View key={e.name} style={t.endorse}>
              <Text style={{ color: C.line, fontWeight: '900', width: 22 }}>○</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.sub, fontWeight: '700' }}>{e.name}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>{e.ref} · not yet</Text>
              </View>
            </View>
          ))}
        </Card>

        <View style={t.lock}>
          <Text style={{ fontWeight: '800', color: C.navy }}>Your record builds itself</Text>
          <Text style={{ color: C.navy, fontSize: 13, marginTop: 4, lineHeight: 19 }}>
            Every lesson booked in Positive Rate adds hours, syllabus progress and signed endorsements automatically when your CFI closes out the flight. Previous experience stays marked until a CFI confirms it.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const t = StyleSheet.create({
  hero: { backgroundColor: C.navy, padding: 16, paddingTop: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  kicker: { color: '#7FA6D8', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  title: { color: '#fff', fontWeight: '900', fontSize: 22, marginTop: 4 },
  ringRow: { flexDirection: 'row', marginTop: 16, marginBottom: 12 },
  stat: { flex: 1 },
  big: { color: '#fff', fontSize: 24, fontWeight: '900' },
  small: { color: '#AFC3E0', fontSize: 12 },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#E3E7EE', overflow: 'hidden', marginTop: 6, flexDirection: 'row' },
  barFill: { height: 8 },
  label: { color: C.sub, fontSize: 12, fontWeight: '700' },
  money: { color: C.text, fontSize: 20, fontWeight: '900', marginTop: 2 },
  note: { color: C.sub, fontSize: 12, marginTop: 8, marginBottom: 6, lineHeight: 17 },
  lesson: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  editRow: { flexDirection: 'row', flexWrap: 'wrap', marginLeft: 30, marginBottom: 4 },
  endorse: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  legend: { width: 10, height: 10, borderRadius: 2, marginRight: 4 },
  legendText: { color: C.sub, fontSize: 11 },
  subhead: { fontSize: 14, fontWeight: '800', color: C.text, marginTop: 6, marginBottom: 8 },
  lock: { backgroundColor: C.sky, borderRadius: 14, padding: 14, marginTop: 6 },
});
