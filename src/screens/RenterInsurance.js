import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { C, Icon } from '../ui';

// Plain links to insurers' own renter (non-owned aircraft) pages. Positive Rate isn't an
// insurance agency: no partner deal, no referral pay, no advice on coverage or limits.
// When a partner program (e.g. SkyWatch) approves us, swap in the tracked URL here.
export const RENTER_INSURERS = [
  {
    id: 'avemco', name: 'Avemco', initial: 'A', color: C.navy,
    url: 'https://www.avemco.com/products/renter',
    blurb: 'Annual renter’s policy · student pilots welcome · from $95/yr',
    short: 'Annual · from $95/yr',
  },
  {
    id: 'skywatch', name: 'SkyWatch', initial: 'S', color: C.blue,
    url: 'https://www.skywatch.ai/us/aviation',
    blurb: 'Buy by the day, week, month or year · good if you rent now and then',
    short: 'Daily to annual',
  },
];

const open = (url) => { Linking.openURL(url).catch(() => {}); };

// Pilot profile: full section with both insurers.
export function RenterInsuranceSection() {
  return (
    <View style={{ marginTop: 18 }}>
      <View style={s.headRow}>
        <Text style={s.kicker}>RENTER’S INSURANCE</Text>
      </View>
      <Text style={s.body}>The owner’s or school’s policy protects them, not you. A renter’s (non-owned aircraft) policy covers your liability and damage to the plane you fly.</Text>
      {RENTER_INSURERS.map((i) => (
        <Pressable key={i.id} onPress={() => open(i.url)} style={s.row} accessibilityRole="link" accessibilityLabel={`Get a renter’s insurance quote from ${i.name}`}>
          <View style={[s.badge, { backgroundColor: i.color }]}><Text style={s.badgeText}>{i.initial}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{i.name}</Text>
            <Text style={s.blurb}>{i.blurb}</Text>
          </View>
          <Text style={s.link}>Quote ↗</Text>
        </Pressable>
      ))}
      <Text style={s.fine}>Positive Rate isn’t an insurance agency and doesn’t recommend coverage or limits. Links open the insurer’s own site. Check each plane’s rental agreement for what it requires.</Text>
    </View>
  );
}

// Solo rental booking: compact card under the safety checks.
export function RenterInsuranceCard() {
  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Icon name="info" size={18} color={C.blue} />
        <Text style={[s.name, { marginLeft: 8 }]}>Flying solo? Cover yourself.</Text>
      </View>
      <Text style={[s.body, { color: '#334155', marginTop: 6 }]}>The owner’s policy protects the owner. If something happens, their insurer can bill you. A renter’s policy covers that.</Text>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {RENTER_INSURERS.map((i, n) => (
          <Pressable key={i.id} onPress={() => open(i.url)} style={[s.chip, n === 0 && { marginRight: 8 }]} accessibilityRole="link" accessibilityLabel={`Get a renter’s insurance quote from ${i.name}`}>
            <Text style={[s.name, { fontSize: 14 }]}>{i.name} ↗</Text>
            <Text style={s.blurb}>{i.short}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[s.fine, { color: '#475569', marginTop: 8 }]}>Positive Rate isn’t an insurance agency. Links open the insurer’s site.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: C.sub },
  body: { fontSize: 13, lineHeight: 19, color: '#475569', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, marginBottom: 8, minHeight: 44 },
  badge: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  name: { fontWeight: '800', fontSize: 15, color: C.text },
  blurb: { fontSize: 12.5, color: C.sub, marginTop: 2 },
  link: { fontSize: 13, fontWeight: '700', color: C.blue, marginLeft: 8 },
  fine: { fontSize: 11.5, lineHeight: 16, color: C.sub },
  card: { backgroundColor: C.sky, borderWidth: 1, borderColor: '#C7DBFB', borderRadius: 14, padding: 14, marginBottom: 12 },
  chip: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: '#C7DBFB', borderRadius: 10, padding: 10, minHeight: 44 },
});
