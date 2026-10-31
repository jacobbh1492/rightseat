import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { GRADES, gradeOf, MANEUVERS, HOMEWORK, focusAreas, isEmptyDebrief, lockInfo, effectiveGrades, unreadAmendments, AMEND_TYPES } from '../debrief';
import { PPL_MINIMUMS } from '../logic';
import { ALL_LESSONS, doneCount, allHours, hasPrior, allEndorsements } from '../progress';
import { C, Card, SectionTitle, Button, Tag, Chip, Avatar, Row } from '../ui';
import { PlaneImage } from '../art';
import { Header } from './Details';

export function GradePill({ grade }) {
  const g = gradeOf(grade);
  return <Tag label={g.label} color={g.color} bg={g.bg} />;
}

// ---------- CFI editor (used inside close-out and for finishing a pending debrief) ----------
export function DebriefEditor({ value, onChange, suggested = [], carryOver = [] }) {
  const [adding, setAdding] = useState(false);
  const [hw, setHw] = useState('');
  const v = value;
  const set = (k, x) => onChange({ ...v, [k]: x });
  const items = v.grades.map((g) => g.item);
  const addItem = (item) => !items.includes(item) && set('grades', [...v.grades, { item, grade: 'practice' }]);
  const setGrade = (item, grade) => set('grades', v.grades.map((g) => (g.item === item ? { ...g, grade } : g)));
  const remove = (item) => set('grades', v.grades.filter((g) => g.item !== item));
  const toggleHw = (t) => set('homework', v.homework.includes(t) ? v.homework.filter((x) => x !== t) : [...v.homework, t]);
  const quick = [...new Set([...carryOver, ...suggested])].filter((x) => !items.includes(x));

  return (
    <View>
      <Text style={s.label}>Grade what you worked on</Text>
      {quick.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
          {quick.slice(0, 6).map((x) => <Chip key={x} small label={`+ ${x}${carryOver.includes(x) ? ' ↺' : ''}`} onPress={() => addItem(x)} />)}
        </View>
      )}
      {carryOver.length > 0 && <Text style={s.hint}>↺ = flagged in an earlier debrief</Text>}
      {v.grades.map((g) => (
        <View key={g.item} style={s.gradeRow}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '700', color: C.text, flex: 1 }}>{g.item}</Text>
            <Pressable onPress={() => remove(g.item)} hitSlop={8}><Text style={{ color: C.sub, fontSize: 18 }}>×</Text></Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
            {GRADES.map((gr) => (
              <Pressable key={gr.key} onPress={() => setGrade(g.item, gr.key)} style={[s.gradeChip, g.grade === gr.key && { backgroundColor: gr.bg, borderColor: gr.color }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: g.grade === gr.key ? gr.color : C.sub }}>{gr.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Pressable onPress={() => setAdding(!adding)}><Text style={{ color: C.blue, fontWeight: '700', marginVertical: 6 }}>{adding ? 'Done adding' : '+ Add maneuver'}</Text></Pressable>
      {adding && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {MANEUVERS.filter((m) => !items.includes(m)).map((m) => <Chip key={m} small label={m} onPress={() => addItem(m)} />)}
        </View>
      )}

      <Text style={s.label}>What went well</Text>
      <TextInput multiline value={v.wentWell} onChangeText={(x) => set('wentWell', x)} placeholder="Specific wins. Students remember these." placeholderTextColor="#9AA3B2" style={s.area} />
      <Text style={s.label}>What needs work</Text>
      <TextInput multiline value={v.needsWork} onChangeText={(x) => set('needsWork', x)} placeholder="What to fix and how to fix it" placeholderTextColor="#9AA3B2" style={s.area} />
      <Text style={s.label}>Plan for next lesson</Text>
      <TextInput multiline value={v.nextPlan} onChangeText={(x) => set('nextPlan', x)} placeholder="So the next lesson (or a new CFI) knows where to start" placeholderTextColor="#9AA3B2" style={s.area} />

      <Text style={s.label}>Homework</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {[...HOMEWORK, ...v.homework.filter((x) => !HOMEWORK.includes(x))].map((h) => <Chip key={h} small label={h} active={v.homework.includes(h)} onPress={() => toggleHw(h)} />)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput value={hw} onChangeText={setHw} placeholder="Custom assignment…" placeholderTextColor="#9AA3B2" style={[s.input, { flex: 1 }]} />
        <Pressable onPress={() => { if (hw.trim()) { set('homework', [...v.homework, hw.trim()]); setHw(''); } }} style={s.addBtn}><Text style={{ color: '#fff', fontWeight: '900' }}>+</Text></Pressable>
      </View>
    </View>
  );
}

export const emptyDebrief = () => ({ grades: [], wentWell: '', needsWork: '', nextPlan: '', homework: [] });

export function EditDebrief({ nav, params }) {
  const { getDebrief, editDebrief, training } = useStore();
  const db = getDebrief(params.id);
  const lock = lockInfo(db);
  const [v, setV] = useState({ grades: db.grades, wentWell: db.wentWell, needsWork: db.needsWork, nextPlan: db.nextPlan, homework: db.homework.map((h) => h.text) });
  const carry = focusAreas(training.debriefs.filter((x) => x.id !== db.id)).map((f) => f.item);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={db.pending ? 'Write debrief' : 'Edit debrief'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Text style={{ fontWeight: '900', fontSize: 18, color: C.text }}>{db.goal}</Text>
        <Text style={{ color: C.sub, marginBottom: 12 }}>{db.date} · {db.flightHours} hr</Text>
        {lock.locked ? (
          <Card style={{ backgroundColor: '#FEF3C7' }}>
            <Text style={{ fontWeight: '800', color: '#92400E' }}>🔒 This debrief is locked</Text>
            <Text style={{ color: '#92400E', marginTop: 4 }}>{lock.reason}. Add an amendment instead. The original stays on record.</Text>
          </Card>
        ) : (
          <>
            {!db.pending && <Text style={s.hint}>{lock.reason}.</Text>}
            <DebriefEditor value={v} onChange={setV} carryOver={carry} />
          </>
        )}
      </ScrollView>
      <View style={s.cta}>
        {lock.locked ? (
          <Button title="Add amendment" style={{ flex: 1 }} onPress={() => nav.replace('AmendDebrief', { id: db.id })} />
        ) : (
          <Button title="Save debrief" disabled={isEmptyDebrief(v)} style={{ flex: 1 }}
            onPress={() => {
              const prev = Object.fromEntries((db.homework || []).map((h) => [h.text, h.done]));
              editDebrief(db.id, { ...v, homework: v.homework.map((t) => ({ text: t, done: !!prev[t] })) });
              nav.pop();
            }} />
        )}
      </View>
    </View>
  );
}

// ---------- Student / reader view ----------
export function DebriefView({ nav, params }) {
  const { getDebrief, getCfi, getPlane, toggleHomework, reviewDebrief } = useStore();
  const db = getDebrief(params.id);
  const [note, setNote] = useState(db?.studentNote || '');
  if (!db) return null;
  const cfi = getCfi(db.cfiId);
  const plane = getPlane(db.planeId);
  const readOnly = params.as === 'cfi';
  const isAuthor = readOnly && params.viewerId === db.cfiId;
  const lock = lockInfo(db);
  const grades = effectiveGrades(db);
  const unread = unreadAmendments(db);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Debrief" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          {cfi ? <Avatar initials={cfi.initials} color={cfi.color} photo={cfi.photo} size={46} /> : plane && <PlaneImage plane={plane} size={46} />}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontWeight: '900', fontSize: 17, color: C.text }}>{db.goal}</Text>
            <Text style={{ color: C.sub }}>{db.date} · {db.flightHours} hr flight{db.groundHours ? ` + ${db.groundHours} ground` : ''}{plane ? ` · ${plane.tail}` : ''}</Text>
            <Text style={{ color: C.sub, fontSize: 12 }}>{cfi ? `Debrief by ${cfi.name}, ${cfi.certs.join('/')}` : 'Solo flight'}</Text>
            {!db.pending && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                {lock.locked ? <Tag label="🔒 Locked" color={C.navy} bg="#E2E8F0" /> : <Tag label="Editable by CFI" color={C.sub} bg="#EEF1F5" />}
                {(db.amendments || []).length > 0 && <Tag label={`${db.amendments.length} amendment${db.amendments.length > 1 ? 's' : ''}`} color="#7C3AED" bg="#F3E8FF" />}
                {db.editedAt && <Tag label={`Edited ${db.editedAt}`} color={C.sub} bg="#EEF1F5" />}
              </View>
            )}
          </View>
        </Card>
        {!db.pending && <Text style={s.hint}>{lock.reason}.</Text>}
        {unread > 0 && !readOnly && (
          <Card style={{ backgroundColor: '#F3E8FF' }}>
            <Text style={{ fontWeight: '800', color: '#6D28D9' }}>{cfi?.name.split(' ')[0]} added {unread === 1 ? 'an amendment' : `${unread} amendments`}</Text>
            <Text style={{ color: '#6D28D9', marginTop: 2 }}>See “Amendments” below. The original debrief is unchanged.</Text>
          </Card>
        )}

        {db.pending ? (
          <Card style={{ backgroundColor: '#FEF3C7' }}>
            <Text style={{ fontWeight: '800', color: '#92400E' }}>Debrief pending</Text>
            <Text style={{ color: '#92400E', marginTop: 4 }}>{cfi ? `${cfi.name.split(' ')[0]} hasn’t written this one yet. We’ve sent a reminder.` : 'Solo flights don’t have an instructor debrief.'}</Text>
          </Card>
        ) : (
          <>
            {grades.length > 0 && (
              <>
                <SectionTitle>Maneuvers</SectionTitle>
                <Card>
                  {grades.map((g) => (
                    <View key={g.item} style={s.viewGrade}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.text, fontWeight: '600' }}>{g.item}</Text>
                        {g.amended && <Text style={{ color: '#7C3AED', fontSize: 11 }}>Amended · originally “{gradeOf(g.original).label}”</Text>}
                      </View>
                      <GradePill grade={g.grade} />
                    </View>
                  ))}
                </Card>
              </>
            )}
            {db.wentWell ? (<><SectionTitle>What went well</SectionTitle><Card style={{ borderLeftWidth: 4, borderLeftColor: C.green }}><Text style={s.body}>{db.wentWell}</Text></Card></>) : null}
            {db.needsWork ? (<><SectionTitle>What needs work</SectionTitle><Card style={{ borderLeftWidth: 4, borderLeftColor: '#F59E0B' }}><Text style={s.body}>{db.needsWork}</Text></Card></>) : null}
            {db.nextPlan ? (<><SectionTitle>Next lesson</SectionTitle><Card style={{ borderLeftWidth: 4, borderLeftColor: C.blue }}><Text style={s.body}>{db.nextPlan}</Text></Card></>) : null}
            {db.homework.length > 0 && (
              <>
                <SectionTitle>Homework</SectionTitle>
                <Card>
                  {db.homework.map((h, i) => (
                    <Pressable key={i} disabled={readOnly} onPress={() => toggleHomework(db.id, i)} style={s.hwRow}>
                      <View style={[s.box, h.done && { backgroundColor: C.green, borderColor: C.green }]}>{h.done && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>✓</Text>}</View>
                      <Text style={{ flex: 1, color: h.done ? C.sub : C.text, textDecorationLine: h.done ? 'line-through' : 'none' }}>{h.text}</Text>
                    </Pressable>
                  ))}
                </Card>
              </>
            )}

            {(db.amendments || []).length > 0 && (
              <>
                <SectionTitle>Amendments</SectionTitle>
                {db.amendments.map((a) => (
                  <Card key={a.id} style={{ borderLeftWidth: 4, borderLeftColor: '#7C3AED' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: '800', color: '#6D28D9' }}>{a.type}</Text>
                      {!a.read && !readOnly ? <Tag label="New" color="#6D28D9" bg="#F3E8FF" /> : null}
                    </View>
                    <Text style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>{a.at} · {getCfi(a.by)?.name}</Text>
                    <Text style={s.body}>{a.text}</Text>
                    {(a.gradeChanges || []).map((c) => (
                      <Text key={c.item} style={{ color: C.text, fontSize: 13, marginTop: 6 }}>
                        {c.item}: {gradeOf(c.from).label} → <Text style={{ fontWeight: '800' }}>{gradeOf(c.to).label}</Text>
                      </Text>
                    ))}
                  </Card>
                ))}
              </>
            )}

            {!readOnly ? (
              <>
                <SectionTitle>Your notes</SectionTitle>
                <TextInput multiline value={note} onChangeText={setNote} placeholder="Questions or reflections (visible to your CFI)" placeholderTextColor="#9AA3B2" style={s.area} />
                {cfi && <Pressable onPress={() => nav.push('Chat', { key: cfi.id })}><Text style={{ color: C.blue, fontWeight: '800', marginTop: 4 }}>Ask {cfi.name.split(' ')[0]} a question ›</Text></Pressable>}
              </>
            ) : db.studentNote ? (
              <><SectionTitle>Student’s note</SectionTitle><Card><Text style={s.body}>{db.studentNote}</Text></Card></>
            ) : null}
          </>
        )}
      </ScrollView>
      {!readOnly && !db.pending && (
        <View style={s.cta}>
          {(() => {
            const clean = db.acknowledged && note.trim() === db.studentNote && unread === 0;
            const title = clean ? '✓ Reviewed' : !db.acknowledged ? 'Mark as reviewed' : unread ? 'Mark amendment as read' : 'Save note';
            return <Button title={title} variant={clean ? 'outline' : 'primary'} disabled={clean} style={{ flex: 1 }} onPress={() => reviewDebrief(db.id, note.trim())} />;
          })()}
        </View>
      )}
      {isAuthor && !db.pending && (
        <View style={s.cta}>
          <Button title={lock.locked ? 'Add amendment' : 'Edit debrief'} style={{ flex: 1 }} onPress={() => nav.push(lock.locked ? 'AmendDebrief' : 'EditDebrief', { id: db.id })} />
        </View>
      )}
    </View>
  );
}

export function DebriefCard({ db, nav, as, viewerId }) {
  const { getCfi } = useStore();
  const cfi = getCfi(db.cfiId);
  const grades = effectiveGrades(db);
  const weak = grades.filter((g) => g.grade === 'practice' || g.grade === 'intro').length;
  const amendNew = as !== 'cfi' && unreadAmendments(db) > 0;
  const hwLeft = db.homework.filter((h) => !h.done).length;
  return (
    <Card onPress={() => nav.push('Debrief', { id: db.id, as, viewerId })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: '800', color: C.text, flex: 1 }}>{db.goal}</Text>
        {db.pending ? <Tag label="Pending" color="#B45309" bg="#FEF3C7" /> : amendNew ? <Tag label="Amended · new" color="#6D28D9" bg="#F3E8FF" /> : !db.acknowledged && as !== 'cfi' ? <Tag label="New" /> : (db.amendments || []).length ? <Tag label="Amended" color="#7C3AED" bg="#F3E8FF" /> : null}
      </View>
      <Text style={{ color: C.sub, fontSize: 12, marginTop: 1 }}>{db.date} · {cfi ? cfi.name : 'Solo'} · {db.flightHours} hr</Text>
      {!db.pending && db.nextPlan ? <Text style={{ color: C.text, marginTop: 6 }} numberOfLines={2}><Text style={{ fontWeight: '800' }}>Next: </Text>{db.nextPlan}</Text> : null}
      {!db.pending && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {grades.slice(0, 3).map((g) => <GradePill key={g.item} grade={g.grade} />)}
          {grades.length > 3 && <Tag label={`+${grades.length - 3}`} color={C.sub} bg="#EEF1F5" />}
          {weak > 0 && <Text style={{ color: '#B45309', fontSize: 12, fontWeight: '700', marginLeft: 2, alignSelf: 'center' }}>{weak} to practice</Text>}
          {hwLeft > 0 && as !== 'cfi' && <Text style={{ color: C.blue, fontSize: 12, fontWeight: '700', marginLeft: 8, alignSelf: 'center' }}>{hwLeft} homework</Text>}
        </View>
      )}
    </Card>
  );
}

export function FocusAreas({ debriefs }) {
  const f = focusAreas(debriefs.filter((d) => !d.pending)).slice(0, 4);
  if (!f.length) return null;
  return (
    <Card>
      {f.map((x) => (
        <View key={x.item} style={s.viewGrade}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: '700' }}>{x.item}</Text>
            <Text style={{ color: C.sub, fontSize: 12 }}>Flagged in {x.weak} of {x.seen} debrief{x.seen > 1 ? 's' : ''}</Text>
          </View>
          <GradePill grade={x.latest} />
        </View>
      ))}
    </Card>
  );
}

export function DebriefList({ nav }) {
  const { training, getCfi } = useStore();
  const [who, setWho] = useState('all');
  const cfiIds = [...new Set(training.debriefs.map((d) => d.cfiId).filter(Boolean))];
  const list = [...training.debriefs].filter((d) => who === 'all' || d.cfiId === who).sort((a, b) => new Date(b.when) - new Date(a.when));
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="All debriefs" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          <Chip small label={`All (${training.debriefs.length})`} active={who === 'all'} onPress={() => setWho('all')} />
          {cfiIds.map((id) => <Chip key={id} small label={getCfi(id)?.name || 'CFI'} active={who === id} onPress={() => setWho(id)} />)}
        </View>
        <SectionTitle>Recurring focus areas</SectionTitle>
        <FocusAreas debriefs={training.debriefs} />
        <SectionTitle>Flights</SectionTitle>
        {list.map((d) => <DebriefCard key={d.id} db={d} nav={nav} />)}
      </ScrollView>
    </View>
  );
}

// ---------- What a (new) CFI sees when a student shares their record ----------
export function StudentFile({ nav, params }) {
  const { training, getCfi, pilot } = useStore();
  const viewer = getCfi(params.viewerId);
  const shared = training.sharing.cfiIds.includes(params.viewerId);
  const showDebriefs = shared && training.sharing.includeDebriefs;
  const H = allHours(training);
  const done = doneCount(training);
  const debriefs = [...training.debriefs].filter((d) => !d.pending).sort((a, b) => new Date(b.when) - new Date(a.when));
  const last = debriefs[0];
  const lastCfi = last && getCfi(last.cfiId);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Student file" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={s.demo}>Viewing as {viewer?.name}{params.preview ? ' (preview of what they see)' : ''}</Text>
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Avatar initials="SC" color="#0891B2" size={50} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontWeight: '900', fontSize: 18, color: C.text }}>{pilot.name}</Text>
            <Text style={{ color: C.sub }}>{training.program}</Text>
            <Text style={{ color: C.sub, fontSize: 12 }}>{pilot.certificate} pilot · {pilot.medical} · ID verified</Text>
          </View>
        </Card>
        {!shared ? (
          <Card style={{ backgroundColor: '#FEF3C7' }}><Text style={{ color: '#92400E' }}>This student hasn’t shared their training record with you yet.</Text></Card>
        ) : (
          <>
            <Card style={{ flexDirection: 'row', paddingVertical: 10 }}>
              <View style={s.kpi}><Text style={s.kpiVal}>{H.total}</Text><Text style={s.kpiLabel}>Total hrs</Text></View>
              <View style={s.kpi}><Text style={s.kpiVal}>{Math.round((done / ALL_LESSONS.length) * 100)}%</Text><Text style={s.kpiLabel}>Syllabus</Text></View>
              <View style={s.kpi}><Text style={s.kpiVal}>{PPL_MINIMUMS.filter((m) => H[m.key] >= m.req).length}/8</Text><Text style={s.kpiLabel}>FAA mins</Text></View>
            </Card>
            {hasPrior(training) && <Text style={s.hint}>Includes {training.prior.hours.total} hrs previous experience ({training.prior.status === 'confirmed' ? 'confirmed' : 'self-reported'}).</Text>}

            {showDebriefs && last && (
              <>
                <SectionTitle>Where they left off</SectionTitle>
                <Card style={{ borderLeftWidth: 4, borderLeftColor: C.blue }}>
                  <Text style={{ color: C.sub, fontSize: 12 }}>Last debrief · {last.date} · {lastCfi?.name}</Text>
                  <Text style={[s.body, { marginTop: 4 }]}><Text style={{ fontWeight: '800' }}>Next planned: </Text>{last.nextPlan}</Text>
                  {last.needsWork ? <Text style={[s.body, { marginTop: 6 }]}><Text style={{ fontWeight: '800' }}>Working on: </Text>{last.needsWork}</Text> : null}
                </Card>
                <SectionTitle>Recurring focus areas</SectionTitle>
                <FocusAreas debriefs={debriefs} />
              </>
            )}

            <SectionTitle>Endorsements</SectionTitle>
            <Card>
              {allEndorsements(training).map((e, i) => (
                <View key={i} style={s.viewGrade}>
                  <Text style={{ flex: 1, color: C.text }}>{e.name} <Text style={{ color: C.sub, fontSize: 12 }}>{e.ref}</Text></Text>
                  {e.prior ? <Tag label={e.confirmed ? 'Prior · confirmed' : 'Self-reported'} color="#1D4ED8" bg="#EFF6FF" /> : <Text style={{ color: C.sub, fontSize: 12 }}>{e.date}</Text>}
                </View>
              ))}
            </Card>

            <SectionTitle>{showDebriefs ? `Debrief history (${debriefs.length})` : 'Debriefs'}</SectionTitle>
            {showDebriefs ? debriefs.map((d) => <DebriefCard key={d.id} db={d} nav={nav} as="cfi" viewerId={params.viewerId} />) : <Text style={s.hint}>The student chose not to share debrief notes.</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

export function AmendDebrief({ nav, params }) {
  const { getDebrief, addAmendment, getCfi } = useStore();
  const db = getDebrief(params.id);
  const [type, setType] = useState(AMEND_TYPES[0]);
  const [text, setText] = useState('');
  const [changes, setChanges] = useState({});
  const grades = effectiveGrades(db);
  const cfi = getCfi(db.cfiId);
  const save = () => {
    const gradeChanges = Object.entries(changes).filter(([item, to]) => grades.find((g) => g.item === item)?.grade !== to).map(([item, to]) => ({ item, from: grades.find((g) => g.item === item).grade, to }));
    addAmendment(db.id, { by: db.cfiId, type, text: text.trim(), gradeChanges });
    nav.pop();
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Add amendment" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Text style={{ fontWeight: '900', fontSize: 18, color: C.text }}>{db.goal}</Text>
        <Text style={{ color: C.sub, marginBottom: 8 }}>{db.date} · original debrief stays unchanged</Text>
        <Card style={{ backgroundColor: C.sky }}>
          <Text style={{ color: C.navy, lineHeight: 19 }}>Amendments are dated and signed by {cfi?.name}, shown below the original, and the student is notified. Like a logbook correction, nothing is erased.</Text>
        </Card>
        <Text style={s.label}>Type</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {AMEND_TYPES.map((t) => <Chip key={t} small label={t} active={type === t} onPress={() => setType(t)} />)}
        </View>
        <Text style={s.label}>Amendment</Text>
        <TextInput multiline value={text} onChangeText={setText} placeholder="What’s being corrected or added, and why" placeholderTextColor="#9AA3B2" style={[s.area, { minHeight: 110 }]} />
        {grades.length > 0 && (
          <>
            <Text style={s.label}>Change a grade (optional)</Text>
            {grades.map((g) => {
              const cur = changes[g.item] || g.grade;
              return (
                <View key={g.item} style={s.gradeRow}>
                  <Text style={{ fontWeight: '700', color: C.text }}>{g.item}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                    {GRADES.map((gr) => (
                      <Pressable key={gr.key} onPress={() => setChanges({ ...changes, [g.item]: gr.key })} style={[s.gradeChip, cur === gr.key && { backgroundColor: gr.bg, borderColor: gr.color }]}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: cur === gr.key ? gr.color : C.sub }}>{gr.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      <View style={s.cta}>
        <Button title={text.trim().length >= 10 ? 'Sign & add amendment' : 'Write the amendment'} disabled={text.trim().length < 10} style={{ flex: 1 }} onPress={save} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '800', color: C.text, marginTop: 14, marginBottom: 6 },
  hint: { color: C.sub, fontSize: 12, marginBottom: 6 },
  gradeRow: { backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 8 },
  gradeChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: C.line, marginRight: 6, marginBottom: 6, backgroundColor: '#fff' },
  area: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, minHeight: 72, fontSize: 15, color: C.text, textAlignVertical: 'top' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text },
  addBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  viewGrade: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F1F3F7' },
  body: { color: C.text, lineHeight: 21, fontSize: 15 },
  hwRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.line, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  kpi: { flex: 1, alignItems: 'center' },
  kpiVal: { fontSize: 20, fontWeight: '900', color: C.navy },
  kpiLabel: { fontSize: 11, color: C.sub, marginTop: 2 },
  demo: { color: C.sub, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: '#fff', padding: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.line },
});
