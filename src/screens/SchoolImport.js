import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { C, Card, Button, Field, SectionTitle, Tag } from '../ui';
import { Header } from './Details';
import { useAuth } from '../backend/auth';
import { readImport, summary, FIELD_LABELS } from '../fspImport';
import { setUpSchool, importFile, refreshImport, fetchMySchool, fetchImportStatus, readPickedFile } from '../backend/imports';

// Switching from Flight Schedule Pro: upload FSP's CSV exports, check what we read,
// then import. People join by signing in with the email the school has on file.

const APP_LINK = 'https://flyingrightseat.com';
const STEPS = [
  {
    kind: 'people', n: 1, title: 'Instructors & students',
    how: 'In Flight Schedule Pro, export your user list as a CSV. It needs each person’s name and email; a Role or User Type column tells us who’s an instructor.',
    after: 'Nobody gets an account or an email from us. Each person joins by signing in to Positive Rate with the email you have on file.',
  },
  {
    kind: 'aircraft', n: 2, title: 'Aircraft',
    how: 'Export your aircraft list as a CSV: tail number, make and model, and the hourly rate. Hobbs and inspection columns come over too if they’re there.',
    after: 'Aircraft are added as drafts under your school. Each one can be booked once its registration is checked and its insurance is uploaded.',
  },
  {
    kind: 'reservations', n: 3, title: 'Upcoming reservations',
    how: 'Export your upcoming reservations as a CSV: start and end time, student, instructor and aircraft. Import people first so we can match names.',
    after: 'Each lesson is booked here once its student and instructor have joined and the plane is verified. The student accepts it by saving a card. Nobody is charged until after the flight.',
  },
];
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const when = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function SchoolImport({ nav }) {
  const auth = useAuth();
  const uid = auth?.session?.user?.id;
  const [school, setSchool] = useState(undefined); // undefined = loading, null = none yet
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!uid) { setSchool(null); return; }
    try {
      const s = await fetchMySchool(uid);
      setSchool(s);
      if (s) setStatus(await fetchImportStatus(s.id));
    } catch (e) { setErr(e.message); }
  }, [uid]);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Switch from Flight Schedule Pro" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {!uid && (
          <Card>
            <Text style={st.title}>Sign in to import your school</Text>
            <Button title="Sign in" style={{ marginTop: 12 }} onPress={() => nav.push('SignIn')} />
          </Card>
        )}
        {!!err && <Text style={st.err}>{err}</Text>}
        {uid && school === null && <SchoolSetup onDone={load} />}
        {school && (
          <>
            <Text style={st.lead}>Bring {school.name} over in three steps. You can re-import a file any time; people and reservations already imported aren’t duplicated.</Text>
            {STEPS.map((s) => <ImportStep key={s.kind} step={s} school={school} onImported={load} />)}
            {status && <ImportStatus school={school} status={status} onRefresh={load} />}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SchoolSetup({ onDone }) {
  const [name, setName] = useState('');
  const [airport, setAirport] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try { await setUpSchool({ name, homeAirport: airport }); await onDone(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Card>
      <Text style={st.title}>First, your school</Text>
      <Text style={[st.sub, { marginBottom: 12 }]}>You’ll be its admin. You can fill in the rest of the school’s profile later.</Text>
      <Field label="School name" value={name} onChangeText={setName} placeholder="Gulf Coast Flight Academy" />
      <Field label="Home airport" value={airport} onChangeText={(v) => setAirport(v.toUpperCase())} placeholder="KPIE" autoCapitalize="characters" autoCorrect={false} />
      {!!err && <Text style={st.err}>{err}</Text>}
      <Button title={busy ? 'Creating…' : 'Create school'} disabled={busy || !name.trim() || !airport.trim()} onPress={save} />
    </Card>
  );
}

function ImportStep({ step, school, onImported }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [paste, setPaste] = useState(false);
  const [defaultRate, setDefaultRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  const preview = useMemo(() => {
    if (!text.trim()) return null;
    try { return readImport(step.kind, text, { tz: tz(), defaultRate, homeAirport: school.home_airport }); }
    catch (e) { return { error: e.message }; }
  }, [text, defaultRate, step.kind]);

  const pick = async () => {
    setErr(''); setDone(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true });
      if (res.canceled) return;
      const a = res.assets[0];
      if (/\.xlsx?$/i.test(a.name)) { setErr('That’s an Excel file. Export or save it as CSV, then pick it again.'); return; }
      setFileName(a.name);
      setText(await readPickedFile(a));
    } catch (e) { setErr('Couldn’t open that file. ' + (e.message || '')); }
  };

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const r = await importFile({ schoolId: school.id, kind: step.kind, text, fileName, defaultRate: defaultRate || undefined });
      setDone(r); setText(''); setFileName('');
      await onImported();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const ok = preview && !preview.error && !preview.missing?.length && preview.rows.length > 0;
  const noRate = step.kind === 'aircraft' && preview?.skipped?.some((s) => /hourly rate/.test(s.why));
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={st.num}><Text style={st.numText}>{step.n}</Text></View>
        <Text style={[st.title, { flex: 1 }]}>{step.title}</Text>
      </View>
      <Text style={[st.sub, { marginTop: 8 }]}>{step.how}</Text>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Button title={fileName ? 'Choose a different file' : 'Choose CSV file'} small style={{ flex: 1 }} onPress={pick} />
        <Button title={paste ? 'Hide paste' : 'Paste instead'} small variant="outline" style={{ flex: 0.8 }} onPress={() => setPaste((v) => !v)} />
      </View>
      {paste && <View style={{ marginTop: 12 }}><Field label="Paste the CSV, header row first" value={text} onChangeText={(v) => { setText(v); setFileName('pasted'); setDone(null); }} multiline autoCapitalize="none" autoCorrect={false} /></View>}
      {!!fileName && fileName !== 'pasted' && <Text style={[st.sub, { marginTop: 8 }]}>📄 {fileName}</Text>}

      {preview?.error && <Text style={st.err}>{preview.error}</Text>}
      {preview && !preview.error && <Preview r={preview} />}
      {noRate && (
        <View style={{ marginTop: 10 }}>
          <Field label="Hourly rate for aircraft without one" value={defaultRate} onChangeText={setDefaultRate} keyboardType="decimal-pad" prefix="$" placeholder="165" />
        </View>
      )}
      {!!err && <Text style={st.err}>{err}</Text>}
      {ok && <Button title={busy ? 'Importing…' : `Import ${preview.rows.length}`} disabled={busy} style={{ marginTop: 12 }} onPress={run} />}
      {done && <Result r={done} />}
      <Text style={[st.note, { marginTop: 12 }]}>{step.after}</Text>
    </Card>
  );
}

function Preview({ r }) {
  const [all, setAll] = useState(false);
  if (r.missing.length) {
    return <Text style={st.err}>This file needs a column for {r.missing.join(' and ')}. Columns found: {r.headers.join(', ')}.</Text>;
  }
  const found = Object.keys(r.map).map((f) => FIELD_LABELS[f]);
  const shown = all ? r.skipped : r.skipped.slice(0, 5);
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={[st.title, { fontSize: 15 }]}>{summary(r)}</Text>
      <Text style={st.sub}>Read: {found.join(', ')}{r.unmatched.length ? ` · Ignored: ${r.unmatched.slice(0, 6).join(', ')}${r.unmatched.length > 6 ? '…' : ''}` : ''}</Text>
      {r.rows.slice(0, 4).map((x) => <Text key={x.line} style={st.row} numberOfLines={1}>{rowLine(r.kind, x)}</Text>)}
      {r.rows.length > 4 && <Text style={st.sub}>and {r.rows.length - 4} more</Text>}
      {r.skipped.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={[st.sub, { fontWeight: '800', color: '#B45309' }]}>Left out</Text>
          {shown.map((s) => <Text key={s.line} style={st.sub}>Row {s.line}: {s.why}</Text>)}
          {r.skipped.length > 5 && (
            <Pressable onPress={() => setAll((v) => !v)} accessibilityRole="button" style={{ minHeight: 32, justifyContent: 'center' }}>
              <Text style={st.link}>{all ? 'Show fewer' : `Show all ${r.skipped.length}`}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function rowLine(kind, x) {
  if (kind === 'people') return `${x.role === 'cfi' ? 'Instructor' : 'Student'} · ${x.name} · ${x.email}`;
  if (kind === 'aircraft') return `${x.tail} · ${x.make} ${x.model}${x.year ? ` (${x.year})` : ''} · $${x.rate}/hr${x.hobbs != null ? ` · Hobbs ${x.hobbs}` : ''}`;
  return `${when(x.startsAt)} · ${x.student || x.studentEmail}${x.instructor ? ` with ${x.instructor}` : ' (solo)'}${x.tail ? ` · ${x.tail}` : ''}`;
}

function Result({ r }) {
  let line = '';
  if (r.kind === 'people') line = `Imported ${r.added} ${r.added === 1 ? 'person' : 'people'}.${r.linked ? ` ${r.linked} already ${r.linked === 1 ? 'has a Positive Rate account and is' : 'have Positive Rate accounts and are'} linked.` : ''}`;
  if (r.kind === 'aircraft') line = `Added ${r.added} aircraft${r.updated ? `, updated ${r.updated}` : ''}.`;
  if (r.kind === 'reservations') line = `Imported ${r.added} reservations. ${r.booked} booked now, ${r.waiting} waiting${r.skipped ? `, ${r.skipped} need rebooking by hand` : ''}${r.expired ? `, ${r.expired} too soon to move` : ''}.`;
  const extra = (r.leftOut || []).filter((x) => /already listed|couldn’t/.test(x.why));
  return (
    <View style={st.done}>
      <Text style={{ color: C.green, fontWeight: '800' }}>✓ {line}</Text>
      {extra.map((x) => <Text key={x.line} style={st.sub}>Row {x.line}: {x.why}</Text>)}
    </View>
  );
}

const RES_TAG = {
  booked: { label: 'Booked', color: C.green, bg: '#E3F7EF' },
  waiting: { label: 'Waiting', color: '#B45309', bg: '#FEF3C7' },
  skipped: { label: 'Rebook by hand', color: '#B91C1C', bg: '#FDECEC' },
  expired: { label: 'Keep in FSP', color: C.sub, bg: '#EEF1F5' },
};

function ImportStatus({ school, status, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [showAll, setShowAll] = useState(false);
  const { people, reservations } = status;
  const joined = people.filter((p) => p.status === 'joined');
  const waitingPeople = people.filter((p) => p.status === 'invited');
  const upcoming = reservations.filter((r) => new Date(r.starts_at) > new Date());
  const count = (s) => upcoming.filter((r) => r.status === s).length;

  const check = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await refreshImport(school.id);
      setMsg(r.booked ? `Booked ${r.booked} more lesson${r.booked > 1 ? 's' : ''}.` : 'Up to date. We also check every hour.');
      await onRefresh();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const share = async () => {
    const message = `${school.name} is moving its scheduling from Flight Schedule Pro to Positive Rate. Get the app at ${APP_LINK} and sign in with the email we have on file for you. Your upcoming lessons will be waiting for you to accept.`;
    try { await Share.share({ message, title: `${school.name} is moving to Positive Rate` }); } catch {}
  };

  if (!people.length && !reservations.length) return null;
  return (
    <>
      <SectionTitle>Switch-over status</SectionTitle>
      {people.length > 0 && (
        <Card>
          <Text style={st.title}>{joined.length} of {people.length} people have joined</Text>
          <Text style={st.sub}>Instructors also accept your school’s terms in the app once they’ve set up their instructor profile.</Text>
          <Button title="Share a message with your people" small variant="outline" style={{ marginTop: 12 }} onPress={share} />
          {(showAll ? waitingPeople : waitingPeople.slice(0, 6)).map((p) => (
            <View key={p.id} style={st.personRow}>
              <Text style={{ flex: 1, color: C.text }} numberOfLines={1}>{p.full_name} <Text style={st.sub}>· {p.email}</Text></Text>
              <Tag label={p.role === 'cfi' ? 'Instructor' : 'Student'} />
            </View>
          ))}
          {waitingPeople.length > 6 && (
            <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" style={{ minHeight: 36, justifyContent: 'center' }}>
              <Text style={st.link}>{showAll ? 'Show fewer' : `Show all ${waitingPeople.length} not joined yet`}</Text>
            </Pressable>
          )}
        </Card>
      )}
      {upcoming.length > 0 && (
        <Card>
          <Text style={st.title}>Upcoming reservations</Text>
          <Text style={st.sub}>{count('booked')} booked · {count('waiting')} waiting · {count('skipped')} rebook by hand · {count('expired')} keep in FSP</Text>
          <Button title={busy ? 'Checking…' : 'Check again now'} small variant="outline" disabled={busy} style={{ marginTop: 12 }} onPress={check} />
          {!!msg && <Text style={[st.sub, { marginTop: 8 }]}>{msg}</Text>}
          {upcoming.filter((r) => r.status !== 'booked').slice(0, 25).map((r) => (
            <View key={r.id} style={st.resRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontWeight: '800', color: C.text }} numberOfLines={1}>{when(r.starts_at)} · {r.student_name || r.student_email}</Text>
                <Tag {...RES_TAG[r.status]} />
              </View>
              <Text style={st.sub} numberOfLines={1}>{r.goal}{r.instructor_name ? ` with ${r.instructor_name}` : ''}{r.tail ? ` · ${r.tail}` : ''}</Text>
              {!!r.note && <Text style={[st.sub, { marginTop: 2 }]}>{r.note}</Text>}
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

const st = StyleSheet.create({
  lead: { color: C.text, lineHeight: 21, marginBottom: 12 },
  title: { fontWeight: '900', color: C.text, fontSize: 16 },
  sub: { color: C.sub, fontSize: 13, lineHeight: 18, marginTop: 2 },
  note: { color: C.navy, fontSize: 13, lineHeight: 18 },
  err: { color: '#B91C1C', fontWeight: '700', marginTop: 10, lineHeight: 19 },
  link: { color: C.blue, fontWeight: '700' },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  numText: { color: '#fff', fontWeight: '900' },
  row: { color: C.text, fontSize: 13, marginTop: 6 },
  done: { marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: '#E3F7EF' },
  personRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line, marginTop: 8 },
  resRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, marginTop: 8 },
});
