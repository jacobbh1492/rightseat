import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, TextInput, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { DOC_TYPES, GROUPS, SCENARIOS, SOURCES, extract, runChecks, decide, statusOf, daysUntil, fmt, addMonths } from '../verification';
import { C, Card, SectionTitle, Button, Tag, Chip, Toggle, Field, pickImages } from '../ui';
import { PlaneImage } from '../art';
import { Header } from './Details';
import { allHours, hasPrior } from '../progress';

const LEVEL = { pass: ['✓', '#0E9F6E'], warn: ['!', '#B45309'], fail: ['✕', '#DC2626'] };

function StatusTag({ doc }) {
  const st = statusOf(doc);
  return <Tag label={st.label} color={st.color} bg={st.bg} />;
}

export function CheckRows({ checks }) {
  return checks.map((c, i) => (
    <View key={i} style={v.checkRow}>
      <Text style={{ width: 20, fontWeight: '900', color: LEVEL[c.level][1] }}>{LEVEL[c.level][0]}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.level === 'pass' ? C.text : LEVEL[c.level][1], fontWeight: c.level === 'pass' ? '500' : '700' }}>{c.label}</Text>
        <Text style={{ color: C.sub, fontSize: 11, marginTop: 1 }}>{SOURCES[c.source]}{c.detail ? ` · ${c.detail}` : ''}</Text>
      </View>
    </View>
  ));
}

// Stand-in rendering of a document when there's no photo (demo / sample docs).
export function DocPreview({ type, fields, uri }) {
  if (uri) return <Image source={{ uri }} style={{ width: '100%', height: 220, borderRadius: 12 }} resizeMode="cover" />;
  const t = DOC_TYPES[type];
  const titles = {
    id: 'DRIVER LICENSE', pilotCert: 'PILOT CERTIFICATE', cfiCert: 'FLIGHT INSTRUCTOR CERTIFICATE', medical: 'MEDICAL CERTIFICATE',
    renterIns: 'POLICY DECLARATIONS', cfiIns: 'POLICY DECLARATIONS', ownerIns: 'CERTIFICATE OF INSURANCE', registration: 'FAA REGISTRY RECORD',
    airworthiness: 'STANDARD AIRWORTHINESS CERTIFICATE', annual: 'LOGBOOK ENTRY · ANNUAL', hundredHr: 'LOGBOOK ENTRY · 100 HOUR', logbook: 'LOGBOOK SUMMARY', background: 'BACKGROUND REPORT',
  };
  return (
    <View style={v.doc}>
      <View style={v.docHead}><Text style={v.docTitle}>{titles[type]}</Text><Text style={v.docSample}>SAMPLE</Text></View>
      {t.fields.map(([k, label]) => (
        <View key={k} style={{ flexDirection: 'row', marginTop: 5 }}>
          <Text style={v.docLabel}>{label.toUpperCase()}</Text>
          <Text style={v.docValue} numberOfLines={1}>{fields?.[k] || '—'}</Text>
        </View>
      ))}
    </View>
  );
}

function targetsFor(store) {
  const { myPlaneIds, getPlane } = store;
  const ids = myPlaneIds.length ? myPlaneIds : ['p2'];
  return ids.map(getPlane).filter(Boolean);
}

export function VerificationCenter({ nav }) {
  const store = useStore();
  const { docs, myCfiId, myPlaneIds } = store;
  const planes = targetsFor(store);
  const [planeId, setPlaneId] = useState(planes[0]?.id);
  const keyFor = (g) => (g === 'pilot' ? 'me' : g === 'cfi' ? 'cfi' : planeId);
  const all = GROUPS.flatMap((g) => Object.keys(DOC_TYPES).filter((t) => DOC_TYPES[t].group === g.key && !DOC_TYPES[t].optional).map((t) => docs[keyFor(g.key)]?.[t]));
  const done = all.filter((d) => statusOf(d).key === 'approved' || statusOf(d).key === 'expiring').length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Verification" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={v.hero}>
          <Text style={{ color: '#AFC3E0', fontWeight: '700' }}>Verified documents</Text>
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900' }}>{done} of {all.length}</Text>
          <View style={v.bar}><View style={[v.barFill, { width: `${(done / all.length) * 100}%` }]} /></View>
          <Text style={{ color: '#AFC3E0', marginTop: 8, fontSize: 13, lineHeight: 18 }}>
            Most documents are verified automatically in seconds against Stripe Identity, the FAA registries and our rules. Only unclear ones go to a person.
          </Text>
        </View>

        {GROUPS.map((g) => (
          <View key={g.key}>
            <SectionTitle>{g.title}</SectionTitle>
            <Text style={v.note}>
              {g.note}
              {g.key === 'cfi' && !myCfiId ? '. Create your CFI profile in Account.' : ''}
              {g.key === 'aircraft' && !myPlaneIds.length ? '. Demo: Bay Area Flyers’ N7340P.' : ''}
            </Text>
            {g.key === 'aircraft' && planes.length > 1 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {planes.map((p) => <Chip key={p.id} small label={p.tail} active={p.id === planeId} onPress={() => setPlaneId(p.id)} />)}
              </View>
            )}
            <Card style={{ paddingVertical: 4 }}>
              {Object.keys(DOC_TYPES).filter((t) => DOC_TYPES[t].group === g.key).map((t, i) => {
                const doc = docs[keyFor(g.key)]?.[t];
                return (
                  <Pressable key={t} onPress={() => nav.push('DocUpload', { type: t, key: keyFor(g.key) })} style={[v.row, i === 0 && { borderTopWidth: 0 }]}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ fontWeight: '800', color: C.text }}>{DOC_TYPES[t].title}</Text>
                      <Text style={{ color: C.sub, fontSize: 12, marginTop: 1 }} numberOfLines={2}>{DOC_TYPES[t].how}</Text>
                      {doc?.expires && <Text style={{ color: C.sub, fontSize: 11, marginTop: 2 }}>Expires {doc.expires}</Text>}
                    </View>
                    <StatusTag doc={doc} />
                  </Pressable>
                );
              })}
            </Card>
          </View>
        ))}
        <Text style={v.note}>We re-check FAA records monthly (pilots) and nightly (aircraft), and remind you 30, 14 and 3 days before anything expires. Expired items pause bookings automatically.</Text>
      </ScrollView>
    </View>
  );
}

const STEPS = {
  identity: ['Checking ID security features', 'Matching live selfie to ID photo', 'Reading ID details'],
  faa: ['Searching FAA Airmen Registry', 'Comparing name, city and state', 'Reading certificates & ratings'],
  faaAircraft: ['Searching FAA Aircraft Registry', 'Loading registration record'],
  upload: ['Uploading securely (encrypted)', 'Reading document with Document AI', 'Extracting fields'],
  consent: ['Sending signed consent to provider', 'Running background checks'],
};

export function DocUpload({ nav, params }) {
  const store = useStore();
  const { pilot, getPlane, getCfi, myCfiId, docs, submitDoc, training } = store;
  const { type, key } = params;
  const t = DOC_TYPES[type];
  const plane = getPlane(key);
  const myCfi = getCfi(myCfiId);
  const ctx = plane
    ? { name: plane.ownerName, plane }
    : { name: key === 'cfi' && myCfi ? myCfi.name : pilot.name, certificate: pilot.certificate, totalHours: allHours(training).total, dual: allHours(training).dual };
  const subject = { who: ctx.name, role: plane ? `Aircraft · ${plane.tail}` : key === 'cfi' ? 'Instructor' : 'Pilot' };
  const existing = docs[key]?.[type];

  const [stage, setStage] = useState(existing && !params.redo ? 'existing' : 'input');
  const [scenario, setScenario] = useState('clean');
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [lookup, setLookup] = useState(plane ? plane.tail : ctx.name);
  const [step, setStep] = useState(0);
  const [ex, setEx] = useState(null);
  const [fields, setFields] = useState({});
  const [edited, setEdited] = useState(false);
  const [checks, setChecks] = useState([]);
  const [shown, setShown] = useState(0);
  const [result, setResult] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const start = () => {
    const e = extract(type, scenario, ctx);
    if (t.input === 'faa') e.fields.name = lookup || e.fields.name;
    setEx(e);
    setFields(e.fields);
    setEdited(false);
    setStage('running');
    setStep(0);
    const steps = STEPS[t.input];
    steps.forEach((_, i) => later(() => setStep(i + 1), 550 * (i + 1)));
    later(() => (t.input === 'upload' ? setStage('confirm') : runChecksAnimated(e.fields, e.confidence, false)), 550 * steps.length + 250);
  };

  const runChecksAnimated = (f, conf, userEdited) => {
    const cs = runChecks(type, f, ctx, conf);
    setChecks(cs);
    setShown(0);
    setStage('checking');
    cs.forEach((_, i) => later(() => setShown(i + 1), 320 * (i + 1)));
    later(() => {
      const d = decide(cs, conf, userEdited);
      const r = { ...d, fields: f, checks: cs, confidence: conf, files };
      setResult(r);
      submitDoc(key, type, r, subject);
      setStage('result');
    }, 320 * cs.length + 400);
  };

  const steps = STEPS[t.input];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={t.title} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Card style={{ backgroundColor: C.sky }}>
          <Text style={{ fontWeight: '900', color: C.navy }}>How this is verified</Text>
          <Text style={{ color: C.navy, marginTop: 4, lineHeight: 19 }}>{t.how}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {t.sources.map((s) => <Tag key={s} label={SOURCES[s]} color={C.navy} bg="#fff" />)}
          </View>
        </Card>

        {stage === 'existing' && (
          <>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontWeight: '900', fontSize: 16, color: C.text }}>Current status</Text>
                <StatusTag doc={existing} />
              </View>
              <Text style={{ color: C.sub, marginTop: 4 }}>
                Submitted {existing.submitted}
                {existing.by === 'auto' ? ' · approved automatically' : existing.by === 'reviewer' ? ' · approved by a reviewer' : ''}
              </Text>
              {existing.note ? <Text style={[v.reason, { marginTop: 8 }]}>Reviewer: {existing.note}</Text> : null}
            </Card>
            <DocPreview type={type} fields={existing.fields} uri={existing.files?.[0]} />
            <SectionTitle>Checks</SectionTitle>
            <Card><CheckRows checks={existing.checks || []} /></Card>
          </>
        )}

        {stage === 'input' && (
          <>
            {t.input === 'identity' && (
              <Card>
                <Text style={{ fontWeight: '800', color: C.text }}>Takes about 1 minute</Text>
                <Text style={v.line}>1. Photograph the front and back of your driver’s license or passport</Text>
                <Text style={v.line}>2. Take a quick live selfie</Text>
                <Text style={v.line}>3. Stripe checks the ID is real and that it’s you. We never store your ID number.</Text>
              </Card>
            )}
            {t.input === 'faa' && (
              <>
                <Field label="Name exactly as on your FAA certificate" value={lookup} onChangeText={setLookup} />
                <Text style={v.note}>We search the public FAA Airmen Registry by name and location. Adding a certificate photo helps if your name is common.</Text>
              </>
            )}
            {t.input === 'faaAircraft' && <Field label="N-number" value={lookup} onChangeText={setLookup} />}
            {t.input === 'consent' && (
              <Card>
                <Text style={{ color: C.text, lineHeight: 20 }}>
                  RightSeat uses a background-check provider to run an identity trace, national criminal search and sex-offender registry check. You’ll get a copy of the report, and you can dispute anything inaccurate before any decision.
                </Text>
                <Toggle label="I authorize this background check" value={consent} onValueChange={setConsent} />
              </Card>
            )}
            {(t.input === 'upload' || t.input === 'faa') && (
              <>
                {files.length > 0 && <Image source={{ uri: files[0] }} style={{ width: '100%', height: 200, borderRadius: 12, marginBottom: 10 }} />}
                <Button
                  title={files.length ? 'Replace photo' : type === 'logbook' ? 'Upload logbook photos' : t.input === 'faa' ? 'Add certificate photo (optional)' : 'Take photo or upload'}
                  variant="outline"
                  style={{ marginBottom: 8 }}
                  onPress={async () => { const u = await pickImages(type === 'logbook'); if (u.length) setFiles(u); }}
                />
                {type === 'logbook' && <Button title="Import ForeFlight / MyFlightbook CSV" variant="outline" style={{ marginBottom: 8 }} onPress={() => setFiles([])} />}
              </>
            )}
            <View style={v.demo}>
              <Text style={{ color: C.sub, fontWeight: '800', fontSize: 12, marginBottom: 6 }}>DEMO · simulate what the document shows</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {SCENARIOS.map((s) => <Chip key={s.key} small label={s.label} active={scenario === s.key} onPress={() => setScenario(s.key)} />)}
              </View>
            </View>
          </>
        )}

        {stage === 'running' && (
          <Card>
            {steps.map((s, i) => (
              <View key={s} style={v.checkRow}>
                <Text style={{ width: 20, fontWeight: '900', color: i < step ? C.green : C.blue }}>{i < step ? '✓' : i === step ? '◌' : ' '}</Text>
                <Text style={{ color: i <= step ? C.text : C.sub, fontWeight: i === step ? '800' : '500' }}>{s}{i === step ? '…' : ''}</Text>
              </View>
            ))}
          </Card>
        )}

        {stage === 'confirm' && (
          <>
            <DocPreview type={type} fields={ex.fields} uri={files[0]} />
            <SectionTitle>Confirm what we read</SectionTitle>
            <Text style={v.note}>Read by Document AI with {Math.round(ex.confidence * 100)}% confidence. Fix anything that’s wrong. Corrected fields get a quick human check.</Text>
            {t.fields.map(([k, label]) => (
              <View key={k} style={{ marginBottom: 10 }}>
                <Text style={v.fieldLabel}>{label}</Text>
                <TextInput
                  value={String(fields[k] ?? '')}
                  onChangeText={(val) => { setFields({ ...fields, [k]: val }); setEdited(true); }}
                  style={v.input}
                />
              </View>
            ))}
          </>
        )}

        {(stage === 'checking' || stage === 'result') && (
          <>
            <SectionTitle>Automated checks</SectionTitle>
            <Card><CheckRows checks={checks.slice(0, shown)} />{shown < checks.length && <Text style={{ color: C.blue, fontWeight: '700', marginTop: 6 }}>Checking…</Text>}</Card>
          </>
        )}

        {stage === 'result' && result && (
          <View style={[v.result, { backgroundColor: result.decision === 'approved' ? '#E3F7EF' : result.decision === 'review' ? '#FEF3C7' : '#FEE2E2' }]}>
            <Text style={{ fontWeight: '900', fontSize: 18, color: result.decision === 'approved' ? C.green : result.decision === 'review' ? '#B45309' : '#DC2626' }}>
              {result.decision === 'approved' ? (type === 'logbook' ? '✓ Imported (self-reported)' : '✓ Verified automatically') : result.decision === 'review' ? 'Sent to a reviewer' : 'We couldn’t verify this'}
            </Text>
            <Text style={{ color: C.text, marginTop: 6, lineHeight: 19 }}>
              {result.decision === 'approved'
                ? 'No human needed. It’s live on your profile now. We’ll re-check it automatically and remind you before it expires.'
                : result.decision === 'review'
                  ? 'Everything else checked out. A person will look at the items below, usually within a few hours. You’ll get a notification.'
                  : 'Fix the items below and re-upload. Nothing is shown on your profile until it passes.'}
            </Text>
            {result.reasons.map((r) => <Text key={r} style={v.reason}>• {r}</Text>)}
          </View>
        )}
      </ScrollView>

      <View style={v.cta}>
        {stage === 'existing' && <Button title="Replace / re-verify" style={{ flex: 1 }} onPress={() => setStage('input')} />}
        {stage === 'input' && (
          <Button
            style={{ flex: 1 }}
            disabled={t.input === 'consent' && !consent}
            title={t.input === 'identity' ? 'Start ID + selfie check' : t.input === 'faa' ? 'Look up in FAA registry' : t.input === 'faaAircraft' ? 'Look up N-number' : t.input === 'consent' ? 'Start background check' : files.length ? 'Verify document' : 'Use sample document (demo)'}
            onPress={start}
          />
        )}
        {stage === 'confirm' && <Button title={edited ? 'Submit corrections' : 'Looks right — verify'} style={{ flex: 1 }} onPress={() => runChecksAnimated(fields, ex.confidence, edited)} />}
        {stage === 'result' && result?.decision === 'rejected' && <Button title="Fix & re-upload" variant="outline" style={{ flex: 1, marginRight: 8 }} onPress={() => { setStage('input'); setFiles([]); }} />}
        {stage === 'result' && <Button title="Done" style={{ flex: 1 }} onPress={nav.pop} />}
      </View>
    </View>
  );
}

export function ReviewQueue({ nav }) {
  const { queue, automation } = useStore();
  const [tab, setTab] = useState('pending');
  const pending = queue.filter((q) => q.state === 'pending');
  const done = queue.filter((q) => q.state !== 'pending');
  const total = automation.autoApproved + automation.reviewed + automation.rejected + pending.length;
  const list = tab === 'pending' ? pending : done;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Review queue" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Card style={{ flexDirection: 'row', paddingVertical: 10 }}>
          <View style={v.kpi}><Text style={v.kpiVal}>{Math.round((automation.autoApproved / total) * 100)}%</Text><Text style={v.kpiLabel}>Auto-approved</Text></View>
          <View style={v.kpi}><Text style={v.kpiVal}>{pending.length}</Text><Text style={v.kpiLabel}>Need a human</Text></View>
          <View style={v.kpi}><Text style={v.kpiVal}>~2 min</Text><Text style={v.kpiLabel}>Per review</Text></View>
        </Card>
        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <Chip small label={`Pending (${pending.length})`} active={tab === 'pending'} onPress={() => setTab('pending')} />
          <Chip small label={`Done (${done.length})`} active={tab === 'done'} onPress={() => setTab('done')} />
        </View>
        {list.length === 0 && <Text style={{ color: C.sub, textAlign: 'center', marginTop: 20 }}>{tab === 'pending' ? 'Queue is clear. Everything else was handled automatically.' : 'No decisions yet.'}</Text>}
        {list.map((q) => (
          <Card key={q.id} onPress={() => nav.push('ReviewDetail', { id: q.id })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontWeight: '800', color: C.text, flex: 1 }}>{q.who}</Text>
              {q.state === 'pending'
                ? <Tag label={`${Math.round(q.confidence * 100)}% read`} color={q.confidence < 0.8 ? '#B45309' : C.sub} bg={q.confidence < 0.8 ? '#FEF3C7' : '#EEF1F5'} />
                : <Tag label={q.state === 'approved' ? 'Approved' : q.state === 'reupload' ? 'Re-upload requested' : 'Rejected'} color={q.state === 'approved' ? C.green : '#DC2626'} bg={q.state === 'approved' ? '#E3F7EF' : '#FEE2E2'} />}
            </View>
            <Text style={{ color: C.sub, marginTop: 2 }}>{DOC_TYPES[q.type].title} · {q.role} · {q.submitted}</Text>
            {q.reasons[0] && <Text style={[v.reason, { marginTop: 8 }]} numberOfLines={2}>{q.reasons[0]}</Text>}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const NOTES = ['Name variation OK', 'Matches certificate photo', 'Authority confirmed (LLC/leaseback)', 'Need a clearer photo', 'Upload IA card', 'Add RightSeat as additional insured'];

export function ReviewDetail({ nav, params }) {
  const { queue, reviewDoc } = useStore();
  const q = queue.find((x) => x.id === params.id);
  const [note, setNote] = useState('');
  if (!q) return null;
  const act = (a) => { reviewDoc(q.id, a, note); nav.pop(); };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Review" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Text style={{ fontWeight: '900', fontSize: 20, color: C.text }}>{q.who}</Text>
        <Text style={{ color: C.sub, marginBottom: 10 }}>{DOC_TYPES[q.type].title} · {q.role} · {q.submitted}</Text>
        <DocPreview type={q.type} fields={q.fields} uri={q.files?.[0]} />
        <SectionTitle>Why it’s here</SectionTitle>
        {q.reasons.map((r) => <Text key={r} style={v.reason}>• {r}</Text>)}
        <SectionTitle>Extracted fields</SectionTitle>
        <Card>
          {DOC_TYPES[q.type].fields.map(([k, label]) => (
            <View key={k} style={{ flexDirection: 'row', paddingVertical: 5 }}>
              <Text style={{ color: C.sub, flex: 1 }}>{label}</Text>
              <Text style={{ color: C.text, fontWeight: '700', flex: 1.3, textAlign: 'right' }}>{q.fields[k] || '—'}</Text>
            </View>
          ))}
        </Card>
        <SectionTitle>Automated checks</SectionTitle>
        <Card><CheckRows checks={q.checks} /></Card>
        {q.state === 'pending' && (
          <>
            <SectionTitle>Note to user</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {NOTES.map((n) => <Chip key={n} small label={n} active={note === n} onPress={() => setNote(note === n ? '' : n)} />)}
            </View>
          </>
        )}
        {q.state !== 'pending' && <Text style={v.note}>Decision: {q.state}{q.note ? ` · “${q.note}”` : ''}</Text>}
      </ScrollView>
      {q.state === 'pending' && (
        <View style={v.cta}>
          <Button title="Re-upload" variant="outline" style={{ flex: 1, marginRight: 8, paddingVertical: 13 }} onPress={() => act('reupload')} />
          <Button title="Reject" variant="outline" style={{ flex: 0.8, marginRight: 8, paddingVertical: 13, borderColor: '#DC2626' }} onPress={() => act('rejected')} />
          <Button title="Approve" style={{ flex: 1, paddingVertical: 13, backgroundColor: C.green }} onPress={() => act('approved')} />
        </View>
      )}
    </View>
  );
}

export function AutomationMonitor({ nav }) {
  const { docs, getPlane, automation, queue } = useStore();
  const [runs, setRuns] = useState({});
  const jobs = [
    { k: 'airmen', name: 'FAA Airmen Registry sync', when: 'Monthly · after FAA publishes', last: 'Oct 1', result: 'Re-checked 138 CFIs & renters · 1 change: Dana Whitlock added CFII' },
    { k: 'aircraft', name: 'FAA Aircraft Registry sync', when: 'Nightly · 12:15 AM CT (FAA refreshes 11:30 PM)', last: 'Today', result: 'Re-checked 52 aircraft · 0 changes' },
    { k: 'expiry', name: 'Expiration sweep', when: 'Daily · 6:00 AM', last: 'Today', result: '3 reminders sent · 1 listing auto-paused' },
    { k: 'broker', name: 'Broker insurance confirmations', when: 'On upload · reminder every 3 days', last: 'Today', result: '2 awaiting broker reply · 9 confirmed this month' },
    { k: 'stripe', name: 'Stripe Identity webhooks', when: 'Real-time', last: 'Live', result: '47 verifications this month · 2 needed a retry' },
  ];
  const mine = [];
  Object.entries(docs).forEach(([key, set]) =>
    Object.entries(set).forEach(([type, d]) => {
      if (d.status === 'approved' && d.expires && daysUntil(d.expires) < 400) mine.push({ who: getPlane(key) ? getPlane(key).tail : key === 'me' ? 'You' : 'Your CFI profile', what: DOC_TYPES[type].title, days: daysUntil(d.expires), date: d.expires });
    })
  );
  const seeded = [
    { who: 'Tom Okafor', what: 'Instructor liability insurance', days: 12, date: fmt(new Date(Date.now() + 12 * 864e5)) },
    { who: 'N152GC', what: 'Annual inspection', days: 26, date: fmt(new Date(Date.now() + 26 * 864e5)) },
    { who: 'Leah M.', what: 'Medical certificate', days: 41, date: fmt(new Date(Date.now() + 41 * 864e5)) },
  ];
  const upcoming = [...seeded, ...mine].sort((a, b) => a.days - b.days).slice(0, 8);
  const pending = queue.filter((q) => q.state === 'pending').length;
  const total = automation.autoApproved + automation.reviewed + automation.rejected + pending;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Automation" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={v.hero}>
          <Text style={{ color: '#AFC3E0', fontWeight: '700' }}>Handled with no human</Text>
          <Text style={{ color: '#fff', fontSize: 36, fontWeight: '900' }}>{Math.round((automation.autoApproved / total) * 100)}%</Text>
          <Text style={{ color: '#AFC3E0' }}>{automation.autoApproved} auto-approved · {automation.reviewed} reviewed · {pending} in queue · median 38 sec</Text>
        </View>

        <SectionTitle>Scheduled jobs</SectionTitle>
        {jobs.map((j) => (
          <Card key={j.k}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: C.text, flex: 1 }}>{j.name}</Text>
              <Tag label="Healthy" color={C.green} bg="#E3F7EF" />
            </View>
            <Text style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>{j.when} · last run {runs[j.k] || j.last}</Text>
            <Text style={{ color: C.text, marginTop: 6, fontSize: 13 }}>{j.result}</Text>
            {j.k !== 'stripe' && (
              <Pressable onPress={() => setRuns({ ...runs, [j.k]: 'just now' })}><Text style={{ color: C.blue, fontWeight: '700', marginTop: 6 }}>Run now ›</Text></Pressable>
            )}
          </Card>
        ))}

        <SectionTitle>Upcoming expirations</SectionTitle>
        <Card>
          {upcoming.map((u, i) => (
            <View key={i} style={[v.row, i === 0 && { borderTopWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.text }}>{u.who} · {u.what}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>
                  {u.date} · reminders {[30, 14, 3].map((d) => (u.days <= d ? `${d}d ✓` : `${d}d`)).join(' · ')}
                </Text>
              </View>
              <Tag label={u.days <= 0 ? 'Paused' : `${u.days}d`} color={u.days <= 14 ? '#B45309' : C.sub} bg={u.days <= 14 ? '#FEF3C7' : '#EEF1F5'} />
            </View>
          ))}
        </Card>

        <SectionTitle>Auto-paused</SectionTitle>
        <Card>
          <Text style={{ fontWeight: '700', color: C.text }}>N22CW · Piper J-3 Cub</Text>
          <Text style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>Insurance expired yesterday → new bookings paused, owner notified by push + email. Resumes automatically when a new policy verifies.</Text>
        </Card>
      </ScrollView>
    </View>
  );
}

// Badge card for CFI profiles and aircraft listings.
export function VerifiedCard({ kind, entity }) {
  const { docs } = useStore();
  let items;
  // Live listings show what RightSeat has actually verified on the server.
  if (entity.live) {
    const s = (ok) => (ok ? 'ok' : 'missing');
    items = kind === 'cfi'
      ? [
          ['Identity', 'Verified by RightSeat', s(entity.verified)],
          [`FAA certificate · ${(entity.certs || ['CFI']).join(', ')}`, 'FAA Airmen Registry', s(entity.verified)],
        ]
      : [
          ['FAA registration', 'FAA Aircraft Registry', s(entity.airworthyVerified)],
          ['Airworthiness certificate', 'Serial matched', s(entity.airworthyVerified)],
          ['Insurance · rental & instruction', 'Policy verified', s(entity.insured)],
        ];
  } else if (kind === 'cfi') {
    items = [
      ['Identity', 'Stripe Identity', 'ok'],
      [`FAA certificate · ${entity.certs.join(', ')}`, 'FAA Airmen Registry', 'ok'],
      ['Instructor insurance', entity.id === 'c3' ? 'In review' : 'Policy verified', entity.id === 'c3' ? 'review' : 'ok'],
    ];
    if (['c1', 'c4', 'c2'].includes(entity.id)) items.push(['Background check', 'Clear', 'ok']);
  } else {
    const d = docs[entity.id];
    const st = (t, fallback = 'ok') => (d ? (d[t]?.status === 'approved' ? 'ok' : d[t]?.status === 'review' ? 'review' : 'missing') : fallback);
    items = [
      ['FAA registration', 'FAA Aircraft Registry', st('registration', entity.id === 'p5' ? 'review' : 'ok')],
      ['Airworthiness certificate', 'Serial matched', st('airworthiness')],
      ['Insurance · rental & instruction', 'Broker confirmed', st('ownerIns')],
      ['Annual inspection', 'Logbook entry verified', st('annual')],
      ['100-hr inspection', 'Tracked from Hobbs', st('hundredHr')],
    ];
  }
  return (
    <Card>
      {items.map(([label, sub, s]) => (
        <View key={label} style={v.checkRow}>
          <Text style={{ width: 20, fontWeight: '900', color: s === 'ok' ? C.green : s === 'review' ? '#B45309' : C.line }}>{s === 'ok' ? '✓' : s === 'review' ? '…' : '○'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: '600' }}>{label}</Text>
            <Text style={{ color: C.sub, fontSize: 11 }}>{s === 'ok' ? sub : s === 'review' ? 'In review' : 'Not yet verified'}</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

export function planeVerified(plane, docs) {
  if (plane.live) return !!(plane.airworthyVerified && plane.insured);
  const d = docs[plane.id];
  if (!d) return !plane.userListed; // seeded listings were verified at onboarding
  return d.registration?.status === 'approved' && d.ownerIns?.status === 'approved';
}

const v = StyleSheet.create({
  hero: { backgroundColor: C.navy, borderRadius: 18, padding: 18 },
  bar: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden', marginTop: 8 },
  barFill: { height: 8, borderRadius: 4, backgroundColor: '#4ADE80' },
  note: { color: C.sub, fontSize: 12, marginBottom: 8, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F3F7' },
  line: { color: C.text, marginTop: 6, lineHeight: 19 },
  demo: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#CBD5E1', borderRadius: 12, padding: 10, marginTop: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5 },
  doc: { backgroundColor: '#FFFDF5', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E8E2CC', marginBottom: 6 },
  docHead: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E8E2CC', paddingBottom: 6, marginBottom: 4 },
  docTitle: { fontWeight: '900', color: '#3F3A2A', fontSize: 12, letterSpacing: 0.5 },
  docSample: { color: '#C2410C', fontWeight: '900', fontSize: 10, borderWidth: 1, borderColor: '#C2410C', paddingHorizontal: 4, borderRadius: 4 },
  docLabel: { width: 130, color: '#8A8167', fontSize: 10, fontWeight: '700' },
  docValue: { flex: 1, color: '#2B2717', fontSize: 12, fontWeight: '600' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.sub, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text },
  result: { borderRadius: 14, padding: 14, marginTop: 12 },
  reason: { color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 8, padding: 8, marginTop: 6, fontSize: 13 },
  kpi: { flex: 1, alignItems: 'center' },
  kpiVal: { fontSize: 20, fontWeight: '900', color: C.navy },
  kpiLabel: { fontSize: 11, color: C.sub, marginTop: 2 },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: '#fff', padding: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.line },
});
