import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useStore, money } from '../store';
import { AIRPORTS } from '../data';
import { C, Card, Avatar, Tag, Stars, Stat, Row, SectionTitle, Button, ReviewCard, OwnerBadge, Icon, IconButton } from '../ui';
import { PlaneGallery, PlaneImage } from '../art';
import { VerifiedCard } from './Verify';

export function Header({ nav, title, right }) {
  return (
    <View style={hs.bar}>
      <Pressable onPress={nav.pop} hitSlop={12} style={hs.back} accessibilityRole="button" accessibilityLabel="Back">
        <Icon name="back" size={22} color={C.blue} />
        <Text style={{ color: C.blue, fontWeight: '700', marginLeft: 2, fontSize: 15 }}>Back</Text>
      </Pressable>
      <Text style={hs.title} numberOfLines={1}>{title}</Text>
      <View style={{ width: 70, alignItems: 'flex-end' }}>{right}</View>
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

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header
        nav={nav}
        title="Instructor"
        right={
          <IconButton name="heart" label={fav ? 'Remove from saved' : 'Save instructor'} onPress={() => toggleFavorite(c.id)} color={fav ? '#E11D48' : C.sub} bg="transparent" />
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <Avatar initials={c.initials} color={c.color} size={88} photo={c.photo} />
          <Text style={ds.name}>
            {c.name} {c.verified ? <Text style={{ color: C.blue }}>✓</Text> : null}
          </Text>
          <Text style={ds.sub}>
            {c.homeAirport} · {airportName(c.homeAirport)}
          </Text>
          {c.alsoTeachesAt.length > 0 && <Text style={ds.sub}>Also teaches at {c.alsoTeachesAt.join(', ')}</Text>}
          {school ? (
            <Pressable onPress={() => nav.push('School', { id: school.id })} style={ds.schoolPill}>
              <Text style={{ color: C.blue, fontWeight: '700' }}>Instructor at {school.name} ›</Text>
            </Pressable>
          ) : (
            <Text style={[ds.sub, { fontWeight: '600' }]}>Independent CFI</Text>
          )}
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            {c.certs.map((x) => <Tag key={x} label={x} />)}
            {c.trainingTypes.map((x) => <Tag key={x} label={x} color={C.sub} bg="#EEF1F5" />)}
          </View>
          <Stars rating={c.rating} count={c.reviewCount} />
          <Text style={[ds.sub, { marginTop: 4 }]}>{c.responseTime}</Text>
        </View>

        <Card style={{ flexDirection: 'row', paddingVertical: 4 }}>
          <Stat value={c.totalHours ? c.totalHours.toLocaleString() : '—'} label="Total hours" />
          <Stat value={c.dualGiven ? c.dualGiven.toLocaleString() : '—'} label="Dual given" />
          <Stat value={c.checkridesSent ? `${c.passRate}%` : 'New'} label="1st-time pass" />
        </Card>
        <Card style={{ flexDirection: 'row', paddingVertical: 4 }}>
          <Stat value={c.yearsInstructing || '<1'} label="Yrs teaching" />
          <Stat value={c.checkridesSent} label="Checkrides sent" />
          <Stat value={c.studentsSoloed} label="Students soloed" />
        </Card>

        <SectionTitle>Verified by RightSeat</SectionTitle>
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
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => {
              const on = c.availability.includes(d);
              return (
                <View key={d} style={[ds.day, on && { backgroundColor: C.blue }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: on ? '#fff' : C.sub }}>{d}</Text>
                </View>
              );
            })}
          </View>
          <Text style={[ds.sub, { marginTop: 10 }]}>Preferred: {c.timeOfDay.join(', ')}</Text>
        </Card>

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
        <Text style={ds.verifiedNote}>✓ Only students who completed a lesson booked through RightSeat can leave a review.</Text>
        {c.reviews.length === 0 && <Text style={ds.sub}>No reviews yet.</Text>}
        {c.reviews.map((r, i) => <ReviewCard key={i} r={r} />)}
      </ScrollView>
      <View style={ds.cta}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '900', fontSize: 18, color: C.navy }}>{money(c.flightRate)}/hr</Text>
          {c.discoveryFlight > 0 && <Text style={ds.sub}>Discovery flight {money(c.discoveryFlight)}</Text>}
        </View>
        <Pressable onPress={() => nav.push('Chat', { key: c.id })} style={ds.msgBtn} accessibilityRole="button" accessibilityLabel={`Message ${c.name}`}><Icon name="chat" size={20} color={C.blue} /></Pressable>
        <Button title="Request a lesson" style={{ paddingHorizontal: 20 }} onPress={() => nav.push('Request', { cfiId: c.id, planeId: c.aircraftIds[0] || null })} />
      </View>
    </View>
  );
}

export function PlaneDetail({ nav, params }) {
  const { getPlane, cfisForPlane, getSchool } = useStore();
  const p = getPlane(params.id);
  if (!p) return null;
  const school = p.schoolId ? getSchool(p.schoolId) : null;
  const cfis = cfisForPlane(p.id);
  const engineLife = Math.max(0, Math.min(1, 1 - p.engineSMOH / p.tbo));

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

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
            <Tag label={`100-hr in ${Math.max(0, Math.round((p.next100At - p.hobbsTotal) * 10) / 10)} hrs`} color={p.next100At - p.hobbsTotal < 10 ? '#B45309' : C.green} bg={p.next100At - p.hobbsTotal < 10 ? '#FEF3C7' : '#E3F7EF'} />
            <Tag label={`${(p.squawks || []).filter((q) => q.status === 'open').length} open squawks`} color={C.sub} bg="#EEF1F5" />
          </View>

          <SectionTitle>Verified by RightSeat</SectionTitle>
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
            {p.ifr && <Tag label="IFR certified" />}
            {p.avionics.map((a) => <Tag key={a} label={a} color={C.text} bg="#fff" />)}
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
            <Row label="Insurance minimum" value={p.insuranceMinHours ? `${p.insuranceMinHours} hrs TT` : 'Student pilots OK'} />
            <Text style={[ds.body, { marginTop: 6 }]}>{p.checkoutRequired}</Text>
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
          <Text style={ds.verifiedNote}>✓ Only pilots who flew this aircraft on a RightSeat booking can review it.</Text>
          {(p.reviews || []).length === 0 && <Text style={ds.sub}>No written reviews yet.</Text>}
          {(p.reviews || []).map((r, i) => <ReviewCard key={i} r={r} />)}

          <SectionTitle>CFIs who fly this plane</SectionTitle>
          {cfis.length === 0 && <Text style={ds.sub}>No CFIs linked yet. Any qualified CFI can be requested.</Text>}
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
          <Button title="Rent solo" variant="outline" style={{ flex: 1, marginRight: 10 }} onPress={() => nav.push('Request', { cfiId: null, planeId: p.id })} />
        )}
        <Button title="Book with a CFI" style={{ flex: 1.4 }} onPress={() => nav.push('Request', { cfiId: cfis[0]?.id || null, planeId: p.id })} />
      </View>
    </View>
  );
}

const hs = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, minHeight: 52, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line },
  back: { flexDirection: 'row', alignItems: 'center', width: 70 },
  title: { flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 16, color: C.text },
});

const ds = StyleSheet.create({
  name: { fontSize: 24, fontWeight: '900', color: C.text, marginTop: 10 },
  sub: { color: C.sub, fontSize: 13, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '800', color: C.sub, marginTop: 12, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  body: { color: C.text, fontSize: 14, lineHeight: 20 },
  note: { color: C.sub, fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  pkg: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.sky, borderRadius: 12, padding: 12, marginTop: 8 },
  day: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#EEF1F5', alignItems: 'center', justifyContent: 'center' },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.line },
  msgBtn: { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: C.blue, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
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
        <View style={[ds.schoolHero, { backgroundColor: x.color }]}>
          <View style={ds.schoolLogo}><Text style={{ color: x.color, fontWeight: '900', fontSize: 26 }}>{x.initials}</Text></View>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22, marginTop: 10, textAlign: 'center' }}>{x.name}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{x.homeAirport} · {airportName(x.homeAirport)}</Text>
          <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {x.trainingTypes.map((t) => <Tag key={t} label={t} color="#fff" bg="rgba(255,255,255,0.18)" />)}
            {x.vaApproved && <Tag label="VA approved" color="#fff" bg="rgba(255,255,255,0.18)" />}
            {x.financing && <Tag label="Financing" color="#fff" bg="rgba(255,255,255,0.18)" />}
          </View>
        </View>
        <View style={{ padding: 16 }}>
          <Card style={{ flexDirection: 'row', paddingVertical: 4 }}>
            <Stat value={cfis.length} label="Instructors" />
            <Stat value={planes.length} label="Aircraft" />
            <Stat value={avgPass != null ? `${avgPass}%` : '—'} label="Avg 1st-time pass" />
          </Card>
          <Card style={{ flexDirection: 'row', paddingVertical: 4 }}>
            <Stat value={lowCfi != null ? money(lowCfi) : '—'} label="CFI rates from /hr" />
            <Stat value={lowPlane != null ? money(lowPlane) : '—'} label="Rentals from /hr" />
            <Stat value={x.reviewCount ? x.rating.toFixed(1) + '★' : 'New'} label={`${x.reviewCount} reviews`} />
          </Card>

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
          <Text style={ds.verifiedNote}>✓ Verified students who trained here through RightSeat.</Text>
          {x.reviews.length === 0 && <Text style={ds.sub}>No written reviews yet.</Text>}
          {x.reviews.map((r, i) => <ReviewCard key={i} r={r} />)}
        </View>
      </ScrollView>
      <View style={ds.cta}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '900', fontSize: 16, color: C.navy }}>
            {lowCfi != null && lowPlane != null ? `From ${money(lowCfi + lowPlane)}/hr` : x.name}
          </Text>
          <Text style={ds.sub}>CFI + plane, dual instruction</Text>
        </View>
        <Button title="Book a lesson" style={{ paddingHorizontal: 22 }} onPress={() => nav.push('Request', { cfiId: cfis[0]?.id || null, planeId: cfis[0]?.aircraftIds[0] || planes[0]?.id || null })} />
      </View>
    </View>
  );
}
