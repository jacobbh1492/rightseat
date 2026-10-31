import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useStore, money } from '../store';
import { money2 } from '../logic';
import { AIRPORTS, CERTS, SPECIALTIES, DAYS, TIMES, AVIONICS, OWNER_TYPES } from '../data';
import { C, Card, Field, MultiSelect, Toggle, Button, SectionTitle, Avatar, pickImages, ListRow, Icon } from '../ui';
import { Header } from './Details';
import { CfiCard, PlaneCard, SchoolCard } from './Explore';
import { PlaneImage, PhotoStrip } from '../art';

const PALETTE = ['#1F6FEB', '#0E9F6E', '#9333EA', '#F59E0B', '#DC2626', '#0891B2', '#DB2777'];
const num = (v) => (v === '' || isNaN(+v) ? 0 : +v);

export function Me({ nav }) {
  const { myCfiId, myPlaneIds, getCfi, getPlane, favorites, mySchoolId, getSchool, available, pilot, profile, setProfile, docs, training, queue, affiliationFor } = useStore();
  const me = getCfi(myCfiId);
  const mySchool = mySchoolId ? getSchool(mySchoolId) : null;
  const myPlanes = myPlaneIds.map(getPlane).filter(Boolean);
  const favs = favorites.map(getCfi).filter(Boolean);
  const roles = profile.roles.length ? profile.roles : ['learn'];
  const myDocs = Object.values(docs.me || {});
  const verified = myDocs.filter((d) => d.status === 'approved').length;
  const pendingQueue = queue.filter((x) => x.state === 'pending').length;

  const sections = [
    {
      key: 'fly', show: roles.includes('learn') || roles.includes('rent'), title: 'Flying',
      rows: [
        { icon: 'shieldCheck', title: 'Verification', subtitle: `${verified} documents verified · ID, certificate, medical`, go: 'Verification' },
        { icon: 'file', title: 'Pilot credentials', subtitle: 'What CFIs and owners see before you fly', go: 'Credentials' },
        { icon: 'book', title: 'Previous experience', subtitle: training.prior ? 'Update your hours and lessons' : 'Trained before? Add it here', go: 'PriorExperience' },
      ],
    },
    {
      key: 'teach', show: roles.includes('teach'), title: 'Teaching',
      rows: [
        { icon: 'user', title: me ? 'Edit CFI profile' : 'Create your CFI profile', subtitle: me ? `${me.name} · ${me.certs.join(', ')}` : 'Hours, pass rate, pricing and planes you fly', go: 'CfiForm', params: { id: myCfiId } },
        { icon: 'chart', title: 'Instructor dashboard', subtitle: 'Earnings, payouts, students, debriefs', go: 'CfiDashboard' },
        { icon: 'school', title: 'Flight school', subtitle: me && affiliationFor(me.id) ? `Teaching for ${getSchool(affiliationFor(me.id).schoolId)?.name}` : 'Join a school or see your arrangement', go: 'JoinSchool', params: { cfiId: myCfiId } },
        { icon: 'dollar', title: 'Plans & fees', subtitle: 'CFI Pro: 0% fees, instant payouts', go: 'Plans' },
      ],
    },
    {
      key: 'own', show: roles.includes('own'), title: 'Aircraft',
      rows: [
        { icon: 'plus', title: 'List a plane', subtitle: 'Photos, rates, renter requirements', go: 'PlaneForm' },
        { icon: 'tool', title: 'Owner tools', subtitle: '100-hr countdown, squawks, schedule', go: 'OwnerDashboard' },
      ],
    },
    {
      key: 'school', show: roles.includes('school'), title: 'Flight school',
      rows: [
        { icon: 'calendar', title: 'School dashboard', subtitle: 'Schedule, instructors, join requests, your share', go: 'SchoolDashboard' },
        { icon: 'school', title: mySchool ? 'Edit school page' : 'Create school page', subtitle: 'Instructors, fleet, programs, reviews', go: 'SchoolForm', params: { id: mySchoolId } },
      ],
    },
  ];
  const others = sections.filter((x) => !x.show);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <View style={ms.profile}>
        <Avatar initials={pilot.name.split(' ').map((w) => w[0]).join('')} color="#0891B2" size={60} photo={me?.photo} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: C.text }}>{pilot.name}</Text>
          <Text style={{ color: C.sub, marginTop: 2 }}>{pilot.certificate} pilot · {profile.airport}</Text>
          <Pressable onPress={() => nav.push('Verification')} style={ms.verifiedPill} accessibilityRole="button">
            <Icon name="shieldCheck" size={14} color={C.green} />
            <Text style={{ color: C.green, fontWeight: '800', fontSize: 12, marginLeft: 4 }}>ID & medical verified</Text>
          </Pressable>
        </View>
      </View>

      <Pressable onPress={() => nav.push('Wallet')} style={ms.wallet} accessibilityRole="button" accessibilityLabel={`Wallet, ${money2(available)} available`}>
        <View style={ms.walletIcon}><Icon name="wallet" size={22} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#9FB3D1', fontWeight: '700', fontSize: 12 }}>Wallet balance</Text>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 24 }}>{money2(available)}</Text>
        </View>
        <View style={ms.addFunds}><Text style={{ color: C.navy, fontWeight: '800', fontSize: 13 }}>Add funds</Text></View>
      </Pressable>

      {sections.filter((x) => x.show).map((sec) => (
        <View key={sec.key}>
          <Text style={ms.groupTitle}>{sec.title}</Text>
          <Card style={{ paddingVertical: 2 }}>
            {sec.rows.map((r, i) => <ListRow key={r.title} first={i === 0} icon={r.icon} title={r.title} subtitle={r.subtitle} onPress={() => nav.push(r.go, r.params || {})} />)}
          </Card>
        </View>
      ))}

      {me && (<><Text style={ms.groupTitle}>My CFI profile</Text><CfiCard c={me} nav={nav} /></>)}
      {myPlanes.length > 0 && (<><Text style={ms.groupTitle}>My planes</Text>{myPlanes.map((p) => <PlaneCard key={p.id} p={p} nav={nav} />)}</>)}
      {mySchool && (<><Text style={ms.groupTitle}>My flight school</Text><SchoolCard x={mySchool} nav={nav} /></>)}
      {favs.length > 0 && (<><Text style={ms.groupTitle}>Saved instructors</Text>{favs.map((c) => <CfiCard key={c.id} c={c} nav={nav} />)}</>)}

      {others.length > 0 && (
        <>
          <Text style={ms.groupTitle}>More ways to use RightSeat</Text>
          <Card style={{ paddingVertical: 2 }}>
            {others.map((sec, i) => (
              <ListRow key={sec.key} first={i === 0} icon={sec.rows[0].icon} iconColor={C.sub} iconBg="#F1F5F9" title={{ fly: 'Book lessons & rent planes', teach: 'Teach as a CFI', own: 'List your plane', school: 'Run a flight school' }[sec.key]}
                subtitle={sec.rows[0].subtitle} onPress={() => setProfile({ roles: [...roles, { fly: 'learn', teach: 'teach', own: 'own', school: 'school' }[sec.key]] })}
                right={<Text style={{ color: C.blue, fontWeight: '800', fontSize: 13 }}>Turn on</Text>} />
            ))}
          </Card>
        </>
      )}

      <Text style={ms.groupTitle}>RightSeat team</Text>
      <Card style={{ paddingVertical: 2 }}>
        <ListRow first icon="file" iconColor="#7C3AED" iconBg="#F3E8FF" title="Document review queue" subtitle="Only what automation couldn’t approve" right={<View style={{ flexDirection: 'row', alignItems: 'center' }}>{pendingQueue ? <View style={ms.count}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{pendingQueue}</Text></View> : null}<Icon name="chevron" size={18} color="#94A3B8" /></View>} onPress={() => nav.push('ReviewQueue')} />
        <ListRow icon="zap" iconColor="#7C3AED" iconBg="#F3E8FF" title="Automation monitor" subtitle="FAA syncs, expirations, auto-pauses" onPress={() => nav.push('Automation')} />
        <ListRow icon="chart" iconColor="#7C3AED" iconBg="#F3E8FF" title="Founder metrics" subtitle="Rebooking rate & leakage watchlist" onPress={() => nav.push('Insights')} />
      </Card>

      <Pressable onPress={() => setProfile({ onboarded: false })} style={{ alignItems: 'center', marginTop: 18 }} accessibilityRole="button">
        <Text style={{ color: C.sub, fontWeight: '700' }}>Replay welcome & setup</Text>
      </Pressable>
    </ScrollView>
  );
}

export function CfiForm({ nav, params }) {
  const { getCfi, planes, saveCfi, affiliationFor, getSchool } = useStore();
  const existing = params?.id ? getCfi(params.id) : null;
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
    pkgName: e.packages?.[0]?.name || '',
    pkgPrice: e.packages?.[0]?.price ? String(e.packages[0].price) : '',
    pkgIncludes: e.packages?.[0]?.includes || '',
  });
  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));
  const valid = f.name.trim() && num(f.flightRate) > 0;

  const save = () => {
    const id = existing?.id || 'me-cfi';
    const initials = f.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    saveCfi({
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
      availability: f.availability,
      timeOfDay: f.timeOfDay,
      bio: f.bio,
      teachingStyle: f.teachingStyle,
      background: f.background,
      languages: f.languages.split(',').map((x) => x.trim()).filter(Boolean),
      responseTime: 'New on RightSeat',
      teachesInYourPlane: f.teachesInYourPlane,
      insured: f.insured,
      verified: false,
      rating: existing?.rating || 5.0,
      reviewCount: existing?.reviewCount || 0,
      reviews: existing?.reviews || [],
      aircraftIds: f.aircraftIds,
      packages: f.pkgName && num(f.pkgPrice) ? [{ name: f.pkgName, price: num(f.pkgPrice), includes: f.pkgIncludes }] : [],
    });
    nav.replace('Cfi', { id });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={existing ? 'Edit CFI profile' : 'Create CFI profile'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
        <SectionTitle>The basics</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Avatar photo={f.photo} initials={(f.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()} color={PALETTE[0]} size={72} />
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Button title={f.photo ? 'Change photo' : 'Add profile photo'} variant="outline" style={{ paddingVertical: 10 }} onPress={async () => { const [u] = await pickImages(false); if (u) set('photo')(u); }} />
            <Text style={ms.hint}>A friendly headshot gets more bookings.</Text>
          </View>
        </View>
        <Field label="Full name" value={f.name} onChangeText={set('name')} placeholder="e.g. Jacob Henderson" />
        <MultiSelect single label="Home airport" options={AIRPORTS.map((a) => a.code)} selected={f.homeAirport} onChange={set('homeAirport')} />
        <MultiSelect label="Also willing to teach at" options={AIRPORTS.map((a) => a.code)} selected={f.alsoTeachesAt} onChange={set('alsoTeachesAt')} />
        <MultiSelect label="Instructor certificates" options={CERTS} selected={f.certs} onChange={set('certs')} />
        <MultiSelect label="Training type" options={['Part 61', 'Part 141']} selected={f.trainingTypes} onChange={set('trainingTypes')} />

        <SectionTitle>Pricing</SectionTitle>
        {existing && affiliationFor(existing.id)?.model === 'employee' && (
          <Text style={[ms.hint, { color: '#7C3AED', fontWeight: '700' }]}>Your flight rate is set by {getSchool(affiliationFor(existing.id).schoolId)?.name} as your employer.</Text>
        )}
        <View style={ms.two}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Flight rate /hr" prefix="$" keyboardType="numeric" value={f.flightRate} onChangeText={set('flightRate')} placeholder="70" /></View>
          <View style={{ flex: 1 }}><Field label="Ground rate /hr" prefix="$" keyboardType="numeric" value={f.groundRate} onChangeText={set('groundRate')} placeholder="50" /></View>
        </View>
        <Field label="Discovery flight price (incl. plane)" prefix="$" keyboardType="numeric" value={f.discoveryFlight} onChangeText={set('discoveryFlight')} placeholder="149" />
        <Text style={ms.hint}>Optional package (e.g. “Private Pilot starter”)</Text>
        <Field label="Package name" value={f.pkgName} onChangeText={set('pkgName')} placeholder="Instrument rating block" />
        <View style={ms.two}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Package price" prefix="$" keyboardType="numeric" value={f.pkgPrice} onChangeText={set('pkgPrice')} placeholder="2950" /></View>
          <View style={{ flex: 1.4 }}><Field label="Includes" value={f.pkgIncludes} onChangeText={set('pkgIncludes')} placeholder="40 hrs dual + ground" /></View>
        </View>

        <SectionTitle>Experience & results</SectionTitle>
        <Text style={ms.hint}>Students compare instructors on these numbers. Be accurate — they’ll show on your profile.</Text>
        <View style={ms.two}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Total hours" keyboardType="numeric" value={f.totalHours} onChangeText={set('totalHours')} placeholder="1200" /></View>
          <View style={{ flex: 1 }}><Field label="Dual given" keyboardType="numeric" value={f.dualGiven} onChangeText={set('dualGiven')} placeholder="400" /></View>
        </View>
        <View style={ms.two}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Years instructing" keyboardType="numeric" value={f.yearsInstructing} onChangeText={set('yearsInstructing')} placeholder="1" /></View>
          <View style={{ flex: 1 }}><Field label="1st-time pass rate %" keyboardType="numeric" value={f.passRate} onChangeText={set('passRate')} placeholder="100" /></View>
        </View>
        <View style={ms.two}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Checkrides sent" keyboardType="numeric" value={f.checkridesSent} onChangeText={set('checkridesSent')} placeholder="0" /></View>
          <View style={{ flex: 1 }}><Field label="Students soloed" keyboardType="numeric" value={f.studentsSoloed} onChangeText={set('studentsSoloed')} placeholder="0" /></View>
        </View>

        <SectionTitle>What you teach</SectionTitle>
        <MultiSelect options={SPECIALTIES} selected={f.specialties} onChange={set('specialties')} />

        <SectionTitle>Planes you fly</SectionTitle>
        <Text style={ms.hint}>Show students the aircraft you teach in. Tap to add.</Text>
        {planes.map((p) => {
          const on = f.aircraftIds.includes(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => set('aircraftIds')(on ? f.aircraftIds.filter((x) => x !== p.id) : [...f.aircraftIds, p.id])}
              style={[ms.planeRow, on && { borderColor: C.blue, backgroundColor: C.sky }]}
            >
              <PlaneImage plane={p} size={44} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontWeight: '700', color: C.text }}>{p.year} {p.make} {p.model}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>{p.tail} · {p.homeAirport} · {money(p.wetRate)}/hr</Text>
              </View>
              <Text style={{ fontSize: 20, color: on ? C.blue : C.line, fontWeight: '900' }}>{on ? '✓' : '+'}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={() => nav.push('PlaneForm')} style={{ paddingVertical: 10 }}>
          <Text style={{ color: C.blue, fontWeight: '700' }}>+ My plane isn’t listed — list it</Text>
        </Pressable>
        <Toggle label="Will teach in a student’s own aircraft" value={f.teachesInYourPlane} onValueChange={set('teachesInYourPlane')} />
        <Toggle label="I carry CFI / non-owner insurance" value={f.insured} onValueChange={set('insured')} />

        <SectionTitle>Availability</SectionTitle>
        <MultiSelect label="Days" options={DAYS} selected={f.availability} onChange={set('availability')} />
        <MultiSelect label="Preferred times" options={TIMES} selected={f.timeOfDay} onChange={set('timeOfDay')} />

        <SectionTitle>About you</SectionTitle>
        <Field label="Short bio" multiline value={f.bio} onChangeText={set('bio')} placeholder="What should a new student know about you?" />
        <Field label="Teaching style" multiline value={f.teachingStyle} onChangeText={set('teachingStyle')} placeholder="Structured? Laid-back? Scenario-based?" />
        <Field label="Aviation background" value={f.background} onChangeText={set('background')} placeholder="e.g. Trained at ATP, building time for the airlines" />
        <Field label="Languages" value={f.languages} onChangeText={set('languages')} placeholder="English, Spanish" />
      </ScrollView>
      <View style={ms.cta}>
        <Button title={valid ? 'Save & preview profile' : 'Add your name and flight rate'} disabled={!valid} style={{ flex: 1 }} onPress={save} />
      </View>
    </View>
  );
}

export function PlaneForm({ nav }) {
  const { addPlane, myCfiId, getCfi, saveCfi, planes } = useStore();
  const me = getCfi(myCfiId);
  const [f, setF] = useState({
    tail: '', year: '', make: '', model: '', category: ['Single'], homeAirport: ['KPIE'],
    wetRate: '', dryRate: '', blockRate: '', avionics: [], ifr: true, seats: '4', usefulLoad: '', cruise: '', fuelBurn: '',
    engineSMOH: '', tbo: '2000', last100hr: '', ownerName: '', ownerType: ['Private owner'], insuranceMinHours: '0',
    checkoutRequired: '', soloRental: true, notes: '', onMyProfile: true, photos: [],
  });
  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));
  const valid = f.tail.trim() && f.make.trim() && f.model.trim() && num(f.wetRate) > 0;

  const save = () => {
    const id = 'p' + Date.now();
    const wet = num(f.wetRate);
    addPlane({
      id,
      art: f.category[0] === 'Multi' ? 'twin' : 'highwing',
      photos: f.photos,
      reviews: [],
      tail: f.tail.trim().toUpperCase(),
      year: num(f.year) || 2000,
      make: f.make.trim(),
      model: f.model.trim(),
      category: f.category[0],
      homeAirport: f.homeAirport[0],
      color: PALETTE[planes.length % PALETTE.length],
      wetRate: wet,
      dryRate: num(f.dryRate) || Math.round(wet * 0.78),
      blockRate: num(f.blockRate) || wet,
      avionics: f.avionics.length ? f.avionics : ['Steam gauges'],
      ifr: f.ifr,
      seats: num(f.seats) || 4,
      usefulLoad: num(f.usefulLoad),
      fuelBurn: num(f.fuelBurn),
      cruise: num(f.cruise),
      engineSMOH: num(f.engineSMOH),
      tbo: num(f.tbo) || 2000,
      last100hr: f.last100hr || '—',
      ownerName: f.ownerName || 'You',
      ownerType: f.ownerType[0],
      insuranceMinHours: num(f.insuranceMinHours),
      checkoutRequired: f.checkoutRequired || 'Checkout with a listed CFI',
      soloRental: f.soloRental,
      rating: 5.0,
      reviewCount: 0,
      notes: f.notes,
    });
    if (me && f.onMyProfile) saveCfi({ ...me, aircraftIds: [...me.aircraftIds, id] });
    nav.replace('Plane', { id });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="List a plane" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
        <SectionTitle>Photos</SectionTitle>
        <Text style={ms.hint}>Listings with 4+ photos (exterior, panel, interior, logbooks) get booked far more. First photo is the cover.</Text>
        {f.photos.length > 0 && <PhotoStrip photos={f.photos} onRemove={(k) => set('photos')(f.photos.filter((_, i) => i !== k))} />}
        <Button title={f.photos.length ? '+ Add more photos' : '+ Add photos'} variant="outline" style={{ paddingVertical: 12, marginBottom: 4 }} onPress={async () => { const u = await pickImages(true); if (u.length) set('photos')([...f.photos, ...u]); }} />

        <SectionTitle>Aircraft</SectionTitle>
        <View style={ms.two}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Tail number" value={f.tail} onChangeText={set('tail')} placeholder="N12345" /></View>
          <View style={{ flex: 1 }}><Field label="Year" keyboardType="numeric" value={f.year} onChangeText={set('year')} placeholder="1979" /></View>
        </View>
        <View style={ms.two}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Make" value={f.make} onChangeText={set('make')} placeholder="Cessna" /></View>
          <View style={{ flex: 1 }}><Field label="Model" value={f.model} onChangeText={set('model')} placeholder="172N Skyhawk" /></View>
        </View>
        <MultiSelect single label="Category" options={['Single', 'Multi']} selected={f.category} onChange={set('category')} />
        <MultiSelect single label="Based at" options={AIRPORTS.map((a) => a.code)} selected={f.homeAirport} onChange={set('homeAirport')} />

        <SectionTitle>Rates</SectionTitle>
        <View style={ms.two}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Wet /hr" prefix="$" keyboardType="numeric" value={f.wetRate} onChangeText={set('wetRate')} placeholder="150" /></View>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Dry /hr" prefix="$" keyboardType="numeric" value={f.dryRate} onChangeText={set('dryRate')} placeholder="115" /></View>
          <View style={{ flex: 1 }}><Field label="10-hr block" prefix="$" keyboardType="numeric" value={f.blockRate} onChangeText={set('blockRate')} placeholder="140" /></View>
        </View>

        <SectionTitle>Avionics & equipment</SectionTitle>
        <MultiSelect options={AVIONICS} selected={f.avionics} onChange={set('avionics')} />
        <Toggle label="IFR certified" value={f.ifr} onValueChange={set('ifr')} />

        <SectionTitle>Specs & maintenance</SectionTitle>
        <View style={ms.two}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Seats" keyboardType="numeric" value={f.seats} onChangeText={set('seats')} /></View>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Useful load lb" keyboardType="numeric" value={f.usefulLoad} onChangeText={set('usefulLoad')} placeholder="850" /></View>
          <View style={{ flex: 1 }}><Field label="Cruise kts" keyboardType="numeric" value={f.cruise} onChangeText={set('cruise')} placeholder="115" /></View>
        </View>
        <View style={ms.two}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Fuel burn gph" keyboardType="numeric" value={f.fuelBurn} onChangeText={set('fuelBurn')} placeholder="8.5" /></View>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Engine SMOH" keyboardType="numeric" value={f.engineSMOH} onChangeText={set('engineSMOH')} placeholder="900" /></View>
          <View style={{ flex: 1 }}><Field label="TBO" keyboardType="numeric" value={f.tbo} onChangeText={set('tbo')} /></View>
        </View>
        <Field label="Last 100-hr / annual" value={f.last100hr} onChangeText={set('last100hr')} placeholder="Oct 2026" />

        <SectionTitle>Renter rules</SectionTitle>
        <Toggle label="Allow solo rental" hint="Off = renters must fly with a CFI" value={f.soloRental} onValueChange={set('soloRental')} />
        <Field label="Insurance min. total time (hrs)" keyboardType="numeric" value={f.insuranceMinHours} onChangeText={set('insuranceMinHours')} />
        <Field label="Checkout requirement" value={f.checkoutRequired} onChangeText={set('checkoutRequired')} placeholder="1 hr checkout with a listed CFI" />

        <SectionTitle>Owner</SectionTitle>
        <MultiSelect single label="Owner type" options={OWNER_TYPES} selected={f.ownerType} onChange={set('ownerType')} />
        <Field label="Listed by" value={f.ownerName} onChangeText={set('ownerName')} placeholder="Your name, club or company" />
        <Field label="Notes for renters" multiline value={f.notes} onChangeText={set('notes')} placeholder="Hangared? Recent paint? Quirks?" />
        {me && <Toggle label={`Show on my CFI profile (${me.name})`} hint="Students will see you teach in this plane" value={f.onMyProfile} onValueChange={set('onMyProfile')} />}
      </ScrollView>
      <View style={ms.cta}>
        <Button title={valid ? 'Publish listing' : 'Add tail, make, model & wet rate'} disabled={!valid} style={{ flex: 1 }} onPress={save} />
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
  });
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
        <Field label="School name" value={f.name} onChangeText={set('name')} placeholder="e.g. Pinellas Flight Academy" />
        <MultiSelect single label="Based at" options={AIRPORTS.map((a) => a.code)} selected={f.homeAirport} onChange={set('homeAirport')} />
        <MultiSelect label="Certification" options={['Part 61', 'Part 141']} selected={f.trainingTypes} onChange={set('trainingTypes')} />
        <Field label="About the school" multiline value={f.about} onChangeText={set('about')} placeholder="What makes training here different?" />
        <View style={ms.two}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Phone" value={f.phone} onChangeText={set('phone')} placeholder="(727) 555-0100" /></View>
          <View style={{ flex: 1 }}><Field label="Founded" keyboardType="numeric" value={f.founded} onChangeText={set('founded')} placeholder="2015" /></View>
        </View>
        <Field label="Website" value={f.website} onChangeText={set('website')} placeholder="yourschool.com" />
        <Toggle label="VA approved (GI Bill)" value={f.vaApproved} onValueChange={set('vaApproved')} />
        <Toggle label="Offers financing" value={f.financing} onValueChange={set('financing')} />

        <SectionTitle>Programs & pricing</SectionTitle>
        {f.programs.map((p, i) => (
          <Card key={i}>
            <Field label="Program" value={p.name} onChangeText={(v) => setProg(i, 'name', v)} placeholder="Private Pilot" />
            <View style={ms.two}>
              <View style={{ flex: 1, marginRight: 8 }}><Field label="Price" prefix="$" keyboardType="numeric" value={p.price} onChangeText={(v) => setProg(i, 'price', v)} placeholder="12900" /></View>
              <View style={{ flex: 1.6 }}><Field label="Includes" value={p.includes} onChangeText={(v) => setProg(i, 'includes', v)} placeholder="~50 hrs + ground" /></View>
            </View>
          </Card>
        ))}
        <Pressable onPress={() => set('programs')([...f.programs, { name: '', price: '', includes: '' }])} style={{ paddingVertical: 6 }}>
          <Text style={{ color: C.blue, fontWeight: '700' }}>+ Add another program</Text>
        </Pressable>

        <SectionTitle>Your instructors</SectionTitle>
        <Text style={ms.hint}>Tap instructors who teach for you. Each gets an invite and must accept before they’re linked to your school.</Text>
        {cfis.map((c) => {
          const on = f.cfiIds.includes(c.id);
          return (
            <Pressable key={c.id} onPress={() => toggleId('cfiIds', c.id)} style={[ms.planeRow, on && { borderColor: C.blue, backgroundColor: C.sky }]}>
              <Avatar initials={c.initials} color={c.color} photo={c.photo} size={40} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontWeight: '700', color: C.text }}>{c.name}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>{c.certs.join(' · ')} · {c.homeAirport}</Text>
              </View>
              <Text style={{ fontSize: 20, color: on ? C.blue : C.line, fontWeight: '900' }}>{on ? '✓' : '+'}</Text>
            </Pressable>
          );
        })}

        <SectionTitle>Your fleet</SectionTitle>
        {planes.map((p) => {
          const on = f.planeIds.includes(p.id);
          return (
            <Pressable key={p.id} onPress={() => toggleId('planeIds', p.id)} style={[ms.planeRow, on && { borderColor: C.blue, backgroundColor: C.sky }]}>
              <PlaneImage plane={p} size={44} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontWeight: '700', color: C.text }}>{p.year} {p.make} {p.model}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>{p.tail} · {p.homeAirport} · {money(p.wetRate)}/hr</Text>
              </View>
              <Text style={{ fontSize: 20, color: on ? C.blue : C.line, fontWeight: '900' }}>{on ? '✓' : '+'}</Text>
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
  profile: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 16 },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#E3F7EF', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginTop: 6 },
  walletIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  addFunds: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  groupTitle: { fontSize: 13, fontWeight: '800', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  count: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginRight: 6 },
  wallet: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy, borderRadius: 18, padding: 16, marginBottom: 12 },
  menu: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#F1F3F7' },
  h1: { fontSize: 28, fontWeight: '900', color: C.text, marginBottom: 14, marginTop: 6 },
  two: { flexDirection: 'row' },
  hint: { color: C.sub, fontSize: 12, marginBottom: 10 },
  planeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1.5, borderColor: C.line },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', padding: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row' },
});
