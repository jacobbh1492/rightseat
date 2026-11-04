import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useStore } from '../store';
import { C, Card, Button, Chip, Field, Row, SectionTitle, Tag } from '../ui';
import { Header } from './Details';
import { RenterInsuranceSection } from './RenterInsurance';
import { useAuth } from '../backend/auth';
import { fetchPilotProfile, savePilotProfile, fetchPlaneCheckouts, decideCheckout } from '../backend/pilot';
import { CERTIFICATES, MEDICALS, profileGaps, flightReviewValidThrough, renterChecks, isYmd, ymdIn, passengerCurrentThrough } from '../renterChecks';

// Dates are typed as MM/DD/YYYY and stored as YYYY-MM-DD.
export const toYmd = (s) => {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const ymd = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(ymd + 'T00:00:00Z');
  return isYmd(ymd) && d.getUTCMonth() + 1 === Number(m[1]) ? ymd : null;
};
export const fromYmd = (ymd) => (isYmd(ymd) ? `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}/${ymd.slice(0, 4)}` : '');
const pretty = (ymd) => (isYmd(ymd) ? new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
const addDaysYmd = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// The renter's pilot profile: checked against every plane they rent without an instructor.
export function PilotProfile({ nav }) {
  const auth = useAuth();
  const uid = auth?.session?.user?.id;
  const [form, setForm] = useState({ certificate: '', medicalClass: '', medicalExpires: '', flightReviewDate: '', totalHours: '', lastFlightDate: '', dayLandingsDate: '', nightLandingsDate: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    fetchPilotProfile(uid).then((p) => {
      if (p) setForm({ certificate: p.certificate, medicalClass: p.medicalClass, medicalExpires: fromYmd(p.medicalExpires), flightReviewDate: fromYmd(p.flightReviewDate), totalHours: String(p.totalHours),
        lastFlightDate: fromYmd(p.lastFlightDate), dayLandingsDate: fromYmd(p.dayLandingsDate), nightLandingsDate: fromYmd(p.nightLandingsDate) });
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [uid]);
  const set = (k) => (v) => { setSaved(false); setForm((f) => ({ ...f, [k]: v })); };

  if (!uid) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Pilot profile" />
        <View style={{ padding: 16 }}>
          <Text style={st.sub}>Sign in to add your pilot profile.</Text>
          <Button title="Sign in" style={{ marginTop: 12 }} onPress={() => nav.push('SignIn')} />
        </View>
      </View>
    );
  }

  const student = form.certificate === 'Student';
  const badDate = (s) => s.trim() !== '' && !toYmd(s);
  const value = {
    certificate: form.certificate, medicalClass: form.medicalClass, medicalExpires: toYmd(form.medicalExpires),
    flightReviewDate: toYmd(form.flightReviewDate), totalHours: form.totalHours === '' ? null : Number(form.totalHours),
    lastFlightDate: toYmd(form.lastFlightDate), dayLandingsDate: toYmd(form.dayLandingsDate), nightLandingsDate: toYmd(form.nightLandingsDate),
  };
  const todayYmd = ymdIn(new Date());
  const future = (k) => !!value[k] && value[k] > todayYmd;
  const badRecent = ['lastFlightDate', 'dayLandingsDate', 'nightLandingsDate'].some((k) => badDate(form[k]) || future(k));
  const through = (k) => passengerCurrentThrough(value[k]);
  const gaps = [...profileGaps(value), ...(badRecent ? ['recent flying dates'] : [])];
  const reviewThrough = flightReviewValidThrough(value.flightReviewDate);
  const save = async () => {
    setErr(''); setBusy(true);
    try { await savePilotProfile(uid, value); setSaved(true); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Pilot profile" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        <Text style={st.sub}>Owners see this when you ask to rent their plane. We check it against every solo rental: medical, flight review and the plane’s insurance minimum.</Text>
        {loading ? <Text style={[st.sub, { marginTop: 16 }]}>Loading…</Text> : (
          <>
            <SectionTitle>Certificate</SectionTitle>
            <View style={st.wrap}>{CERTIFICATES.map((c) => <Chip key={c} small label={c} active={form.certificate === c} onPress={() => set('certificate')(c)} />)}</View>

            <SectionTitle>Medical</SectionTitle>
            <View style={st.wrap}>{MEDICALS.map((m) => <Chip key={m} small label={m} active={form.medicalClass === m} onPress={() => set('medicalClass')(m)} />)}</View>
            <Field label="Valid for your flying through (MM/DD/YYYY)" value={form.medicalExpires} onChangeText={set('medicalExpires')} placeholder="05/31/2028" keyboardType="numbers-and-punctuation" />
            <Text style={st.hint}>{badDate(form.medicalExpires) ? 'Enter the date as MM/DD/YYYY.' : 'The last day your medical (or BasicMed) covers the certificate you’re flying on.'}</Text>

            {!student && (
              <>
                <SectionTitle>Flight review</SectionTitle>
                <Field label="Last flight review or new rating (MM/DD/YYYY)" value={form.flightReviewDate} onChangeText={set('flightReviewDate')} placeholder="06/10/2025" keyboardType="numbers-and-punctuation" />
                <Text style={st.hint}>{badDate(form.flightReviewDate) ? 'Enter the date as MM/DD/YYYY.' : reviewThrough ? `Current through ${pretty(reviewThrough)} (14 CFR 61.56: 24 calendar months).` : 'Good for 24 calendar months (14 CFR 61.56).'}</Text>
              </>
            )}
            {student && <Text style={[st.hint, { marginTop: 12 }]}>Student pilots: the owner records your solo endorsement for their plane when they check you out.</Text>}

            <SectionTitle>Experience</SectionTitle>
            <Field label="Total flight time (hours)" value={form.totalHours} onChangeText={(t) => set('totalHours')(t.replace(/[^0-9.]/g, ''))} placeholder="142.5" keyboardType="decimal-pad" />

            <SectionTitle>Recent flying</SectionTitle>
            <Text style={[st.sub, { marginBottom: 10 }]}>Some owners require a recent flight before a solo rental. Flights you close out on RightSeat update your last flight automatically.</Text>
            <Field label="Your last flight (MM/DD/YYYY)" value={form.lastFlightDate} onChangeText={set('lastFlightDate')} placeholder={fromYmd(todayYmd)} keyboardType="numbers-and-punctuation" />
            <Text style={st.hint}>{badDate(form.lastFlightDate) ? 'Enter the date as MM/DD/YYYY.' : future('lastFlightDate') ? 'That date is in the future.' : 'Optional unless a plane’s owner asks for it.'}</Text>
            {!student && (
              <>
                <Field label="Day: date of your 3rd most recent takeoff & landing" value={form.dayLandingsDate} onChangeText={set('dayLandingsDate')} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" />
                <Text style={st.hint}>{badDate(form.dayLandingsDate) ? 'Enter the date as MM/DD/YYYY.' : future('dayLandingsDate') ? 'That date is in the future.' : through('dayLandingsDate') ? `Current to carry passengers through ${pretty(through('dayLandingsDate'))} (61.57(a)).` : 'Count back three takeoffs and landings in your logbook. Needed to carry passengers.'}</Text>
                <Field label="Night: date of your 3rd most recent full-stop night landing" value={form.nightLandingsDate} onChangeText={set('nightLandingsDate')} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" />
                <Text style={st.hint}>{badDate(form.nightLandingsDate) ? 'Enter the date as MM/DD/YYYY.' : future('nightLandingsDate') ? 'That date is in the future.' : through('nightLandingsDate') ? `Night current for passengers through ${pretty(through('nightLandingsDate'))} (61.57(b)).` : 'Optional. Leave blank if you haven’t flown at night lately.'}</Text>
              </>
            )}

            <RenterInsuranceSection />
          </>
        )}
        {!!err && <Text style={st.err}>{err}</Text>}
        {saved && <Text style={[st.hint, { color: C.green, fontWeight: '700' }]}>Saved ✓</Text>}
      </ScrollView>
      <View style={st.cta}>
        <Button title={busy ? 'Saving…' : gaps.length ? `Add your ${gaps[0]}` : saved ? 'Done' : 'Save pilot profile'} disabled={busy || loading || gaps.length > 0}
          style={{ flex: 1 }} onPress={saved ? nav.pop : save} />
      </View>
    </View>
  );
}

// Plane owners: who's asked to be checked out, and who's approved.
export function Checkouts({ nav }) {
  const { myPlaneIds, planes, getPlane } = useStore();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [endorsed, setEndorsed] = useState({}); // checkout id -> MM/DD/YYYY endorsement date
  const ids = (myPlaneIds || []).filter(Boolean);
  const load = async () => {
    setLoading(true);
    try { setRows(await fetchPlaneCheckouts(ids)); } catch (e) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [ids.join()]);
  const decide = async (c, status) => {
    setErr('');
    let soloUntil = null;
    if (status === 'approved' && c.profile?.certificate === 'Student') {
      const d = toYmd(endorsed[c.id]);
      if (!d) { setErr('Enter the date on their solo endorsement (MM/DD/YYYY).'); return; }
      soloUntil = addDaysYmd(d, 90);
      if (soloUntil < ymdIn(new Date())) { setErr('That solo endorsement has expired (90 days, 14 CFR 61.87(n)).'); return; }
    }
    setBusy(c.id + status);
    try { await decideCheckout(c.id, status, soloUntil); await load(); } catch (e) { setErr(e.message); }
    setBusy(null);
  };
  const pending = rows.filter((r) => r.status === 'requested');
  const approved = rows.filter((r) => r.status === 'approved');

  const card = (c) => {
    const plane = getPlane(c.planeId) || planes.find((p) => p.id === c.planeId);
    const p = c.profile;
    const checks = p ? renterChecks({ profile: p, checkout: { status: 'approved', soloUntil: '9999-12-31' }, plane, start: new Date() })
      .filter((x) => ['medical', 'medicalType', 'review', 'insurance', 'recent', 'dayCurrency'].includes(x.key)) : [];
    return (
      <Card key={c.id}>
        <View style={st.rowTop}>
          <Text style={st.title}>{c.pilotName}</Text>
          <Tag label={c.status === 'approved' ? 'Checked out' : 'Request'} color={c.status === 'approved' ? C.green : '#B45309'} bg={c.status === 'approved' ? '#E3F7EF' : '#FEF3C7'} />
        </View>
        <Text style={st.sub}>{plane ? `${plane.tail} · ${plane.make} ${plane.model}` : 'Your plane'}{c.status === 'approved' && c.soloUntil ? ` · solo endorsement through ${pretty(c.soloUntil)}` : ''}</Text>
        {!!c.note && <Text style={[st.sub, { marginTop: 6, fontStyle: 'italic' }]}>“{c.note}”</Text>}
        {p ? (
          <View style={{ marginTop: 8 }}>
            <Row label="Certificate" value={p.certificate} />
            <Row label="Medical" value={`${p.medicalClass} · ${pretty(p.medicalExpires)}`} />
            {p.certificate !== 'Student' && <Row label="Flight review" value={pretty(p.flightReviewDate)} />}
            <Row label="Total time" value={`${p.totalHours} hrs`} />
            {!!p.lastFlightDate && <Row label="Last flight" value={pretty(p.lastFlightDate)} />}
            {checks.map((x) => <Text key={x.key} style={[st.sub, { color: x.ok ? C.green : x.blocking ? '#B91C1C' : '#B45309', fontWeight: '600' }]}>{x.ok ? '✓' : x.blocking ? '✗' : '!'} {x.label}</Text>)}
            <Text style={[st.hint, { marginTop: 6 }]}>Self-reported. Check their certificate, medical and logbook before approving.</Text>
          </View>
        ) : <Text style={[st.sub, { marginTop: 6, color: '#B45309' }]}>They haven’t filled in their pilot profile yet.</Text>}
        {c.status === 'requested' && p?.certificate === 'Student' && (
          <Field label="Date on their solo endorsement for this plane (MM/DD/YYYY)" value={endorsed[c.id] || ''} onChangeText={(t) => setEndorsed((e) => ({ ...e, [c.id]: t }))} placeholder={fromYmd(ymdIn(new Date()))} keyboardType="numbers-and-punctuation" />
        )}
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          {c.status === 'requested' ? (
            <>
              <Button title={busy === c.id + 'declined' ? 'Declining…' : 'Decline'} variant="outline" disabled={!!busy} style={{ flex: 0.6, marginRight: 8, paddingVertical: 10 }} onPress={() => decide(c, 'declined')} />
              <Button title={busy === c.id + 'approved' ? 'Approving…' : 'Checked out ✓'} disabled={!!busy || !p} style={{ flex: 1, paddingVertical: 10 }} onPress={() => decide(c, 'approved')} />
            </>
          ) : (
            <Button title={busy === c.id + 'revoked' ? 'Removing…' : 'Remove checkout'} variant="outline" disabled={!!busy} style={{ flex: 1, paddingVertical: 10 }} onPress={() => decide(c, 'revoked')} />
          )}
        </View>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Renter checkouts" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Text style={st.sub}>Pilots can only rent your plane solo once you mark them checked out. For student pilots, record their solo endorsement too (good for 90 days).</Text>
        {!!err && <Text style={st.err}>{err}</Text>}
        <SectionTitle>Requests</SectionTitle>
        {!loading && pending.length === 0 && <Text style={st.sub}>No checkout requests.</Text>}
        {pending.map(card)}
        <SectionTitle>Checked out</SectionTitle>
        {!loading && approved.length === 0 && <Text style={st.sub}>Nobody yet.</Text>}
        {approved.map(card)}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  sub: { color: C.sub, fontSize: 13, lineHeight: 18 },
  hint: { color: C.sub, fontSize: 12, lineHeight: 17, marginTop: -8, marginBottom: 6 },
  err: { color: '#B91C1C', fontWeight: '600', marginTop: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  title: { fontWeight: '900', color: C.text, fontSize: 16, flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: 16, paddingBottom: 28, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
