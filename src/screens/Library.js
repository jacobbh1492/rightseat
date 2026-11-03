import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { C, Card, Button, Chip, Tag, Field, Icon } from '../ui';
import { Header } from './Details';
import Diagram from '../library/Diagram';
import { useLibrary } from '../library/useLibrary';
import { GROUPS, LESSON_COUNT, getLesson, certsOf, FILTERS, matchesFilter, standardsFor, acsRef, refsOf, searchLessons } from '../library';
import { saveReview, removeReview, fetchStudentStudied, reviewProgress } from '../backend/library';

// Learning Library: free pre-flight study lessons for every student (no account needed),
// and pre-flight reviews: an instructor picks lessons for an upcoming lesson, the
// student studies them, and the instructor sees progress.

const MAX_REVIEW = 12; // matches the database check
const upcomingStatus = (r) => ['Pending', 'Confirmed'].includes(r?.status) && new Date(r.when).getTime() > Date.now() - 6 * 3600e3;
const first = (n = '') => n.split(' ')[0] || n;

function Badges({ L, small }) {
  const c = certsOf(L);
  const b = (label, color, bg) => <View key={label} style={[lb.badge, { backgroundColor: bg }, small && lb.badgeSm]}><Text style={[lb.badgeText, { color }, small && { fontSize: 11 }]}>{label}</Text></View>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {c.ir && b(small ? 'IR' : 'Instrument', '#0E4D33', '#DDF3EA')}
      {c.me && b(small ? 'ME' : 'Multi-Engine', '#43246B', '#EDE4F7')}
      {c.pvt && b(small ? 'PVT' : 'Private', '#16325C', '#E3EBF7')}
      {c.com && b(small ? 'COM' : 'Commercial', '#6B4300', '#FCE9C6')}
    </View>
  );
}

function Check({ on, size = 24 }) {
  return (
    <View style={[lb.check, { width: size, height: size, borderRadius: size / 2 }, on && { backgroundColor: C.green, borderColor: C.green }]}>
      {on && <Icon name="check" size={size * 0.6} color="#fff" strokeWidth={3} />}
    </View>
  );
}

function LessonRow({ id, studied, onPress, right }) {
  const L = getLesson(id);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [lb.row, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={`${L.title}${studied ? ', studied' : ''}`}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={lb.rowTitle}>{L.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
          <Badges L={L} small />
          <Text style={lb.rowMeta}>{L.min} min</Text>
        </View>
      </View>
      {right || (studied ? <Check on /> : <Icon name="chevron" size={18} color="#94A3B8" />)}
    </Pressable>
  );
}

// ---------------------------------------------------------------- library home
export function Library({ nav }) {
  const { requests, getCfi } = useStore();
  const lib = useLibrary();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  useEffect(() => { lib.refresh(); }, []);

  const studiedCount = Object.keys(lib.studied).filter((id) => getLesson(id)).length;
  const hits = new Set(searchLessons(q));
  const groups = GROUPS.map((g) => ({ ...g, ids: g.ids.filter((id) => hits.has(id) && matchesFilter(getLesson(id), filter)) })).filter((g) => g.ids.length);

  // Reviews assigned to me for an upcoming lesson.
  const mine = lib.reviews.filter((r) => r.studentId === lib.uid)
    .map((r) => ({ r, b: requests.find((x) => x.id === r.bookingId) }))
    .filter((x) => upcomingStatus(x.b))
    .sort((a, b) => new Date(a.b.when) - new Date(b.b.when));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Learning Library" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={lb.hero}>
          <Text style={lb.kicker}>LEARN · FREE FOR EVERY STUDENT</Text>
          <Text style={lb.h1}>Learning Library</Text>
          <Text style={lb.heroSub}>Quick pre-flight study for every Private, Commercial, Instrument and Multi-Engine task. Written only from FAA sources: the handbooks, the AIM and the ACS.</Text>
          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            <View style={{ flex: 1 }}><Text style={lb.big}>{studiedCount}/{LESSON_COUNT}</Text><Text style={lb.small}>studied</Text></View>
            <View style={{ flex: 1 }}><Text style={lb.big}>{mine.length}</Text><Text style={lb.small}>review{mine.length === 1 ? '' : 's'} assigned</Text></View>
          </View>
        </View>

        <View style={{ padding: 16 }}>
          {mine.map(({ r, b }) => {
            const p = reviewProgress(r, lib.studied);
            const cfiName = getCfi(r.cfiId)?.name || b.cfiName || 'Your instructor';
            return (
              <Card key={r.id} onPress={() => nav.push('PreflightReview', { bookingId: r.bookingId })} style={{ borderLeftWidth: 4, borderLeftColor: p.done === p.total ? C.green : C.amber }}>
                <Text style={lb.kickerDark}>BEFORE YOUR {b.date.toUpperCase()} LESSON</Text>
                <Text style={lb.cardTitle}>Pre-flight review from {first(cfiName)}</Text>
                <Text style={lb.sub}>{p.done === p.total ? 'All done ✓' : `${p.done} of ${p.total} studied`} · {b.goal}</Text>
                <Bar value={p.done} max={p.total} />
              </Card>
            );
          })}

          <View style={lb.search}>
            <Icon name="search" size={18} color={C.sub} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search maneuvers or ACS codes" placeholderTextColor="#9AA3B2" style={lb.searchInput} accessibilityLabel="Search lessons" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 6 }}>
            {FILTERS.map((f) => <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />)}
          </ScrollView>

          {groups.length === 0 && <Text style={[lb.sub, { marginTop: 16 }]}>No lessons match. Try another search.</Text>}
          {groups.map((g) => (
            <View key={g.name}>
              <Text style={lb.group}>{g.name}</Text>
              <View style={lb.list}>
                {g.ids.map((id) => <LessonRow key={id} id={id} studied={!!lib.studied[id]} onPress={() => nav.push('LessonView', { id, cert: filter === 'com' ? 'com' : 'pvt' })} />)}
              </View>
            </View>
          ))}
          <Text style={lb.fine}>Study aid only. Airspeeds, configurations and procedures for your airplane come from its POH/AFM, and your instructor has the final word. Sources: FAA-H-8083-3C, -25C, -15B, -16B, FAA-P-8740-66, AIM, 14 CFR 91, FAA-S-ACS-6C, -7B, -8C.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Bar({ value, max }) {
  const pct = max ? Math.min(1, value / max) : 0;
  return <View style={lb.bar}><View style={[lb.barFill, { width: `${pct * 100}%`, backgroundColor: pct >= 1 ? C.green : C.amber }]} /></View>;
}

// ---------------------------------------------------------------- one lesson
export function LessonView({ nav, params }) {
  const L = getLesson(params.id);
  const lib = useLibrary();
  const c = L ? certsOf(L) : {};
  const both = !!(L?.pvt && L?.com) && L?.kind !== 'ir';
  const [cert, setCert] = useState(params.cert === 'com' && L?.com ? 'com' : L?.pvt ? 'pvt' : 'com');
  const [open, setOpen] = useState({});
  if (!L) return null;
  const studied = !!lib.studied[L.id];
  const acs = acsRef(L, cert);
  const queue = params.queue || [];
  const next = queue[queue.indexOf(L.id) + 1];
  const certLabel = L.kind === 'ir' ? 'Instrument Rating' : cert === 'com' ? 'Commercial Pilot' : 'Private Pilot';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={params.queue ? 'Pre-flight review' : 'Lesson'} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={lb.lessonHero}>
          <Text style={lb.kickerAmber}>{L.area.toUpperCase()}</Text>
          <Text style={lb.lessonTitle}>{L.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
            <Badges L={L} />
            <Text style={{ color: '#C9D4E5', fontSize: 13 }}>· {L.min} min read</Text>
          </View>
          <Diagram id={L.id} view={L.view} caption={L.cap} alt={L.alt} />
        </View>

        <View style={{ padding: 16 }}>
          {queue.length > 0 && (
            <Text style={[lb.sub, { marginBottom: 8, fontWeight: '700', color: C.navy }]}>Lesson {queue.indexOf(L.id) + 1} of {queue.length} in your pre-flight review</Text>
          )}
          <Card>
            <Text style={lb.h2}>Why it matters</Text>
            <Text style={lb.body}>{L.why}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {L.setup.map((t) => <View key={t} style={lb.setup}><Text style={lb.setupText}>{t}</Text></View>)}
            </View>
          </Card>

          <Card>
            <Text style={lb.h2}>How to fly it</Text>
            {L.steps.map((t, i) => (
              <View key={i} style={lb.step}>
                <View style={lb.stepNum}><Text style={lb.stepNumText}>{i + 1}</Text></View>
                <Text style={[lb.body, { flex: 1, marginTop: 1 }]}>{t}</Text>
              </View>
            ))}
          </Card>

          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={lb.h2}>Checkride standards</Text>
              <Text style={lb.code}>ACS {acs.task}</Text>
            </View>
            {both && (
              <View style={lb.seg} accessibilityRole="tablist">
                {[['pvt', 'Private'], ['com', 'Commercial']].map(([k, label]) => (
                  <Pressable key={k} onPress={() => setCert(k)} style={[lb.segBtn, cert === k && lb.segOn]} accessibilityRole="tab" accessibilityState={{ selected: cert === k }}>
                    <Text style={[lb.segText, cert === k && { color: '#fff' }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {standardsFor(L, cert).map((r, i) => (
              <View key={i} style={lb.std}>
                <Text style={lb.stdK}>{r.k}</Text>
                <Text style={lb.stdV}>{r.v}</Text>
              </View>
            ))}
            <Text style={lb.fine}>From the {certLabel} ACS. Your examiner grades the whole task, including knowledge and risk management.</Text>
          </Card>

          <Card>
            <Text style={lb.h2}>Common errors</Text>
            {L.errors.map((t, i) => (
              <View key={i} style={lb.step}>
                <Text style={{ color: '#B26F00', fontWeight: '900', fontSize: 15, width: 20 }}>!</Text>
                <Text style={[lb.body, { flex: 1 }]}>{t}</Text>
              </View>
            ))}
          </Card>

          <Card>
            <Text style={lb.h2}>Quick check</Text>
            {L.qc.map((q, i) => (
              <View key={i} style={lb.qc}>
                <Text style={[lb.body, { fontWeight: '700' }]}>{q.q}</Text>
                {open[i] && <Text style={lb.answer}>{q.a}</Text>}
                <Pressable onPress={() => setOpen((o) => ({ ...o, [i]: !o[i] }))} style={lb.reveal} accessibilityRole="button">
                  <Text style={{ color: C.navy, fontWeight: '700' }}>{open[i] ? 'Hide answer' : 'Show answer'}</Text>
                </Pressable>
              </View>
            ))}
          </Card>

          <Card>
            <Text style={lb.h2}>Read more (FAA)</Text>
            {[...refsOf(L), { book: acs.book, code: acs.code, ch: 'Task ' + acs.task }].map((r, i) => (
              <View key={i} style={{ paddingVertical: 8, borderBottomWidth: i ? 0 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <Text style={{ fontWeight: '700', color: C.text }}>{r.book} <Text style={{ fontWeight: '500', color: C.sub }}>({r.code})</Text></Text>
                <Text style={{ color: C.text, marginTop: 2 }}>{r.ch}</Text>
              </View>
            ))}
          </Card>

          <Button title={studied ? 'Studied ✓' : 'Mark as studied'} onPress={() => lib.toggleStudied(L.id, !studied)}
            style={studied ? { backgroundColor: C.green } : { backgroundColor: C.amber }} />
          {!!lib.error && <Text style={lb.err}>{lib.error}</Text>}
          {next && <Button title={`Next: ${getLesson(next).title}`} variant="outline" style={{ marginTop: 10 }} onPress={() => nav.replace('LessonView', { ...params, id: next })} />}
          <Text style={lb.fine}>Study aid only. Airspeeds, flap settings and procedures for your airplane come from its POH/AFM. Fly with your instructor.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------- student: an assigned review
export function PreflightReview({ nav, params }) {
  const { requests, getCfi } = useStore();
  const lib = useLibrary();
  useEffect(() => { lib.refresh(); }, []);
  const r = lib.reviews.find((x) => x.bookingId === params.bookingId);
  const b = requests.find((x) => x.id === params.bookingId);
  if (!r) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Pre-flight review" />
        <Text style={[lb.sub, { padding: 16 }]}>{lib.loading ? 'Loading…' : 'This review was removed by your instructor.'}</Text>
      </View>
    );
  }
  const p = reviewProgress(r, lib.studied);
  const cfiName = getCfi(r.cfiId)?.name || b?.cfiName || 'Your instructor';
  const nextUp = r.lessonIds.find((id) => !p.doneIds.includes(id)) || r.lessonIds[0];
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Pre-flight review" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Card style={{ backgroundColor: C.navy }}>
          <Text style={[lb.kicker, { color: C.amber }]}>{b ? `${b.date.toUpperCase()} · ${b.time}` : 'UPCOMING LESSON'}</Text>
          <Text style={[lb.cardTitle, { color: '#fff', fontSize: 20 }]}>Study before you fly with {first(cfiName)}</Text>
          {b && <Text style={{ color: '#C9D4E5', marginTop: 4 }}>{b.goal}{b.tail ? ` · ${b.tail}` : ''}</Text>}
          <Text style={{ color: '#fff', fontWeight: '800', marginTop: 12 }}>{p.done === p.total ? 'All done ✓ Your instructor can see you’re ready.' : `${p.done} of ${p.total} studied`}</Text>
          <Bar value={p.done} max={p.total} />
        </Card>
        {!!r.note && (
          <Card>
            <Text style={lb.kickerDark}>NOTE FROM {first(cfiName).toUpperCase()}</Text>
            <Text style={[lb.body, { marginTop: 4 }]}>“{r.note}”</Text>
          </Card>
        )}
        <View style={lb.list}>
          {r.lessonIds.filter(getLesson).map((id) => (
            <LessonRow key={id} id={id} onPress={() => nav.push('LessonView', { id, queue: r.lessonIds })}
              right={<Check on={p.doneIds.includes(id)} />} />
          ))}
        </View>
        {p.done < p.total && <Button title={p.done ? 'Continue' : 'Start review'} style={{ marginTop: 16 }} onPress={() => nav.push('LessonView', { id: nextUp, queue: r.lessonIds })} />}
        <Text style={lb.fine}>Open each lesson and tap “Mark as studied”. Lessons count once you study them after the review was assigned.</Text>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------- instructor: assign a review
const defaultFilter = (goal = '') => (/instrument|ifr|ipc/i.test(goal) ? 'ir' : /multi|twin|mei|amel/i.test(goal) ? 'me' : /commercial/i.test(goal) ? 'com' : 'pvt');

export function AssignReview({ nav, params }) {
  const { teaching } = useStore();
  const lib = useLibrary();
  const b = teaching.find((x) => x.id === params.bookingId);
  const existing = lib.reviews.find((x) => x.bookingId === params.bookingId);
  const [picked, setPicked] = useState(existing?.lessonIds || []);
  const [note, setNote] = useState(existing?.note || '');
  const [filter, setFilter] = useState(defaultFilter(b?.goal));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [studentStudied, setStudentStudied] = useState({});
  useEffect(() => { if (existing) { setPicked(existing.lessonIds); setNote(existing.note); } }, [existing?.id]);
  useEffect(() => { if (b?.studentId) fetchStudentStudied(b.studentId).then(setStudentStudied).catch(() => {}); }, [b?.studentId]);
  const hits = useMemo(() => new Set(searchLessons(q)), [q]);
  if (!b) return null;

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_REVIEW ? p : [...p, id]));
  const groups = GROUPS.map((g) => ({ ...g, ids: g.ids.filter((id) => hits.has(id) && matchesFilter(getLesson(id), filter)) })).filter((g) => g.ids.length);
  const progress = existing ? reviewProgress(existing, studentStudied) : null;
  const changed = !existing || existing.note !== note.trim() || existing.lessonIds.join() !== picked.join();

  const save = async () => {
    setErr(''); setBusy('save');
    try { lib.putReview(await saveReview({ bookingId: b.id, lessonIds: picked, note })); nav.pop(); }
    catch (e) { setErr(e.message); setBusy(null); }
  };
  const remove = async () => {
    setErr(''); setBusy('remove');
    try { await removeReview(b.id); lib.dropReview(b.id); nav.pop(); }
    catch (e) { setErr(e.message); setBusy(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Pre-flight review" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={lb.kickerDark}>{b.date.toUpperCase()} · {b.time}</Text>
          <Text style={lb.cardTitle}>{b.studentName} · {b.goal}</Text>
          <Text style={lb.sub}>Pick what {first(b.studentName)} should study before this lesson. They get a notification and see it on the lesson.</Text>
          {progress && <Text style={[lb.sub, { fontWeight: '800', color: progress.done === progress.total ? C.green : C.navy }]}>{progress.done === progress.total ? 'Finished ✓' : `${progress.done} of ${progress.total} studied so far`}</Text>}
        </Card>

        <Text style={lb.group}>Selected · {picked.length}/{MAX_REVIEW}</Text>
        {picked.length === 0 && <Text style={lb.sub}>Nothing yet. Tap lessons below to add them.</Text>}
        {picked.length > 0 && (
          <View style={lb.list}>
            {picked.map((id) => (
              <LessonRow key={id} id={id} onPress={() => nav.push('LessonView', { id, cert: filter === 'com' ? 'com' : 'pvt' })}
                right={
                  <Pressable onPress={() => toggle(id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${getLesson(id).title}`} style={lb.removeBtn}>
                    <Icon name="x" size={18} color={C.sub} />
                  </Pressable>
                } />
            ))}
          </View>
        )}

        <Field label="Note for your student (optional)" value={note} onChangeText={(t) => setNote(t.slice(0, 500))} placeholder="e.g. Focus on the 45° bank sight picture and leading the rollout" multiline />
        {!!err && <Text style={lb.err}>{err}</Text>}
        <Button title={busy === 'save' ? 'Saving…' : existing ? 'Save changes' : `Assign ${picked.length || ''} lesson${picked.length === 1 ? '' : 's'}`.replace('  ', ' ')}
          disabled={!!busy || picked.length === 0 || !changed} onPress={save} />
        {existing && <Button title={busy === 'remove' ? 'Removing…' : 'Remove review'} variant="outline" disabled={!!busy} style={{ marginTop: 10 }} onPress={remove} />}

        <Text style={[lb.group, { marginTop: 22 }]}>Add lessons</Text>
        <View style={lb.search}>
          <Icon name="search" size={18} color={C.sub} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search maneuvers or ACS codes" placeholderTextColor="#9AA3B2" style={lb.searchInput} accessibilityLabel="Search lessons" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 6 }}>
          {FILTERS.map((f) => <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />)}
        </ScrollView>
        {groups.map((g) => (
          <View key={g.name}>
            <Text style={lb.groupSm}>{g.name}</Text>
            <View style={lb.list}>
              {g.ids.map((id) => {
                const on = picked.includes(id);
                const L = getLesson(id);
                return (
                  <Pressable key={id} onPress={() => toggle(id)} style={({ pressed }) => [lb.row, pressed && { opacity: 0.7 }]}
                    accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={L.title}>
                    <View style={[lb.box, on && { backgroundColor: C.blue, borderColor: C.blue }]}>{on && <Icon name="check" size={14} color="#fff" strokeWidth={3} />}</View>
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                      <Text style={lb.rowTitle}>{L.title}</Text>
                      <Text style={lb.rowMeta}>{studentStudied[id] ? `${first(b.studentName)} studied ${new Date(studentStudied[id]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : `${L.min} min`}</Text>
                    </View>
                    <Pressable onPress={() => nav.push('LessonView', { id, cert: filter === 'com' ? 'com' : 'pvt' })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Preview ${L.title}`} style={{ padding: 6 }}>
                      <Text style={{ color: C.blue, fontWeight: '700', fontSize: 13 }}>Preview</Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// Training tab entry: the library, plus any review due before an upcoming lesson.
export function LibraryCard({ nav }) {
  const { requests } = useStore();
  const lib = useLibrary();
  const studiedCount = Object.keys(lib.studied).filter((id) => getLesson(id)).length;
  const due = lib.reviews.filter((r) => r.studentId === lib.uid && upcomingStatus(requests.find((x) => x.id === r.bookingId)))
    .filter((r) => { const p = reviewProgress(r, lib.studied); return p.done < p.total; });
  return (
    <Card onPress={() => nav.push('Library')} style={{ backgroundColor: C.navy }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#132A4C', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="book" size={22} color={C.amber} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Learning Library</Text>
          <Text style={{ color: '#C9D4E5', fontSize: 13, marginTop: 2 }}>{LESSON_COUNT} maneuver lessons · {studiedCount} studied · free</Text>
        </View>
        <Text style={{ color: '#C9D4E5', fontSize: 22 }}>›</Text>
      </View>
      {due.length > 0 && (
        <View style={{ backgroundColor: C.amber, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginTop: 12 }}>
          <Text style={{ color: C.navy, fontWeight: '800' }}>{due.length === 1 ? 'A pre-flight review is waiting for you' : `${due.length} pre-flight reviews are waiting for you`} ›</Text>
        </View>
      )}
    </Card>
  );
}

// Small summary for lesson cards (student's Lessons tab and the instructor's Schedule).
// Pass `studied` (the student's own marks) for live progress, or leave it out to use
// the server's completion flag (what the instructor sees).
export function ReviewChip({ review, studied, onPress }) {
  const p = reviewProgress(review, studied || {});
  const done = studied ? p.total > 0 && p.done === p.total : !!review.completedAt;
  const status = done ? 'done ✓' : studied ? `${p.done}/${p.total} studied` : `${review.lessonIds.length} lesson${review.lessonIds.length === 1 ? '' : 's'} · not finished yet`;
  return (
    <Pressable onPress={onPress} style={[lb.chip, done && { backgroundColor: '#E3F7EF', borderColor: '#A7E3C6' }]} accessibilityRole="button">
      <Icon name="book" size={16} color={done ? C.green : '#B45309'} />
      <Text style={[lb.chipText, { color: done ? C.green : '#92400E' }]}>Pre-flight review · {status}</Text>
      <Text style={{ color: done ? C.green : '#92400E', fontWeight: '800' }}>›</Text>
    </Pressable>
  );
}

const lb = StyleSheet.create({
  hero: { backgroundColor: C.navy, padding: 20, paddingTop: 16 },
  lessonHero: { backgroundColor: C.navy, padding: 20, paddingTop: 14 },
  kicker: { color: '#9FB3D1', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  kickerAmber: { color: C.amber, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  kickerDark: { color: C.sub, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  h1: { color: '#fff', fontWeight: '900', fontSize: 28, marginTop: 4 },
  lessonTitle: { color: '#fff', fontWeight: '900', fontSize: 26, lineHeight: 30, marginTop: 6 },
  heroSub: { color: '#C9D4E5', marginTop: 6, lineHeight: 20 },
  big: { color: '#fff', fontSize: 24, fontWeight: '900' },
  small: { color: '#9FB3D1', fontSize: 12 },
  h2: { fontWeight: '900', fontSize: 18, color: C.text, marginBottom: 6 },
  body: { color: '#23324D', fontSize: 15, lineHeight: 22 },
  sub: { color: C.sub, fontSize: 13, marginTop: 4, lineHeight: 18 },
  fine: { color: C.sub, fontSize: 12, lineHeight: 17, marginTop: 14 },
  err: { color: '#B91C1C', fontWeight: '600', marginVertical: 8 },
  code: { color: C.sub, fontSize: 12, fontWeight: '700' },
  cardTitle: { fontWeight: '900', fontSize: 17, color: C.text, marginTop: 2 },
  group: { fontWeight: '900', fontSize: 18, color: C.text, marginTop: 18, marginBottom: 8 },
  groupSm: { fontWeight: '800', fontSize: 15, color: C.text, marginTop: 14, marginBottom: 6 },
  list: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  rowTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  rowMeta: { fontSize: 12, color: C.sub },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeSm: { paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  check: { borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#B6C0CF', alignItems: 'center', justifyContent: 'center' },
  removeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, marginTop: 6, minHeight: 46 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: C.text, paddingVertical: 10 },
  setup: { backgroundColor: '#EEF2F7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  setupText: { color: '#16325C', fontSize: 13, fontWeight: '600' },
  step: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10, gap: 10 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  seg: { flexDirection: 'row', backgroundColor: '#EEF2F7', borderRadius: 12, padding: 4, marginVertical: 8 },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.navy },
  segText: { fontWeight: '700', color: '#23324D' },
  std: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  stdK: { color: C.sub, fontSize: 14, flex: 1 },
  stdV: { color: C.text, fontSize: 14, fontWeight: '800', textAlign: 'right', flex: 1.2 },
  qc: { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, marginTop: 10 },
  answer: { color: '#23324D', fontSize: 15, lineHeight: 21, backgroundColor: C.bg, borderRadius: 8, padding: 10, marginTop: 8 },
  reveal: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.navy, marginTop: 8 },
  bar: { height: 8, backgroundColor: 'rgba(148,163,184,0.3)', borderRadius: 4, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F7D58A', backgroundColor: '#FEF7E6', marginTop: 10 },
  chipText: { flex: 1, fontWeight: '700', fontSize: 14 },
});
