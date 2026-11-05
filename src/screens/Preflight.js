import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, RefreshControl, Platform } from 'react-native';
import { C, Card, Button, Chip, SectionTitle, Tag } from '../ui';
import { Header } from './Details';
import { CheckList } from './Booking';
import { useStore } from '../store';
import { usePilot } from '../backend/pilot';
import { aircraftChecks } from '../aircraftStatus';
import { renterChecks, ymdIn } from '../renterChecks';
import { fetchWeather, weatherChecks, verdict, windText, IMSAFE, CATEGORY_INFO } from '../preflight';

const VERDICT = {
  go: ['GO', 'Everything checks out. You’re the pilot in command: make the final call.', C.green, '#E3F7EF', '#A7F3D0'],
  caution: ['CAUTION', 'Nothing blocks the flight, but review the items marked ! before you go.', '#B45309', '#FEF3C7', '#FCD34D'],
  'no-go': ['NO-GO', 'Something has to be fixed before this flight.', '#DC2626', '#FEE2E2', '#FCA5A5'],
};
const ago = (d) => {
  if (!d) return '';
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} hr ago`;
};

// One-screen go/no-go before a flight: weather, the plane, the pilot, and I'M SAFE.
export function Preflight({ nav, params }) {
  const { requests, teaching, getPlane, getCfi } = useStore();
  const r = [...requests, ...teaching].find((x) => x.id === params.bookingId) || null;
  const plane = getPlane(params.planeId || r?.planeId);
  const cfi = getCfi(r?.cfiId);
  const solo = !r?.cfiId;
  const asInstructor = !!r && teaching.some((x) => x.id === r.id);
  const start = r?.when ? new Date(r.when) : new Date();
  const airport = (plane?.homeAirport || cfi?.homeAirport || 'KPIE').toUpperCase();
  const me = usePilot();
  const [wx, setWx] = useState({ loading: true, metar: null, taf: '', error: '' });
  const [imsafe, setImsafe] = useState({});
  const [showRaw, setShowRaw] = useState(false);

  const loadWx = async () => {
    setWx((w) => ({ ...w, loading: true, error: '' }));
    try { const res = await fetchWeather(airport); setWx({ loading: false, ...res, error: res.metar ? '' : 'No current report for ' + airport }); }
    catch (e) { setWx({ loading: false, metar: null, taf: '', error: 'Couldn’t load weather. Check your connection.' }); }
  };
  useEffect(() => { loadWx(); }, [airport]);

  const fh = Number(r?.flightHours || 1);
  const air = plane ? aircraftChecks({ plane, squawks: plane.squawks || [], flightHours: fh, day: ymdIn(start), include100hr: true }) : [];
  // Solo: the renter's own legality. (Checkout is already settled: they booked.)
  const pilot = solo && plane && !asInstructor && me.profile
    ? renterChecks({ profile: me.profile, checkout: { status: 'approved', soloUntil: me.checkoutFor(plane.id)?.soloUntil || '9999-12-31' }, plane, flightHours: fh, start })
      .filter((c) => !['checkout', 'solo', '100hr'].includes(c.key))
    : [];
  const weather = weatherChecks(wx.metar, { solo: solo && !asInstructor });
  const all = [...air, ...pilot, ...weather];
  const v = wx.loading ? null : verdict(all, imsafe);
  const vi = v ? VERDICT[v] : null;
  const cat = wx.metar ? CATEGORY_INFO[wx.metar.category] : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Preflight" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={wx.loading} onRefresh={loadWx} />}>
        <Text style={ps.sub}>{r ? `${r.goal} · ${r.date} ${r.time}` : 'Today'}{plane ? ` · ${plane.tail}` : ''} · {airport}</Text>

        {vi ? (
          <Card style={{ backgroundColor: vi[3], borderWidth: 1.5, borderColor: vi[4], marginTop: 10 }}>
            <Text style={{ fontSize: 28, fontWeight: '900', color: vi[2], letterSpacing: 1 }}>{vi[0]}</Text>
            <Text style={{ color: C.text, marginTop: 4, lineHeight: 19 }}>{vi[1]}</Text>
          </Card>
        ) : <Card style={{ marginTop: 10 }}><Text style={ps.sub}>Checking weather…</Text></Card>}

        <SectionTitle right={cat ? <Tag label={cat.label} color={cat.color} bg={cat.bg} /> : null}>Weather at {airport}</SectionTitle>
        <Card>
          {wx.metar ? (
            <>
              <Text style={{ fontWeight: '800', color: C.text }}>{windText(wx.metar)}</Text>
              <Text style={ps.sub}>
                {wx.metar.visibilityText ? `Visibility ${wx.metar.visibilityText} SM · ` : ''}{wx.metar.ceiling ? `Ceiling ${wx.metar.ceiling.toLocaleString('en-US')} ft` : 'No ceiling'}
                {wx.metar.temp != null ? ` · ${Math.round(wx.metar.temp)}°C / ${Math.round(wx.metar.dewpoint)}°C` : ''}{wx.metar.altimeterInHg ? ` · ${wx.metar.altimeterInHg.toFixed(2)}"` : ''}
              </Text>
              <Text style={[ps.sub, { marginTop: 2 }]}>Observed {ago(wx.metar.observed)}</Text>
              <Pressable onPress={() => setShowRaw(!showRaw)} style={{ marginTop: 6 }} accessibilityRole="button">
                <Text style={{ color: C.blue, fontWeight: '700' }}>{showRaw ? 'Hide' : 'Show'} METAR{wx.taf ? ' & TAF' : ''}</Text>
              </Pressable>
              {showRaw && <Text style={ps.raw} selectable>{wx.metar.raw}{wx.taf ? `\n\n${wx.taf}` : ''}</Text>}
            </>
          ) : <Text style={ps.sub}>{wx.loading ? 'Loading…' : wx.error}</Text>}
          <CheckList checks={weather} />
          <Pressable onPress={() => Linking.openURL('https://www.1800wxbrief.com').catch(() => {})} accessibilityRole="link" style={{ marginTop: 4 }}>
            <Text style={{ color: C.blue, fontWeight: '700' }}>Get an official briefing (1800wxbrief) ›</Text>
          </Pressable>
          <Text style={[ps.sub, { fontSize: 11, marginTop: 6 }]}>From aviationweather.gov. A planning aid, not a briefing: 14 CFR 91.103 asks you to review weather, fuel, runways and NOTAMs before every flight.</Text>
        </Card>

        {plane && (
          <>
            <SectionTitle right={plane.live ? <Pressable onPress={() => nav.push('ReportSquawk', { planeId: plane.id, bookingId: r?.id })} accessibilityRole="button"><Text style={{ color: C.blue, fontWeight: '800' }}>Report squawk</Text></Pressable> : null}>
              {plane.tail}
            </SectionTitle>
            <Card><CheckList checks={air} />{air.length === 1 && air[0].ok && <Text style={[ps.sub, { fontSize: 12 }]}>Look over the open squawks on the walkaround, too.</Text>}</Card>
          </>
        )}

        {pilot.length > 0 && (
          <>
            <SectionTitle right={<Pressable onPress={() => nav.push('PilotProfile')} accessibilityRole="button"><Text style={{ color: C.blue, fontWeight: '800' }}>Update</Text></Pressable>}>You</SectionTitle>
            <Card><CheckList checks={pilot} /></Card>
          </>
        )}
        {solo && !asInstructor && !me.profile && me.signedIn && !me.loading && (
          <Card><Text style={ps.sub}>Add your pilot profile to check your medical, flight review and currency here.</Text><Button title="Add pilot profile" variant="outline" small style={{ marginTop: 8 }} onPress={() => nav.push('PilotProfile')} /></Card>
        )}

        <SectionTitle>I’M SAFE</SectionTitle>
        <Card>
          {IMSAFE.map((i) => (
            <View key={i.key} style={ps.safeRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: C.text }}>{i.label}</Text>
                <Text style={ps.sub}>{i.ask}</Text>
              </View>
              <Chip small label="Yes" active={imsafe[i.key] === true} onPress={() => setImsafe((x) => ({ ...x, [i.key]: true }))} />
              <Chip small label="No" active={imsafe[i.key] === false} onPress={() => setImsafe((x) => ({ ...x, [i.key]: false }))} />
            </View>
          ))}
          {IMSAFE.some((i) => imsafe[i.key] === false) && <Text style={[ps.sub, { color: '#B91C1C', fontWeight: '700', marginTop: 6 }]}>Not today is a good decision. Cancel for free if it’s weather; message your {solo ? 'owner' : 'instructor'} otherwise.</Text>}
        </Card>
      </ScrollView>
    </View>
  );
}

const ps = StyleSheet.create({
  sub: { color: C.sub, fontSize: 13, lineHeight: 18 },
  raw: { fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }), fontSize: 12, color: C.text, marginTop: 6, backgroundColor: '#F1F5F9', padding: 8, borderRadius: 8 },
  safeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
});
