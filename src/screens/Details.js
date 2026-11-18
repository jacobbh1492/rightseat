import React from 'react';
import { aircraftChecks, blockingIssues } from '../aircraftStatus';
import { ymdIn } from '../renterChecks';
import { useAuth } from '../backend/auth';
import { View, Text, ScrollView, Pressable, StyleSheet, Image } from 'react-native';
import { useStore, money } from '../store';
import { AIRPORTS } from '../data';
import { C, Card, Avatar, Tag, Stars, Stat, Row, SectionTitle, Button, ReviewCard, OwnerBadge, Icon, IconButton, Banner } from '../ui';
import { nextOpening, weekStrip } from '../listingInfo';
import { PlaneGallery, PlaneImage } from '../art';
import { VerifiedCard } from './Verify';

export function Header({ nav, title, right }) {
  return (
    <View style={hs.bar}>
      <Pressable onPress={nav.pop} hitSlop={8} style={hs.back} accessibilityRole="button" accessibilityLabel="Back">
        <Icon name="back" size={24} color={C.navy} />
      </Pressable>
      <Text style={hs.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
      <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

const airportName = (code) => AIRPORTS.find((a) => a.code === code)?.name || '';

export function CfiDetail({ nav, params }) {
  const { getCfi, getPlane, getSchool, favorites, toggleFavorite } = useStore();
  const c = getCfi(params.id);
  if (!c) return null;
  const school = c.schoolId ? getSchool(c.schoolId) : null;
  const fav = favorites.includes(c.id);
  const planes = c.aircraftIds.map(getPlane).filter(Boolean);
  const next = nextOpening(c);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header
        nav={nav}
        title="Instructor"
        right={
          <IconButton name="heart" label={fav ? 'Remove from saved' : 'Save instructor'} onPress={() => toggleFavorite(c.id)} color={fav ? '#BE123C' : C.navy} bg="transparent" />
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Avatar initials={c.initials} color={c.color} size={84} photo={c.photo} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={ds.name} accessibilityRole="header">{c.name}</Text>
              {c.verified ? <View style={{ marginLeft: 6 }} accessible accessibilityLabel="Verified"><Icon name="shieldCheck" size={18} color={C.green} strokeWidth={2.2} /></View> : null}
            </View>
            <Text style={ds.sub}>{c.homeAirport}{c.alsoTeachesAt.length ? ` · also ${c.alsoTeachesAt.join(', ')}` : ` · ${airportName(c.homeAirport)}`}</Text>
            <Stars rating={c.rating} count={c.reviewCount} />
            {c.responseTime ? <Text style={[ds.sub, { color: C.green, fontWeight: '700' }]}>{c.responseTime}</Text> : null}
          </View>
        </View>
        <View style={{ marginBottom: 12 }}>
          {school ? (
            <Pressable onPress={() => nav.push('School', { id: school.id })} style={ds.schoolPill}>
              <Text style={{ color: C.blue, fontWeight: '700' }}>Instructor at {school.name} ›</Text>
            </Pressable>
          ) : (
            <Text style={[ds.sub, { fontWeight: '600' }]}>Independent CFI</Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {[...c.certs, ...c.trainingTypes].map((x) => <Tag key={x} label={x} color={C.text} bg={C.sky} />)}
          </View>
        </View>

        <Card style={{ paddingVertical: 8 }}>
          <View style={{ flexDirection: 'row' }}>
            <Stat value={c.totalHours ? `${c.totalHours.toLocaleString()}*` : '—'} label="Total hrs" />
            <Stat value={c.checkridesSent ? `${c.passRate}%*` : 'New'} label="1st-time pass" />
            <Stat value={c.checkridesSent ? `${c.checkridesSent}*` : '—'} label="Checkrides" />
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Stat value={c.dualGiven ? `${c.dualGiven.toLocaleString()}*` : '—'} label="Dual given" />
            <Stat value={`${c.yearsInstructing || '<1'}*`} label="Yrs teaching" />
            <Stat value={c.studentsSoloed != null ? `${c.studentsSoloed}*` : '—'} label="Students soloed" />
          </View>
          <Text style={[ds.note, { marginTop: 4 }]}>*Self-reported by {c.name.split(' ')[0]}</Text>
        </Card>

        <SectionTitle>Verified by Positive Rate</SectionTitle>
        <VerifiedCard kind="cfi" entity={c} />

        <SectionTitle>Pricing</SectionTitle>
        <Card>
          <Row label="Flight instruction" value={`${money(c.flightRate)}/hr`} />
          <Row label="Ground instruction" value={`${money(c.groundRate)}/hr`} />
          {c.discoveryFlight > 0 && <Row label="Discovery flight (incl. plane)" value={money(c.discoveryFlight)} />}
          <Row label="Teaches in your own aircraft" value={c.teachesInYourPlane ? 'Yes' : 'No'} />
          <Row label="Carries CFI insurance" value={c.insured ? 'Yes' : 'No'} />
          {c.packages.length > 0 && <Text style={[ds.label, { marginTop: 10 }]}>Packages</Text>}
          {c.packages.map((p) => (
            <View key={p.name} style={ds.pkg}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.text }}>{p.name}</Text>
                <Text style={ds.sub}>{p.includes}</Text>
              </View>
              <Text style={{ fontWeight: '900', color: C.navy, fontSize: 16 }}>{money(p.price)}</Text>
            </View>
          ))}
          <Text style={ds.note}>Aircraft rental is billed separately unless noted.</Text>
        </Card>

        <SectionTitle>Planes {c.name.split(' ')[0]} flies</SectionTitle>
        {planes.length === 0 && <Text style={ds.sub}>Teaches in the student’s aircraft.</Text>}
        {planes.map((p) => (
          <Card key={p.id} onPress={() => nav.push('Plane', { id: p.id })} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PlaneImage plane={p} size={56} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontWeight: '800', color: C.text }}>{p.year} {p.make} {p.model}</Text>
              <Text style={ds.sub}>{p.tail} · {p.homeAirport} · {p.avionics[0]}</Text>
              <Text style={[ds.sub, { color: C.navy, fontWeight: '700' }]}>
                {money(p.wetRate)}/hr wet → {money(p.wetRate + c.flightRate)}/hr with {c.name.split(' ')[0]}
              </Text>
            </View>
            <Text style={{ color: C.sub, fontSize: 20 }}>›</Text>
          </Card>
        ))}

        <SectionTitle>Teaches</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {c.specialties.map((x) => <Tag key={x} label={x} color={C.text} bg="#fff" />)}
        </View>

        <SectionTitle>Availability</SectionTitle>
        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
          {weekStrip(c).map((d, i) => (
            <View key={d.key} style={[ds.day, { marginRight: i < 6 ? 6 : 0 }, !d.open && ds.dayOff]} accessible accessibilityLabel={`${d.day} ${d.date}, ${d.open ? 'teaching' : 'not teaching'}`}>
              <Text style={{ fontSize: 11, color: C.sub }}>{d.day}</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: d.open ? C.text : C.chevron, textDecorationLine: d.open ? 'none' : 'line-through' }}>{d.date}</Text>
            </View>
          ))}
        </View>
        {next ? (
          <Banner tone="green" icon="clock" title={`Next opening: ${next.label}`}>{c.timeOfDay?.length ? `Prefers ${c.timeOfDay.join(', ').toLowerCase()}` : undefined}</Banner>
        ) : <Text style={ds.sub}>No open times in the next two weeks. Message {c.name.split(' ')[0]} to ask.</Text>}

        <SectionTitle>About</SectionTitle>
        <Card>
          <Text style={ds.body}>{c.bio}</Text>
          <Text style={ds.label}>Teaching style</Text>
          <Text style={ds.body}>{c.teachingStyle}</Text>
          <Text style={ds.label}>Background</Text>
          <Text style={ds.body}>{c.background}</Text>
          <Text style={ds.label}>Languages</Text>
          <Text style={ds.body}>{c.languages.join(', ')}</Text>
        </Card>

        <SectionTitle right={<Stars rating={c.rating} count={c.reviewCount} />}>Student reviews</SectionTitle>
        <Text style={ds.verifiedNote}>✓ Only students who completed a lesson booked through Positive Rate can leave a review.</Text>
        {c.reviews.length === 0 && <Text style={ds.sub}>No reviews yet.</Text>}
        {c.reviews.map((r, i) => <ReviewCard key={i} r={r} />)}
      </ScrollView>
      <View style={ds.cta}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', fontSize: 18, color: C.text }}>{money(c.flightRate)}/hr</Text>
          {next ? <Text style={{ fontSize: 12, fontWeight: '700', color: C.green }}>Next: {next.label}</Text> : null}
        </View>
        <Pressable onPress={() => nav.push('Chat', { key: c.id })} style={ds.msgBtn} accessibilityRole="button" accessibilityLabel={`Message ${c.name}`}><Icon name="chat" size={22} color={C.navy} /></Pressable>
        {c.live && !c.verified
          ? <Button title="Verification pending" disabled style={{ paddingHorizontal: 20 }} />
          : <Button title="Book a lesson" style={{ paddingHorizontal: 20 }} onPress={() => nav.push('Request', { cfiId: c.id, planeId: c.aircraftIds[0] || null })} />}
      </View>
    </View>
  );
}

export function PlaneDetail({ nav, params }) {
  const { getPlane, cfisForPlane, getSchool } = useStore();
  const auth = useAuth();
  const p = getPlane(params.id);
  if (!p) return null;
  const school = p.schoolId ? getSchool(p.schoolId) : null;
  const cfis = cfisForPlane(p.id);
  const engineLife = Math.max(0, Math.min(1, 1 - p.engineSMOH / p.tbo));
  const grounded = blockingIssues(aircraftChecks({ plane: p, squawks: p.squawks || [], flightHours: 0.1, day: ymdIn(new Date()) })).length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={p.tail} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <PlaneGallery plane={p} />
        <View style={{ padding: 16 }}>
          <Text style={{ color: C.text, fontWeight: '900', fontSize: 22 }}>{p.year} {p.make} {p.model}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <Text style={ds.sub}>{p.tail} · {p.homeAirport} · {p.category}-engine</Text>
            <Stars rating={p.rating} count={p.reviewCount} />
          </View>
          <Card
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}
            onPress={school ? () => nav.push('School', { id: school.id }) : undefined}
          >
            <View style={[ds.ownerLogo, { backgroundColor: school ? school.color : '#EEF1F5' }]}>
              <Text style={{ color: school ? '#fff' : C.sub, fontWeight: '900' }}>{school ? school.initials : p.ownerName.slice(0, 1)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: C.sub, fontSize: 12 }}>Listed by</Text>
              <Text style={{ color: C.text, fontWeight: '800' }}>{p.ownerName}</Text>
              <View style={{ flexDirection: 'row', marginTop: 4 }}><OwnerBadge type={p.ownerType} /></View>
            </View>
            {school && <Text style={{ color: C.sub, fontSize: 20 }}>›</Text>}
          </Card>

          {(() => {
            const left = p.next100At > 0 ? Math.max(0, Math.round((p.next100At - p.hobbsTotal) * 10) / 10) : null;
            const open = (p.squawks || []).filter((q) => q.status === 'open').length;
            const good = !grounded && (left == null || left > 5) && !open;
            return (
              <Banner tone={grounded ? 'red' : good ? 'green' : 'amber'} icon={grounded ? 'alert' : good ? 'shieldCheck' : 'wrench'}
                title={grounded ? 'Grounded · not bookable right now' : good ? 'Maintenance up to date' : 'Maintenance coming up'}>
                {[p.annualDate ? `Annual ${p.annualDate}` : p.last100hr ? `Last inspection ${p.last100hr}` : null, left != null ? `100-hr in ${left} hrs` : null, `${open || 'No'} open squawk${open === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
              </Banner>
            );
          })()}
          {p.live && auth?.session && (
            <Pressable onPress={() => nav.push('ReportSquawk', { planeId: p.id })} style={{ paddingVertical: 6 }} accessibilityRole="button">
              <Text style={{ color: C.blue, fontWeight: '700' }}>Flew it and found a problem? Report a squawk ›</Text>
            </Pressable>
          )}

          <SectionTitle>Verified by Positive Rate</SectionTitle>
          <VerifiedCard kind="plane" entity={p} />

          <SectionTitle>Rental rates</SectionTitle>
          <Card>
            <Row label="Wet (fuel included)" value={`${money(p.wetRate)}/hr`} />
            <Row label="Dry (you buy fuel)" value={`${money(p.dryRate)}/hr`} />
            <Row label="Prepaid block rate (wallet)" value={`${money(p.blockRate)}/hr`} />
            <Text style={ds.note}>Billed on Hobbs time.</Text>
          </Card>

          <SectionTitle>Avionics & equipment</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {p.panel && <Tag label={p.panel === 'glass' ? 'Glass panel' : 'Six-pack (steam gauges)'} color={C.text} bg={C.sky} />}
            {p.ifr && <Tag label="IFR certified" color={C.text} bg={C.sky} />}
            {p.avionics.map((a) => <Tag key={a} label={a} color={C.text} bg={C.sky} />)}
          </View>

          <SectionTitle>Specs</SectionTitle>
          <Card>
            <Row label="Seats" value={p.seats} />
            <Row label="Useful load" value={`${p.usefulLoad} lb`} />
            <Row label="Cruise" value={`${p.cruise} kts`} />
            <Row label="Fuel burn" value={`${p.fuelBurn} gph`} />
            <Row label="Engine time (SMOH / TBO)" value={`${p.engineSMOH} / ${p.tbo}`} />
            <View style={ds.bar}>
              <View style={[ds.barFill, { width: `${engineLife * 100}%` }]} />
            </View>
            <Row label="Last 100-hr / annual" value={p.last100hr} />
          </Card>

          <SectionTitle>Renter requirements</SectionTitle>
          <Card>
            <Row label="Solo rental allowed" value={p.soloRental ? 'Yes, after checkout' : 'No — fly with a CFI'} />
            <Row label="Minimum hours" value={p.insuranceMinHours ? `${p.insuranceMinHours} hrs total time` : 'None (students OK)'} />
            {p.soloRental && <Row label="Checkout by" value={p.checkoutBy === 'owner' ? 'The owner' : p.checkoutBy === 'either' ? 'The owner or a CFI' : 'A CFI'} />}
            <Text style={[ds.body, { marginTop: 6 }]}>{p.checkoutRequired}</Text>
            {p.soloRental && ['owner', 'either'].includes(p.checkoutBy) && (
              <Pressable onPress={() => nav.push('Request', { cfiId: null, planeId: p.id, checkout: true })} accessibilityRole="button" style={{ minHeight: 40, justifyContent: 'center', marginTop: 4 }}>
                <Text style={{ color: C.blue, fontWeight: '800' }}>Book a checkout flight with the owner ›</Text>
              </Pressable>
            )}
          </Card>

          {p.notes ? (
            <>
              <SectionTitle>From the owner</SectionTitle>
              <Card>
                <Text style={ds.body}>{p.notes}</Text>
              </Card>
            </>
          ) : null}

          <SectionTitle right={<Stars rating={p.rating} count={p.reviewCount} />}>Renter reviews</SectionTitle>
          <Text style={ds.verifiedNote}>✓ Only pilots who flew this aircraft on a Positive Rate booking can review it.</Text>
          {(p.reviews || []).length === 0 && <Text style={ds.sub}>No written reviews yet.</Text>}
          {(p.reviews || []).map((r, i) => <ReviewCard key={i} r={r} />)}

          <SectionTitle>Instructors who fly this plane</SectionTitle>
          {cfis.length === 0 && <Text style={ds.sub}>No instructors linked yet. Any qualified instructor can be requested.</Text>}
          {cfis.map((c) => (
            <Card key={c.id} onPress={() => nav.push('Cfi', { id: c.id })} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Avatar initials={c.initials} color={c.color} size={46} photo={c.photo} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontWeight: '800', color: C.text }}>{c.name}</Text>
                <Text style={ds.sub}>{c.certs.join(' · ')} · {c.passRate}% pass</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontWeight: '900', color: C.navy }}>{money(c.flightRate + p.wetRate)}</Text>
                <Text style={{ fontSize: 11, color: C.sub }}>/hr together</Text>
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
      <View style={ds.cta}>
        {p.soloRental && (
          <Button title="Rent solo" variant="outline" style={{ flex: 0.8, marginRight: 10, paddingHorizontal: 8 }} onPress={() => nav.push('Request', { cfiId: null, planeId: p.id })} />
        )}
        <Button title="Book with an instructor" style={{ flex: 1.6 }} onPress={() => nav.push('Request', { cfiId: cfis[0]?.id || null, planeId: p.id })} />
      </View>
    </View>
  );
}

const hs = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, height: 56, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 17, color: C.text },
});

const ds = StyleSheet.create({
  name: { fontSize: 22, fontWeight: '800', color: C.text, flexShrink: 1 },
  sub: { color: C.sub, fontSize: 13, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '800', color: C.sub, marginTop: 12, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  body: { color: C.text, fontSize: 14, lineHeight: 20 },
  note: { color: C.sub, fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  pkg: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.sky, borderRadius: 12, padding: 12, marginTop: 8 },
  day: { flex: 1, paddingVertical: 8, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  dayOff: { backgroundColor: C.sky, borderColor: C.sky },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.line },
  msgBtn: { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: C.chevron, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  schoolPill: { backgroundColor: C.sky, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginTop: 8, marginBottom: 4 },
  ownerLogo: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  verifiedNote: { color: C.green, fontSize: 12, fontWeight: '600', marginBottom: 10 },
  schoolHero: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  schoolLogo: { width: 72, height: 72, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#EEF1F5', marginBottom: 6, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: C.green },
});

export function SchoolDetail({ nav, params }) {
  const { getSchool, cfisForSchool, planesForSchool } = useStore();
  const x = getSchool(params.id);
  if (!x) return null;
  const cfis = cfisForSchool(x.id);
  const planes = planesForSchool(x.id);
  const avgPass = cfis.filter((c) => c.checkridesSent).length
    ? Math.round(cfis.filter((c) => c.checkridesSent).reduce((a, c) => a + c.passRate * c.checkridesSent, 0) / cfis.reduce((a, c) => a + (c.checkridesSent || 0), 0))
    : null;
  const lowCfi = cfis.length ? Math.min(...cfis.map((c) => c.flightRate)) : null;
  const lowPlane = planes.length ? Math.min(...planes.map((p) => p.wetRate)) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Flight school" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={[ds.schoolHero, { backgroundColor: C.navy }]}>
          <View style={ds.schoolLogo}>{x.logo ? <Image source={{ uri: x.logo }} style={{ width: 72, height: 72, borderRadius: 18 }} accessibilityLabel={`${x.name} logo`} /> : <Text style={{ color: C.navy, fontWeight: '900', fontSize: 26 }}>{x.initials}</Text>}</View>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22, marginTop: 10, textAlign: 'center' }}>{x.name}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{x.homeAirport} · {airportName(x.homeAirport)}</Text>
          <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {x.trainingTypes.map((t) => <Tag key={t} label={t} color={C.navy} bg={C.amber} />)}
            {x.vaApproved && <Tag label="VA approved" color={C.navy} bg={C.amber} />}
            {x.financing && <Tag label="Financing" color={C.navy} bg={C.amber} />}
          </View>
        </View>
        <View style={{ padding: 16 }}>
          <Card style={{ flexDirection: 'row', paddingVertical: 4 }}>
            <Stat value={cfis.length} label="Instructors" />
            <Stat value={planes.length} label="Aircraft" />
            <Stat value={avgPass != null ? `${avgPass}%*` : '—'} label="Avg 1st-time pass" />
          </Card>
          <Card style={{ flexDirection: 'row', paddingVertical: 4 }}>
            <Stat value={lowCfi != null ? `From ${money(lowCfi)}/hr` : '—'} label="Instruction" />
            <Stat value={lowPlane != null ? `From ${money(lowPlane)}/hr` : '—'} label="Rentals (wet)" />
            <Stat value={x.reviewCount ? x.rating.toFixed(1) + '★' : 'New'} label={`${x.reviewCount} reviews`} />
          </Card>
          {avgPass != null && <Text style={[ds.note, { marginTop: -4, marginBottom: 8 }]}>*Reported by the school’s instructors</Text>}

          <SectionTitle>About</SectionTitle>
          <Card>
            {x.about ? <Text style={ds.body}>{x.about}</Text> : null}
            {x.founded ? <Row label="Founded" value={x.founded} /> : null}
            {x.phone ? <Row label="Phone" value={x.phone} /> : null}
            {x.website ? <Row label="Website" value={x.website} /> : null}
          </Card>

          {x.programs.length > 0 && <SectionTitle>Programs & pricing</SectionTitle>}
          {x.programs.map((pr) => (
            <View key={pr.name} style={[ds.pkg, { marginTop: 0, marginBottom: 8, backgroundColor: '#fff' }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: C.text }}>{pr.name}</Text>
                <Text style={ds.sub}>{pr.includes}</Text>
              </View>
              <Text style={{ fontWeight: '900', color: C.navy, fontSize: 16 }}>{money(pr.price)}</Text>
            </View>
          ))}

          <SectionTitle>Instructors ({cfis.length})</SectionTitle>
          {cfis.map((c) => (
            <Card key={c.id} onPress={() => nav.push('Cfi', { id: c.id })} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Avatar initials={c.initials} color={c.color} size={46} photo={c.photo} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontWeight: '800', color: C.text }}>{c.name}</Text>
                <Text style={ds.sub}>{c.certs.join(' · ')} · {c.totalHours.toLocaleString()} hrs · {c.passRate}% pass</Text>
                <Stars rating={c.rating} count={c.reviewCount} />
              </View>
              <Text style={{ fontWeight: '900', color: C.navy }}>{money(c.flightRate)}<Text style={{ fontSize: 11, color: C.sub }}>/hr</Text></Text>
            </Card>
          ))}

          <SectionTitle>Fleet ({planes.length})</SectionTitle>
          {planes.map((p) => (
            <Card key={p.id} onPress={() => nav.push('Plane', { id: p.id })} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <PlaneImage plane={p} size={56} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontWeight: '800', color: C.text }}>{p.year} {p.make} {p.model}</Text>
                <Text style={ds.sub}>{p.tail} · {p.avionics[0]}{p.ifr ? ' · IFR' : ''}</Text>
                <Text style={[ds.sub, { color: C.navy, fontWeight: '700' }]}>
                  Flown by {cfis.filter((c) => c.aircraftIds.includes(p.id)).map((c) => c.name.split(' ')[0]).join(', ') || 'any school CFI'}
                </Text>
              </View>
              <Text style={{ fontWeight: '900', color: C.navy }}>{money(p.wetRate)}<Text style={{ fontSize: 11, color: C.sub }}>/hr</Text></Text>
            </Card>
          ))}

          <SectionTitle right={<Stars rating={x.rating} count={x.reviewCount} />}>Student reviews</SectionTitle>
          <Text style={ds.verifiedNote}>✓ Verified students who trained here through Positive Rate.</Text>
          {x.reviews.length === 0 && <Text style={ds.sub}>No written reviews yet.</Text>}
          {x.reviews.map((r, i) => <ReviewCard key={i} r={r} />)}
        </View>
      </ScrollView>
      <View style={ds.cta}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '900', fontSize: 16, color: C.navy }}>
            {lowCfi != null && lowPlane != null ? `From ${money(lowCfi + lowPlane)}/hr` : x.name}
          </Text>
          <Text style={ds.sub}>Instructor + plane, all-in</Text>
        </View>
        <Button title="Book a lesson" style={{ paddingHorizontal: 22 }} onPress={() => nav.push('Request', { cfiId: cfis[0]?.id || null, planeId: cfis[0]?.aircraftIds[0] || planes[0]?.id || null })} />
      </View>
    </View>
  );
}
