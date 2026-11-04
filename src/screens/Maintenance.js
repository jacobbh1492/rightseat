import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Image, RefreshControl } from 'react-native';
import { C, Card, Button, Field, Toggle, Tag, Chip, SectionTitle, Row, pickImages } from '../ui';
import { Header } from './Details';
import { useAuth } from '../backend/auth';
import { useStore } from '../store';
import {
  fetchMaintenance, reportSquawk, updateSquawk, uploadSquawkPhotos, logInspection, inviteMechanic, removeMechanic,
  fetchMyMechanicAccess, respondMechanicInvite, setPlaneDetails, onMaintenanceChange,
} from '../backend/maintenance';
import { aircraftChecks, annualValidThrough, openSquawks } from '../aircraftStatus';
import { RECENT_FLIGHT_OPTIONS, ymdIn } from '../renterChecks';
import { toYmd, fromYmd } from './Renter';

const pretty = (ymd) => (ymd ? new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
const today = () => ymdIn(new Date());

const STATUS = {
  grounding: ['Grounding', '#DC2626', '#FEE2E2'],
  open: ['Open', '#B45309', '#FEF3C7'],
  deferred: ['Deferred', '#1F6FEB', C.sky],
  fixed: ['Fixed', C.green, '#E3F7EF'],
};

// One squawk, with fix / defer / ground actions for the owner and mechanic.
export function SquawkCard({ q, canManage, onChanged }) {
  const [mode, setMode] = useState(null); // fix | defer
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const st = q.status === 'open' && q.grounding ? STATUS.grounding : STATUS[q.status] || STATUS.open;
  const act = async (status, n = null, grounding = null) => {
    setErr(''); setBusy(true);
    try { await updateSquawk(q.id, status, n, grounding); setMode(null); setNote(''); onChanged?.(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Card>
      <View style={ms.rowTop}>
        <Text style={[ms.title, q.status === 'fixed' && { color: C.sub }]}>{q.text}</Text>
        <Tag label={st[0]} color={st[1]} bg={st[2]} />
      </View>
      <Text style={ms.sub}>{q.date}{q.reporterName ? ` · ${q.reporterName}` : ''}</Text>
      {q.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {q.photos.map((u) => <Image key={u} source={{ uri: u }} style={ms.photo} accessibilityLabel="Squawk photo" />)}
        </ScrollView>
      )}
      {!!q.resolvedNote && <Text style={[ms.sub, { marginTop: 6 }]}>{q.status === 'fixed' ? 'Fixed: ' : q.status === 'deferred' ? 'Deferred: ' : ''}{q.resolvedNote}</Text>}
      {canManage && q.status !== 'fixed' && !mode && (
        <View style={ms.actions}>
          <Pressable onPress={() => setMode('fix')} style={ms.action} accessibilityRole="button"><Text style={[ms.actionText, { color: C.green }]}>Mark fixed</Text></Pressable>
          {q.status === 'open' && <Pressable onPress={() => setMode('defer')} style={ms.action} accessibilityRole="button"><Text style={ms.actionText}>Defer</Text></Pressable>}
          {q.status === 'open' && (
            <Pressable disabled={busy} onPress={() => act('open', null, !q.grounding)} style={ms.action} accessibilityRole="button">
              <Text style={[ms.actionText, { color: q.grounding ? C.blue : '#DC2626' }]}>{q.grounding ? 'Not grounding' : 'Ground plane'}</Text>
            </Pressable>
          )}
          {q.status === 'deferred' && <Pressable disabled={busy} onPress={() => act('open')} style={ms.action} accessibilityRole="button"><Text style={ms.actionText}>Reopen</Text></Pressable>}
        </View>
      )}
      {mode && (
        <View style={{ marginTop: 10 }}>
          <Field label={mode === 'fix' ? 'What was done?' : 'Why is it OK to fly with it?'} value={note} onChangeText={setNote} multiline
            placeholder={mode === 'fix' ? 'Replaced bulb, ops check good' : 'Inop, placarded per 91.213(d)'} />
          <View style={{ flexDirection: 'row' }}>
            <Button title="Cancel" variant="outline" small style={{ flex: 0.6, marginRight: 8 }} onPress={() => { setMode(null); setErr(''); }} />
            <Button title={busy ? 'Saving…' : mode === 'fix' ? 'Mark fixed' : 'Defer'} small disabled={busy || note.trim().length < 3} style={{ flex: 1 }} onPress={() => act(mode === 'fix' ? 'fixed' : 'deferred', note)} />
          </View>
        </View>
      )}
      {!!err && <Text style={ms.err}>{err}</Text>}
    </Card>
  );
}

function InspectionForm({ kind, planeId, hobbs, onDone, onCancel }) {
  const [date, setDate] = useState(fromYmd(today()));
  const [h, setH] = useState(kind === '100hr' && hobbs ? String(hobbs) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    const d = toYmd(date);
    if (!d) { setErr('Enter the date as MM/DD/YYYY.'); return; }
    setErr(''); setBusy(true);
    try { await logInspection(planeId, kind, d, kind === '100hr' ? Number(h) : null, note); onDone(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <View style={{ marginTop: 10 }}>
      <Field label="Signed off on (MM/DD/YYYY)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
      {kind === '100hr' && <Field label="Hobbs at the inspection" value={h} onChangeText={(t) => setH(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="1234.5" />}
      <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder={kind === '100hr' ? 'Oil changed, compressions good' : 'IA: J. Smith'} />
      <View style={{ flexDirection: 'row' }}>
        <Button title="Cancel" variant="outline" small style={{ flex: 0.6, marginRight: 8 }} onPress={onCancel} />
        <Button title={busy ? 'Saving…' : 'Log it'} small disabled={busy || (kind === '100hr' && !(Number(h) > 0))} style={{ flex: 1 }} onPress={save} />
      </View>
      {!!err && <Text style={ms.err}>{err}</Text>}
    </View>
  );
}

// Everything about one plane's condition: status, inspections, squawks; for owners also
// mechanics and the recency rule. Used by the owner dashboard and the mechanic's view.
export function MaintenancePanel({ planeId, nav, owner }) {
  const { getPlane } = useStore();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // 100hr | annual
  const [showFixed, setShowFixed] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setD(await fetchMaintenance(planeId)); setErr(''); } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [planeId]);
  useEffect(() => { load(); return onMaintenanceChange(load); }, [load]);
  if (!d) return <Text style={[ms.sub, { marginTop: 12 }]}>{err || 'Loading maintenance…'}</Text>;
  const p = d.plane || {};
  const listing = getPlane(planeId);
  const open = openSquawks(d.squawks);
  const fixed = d.squawks.filter((q) => q.status === 'fixed');
  const checks = aircraftChecks({ plane: p, squawks: open, flightHours: 0.1, day: today() });
  const bad = checks.filter((c) => c.blocking && !c.ok);
  const left = p.next100At ? Math.round((p.next100At - p.hobbsTotal) * 10) / 10 : null;
  const annualThrough = annualValidThrough(p.annualDate);

  const invite = async () => {
    setInviteMsg(''); setInviteBusy(true);
    try { await inviteMechanic(planeId, email.trim(), name.trim()); setEmail(''); setName(''); setInviteMsg('Invite sent ✓ They’ll see it under Account → Maintenance once they sign in with that email.'); await load(); }
    catch (e) { setInviteMsg(e.message); }
    setInviteBusy(false);
  };

  return (
    <View>
      <Card style={{ borderWidth: 1.5, borderColor: bad.length ? '#FCA5A5' : '#A7F3D0' }}>
        <Text style={{ fontWeight: '900', fontSize: 16, color: bad.length ? '#DC2626' : C.green }}>{bad.length ? 'Grounded · bookings paused' : 'Airworthy · accepting bookings'}</Text>
        {bad.map((c) => <Text key={c.key} style={[ms.sub, { color: '#B91C1C', marginTop: 4 }]}>✕ {c.label}</Text>)}
        {!bad.length && <Text style={[ms.sub, { marginTop: 4 }]}>New bookings and confirmations pause automatically for a grounding squawk, an overdue 100-hour or an expired annual.</Text>}
      </Card>

      <SectionTitle>Inspections</SectionTitle>
      <Card>
        <Row label="Hobbs" value={p.hobbsTotal ? String(p.hobbsTotal) : '—'} />
        <Row label="100-hour due at" value={p.next100At ? `${p.next100At}${left != null ? ` (${left > 0 ? left + ' hrs left' : 'overdue'})` : ''}` : 'Not set'} />
        <Row label="Annual" value={annualThrough ? `${pretty(p.annualDate)} · good through ${pretty(annualThrough)}` : 'Not logged'} />
        {!form && (
          <View style={ms.actions}>
            <Pressable onPress={() => setForm('100hr')} style={ms.action} accessibilityRole="button"><Text style={ms.actionText}>Log 100-hour</Text></Pressable>
            <Pressable onPress={() => setForm('annual')} style={ms.action} accessibilityRole="button"><Text style={ms.actionText}>Log annual</Text></Pressable>
          </View>
        )}
        {form && <InspectionForm kind={form} planeId={planeId} hobbs={p.hobbsTotal} onDone={() => { setForm(null); load(); }} onCancel={() => setForm(null)} />}
        {d.log.length > 0 && (
          <View style={{ marginTop: 10 }}>
            {d.log.slice(0, 5).map((l) => (
              <Text key={l.id} style={ms.sub}>{pretty(l.doneOn)} · {l.kind === '100hr' ? `100-hour at ${l.hobbs}` : 'Annual'}{l.by ? ` · ${l.by}` : ''}{l.note ? ` · ${l.note}` : ''}</Text>
            ))}
          </View>
        )}
      </Card>

      <SectionTitle right={<Pressable onPress={() => nav.push('ReportSquawk', { planeId })} accessibilityRole="button"><Text style={{ color: C.blue, fontWeight: '800' }}>+ Report</Text></Pressable>}>Squawks</SectionTitle>
      {!loading && open.length === 0 && <Text style={[ms.sub, { marginBottom: 8 }]}>No open squawks.</Text>}
      {open.map((q) => <SquawkCard key={q.id} q={q} canManage onChanged={load} />)}
      {fixed.length > 0 && (
        <Pressable onPress={() => setShowFixed(!showFixed)} style={{ paddingVertical: 8 }} accessibilityRole="button">
          <Text style={{ color: C.blue, fontWeight: '700' }}>{showFixed ? 'Hide' : 'Show'} {fixed.length} fixed</Text>
        </Pressable>
      )}
      {showFixed && fixed.map((q) => <SquawkCard key={q.id} q={q} />)}

      {owner && (
        <>
          <SectionTitle>Mechanics</SectionTitle>
          <Card>
            <Text style={ms.sub}>Give your A&P access to {p.tail}’s squawks and inspections. They can mark squawks fixed and log the 100-hour and annual. They never see renters, bookings or money.</Text>
            {d.mechanics.map((m) => (
              <View key={m.id} style={[ms.rowTop, { marginTop: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: C.text }}>{m.name || m.email}</Text>
                  <Text style={ms.sub}>{m.name ? m.email + ' · ' : ''}{m.status === 'active' ? 'Has access' : 'Invited'}</Text>
                </View>
                <Pressable onPress={async () => { try { await removeMechanic(m.id); load(); } catch (e) { setInviteMsg(e.message); } }} accessibilityRole="button" hitSlop={8}>
                  <Text style={{ color: '#DC2626', fontWeight: '700' }}>Remove</Text>
                </Pressable>
              </View>
            ))}
            <View style={{ marginTop: 12 }}>
              <Field label="Mechanic’s email" value={email} onChangeText={setEmail} placeholder="mike@bayaviation.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              <Field label="Name (optional)" value={name} onChangeText={setName} placeholder="Mike, Bay Aviation" />
              <Button title={inviteBusy ? 'Sending…' : 'Invite mechanic'} variant="outline" disabled={inviteBusy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} onPress={invite} />
              {!!inviteMsg && <Text style={[ms.sub, { marginTop: 8 }]}>{inviteMsg}</Text>}
            </View>
          </Card>

          {listing?.soloRental !== false && <RecencyRule planeId={planeId} value={listing?.recentFlightDays || 0} />}
        </>
      )}
      {!!err && <Text style={ms.err}>{err}</Text>}
    </View>
  );
}

function RecencyRule({ planeId, value }) {
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState('');
  useEffect(() => setV(value), [value]);
  const pick = async (d) => {
    setMsg(''); setV(d);
    try { await setPlaneDetails(planeId, { recentFlightDays: d }); setMsg('Saved ✓'); } catch (e) { setMsg(e.message); setV(value); }
  };
  return (
    <>
      <SectionTitle>Recent flight rule</SectionTitle>
      <Card>
        <Text style={ms.sub}>Solo renters must have flown within this many days (from their pilot profile and RightSeat flights).</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {RECENT_FLIGHT_OPTIONS.map((d) => <Chip key={d} small label={d ? `${d} days` : 'Off'} active={v === d} onPress={() => pick(d)} />)}
        </View>
        {!!msg && <Text style={[ms.sub, { marginTop: 4 }]}>{msg}</Text>}
      </Card>
    </>
  );
}

// The mechanic's (or owner's) maintenance view for one plane.
export function Maintenance({ nav, params }) {
  const { myPlaneIds, getPlane } = useStore();
  const auth = useAuth();
  const plane = getPlane(params.planeId);
  const owner = (myPlaneIds || []).includes(params.planeId) || (plane && plane.ownerId === auth?.session?.user?.id);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={plane ? `${plane.tail} maintenance` : 'Maintenance'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <MaintenancePanel planeId={params.planeId} nav={nav} owner={owner} />
      </ScrollView>
    </View>
  );
}

// Anyone who flies the plane (or owns or maintains it) reports a problem, with photos.
export function ReportSquawk({ nav, params }) {
  const { getPlane } = useStore();
  const auth = useAuth();
  const uid = auth?.session?.user?.id;
  const plane = getPlane(params.planeId);
  const [text, setText] = useState('');
  const [grounding, setGrounding] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const add = async () => { const uris = await pickImages(true); setPhotos((p) => [...p, ...uris].slice(0, 4)); };
  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const paths = await uploadSquawkPhotos(uid, photos);
      setDone(await reportSquawk({ planeId: params.planeId, text: text.trim(), grounding, photoPaths: paths, bookingId: params.bookingId || null }));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  if (!uid) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Report a squawk" />
        <View style={{ padding: 16 }}><Button title="Sign in to report a squawk" onPress={() => nav.push('SignIn')} /></View>
      </View>
    );
  }
  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Squawk reported" />
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>🔧</Text>
          <Text style={{ fontSize: 20, fontWeight: '900', color: C.text, marginTop: 8 }}>Thanks, the owner has it</Text>
          <Text style={[ms.sub, { textAlign: 'center', marginTop: 8 }]}>
            {done.grounding ? `${plane?.tail || 'The plane'} is now grounded: new bookings are paused, and pilots with upcoming flights were told. It goes back online when the owner or mechanic marks it fixed.` : 'The owner and their mechanic were notified. The next pilot will see it on the preflight screen.'}
          </Text>
          <Button title="Done" style={{ marginTop: 18, alignSelf: 'stretch' }} onPress={nav.pop} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Report a squawk" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        <Text style={ms.sub}>{plane ? `${plane.tail} · ${plane.make} ${plane.model}` : ''}</Text>
        <Field label="What’s wrong?" value={text} onChangeText={setText} multiline placeholder="Left nav light inop. Noticed on preflight." />
        <Toggle label="Unsafe to fly (grounding)" value={grounding} onValueChange={setGrounding}
          hint="Pauses new bookings right away and tells pilots with upcoming flights. Use it for anything that affects airworthiness." />
        <SectionTitle>Photos</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {photos.map((u, i) => (
            <Pressable key={u + i} onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))} accessibilityLabel="Remove photo">
              <Image source={{ uri: u }} style={ms.photo} />
            </Pressable>
          ))}
          {photos.length < 4 && (
            <Pressable onPress={add} style={[ms.photo, ms.addPhoto]} accessibilityRole="button" accessibilityLabel="Add photo">
              <Text style={{ color: C.blue, fontWeight: '800', fontSize: 22 }}>+</Text>
            </Pressable>
          )}
        </View>
        <Text style={[ms.sub, { marginTop: 4 }]}>Up to 4. Tap a photo to remove it.</Text>
        {!!err && <Text style={ms.err}>{err}</Text>}
      </ScrollView>
      <View style={ms.cta}>
        <Button title={busy ? 'Sending…' : grounding ? 'Report & ground the plane' : 'Report squawk'} disabled={busy || text.trim().length < 3} style={{ flex: 1 }} onPress={submit} />
      </View>
    </View>
  );
}

// Mechanics: invites from owners, and the planes they look after.
export function MechanicHome({ nav }) {
  const auth = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const load = async () => {
    setLoading(true);
    try { setRows(await fetchMyMechanicAccess()); setErr(''); } catch (e) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { if (auth?.session) load(); else setLoading(false); }, [auth?.session?.user?.id]);
  const respond = async (id, yes) => {
    try { await respondMechanicInvite(id, yes); await load(); } catch (e) { setErr(e.message); }
  };
  const invites = rows.filter((r) => r.status === 'invited');
  const active = rows.filter((r) => r.status === 'active');
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Maintenance" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Text style={ms.sub}>For A&P mechanics: owners invite you by email to see their plane’s squawks and log inspections.</Text>
        {!!err && <Text style={ms.err}>{err}</Text>}
        {invites.length > 0 && <SectionTitle>Invites</SectionTitle>}
        {invites.map((r) => (
          <Card key={r.id}>
            <Text style={ms.title}>{r.from} invited you</Text>
            <Text style={ms.sub}>Mechanic access to their plane’s squawks and maintenance.</Text>
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <Button title="Decline" variant="outline" small style={{ flex: 0.6, marginRight: 8 }} onPress={() => respond(r.id, false)} />
              <Button title="Accept" small style={{ flex: 1 }} onPress={() => respond(r.id, true)} />
            </View>
          </Card>
        ))}
        <SectionTitle>Your planes</SectionTitle>
        {!loading && active.length === 0 && <Text style={ms.sub}>No planes yet.</Text>}
        {active.map((r) => (
          <Card key={r.id} onPress={() => nav.push('Maintenance', { planeId: r.planeId })}>
            <Text style={ms.title}>{r.plane ? `${r.plane.tail} · ${r.plane.make} ${r.plane.model}` : 'Plane'}</Text>
            <Text style={ms.sub}>{r.plane?.home_airport || ''} · Owner: {r.from}</Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const ms = StyleSheet.create({
  sub: { color: C.sub, fontSize: 13, lineHeight: 18 },
  err: { color: '#B91C1C', fontWeight: '600', marginTop: 8 },
  title: { fontWeight: '800', color: C.text, fontSize: 15, flex: 1, marginRight: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  action: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F1F5F9', marginRight: 8, marginTop: 4, minHeight: 36, justifyContent: 'center' },
  actionText: { fontWeight: '800', color: C.blue, fontSize: 13 },
  photo: { width: 72, height: 72, borderRadius: 10, marginRight: 8, marginBottom: 8, backgroundColor: '#E2E8F0' },
  addPhoto: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.blue, borderStyle: 'dashed', backgroundColor: C.sky },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: 16, paddingBottom: 28, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
