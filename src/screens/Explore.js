import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Image, StyleSheet } from 'react-native';
import { useStore, money } from '../store';
import { AIRPORTS, OWNER_TYPES } from '../data';
import { C, Card, Chip, Avatar, Tag, Stars, OwnerBadge, Icon, IconButton, Sheet, Button, Tabs } from '../ui';
import { PlaneImage, AircraftArt } from '../art';
import { cfiScore } from '../logic';

const MODES = [
  { key: 'combo', label: 'CFI + Plane' },
  { key: 'cfi', label: 'Instructors' },
  { key: 'plane', label: 'Planes' },
  { key: 'school', label: 'Schools' },
];
const GOALS = ['Discovery flights', 'Private Pilot', 'Instrument', 'Commercial', 'Multi-engine', 'Tailwheel', 'Flight review (BFR)', 'CFI training'];
const PRICES = [{ label: 'Any', v: 9999 }, { label: 'Under $200', v: 200 }, { label: 'Under $250', v: 250 }, { label: 'Under $350', v: 350 }];
const DEFAULTS = { airport: 'All', goal: 'Any', price: 9999, glass: false, ifr: false, solo: false, owner: 'Any' };

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export default function Explore({ nav }) {
  const store = useStore();
  const { schools, getPlane, getCfi, profile, setProfile, pilot, requests } = store;
  // Drafts (unpublished live listings) are visible to their owner elsewhere, not in search.
  // Only verified live listings appear in search; unverified ones can't be booked yet.
  const cfis = store.cfis.filter((c) => c.published !== false && (!c.live || c.verified));
  const planes = store.planes.filter((p) => p.published !== false && (!p.live || (p.airworthyVerified && p.insured)));
  const [mode, setMode] = useState(profile.roles.includes('rent') && !profile.roles.includes('learn') ? 'plane' : 'combo');
  const [q, setQ] = useState('');
  const [f, setF] = useState(profile.stage === 'new' ? { ...DEFAULTS, goal: 'Discovery flights' } : DEFAULTS);
  const [sheet, setSheet] = useState(false);
  const [airportSheet, setAirportSheet] = useState(false);
  const [draft, setDraft] = useState(f);
  const [sort, setSort] = useState('best');
  const home = profile.airport || 'KPIE';
  const query = q.trim().toLowerCase();

  const glassOk = (p) => p.avionics.some((a) => /G1000|G3X|Aspen|G5/.test(a));
  const planeOk = (p, F = f) =>
    (F.airport === 'All' || p.homeAirport === F.airport) && (!F.glass || glassOk(p)) && (!F.ifr || p.ifr) && (!F.solo || p.soloRental) && (F.owner === 'Any' || p.ownerType === F.owner) &&
    (!query || `${p.tail} ${p.make} ${p.model} ${p.homeAirport} ${p.ownerName}`.toLowerCase().includes(query));
  const cfiOk = (c, F = f) =>
    (F.airport === 'All' || c.homeAirport === F.airport || c.alsoTeachesAt.includes(F.airport)) && (F.goal === 'Any' || c.specialties.includes(F.goal)) &&
    (!query || `${c.name} ${c.homeAirport} ${c.specialties.join(' ')} ${c.certs.join(' ')}`.toLowerCase().includes(query));
  const near = (code) => (code === home ? 0 : 1);

  const compute = (F) => {
    const pairs = [];
    cfis.filter((c) => cfiOk(c, F)).forEach((c) =>
      c.aircraftIds.forEach((pid) => {
        const p = getPlane(pid);
        if (!p) return;
        const ok = (F.airport === 'All' || p.homeAirport === F.airport) && (!F.glass || glassOk(p)) && (!F.ifr || p.ifr);
        const hourly = c.flightRate + p.wetRate;
        if (ok && hourly <= F.price) pairs.push({ c, p, hourly });
      })
    );
    return {
      combo: pairs.sort((a, b) => (sort === 'price' ? a.hourly - b.hourly : near(a.p.homeAirport) - near(b.p.homeAirport) || a.hourly - b.hourly)),
      cfi: cfis.filter((c) => cfiOk(c, F) && c.flightRate <= F.price).sort((a, b) => (sort === 'price' ? a.flightRate - b.flightRate : near(a.homeAirport) - near(b.homeAirport) || cfiScore(b) - cfiScore(a))),
      plane: planes.filter((p) => planeOk(p, F) && p.wetRate <= F.price).sort((a, b) => (sort === 'price' ? a.wetRate - b.wetRate : near(a.homeAirport) - near(b.homeAirport) || b.rating - a.rating)),
      school: schools.filter((x) => (F.airport === 'All' || x.homeAirport === F.airport) && (!query || `${x.name} ${x.homeAirport}`.toLowerCase().includes(query))),
    };
  };
  const results = useMemo(() => compute(f), [cfis, planes, schools, f, query, sort]);
  const draftCount = compute(draft)[mode].length;
  const list = results[mode];

  const active = [];
  if (f.airport !== 'All') active.push(['airport', f.airport]);
  if (f.goal !== 'Any' && mode !== 'plane' && mode !== 'school') active.push(['goal', f.goal]);
  if (f.price !== 9999) active.push(['price', PRICES.find((p) => p.v === f.price).label + '/hr']);
  if (f.glass) active.push(['glass', 'Glass cockpit']);
  if (f.ifr) active.push(['ifr', 'IFR']);
  if (f.solo) active.push(['solo', 'Solo rental']);
  if (f.owner !== 'Any') active.push(['owner', f.owner]);
  const clear = (k) => setF({ ...f, [k]: DEFAULTS[k] });

  const upcoming = requests.filter((r) => ['Pending', 'Confirmed'].includes(r.status)).sort((a, b) => new Date(a.when) - new Date(b.when))[0];
  const upCfi = upcoming && getCfi(upcoming.cfiId);
  const upPlane = upcoming && getPlane(upcoming.planeId);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} stickyHeaderIndices={[1]}>
        <View style={st.hero}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={st.hello}>{greeting()}, {pilot.name.split(' ')[0]}</Text>
              <Text style={st.title}>Find your next flight</Text>
            </View>
            <Pressable onPress={() => setAirportSheet(true)} style={st.airport} accessibilityRole="button" accessibilityLabel={`Home airport ${home}. Change`}>
              <Icon name="pin" size={15} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', marginLeft: 4 }}>{home}</Text>
              <Icon name="down" size={15} color="#9FB3D1" />
            </Pressable>
          </View>
        </View>

        <View style={st.sticky}>
          <View style={st.searchRow}>
            <View style={st.search}>
              <Icon name="search" size={18} color={C.sub} />
              <TextInput value={q} onChangeText={setQ} placeholder="Name, airport or aircraft" placeholderTextColor="#94A3B8" style={st.searchInput} accessibilityLabel="Search" />
              {q ? <Pressable onPress={() => setQ('')} hitSlop={8}><Icon name="x" size={16} color={C.sub} /></Pressable> : null}
            </View>
            <IconButton name="filter" label="Filters" onPress={() => { setDraft(f); setSheet(true); }} bg={active.length ? C.blue : '#fff'} color={active.length ? '#fff' : C.text} badge={active.length || null} style={st.filterBtn} />
          </View>
          <Tabs tabs={MODES} value={mode} onChange={setMode} />
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          {upcoming && !query && (
            <Pressable onPress={() => nav.goTab('Lessons')} style={st.upNext} accessibilityRole="button">
              <View style={st.upIcon}><Icon name="calendar" size={20} color={C.blue} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.sub, fontSize: 12, fontWeight: '700' }}>UP NEXT · {upcoming.status.toUpperCase()}</Text>
                <Text style={{ fontWeight: '800', color: C.text, marginTop: 1 }}>{upcoming.goal}</Text>
                <Text style={{ color: C.sub, fontSize: 13 }}>{upcoming.date} · {upcoming.time}{upCfi ? ` · ${upCfi.name.split(' ')[0]}` : ''}{upPlane ? ` · ${upPlane.tail}` : ''}</Text>
              </View>
              <Icon name="chevron" size={18} color="#94A3B8" />
            </Pressable>
          )}

          {profile.stage === 'new' && mode !== 'plane' && (
            <View style={st.promo}>
              <Icon name="sparkle" size={22} color="#F59E0B" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontWeight: '900', color: C.navy }}>New to flying? Start with a discovery flight</Text>
                <Text style={{ color: C.navy, fontSize: 13, marginTop: 2 }}>About an hour, you take the controls, from about $119.</Text>
              </View>
            </View>
          )}

          {active.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {active.map(([k, label]) => (
                <Pressable key={k} onPress={() => clear(k)} style={st.activeChip} accessibilityLabel={`Remove filter ${label}`}>
                  <Text style={{ color: C.blue, fontWeight: '700', fontSize: 13 }}>{label}</Text>
                  <Icon name="x" size={14} color={C.blue} />
                </Pressable>
              ))}
              <Pressable onPress={() => setF(DEFAULTS)} style={[st.activeChip, { backgroundColor: 'transparent' }]}><Text style={{ color: C.sub, fontWeight: '700', fontSize: 13 }}>Clear all</Text></Pressable>
            </ScrollView>
          )}

          <View style={st.countRow}>
            <Text style={st.count}>
              {list.length} {mode === 'combo' ? 'instructor + plane options' : mode === 'cfi' ? 'instructors' : mode === 'plane' ? 'planes for rent' : 'flight schools'}
              {sort === 'best' && f.airport === 'All' ? ` · ${home} first` : ''}
            </Text>
            {mode !== 'school' && (
              <Pressable onPress={() => setSort(sort === 'best' ? 'price' : 'best')} style={st.sort} accessibilityRole="button">
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>{sort === 'best' ? 'Best match' : 'Lowest price'}</Text>
                <Icon name="down" size={14} color={C.text} />
              </Pressable>
            )}
          </View>
          {mode === 'combo' && <Text style={st.explain}>Total per flight hour: instructor rate + plane rental (fuel included).</Text>}

          {mode === 'combo' && list.map(({ c, p, hourly }) => (
            <Card key={c.id + p.id} onPress={() => nav.push('Request', { cfiId: c.id, planeId: p.id })} style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 86, height: 52 }}>
                  <PlaneImage plane={p} size={52} style={{ position: 'absolute', right: 0, borderRadius: 14 }} />
                  <View style={st.overlapAvatar}><Avatar initials={c.initials} color={c.color} size={44} photo={c.photo} /></View>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={st.cardTitle} numberOfLines={1}>{c.name}</Text>
                  <Text style={st.cardSub} numberOfLines={1}>{p.year} {p.make} {p.model}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                    <Stars rating={c.rating} count={c.reviewCount} />
                    <Text style={st.dotSep}>·</Text>
                    <Text style={st.cardSub}>{p.homeAirport}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.price}>{money(hourly)}</Text>
                  <Text style={st.per}>per hour</Text>
                </View>
              </View>
            </Card>
          ))}

          {mode === 'cfi' && list.map((c) => <CfiCard key={c.id} c={c} nav={nav} />)}
          {mode === 'plane' && list.map((p) => <PlaneCard key={p.id} p={p} nav={nav} />)}
          {mode === 'school' && list.map((x) => <SchoolCard key={x.id} x={x} nav={nav} />)}

          {list.length === 0 && (
            <View style={st.empty}>
              <Icon name="search" size={34} color="#CBD5E1" />
              <Text style={{ fontWeight: '800', color: C.text, marginTop: 10, fontSize: 16 }}>No matches</Text>
              <Text style={{ color: C.sub, marginTop: 4, textAlign: 'center' }}>Try another airport or remove a filter.</Text>
              {active.length > 0 && <Button title="Clear filters" variant="ghost" small style={{ marginTop: 12, paddingHorizontal: 20 }} onPress={() => setF(DEFAULTS)} />}
            </View>
          )}
        </View>
      </ScrollView>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Filters"
        footer={
          <>
            <Button title="Clear" variant="outline" style={{ flex: 0.6, marginRight: 8 }} onPress={() => setDraft(DEFAULTS)} />
            <Button title={`Show ${draftCount} result${draftCount === 1 ? '' : 's'}`} style={{ flex: 1 }} onPress={() => { setF(draft); setSheet(false); }} />
          </>
        }
      >
        <Text style={st.fLabel}>Airport</Text>
        <View style={st.wrap}>
          {['All', ...AIRPORTS.map((a) => a.code)].map((a) => <Chip key={a} small label={a === 'All' ? 'Any airport' : a} active={draft.airport === a} onPress={() => setDraft({ ...draft, airport: a })} />)}
        </View>
        {(mode === 'combo' || mode === 'cfi') && (
          <>
            <Text style={st.fLabel}>Training</Text>
            <View style={st.wrap}>
              {['Any', ...GOALS].map((g) => <Chip key={g} small label={g === 'Any' ? 'Anything' : g} active={draft.goal === g} onPress={() => setDraft({ ...draft, goal: g })} />)}
            </View>
          </>
        )}
        {mode !== 'school' && (
          <>
            <Text style={st.fLabel}>{mode === 'combo' ? 'Total price per hour' : 'Price per hour'}</Text>
            <View style={st.wrap}>
              {PRICES.map((p) => <Chip key={p.v} small label={p.label} active={draft.price === p.v} onPress={() => setDraft({ ...draft, price: p.v })} />)}
            </View>
          </>
        )}
        {(mode === 'combo' || mode === 'plane') && (
          <>
            <Text style={st.fLabel}>Aircraft</Text>
            <View style={st.wrap}>
              <Chip small label="Glass cockpit" active={draft.glass} onPress={() => setDraft({ ...draft, glass: !draft.glass })} />
              <Chip small label="IFR equipped" active={draft.ifr} onPress={() => setDraft({ ...draft, ifr: !draft.ifr })} />
              {mode === 'plane' && <Chip small label="Solo rental OK" active={draft.solo} onPress={() => setDraft({ ...draft, solo: !draft.solo })} />}
            </View>
          </>
        )}
        {mode === 'plane' && (
          <>
            <Text style={st.fLabel}>Listed by</Text>
            <View style={st.wrap}>
              {['Any', ...OWNER_TYPES].map((o) => <Chip key={o} small label={o === 'Any' ? 'Anyone' : o} active={draft.owner === o} onPress={() => setDraft({ ...draft, owner: o })} />)}
            </View>
          </>
        )}
      </Sheet>

      <Sheet visible={airportSheet} onClose={() => setAirportSheet(false)} title="Home airport">
        {AIRPORTS.map((a) => (
          <Pressable key={a.code} onPress={() => { setProfile({ airport: a.code }); setAirportSheet(false); }} style={st.airportRow} accessibilityRole="radio" accessibilityState={{ selected: a.code === home }}>
            <Icon name="pin" size={18} color={a.code === home ? C.blue : C.sub} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontWeight: '800', color: C.text }}>{a.code}</Text>
              <Text style={{ color: C.sub, fontSize: 13 }}>{a.name}</Text>
            </View>
            {a.code === home && <Icon name="check" size={18} color={C.blue} />}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

export function CfiCard({ c, nav }) {
  const { getPlane, getSchool } = useStore();
  const school = c.schoolId ? getSchool(c.schoolId) : null;
  const flies = c.aircraftIds.map((id) => getPlane(id)).filter(Boolean);
  return (
    <Card onPress={() => nav.push('Cfi', { id: c.id })}>
      <View style={{ flexDirection: 'row' }}>
        <Avatar initials={c.initials} color={c.color} photo={c.photo} size={56} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={st.cardTitle} numberOfLines={1}>{c.name}</Text>
            {c.verified && <View style={{ marginLeft: 4 }}><Icon name="checkCircle" size={16} color={C.blue} /></View>}
            {c.pro && <Text style={st.pro}>PRO</Text>}
          </View>
          <Text style={st.cardSub} numberOfLines={1}>{school ? school.name : 'Independent instructor'} · {c.homeAirport}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <Stars rating={c.rating} count={c.reviewCount} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={st.price}>{money(c.flightRate)}</Text>
          <Text style={st.per}>per hour</Text>
        </View>
      </View>
      <View style={st.statsRow}>
        <Text style={st.stat}><Text style={st.statNum}>{c.totalHours.toLocaleString()}</Text> hrs</Text>
        <Text style={st.stat}><Text style={st.statNum}>{c.passRate}%</Text> pass rate</Text>
        <Text style={st.stat}><Text style={st.statNum}>{c.yearsInstructing}</Text> yrs teaching</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {c.certs.map((x) => <Tag key={x} label={x} />)}
        {c.specialties.slice(0, 2).map((x) => <Tag key={x} label={x} color={C.sub} bg="#F1F5F9" />)}
      </View>
      {flies.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
          <Icon name="plane" size={14} color={C.sub} />
          <Text style={{ color: C.sub, fontSize: 12, marginLeft: 6, flex: 1 }} numberOfLines={1}>Teaches in {flies.map((p) => `${p.make} ${p.model.split(' ')[0]}`).join(', ')}</Text>
        </View>
      )}
    </Card>
  );
}

export function PlaneCard({ p, nav }) {
  const uri = p.photos && p.photos[0];
  return (
    <Card onPress={() => nav.push('Plane', { id: p.id })} style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ height: 132, backgroundColor: C.sky }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: 132 }} resizeMode="cover" /> : <AircraftArt kind={p.art} color={p.color} tail={p.tail} height={132} />}
        <View style={st.pricePill}><Text style={{ color: '#fff', fontWeight: '900' }}>{money(p.wetRate)}<Text style={{ fontWeight: '600', fontSize: 11 }}>/hr wet</Text></Text></View>
      </View>
      <View style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[st.cardTitle, { flex: 1 }]} numberOfLines={1}>{p.year} {p.make} {p.model}</Text>
          <Stars rating={p.rating} count={p.reviewCount} />
        </View>
        <Text style={st.cardSub}>{p.tail} · {p.homeAirport} · {p.ownerName}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          <OwnerBadge type={p.ownerType} />
          {p.category === 'Multi' && <Tag label="Multi-engine" color="#9333EA" bg="#F3E8FF" />}
          {p.ifr && <Tag label="IFR" />}
          {p.soloRental ? <Tag label="Solo rental OK" color={C.green} bg="#E3F7EF" /> : <Tag label="With a CFI" color="#B45309" bg="#FEF3C7" />}
        </View>
      </View>
    </Card>
  );
}

export function SchoolCard({ x, nav }) {
  const { cfisForSchool, planesForSchool } = useStore();
  const cfis = cfisForSchool(x.id);
  const planes = planesForSchool(x.id);
  const from = planes.length ? Math.min(...planes.map((p) => p.wetRate)) : null;
  return (
    <Card onPress={() => nav.push('School', { id: x.id })}>
      <View style={{ flexDirection: 'row' }}>
        <View style={[st.logo, { backgroundColor: x.color }]}><Text style={st.logoText}>{x.initials}</Text></View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={st.cardTitle}>{x.name}</Text>
          <Text style={st.cardSub}>{x.homeAirport} · {x.trainingTypes.join(' & ')}{x.vaApproved ? ' · VA approved' : ''}</Text>
          <View style={{ marginTop: 3 }}><Stars rating={x.rating} count={x.reviewCount} /></View>
        </View>
      </View>
      <View style={st.schoolRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {cfis.slice(0, 4).map((c, i) => (
            <View key={c.id} style={{ marginLeft: i ? -10 : 0, borderWidth: 2, borderColor: '#fff', borderRadius: 20 }}>
              <Avatar initials={c.initials} color={c.color} size={30} photo={c.photo} />
            </View>
          ))}
          <Text style={[st.cardSub, { marginLeft: 8 }]}>{cfis.length} instructors</Text>
        </View>
        <Text style={st.cardSub}>{planes.length} aircraft{from != null ? ` · from ${money(from)}/hr` : ''}</Text>
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: C.navy, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 18 },
  hello: { color: '#9FB3D1', fontWeight: '700', fontSize: 14 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  airport: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, minHeight: 36 },
  sticky: { backgroundColor: '#fff', paddingTop: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 14, paddingHorizontal: 12, minHeight: 46 },
  searchInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 15, color: C.text },
  filterBtn: { marginLeft: 8, width: 46, height: 46, borderRadius: 14, borderWidth: 1, borderColor: C.line },
  upNext: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#DCE7FB' },
  upIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  promo: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF7E6', borderRadius: 16, padding: 14, marginBottom: 12 },
  activeChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.sky, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8 },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  count: { color: C.sub, fontSize: 13, fontWeight: '600', flex: 1 },
  sort: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  explain: { color: C.sub, fontSize: 12, marginBottom: 10 },
  overlapAvatar: { position: 'absolute', left: 0, top: 4, borderWidth: 3, borderColor: '#fff', borderRadius: 26 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  cardSub: { color: C.sub, fontSize: 13, marginTop: 1 },
  dotSep: { color: C.sub, marginHorizontal: 6 },
  price: { fontSize: 20, fontWeight: '900', color: C.navy },
  per: { fontSize: 11, color: C.sub, fontWeight: '600' },
  pro: { color: '#7C3AED', fontSize: 10, fontWeight: '900', marginLeft: 6, backgroundColor: '#F3E8FF', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  statsRow: { flexDirection: 'row', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F4F8' },
  stat: { flex: 1, color: C.sub, fontSize: 12 },
  statNum: { color: C.text, fontWeight: '800', fontSize: 14 },
  pricePill: { position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(11,31,58,0.85)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  logo: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontWeight: '900', fontSize: 20 },
  schoolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F4F8' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  fLabel: { fontSize: 14, fontWeight: '800', color: C.text, marginTop: 14, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  airportRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F4F8', minHeight: 56 },
});
