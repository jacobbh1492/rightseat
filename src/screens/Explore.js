import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Image, StyleSheet } from 'react-native';
import { useStore, money } from '../store';
import { AIRPORTS, OWNER_TYPES } from '../data';
import { C, Card, Chip, Avatar, Tag, Stars, Icon, IconButton, Sheet, Button, Tabs, Logo, Slider } from '../ui';
import { AircraftArt } from '../art';
import { cfiScore } from '../logic';
import { nextOpening, planeStatus, plural } from '../listingInfo';
import { Header } from './Details';

const MODES = [
  { key: 'combo', label: 'Lessons' },
  { key: 'cfi', label: 'Instructors' },
  { key: 'plane', label: 'Planes' },
  { key: 'school', label: 'Schools' },
];
const GOALS = ['Discovery flights', 'Private Pilot', 'Instrument', 'Commercial', 'Multi-engine', 'Tailwheel', 'Flight review (BFR)', 'CFI training'];
const NO_MAX = 9999;
const DEFAULTS = { airport: 'All', goal: 'Any', price: NO_MAX, glass: false, ifr: false, solo: false, owner: 'Any' };

export default function Explore({ nav }) {
  const store = useStore();
  const { schools, getPlane, getCfi, profile, setProfile, requests, favorites } = store;
  // Only verified live listings appear in search; drafts and unverified ones can't be booked yet.
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

  const glassOk = (p) => p.panel === 'glass' || p.avionics.some((a) => /G1000|G3X|Aspen|G5|Glass/i.test(a));
  const planeOk = (p, F = f) =>
    (F.airport === 'All' || p.homeAirport === F.airport) && (!F.glass || glassOk(p)) && (!F.ifr || p.ifr) && (!F.solo || p.soloRental) && (F.owner === 'Any' || p.ownerType === F.owner) &&
    (!query || `${p.tail} ${p.make} ${p.model} ${p.homeAirport} ${p.ownerName}`.toLowerCase().includes(query));
  const cfiOk = (c, F = f) =>
    (F.airport === 'All' || c.homeAirport === F.airport || c.alsoTeachesAt.includes(F.airport)) && (F.goal === 'Any' || c.specialties.includes(F.goal)) &&
    (!query || `${c.name} ${c.homeAirport} ${c.specialties.join(' ')} ${c.certs.join(' ')}`.toLowerCase().includes(query));
  const near = (code) => (code === home ? 0 : 1);

  // Lessons: one group per instructor, with every plane they teach in (and its all-in price).
  const compute = (F) => {
    const groups = [];
    cfis.filter((c) => cfiOk(c, F)).forEach((c) => {
      const options = c.aircraftIds.map((pid) => getPlane(pid)).filter(Boolean)
        .filter((p) => (F.airport === 'All' || p.homeAirport === F.airport) && (!F.glass || glassOk(p)) && (!F.ifr || p.ifr))
        .map((p) => ({ p, hourly: c.flightRate + p.wetRate }))
        .filter((o) => o.hourly <= F.price)
        .sort((a, b) => a.hourly - b.hourly);
      if (options.length) groups.push({ c, options, from: options[0].hourly });
    });
    return {
      combo: groups.sort((a, b) => (sort === 'price' ? a.from - b.from : near(a.c.homeAirport) - near(b.c.homeAirport) || cfiScore(b.c) - cfiScore(a.c))),
      cfi: cfis.filter((c) => cfiOk(c, F) && c.flightRate <= F.price).sort((a, b) => (sort === 'price' ? a.flightRate - b.flightRate : near(a.homeAirport) - near(b.homeAirport) || cfiScore(b) - cfiScore(a))),
      plane: planes.filter((p) => planeOk(p, F) && p.wetRate <= F.price).sort((a, b) => (sort === 'price' ? a.wetRate - b.wetRate : near(a.homeAirport) - near(b.homeAirport) || b.rating - a.rating)),
      school: schools.filter((x) => (F.airport === 'All' || x.homeAirport === F.airport) && (!query || `${x.name} ${x.homeAirport}`.toLowerCase().includes(query))),
    };
  };
  const results = useMemo(() => compute(f), [cfis, planes, schools, f, query, sort, mode]);
  const draftCount = compute(draft)[mode].length;
  const list = results[mode];
  const priceOf = (x) => (mode === 'combo' ? x.from : mode === 'cfi' ? x.flightRate : mode === 'plane' ? x.wetRate : 0);
  // Price range for the slider: every all-in (or single) price in this tab, ignoring the price filter.
  const unpriced = useMemo(() => compute({ ...draft, price: NO_MAX })[mode], [draft, mode, cfis, planes, query]);
  const prices = unpriced.map(priceOf).filter(Boolean);
  const pMin = prices.length ? Math.floor(Math.min(...prices) / 10) * 10 : 0;
  const pMax = prices.length ? Math.ceil(Math.max(...prices) / 10) * 10 : 500;

  const active = [];
  if (f.airport !== 'All') active.push(['airport', f.airport]);
  if (f.goal !== 'Any' && (mode === 'combo' || mode === 'cfi')) active.push(['goal', f.goal]);
  if (f.price !== NO_MAX) active.push(['price', `Up to ${money(f.price)}/hr`]);
  if (f.glass) active.push(['glass', 'Glass panel']);
  if (f.ifr) active.push(['ifr', 'IFR']);
  if (f.solo) active.push(['solo', 'Solo rental']);
  if (f.owner !== 'Any') active.push(['owner', f.owner]);
  const clear = (k) => setF({ ...f, [k]: DEFAULTS[k] });

  const upcoming = requests.filter((r) => ['Pending', 'Confirmed'].includes(r.status)).sort((a, b) => new Date(a.when) - new Date(b.when))[0];
  const upCfi = upcoming && getCfi(upcoming.cfiId);
  const upPlane = upcoming && getPlane(upcoming.planeId);
  const noun = { combo: 'instructor', cfi: 'instructor', plane: 'plane for rent', school: 'flight school' }[mode];
  const countLine = mode === 'combo'
    ? `${plural(list.length, 'instructor')} · ${plural(list.reduce((n, g) => n + g.options.length, 0), 'plane option')} near ${f.airport === 'All' ? home : f.airport}`
    : `${plural(list.length, noun, mode === 'plane' ? 'planes for rent' : undefined)} near ${f.airport === 'All' ? home : f.airport}`;

  // Empty results: what's the cheapest thing without the price filter, and close matches.
  const relaxed = f.price !== NO_MAX ? compute({ ...f, price: NO_MAX })[mode] : [];
  const cheapest = relaxed.length ? Math.min(...relaxed.map(priceOf)) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} stickyHeaderIndices={[1]} keyboardShouldPersistTaps="handled">
        <View style={st.hero}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Logo size={30} />
            <Text style={st.title} accessibilityRole="header" numberOfLines={1}>Find your next flight</Text>
              <Pressable onPress={() => setAirportSheet(true)} style={st.airport} accessibilityRole="button" accessibilityLabel={`Home airport ${home}. Change`}>
                <Icon name="pin" size={15} color={C.amber} />
                <Text style={{ color: '#fff', fontWeight: '700', marginHorizontal: 4 }}>{home}</Text>
                <Icon name="down" size={14} color="#fff" />
              </Pressable>
          </View>
          <View style={st.searchRow}>
            <View style={st.search}>
              <Icon name="search" size={18} color={C.sub} />
              <TextInput value={q} onChangeText={setQ} placeholder="Instructor, aircraft or airport" placeholderTextColor={C.placeholder} style={st.searchInput} accessibilityLabel="Search" />
              {q ? <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Clear search"><Icon name="x" size={16} color={C.sub} /></Pressable> : null}
            </View>
            <Pressable onPress={() => nav.push('Saved')} style={st.savedBtn} accessibilityRole="button" accessibilityLabel={`Saved${favorites.length ? `, ${favorites.length}` : ''}`}>
              <Icon name="heart" size={20} color="#fff" />
              {favorites.length ? <View style={st.fBadge}><Text style={st.fBadgeText}>{favorites.length}</Text></View> : null}
            </Pressable>
            <Pressable onPress={() => { setDraft(f); setSheet(true); }} style={st.filterBtn} accessibilityRole="button" accessibilityLabel={`Filters${active.length ? `, ${active.length} on` : ''}`}>
              <Icon name="sliders" size={20} color={C.navy} strokeWidth={2.2} />
              {active.length ? <View style={st.fBadge}><Text style={st.fBadgeText}>{active.length}</Text></View> : null}
            </Pressable>
          </View>
        </View>

        <View style={st.sticky}>
          <Tabs tabs={MODES} value={mode} onChange={setMode} />
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          {mode === 'combo' && upcoming && !query && (
            <Pressable onPress={() => nav.goTab('Lessons')} style={st.upNext} accessibilityRole="button">
              <View style={st.upIcon}><Icon name="calendar" size={20} color={C.navy} /></View>
              <View style={{ flex: 1 }}>
                <Text style={st.kicker}>Up next · {upcoming.status}</Text>
                <Text style={{ fontWeight: '800', color: C.text, marginTop: 1 }}>{upcoming.goal}</Text>
                <Text style={{ color: C.sub, fontSize: 13 }}>{upcoming.date} · {upcoming.time}{upCfi ? ` · ${upCfi.name.split(' ')[0]}` : ''}{upPlane ? ` · ${upPlane.tail}` : ''}</Text>
              </View>
              <Icon name="chevron" size={18} color={C.chevron} />
            </Pressable>
          )}

          {(mode === 'combo' || mode === 'cfi') && !query && (
            <Pressable onPress={() => nav.push('GetMatched')} style={st.banner} accessibilityRole="button">
              <Icon name="users" size={18} color={C.amberDark} />
              <Text style={st.bannerText}>{profile.stage === 'new' ? 'New to flying? Get matched for a discovery flight' : 'Not sure who to pick? Get matched'}</Text>
              <Icon name="chevron" size={16} color={C.amberDark} />
            </Pressable>
          )}

          {active.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {active.map(([k, label]) => (
                <Pressable key={k} onPress={() => clear(k)} style={st.activeChip} accessibilityRole="button" accessibilityLabel={`Remove filter ${label}`}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{label}</Text>
                  <Icon name="x" size={14} color="#fff" />
                </Pressable>
              ))}
              <Pressable onPress={() => setF(DEFAULTS)} style={[st.activeChip, st.clearChip]} accessibilityRole="button"><Text style={{ color: C.navy, fontWeight: '700', fontSize: 13 }}>Clear all</Text></Pressable>
            </ScrollView>
          )}

          {list.length > 0 && (
            <View style={st.countRow}>
              <Text style={st.count}>{countLine}</Text>
              {mode !== 'school' && (
                <Pressable onPress={() => setSort(sort === 'best' ? 'price' : 'best')} style={st.sort} accessibilityRole="button" accessibilityLabel={`Sort: ${sort === 'best' ? 'Best match' : 'Lowest price'}. Change`}>
                  <Text style={{ color: C.navy, fontWeight: '700', fontSize: 13 }}>{sort === 'best' ? 'Best match' : 'Lowest price'}</Text>
                  <Icon name="down" size={14} color={C.navy} />
                </Pressable>
              )}
            </View>
          )}
          {mode === 'combo' && list.length > 0 && <Text style={st.explain}>Price per flight hour = instructor + plane, fuel included</Text>}

          {mode === 'combo' && list.map((g) => <LessonGroup key={g.c.id} g={g} nav={nav} />)}
          {mode === 'cfi' && list.map((c) => <CfiCard key={c.id} c={c} nav={nav} />)}
          {mode === 'cfi' && list.length > 0 && <Text style={st.foot}>*Self-reported by the instructor.</Text>}
          {mode === 'plane' && list.map((p) => <PlaneCard key={p.id} p={p} nav={nav} />)}
          {mode === 'school' && list.map((x) => <SchoolCard key={x.id} x={x} nav={nav} />)}

          {list.length === 0 && (
            <View style={st.empty}>
              <View style={st.emptyIcon}><Icon name="search" size={28} color={C.navy} /></View>
              <Text style={st.emptyTitle}>No {mode === 'combo' ? 'lessons' : mode === 'cfi' ? 'instructors' : mode === 'plane' ? 'planes' : 'schools'} match</Text>
              {cheapest != null ? (
                <>
                  <Text style={st.emptySub}>{mode === 'combo' ? 'Lessons' : mode === 'cfi' ? 'Instructors' : 'Planes'} near {f.airport === 'All' ? home : f.airport} start at {money(cheapest)}/hr, above your {money(f.price)} limit.</Text>
                  <Button title={`Show options up to ${money(Math.ceil(cheapest / 10) * 10)}/hr`} style={{ marginTop: 14, alignSelf: 'stretch' }} onPress={() => setF({ ...f, price: Math.ceil(cheapest / 10) * 10 })} />
                </>
              ) : (
                <Text style={st.emptySub}>{active.length ? 'Remove a filter to see more.' : query ? `Nothing matches “${q.trim()}”. Try a name, tail number or airport code.` : 'Nothing listed here yet. Try another airport.'}</Text>
              )}
              {active.length > 0 && <Button title="Clear all filters" variant="ghost" small style={{ marginTop: 6 }} onPress={() => setF(DEFAULTS)} />}
            </View>
          )}
          {list.length === 0 && relaxed.length > 0 && (
            <>
              <Text style={st.section}>Close matches</Text>
              {mode === 'combo' && relaxed.slice(0, 2).map((g) => <LessonGroup key={g.c.id} g={g} nav={nav} />)}
              {mode === 'cfi' && relaxed.slice(0, 2).map((c) => <CfiCard key={c.id} c={c} nav={nav} />)}
              {mode === 'plane' && relaxed.slice(0, 2).map((p) => <PlaneCard key={p.id} p={p} nav={nav} />)}
            </>
          )}
        </View>
      </ScrollView>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Filters"
        footer={
          <>
            <Button title="Clear all" variant="ghost" style={{ flex: 0.6, marginRight: 8 }} onPress={() => setDraft(DEFAULTS)} />
            <Button title={draftCount ? `Show ${draftCount} result${draftCount === 1 ? '' : 's'}` : 'No results'} disabled={!draftCount} style={{ flex: 1 }} onPress={() => { setF(draft); setSheet(false); }} />
          </>
        }
      >
        {mode !== 'school' && prices.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={st.fLabel}>{mode === 'combo' ? 'All-in price per hour' : mode === 'cfi' ? 'Instructor rate per hour' : 'Rental per hour (wet)'}</Text>
              <Text style={{ fontWeight: '800', color: C.text }}>{draft.price >= pMax || draft.price === NO_MAX ? 'Any price' : `Up to ${money(draft.price)}`}</Text>
            </View>
            <Slider value={Math.min(draft.price, pMax)} min={pMin} max={pMax} step={10} label="Maximum price per hour" format={(v) => `${money(v)} per hour`}
              onChange={(v) => setDraft((d) => ({ ...d, price: v >= pMax ? NO_MAX : v }))} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={st.range}>{money(pMin)}</Text><Text style={st.range}>{money(pMax)}+</Text>
            </View>
          </>
        )}
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
        {(mode === 'combo' || mode === 'plane') && (
          <>
            <Text style={st.fLabel}>Aircraft</Text>
            <View style={st.wrap}>
              <Chip small label="Glass panel" active={draft.glass} onPress={() => setDraft({ ...draft, glass: !draft.glass })} />
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
          <Pressable key={a.code} onPress={() => { setProfile({ airport: a.code }); setAirportSheet(false); }} style={st.airportRow} accessibilityRole="radio" accessibilityState={{ checked: a.code === home }}>
            <Icon name="pin" size={18} color={a.code === home ? C.navy : C.sub} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontWeight: '800', color: C.text }}>{a.code}</Text>
              <Text style={{ color: C.sub, fontSize: 13 }}>{a.name}</Text>
            </View>
            {a.code === home && <Icon name="check" size={18} color={C.navy} />}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

// Plane photo, or the drawing when the owner hasn't added one.
export function PlanePhoto({ p, height, width = '100%', radius = 0 }) {
  const uri = p.photos && p.photos[0];
  return (
    <View style={{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: C.sky }}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height }} resizeMode="cover" accessibilityLabel={`${p.make} ${p.model} photo`} />
        : <AircraftArt kind={p.art} color={p.color} tail={p.tail} height={height} />}
    </View>
  );
}

function VerifiedMark({ on }) {
  return on ? <View style={{ marginLeft: 6 }} accessible accessibilityLabel="Verified"><Icon name="shieldCheck" size={16} color={C.green} strokeWidth={2.2} /></View> : null;
}

// One instructor with every plane they teach in.
function LessonGroup({ g, nav }) {
  const { c, options } = g;
  return (
    <Card style={{ paddingBottom: 6 }}>
      <Pressable onPress={() => nav.push('Cfi', { id: c.id })} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }} accessibilityRole="button" accessibilityLabel={`${c.name}, instructor profile`}>
        <Avatar initials={c.initials} color={c.color} photo={c.photo} size={48} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={st.cardTitle} numberOfLines={1}>{c.name}</Text>
            <VerifiedMark on={c.verified} />
          </View>
          <Stars rating={c.rating} count={c.reviewCount} />
        </View>
      </Pressable>
      {options.map(({ p, hourly }) => (
        <Pressable key={p.id} onPress={() => nav.push('Request', { cfiId: c.id, planeId: p.id })} style={st.option} accessibilityRole="button"
          accessibilityLabel={`Book with ${c.name.split(' ')[0]} in ${p.year} ${p.make} ${p.model}, ${money(hourly)} per hour`}>
          <PlanePhoto p={p} height={44} width={44} radius={10} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{p.year} {p.make} {p.model}{p.category === 'Multi' ? ' (twin)' : ''}</Text>
            <Text style={{ fontSize: 12, color: C.sub }}>{p.tail} · {p.homeAirport}</Text>
          </View>
          <Text style={st.optPrice}>{money(hourly)}<Text style={st.per}>/hr</Text></Text>
          <Icon name="chevron" size={16} color={C.chevron} />
        </Pressable>
      ))}
    </Card>
  );
}

export function CfiCard({ c, nav }) {
  const { getSchool } = useStore();
  const school = c.schoolId ? getSchool(c.schoolId) : null;
  const next = nextOpening(c);
  return (
    <Card onPress={() => nav.push('Cfi', { id: c.id })}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Avatar initials={c.initials} color={c.color} photo={c.photo} size={56} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[st.cardTitle, { flexShrink: 1 }]} numberOfLines={1}>{c.name}</Text>
            <VerifiedMark on={c.verified} />
          </View>
          <Text style={st.cardSub} numberOfLines={1}>{school ? school.name : 'Independent instructor'} · {c.homeAirport}</Text>
          <Stars rating={c.rating} count={c.reviewCount} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={st.price}>{money(c.flightRate)}</Text>
          <Text style={st.per}>per hour</Text>
        </View>
      </View>
      <View style={st.statsRow}>
        <View style={st.statBox}><Text style={st.statNum}>{c.totalHours.toLocaleString()}*</Text><Text style={st.statLbl}>Total hrs</Text></View>
        <View style={st.statBox}><Text style={st.statNum}>{c.passRate}%*</Text><Text style={st.statLbl}>1st-time pass</Text></View>
        <View style={st.statBox}><Text style={st.statNum}>{c.yearsInstructing}*</Text><Text style={st.statLbl}>Yrs teaching</Text></View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
        {[...c.certs, ...c.specialties.slice(0, 2)].map((x) => <Tag key={x} label={x} color={C.text} bg={C.sky} />)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
        {next ? <><Icon name="clock" size={16} color={C.green} /><Text style={st.next}>Next opening {next.label}</Text></> : <Text style={[st.cardSub, { flex: 1 }]}>Message for availability</Text>}
        {c.pro ? <View style={st.promoted}><Text style={st.promotedText}>Promoted</Text></View> : null}
      </View>
    </Card>
  );
}

export function PlaneCard({ p, nav }) {
  const status = planeStatus(p);
  const tags = [p.category === 'Multi' ? 'Twin' : null, p.panel === 'glass' ? 'Glass panel' : p.panel === 'sixpack' ? 'Six-pack' : null, p.ifr ? 'IFR' : null, p.soloRental ? 'Solo rental OK' : 'With a CFI', p.ownerType].filter(Boolean);
  return (
    <Card onPress={() => nav.push('Plane', { id: p.id })} style={{ padding: 12 }}>
      <PlanePhoto p={p} height={170} radius={12} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={st.cardTitle}>{p.year} {p.make} {p.model}</Text>
          <Text style={st.cardSub}>{p.tail} · {p.homeAirport} · {p.ownerName}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={st.price}>{money(p.wetRate)}</Text>
          <Text style={st.per}>/hr wet</Text>
        </View>
      </View>
      <View style={{ marginTop: 4 }}><Stars rating={p.rating} count={p.reviewCount} /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {tags.map((t) => <Tag key={t} label={t} color={C.text} bg={C.sky} />)}
        {status && <Tag label={(status.ok ? '✓ ' : '! ') + status.label} color={status.ok ? C.green : C.amberDark} bg={status.ok ? C.greenBg : C.amberBg} />}
      </View>
    </Card>
  );
}

export function SchoolCard({ x, nav }) {
  const { cfisForSchool, planesForSchool } = useStore();
  const cfis = cfisForSchool(x.id);
  const planes = planesForSchool(x.id);
  const rates = [...cfis.map((c) => c.flightRate), ...planes.map((p) => p.wetRate)];
  const from = cfis.length && planes.length ? Math.min(...cfis.map((c) => c.flightRate)) + Math.min(...planes.map((p) => p.wetRate)) : rates.length ? Math.min(...rates) : null;
  return (
    <Card onPress={() => nav.push('School', { id: x.id })}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {x.logo ? <Image source={{ uri: x.logo }} style={st.logo} accessibilityLabel={`${x.name} logo`} />
          : <View style={[st.logo, { backgroundColor: C.navy }]}><Text style={st.logoText}>{x.initials}</Text></View>}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={st.cardTitle}>{x.name}</Text>
          <Text style={st.cardSub}>{x.homeAirport} · Part {x.trainingTypes.map((t) => t.replace('Part ', '')).join(' & ')}{x.vaApproved ? ' · VA approved' : ''}</Text>
          <Stars rating={x.rating} count={x.reviewCount} />
        </View>
      </View>
      <View style={st.schoolRow}>
        <Text style={st.cardSub}>{plural(cfis.length, 'instructor')}</Text>
        <Text style={st.cardSub}>{plural(planes.length, 'aircraft', 'aircraft')}</Text>
        {from != null ? <Text style={{ fontWeight: '800', color: C.text, fontSize: 13 }}>From {money(from)}/hr</Text> : <Text style={st.cardSub}> </Text>}
      </View>
    </Card>
  );
}

// Saved instructors and planes.
export function Saved({ nav }) {
  const { favorites, getCfi, getPlane, toggleFavorite } = useStore();
  const items = favorites.map((id) => ({ id, c: getCfi(id), p: getPlane(id) })).filter((x) => x.c || x.p);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Saved" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {items.length === 0 && (
          <View style={st.empty}>
            <View style={st.emptyIcon}><Icon name="heart" size={28} color={C.navy} /></View>
            <Text style={st.emptyTitle}>Nothing saved yet</Text>
            <Text style={st.emptySub}>Tap the heart on an instructor or plane to compare them here.</Text>
          </View>
        )}
        {items.map(({ id, c, p }) => {
          const next = c ? nextOpening(c) : null;
          return (
            <Card key={id} onPress={() => nav.push(c ? 'Cfi' : 'Plane', { id })} style={{ flexDirection: 'row', alignItems: 'center' }}>
              {c ? <Avatar initials={c.initials} color={c.color} photo={c.photo} size={48} /> : <PlanePhoto p={p} height={48} width={48} radius={10} />}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={st.cardTitle} numberOfLines={1}>{c ? c.name : `${p.year} ${p.make} ${p.model}`}</Text>
                <Text style={st.cardSub}>{c ? `${money(c.flightRate)}/hr · ${c.homeAirport}` : `${money(p.wetRate)}/hr wet · ${p.tail}`}</Text>
                {next && <Text style={[st.next, { marginLeft: 0 }]}>Next opening {next.label}</Text>}
              </View>
              <IconButton name="heart" label="Remove from saved" onPress={() => toggleFavorite(id)} color="#BE123C" bg="transparent" />
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: C.navy, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 14 },
  title: { flex: 1, color: '#fff', fontSize: 21, fontWeight: '800', marginLeft: 10, letterSpacing: -0.3 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, minHeight: 46 },
  searchInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 15, color: C.text },
  airport: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#163056', borderWidth: 1, borderColor: '#2B4670', paddingHorizontal: 12, borderRadius: 999, height: 40, marginLeft: 8 },
  savedBtn: { marginLeft: 8, width: 46, height: 46, borderRadius: 12, backgroundColor: '#163056', borderWidth: 1, borderColor: '#2B4670', alignItems: 'center', justifyContent: 'center' },
  filterBtn: { marginLeft: 8, width: 46, height: 46, borderRadius: 12, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' },
  fBadge: { position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.navy },
  fBadgeText: { color: C.navy, fontSize: 11, fontWeight: '800' },
  sticky: { backgroundColor: '#fff', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  upNext: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  upIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.amberBg, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  kicker: { color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  banner: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.amberBg, borderRadius: 14, paddingHorizontal: 12, minHeight: 44, marginBottom: 12 },
  bannerText: { flex: 1, color: C.amberDark, fontWeight: '700', fontSize: 14, marginHorizontal: 10 },
  activeChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy, borderRadius: 999, paddingHorizontal: 12, minHeight: 36, marginRight: 8 },
  clearChip: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { color: C.sub, fontSize: 13, fontWeight: '600', flex: 1 },
  sort: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: 8 },
  explain: { color: C.sub, fontSize: 12, marginBottom: 10 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line, marginTop: 6 },
  optPrice: { fontSize: 17, fontWeight: '800', color: C.text, marginRight: 4 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  cardSub: { color: C.sub, fontSize: 13, marginTop: 1 },
  price: { fontSize: 20, fontWeight: '800', color: C.text },
  per: { fontSize: 12, color: C.sub, fontWeight: '600' },
  statsRow: { flexDirection: 'row', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line },
  statBox: { flex: 1 },
  statNum: { color: C.text, fontWeight: '800', fontSize: 16 },
  statLbl: { color: C.sub, fontSize: 12 },
  next: { flex: 1, color: C.green, fontWeight: '700', fontSize: 13, marginLeft: 6 },
  promoted: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  promotedText: { color: C.sub, fontSize: 12, fontWeight: '700' },
  foot: { color: C.sub, fontSize: 12, marginBottom: 12 },
  logo: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  schoolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line },
  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 8 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontWeight: '800', color: C.text, marginTop: 12, fontSize: 17 },
  emptySub: { color: C.sub, marginTop: 4, textAlign: 'center', lineHeight: 20 },
  section: { fontSize: 19, fontWeight: '800', color: C.text, marginTop: 8, marginBottom: 10 },
  fLabel: { fontSize: 14, fontWeight: '800', color: C.text, marginTop: 14, marginBottom: 8 },
  range: { color: C.sub, fontSize: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  airportRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line, minHeight: 56 },
});
