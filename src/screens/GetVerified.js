import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, Linking } from 'react-native';
import { useStore } from '../store';
import { useAuth } from '../backend/auth';
import { verifyStatus, verifyIdentity, checkIdentity, submitInsurance, reviewQueue, decide } from '../backend/verify';
import { C, Card, Button, SectionTitle, Field, pickImages } from '../ui';
import { Header } from './Details';

// What each status means to the person being verified.
const LABEL = { passed: ['Verified', C.green, '#E3F7EF'], pending: ['In progress', '#B45309', '#FEF3C7'], review: ['Being reviewed', '#B45309', '#FEF3C7'], failed: ['Needs attention', '#B91C1C', '#FEE2E2'], none: ['Not started', C.sub, '#EEF1F5'] };
function Status({ s }) {
  const [t, color, bg] = LABEL[s] || LABEL.none;
  return <View style={{ backgroundColor: bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color, fontWeight: '800', fontSize: 12 }}>{t}</Text></View>;
}
function Step({ title, sub, status, children }) {
  return (
    <Card>
      <View style={g.row}>
        <Text style={g.title}>{title}</Text>
        <Status s={status} />
      </View>
      {!!sub && <Text style={g.sub}>{sub}</Text>}
      {children}
    </Card>
  );
}

export function GetVerified({ nav }) {
  const auth = useAuth();
  const uid = auth?.session?.user?.id;
  const { refreshListings, myCfiId } = useStore();
  const [data, setData] = useState({ checks: [], planes: [] });
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try { setData(await verifyStatus()); } catch (e) { setErr(e.message); }
    setRefreshing(false);
  };
  useEffect(() => { load(); }, []);
  const check = (type, subject, id) => data.checks.find((c) => c.subject_type === subject && c.subject_id === id && c.check_type === type);
  const run = async (key, fn) => {
    setErr(''); setBusy(key);
    try { await fn(); await load(); await refreshListings().catch(() => {}); } catch (e) { setErr(e.message); }
    setBusy(null);
  };

  const idCheck = check('identity', 'cfi', uid);
  const faa = check('faa_airmen', 'cfi', uid);
  const isCfi = !!myCfiId;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Get verified" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <Text style={g.intro}>Students can only book verified instructors and planes. It’s free and most checks finish on their own.</Text>
        {!!err && <Text style={g.err} accessibilityLiveRegion="polite">{err}</Text>}

        {isCfi && (
          <>
            <SectionTitle>Instructor</SectionTitle>
            <Step title="1. Your identity" status={idCheck?.status || 'none'}
              sub={idCheck?.status === 'passed' ? `Verified as ${idCheck.detail?.name?.first || ''} ${idCheck.detail?.name?.last || ''}`.trim()
                : idCheck?.status === 'failed' ? `Stripe couldn’t verify it (${idCheck.detail?.reason || 'try again'}). Use a clear photo of a valid driver’s license or passport.`
                : 'A photo of your driver’s license or passport and a quick selfie, through Stripe. About 2 minutes.'}>
              {idCheck?.status !== 'passed' && (
                <Button title={busy === 'id' ? 'Opening…' : idCheck?.status === 'pending' ? 'Continue' : 'Verify my identity'} disabled={!!busy} style={{ marginTop: 10 }}
                  onPress={() => run('id', verifyIdentity)} />
              )}
              {idCheck?.status === 'pending' && (
                <Pressable onPress={() => run('idc', checkIdentity)} style={{ marginTop: 8, alignSelf: 'center' }}><Text style={g.link}>Already finished? Check again</Text></Pressable>
              )}
            </Step>
            <Step title="2. FAA instructor certificate" status={faa?.status || (idCheck?.status === 'passed' ? 'pending' : 'none')}
              sub={faa?.status === 'passed' ? `Found in the FAA Airmen Registry${faa.detail?.ratings?.length ? `: ${faa.detail.ratings.join(', ')}` : ''}.`
                : faa?.status === 'failed' ? (faa.detail?.reviewNote || faa.detail?.reason || 'We couldn’t find a flight instructor certificate under your verified name.')
                : faa?.status === 'review' ? 'More than one match or a name difference. Positive Rate is checking by hand.'
                : idCheck?.status === 'passed' ? 'Checked automatically against the FAA Airmen Registry, usually within 24 hours.'
                : 'Checked automatically once your identity is verified.'} />
          </>
        )}

        {data.planes.length > 0 && <SectionTitle>Your planes</SectionTitle>}
        {data.planes.map((p) => {
          const reg = check('faa_aircraft', 'plane', p.id);
          const ins = check('insurance', 'plane', p.id);
          return (
            <View key={p.id}>
              <Step title={`${p.tail} · FAA registration`} status={reg?.status || 'pending'}
                sub={reg?.status === 'passed' ? 'Registration is valid and matches the listing.'
                  : reg?.status === 'failed' ? (reg.detail?.reviewNote || reg.detail?.reason || 'The FAA registry doesn’t show a valid registration for this tail number.')
                  : reg?.status === 'review' ? (reg.detail?.reason || 'Positive Rate is checking a difference by hand.')
                  : 'Checked automatically against the FAA Aircraft Registry, usually within 24 hours.'} />
              <Step title={`${p.tail} · Insurance`} status={ins?.status || 'none'}
                sub={ins?.status === 'passed' ? 'Policy reviewed and approved.'
                  : ins?.status === 'review' ? 'Positive Rate is reviewing your policy, usually within one business day.'
                  : ins?.status === 'failed' ? (ins.detail?.reviewNote || 'The policy couldn’t be approved. Upload the current declarations page.')
                  : 'Upload the declarations page of your aircraft policy. It must cover rental and instruction.'}>
                {ins?.status !== 'passed' && ins?.status !== 'review' && (
                  <Button title={busy === p.id ? 'Uploading…' : 'Upload declarations page'} variant="outline" disabled={!!busy} style={{ marginTop: 10 }}
                    onPress={() => run(p.id, async () => { const [uri] = await pickImages(false); if (uri) await submitInsurance(uid, p.id, uri); })} />
                )}
              </Step>
            </View>
          );
        })}

        {!isCfi && data.planes.length === 0 && (
          <Card><Text style={g.sub}>Create your instructor profile or list a plane first. Its checks will show up here.</Text></Card>
        )}
        <Text style={[g.sub, { marginTop: 14 }]}>“Verified” means Positive Rate checked these records are real and current. It isn’t a guarantee of skill or airworthiness.</Text>
      </ScrollView>
    </View>
  );
}

const CHECK_NAMES = { identity: 'Identity', faa_airmen: 'FAA instructor certificate', faa_aircraft: 'FAA aircraft registration', insurance: 'Aircraft insurance' };

export function StaffReview({ nav }) {
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = async () => {
    setRefreshing(true);
    try { setItems((await reviewQueue()).items); } catch (e) { setErr(e.message); }
    setRefreshing(false);
  };
  useEffect(() => { load(); }, []);
  const act = async (it, decision) => {
    setErr(''); setBusy(it.id + decision);
    try { await decide(it.id, decision, notes[it.id] || ''); await load(); } catch (e) { setErr(e.message); }
    setBusy(null);
  };
  const waiting = items.filter((i) => i.status === 'review');
  const auto = items.filter((i) => i.status === 'pending');

  const card = (it) => (
    <Card key={it.id}>
      <View style={g.row}>
        <Text style={g.title}>{it.subject.label}</Text>
        <Status s={it.status} />
      </View>
      <Text style={g.sub}>{CHECK_NAMES[it.check] || it.check}</Text>
      {!!it.detail?.reason && <Text style={[g.sub, { color: C.text }]}>{it.detail.reason}</Text>}
      {it.check === 'faa_airmen' && it.detail?.candidates && (
        <Text style={g.sub}>FAA matches: {it.detail.candidates.map((c) => `${c.name} (${c.city || '?'}, ${c.state || '?'}) ${c.instructor ? 'CFI ' + (c.instructor.ratings || []).join(' ') : 'no CFI'}`).join(' · ')}</Text>
      )}
      {it.check === 'identity' && <Text style={g.sub}>Verified name: {it.detail?.name ? `${it.detail.name.first} ${it.detail.name.last}` : 'not yet'}</Text>}
      {!!it.documentUrl && (
        <Pressable onPress={() => Linking.openURL(it.documentUrl)} style={{ marginTop: 8 }}><Text style={g.link}>Open document ›</Text></Pressable>
      )}
      <Field label="Note to the owner (optional)" value={notes[it.id] || ''} onChangeText={(t) => setNotes((n) => ({ ...n, [it.id]: t }))} placeholder="e.g. Policy excludes rental use" />
      <View style={{ flexDirection: 'row' }}>
        <Button title={busy === it.id + 'failed' ? '…' : 'Reject'} variant="outline" disabled={!!busy} style={{ flex: 0.6, marginRight: 8, paddingVertical: 10 }} onPress={() => act(it, 'failed')} />
        <Button title={busy === it.id + 'passed' ? '…' : 'Approve'} disabled={!!busy} style={{ flex: 1, paddingVertical: 10 }} onPress={() => act(it, 'passed')} />
      </View>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Verification reviews" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        {!!err && <Text style={g.err}>{err}</Text>}
        <SectionTitle>Needs you</SectionTitle>
        {waiting.length === 0 && <Text style={g.sub}>Nothing to review. Pull down to refresh.</Text>}
        {waiting.map(card)}
        <SectionTitle>Waiting on automatic checks</SectionTitle>
        <Text style={[g.sub, { marginBottom: 8 }]}>The FAA job runs nightly. You can approve one by hand after checking the FAA registry yourself.</Text>
        {auto.length === 0 && <Text style={g.sub}>None.</Text>}
        {auto.map(card)}
      </ScrollView>
    </View>
  );
}

const g = StyleSheet.create({
  intro: { color: C.sub, marginBottom: 6, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontWeight: '900', color: C.text, fontSize: 16, flex: 1, marginRight: 8 },
  sub: { color: C.sub, marginTop: 4, fontSize: 13, lineHeight: 18 },
  link: { color: C.blue, fontWeight: '700' },
  err: { color: '#B91C1C', fontWeight: '600', marginVertical: 8 },
});
