import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useStore, money } from '../store';
import { PLANS, CFI_STUDENTS, SEED_PAIRS } from '../data';
import { money2, slotStatus, SLOTS, FEES, r2, pairMetrics, dateLabel } from '../logic';
import { C, Card, Avatar, SectionTitle, Button, Row, Tag, Stat, Field, Toggle, Stars } from '../ui';
import { PlaneImage } from '../art';
import { Header } from './Details';
import { allHours, hasPrior } from '../progress';

// 7-day availability grid for a CFI or an aircraft.
export function WeekCalendar({ cfi, plane }) {
  const { requests } = useStore();
  const d0 = new Date();
  const days = Array.from({ length: 7 }, (_, i) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i));
  const colors = { free: '#E3F7EF', cfi: '#DBEAFE', plane: '#DBEAFE', off: '#F1F3F7' };
  return (
    <Card>
      <View style={{ flexDirection: 'row', marginLeft: 44 }}>
        {days.map((d, i) => <Text key={i} style={k.dayHead}>{d.toLocaleDateString('en-US', { weekday: 'narrow' })}{'\n'}{d.getDate()}</Text>)}
      </View>
      {SLOTS.map((s) => (
        <View key={s.h} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <Text style={k.hour}>{s.label.replace(':00', '')}</Text>
          {days.map((d, i) => {
            const st = slotStatus({ cfi, plane, day: d, hour: s.h, requests });
            const mine = requests.some((r) => ['Pending', 'Confirmed'].includes(r.status) && r.when && new Date(r.when).toDateString() === d.toDateString() && new Date(r.when).getHours() === s.h && ((cfi && r.cfiId === cfi.id) || (plane && r.planeId === plane.id)));
            return <View key={i} style={[k.cell, { backgroundColor: mine ? C.blue : colors[st] }]} />;
          })}
        </View>
      ))}
      <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap' }}>
        {[['Open', '#E3F7EF'], ['Booked', '#DBEAFE'], ['Your booking', C.blue], ['Off', '#F1F3F7']].map(([l, c]) => (
          <View key={l} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
            <View style={[k.legend, { backgroundColor: c }]} /><Text style={{ color: C.sub, fontSize: 11 }}>{l}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function CfiDashboard({ nav }) {
  const { myCfiId, getCfi, payouts, payout, setCfiPro, requests, training, pilot, affiliationFor, getSchool, affiliations } = useStore();
  const id = myCfiId || 'c1';
  const c = getCfi(id);
  const [msg, setMsg] = useState(null);
  const avail = r2((c.monthEarnings || 0) - (payouts[id] || 0));
  const lateFees = requests.filter((r) => r.cfiId === id && r.cancel?.fee).reduce((a, r) => a + r.cancel.fee, 0);
  const students = CFI_STUDENTS[id] || [];
  const repeatRate = 87;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Instructor dashboard" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {!myCfiId && <Text style={k.demo}>Demo: viewing as Marcus Reyes</Text>}
        <View style={k.hero}>
          <Text style={{ color: '#AFC3E0', fontWeight: '700' }}>Earned this month{affiliationFor(id) ? ' (your share)' : ''}</Text>
          <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900' }}>{money2(c.monthEarnings || 0)}</Text>
          <Text style={{ color: '#AFC3E0', marginTop: 2 }}>Available to pay out: {money2(avail)}</Text>
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <Button title="Standard · free" variant="outline" disabled={avail <= 0} style={{ flex: 1, marginRight: 8, paddingVertical: 10 }}
              onPress={() => { const r = payout(id, false); setMsg(`${money2(r.amount)} on its way · arrives in 2 business days`); }} />
            <Button title={c.pro ? 'Instant · free (Pro)' : 'Instant · 1.5%'} disabled={avail <= 0} style={{ flex: 1, paddingVertical: 10 }}
              onPress={() => { const r = payout(id, true); setMsg(`${money2(r.amount)} sent to your debit card now${r.fee ? ` (fee ${money2(r.fee)})` : ''}`); }} />
          </View>
          {msg && <Text style={{ color: '#86EFAC', fontWeight: '700', marginTop: 10 }}>✓ {msg}</Text>}
        </View>

        {training.debriefs.filter((d) => d.pending && d.cfiId === id).map((d) => (
          <Card key={d.id} style={{ marginTop: 12, borderLeftWidth: 4, borderLeftColor: '#F59E0B' }} onPress={() => nav.push('EditDebrief', { id: d.id })}>
            <Text style={{ fontWeight: '900', color: C.text }}>Debrief due · {pilot.name}</Text>
            <Text style={{ color: C.sub, marginTop: 2, fontSize: 13 }}>{d.goal} · {d.date} · {d.flightHours} hr</Text>
            <Text style={{ color: C.blue, fontWeight: '800', marginTop: 6 }}>Write debrief ›</Text>
          </Card>
        ))}
        {hasPrior(training) && training.prior.status === 'self' && training.prior.sharedWith.includes(id) && (
          <Card style={{ marginTop: 12, borderLeftWidth: 4, borderLeftColor: '#60A5FA' }} onPress={() => nav.push('PriorReview', { cfiId: id })}>
            <Text style={{ fontWeight: '900', color: C.text }}>{pilot.name} shared previous experience</Text>
            <Text style={{ color: C.sub, marginTop: 2, fontSize: 13 }}>
              {training.prior.hours.total} hrs · {Object.keys(training.prior.lessons).length} lessons · {training.prior.endorsements.length} endorsements · last flew {training.prior.lastFlight.toLowerCase()}
            </Text>
            <Text style={{ color: C.blue, fontWeight: '800', marginTop: 6 }}>Review & confirm ›</Text>
          </Card>
        )}
        <Card style={{ flexDirection: 'row', paddingVertical: 4, marginTop: 12 }}>
          <Stat value={(c.platformHours || 0).toLocaleString()} label="Hrs on RightSeat" />
          <Stat value={`${repeatRate}%`} label="Students rebook" />
          <Stat value={money2(lateFees).replace('.00', '')} label="Late-cancel fees" />
        </Card>

        {(() => {
          const aff = affiliationFor(id);
          const invites = affiliations.filter((a) => a.cfiId === id && a.status === 'pending' && a.initiatedBy === 'school').length;
          return (
            <Card style={{ marginTop: 12 }} onPress={() => nav.push('JoinSchool', { cfiId: id })}>
              <Text style={{ color: C.sub, fontSize: 12, fontWeight: '700' }}>FLIGHT SCHOOL</Text>
              <Text style={{ fontWeight: '900', color: C.text, fontSize: 16, marginTop: 2 }}>{aff ? getSchool(aff.schoolId)?.name : 'Independent'}</Text>
              <Text style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>
                {aff ? `${aff.model === 'employee' ? 'Employee: school sets your rate' : 'Revenue share'} · school keeps ${Math.round(aff.schoolPct * 100)}% of instruction` : invites ? `${invites} school invite${invites > 1 ? 's' : ''} waiting` : 'Join a school for students, aircraft and a steady schedule'}
              </Text>
              <Text style={{ color: C.blue, fontWeight: '800', marginTop: 6 }}>{aff ? 'View arrangement ›' : 'Find a school ›'}</Text>
            </Card>
          );
        })()}

        <SectionTitle>Guaranteed pay</SectionTitle>
        <Card>
          <Text style={k.line}>✓ Students’ cards or wallets are held at booking. You never chase payment.</Text>
          <Text style={k.line}>✓ Late cancellations (&lt;24 hrs): you get 50% of the lesson. No-shows: 100%.</Text>
          <Text style={k.line}>✓ Tax forms (1099) filed for you every January.</Text>
          <Text style={k.line}>✓ Your search ranking grows with hours flown and verified reviews on RightSeat.</Text>
        </Card>

        <SectionTitle right={<Pressable onPress={() => nav.push('Plans')}><Text style={{ color: C.blue, fontWeight: '700' }}>Plans ›</Text></Pressable>}>Your plan</SectionTitle>
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '900', color: C.text, fontSize: 16 }}>{c.pro ? 'CFI Pro · $29/mo' : 'CFI Free'}</Text>
            <Text style={{ color: C.sub, marginTop: 2, fontSize: 13 }}>{c.pro ? '0% host fees · free instant payouts · Pro badge' : '5% host fee on new students only · $0 on repeat students'}</Text>
          </View>
          <Button title={c.pro ? 'Downgrade' : 'Go Pro'} variant={c.pro ? 'outline' : 'primary'} style={{ paddingHorizontal: 16, paddingVertical: 10 }} onPress={() => setCfiPro(id, !c.pro)} />
        </Card>

        <SectionTitle>My students</SectionTitle>
        {students.length === 0 && <Text style={{ color: C.sub }}>Students appear here after their first booking.</Text>}
        {students.map((s) => (
          <Card key={s.name} onPress={s.name.includes('(you)') ? () => nav.push('StudentFile', { viewerId: id }) : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: C.text }}>{s.name}</Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>Last flew {s.last}</Text>
            </View>
            <Text style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>{s.program} · {Math.round(s.progress * 100)}% complete</Text>
            <View style={k.bar}><View style={[k.barFill, { width: `${s.progress * 100}%` }]} /></View>
          </Card>
        ))}

        <SectionTitle>This week</SectionTitle>
        <WeekCalendar cfi={c} />
      </ScrollView>
    </View>
  );
}

export function OwnerDashboard({ nav }) {
  const { myPlaneIds, getPlane, addSquawk, resolveSquawk, complete100hr } = useStore();
  const ids = myPlaneIds.length ? myPlaneIds : ['p2'];
  const [sel, setSel] = useState(ids[0]);
  const [sq, setSq] = useState('');
  const [grounding, setGrounding] = useState(false);
  const p = getPlane(sel);
  const left = r2(p.next100At - p.hobbsTotal);
  const open = p.squawks.filter((q) => q.status === 'open');
  const grounded = left <= 0 || open.some((q) => q.grounding);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Aircraft owner" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {!myPlaneIds.length && <Text style={k.demo}>Demo: viewing as Bay Area Flyers Club (N7340P)</Text>}
        {ids.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {ids.map((i) => <Pressable key={i} onPress={() => setSel(i)}><Tag label={getPlane(i).tail} bg={i === sel ? C.blue : C.sky} color={i === sel ? '#fff' : C.blue} /></Pressable>)}
          </ScrollView>
        )}
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <PlaneImage plane={p} size={64} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontWeight: '900', color: C.text, fontSize: 16 }}>{p.tail} · {p.make} {p.model}</Text>
            <Text style={{ color: C.sub, marginTop: 2 }}>Hobbs {p.hobbsTotal} · {money(p.wetRate)}/hr wet</Text>
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <Tag label={grounded ? 'Grounded — bookings paused' : 'Airworthy — accepting bookings'} color={grounded ? '#DC2626' : C.green} bg={grounded ? '#FEE2E2' : '#E3F7EF'} />
            </View>
          </View>
        </Card>
        <Card style={{ flexDirection: 'row', paddingVertical: 4 }}>
          <Stat value={money2(p.monthEarnings || 0).replace(/\.\d\d$/, '')} label="Earned this month" />
          <Stat value={p.rating.toFixed(1) + '★'} label={`${p.reviewCount} reviews`} />
          <Stat value={open.length} label="Open squawks" />
        </Card>

        <SectionTitle>100-hour inspection</SectionTitle>
        <Card>
          <Row label="Due at Hobbs" value={p.next100At} />
          <Row label="Hours remaining" value={left > 0 ? `${left} hrs` : 'OVERDUE'} />
          <View style={k.bar}><View style={[k.barFill, { width: `${Math.max(0, Math.min(1, 1 - left / 100)) * 100}%`, backgroundColor: left < 10 ? '#DC2626' : C.blue }]} /></View>
          <Text style={{ color: C.sub, fontSize: 12, marginTop: 6 }}>RightSeat blocks any booking that would run past the 100-hr. Hobbs updates automatically when each flight is closed out.</Text>
          {left < 10 && <Button title="Mark 100-hr complete (signed off)" variant="outline" style={{ marginTop: 10, paddingVertical: 10 }} onPress={() => complete100hr(p.id)} />}
        </Card>

        <SectionTitle>Squawks</SectionTitle>
        {p.squawks.length === 0 && <Text style={{ color: C.sub, marginBottom: 8 }}>No squawks reported.</Text>}
        {p.squawks.map((q) => (
          <Card key={q.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: q.status === 'open' ? C.text : C.sub, textDecorationLine: q.status === 'open' ? 'none' : 'line-through' }}>{q.text}</Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>{q.date}{q.grounding ? ' · grounding' : ''}</Text>
            </View>
            {q.status === 'open' ? (
              <Pressable onPress={() => resolveSquawk(p.id, q.id)}><Text style={{ color: C.blue, fontWeight: '800' }}>Resolve</Text></Pressable>
            ) : <Tag label="Resolved" color={C.green} bg="#E3F7EF" />}
          </Card>
        ))}
        <Field value={sq} onChangeText={setSq} placeholder="Add a squawk…" />
        {sq ? (
          <>
            <Toggle label="Grounding" value={grounding} onValueChange={setGrounding} />
            <Button title="Add squawk" variant="outline" style={{ paddingVertical: 10 }} onPress={() => { addSquawk(p.id, sq, grounding); setSq(''); setGrounding(false); }} />
          </>
        ) : null}

        <SectionTitle>Renter checks</SectionTitle>
        <Card>
          <Text style={k.line}>✓ Every renter’s ID, certificate, medical, solo endorsement, checkout and insurance minimum ({p.insuranceMinHours} hrs) are checked before booking.</Text>
          <Text style={k.line}>✓ Paid by Hobbs automatically. No cash, no chasing.</Text>
          <Text style={[k.line, { color: '#B45309' }]}>Rentals arranged off the app skip these checks.</Text>
        </Card>

        <SectionTitle>Schedule</SectionTitle>
        <WeekCalendar plane={p} />
      </ScrollView>
    </View>
  );
}

export function Plans({ nav }) {
  const { myCfiId, getCfi, setCfiPro, plans, setSchoolPlan } = useStore();
  const id = myCfiId || 'c1';
  const c = getCfi(id);
  const card = (p, active, onPress) => (
    <Card key={p.id} style={active ? { borderWidth: 2, borderColor: C.blue } : null}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: '900', fontSize: 18, color: C.text }}>{p.name}</Text>
        <Text style={{ fontWeight: '900', fontSize: 18, color: C.navy }}>{p.price ? `$${p.price}/mo` : 'Free'}</Text>
      </View>
      {p.perks.map((x) => <Text key={x} style={k.line}>✓ {x}</Text>)}
      <Button title={active ? 'Current plan' : 'Choose'} variant={active ? 'outline' : 'primary'} disabled={active} style={{ marginTop: 10, paddingVertical: 11 }} onPress={onPress} />
    </Card>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Plans & fees" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Card style={{ backgroundColor: C.sky }}>
          <Text style={{ fontWeight: '900', color: C.navy }}>How RightSeat fees work</Text>
          <Text style={k.line}>Students: 6% booking fee on the first lesson with a new CFI. $0 on every repeat lesson.</Text>
          <Text style={k.line}>Owners: 8% of rental revenue.</Text>
          <Text style={k.line}>Wallet: prepaid balances get block rates and bonus credit.</Text>
        </Card>
        <SectionTitle>For instructors {!myCfiId ? '(demo: Marcus)' : ''}</SectionTitle>
        {PLANS.cfi.map((p) => card(p, (p.id === 'pro') === !!c.pro, () => setCfiPro(id, p.id === 'pro')))}
        <SectionTitle>For flight schools</SectionTitle>
        {PLANS.school.map((p) => card(p, plans.school === p.id, () => setSchoolPlan(p.id)))}
      </ScrollView>
    </View>
  );
}

export function Credentials({ nav }) {
  const { pilot, training, getPlane } = useStore();
  const solo = pilot.soloEndorsements[0];
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Pilot credentials" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={{ color: C.sub, marginBottom: 10, lineHeight: 19 }}>Verified once, checked automatically before every booking so owners and CFIs know who’s flying.</Text>
        <Card>
          <Row label="Government ID" value={pilot.idVerified ? '✓ Verified' : 'Not verified'} />
          <Row label="Pilot certificate" value={`${pilot.certificate} pilot ✓`} />
          <Row label="Medical" value={`${pilot.medical} · exp ${pilot.medicalExpires} ✓`} />
          <Row label="Total time (training record)" value={`${allHours(training).total} hrs${hasPrior(training) ? (training.prior.status === 'confirmed' ? ' · prior confirmed' : ' · incl. self-reported') : ''}`} />
          <Row label="Landings, last 90 days" value={pilot.landings90} />
          <Row label="Aircraft checkouts" value={pilot.checkouts.map((id) => getPlane(id)?.tail).join(', ')} />
          {solo && <Row label="Solo endorsement" value={`${getPlane(solo.planeId)?.tail} · exp ${dateLabel(solo.expires)}`} />}
        </Card>
        <Button title="Upload new document" variant="outline" onPress={() => {}} />
      </ScrollView>
    </View>
  );
}

export function Insights({ nav }) {
  const { requests, getCfi, threads } = useStore();
  const m = pairMetrics(SEED_PAIRS, requests, getCfi);
  const flagged = threads.reduce((a, t) => a + t.messages.filter((x) => x.flagged).length, 0) + SEED_PAIRS.reduce((a, p) => a + p.flags, 0);
  const done = requests.filter((r) => r.receipt);
  const gmv = 48210 + done.reduce((a, r) => a + r.receipt.total, 0);
  const rev = 3874 + done.reduce((a, r) => a + r.receipt.split.platform, 0);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Founder metrics" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={k.demo}>Founder view · sample data + this session</Text>
        <View style={k.hero}>
          <Text style={{ color: '#AFC3E0', fontWeight: '700' }}>Student–CFI rebooking rate</Text>
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '900' }}>{m.rate}%</Text>
          <Text style={{ color: '#AFC3E0' }}>of pairs booked a 2nd lesson in the app · goal 80%+</Text>
        </View>
        <Card style={{ flexDirection: 'row', paddingVertical: 4, marginTop: 12 }}>
          <Stat value={money(gmv)} label="Booked (30d)" />
          <Stat value={money(rev)} label="RightSeat revenue" />
          <Stat value={`${((rev / gmv) * 100).toFixed(1)}%`} label="Take rate" />
        </Card>
        <Card style={{ flexDirection: 'row', paddingVertical: 4 }}>
          <Stat value={m.pairs.length} label="Active pairs" />
          <Stat value={m.watch.length} label="Leakage watch" />
          <Stat value={flagged} label="Off-app msgs flagged" />
        </Card>

        <SectionTitle>Leakage watchlist</SectionTitle>
        <Text style={{ color: C.sub, fontSize: 12, marginBottom: 8 }}>Pairs that flew once or twice and went quiet, or that shared contact or payment info in chat. Follow up with a free-lesson-fee credit or a check-in.</Text>
        {m.watch.map((p, i) => (
          <Card key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {p.cfi && <Avatar initials={p.cfi.initials} color={p.cfi.color} size={36} />}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontWeight: '800', color: C.text }}>{p.student} ↔ {p.cfi?.name}</Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>{p.lessons} lesson{p.lessons === 1 ? '' : 's'} · last {p.lastDays} days ago{p.flags ? ` · ${p.flags} flagged msg` : ''}</Text>
            </View>
            <Tag label={p.flags ? 'Flagged' : 'Quiet'} color="#B45309" bg="#FEF3C7" />
          </Card>
        ))}

        <SectionTitle>All pairs</SectionTitle>
        <Card>
          {m.pairs.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', paddingVertical: 6 }}>
              <Text style={{ flex: 1, color: C.text }}>{p.student} ↔ {p.cfi?.name.split(' ')[0]}</Text>
              <Text style={{ color: p.lessons >= 2 ? C.green : '#B45309', fontWeight: '700' }}>{p.lessons} lessons</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

const k = StyleSheet.create({
  demo: { color: C.sub, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  hero: { backgroundColor: C.navy, borderRadius: 18, padding: 18 },
  line: { color: C.text, fontSize: 13, lineHeight: 19, marginTop: 6 },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#E3E7EE', overflow: 'hidden', marginTop: 8 },
  barFill: { height: 8, borderRadius: 4, backgroundColor: C.blue },
  dayHead: { flex: 1, textAlign: 'center', color: C.sub, fontSize: 11, fontWeight: '700' },
  hour: { width: 44, color: C.sub, fontSize: 10, fontWeight: '700' },
  cell: { flex: 1, height: 20, borderRadius: 4, marginHorizontal: 2 },
  legend: { width: 10, height: 10, borderRadius: 2, marginRight: 4 },
});
