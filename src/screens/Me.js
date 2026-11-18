import React, { useEffect, useState } from 'react';
import { RECENT_FLIGHT_OPTIONS } from '../renterChecks';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useStore, money } from '../store';
import { money2 } from '../logic';
import { AIRPORTS, CERTS, SPECIALTIES, AVIONICS, OWNER_TYPES } from '../data';
import { useAuth } from '../backend/auth';
import { saveCfiProfile, savePlaneListing, findCfiByEmail } from '../backend/profiles';
import { fetchMyMechanicAccess } from '../backend/maintenance';
import { fetchMyPlaneAccess } from '../backend/planePeople';
import { C, Card, Field, MultiSelect, Toggle, Button, SectionTitle, Avatar, pickImages, ListRow, Icon, Chip, Steps, Banner } from '../ui';
import { Header } from './Details';
import { CfiCard, PlaneCard, SchoolCard } from './Explore';
import { WeeklyHours } from './Availability';
import { fetchSchedule, saveSchedule } from '../backend/schedule';
import { normalizeSchedule, workingDays, DAY_KEYS } from '../schedule';
import { PlaneImage, PhotoStrip } from '../art';

const PALETTE = ['#1D4ED8', '#0B6E4F', '#9333EA', '#F59E0B', '#B91C1C', '#0891B2', '#DB2777'];
const num = (v) => (v === '' || isNaN(+v) ? 0 : +v);

export function Me({ nav }) {
  const { myCfiId, myPlaneIds, getCfi, getPlane, favorites, mySchoolId, getSchool, available, pilot, profile, setProfile, docs, training, queue, affiliationFor, teaching, promos } = useStore();
  const me = getCfi(myCfiId);
  const mySchool = mySchoolId ? getSchool(mySchoolId) : null;
  const myPlanes = myPlaneIds.map(getPlane).filter(Boolean);
  const favs = favorites.map(getCfi).filter(Boolean);
  const roles = profile.roles.length ? profile.roles : ['learn'];
  const myDocs = Object.values(docs.me || {});
  const verified = myDocs.filter((d) => d.status === 'approved').length;
  const pendingQueue = queue.filter((x) => x.state === 'pending').length;
  const auth = useAuth();
  // Mechanics an owner invited: show their maintenance section (any mode).
  const [hasMech, setHasMech] = useState(false);
  const [access, setAccess] = useState({ invites: 0, planes: 0 });
  useEffect(() => {
    if (!auth?.session) { setHasMech(false); setAccess({ invites: 0, planes: 0 }); return; }
    fetchMyMechanicAccess().then((r) => setHasMech(r.length > 0)).catch(() => {});
    fetchMyPlaneAccess().then((r) => setAccess({ invites: r.filter((x) => x.status === 'invited' && !x.expired).length, planes: r.filter((x) => x.status === 'active').length })).catch(() => {});
  }, [auth?.session?.user?.id]);
  const displayName = auth?.account?.full_name || pilot.name;
  const roleLine = !auth?.session ? 'Browsing' : roles.includes('teach') ? 'Instructor' : roles.includes('school') ? 'Flight school' : roles.includes('own') && !roles.includes('learn') ? 'Aircraft owner' : 'Pilot';

  const sections = [
    {
      key: 'fly', mode: 'learn', show: roles.includes('learn') || roles.includes('rent'), title: 'Flying',
      rows: [
        // Sample verification screens for guests only; signed-in users have real checks.
        ...(auth?.session ? [] : [
          { icon: 'shieldCheck', title: 'Verification (sample)', subtitle: 'How ID, certificate and medical checks work', go: 'Verification' },
          { icon: 'file', title: 'Pilot credentials', subtitle: 'What CFIs and owners see before you fly', go: 'Credentials' },
        ]),
        ...(auth?.session ? [{ icon: 'wallet', title: 'Payment methods', subtitle: 'Your saved cards · add, remove or change the default', go: 'PaymentMethods' }] : []),
        ...(auth?.session ? [{ icon: 'file', title: 'Pilot profile & verification', subtitle: 'Certificate, medical, flight review, hours · needed to rent solo', go: 'PilotProfile' }] : []),
        { icon: 'book', title: 'Previous experience', subtitle: training.prior ? 'Update your hours and lessons' : 'Trained before? Add it here', go: 'PriorExperience' },
        { icon: 'users', title: 'Get matched with an instructor', subtitle: 'Tell us your goals, we rank instructors by fit', go: 'GetMatched' },
        ...(auth?.session ? [{ icon: 'chat', title: 'Your matches', subtitle: 'Requests you sent and who answered', go: 'MyMatches' }] : []),
      ],
    },
    {
      key: 'teach', mode: 'teach', show: roles.includes('teach') || teaching.some((r) => r.role === 'cfi'), title: 'Teaching',
      rows: [
        ...(auth?.session ? [{ icon: 'shieldCheck', title: 'Get verified', subtitle: me?.live && me.verified ? 'Verified ✓ · students can book you' : 'Required before students can book you', go: 'GetVerified' }] : []),
        { icon: 'user', title: me ? 'Edit CFI profile' : 'Create your CFI profile', subtitle: me ? `${me.name} · ${me.certs.join(', ')}` : 'Hours, pass rate, pricing and planes you fly', go: 'CfiForm', params: { id: myCfiId } },
        ...(auth?.session ? [] : [{ icon: 'chart', title: 'Instructor dashboard (sample)', subtitle: 'Earnings, payouts, students, debriefs', go: 'CfiDashboard' }]),
        { icon: 'school', title: 'Flight school', subtitle: me && affiliationFor(me.id) ? `Teaching for ${getSchool(affiliationFor(me.id).schoolId)?.name}` : 'Join a school or see your arrangement', go: 'JoinSchool', params: { cfiId: myCfiId } },
        { icon: 'dollar', title: 'Plans & fees', subtitle: 'CFI Pro: 0% fees, instant payouts', go: 'Plans' },
        ...(auth?.session ? [{ icon: 'users', title: 'Student requests', subtitle: 'Students who matched with you', go: 'StudentRequests' }] : []),
      ],
    },
    {
      key: 'own', mode: 'teach', show: roles.includes('own'), title: 'Aircraft',
      rows: [
        { icon: 'plus', title: 'List a plane', subtitle: 'Photos, rates, renter requirements', go: 'PlaneForm' },
        { icon: 'tool', title: 'Owner tools', subtitle: '100-hr countdown, squawks, schedule', go: 'OwnerDashboard' },
        ...(auth?.session ? [{ icon: 'user', title: 'Renter checkouts', subtitle: 'Approve who can rent your plane solo', go: 'Checkouts' }] : []),
        ...(auth?.session ? [{ icon: 'shieldCheck', title: 'Verify my planes', subtitle: 'FAA registration and insurance, required before renting', go: 'GetVerified' }] : []),
      ],
    },
    {
      // Co-owners, managers and viewers an owner added (they may have no other role).
      key: 'shared', mode: 'any', show: access.invites + access.planes > 0, title: 'Shared planes',
      rows: [{ icon: 'users', title: 'Planes I help run', subtitle: access.invites ? `${access.invites} invite${access.invites === 1 ? '' : 's'} waiting for you` : `${access.planes} plane${access.planes === 1 ? '' : 's'} shared with you`, go: 'PlaneAccess' }],
    },
    {
      // Mechanics an owner invited (they may have no other role on Positive Rate).
      key: 'mech', mode: 'any', show: hasMech, title: 'Maintenance',
      rows: [{ icon: 'tool', title: 'Mechanic access', subtitle: 'Planes you maintain and invites from owners', go: 'MechanicHome' }],
    },
    {
      key: 'school', mode: 'teach', show: roles.includes('school'), title: 'Flight school',
      rows: [
        { icon: 'calendar', title: 'School dashboard', subtitle: 'Schedule, instructors, join requests, your share', go: 'SchoolDashboard' },
        { icon: 'school', title: mySchool ? 'Edit school page' : 'Create school page', subtitle: 'Instructors, fleet, programs, reviews', go: 'SchoolForm', params: { id: mySchoolId } },
      ],
    },
  ];
  const others = sections.filter((x) => !x.show && x.key !== 'mech' && x.key !== 'shared');
  const mode = nav.mode || 'learn';
  const teachingMode = mode === 'teach';
  const pendingTeach = teaching.filter((r) => r.status === 'Pending').length;
  // Turning on teaching or owning a plane also opens teaching mode, where those tools live.
  const turnOn = (key) => {
    setProfile({ roles: [...roles, { fly: 'learn', teach: 'teach', own: 'own', school: 'school' }[key]] });
    if (key !== 'fly' && nav.switchMode) setTimeout(() => nav.switchMode('teach'), 0);
    if (key === 'fly' && nav.switchMode) setTimeout(() => nav.switchMode('learn'), 0);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <View style={ms.profile}>
        <Avatar initials={auth?.session ? displayName.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2) : '?'} color={C.navy} size={60} photo={auth?.account?.avatar_url || me?.photo} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: C.text }}>{auth?.session ? displayName : 'Guest'}</Text>
          <Text style={{ color: C.sub, marginTop: 2 }}>{roleLine} · {auth?.account?.home_airport || profile.airport}</Text>
          {auth?.session && me?.live && me.verified && <Pressable onPress={() => nav.push('GetVerified')} style={ms.verifiedPill} accessibilityRole="button">
            <Icon name="shieldCheck" size={14} color={C.green} />
            <Text style={{ color: C.green, fontWeight: '800', fontSize: 12, marginLeft: 4 }}>Verified instructor</Text>
          </Pressable>}
          {auth?.session && <Pressable onPress={() => nav.push('EditProfile')} style={{ minHeight: 36, justifyContent: 'center' }} accessibilityRole="button"><Text style={{ color: C.blue, fontWeight: '800' }}>Edit profile</Text></Pressable>}
        </View>
      </View>

      {!auth?.session && (
        <Card style={{ marginBottom: 12, borderWidth: 1.5, borderColor: C.blue }}>
          <Text style={{ fontWeight: '900', fontSize: 16, color: C.text }}>You’re browsing as a guest</Text>
          <Text style={{ color: C.sub, marginTop: 4 }}>Sign in to book lessons, message instructors and keep your training record.</Text>
          <Button title="Sign in or create account" style={{ marginTop: 12 }} onPress={() => nav.push('SignIn')} />
        </Card>
      )}

      {nav.canTeach && (
        <Pressable onPress={() => nav.switchMode(teachingMode ? 'learn' : 'teach')} style={ms.switch} accessibilityRole="button" accessibilityLabel={teachingMode ? 'Switch to flying' : nav.ownerOnly ? 'Switch to my aircraft' : 'Switch to teaching'}>
          <View style={ms.switchIcon}><Icon name={teachingMode ? 'plane' : 'users'} size={20} color={C.blue} /></View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontWeight: '900', color: C.text, fontSize: 15 }}>{teachingMode ? 'Switch to flying' : !auth?.session ? 'Preview teaching mode' : nav.ownerOnly ? 'Switch to my aircraft' : 'Switch to teaching'}</Text>
            <Text style={{ color: C.sub, fontSize: 12, marginTop: 1 }}>
              {teachingMode ? 'Find instructors and planes, your lessons and training record' : pendingTeach ? `${pendingTeach} lesson request${pendingTeach > 1 ? 's' : ''} waiting for you` : nav.ownerOnly ? 'Bookings, maintenance and rental earnings' : 'Your schedule, students and earnings'}
            </Text>
          </View>
          {!teachingMode && pendingTeach > 0 && <View style={ms.count}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{pendingTeach}</Text></View>}
          <Icon name="chevron" size={18} color="#7A889C" />
        </Pressable>
      )}

      {sections.filter((x) => x.show && (x.mode === mode || x.mode === 'any')).map((sec) => (
        <View key={sec.key}>
          <Text style={ms.groupTitle}>{sec.title}</Text>
          <Card style={{ paddingVertical: 2 }}>
            {sec.rows.map((r, i) => <ListRow key={r.title} first={i === 0} icon={r.icon} title={r.title} subtitle={r.subtitle} onPress={() => nav.push(r.go, r.params || {})} />)}
          </Card>
        </View>
      ))}

      {teachingMode && me && (<><Text style={ms.groupTitle}>My CFI profile</Text><CfiCard c={me} nav={nav} /></>)}
      {teachingMode && myPlanes.length > 0 && (<><Text style={ms.groupTitle}>My planes</Text>{myPlanes.map((p) => <PlaneCard key={p.id} p={p} nav={nav} />)}</>)}
      {teachingMode && mySchool && (<><Text style={ms.groupTitle}>My flight school</Text><SchoolCard x={mySchool} nav={nav} /></>)}
      {!teachingMode && favs.length > 0 && (<><Text style={ms.groupTitle}>Saved instructors</Text>{favs.map((c) => <CfiCard key={c.id} c={c} nav={nav} />)}</>)}

      {others.length > 0 && (
        <>
          <Text style={ms.groupTitle}>More ways to use Positive Rate</Text>
          <Card style={{ paddingVertical: 2 }}>
            {others.map((sec, i) => (
              <ListRow key={sec.key} first={i === 0} icon={sec.rows[0].icon} iconColor={C.sub} iconBg="#F1F5F9" title={{ fly: 'Book lessons & rent planes', teach: 'Teach as a CFI', own: 'List your plane', school: 'Run a flight school' }[sec.key]}
                subtitle={sec.rows[0].subtitle} onPress={() => turnOn(sec.key)}
                right={<Text style={{ color: C.blue, fontWeight: '800', fontSize: 13 }}>Turn on</Text>} />
            ))}
          </Card>
        </>
      )}

      {auth?.account?.is_staff && (
        <>
          <Text style={ms.groupTitle}>Positive Rate team</Text>
          <Card style={{ paddingVertical: 2 }}>
            <ListRow first icon="shieldCheck" iconColor="#7C3AED" iconBg="#F3E8FF" title="Verification reviews" subtitle="Approve instructors, planes and insurance" onPress={() => nav.push('StaffReview')} />
          </Card>
        </>
      )}

      <Text style={ms.groupTitle}>Settings</Text>
      <Card style={{ paddingVertical: 2 }}>
        {auth?.session && <ListRow first icon="user" title="Edit profile" subtitle="Name, photo, phone, home airport" onPress={() => nav.push('EditProfile')} />}
        {auth?.session && <ListRow icon="bell" title="Notifications" subtitle={(auth?.account?.notify_off || []).length ? `${auth.account.notify_off.length} type${auth.account.notify_off.length === 1 ? '' : 's'} muted` : 'All on'} onPress={() => nav.push('NotificationSettings')} />}
        <ListRow first={!auth?.session} icon="tag" title="Have a launch code?" subtitle={promos.some((p) => new Date(p.endsAt) > new Date()) ? promos.filter((p) => new Date(p.endsAt) > new Date()).map((p) => p.code).join(' · ') + ' active' : 'Enter it here'} onPress={() => nav.push('PromoCode')} />
        <ListRow icon="help" title="Help & support" subtitle="Common questions, email us, terms and privacy" onPress={() => nav.push('Help')} />
      </Card>

      {auth?.session ? (
        <>
          <Pressable onPress={() => auth.signOut()} style={ms.footBtn} accessibilityRole="button">
            <Text style={{ color: C.red, fontWeight: '800' }}>Sign out</Text>
          </Pressable>
          <Pressable onPress={() => nav.push('DeleteAccount')} style={ms.footBtn} accessibilityRole="button">
            <Text style={{ color: C.sub, fontWeight: '700', fontSize: 13 }}>Delete account</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

// Search filters still use broad times of day; work them out from the hours.
function timeOfDayFrom(weekly) {
  const all = DAY_KEYS.flatMap((k) => weekly[k] || []);
  const out = [];
  if (all.some((r) => r[0] < 540)) out.push('Early AM');
  if (all.some((r) => r[0] < 1020 && r[1] > 540)) out.push('Daytime');
  if (all.some((r) => r[1] > 1020)) out.push('Evenings');
  const weekend = ['sat', 'sun'].some((k) => (weekly[k] || []).length), weekday = ['mon', 'tue', 'wed', 'thu', 'fri'].some((k) => (weekly[k] || []).length);
  if (weekend && !weekday) return ['Weekends only'];
  return out.length ? out : ['Daytime'];
}

export function CfiForm({ nav, params }) {
  const { getCfi, planes: allPlanes, saveCfi, affiliationFor, getSchool, refreshListings } = useStore();
  const auth = useAuth();
  const uid = auth?.session?.user?.id || null;
  // Signed in: the profile is saved to Positive Rate and can only list live planes.
  const planes = uid ? allPlanes.filter((p) => p.live) : allPlanes;
  const existing = params?.id ? getCfi(params.id) : uid ? getCfi(uid) : null;
  const [publish, setPublish] = useState(existing ? existing.published !== false : true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const e = existing || {};
  const [f, setF] = useState({
    name: e.name || '',
    photo: e.photo || null,
    homeAirport: e.homeAirport ? [e.homeAirport] : ['KPIE'],
    alsoTeachesAt: e.alsoTeachesAt || [],
    certs: e.certs || ['CFI'],
    trainingTypes: e.trainingTypes || ['Part 61'],
    flightRate: e.flightRate ? String(e.flightRate) : '',
    groundRate: e.groundRate ? String(e.groundRate) : '',
    discoveryFlight: e.discoveryFlight ? String(e.discoveryFlight) : '',
    totalHours: e.totalHours ? String(e.totalHours) : '',
    dualGiven: e.dualGiven ? String(e.dualGiven) : '',
    yearsInstructing: e.yearsInstructing != null ? String(e.yearsInstructing) : '',
    passRate: e.passRate != null ? String(e.passRate) : '',
    checkridesSent: e.checkridesSent != null ? String(e.checkridesSent) : '',
    studentsSoloed: e.studentsSoloed != null ? String(e.studentsSoloed) : '',
    specialties: e.specialties || [],
    availability: e.availability || [],
    timeOfDay: e.timeOfDay || [],
    bio: e.bio || '',
    teachingStyle: e.teachingStyle || '',
    background: e.background || '',
    languages: e.languages ? e.languages.join(', ') : 'English',
    teachesInYourPlane: e.teachesInYourPlane ?? true,
    insured: e.insured ?? true,
    aircraftIds: e.aircraftIds || [],
    packages: (e.packages || []).map((x) => ({ name: x.name || '', price: x.price ? String(x.price) : '', includes: x.includes || '' })),
  });
  const [step, setStep] = useState(0);
  const [q, setQ] = useState('');
  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));
  // Weekly hours (e.g. Mon 7 AM – 7 PM), the same calendar students book against.
  const [sched, setSched] = useState(() => normalizeSchedule(null, e.availability?.length ? e.availability : undefined));
  const [hoursLoaded, setHoursLoaded] = useState(!uid || !existing?.live);
  useEffect(() => {
    if (!uid || !existing?.live) return;
    fetchSchedule(uid, existing.availability).then(({ schedule }) => setSched(schedule)).catch(() => {}).finally(() => setHoursLoaded(true));
  }, [uid, existing?.live]);
  const workDays = workingDays(sched);
  const valid = f.name.trim() && num(f.flightRate) > 0 && workDays.length > 0 && hoursLoaded && !!f.photo;
  const stepOk = [!!(f.name.trim() && f.photo && workDays.length > 0 && hoursLoaded), num(f.flightRate) > 0, true, true];
  const stepNeed = [!f.photo ? 'Add a profile photo' : !f.name.trim() ? 'Add your name' : 'Turn on at least one day', 'Add your flight rate', '', ''];

  const save = async () => {
    const id = uid || existing?.id || 'me-cfi';
    const initials = f.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    const cfi = {
      id,
      name: f.name.trim(),
      initials,
      photo: f.photo,
      schoolId: existing?.schoolId || null,
      color: existing?.color || PALETTE[0],
      homeAirport: f.homeAirport[0],
      alsoTeachesAt: f.alsoTeachesAt.filter((a) => a !== f.homeAirport[0]),
      certs: f.certs,
      trainingTypes: f.trainingTypes,
      flightRate: existing && affiliationFor(existing.id)?.model === 'employee' ? existing.flightRate : num(f.flightRate),
      groundRate: num(f.groundRate),
      discoveryFlight: num(f.discoveryFlight),
      totalHours: num(f.totalHours),
      dualGiven: num(f.dualGiven),
      yearsInstructing: num(f.yearsInstructing),
      passRate: num(f.passRate),
      checkridesSent: num(f.checkridesSent),
      studentsSoloed: num(f.studentsSoloed),
      specialties: f.specialties,
      availability: workDays,
      timeOfDay: timeOfDayFrom(sched.weekly),
      bio: f.bio,
      teachingStyle: f.teachingStyle,
      background: f.background,
      languages: f.languages.split(',').map((x) => x.trim()).filter(Boolean),
      responseTime: 'New on Positive Rate',
      teachesInYourPlane: f.teachesInYourPlane,
      insured: f.insured,
      verified: false,
      rating: existing?.rating || 5.0,
      reviewCount: existing?.reviewCount || 0,
      reviews: existing?.reviews || [],
      aircraftIds: f.aircraftIds,
      packages: f.packages.filter((x) => x.name.trim() && num(x.price) > 0).map((x) => ({ name: x.name.trim(), price: num(x.price), includes: x.includes.trim() })),
    };
    if (!uid) { saveCfi(cfi); nav.replace('Cfi', { id }); return; }
    setErr(''); setBusy(true);
    try {
      await saveCfiProfile(uid, cfi, { publish });
      await saveSchedule(uid, sched);
      await refreshListings();
      nav.replace(existing?.verified ? 'Cfi' : 'GetVerified', existing?.verified ? { id } : {});
    } catch (e) { setErr(e.message || 'Couldn’t save. Try again.'); }
    setBusy(false);
  };

  const STEPS = ['Basics', 'Pricing', 'Experience', 'Planes'];
  const home = f.homeAirport[0];
  const employee = existing && affiliationFor(existing.id)?.model === 'employee';
  const rate = num(f.flightRate);
  const myAirports = [home, ...f.alsoTeachesAt];
  const term = q.trim().toLowerCase();
  const shown = term
    ? planes.filter((p) => `${p.tail} ${p.make} ${p.model}`.toLowerCase().includes(term))
    : planes.filter((p) => myAirports.includes(p.homeAirport) || f.aircraftIds.includes(p.id));
  const setPkg = (i, k) => (v) => set('packages')(f.packages.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={step ? { pop: () => setStep(step - 1) } : nav} title={existing ? 'Edit instructor profile' : 'Instructor profile'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150 }} keyboardShouldPersistTaps="handled">
        <Steps labels={STEPS} current={step} />
        <Text style={ms.stepLabel}>Step {step + 1} of 4 · {STEPS[step]}</Text>

        {step === 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Pressable onPress={async () => { const [u] = await pickImages(false); if (u) set('photo')(u); }} accessibilityRole="button" accessibilityLabel={f.photo ? 'Change profile photo' : 'Add profile photo'}>
                {f.photo ? <Avatar photo={f.photo} initials="" color={C.navy} size={80} /> : <View style={ms.photoSlot}><Icon name="camera" size={26} color={C.navy} /></View>}
              </Pressable>
              <View style={{ marginLeft: 14, flex: 1 }}>
                <Text style={{ fontWeight: '800', color: C.text }}>Profile photo {f.photo ? '✓' : '(required)'}</Text>
                <Text style={ms.hint}>Students book people they can picture. A clear, friendly headshot works best.</Text>
                <Pressable onPress={async () => { const [u] = await pickImages(false); if (u) set('photo')(u); }} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityRole="button">
                  <Text style={{ color: C.blue, fontWeight: '800' }}>{f.photo ? 'Change photo' : 'Add photo'}</Text>
                </Pressable>
              </View>
            </View>
            <Field label="Full name" value={f.name} onChangeText={set('name')} placeholder="e.g. Alex Rivera" />
            <Text style={ms.fieldLabel}>Home airport</Text>
            <View style={ms.wrapRow}>{AIRPORTS.map((a) => <Chip key={a.code} small label={a.code} active={home === a.code} onPress={() => setF((x) => ({ ...x, homeAirport: [a.code], alsoTeachesAt: x.alsoTeachesAt.filter((c) => c !== a.code) }))} />)}</View>
            <Text style={ms.fieldLabel}>Also teaches at (optional)</Text>
            <View style={ms.wrapRow}>{AIRPORTS.filter((a) => a.code !== home).map((a) => { const on = f.alsoTeachesAt.includes(a.code); return <Chip key={a.code} small label={a.code} active={on} onPress={() => set('alsoTeachesAt')(on ? f.alsoTeachesAt.filter((c) => c !== a.code) : [...f.alsoTeachesAt, a.code])} />; })}</View>
            <Text style={ms.fieldLabel}>Instructor certificates</Text>
            <View style={ms.wrapRow}>{CERTS.map((c) => { const on = f.certs.includes(c); return <Chip key={c} small label={c} active={on} onPress={() => set('certs')(on ? f.certs.filter((x) => x !== c) : [...f.certs, c])} />; })}</View>
            <Text style={ms.fieldLabel}>Training type</Text>
            <View style={ms.wrapRow}>{['Part 61', 'Part 141'].map((c) => { const on = f.trainingTypes.includes(c); return <Chip key={c} small label={c} active={on} onPress={() => set('trainingTypes')(on ? f.trainingTypes.filter((x) => x !== c) : [...f.trainingTypes, c])} />; })}</View>
            <SectionTitle>When you teach</SectionTitle>
            <Text style={[ms.hint, { marginTop: -4, marginBottom: 10 }]}>Students can only request times inside these hours. You can block time off later from Schedule.</Text>
            {hoursLoaded ? <WeeklyHours weekly={sched.weekly} onChange={(weekly) => setSched((x) => ({ ...x, weekly }))} /> : <Text style={ms.hint}>Loading your hours…</Text>}
          </>
        )}

        {step === 1 && (
          <>
            {employee && <Banner tone="gray" title={`Your flight rate is set by ${getSchool(affiliationFor(existing.id).schoolId)?.name}`}>They employ you, so they set the rate students pay.</Banner>}
            <View style={ms.two}>
              <View style={{ flex: 1, marginRight: 8 }}><Field label="Flight rate (per hr)" prefix="$" keyboardType="numeric" value={f.flightRate} onChangeText={set('flightRate')} placeholder="e.g. 70" /></View>
              <View style={{ flex: 1 }}><Field label="Ground rate (per hr)" prefix="$" keyboardType="numeric" value={f.groundRate} onChangeText={set('groundRate')} placeholder="e.g. 50" /></View>
            </View>
            <Field label="Discovery flight, plane included (optional)" prefix="$" keyboardType="numeric" value={f.discoveryFlight} onChangeText={set('discoveryFlight')} placeholder="e.g. 149" />
            {rate > 0 && (
              <Card style={{ backgroundColor: C.sky, borderColor: C.sky }}>
                <Text style={ms.kicker}>What students see</Text>
                <Text style={{ fontWeight: '900', color: C.text, fontSize: 18 }}>{money(rate)}/hr flight{num(f.groundRate) ? ` · ${money(num(f.groundRate))}/hr ground` : ''}</Text>
                <Text style={[ms.hint, { marginTop: 4, marginBottom: 0 }]}>You keep your full rate from repeat students. On a new student’s first lesson Positive Rate keeps 5% ({money2(rate * 0.05)} per flight hour). Students pay a separate $10 booking fee.</Text>
              </Card>
            )}
            <SectionTitle>Packages (optional)</SectionTitle>
            {f.packages.map((x, i) => (
              <Card key={i}>
                <Field label="Package name" value={x.name} onChangeText={setPkg(i, 'name')} placeholder="e.g. Instrument rating block" />
                <View style={ms.two}>
                  <View style={{ flex: 1, marginRight: 8 }}><Field label="Price" prefix="$" keyboardType="numeric" value={x.price} onChangeText={setPkg(i, 'price')} placeholder="e.g. 2950" /></View>
                  <View style={{ flex: 1.4 }}><Field label="Includes" value={x.includes} onChangeText={setPkg(i, 'includes')} placeholder="e.g. 40 hrs dual + ground" /></View>
                </View>
                <Pressable onPress={() => set('packages')(f.packages.filter((_, j) => j !== i))} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityRole="button"><Text style={{ color: C.red, fontWeight: '700' }}>Remove package</Text></Pressable>
              </Card>
            ))}
            <Button title="Add a package" icon="plus" variant="outline" onPress={() => set('packages')([...f.packages, { name: '', price: '', includes: '' }])} />
            <View style={{ height: 8 }} />
            <Toggle label="I carry CFI / non-owner insurance" hint="Verification will ask for the policy." value={f.insured} onValueChange={set('insured')} />
          </>
        )}

        {step === 2 && (
          <>
            <Banner tone="amber" title="Shown as self-reported">These numbers appear on your profile marked with *. Upload your logbook during verification to show “Hours verified”.</Banner>
            <View style={ms.two}>
              <View style={{ flex: 1, marginRight: 8 }}><Field label="Total hours" keyboardType="numeric" value={f.totalHours} onChangeText={set('totalHours')} placeholder="e.g. 1200" /></View>
              <View style={{ flex: 1 }}><Field label="Dual given" keyboardType="numeric" value={f.dualGiven} onChangeText={set('dualGiven')} placeholder="e.g. 400" /></View>
            </View>
            <View style={ms.two}>
              <View style={{ flex: 1, marginRight: 8 }}><Field label="Years instructing" keyboardType="numeric" value={f.yearsInstructing} onChangeText={set('yearsInstructing')} placeholder="e.g. 2" /></View>
              <View style={{ flex: 1 }}><Field label="First-time pass rate %" keyboardType="numeric" value={f.passRate} onChangeText={set('passRate')} placeholder="e.g. 90" /></View>
            </View>
            <View style={ms.two}>
              <View style={{ flex: 1, marginRight: 8 }}><Field label="Checkrides sent" keyboardType="numeric" value={f.checkridesSent} onChangeText={set('checkridesSent')} placeholder="e.g. 12" /></View>
              <View style={{ flex: 1 }}><Field label="Students soloed" keyboardType="numeric" value={f.studentsSoloed} onChangeText={set('studentsSoloed')} placeholder="e.g. 15" /></View>
            </View>
            <SectionTitle>What you teach</SectionTitle>
            <View style={ms.wrapRow}>{SPECIALTIES.map((c) => { const on = f.specialties.includes(c); return <Chip key={c} small label={c} active={on} onPress={() => set('specialties')(on ? f.specialties.filter((x) => x !== c) : [...f.specialties, c])} />; })}</View>
            <Text style={ms.fieldLabel}>Teaching style</Text>
            <View style={ms.wrapRow}>{['Structured', 'Laid-back', 'Scenario-based', 'Patient', 'Fast-paced', 'Checkride-focused'].map((c) => { const on = f.teachingStyle.split(', ').includes(c); const cur = f.teachingStyle ? f.teachingStyle.split(', ').filter(Boolean) : []; return <Chip key={c} small label={c} active={on} onPress={() => set('teachingStyle')((on ? cur.filter((x) => x !== c) : [...cur, c]).join(', '))} />; })}</View>
            <SectionTitle>About you</SectionTitle>
            <Field label={`Short bio (${f.bio.length}/300)`} multiline value={f.bio} onChangeText={(v) => set('bio')(v.slice(0, 300))} placeholder="e.g. What a new student should know about learning with you" />
            <Field label="Aviation background" value={f.background} onChangeText={set('background')} placeholder="e.g. Trained at ATP, building time for the airlines" />
            <Field label="Languages" value={f.languages} onChangeText={set('languages')} placeholder="e.g. English, Spanish" />
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Find a plane" value={q} onChangeText={setQ} placeholder="Search tail number, make or model" autoCapitalize="characters" />
            <Text style={ms.kicker}>{term ? `${shown.length} match${shown.length === 1 ? '' : 'es'}` : `At your airports · selected (${f.aircraftIds.length})`}</Text>
            {shown.length === 0 && <Text style={ms.hint}>{term ? 'No listed plane matches.' : `No planes listed at ${myAirports.join(', ')} yet. Search by tail number.`}</Text>}
            {shown.map((p) => {
              const on = f.aircraftIds.includes(p.id);
              return (
                <Pressable key={p.id} onPress={() => set('aircraftIds')(on ? f.aircraftIds.filter((x) => x !== p.id) : [...f.aircraftIds, p.id])}
                  style={[ms.planeRow, on && { borderColor: C.navy, backgroundColor: C.sky }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                  <View style={[ms.box, on && { backgroundColor: C.navy, borderColor: C.navy }]}>{on && <Icon name="check" size={14} color="#fff" strokeWidth={3} />}</View>
                  <PlaneImage plane={p} size={44} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontWeight: '800', color: C.text }}>{p.tail} · {p.make} {p.model}</Text>
                    <Text style={{ color: C.sub, fontSize: 12 }}>{p.homeAirport} · {rate ? `${money(p.wetRate + rate)}/hr with you` : `${money(p.wetRate)}/hr plane`}</Text>
                  </View>
                </Pressable>
              );
            })}
            <Pressable onPress={() => nav.push('PlaneForm')} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityRole="button">
              <Text style={{ color: C.blue, fontWeight: '800' }}>My plane isn’t listed — list it</Text>
            </Pressable>
            <Toggle label="I’ll teach in a student’s own plane" value={f.teachesInYourPlane} onValueChange={set('teachesInYourPlane')} />
            {uid && <Toggle label="Show my profile to students" value={publish} onValueChange={setPublish} hint={publish ? 'Students can book you once your certificate is verified (usually within a day).' : 'Saved as a draft. Only you can see it.'} />}
          </>
        )}
        {!!err && <Text style={{ color: C.red, fontWeight: '600', marginTop: 10 }} accessibilityLiveRegion="polite">{err}</Text>}
      </ScrollView>
      <View style={ms.cta}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row' }}>
            {step > 0 && <Button title="Back" variant="outline" style={{ flex: 1, marginRight: 8 }} onPress={() => setStep(step - 1)} />}
            {step < 3
              ? <Button title={stepOk[step] ? `Next: ${STEPS[step + 1].toLowerCase()}` : stepNeed[step]} disabled={!stepOk[step]} style={{ flex: 1.4 }} onPress={() => setStep(step + 1)} />
              : <Button title={busy ? 'Saving…' : existing ? 'Save profile' : 'Publish profile'} disabled={!valid || busy} style={{ flex: 1.4 }} onPress={save} />}
          </View>
          {step === 3 && !existing?.verified && <Text style={[ms.hint, { textAlign: 'center', marginTop: 6, marginBottom: 0 }]}>Next you’ll verify your certificate. Students can book you once it’s checked.</Text>}
        </View>
      </View>
    </View>
  );
}

const EQUIPMENT = ['GPS (IFR)', 'ADS-B Out', 'ADS-B In', 'Autopilot', 'Garmin G1000', 'Garmin G3X', 'GTN 650/750', 'GNS 430W', 'Dual G5', 'Aspen PFD', 'Bluetooth audio'];
const PLANE_STEPS = ['Photos', 'Aircraft', 'Rates', 'Rules'];

// List a plane in four short steps: photos, aircraft, rates (and who may teach in it), renter rules.
export function PlaneForm({ nav }) {
  const { addPlane, myCfiId, getCfi, saveCfi, planes, refreshListings } = useStore();
  const me = getCfi(myCfiId);
  const auth = useAuth();
  const uid = auth?.session?.user?.id || null;
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [f, setF] = useState({
    tail: '', year: '', make: '', model: '', category: 'Single', homeAirport: 'KPIE', panel: null, hobbs: '',
    wetRate: '', dryRate: '', avionics: [], ifr: true, seats: '4', engineSMOH: '', tbo: '2000',
    ownerName: '', ownerType: 'Private owner', insuranceMinHours: '0', minTypeHours: '0', minSoloRating: 'student',
    soloRental: true, lessons: true, approved: me ? [{ id: me.id, name: me.name, certs: me.certs, verified: me.verified }] : [],
    checkout: true, cfiCheckouts: true, checkoutCfiIds: me ? [me.id] : [], overnight: false, recentFlightDays: 0, notes: '', photos: [],
  });
  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));
  const wet = num(f.wetRate);
  const stepOk = [true, !!(f.tail.trim() && f.make.trim() && f.model.trim() && f.panel), wet > 0 && (f.lessons || f.soloRental), true];

  // Approved instructors, found by the email on their Positive Rate account.
  const [cfiEmail, setCfiEmail] = useState('');
  const [found, setFound] = useState(undefined);
  useEffect(() => {
    setFound(undefined);
    const e = cfiEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || !uid) return undefined;
    let live = true;
    const t = setTimeout(() => { findCfiByEmail(e).then((r) => live && setFound(r)).catch(() => live && setFound(null)); }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [cfiEmail, uid]);
  const addApproved = (c) => { setF((x) => ({ ...x, approved: [...x.approved.filter((y) => y.id !== c.id), c], checkoutCfiIds: x.cfiCheckouts ? [...new Set([...x.checkoutCfiIds, c.id])] : x.checkoutCfiIds })); setCfiEmail(''); setFound(undefined); };
  const removeApproved = (id) => setF((x) => ({ ...x, approved: x.approved.filter((y) => y.id !== id), checkoutCfiIds: x.checkoutCfiIds.filter((y) => y !== id) }));

  const save = async () => {
    const id = 'p' + Date.now();
    const checkoutBy = !f.checkout ? 'owner' : f.cfiCheckouts ? 'either' : 'owner';
    const plane = {
      id, art: f.category === 'Multi' ? 'twin' : 'highwing', photos: f.photos, reviews: [],
      tail: f.tail.trim().toUpperCase(), year: num(f.year) || 2000, make: f.make.trim(), model: f.model.trim(),
      category: f.category, homeAirport: f.homeAirport, color: PALETTE[planes.length % PALETTE.length],
      wetRate: wet, dryRate: num(f.dryRate) || Math.round(wet * 0.78), blockRate: wet,
      panel: f.panel, avionics: [...(f.panel === 'glass' ? ['Glass panel'] : ['Steam gauges']), ...f.avionics], ifr: f.ifr,
      seats: num(f.seats) || 4, engineSMOH: num(f.engineSMOH), tbo: num(f.tbo) || 2000, hobbsTotal: num(f.hobbs) || undefined,
      ownerName: f.ownerName || 'You', ownerType: f.ownerType, insuranceMinHours: num(f.insuranceMinHours), minTypeHours: num(f.minTypeHours), minSoloRating: f.minSoloRating,
      lessons: f.lessons, approvedCfiIds: f.lessons ? f.approved.map((c) => c.id) : [],
      soloRental: f.soloRental, checkoutBy, checkoutCfiIds: f.cfiCheckouts ? f.checkoutCfiIds : [],
      checkoutRequired: !f.checkout ? 'No checkout required' : checkoutBy === 'owner' ? 'Checkout flight with the owner' : 'Checkout with the owner or an approved instructor',
      recentFlightDays: f.soloRental ? f.recentFlightDays : 0, overnight: f.overnight, rating: 5.0, reviewCount: 0, notes: f.notes,
    };
    if (!uid) {
      addPlane(plane);
      if (me && f.approved.some((c) => c.id === me.id)) saveCfi({ ...me, aircraftIds: [...me.aircraftIds, id] });
      nav.replace('Plane', { id });
      return;
    }
    setErr(''); setBusy(true);
    try {
      const newId = await savePlaneListing(uid, plane, { publish: true, addToMyCfiProfile: !!me && f.approved.some((c) => c.id === me.id) });
      await refreshListings();
      nav.replace('GetVerified');
    } catch (e) { setErr(e.message || 'Couldn’t save. Try again.'); }
    setBusy(false);
  };

  const fee = Math.round(wet * 1.5 * 0.08 * 100) / 100;
  const nearby = planes.filter((p) => p.homeAirport === f.homeAirport && p.make.toLowerCase() === f.make.trim().toLowerCase() && p.wetRate > 0);
  const range = nearby.length ? [Math.min(...nearby.map((p) => p.wetRate)), Math.max(...nearby.map((p) => p.wetRate))] : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={step ? { pop: () => setStep(step - 1) } : nav} title="List a plane" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Steps labels={PLANE_STEPS} current={step} />
        <Text style={ms.stepLabel}>Step {step + 1} of 4 · {PLANE_STEPS[step]}</Text>

        {step === 0 && (
          <>
            <Text style={ms.hint}>Renters judge a plane by its photos. Add the exterior, panel, interior and seats. The first photo is the cover.</Text>
            {f.photos.length > 0 && <PhotoStrip photos={f.photos} onRemove={(k) => set('photos')(f.photos.filter((_, i) => i !== k))} />}
            <Button title={f.photos.length ? `Add more photos (${f.photos.length} added)` : 'Add photos'} icon="camera" variant="outline" onPress={async () => { const u = await pickImages(true); if (u.length) set('photos')([...f.photos, ...u]); }} />
            {f.photos.length > 0 && f.photos.length < 4 && <Text style={[ms.hint, { marginTop: 8 }]}>Listings with 4 or more photos get booked far more often.</Text>}
          </>
        )}

        {step === 1 && (
          <>
            <View style={ms.two}>
              <View style={{ flex: 1, marginRight: 8 }}><Field label="Tail number" value={f.tail} onChangeText={set('tail')} placeholder="e.g. N12345" autoCapitalize="characters" /></View>
              <View style={{ flex: 1 }}><Field label="Year" keyboardType="numeric" value={f.year} onChangeText={set('year')} placeholder="e.g. 1979" /></View>
            </View>
            <View style={ms.two}>
              <View style={{ flex: 1, marginRight: 8 }}><Field label="Make" value={f.make} onChangeText={set('make')} placeholder="e.g. Cessna" /></View>
              <View style={{ flex: 1 }}><Field label="Model" value={f.model} onChangeText={set('model')} placeholder="e.g. 172N Skyhawk" /></View>
            </View>
            <Text style={ms.fieldLabel}>Engines</Text>
            <View style={ms.wrapRow}>{[['Single', 'Single-engine'], ['Multi', 'Twin']].map(([k, l]) => <Chip key={k} small label={l} active={f.category === k} onPress={() => set('category')(k)} />)}</View>
            <Text style={ms.fieldLabel}>Home airport</Text>
            <View style={ms.wrapRow}>{AIRPORTS.map((a) => <Chip key={a.code} small label={a.code} active={f.homeAirport === a.code} onPress={() => set('homeAirport')(a.code)} />)}</View>

            <SectionTitle>Avionics</SectionTitle>
            <Text style={ms.fieldLabel}>Panel</Text>
            <View style={{ flexDirection: 'row', marginBottom: 12 }} accessibilityRole="radiogroup">
              {[['sixpack', 'Six-pack (steam gauges)'], ['glass', 'Glass panel']].map(([k, l], i) => (
                <Pressable key={k} onPress={() => set('panel')(k)} style={[ms.panelBtn, i === 0 && { marginRight: 8 }, f.panel === k && ms.panelOn]} accessibilityRole="radio" accessibilityState={{ checked: f.panel === k }}>
                  <Text style={{ fontWeight: '800', color: f.panel === k ? '#fff' : C.text, textAlign: 'center' }}>{f.panel === k ? '✓ ' : ''}{l}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={ms.fieldLabel}>Equipment</Text>
            <View style={ms.wrapRow}>{EQUIPMENT.map((e) => <Chip key={e} small label={e} active={f.avionics.includes(e)} onPress={() => set('avionics')(f.avionics.includes(e) ? f.avionics.filter((x) => x !== e) : [...f.avionics, e])} />)}</View>
            <View style={ms.two}>
              <View style={{ flex: 1, marginRight: 8 }}><Field label="Hobbs now" keyboardType="decimal-pad" value={f.hobbs} onChangeText={set('hobbs')} placeholder="e.g. 4521.3" /></View>
              <View style={{ flex: 1 }}><Field label="Engine SMOH (hrs)" keyboardType="numeric" value={f.engineSMOH} onChangeText={set('engineSMOH')} placeholder="e.g. 1240" /></View>
            </View>
            <Toggle label="IFR certified" value={f.ifr} onValueChange={set('ifr')} />
          </>
        )}

        {step === 2 && (
          <>
            <View style={ms.two}>
              <View style={{ flex: 1, marginRight: 8 }}><Field label="Wet rate (per Hobbs hr, fuel incl.)" prefix="$" keyboardType="numeric" value={f.wetRate} onChangeText={set('wetRate')} placeholder="e.g. 150" /></View>
              <View style={{ flex: 1 }}><Field label="Dry rate (per Hobbs hr)" prefix="$" keyboardType="numeric" value={f.dryRate} onChangeText={set('dryRate')} placeholder="e.g. 115" /></View>
            </View>
            <Toggle label="Available for lessons with an instructor" value={f.lessons} onValueChange={set('lessons')} />
            {f.lessons && (
              <Card>
                <Text style={{ fontWeight: '800', color: C.text }}>Approved instructors</Text>
                <Text style={[ms.hint, { marginTop: 2 }]}>Only these instructors can book lessons in your plane. Add them by the email on their Positive Rate account.</Text>
                <Field label="Instructor’s email" value={cfiEmail} onChangeText={setCfiEmail} placeholder="e.g. instructor@email.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                {found && (
                  <View style={ms.found}>
                    <Avatar initials={(found.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2)} color={C.navy} photo={found.photo} size={40} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontWeight: '800', color: C.text }}>{found.name}</Text>
                      <Text style={{ color: found.verified ? C.green : C.sub, fontSize: 12, fontWeight: '700' }}>{found.verified ? '✓ Verified ' : ''}{found.certs.join(', ')}{found.homeAirport ? ` · ${found.homeAirport}` : ''}</Text>
                    </View>
                    <Button title="Add" small variant="navy" style={{ paddingHorizontal: 16 }} onPress={() => addApproved(found)} />
                  </View>
                )}
                {found === null && <Text style={[ms.hint, { marginBottom: 6 }]}>No instructor uses that email yet. Ask them to create an instructor profile on Positive Rate, then add them here (or later from your plane’s People screen).</Text>}
                {!uid && cfiEmail.includes('@') && <Text style={[ms.hint, { marginBottom: 6 }]}>Sign in to look up instructors.</Text>}
                {f.approved.map((c) => (
                  <View key={c.id} style={ms.approvedRow}>
                    <Text style={{ flex: 1, fontWeight: '700', color: C.text }}>{c.name}{me && c.id === me.id ? ' (you)' : ''}<Text style={{ color: C.sub, fontWeight: '400' }}>{c.certs?.length ? ` · ${c.certs.join(', ')}` : ''}</Text></Text>
                    <Pressable onPress={() => removeApproved(c.id)} style={ms.removeBtn} accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`}><Text style={{ color: C.red, fontWeight: '700' }}>Remove</Text></Pressable>
                  </View>
                ))}
                {f.approved.length === 0 && <Text style={ms.hint}>No one approved yet, so any verified instructor can book lessons in your plane.</Text>}
              </Card>
            )}
            <Toggle label="Available for solo rental" hint="After a checkout" value={f.soloRental} onValueChange={set('soloRental')} />
            {wet > 0 && (
              <Card style={{ backgroundColor: C.sky, borderColor: C.sky }}>
                <Text style={ms.kicker}>What you earn</Text>
                <View style={ms.earnRow}><Text style={ms.earnL}>1.5 hr wet rental</Text><Text style={ms.earnV}>{money2(wet * 1.5)}</Text></View>
                <View style={ms.earnRow}><Text style={ms.earnL}>Positive Rate fee (8%)</Text><Text style={ms.earnV}>−{money2(fee)}</Text></View>
                <View style={ms.earnRow}><Text style={[ms.earnL, { fontWeight: '800', color: C.text }]}>You receive</Text><Text style={[ms.earnV, { fontWeight: '900' }]}>{money2(wet * 1.5 - fee)}</Text></View>
              </Card>
            )}
            {range && <Text style={ms.hint}>Similar {f.make.trim()}s near {f.homeAirport} rent for {money(range[0])}{range[1] !== range[0] ? `–${money(range[1])}` : ''}/hr wet.</Text>}
          </>
        )}

        {step === 3 && (
          <>
            {f.soloRental ? (
              <>
                <SectionTitle>Who can rent solo</SectionTitle>
                <View style={ms.wrapRow}>
                  {[['student', 'Student pilots (with endorsement)'], ['private', 'Private and up']].map(([k, l]) => <Chip key={k} small label={l} active={f.minSoloRating === k} onPress={() => set('minSoloRating')(k)} />)}
                </View>
                <View style={ms.two}>
                  <View style={{ flex: 1, marginRight: 8 }}><Field label="Minimum total time (hrs)" keyboardType="numeric" value={f.insuranceMinHours} onChangeText={set('insuranceMinHours')} /></View>
                  <View style={{ flex: 1 }}><Field label="Minimum in type (hrs)" keyboardType="numeric" value={f.minTypeHours} onChangeText={set('minTypeHours')} /></View>
                </View>
                <Toggle label="Require a checkout flight" value={f.checkout} onValueChange={set('checkout')} />
                {f.checkout && (
                  <>
                    <Toggle label="Approved instructors can do checkouts" hint="Off means you do every checkout yourself" value={f.cfiCheckouts} onValueChange={set('cfiCheckouts')} />
                    {f.cfiCheckouts && (
                      <Card style={{ paddingVertical: 6 }}>
                        <Text style={ms.kicker}>From your approved instructors</Text>
                        {f.approved.length === 0 && <Text style={ms.hint}>Add instructors in step 3 (Rates) first.</Text>}
                        {f.approved.map((c, i) => {
                          const on = f.checkoutCfiIds.includes(c.id);
                          return (
                            <Pressable key={c.id} onPress={() => set('checkoutCfiIds')(on ? f.checkoutCfiIds.filter((x) => x !== c.id) : [...f.checkoutCfiIds, c.id])} style={[ms.checkRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.line }]}
                              accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                              <View style={[ms.box, on && { backgroundColor: C.navy, borderColor: C.navy }]}>{on && <Icon name="check" size={14} color="#fff" strokeWidth={3} />}</View>
                              <Text style={{ flex: 1, fontWeight: '700', color: C.text }}>{c.name}</Text>
                            </Pressable>
                          );
                        })}
                      </Card>
                    )}
                  </>
                )}
                <Toggle label="Allow overnight trips" value={f.overnight} onValueChange={set('overnight')} />
                <Text style={ms.fieldLabel}>Require a recent flight to rent solo?</Text>
                <View style={ms.wrapRow}>{RECENT_FLIGHT_OPTIONS.map((d) => <Chip key={d} small label={d ? `Within ${d} days` : 'No'} active={f.recentFlightDays === d} onPress={() => set('recentFlightDays')(d)} />)}</View>
              </>
            ) : <Text style={ms.hint}>Solo rental is off, so renters always fly with an instructor.</Text>}
            <Field label="Rules for renters (optional)" multiline value={f.notes} onChangeText={set('notes')} placeholder="e.g. Fuel to tabs on return. No grass strips." />
            <Field label="Listed by" value={f.ownerName} onChangeText={set('ownerName')} placeholder="Your name, club or company" />
          </>
        )}
        {!!err && <Text style={{ color: C.red, fontWeight: '600', marginTop: 10 }} accessibilityLiveRegion="polite">{err}</Text>}
      </ScrollView>
      <View style={ms.cta}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row' }}>
            {step > 0 && <Button title="Back" variant="outline" style={{ flex: 1, marginRight: 8 }} onPress={() => setStep(step - 1)} />}
            {step < 3
              ? <Button title={stepOk[step] ? `Next: ${PLANE_STEPS[step + 1].toLowerCase()}` : step === 1 ? 'Fill in the missing fields' : 'Add a wet rate'} disabled={!stepOk[step]} style={{ flex: 1.4 }} onPress={() => setStep(step + 1)} />
              : <Button title={busy ? 'Saving…' : 'Publish listing'} disabled={busy || !stepOk[1] || !stepOk[2]} style={{ flex: 1.4 }} onPress={save} />}
          </View>
          {step === 3 && <Text style={[ms.hint, { textAlign: 'center', marginTop: 6, marginBottom: 0 }]}>Goes live once we verify the registration and insurance. Then log the annual and 100-hour in Maintenance.</Text>}
        </View>
      </View>
    </View>
  );
}

export function SchoolForm({ nav, params }) {
  const { getSchool, cfis, planes, saveSchool, cfisForSchool, planesForSchool } = useStore();
  const ex = params?.id ? getSchool(params.id) : null;
  const e = ex || {};
  const [f, setF] = useState({
    name: e.name || '',
    homeAirport: e.homeAirport ? [e.homeAirport] : ['KPIE'],
    trainingTypes: e.trainingTypes || ['Part 61'],
    about: e.about || '',
    phone: e.phone || '',
    website: e.website || '',
    founded: e.founded ? String(e.founded) : '',
    vaApproved: e.vaApproved || false,
    financing: e.financing || false,
    programs: e.programs && e.programs.length ? e.programs.map((p) => ({ ...p, price: String(p.price) })) : [{ name: '', price: '', includes: '' }],
    cfiIds: ex ? cfisForSchool(ex.id).map((c) => c.id) : [],
    planeIds: ex ? planesForSchool(ex.id).map((p) => p.id) : [],
    logo: e.logo || null,
  });
  const [cq, setCq] = useState('');
  const [pq, setPq] = useState('');
  const match = (txt, q) => q.trim().length >= 2 && txt.toLowerCase().includes(q.trim().toLowerCase());
  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));
  const setProg = (i, k, v) => set('programs')(f.programs.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const toggleId = (k, id) => set(k)(f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id]);
  const valid = f.name.trim().length > 1;

  const save = () => {
    const id = ex?.id || 'me-school';
    const initials = f.name.trim().split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    saveSchool(
      {
        id,
        name: f.name.trim(),
        initials,
        logo: f.logo,
        color: ex?.color || '#0B1F3A',
        homeAirport: f.homeAirport[0],
        trainingTypes: f.trainingTypes,
        founded: num(f.founded) || null,
        vaApproved: f.vaApproved,
        financing: f.financing,
        phone: f.phone,
        website: f.website,
        about: f.about,
        programs: f.programs.filter((p) => p.name && num(p.price)).map((p) => ({ name: p.name, price: num(p.price), includes: p.includes })),
        rating: ex?.rating || 0,
        reviewCount: ex?.reviewCount || 0,
        reviews: ex?.reviews || [],
      },
      f.cfiIds,
      f.planeIds
    );
    nav.replace('School', { id });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={ex ? 'Edit school' : 'Create school profile'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
        <SectionTitle>Company</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Pressable onPress={async () => { const [u] = await pickImages(false); if (u) set('logo')(u); }} accessibilityRole="button" accessibilityLabel={f.logo ? 'Change logo' : 'Add logo'}>
            {f.logo ? <Avatar photo={f.logo} initials="" color={C.navy} size={72} /> : <View style={[ms.photoSlot, { width: 72, height: 72, borderRadius: 16 }]}><Icon name="camera" size={24} color={C.navy} /></View>}
          </Pressable>
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={{ fontWeight: '800', color: C.text }}>School logo</Text>
            <Text style={ms.hint}>Shown on your page and in search. Square works best.</Text>
          </View>
        </View>
        <Field label="School name" value={f.name} onChangeText={set('name')} placeholder="e.g. Pinellas Flight Academy" />
        <MultiSelect single label="Based at" options={AIRPORTS.map((a) => a.code)} selected={f.homeAirport} onChange={set('homeAirport')} />
        <MultiSelect label="Certification" options={['Part 61', 'Part 141']} selected={f.trainingTypes} onChange={set('trainingTypes')} />
        <Field label="About the school" multiline value={f.about} onChangeText={set('about')} placeholder="What makes training here different?" />
        <View style={ms.two}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Phone" value={f.phone} onChangeText={set('phone')} placeholder="e.g. (727) 555-0100" /></View>
          <View style={{ flex: 1 }}><Field label="Founded" keyboardType="numeric" value={f.founded} onChangeText={set('founded')} placeholder="e.g. 2015" /></View>
        </View>
        <Field label="Website" value={f.website} onChangeText={set('website')} placeholder="e.g. yourschool.com" />
        <Toggle label="VA approved (GI Bill)" value={f.vaApproved} onValueChange={set('vaApproved')} />
        <Toggle label="Offers financing" value={f.financing} onValueChange={set('financing')} />

        <SectionTitle>Programs & pricing</SectionTitle>
        {f.programs.map((p, i) => (
          <Card key={i}>
            <Field label="Program" value={p.name} onChangeText={(v) => setProg(i, 'name', v)} placeholder="e.g. Private Pilot" />
            <View style={ms.two}>
              <View style={{ flex: 1, marginRight: 8 }}><Field label="Price" prefix="$" keyboardType="numeric" value={p.price} onChangeText={(v) => setProg(i, 'price', v)} placeholder="e.g. 12900" /></View>
              <View style={{ flex: 1.6 }}><Field label="Includes" value={p.includes} onChangeText={(v) => setProg(i, 'includes', v)} placeholder="e.g. ~50 hrs + ground" /></View>
            </View>
          </Card>
        ))}
        <Pressable onPress={() => set('programs')([...f.programs, { name: '', price: '', includes: '' }])} style={{ paddingVertical: 6 }}>
          <Text style={{ color: C.blue, fontWeight: '800' }}>+ Add another program</Text>
        </Pressable>

        <SectionTitle>Your instructors</SectionTitle>
        <Text style={ms.hint}>Search instructors on Positive Rate. Each gets an invite and must accept before they’re linked to your school.</Text>
        <Field label="Find an instructor" value={cq} onChangeText={setCq} placeholder="Search name or airport" autoCorrect={false} />
        {cfis.filter((c) => f.cfiIds.includes(c.id) || match(`${c.name} ${c.homeAirport}`, cq)).map((c) => {
          const on = f.cfiIds.includes(c.id);
          return (
            <Pressable key={c.id} onPress={() => toggleId('cfiIds', c.id)} style={[ms.planeRow, on && { borderColor: C.navy, backgroundColor: C.sky }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <View style={[ms.box, on && { backgroundColor: C.navy, borderColor: C.navy }]}>{on && <Icon name="check" size={14} color="#fff" strokeWidth={3} />}</View>
              <Avatar initials={c.initials} color={c.color} photo={c.photo} size={40} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontWeight: '700', color: C.text }}>{c.name}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>{c.certs.join(' · ')} · {c.homeAirport}</Text>
              </View>
            </Pressable>
          );
        })}

        <SectionTitle>Your fleet</SectionTitle>
        <Field label="Find a plane" value={pq} onChangeText={setPq} placeholder="Search tail number" autoCapitalize="characters" autoCorrect={false} />
        {planes.filter((p) => f.planeIds.includes(p.id) || match(`${p.tail} ${p.make} ${p.model}`, pq)).map((p) => {
          const on = f.planeIds.includes(p.id);
          return (
            <Pressable key={p.id} onPress={() => toggleId('planeIds', p.id)} style={[ms.planeRow, on && { borderColor: C.navy, backgroundColor: C.sky }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <View style={[ms.box, on && { backgroundColor: C.navy, borderColor: C.navy }]}>{on && <Icon name="check" size={14} color="#fff" strokeWidth={3} />}</View>
              <PlaneImage plane={p} size={44} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontWeight: '700', color: C.text }}>{p.tail} · {p.make} {p.model}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>{p.homeAirport} · {money(p.wetRate)}/hr</Text>
              </View>
            </Pressable>
          );
        })}
        <Pressable onPress={() => nav.push('PlaneForm')} style={{ paddingVertical: 10 }}>
          <Text style={{ color: C.blue, fontWeight: '700' }}>+ List a new aircraft</Text>
        </Pressable>
      </ScrollView>
      <View style={ms.cta}>
        <Button title={valid ? 'Save & preview school' : 'Add your school name'} disabled={!valid} style={{ flex: 1 }} onPress={save} />
      </View>
    </View>
  );
}

const ms = StyleSheet.create({
  footBtn: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 8 },
  photoSlot: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderStyle: 'dashed', borderColor: C.navy, backgroundColor: C.amberBg, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { color: C.sub, fontWeight: '700', marginTop: 8, marginBottom: 12 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  panelBtn: { flex: 1, minHeight: 56, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  panelOn: { backgroundColor: C.navy, borderColor: C.navy },
  found: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, backgroundColor: C.sky, marginBottom: 8 },
  approvedRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderTopWidth: 1, borderTopColor: C.line },
  removeBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingLeft: 12 },
  kicker: { color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6, marginTop: 4 },
  earnRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  earnL: { color: C.body }, earnV: { color: C.text, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 16 },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#DDF3E8', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginTop: 6 },
  walletIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  addFunds: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  groupTitle: { fontSize: 13, fontWeight: '800', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  count: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginRight: 6 },
  switch: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1.5, borderColor: C.sky },
  switchIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' },
  wallet: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy, borderRadius: 18, padding: 16, marginBottom: 12 },
  menu: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#F1F3F7' },
  h1: { fontSize: 28, fontWeight: '900', color: C.text, marginBottom: 14, marginTop: 6 },
  two: { flexDirection: 'row' },
  hint: { color: C.sub, fontSize: 12, marginBottom: 10 },
  fieldLabel: { color: C.sub, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  planeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1.5, borderColor: C.line },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', padding: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row' },
});
