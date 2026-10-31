import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { useStore, money } from '../store';
import { SCHOOL_BOOKINGS } from '../data';
import { quote, money2, r2 } from '../logic';
import { C, Card, Button, Tag, Chip, Avatar, Tabs, Sheet, ListRow, Stepper, Icon, Stars, SectionTitle } from '../ui';
import { PlaneImage } from '../art';
import { Header } from './Details';

const pctLabel = (a) => `${a.model === 'employee' ? 'Employee' : 'Revenue share'} · school ${Math.round(a.schoolPct * 100)}%`;

// Example split so everyone sees exactly what a lesson pays.
export function SplitExample({ cfi, model, schoolPct, rate }) {
  const r = rate || cfi?.flightRate || 75;
  const fh = 1.5;
  const q = quote({ cfi: { ...(cfi || {}), flightRate: r, groundRate: 0 }, plane: null, flightHours: fh, groundHours: 0, repeat: true, cfiPro: cfi?.pro, method: 'wallet', affiliation: { model, schoolPct } });
  return (
    <View style={sc.example}>
      <Text style={{ fontWeight: '800', color: C.navy }}>Example: 1.5 hr lesson at {money(r)}/hr = {money2(q.instruction)} instruction</Text>
      <View style={sc.exRow}><Text style={sc.exLabel}>School</Text><Text style={sc.exVal}>{money2(q.split.school)}</Text></View>
      <View style={sc.exRow}><Text style={sc.exLabel}>Instructor</Text><Text style={sc.exVal}>{money2(q.split.cfi)}</Text></View>
      <Text style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>Repeat student shown. On a new student’s first lesson, RightSeat’s 5% host fee comes off first (0% on CFI Pro). Aircraft rental is paid to the plane’s owner separately.</Text>
    </View>
  );
}

export function SchoolDashboard({ nav }) {
  const store = useStore();
  const { mySchoolId, getSchool, getCfi, getPlane, cfis, affiliations, requests, respondAffiliation, requestAffiliation, endAffiliation, updateAffiliation, setCfiRate, updateSchoolTerms, planesForSchool } = store;
  const sid = mySchoolId || 's1';
  const x = getSchool(sid);
  const [tab, setTab] = useState('schedule');
  const [who, setWho] = useState('all');
  const [invite, setInvite] = useState(false);
  const [edit, setEdit] = useState(null);
  const affs = affiliations.filter((a) => a.schoolId === sid);
  const active = affs.filter((a) => a.status === 'active');
  const pending = affs.filter((a) => a.status === 'pending');
  const cfiIds = active.map((a) => a.cfiId);
  const fleet = planesForSchool(sid).map((p) => p.id);

  // School schedule = its instructors' bookings + bookings in its aircraft.
  const mine = requests.filter((r) => (cfiIds.includes(r.cfiId) || fleet.includes(r.planeId)) && r.status !== 'Cancelled').map((r) => ({ ...r, student: 'Sam Carter' }));
  const all = [...SCHOOL_BOOKINGS.filter((b) => cfiIds.includes(b.cfiId) || fleet.includes(b.planeId)), ...mine];
  const withMoney = all.map((b) => {
    const cfi = getCfi(b.cfiId);
    const aff = active.find((a) => a.cfiId === b.cfiId);
    const q = quote({ cfi, plane: getPlane(b.planeId), flightHours: b.flightHours, groundHours: b.groundHours || 0, repeat: b.repeat, cfiPro: cfi?.pro, method: 'wallet', affiliation: aff });
    return { ...b, schoolShare: r2((q.split.school || 0) + (fleet.includes(b.planeId) ? q.split.owner : 0)) };
  });
  const upcoming = withMoney.filter((b) => ['Pending', 'Confirmed'].includes(b.status) && (who === 'all' || b.cfiId === who)).sort((a, b) => new Date(a.when) - new Date(b.when));
  const days = [...new Set(upcoming.map((b) => b.date))];
  const weekShare = withMoney.filter((b) => ['Pending', 'Confirmed'].includes(b.status)).reduce((a, b) => a + b.schoolShare, 0);
  const independent = cfis.filter((c) => !affiliations.some((a) => a.cfiId === c.id && ['active', 'pending'].includes(a.status)));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="School dashboard" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} stickyHeaderIndices={[1]}>
        <View style={sc.hero}>
          {!mySchoolId && <Text style={{ color: '#9FB3D1', fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Demo: viewing as {x.name}</Text>}
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{x.name}</Text>
          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            <View style={{ flex: 1 }}><Text style={sc.big}>{money(x.monthEarnings || 0)}</Text><Text style={sc.small}>earned this month</Text></View>
            <View style={{ flex: 1 }}><Text style={sc.big}>{money(weekShare)}</Text><Text style={sc.small}>scheduled share</Text></View>
            <View style={{ flex: 0.8 }}><Text style={sc.big}>{active.length}</Text><Text style={sc.small}>instructors</Text></View>
          </View>
        </View>
        <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Tabs value={tab} onChange={setTab} tabs={[{ key: 'schedule', label: 'Schedule' }, { key: 'team', label: 'Instructors' }, { key: 'requests', label: `Requests${pending.length ? ` (${pending.length})` : ''}` }, { key: 'terms', label: 'Terms' }]} />
        </View>

        <View style={{ padding: 16 }}>
          {tab === 'schedule' && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                <Chip small label="Everyone" active={who === 'all'} onPress={() => setWho('all')} />
                {cfiIds.map((id) => <Chip key={id} small label={getCfi(id)?.name.split(' ')[0]} active={who === id} onPress={() => setWho(id)} />)}
              </ScrollView>
              <Text style={sc.note}>Every lesson booked with your instructors or in your aircraft. Your share includes instruction (per each instructor’s terms) and aircraft rental for planes you own.</Text>
              {days.length === 0 && <Text style={{ color: C.sub, textAlign: 'center', marginTop: 20 }}>Nothing scheduled.</Text>}
              {days.map((d) => (
                <View key={d}>
                  <Text style={sc.day}>{d}</Text>
                  {upcoming.filter((b) => b.date === d).map((b) => {
                    const cfi = getCfi(b.cfiId);
                    const p = getPlane(b.planeId);
                    return (
                      <Card key={b.id} style={{ padding: 12, flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 62 }}>
                          <Text style={{ fontWeight: '900', color: C.text }}>{b.time.replace(':00', '')}</Text>
                          <Text style={{ color: C.sub, fontSize: 11 }}>{b.flightHours} hr</Text>
                        </View>
                        {cfi ? <Avatar initials={cfi.initials} color={cfi.color} size={34} photo={cfi.photo} /> : <PlaneImage plane={p} size={34} />}
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ fontWeight: '800', color: C.text }} numberOfLines={1}>{b.student} · {b.goal}</Text>
                          <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{cfi ? cfi.name : 'Solo rental'} · {p?.tail}{b.status === 'Pending' ? ' · awaiting confirmation' : ''}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontWeight: '900', color: C.green }}>{money2(b.schoolShare)}</Text>
                          <Text style={{ color: C.sub, fontSize: 10 }}>your share</Text>
                        </View>
                      </Card>
                    );
                  })}
                </View>
              ))}
            </>
          )}

          {tab === 'team' && (
            <>
              {active.map((a) => {
                const c = getCfi(a.cfiId);
                const done = withMoney.filter((b) => b.cfiId === c.id && b.status === 'Completed');
                return (
                  <Card key={a.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Avatar initials={c.initials} color={c.color} size={46} photo={c.photo} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ fontWeight: '900', color: C.text, fontSize: 16 }}>{c.name}</Text>
                        <Text style={{ color: C.sub, fontSize: 12 }}>{c.certs.join(' · ')} · since {a.since}</Text>
                        <View style={{ flexDirection: 'row', marginTop: 4 }}><Tag label={pctLabel(a)} color={a.model === 'employee' ? '#7C3AED' : C.blue} bg={a.model === 'employee' ? '#F3E8FF' : C.sky} /></View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontWeight: '900', color: C.navy, fontSize: 18 }}>{money(c.flightRate)}</Text>
                        <Text style={{ color: C.sub, fontSize: 11 }}>per hour</Text>
                      </View>
                    </View>
                    <View style={sc.statRow}>
                      <Text style={sc.stat}><Text style={sc.statNum}>{done.length}</Text> lessons this week</Text>
                      <Text style={sc.stat}><Text style={sc.statNum}>{money(done.reduce((s, b) => s + b.schoolShare, 0))}</Text> school share</Text>
                    </View>
                    {a.model === 'employee' && (
                      <View style={{ marginTop: 6 }}>
                        <Stepper label="Rate you set" value={c.flightRate} onChange={(v) => setCfiRate(c.id, Math.max(x.terms.minRate, v))} step={5} min={x.terms.minRate} unit="$/hr" />
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', marginTop: 8 }}>
                      <Button title="Change terms" variant="ghost" small style={{ flex: 1, marginRight: 8 }} onPress={() => setEdit({ ...a })} />
                      <Button title="Remove" variant="outline" small style={{ flex: 0.7, borderColor: '#FCA5A5' }} onPress={() => endAffiliation(a.id)} />
                    </View>
                  </Card>
                );
              })}
              <Button title="Invite an instructor" icon="plus" style={{ marginTop: 4 }} onPress={() => setInvite(true)} />
              <Text style={sc.note}>Removing an instructor ends the link after {x.terms.noticeDays} days’ notice. Lessons already booked keep the terms they were booked under.</Text>
            </>
          )}

          {tab === 'requests' && (
            <>
              {pending.length === 0 && <Text style={{ color: C.sub, textAlign: 'center', marginTop: 20 }}>No pending requests.</Text>}
              {pending.map((a) => {
                const c = getCfi(a.cfiId);
                return (
                  <Card key={a.id} onPress={a.initiatedBy === 'cfi' ? () => nav.push('AffiliationReview', { id: a.id }) : undefined}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Avatar initials={c.initials} color={c.color} size={44} photo={c.photo} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ fontWeight: '900', color: C.text }}>{c.name}</Text>
                        <Text style={{ color: C.sub, fontSize: 12 }}>{a.initiatedBy === 'cfi' ? `Wants to join · ${a.sent}` : `You invited · ${a.sent}`}</Text>
                      </View>
                      <Tag label={a.initiatedBy === 'cfi' ? 'Review' : 'Waiting'} color={a.initiatedBy === 'cfi' ? C.blue : '#B45309'} bg={a.initiatedBy === 'cfi' ? C.sky : '#FEF3C7'} />
                    </View>
                    {a.message ? <Text style={{ color: C.text, marginTop: 8, fontStyle: 'italic' }}>“{a.message}”</Text> : null}
                    {a.initiatedBy === 'school' && (
                      <Pressable onPress={() => respondAffiliation(a.id, true)} style={sc.demo}><Text style={sc.demoText}>Demo: {c.name.split(' ')[0]} accepts the invite ›</Text></Pressable>
                    )}
                  </Card>
                );
              })}
            </>
          )}

          {tab === 'terms' && (
            <>
              <Text style={sc.lead}>Your standard terms for new instructors. You can set different terms per instructor.</Text>
              <Text style={sc.label}>How instructors work with you</Text>
              {[
                ['split', 'Revenue share (contractors)', 'Instructors set their own rates (at or above your minimum). The split is agreed, and changes need the instructor to accept.'],
                ['employee', 'Employees', 'You set each instructor’s rate and their split. Changes apply to new bookings without needing the instructor to accept.'],
              ].map(([k, t, d]) => (
                <Pressable key={k} onPress={() => updateSchoolTerms(sid, { model: k })} style={[sc.option, x.terms.model === k && sc.optionOn]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', color: C.text }}>{t}</Text>
                    <Text style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>{d}</Text>
                  </View>
                  <View style={[sc.radio, x.terms.model === k && { borderColor: C.blue }]}>{x.terms.model === k && <View style={sc.radioDot} />}</View>
                </Pressable>
              ))}
              {true && (
                <Card><Stepper label="School share of instruction" value={Math.round(x.terms.schoolPct * 100)} onChange={(v) => updateSchoolTerms(sid, { schoolPct: Math.min(60, Math.max(5, v)) / 100 })} step={5} min={5} unit="%" /></Card>
              )}
              <Card>
                <Stepper label="Minimum instructor rate" value={x.terms.minRate} onChange={(v) => updateSchoolTerms(sid, { minRate: v })} step={5} min={40} unit="$/hr" />
                <Stepper label="Notice to leave" value={x.terms.noticeDays} onChange={(v) => updateSchoolTerms(sid, { noticeDays: v })} step={7} min={0} unit="days" />
              </Card>
              <SplitExample model={x.terms.model} schoolPct={x.terms.schoolPct} rate={Math.max(75, x.terms.minRate)} />
              <Text style={sc.note}>Payouts go straight to each party’s bank account through Stripe Connect: your share to the school, the rest to the instructor. That applies to both employees and contractors.</Text>
            </>
          )}
        </View>
      </ScrollView>

      <Sheet visible={invite} onClose={() => setInvite(false)} title="Invite an instructor">
        <Text style={[sc.note, { marginTop: 0 }]}>Independent instructors on RightSeat. They’ll get your invite with your standard terms ({x.terms.model === 'employee' ? 'employee' : 'revenue share'}, school {Math.round(x.terms.schoolPct * 100)}%).</Text>
        {independent.length === 0 && <Text style={{ color: C.sub }}>Everyone is already with a school.</Text>}
        {independent.map((c, i) => (
          <ListRow key={c.id} first={i === 0} title={c.name} subtitle={`${c.certs.join(' · ')} · ${c.homeAirport} · ${money(c.flightRate)}/hr`}
            right={<Button title="Invite" small style={{ paddingHorizontal: 14 }} onPress={() => { requestAffiliation({ cfiId: c.id, schoolId: sid, initiatedBy: 'school' }); setInvite(false); setTab('requests'); }} />} />
        ))}
      </Sheet>

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={`Terms · ${edit ? getCfi(edit.cfiId)?.name : ''}`}
        footer={<Button title={edit?.model === 'employee' ? 'Save terms' : 'Send to instructor'} style={{ flex: 1 }} onPress={() => { updateAffiliation(edit.id, { model: edit.model, schoolPct: edit.schoolPct }); setEdit(null); }} />}>
        {edit && (
          <>
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <Chip small label="Revenue share" active={edit.model === 'split'} onPress={() => setEdit({ ...edit, model: 'split' })} />
              <Chip small label="Employee" active={edit.model === 'employee'} onPress={() => setEdit({ ...edit, model: 'employee' })} />
            </View>
            {<Stepper label="School share" value={Math.round(edit.schoolPct * 100)} onChange={(v) => setEdit({ ...edit, schoolPct: Math.min(60, Math.max(5, v)) / 100 })} step={5} min={5} unit="%" />}
            <SplitExample cfi={getCfi(edit.cfiId)} model={edit.model} schoolPct={edit.schoolPct} />
            <Text style={sc.note}>{edit.model === 'employee' ? 'As an employee, the new split applies to lessons booked from now on. The instructor is notified.' : 'New terms apply to lessons booked after the instructor accepts.'} Existing bookings keep their current split.</Text>
          </>
        )}
      </Sheet>
    </View>
  );
}

export function AffiliationReview({ nav, params }) {
  const { affiliations, getCfi, getSchool, respondAffiliation } = useStore();
  const a = affiliations.find((x) => x.id === params.id);
  const school = a && getSchool(a.schoolId);
  const [model, setModel] = useState(a?.model || 'split');
  const [pct, setPct] = useState(Math.round((a?.schoolPct || school?.terms.schoolPct || 0.25) * 100));
  if (!a) return null;
  const c = getCfi(a.cfiId);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Join request" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Avatar initials={c.initials} color={c.color} size={56} photo={c.photo} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontWeight: '900', fontSize: 18, color: C.text }}>{c.name}</Text>
              {c.verified && <View style={{ marginLeft: 4 }}><Icon name="checkCircle" size={16} color={C.blue} /></View>}
            </View>
            <Text style={{ color: C.sub }}>{c.certs.join(' · ')} · {c.homeAirport} · {money(c.flightRate)}/hr</Text>
            <Stars rating={c.rating} count={c.reviewCount} />
          </View>
        </Card>
        <Card style={{ flexDirection: 'row', paddingVertical: 10 }}>
          <View style={{ flex: 1, alignItems: 'center' }}><Text style={sc.kpi}>{c.totalHours.toLocaleString()}</Text><Text style={sc.kpiL}>hours</Text></View>
          <View style={{ flex: 1, alignItems: 'center' }}><Text style={sc.kpi}>{c.passRate}%</Text><Text style={sc.kpiL}>1st-time pass</Text></View>
          <View style={{ flex: 1, alignItems: 'center' }}><Text style={sc.kpi}>{c.studentsSoloed}</Text><Text style={sc.kpiL}>soloed</Text></View>
        </Card>
        {a.message ? <Card><Text style={{ color: C.text, fontStyle: 'italic', lineHeight: 20 }}>“{a.message}”</Text></Card> : null}
        <Text style={{ color: C.green, fontWeight: '700', marginBottom: 8 }}>✓ FAA certificate, insurance and ID verified by RightSeat</Text>

        <SectionTitle>Offer terms</SectionTitle>
        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <Chip small label="Revenue share" active={model === 'split'} onPress={() => setModel('split')} />
          <Chip small label="Employee" active={model === 'employee'} onPress={() => setModel('employee')} />
        </View>
        {<Card><Stepper label="School share of instruction" value={pct} onChange={(v) => setPct(Math.min(60, Math.max(5, v)))} step={5} min={5} unit="%" /></Card>}
        {model === 'split' && c.flightRate < school.terms.minRate && <Text style={sc.warn}>{c.name.split(' ')[0]}’s rate is below your {money(school.terms.minRate)} minimum. They’ll be asked to raise it.</Text>}
        <SplitExample cfi={c} model={model} schoolPct={pct / 100} />
      </ScrollView>
      <View style={sc.cta}>
        <Button title="Decline" variant="outline" style={{ flex: 0.6, marginRight: 8 }} onPress={() => { respondAffiliation(a.id, false); nav.pop(); }} />
        <Button title="Accept & link" style={{ flex: 1 }} onPress={() => { respondAffiliation(a.id, true, { model, schoolPct: pct / 100 }); nav.pop(); }} />
      </View>
    </View>
  );
}

// Instructor side: request to join a school, see status, or leave.
export function JoinSchool({ nav, params }) {
  const { schools, myCfiId, getCfi, affiliations, requestAffiliation, endAffiliation, respondAffiliation, getSchool } = useStore();
  const cfiId = params?.cfiId || myCfiId || 'c1';
  const c = getCfi(cfiId);
  const mine = affiliations.filter((a) => a.cfiId === cfiId);
  const active = mine.find((a) => a.status === 'active');
  const pending = mine.filter((a) => a.status === 'pending');
  const [sel, setSel] = useState(null);
  const [msg, setMsg] = useState('');
  const [model, setModel] = useState(null);
  const s = sel && getSchool(sel);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Flight school" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {!myCfiId && <Text style={sc.demoLabel}>Demo: viewing as {c.name}</Text>}
        {active ? (
          <Card style={{ borderLeftWidth: 4, borderLeftColor: C.green }}>
            <Text style={{ color: C.sub, fontSize: 12, fontWeight: '700' }}>YOU TEACH FOR</Text>
            <Text style={{ fontWeight: '900', fontSize: 18, color: C.text, marginTop: 2 }}>{getSchool(active.schoolId)?.name}</Text>
            <View style={{ flexDirection: 'row', marginTop: 6 }}><Tag label={pctLabel(active)} /></View>
            <SplitExample cfi={c} model={active.model} schoolPct={active.schoolPct} />
            <Text style={sc.note}>Students book you as usual. The school sees your schedule, and the split happens automatically on every payout.</Text>
            <Button title="Leave this school" variant="outline" small style={{ borderColor: '#FCA5A5', marginTop: 4 }} onPress={() => endAffiliation(active.id)} />
            <Text style={sc.note}>Leaving takes effect after {getSchool(active.schoolId)?.terms.noticeDays} days’ notice. Lessons already booked keep their current split.</Text>
          </Card>
        ) : (
          <Card style={{ backgroundColor: C.sky }}>
            <Text style={{ fontWeight: '900', color: C.navy }}>Independent instructor</Text>
            <Text style={{ color: C.navy, marginTop: 4, lineHeight: 19 }}>You keep your full rate. Joining a school can bring you students, aircraft and a steady schedule in exchange for a share.</Text>
          </Card>
        )}

        {pending.length > 0 && <SectionTitle>Pending</SectionTitle>}
        {pending.map((a) => (
          <Card key={a.id}>
            <Text style={{ fontWeight: '800', color: C.text }}>{getSchool(a.schoolId)?.name}</Text>
            <Text style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>{a.initiatedBy === 'cfi' ? `Request sent ${a.sent} · waiting for the school` : `Invited you · ${pctLabel(a)}`}</Text>
            {a.initiatedBy === 'school' && (
              <View style={{ flexDirection: 'row', marginTop: 8 }}>
                <Button title="Decline" variant="outline" small style={{ flex: 0.6, marginRight: 8 }} onPress={() => respondAffiliation(a.id, false)} />
                <Button title="Accept" small style={{ flex: 1 }} onPress={() => respondAffiliation(a.id, true)} />
              </View>
            )}
          </Card>
        ))}

        {!active && (
          <>
            <SectionTitle>Request to join a school</SectionTitle>
            {schools.filter((x) => !pending.some((a) => a.schoolId === x.id)).map((x) => (
              <Pressable key={x.id} onPress={() => { setSel(x.id); setModel(x.terms.model); }} style={[sc.option, sel === x.id && sc.optionOn]}>
                <View style={[sc.logo, { backgroundColor: x.color }]}><Text style={{ color: '#fff', fontWeight: '900' }}>{x.initials}</Text></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontWeight: '800', color: C.text }}>{x.name}</Text>
                  <Text style={{ color: C.sub, fontSize: 12 }}>{x.homeAirport} · {x.terms.model === 'employee' ? 'Employees (school sets rate)' : 'Revenue share'} · school {Math.round(x.terms.schoolPct * 100)}% · min {money(x.terms.minRate)}/hr</Text>
                </View>
                <View style={[sc.radio, sel === x.id && { borderColor: C.blue }]}>{sel === x.id && <View style={sc.radioDot} />}</View>
              </Pressable>
            ))}
            {s && (
              <>
                <SplitExample cfi={c} model={model} schoolPct={s.terms.schoolPct} />
                <Text style={sc.label}>Message to the school</Text>
                <TextInput multiline value={msg} onChangeText={setMsg} placeholder="Experience, availability, what you’d like to teach…" placeholderTextColor="#9AA3B2" style={sc.area} />
              </>
            )}
          </>
        )}
      </ScrollView>
      {!active && s && (
        <View style={sc.cta}>
          <Button title={`Send request to ${s.name.split(' ')[0]}`} style={{ flex: 1 }} onPress={() => { requestAffiliation({ cfiId, schoolId: s.id, initiatedBy: 'cfi', model, message: msg.trim() }); setSel(null); setMsg(''); }} />
        </View>
      )}
    </View>
  );
}

const sc = StyleSheet.create({
  hero: { backgroundColor: C.navy, padding: 16 },
  big: { color: '#fff', fontSize: 22, fontWeight: '900' },
  small: { color: '#9FB3D1', fontSize: 12 },
  note: { color: C.sub, fontSize: 12, lineHeight: 17, marginTop: 8, marginBottom: 8 },
  lead: { color: C.text, fontSize: 15, lineHeight: 21, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '800', color: C.text, marginTop: 12, marginBottom: 8 },
  day: { fontSize: 13, fontWeight: '800', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
  statRow: { flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F4F8' },
  stat: { flex: 1, color: C.sub, fontSize: 12 },
  statNum: { color: C.text, fontWeight: '800', fontSize: 14 },
  example: { backgroundColor: C.sky, borderRadius: 14, padding: 12, marginTop: 8, marginBottom: 4 },
  exRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  exLabel: { color: C.navy },
  exVal: { color: C.navy, fontWeight: '900' },
  option: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 2, borderColor: '#fff' },
  optionOn: { borderColor: C.blue, backgroundColor: '#F5F9FF' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.blue },
  logo: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  area: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, minHeight: 80, fontSize: 15, color: C.text, textAlignVertical: 'top' },
  kpi: { fontSize: 18, fontWeight: '900', color: C.navy },
  kpiL: { fontSize: 11, color: C.sub },
  warn: { color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 8, fontSize: 13 },
  demo: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#F8FAFC', borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: '#CBD5E1' },
  demoText: { color: C.sub, fontWeight: '700', fontSize: 12 },
  demoLabel: { color: C.sub, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: '#fff', padding: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.line },
});
