import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Image, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { useAuth } from '../backend/auth';
import { SYLLABUS } from '../data';
import { PPL_MINIMUMS, r2 } from '../logic';
import { PROGRAMS, WHERE, LAST_FLIGHT, PRIOR_ENDORSEMENTS, DEMO_IMPORT, emptyPrior, HOUR_KEYS, lessonState } from '../progress';
import { C, Card, SectionTitle, Button, Tag, Chip, Toggle, Field, MultiSelect, Avatar, pickImages } from '../ui';
import { Header } from './Details';

const STEPS = ['Background', 'Hours', 'Lessons', 'Endorsements', 'Review'];
const num = (v) => (v === '' || isNaN(+v) ? 0 : r2(+v));

export function PriorExperience({ nav, params }) {
  const { training, savePrior, getCfi, requests, pilot } = useStore();
  const signedIn = !!useAuth()?.session;
  const start = training.prior ? JSON.parse(JSON.stringify(training.prior)) : emptyPrior();
  const shareDefault = [...new Set([...(start.sharedWith || []), training.cfiId, params?.shareWith].filter(Boolean))];
  const [p, setP] = useState({ ...start, sharedWith: shareDefault, hours: Object.fromEntries(HOUR_KEYS.map((k) => [k, start.hours[k] ? String(start.hours[k]) : ''])), landings: start.landings ? String(start.landings) : '' });
  const [step, setStep] = useState(0);
  const [reading, setReading] = useState(false);
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }));
  const setHour = (k, v) => setP((x) => ({ ...x, hours: { ...x.hours, [k]: v } }));
  const setLesson = (l, v) => setP((x) => {
    const lessons = { ...x.lessons };
    if (v) lessons[l] = v; else delete lessons[l];
    return { ...x, lessons };
  });
  const hasEnd = (name) => p.endorsements.find((e) => e.name === name);
  const toggleEnd = (e) => setP((x) => ({ ...x, endorsements: hasEnd(e.name) ? x.endorsements.filter((y) => y.name !== e.name) : [...x.endorsements, { name: e.name, ref: e.ref, date: '', by: x.school || '' }] }));
  const setEnd = (name, k, v) => setP((x) => ({ ...x, endorsements: x.endorsements.map((y) => (y.name === name ? { ...y, [k]: v } : y)) }));
  const inRecord = (name) => training.endorsements.some((e) => e.name.toLowerCase().startsWith(name.toLowerCase().replace(' (90-day)', '').slice(0, 18)));

  const importDemo = (source) => {
    setReading(true);
    setTimeout(() => {
      setP((x) => ({
        ...x,
        source,
        hours: Object.fromEntries(HOUR_KEYS.map((k) => [k, String(DEMO_IMPORT.hours[k] || '')])),
        landings: String(DEMO_IMPORT.landings),
        aircraft: x.aircraft || DEMO_IMPORT.aircraft,
      }));
      setReading(false);
    }, 1300);
  };

  const H = Object.fromEntries(HOUR_KEYS.map((k) => [k, num(p.hours[k])]));
  const warnings = [];
  if (H.total && Math.abs(H.dual + H.solo - H.total) > 0.6) warnings.push(`Dual (${H.dual}) + solo (${H.solo}) doesn’t add up to total (${H.total}). That’s fine if you logged other time, but double-check.`);
  if (H.dualXC > H.dual) warnings.push('Dual cross-country can’t be more than total dual.');
  if (H.soloXC > H.solo) warnings.push('Solo cross-country can’t be more than total solo.');
  if (H.solo > 0 && !p.soloed) warnings.push('You entered solo time. Turn on “I’ve soloed” in Background.');

  const cfiOptions = [...new Set([training.cfiId, params?.shareWith, ...requests.map((r) => r.cfiId)].filter(Boolean))].map(getCfi).filter(Boolean);
  const covered = Object.values(p.lessons).filter((v) => v === 'done').length;
  const rusty = Object.values(p.lessons).filter((v) => v === 'rusty').length;

  const save = () => {
    savePrior({ ...p, hours: H, landings: num(p.landings) });
    nav.pop();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Previous experience" />
      <View style={s.steps}>
        {STEPS.map((x, i) => (
          <Pressable key={x} onPress={() => setStep(i)} style={{ flex: 1, alignItems: 'center' }}>
            <View style={[s.stepBar, i <= step && { backgroundColor: C.blue }]} />
            <Text style={[s.stepText, i === step && { color: C.blue, fontWeight: '800' }]}>{x}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {step === 0 && (
          <>
            <Text style={s.lead}>Tell your new CFI where you’re coming from. Takes about 3 minutes, less if you snap your logbook.</Text>
            <MultiSelect single label="Working toward" options={PROGRAMS} selected={[p.program]} onChange={(v) => set('program')(v[0])} />
            <MultiSelect single label="Where did you train?" options={WHERE} selected={[p.where]} onChange={(v) => set('where')(v[0])} />
            <Field label="School or previous CFI (optional)" value={p.school} onChangeText={set('school')} placeholder="e.g. Sunshine Flight Center / Jane Smith, CFI" />
            <Field label="Aircraft you’ve flown" value={p.aircraft} onChangeText={set('aircraft')} placeholder="e.g. Cessna 152, Piper Warrior" />
            <MultiSelect single label="When did you last fly?" options={LAST_FLIGHT} selected={[p.lastFlight]} onChange={(v) => set('lastFlight')(v[0])} />
            {['3–12 months ago', 'Over a year ago'].includes(p.lastFlight) && (
              <Text style={s.tip}>It’s been a while, which is totally normal. Expect your first lesson to be a refresher of landings and emergency procedures before moving on.</Text>
            )}
            <Toggle label="I’ve soloed" value={p.soloed} onValueChange={set('soloed')} />
            {p.soloed && <Field label="First solo (month / year)" value={p.soloDate} onChangeText={set('soloDate')} placeholder="e.g. Jun 2026" />}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={s.lead}>Fastest: photograph your logbook’s totals page (or the last few pages) and we’ll read the columns.</Text>
            <View style={{ flexDirection: 'row' }}>
              <Button title="📷 Snap logbook" style={{ flex: 1, marginRight: 8, paddingVertical: 12 }} onPress={async () => { const u = await pickImages(true); set('files')([...p.files, ...u]); importDemo('logbook-photo'); }} />
              <Button title="Import CSV" variant="outline" style={{ flex: 1, paddingVertical: 12 }} onPress={() => importDemo('foreflight')} />
            </View>
            <Text style={s.hint}>CSV from ForeFlight, MyFlightbook, LogTen or Garmin Pilot. No logbook handy? Type the totals below.</Text>
            {p.files.length > 0 && (
              <ScrollView horizontal style={{ marginTop: 8 }}>
                {p.files.map((u, i) => <Image key={i} source={{ uri: u }} style={{ width: 70, height: 70, borderRadius: 10, marginRight: 6 }} />)}
              </ScrollView>
            )}
            {reading && <Text style={[s.tip, { backgroundColor: C.sky, color: C.navy }]}>Reading your logbook…</Text>}
            {!reading && p.source !== 'manual' && <Text style={[s.tip, { backgroundColor: '#E3F7EF', color: '#065F46' }]}>✓ Filled in from your {p.source === 'foreflight' ? 'CSV export' : 'logbook photo'}. Check the numbers and fix anything that’s off.</Text>}
            <SectionTitle>Totals (hours)</SectionTitle>
            <View style={s.grid}>
              {PPL_MINIMUMS.map((m) => (
                <View key={m.key} style={s.cell}>
                  <Text style={s.fieldLabel}>{m.label}</Text>
                  <TextInput value={p.hours[m.key]} onChangeText={(v) => setHour(m.key, v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor="#9AA3B2" style={s.input} />
                </View>
              ))}
              <View style={s.cell}>
                <Text style={s.fieldLabel}>Landings</Text>
                <TextInput value={p.landings} onChangeText={(v) => set('landings')(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor="#9AA3B2" style={s.input} />
              </View>
            </View>
            {warnings.map((w) => <Text key={w} style={s.warn}>{w}</Text>)}
          </>
        )}

        {step === 2 && (
          <>
            <Text style={s.lead}>Mark what you’ve already covered. Be honest about anything rusty. Your CFI will spend time there instead of re-teaching what you know.</Text>
            {SYLLABUS.map((st) => (
              <Card key={st.stage}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontWeight: '800', color: C.text }}>{st.stage}</Text>
                  <Pressable onPress={() => st.lessons.forEach((l) => lessonState(training, l) !== 'app' && setLesson(l, 'done'))}><Text style={{ color: C.blue, fontWeight: '700', fontSize: 12 }}>Mark all done</Text></Pressable>
                </View>
                {st.lessons.map((l) => {
                  const inApp = lessonState(training, l) === 'app';
                  return (
                    <View key={l} style={s.lessonRow}>
                      <Text style={{ color: C.text, fontWeight: '600', marginBottom: 4 }}>{l}</Text>
                      {inApp ? (
                        <Text style={{ color: C.green, fontSize: 12, fontWeight: '700' }}>✓ Signed off in Positive Rate</Text>
                      ) : (
                        <View style={{ flexDirection: 'row' }}>
                          <Chip small label="Done" active={p.lessons[l] === 'done'} onPress={() => setLesson(l, 'done')} />
                          <Chip small label="Rusty" active={p.lessons[l] === 'rusty'} onPress={() => setLesson(l, 'rusty')} />
                          <Chip small label="Not yet" active={!p.lessons[l]} onPress={() => setLesson(l, null)} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </Card>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <Text style={s.lead}>Check off endorsements in your logbook and add the date and who signed it. A photo of the endorsement pages helps your CFI confirm quickly.</Text>
            <Card>
              {PRIOR_ENDORSEMENTS.map((e) => {
                const on = hasEnd(e.name);
                const already = inRecord(e.name);
                return (
                  <View key={e.name} style={s.endRow}>
                    <Pressable disabled={already} onPress={() => toggleEnd(e)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[s.box, (on || already) && { backgroundColor: already ? C.green : C.blue, borderColor: already ? C.green : C.blue }]}>
                        {(on || already) && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: C.text }}>{e.name}</Text>
                        <Text style={{ color: C.sub, fontSize: 12 }}>{e.ref}{already ? ' · already in your Positive Rate record' : ''}</Text>
                      </View>
                    </Pressable>
                    {on && !already && (
                      <View style={{ flexDirection: 'row', marginTop: 8, marginLeft: 32 }}>
                        <TextInput value={on.date} onChangeText={(v) => setEnd(e.name, 'date', v)} placeholder="Date signed" placeholderTextColor="#9AA3B2" style={[s.input, { flex: 1, marginRight: 6 }]} />
                        <TextInput value={on.by} onChangeText={(v) => setEnd(e.name, 'by', v)} placeholder="Signed by (CFI)" placeholderTextColor="#9AA3B2" style={[s.input, { flex: 1.3 }]} />
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
            <Button title={p.files.length ? `📷 ${p.files.length} photo${p.files.length > 1 ? 's' : ''} attached · add more` : '📷 Photograph endorsement pages'} variant="outline" style={{ paddingVertical: 12 }} onPress={async () => { const u = await pickImages(true); if (u.length) set('files')([...p.files, ...u]); }} />
            {!signedIn && <SectionTitle>Medical & student certificate</SectionTitle>}
            {!signedIn && <Card style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => nav.push('Verification')}>
              <Text style={{ flex: 1, color: C.text }}>Verified in your Verification center</Text>
              <Tag label={`${pilot.medical} ✓`} color={C.green} bg="#E3F7EF" />
            </Card>}
          </>
        )}

        {step === 4 && (
          <>
            <Card>
              <Text style={{ fontWeight: '900', fontSize: 16, color: C.text }}>{p.program} · {p.where}</Text>
              {p.school ? <Text style={s.hint}>{p.school}</Text> : null}
              <View style={s.sumRow}><Text style={s.sumLabel}>Total time</Text><Text style={s.sumVal}>{H.total} hrs</Text></View>
              <View style={s.sumRow}><Text style={s.sumLabel}>Dual / solo</Text><Text style={s.sumVal}>{H.dual} / {H.solo}</Text></View>
              <View style={s.sumRow}><Text style={s.sumLabel}>Cross-country / night / instrument</Text><Text style={s.sumVal}>{r2(H.dualXC + H.soloXC)} / {H.night} / {H.instrument}</Text></View>
              <View style={s.sumRow}><Text style={s.sumLabel}>Lessons covered</Text><Text style={s.sumVal}>{covered}{rusty ? ` (+${rusty} rusty)` : ''}</Text></View>
              <View style={s.sumRow}><Text style={s.sumLabel}>Endorsements</Text><Text style={s.sumVal}>{p.endorsements.length}</Text></View>
              <View style={s.sumRow}><Text style={s.sumLabel}>Last flew</Text><Text style={s.sumVal}>{p.lastFlight}</Text></View>
              <View style={s.sumRow}><Text style={s.sumLabel}>Source</Text><Text style={s.sumVal}>{p.source === 'manual' ? 'Entered manually' : p.source === 'foreflight' ? 'CSV import' : 'Logbook photo'}</Text></View>
            </Card>
            <SectionTitle>Share with</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cfiOptions.map((c) => (
                <Chip key={c.id} small label={c.name} active={p.sharedWith.includes(c.id)} onPress={() => set('sharedWith')(p.sharedWith.includes(c.id) ? p.sharedWith.filter((x) => x !== c.id) : [...p.sharedWith, c.id])} />
              ))}
            </View>
            <View style={s.tipBox}>
              <Text style={{ fontWeight: '800', color: C.navy }}>What happens next</Text>
              <Text style={s.tipLine}>• It shows on your Training tab as “self-reported” and counts toward your progress and cost estimate right away.</Text>
              <Text style={s.tipLine}>• Your CFI reviews it and your logbook. Most do a 1-hour assessment flight first.</Text>
              <Text style={s.tipLine}>• Once they confirm it, it’s marked “confirmed”. Anything rusty goes back on the plan.</Text>
              <Text style={s.tipLine}>• You can update it any time. Changes go back to self-reported until re-confirmed.</Text>
            </View>
          </>
        )}
      </ScrollView>
      <View style={s.cta}>
        {step > 0 && <Button title="Back" variant="outline" style={{ flex: 0.6, marginRight: 8 }} onPress={() => setStep(step - 1)} />}
        {step < STEPS.length - 1
          ? <Button title="Next" style={{ flex: 1 }} onPress={() => setStep(step + 1)} />
          : <Button title={p.sharedWith.length ? 'Save & share' : 'Save'} style={{ flex: 1 }} onPress={save} />}
      </View>
    </View>
  );
}

// Instructor side: review a student's previous experience and confirm it.
export function PriorReview({ nav, params }) {
  const { training, myCfiId, getCfi, confirmPrior, pilot } = useStore();
  const cfiId = params?.cfiId || myCfiId || 'c1';
  const cfi = getCfi(cfiId);
  const p = training.prior;
  const init = {};
  Object.entries(p?.lessons || {}).forEach(([l, v]) => (init[l] = v === 'rusty' ? 'needs' : 'confirmed'));
  const [notes, setNotes] = useState(init);
  const [logbookSeen, setLogbookSeen] = useState(false);
  if (!p) return null;
  const H = p.hours;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Review previous experience" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Text style={s.demo}>Demo: viewing as {cfi.name}</Text>
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Avatar initials="SC" color="#0891B2" size={46} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontWeight: '900', fontSize: 16, color: C.text }}>{pilot.name}</Text>
            <Text style={{ color: C.sub }}>{p.program} · {p.where}{p.school ? ` · ${p.school}` : ''}</Text>
            <Text style={{ color: C.sub, fontSize: 12 }}>Last flew {p.lastFlight.toLowerCase()} · {p.soloed ? `soloed ${p.soloDate || ''}` : 'not soloed'} · {p.aircraft || 'aircraft not listed'}</Text>
          </View>
        </Card>
        {['3–12 months ago', 'Over a year ago'].includes(p.lastFlight) && <Text style={s.warn}>Hasn’t flown recently. Plan a refresher before moving on.</Text>}

        <SectionTitle>Hours ({p.source === 'manual' ? 'entered manually' : p.source === 'foreflight' ? 'CSV import' : 'read from logbook photo'})</SectionTitle>
        <Card>
          {PPL_MINIMUMS.map((m) => (
            <View key={m.key} style={s.sumRow}><Text style={s.sumLabel}>{m.label}</Text><Text style={s.sumVal}>{H[m.key] || 0}</Text></View>
          ))}
          <View style={s.sumRow}><Text style={s.sumLabel}>Landings</Text><Text style={s.sumVal}>{p.landings || 0}</Text></View>
          {p.files.length > 0 && (
            <ScrollView horizontal style={{ marginTop: 8 }}>
              {p.files.map((u, i) => <Image key={i} source={{ uri: u }} style={{ width: 80, height: 80, borderRadius: 10, marginRight: 6 }} />)}
            </ScrollView>
          )}
          <Toggle label="I’ve checked these against the logbook" value={logbookSeen} onValueChange={setLogbookSeen} />
        </Card>

        <SectionTitle>Lessons the student says they’ve covered</SectionTitle>
        <Card>
          {Object.keys(p.lessons).length === 0 && <Text style={{ color: C.sub }}>None marked.</Text>}
          {Object.entries(p.lessons).map(([l, v]) => (
            <View key={l} style={s.lessonRow}>
              <Text style={{ color: C.text, fontWeight: '600' }}>{l}{v === 'rusty' ? '  ·  student says rusty' : ''}</Text>
              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                <Chip small label="Confirmed" active={notes[l] === 'confirmed'} onPress={() => setNotes({ ...notes, [l]: 'confirmed' })} />
                <Chip small label="Needs work" active={notes[l] === 'needs'} onPress={() => setNotes({ ...notes, [l]: 'needs' })} />
              </View>
            </View>
          ))}
        </Card>

        <SectionTitle>Endorsements</SectionTitle>
        <Card>
          {p.endorsements.length === 0 && <Text style={{ color: C.sub }}>None entered.</Text>}
          {p.endorsements.map((e) => (
            <View key={e.name} style={s.sumRow}><Text style={s.sumLabel}>{e.name} · {e.ref}</Text><Text style={s.sumVal}>{e.date || '—'}</Text></View>
          ))}
        </Card>
        <Text style={s.hint}>Confirming records that you reviewed the student’s experience. Your own endorsements are still signed in their logbook as usual.</Text>
      </ScrollView>
      <View style={s.cta}>
        <Button title={logbookSeen ? 'Confirm previous experience' : 'Check the logbook first'} disabled={!logbookSeen} style={{ flex: 1 }} onPress={() => { confirmPrior(cfiId, notes); nav.pop(); }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  steps: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 10, paddingBottom: 10 },
  stepBar: { height: 4, alignSelf: 'stretch', marginHorizontal: 3, borderRadius: 2, backgroundColor: C.line },
  stepText: { fontSize: 11, color: C.sub, marginTop: 4 },
  lead: { color: C.text, fontSize: 15, lineHeight: 21, marginBottom: 14 },
  hint: { color: C.sub, fontSize: 12, marginTop: 6, lineHeight: 17 },
  tip: { backgroundColor: '#FEF3C7', color: '#92400E', borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 13, lineHeight: 18, marginTop: 8 },
  warn: { backgroundColor: '#FEF3C7', color: '#92400E', borderRadius: 10, padding: 10, marginTop: 8, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: { width: '48.5%', marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.sub, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text },
  lessonRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F3F7' },
  endRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F3F7' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.line, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  sumLabel: { color: C.sub, flex: 1, paddingRight: 8 },
  sumVal: { color: C.text, fontWeight: '700' },
  tipBox: { backgroundColor: C.sky, borderRadius: 14, padding: 14, marginTop: 14 },
  tipLine: { color: C.navy, fontSize: 13, marginTop: 6, lineHeight: 18 },
  demo: { color: C.sub, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: '#fff', padding: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.line },
});
