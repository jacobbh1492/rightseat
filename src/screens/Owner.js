// Owner tabs: Bookings (who has the plane and when) and Earnings (by aircraft, against fixed costs).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore, money } from '../store';
import { money2 } from '../logic';
import { useAuth } from '../backend/auth';
import { fetchPlaneCheckouts } from '../backend/pilot';
import { C, Card, Field, Tag, Icon, Button } from '../ui';

const COSTS_KEY = 'rightseat.fixedCosts';

function Segments({ value, onChange, items }) {
  return (
    <View style={o.seg} accessibilityRole="tablist">
      {items.map(([k, l]) => (
        <Pressable key={k} onPress={() => onChange(k)} style={[o.segBtn, value === k && o.segOn]} accessibilityRole="tab" accessibilityState={{ selected: value === k }}>
          <Text style={{ fontWeight: '800', color: value === k ? '#fff' : C.text }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Empty({ icon, title, body, action }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 }}>
      <View style={o.emptyIcon}><Icon name={icon} size={26} color={C.navy} /></View>
      <Text style={{ fontWeight: '900', fontSize: 17, color: C.text, marginTop: 12, textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: C.sub, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>{body}</Text>
      {action}
    </View>
  );
}

export function OwnerBookings({ nav }) {
  const { teaching, myPlaneIds, getPlane } = useStore();
  const auth = useAuth();
  const [seg, setSeg] = useState('upcoming');
  const [checkouts, setCheckouts] = useState([]);
  useEffect(() => {
    let live = true;
    const ids = myPlaneIds.filter((id) => getPlane(id)?.live);
    if (auth?.session && ids.length) fetchPlaneCheckouts(ids).then((r) => live && setCheckouts(r || [])).catch(() => {});
    return () => { live = false; };
  }, [auth?.session?.user?.id, myPlaneIds.join()]);
  const rows = teaching.filter((r) => r.role === 'owner');
  const now = Date.now();
  const upcoming = rows.filter((r) => new Date(r.when).getTime() >= now - 3 * 3600e3 && !['Cancelled', 'Declined', 'Completed'].includes(r.status)).sort((a, b) => new Date(a.when) - new Date(b.when));
  const past = rows.filter((r) => !upcoming.includes(r)).sort((a, b) => new Date(b.when) - new Date(a.when));
  const waiting = checkouts.filter((c) => c.status === 'requested' || c.status === 'flown');

  const row = (r) => (
    <Card key={r.id}>
      <View style={o.rowTop}>
        <View style={o.timeCol}><Text style={o.day}>{r.date}</Text><Text style={o.time}>{r.time}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', color: C.text }}>{r.studentName}{r.cfiName ? ` with ${r.cfiName}` : ''}</Text>
          <Text style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>{r.tail} · {r.checkoutFlight ? 'Checkout flight' : r.cfiName ? 'Lesson' : 'Solo rental'} · {r.flightHours} hr</Text>
        </View>
        <Tag label={r.status === 'Completed' ? (r.payout === 'paid' ? '✓ Paid' : 'Completed') : r.status} color={r.status === 'Cancelled' ? C.sub : r.status === 'Pending' ? C.amberDark : C.green} bg={r.status === 'Cancelled' ? C.sky : r.status === 'Pending' ? C.amberBg : C.greenBg} />
      </View>
      {r.share != null && r.status !== 'Cancelled' && <Text style={{ color: C.sub, fontSize: 13, marginTop: 6 }}>You earn {money2(r.share)}{r.status === 'Completed' ? '' : ' (estimated)'}</Text>}
    </Card>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={o.h1} accessibilityRole="header">Bookings</Text>
      <Segments value={seg} onChange={setSeg} items={[['upcoming', 'Upcoming'], ['checkouts', `Checkouts${waiting.length ? ` (${waiting.length})` : ''}`], ['past', 'Past']]} />
      {!auth?.session ? (
        <Empty icon="calendar" title="Sign in to see your bookings" body="Every rental, lesson and checkout in your planes shows up here." action={<Button title="Sign in" style={{ marginTop: 14, alignSelf: 'stretch' }} onPress={() => nav.push('SignIn')} />} />
      ) : seg === 'upcoming' ? (
        upcoming.length ? upcoming.map(row) : <Empty icon="calendar" title="No upcoming bookings" body="Renters and instructors book your plane from its listing. Make sure it’s verified and the rates are right." action={myPlaneIds[0] ? <Button title="Preview my listing" variant="outline" style={{ marginTop: 14, alignSelf: 'stretch' }} onPress={() => nav.push('Plane', { id: myPlaneIds[0] })} /> : null} />
      ) : seg === 'checkouts' ? (
        <>
          {waiting.length ? waiting.map((c) => (
            <Card key={c.id || `${c.planeId}-${c.pilotId}`} onPress={() => nav.push('Checkouts')}>
              <Text style={{ fontWeight: '800', color: C.text }}>{c.pilotName || 'Pilot'}</Text>
              <Text style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>{getPlane(c.planeId)?.tail || ''} · {c.status === 'flown' ? 'Checkout flown, waiting for your approval' : 'Asked for a checkout'}</Text>
            </Card>
          )) : <Empty icon="user" title="No checkout requests" body="Pilots who want to rent solo ask for a checkout here. You approve them once the checkout is flown." />}
          <Button title="All renter checkouts" variant="outline" onPress={() => nav.push('Checkouts')} />
        </>
      ) : (
        past.length ? past.map(row) : <Empty icon="list" title="No past bookings yet" body="Completed rentals and lessons appear here with what you earned." />
      )}
    </ScrollView>
  );
}

export function OwnerEarnings({ nav }) {
  const { teaching, myPlaneIds, getPlane } = useStore();
  const auth = useAuth();
  const [costs, setCosts] = useState({});
  const [editing, setEditing] = useState(null);
  useEffect(() => { AsyncStorage.getItem(COSTS_KEY).then((v) => v && setCosts(JSON.parse(v))).catch(() => {}); }, []);
  const saveCost = (id, v) => {
    const next = { ...costs, [id]: v };
    setCosts(next);
    AsyncStorage.setItem(COSTS_KEY, JSON.stringify(next)).catch(() => {});
  };
  const done = teaching.filter((r) => r.role === 'owner' && r.status === 'Completed');
  const y = new Date().getFullYear(), m = new Date().getMonth();
  const byPlane = useMemo(() => myPlaneIds.map((id) => {
    const mine = done.filter((r) => r.planeId === id);
    const month = mine.filter((r) => { const d = new Date(r.when); return d.getFullYear() === y && d.getMonth() === m; }).reduce((a, r) => a + (r.share || 0), 0);
    const year = mine.filter((r) => new Date(r.when).getFullYear() === y).reduce((a, r) => a + (r.share || 0), 0);
    const hours = mine.reduce((a, r) => a + (r.actualHobbs || r.flightHours || 0), 0);
    return { id, plane: getPlane(id), month, year, hours, flights: mine.length };
  }).filter((x) => x.plane), [done.length, myPlaneIds.join()]);
  const month = byPlane.reduce((a, x) => a + x.month, 0);
  const year = byPlane.reduce((a, x) => a + x.year, 0);
  const held = done.filter((r) => r.payout === 'held').reduce((a, r) => a + (r.share || 0), 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Text style={o.h1} accessibilityRole="header">Earnings</Text>
      {!auth?.session ? (
        <Empty icon="dollar" title="Sign in to see your earnings" body="Rental income by aircraft, and how much of your fixed costs it covers." action={<Button title="Sign in" style={{ marginTop: 14, alignSelf: 'stretch' }} onPress={() => nav.push('SignIn')} />} />
      ) : (
        <>
          <View style={o.hero}>
            <Text style={{ color: '#C9D4E5', fontWeight: '700', fontSize: 12 }}>THIS MONTH</Text>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 32, marginTop: 2 }}>{money2(month)}</Text>
            <Text style={{ color: '#C9D4E5', marginTop: 4 }}>{money2(year)} this year · after the 8% Positive Rate fee</Text>
          </View>
          {held > 0 && (
            <Card style={{ borderWidth: 1.5, borderColor: C.amber, backgroundColor: C.amberBg }} onPress={() => nav.push('Wallet')}>
              <Text style={{ fontWeight: '900', color: C.text }}>{money2(held)} is waiting for payout setup</Text>
              <Text style={{ color: C.body, marginTop: 4 }}>Add your bank through Stripe and it’s sent right away.</Text>
            </Card>
          )}
          <Text style={o.section}>By aircraft</Text>
          {byPlane.length === 0 && <Empty icon="plane" title="No planes yet" body="List a plane and its rental income shows up here." action={<Button title="List a plane" style={{ marginTop: 14, alignSelf: 'stretch' }} onPress={() => nav.push('PlaneForm')} />} />}
          {byPlane.map((x) => {
            const fixed = Number(costs[x.id] || 0);
            const pct = fixed > 0 ? Math.min(1, x.year / fixed) : 0;
            return (
              <Card key={x.id}>
                <View style={o.rowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '900', color: C.text, fontSize: 16 }}>{x.plane.tail}</Text>
                    <Text style={{ color: C.sub, fontSize: 13 }}>{x.plane.make} {x.plane.model} · {x.flights} flight{x.flights === 1 ? '' : 's'} · {Math.round(x.hours * 10) / 10} hr</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontWeight: '900', color: C.text, fontSize: 16 }}>{money2(x.month)}</Text>
                    <Text style={{ color: C.sub, fontSize: 12 }}>this month</Text>
                  </View>
                </View>
                {fixed > 0 ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ fontWeight: '800', color: C.text }}>Covered {Math.round(pct * 100)}% of fixed costs</Text>
                    <View style={o.bar} accessible accessibilityLabel={`${money(x.year)} of ${money(fixed)} yearly fixed costs covered`}><View style={[o.barFill, { width: `${pct * 100}%` }]} /></View>
                    <Text style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>{money(x.year)} of {money(fixed)} a year (hangar, insurance, annual)</Text>
                  </View>
                ) : null}
                {editing === x.id ? (
                  <View style={{ marginTop: 10 }}>
                    <Field label="Yearly fixed costs" prefix="$" keyboardType="numeric" value={String(costs[x.id] || '')} onChangeText={(v) => saveCost(x.id, v.replace(/[^0-9]/g, ''))} placeholder="e.g. 9600" />
                    <Button title="Done" small variant="outline" onPress={() => setEditing(null)} />
                  </View>
                ) : (
                  <Pressable onPress={() => setEditing(x.id)} style={{ minHeight: 44, justifyContent: 'center', marginTop: 4 }} accessibilityRole="button">
                    <Text style={{ color: C.blue, fontWeight: '800' }}>{fixed ? 'Edit fixed costs' : 'Add fixed costs to see what rentals cover'}</Text>
                  </Pressable>
                )}
              </Card>
            );
          })}
          <Text style={{ color: C.sub, fontSize: 12, marginTop: 6, lineHeight: 18 }}>Fixed costs stay on this phone. Payouts go to the owner’s bank about 2 business days after each flight is closed out.</Text>
        </>
      )}
    </ScrollView>
  );
}

const o = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '900', color: C.text, marginBottom: 12 },
  section: { fontSize: 13, fontWeight: '800', color: C.sub, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  seg: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 4, marginBottom: 14 },
  segBtn: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.navy },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.amberBg, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  timeCol: { width: 70, marginRight: 10 },
  day: { color: C.sub, fontSize: 12, fontWeight: '700' },
  time: { color: C.text, fontWeight: '900' },
  hero: { backgroundColor: C.navy, borderRadius: 18, padding: 18, marginBottom: 12 },
  bar: { height: 10, borderRadius: 5, backgroundColor: C.sky, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 10, borderRadius: 5, backgroundColor: C.amber },
});
