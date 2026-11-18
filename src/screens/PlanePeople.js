// Plane people: the owner (or a co-owner) shares running a plane with co-owners, managers
// and view-only members. Screens: PlanePeople (list + permissions), AddPlanePerson (existing
// user or invite), PlaneAccess (invites waiting for you, planes you help run).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, Share, Alert, ActivityIndicator } from 'react-native';
import { C, Card, Button, Field, Tag, SectionTitle, Avatar } from '../ui';
import { Icon } from '../icons';
import { Header } from './Details';
import { useAuth } from '../backend/auth';
import { useStore } from '../store';
import {
  ROLES, PERMISSIONS, canAddPeople, fetchPlanePeople, findPilot, addPlanePerson, setPlanePersonRole,
  removePlanePerson, respondPlaneInvite, fetchMyPlaneAccess, inviteMessage,
} from '../backend/planePeople';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const initials = (name = '') => name.split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const ROLE_TAG = {
  owner: ['Owner', '#fff', C.navy],
  co_owner: ['Co-owner', C.navy, '#E2E8F0'],
  manager: ['Manager', '#92400E', '#FEF3C7'],
  viewer: ['View only', '#475569', '#F1F5F9'],
};
const roleTag = (role) => { const [label, color, bg] = ROLE_TAG[role] || ROLE_TAG.viewer; return <Tag label={label} color={color} bg={bg} />; };
const daysLeft = (iso) => Math.max(0, Math.ceil((new Date(iso) - new Date()) / 86400000));

// ---------------------------------------------------------------- People list
export function PlanePeople({ nav, params }) {
  const auth = useAuth();
  const { planeRole, refreshListings } = useStore();
  const planeId = params?.planeId;
  const myRole = planeRole(planeId);
  const canEdit = canAddPeople(myRole);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchPlanePeople(planeId)); setErr(''); } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [planeId]);
  useEffect(() => { if (auth?.session && planeId) load(); else setLoading(false); }, [auth?.session?.user?.id, planeId, load]);

  const act = async (fn) => { try { await fn(); await load(); } catch (e) { setErr(e.message); } };
  const remove = (p) => Alert.alert(
    p.status === 'invited' ? 'Cancel this invite?' : `Remove ${p.name}?`,
    p.status === 'invited' ? `${p.email} won’t be able to accept it.` : `They’ll lose access to ${data?.plane?.tail || 'this plane'} right away.`,
    [{ text: 'Keep', style: 'cancel' }, { text: p.status === 'invited' ? 'Cancel invite' : 'Remove', style: 'destructive', onPress: () => act(() => removePlanePerson(p.id)) }],
  );
  const changeRole = (p) => Alert.alert(`${p.name}’s role`, 'What can they do on this plane?', [
    ...Object.keys(ROLES).filter((r) => r !== p.role).map((r) => ({ text: ROLES[r].label, onPress: () => act(() => setPlanePersonRole(p.id, r)) })),
    { text: 'Cancel', style: 'cancel' },
  ]);
  const leave = (p) => Alert.alert(`Leave ${data?.plane?.tail || 'this plane'}?`, 'You’ll lose access until the owner adds you again.', [
    { text: 'Stay', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: async () => { try { await removePlanePerson(p.id); await refreshListings(); nav.pop(); } catch (e) { setErr(e.message); } } },
  ]);
  const resend = (p) => Share.share({ message: inviteMessage({ fromName: '', tail: data?.plane?.tail, role: p.role, email: p.email }) }).catch(() => {});

  if (!auth?.session) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="People" />
        <View style={{ padding: 16 }}>
          <Text style={ps.sub}>Sign in to share your plane with co-owners and managers.</Text>
          <Button title="Sign in" style={{ marginTop: 12 }} onPress={() => nav.push('SignIn')} />
        </View>
      </View>
    );
  }

  const me = auth.session.user.id;
  const tail = data?.plane?.tail || '';
  const count = data ? 1 + data.active.length : 0;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={tail ? `People · ${tail}` : 'People'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Text style={ps.sub}>Share running {tail || 'this plane'} with a partner or a manager. Payouts always go to the owner.</Text>
        {!!err && <Text style={ps.err} accessibilityRole="alert">{err}</Text>}
        {!data && loading && <ActivityIndicator style={{ marginTop: 24 }} color={C.blue} />}

        {data && <>
          <SectionTitle>{count === 1 ? 'Just you so far' : `${count} people`}</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {data.owner && (
              <PersonRow first name={data.owner.name + (data.owner.userId === me ? ' (you)' : '')} detail="Payouts go here" role="owner" />
            )}
            {data.active.map((p) => (
              <PersonRow key={p.id} name={p.name + (p.userId === me ? ' (you)' : '')} detail={ROLES[p.role]?.short} role={p.role}
                onPress={canEdit && p.userId !== me ? () => changeRole(p) : undefined}
                action={p.userId === me ? { label: 'Leave', onPress: () => leave(p) } : canEdit ? { label: 'Remove', onPress: () => remove(p) } : null} />
            ))}
          </Card>

          {data.pending.length > 0 && <>
            <SectionTitle>Invites waiting</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {data.pending.map((p, i) => (
                <PersonRow key={p.id} first={i === 0} pending name={p.name} role={p.role}
                  detail={p.expired ? 'Invite expired. Add them again to resend.' : `Hasn’t signed up yet · expires in ${daysLeft(p.expiresAt)} day${daysLeft(p.expiresAt) === 1 ? '' : 's'}`}
                  action={canEdit ? { label: p.expired ? 'Remove' : 'Cancel', onPress: () => remove(p) } : null}
                  secondary={canEdit && !p.expired ? { label: 'Send again', onPress: () => resend(p) } : null} />
              ))}
            </Card>
          </>}

          <SectionTitle>Who can do what</SectionTitle>
          <Card>
            <View style={ps.tableHead}>
              <Text style={[ps.th, { flex: 1.6, textAlign: 'left' }]}>{' '}</Text>
              {['Owner', 'Co-owner', 'Manager', 'View'].map((h) => <Text key={h} style={ps.th}>{h}</Text>)}
            </View>
            {PERMISSIONS.map((row) => (
              <View key={row.label} style={ps.tr} accessible accessibilityLabel={`${row.label}: ${['owner', 'co_owner', 'manager', 'viewer'].filter((r) => row[r]).map((r) => ROLE_TAG[r][0]).join(', ')}`}>
                <Text style={[ps.td, { flex: 1.6, textAlign: 'left', fontWeight: '600', color: C.text }]}>{row.label}</Text>
                {['owner', 'co_owner', 'manager', 'viewer'].map((r) => (
                  <View key={r} style={ps.cell}>
                    {row[r] ? <Icon name="check" size={16} color={C.green} /> : <Text style={ps.no}>—</Text>}
                  </View>
                ))}
              </View>
            ))}
          </Card>
        </>}
      </ScrollView>
      {data && canEdit && (
        <View style={ps.footer}>
          <Button title="Add a person" icon="plus" onPress={() => nav.push('AddPlanePerson', { planeId, tail })} />
        </View>
      )}
    </View>
  );
}

function PersonRow({ name, detail, role, first, pending, onPress, action, secondary }) {
  const Wrap = onPress ? Pressable : View;
  return (
    <Wrap onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityHint={onPress ? 'Change their role' : undefined}
      style={[ps.person, !first && ps.personBorder]}>
      <View style={[ps.avatar, pending && ps.avatarPending]}>
        <Text style={[ps.avatarText, pending && { color: C.sub }]}>{initials(name)}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={ps.name} numberOfLines={1}>{name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
          {roleTag(role)}
          {pending && <Tag label="Invite pending" color="#92400E" bg="#FFFBEB" />}
        </View>
        {!!detail && <Text style={ps.detail}>{detail}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {action && <Pressable onPress={action.onPress} hitSlop={10} style={ps.linkBtn} accessibilityRole="button"><Text style={ps.danger}>{action.label}</Text></Pressable>}
        {secondary && <Pressable onPress={secondary.onPress} hitSlop={10} style={ps.linkBtn} accessibilityRole="button"><Text style={ps.link}>{secondary.label}</Text></Pressable>}
      </View>
    </Wrap>
  );
}

// ---------------------------------------------------------------- Add a person
export function AddPlanePerson({ nav, params }) {
  const auth = useAuth();
  const { planeId, tail } = params || {};
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('manager');
  const [note, setNote] = useState('');
  const [found, setFound] = useState(undefined); // undefined = not checked, null = not on the app
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const clean = email.trim().toLowerCase();
  const valid = EMAIL.test(clean);

  // Look the email up once it's complete, so the button can say who you're adding.
  useEffect(() => {
    setFound(undefined);
    if (!valid) return undefined;
    let live = true;
    setChecking(true);
    const t = setTimeout(async () => {
      try { const r = await findPilot(planeId, clean); if (live) setFound(r); } catch (e) { if (live) setFound(null); }
      if (live) setChecking(false);
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [clean, valid, planeId]);

  const first = (found?.fullName || name || '').split(' ')[0];
  const submit = async () => {
    if (!valid) { setErr('Enter their email'); return; }
    if (found === null && !name.trim()) { setErr('Add their name so you’ll recognize the invite'); return; }
    setSaving(true); setErr('');
    try {
      const p = await addPlanePerson(planeId, { email: clean, role, name: found?.fullName || name.trim(), note });
      if (p.status === 'invited') {
        const from = (auth?.account?.full_name || '').split(' ')[0];
        await Share.share({ message: inviteMessage({ fromName: from, tail, role, email: clean }) }).catch(() => {});
      }
      nav.pop();
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  const cta = !valid ? 'Add a person'
    : found ? `Add ${first || 'them'} as ${ROLES[role].label.toLowerCase()}`
    : found === null ? 'Send invite' : 'Checking…';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={tail ? `Add to ${tail}` : 'Add a person'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Field label="Their email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        {checking && <Text style={ps.sub}>Checking…</Text>}
        {found && (
          <Card style={ps.foundCard}>
            <Avatar initials={initials(found.fullName)} color={C.navy} size={40} photo={found.avatarUrl} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={ps.name}>{found.fullName || clean}</Text>
              <Text style={ps.detail}>On Positive Rate · they’ll get access right away</Text>
            </View>
            <Icon name="checkCircle" size={20} color={C.green} />
          </Card>
        )}
        {found === null && <>
          <Text style={[ps.sub, { marginBottom: 10 }]}>{clean} isn’t on Positive Rate yet. We’ll hold an invite for 7 days and you can text or email them the link.</Text>
          <Field label="Their name" value={name} onChangeText={setName} placeholder="Laura Kim" autoCapitalize="words" />
        </>}

        <SectionTitle>Role</SectionTitle>
        {Object.keys(ROLES).map((r) => {
          const on = role === r;
          return (
            <Pressable key={r} onPress={() => setRole(r)} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={[ps.roleCard, on && ps.roleOn]}>
              <View style={[ps.radio, on && ps.radioOn]}>{on && <View style={ps.radioDot} />}</View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={ps.name}>{ROLES[r].label}</Text>
                <Text style={ps.detail}>{ROLES[r].can.join(' · ')}</Text>
                {ROLES[r].cant.length > 0 && <Text style={[ps.detail, { color: C.sub }]}>Can’t: {ROLES[r].cant.join(' · ').toLowerCase()}</Text>}
              </View>
            </Pressable>
          );
        })}

        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Thanks for helping with scheduling!" multiline />
        <Text style={ps.sub}>Payouts always go to the plane’s owner. You can change their role or remove them any time.</Text>
        {!!err && <Text style={ps.err} accessibilityRole="alert">{err}</Text>}
      </ScrollView>
      <View style={ps.footer}>
        <Button title={saving ? 'Saving…' : cta} disabled={!valid || saving || checking || found === undefined} onPress={submit} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- The invitee's side
export function PlaneAccess({ nav }) {
  const auth = useAuth();
  const { refreshListings } = useStore();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await fetchMyPlaneAccess()); setErr(''); } catch (e) { setErr(e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { if (auth?.session) load(); else setLoading(false); }, [auth?.session?.user?.id, load]);
  const respond = async (id, yes) => {
    try { await respondPlaneInvite(id, yes); await Promise.all([load(), refreshListings().catch(() => {})]); } catch (e) { setErr(e.message); }
  };
  const invites = rows.filter((r) => r.status === 'invited');
  const active = rows.filter((r) => r.status === 'active');
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Planes I help run" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {!!err && <Text style={ps.err} accessibilityRole="alert">{err}</Text>}
        {invites.length > 0 && <SectionTitle>Invites</SectionTitle>}
        {invites.map((r) => (
          <Card key={r.id}>
            <Text style={ps.name}>{r.from} invited you as {ROLES[r.role]?.label.toLowerCase()}</Text>
            <Text style={[ps.detail, { marginTop: 4 }]}>You’ll be able to: {ROLES[r.role]?.can.join(', ').toLowerCase()}.</Text>
            {!!r.note && <Text style={[ps.detail, { fontStyle: 'italic', marginTop: 6 }]}>“{r.note}”</Text>}
            <Text style={[ps.detail, { marginTop: 6 }]}>Payouts stay with the owner. You can leave any time.</Text>
            {r.expired ? <Text style={[ps.err, { marginTop: 8 }]}>This invite expired. Ask {r.from} to send a new one.</Text> : (
              <View style={{ flexDirection: 'row', marginTop: 12 }}>
                <Button title="Decline" variant="outline" small style={{ flex: 0.6, marginRight: 8 }} onPress={() => respond(r.id, false)} />
                <Button title="Accept" small style={{ flex: 1 }} onPress={() => respond(r.id, true)} />
              </View>
            )}
          </Card>
        ))}
        <SectionTitle>Your planes</SectionTitle>
        {!loading && active.length === 0 && <Text style={ps.sub}>No shared planes yet. When an owner adds you, the plane shows up here.</Text>}
        {active.map((r) => (
          <Card key={r.id} onPress={() => nav.push(r.role === 'viewer' ? 'Plane' : 'OwnerDashboard', r.role === 'viewer' ? { id: r.planeId } : { planeId: r.planeId })}
            style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={ps.name}>{r.plane ? `${r.plane.tail} · ${r.plane.make} ${r.plane.model}` : 'Plane'}</Text>
              <View style={{ flexDirection: 'row', marginTop: 4 }}>{roleTag(r.role)}</View>
              <Text style={ps.detail}>{r.plane?.home_airport ? r.plane.home_airport + ' · ' : ''}Added by {r.from}</Text>
            </View>
            <Icon name="chevron" size={18} color="#7A889C" />
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const ps = StyleSheet.create({
  sub: { color: C.sub, fontSize: 13, lineHeight: 18 },
  err: { color: '#B91C1C', fontWeight: '600', marginTop: 8 },
  name: { fontWeight: '800', color: C.text, fontSize: 15 },
  detail: { color: '#475569', fontSize: 12.5, lineHeight: 17, marginTop: 3 },
  person: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, minHeight: 56 },
  personBorder: { borderTopWidth: 1, borderTopColor: C.line },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  avatarPending: { backgroundColor: '#fff', borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#808EA3' },
  avatarText: { color: '#fff', fontWeight: '800' },
  linkBtn: { minHeight: 44, justifyContent: 'center', paddingLeft: 8 },
  link: { color: C.blue, fontWeight: '700' },
  danger: { color: '#B91C1C', fontWeight: '700' },
  tableHead: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  th: { flex: 1, fontSize: 11, fontWeight: '800', color: '#475569', textAlign: 'center' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  td: { flex: 1, fontSize: 13, color: C.sub, textAlign: 'center' },
  cell: { flex: 1, alignItems: 'center' },
  no: { color: '#7A889C', fontWeight: '700' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 30, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
  foundCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.green },
  roleCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: '#808EA3' },
  roleOn: { borderColor: C.navy, backgroundColor: '#F8FAFC' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#808EA3', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioOn: { borderColor: C.navy },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.navy },
});
