import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { C, Button, Icon } from '../ui';

const REASONS = [
  ['check', 'Booking confirmed', 'When your instructor or the owner says yes'],
  ['cloud', 'Weather and schedule changes', 'If a lesson moves or is cancelled'],
  ['chat', 'Messages', 'From your instructor, student or renter'],
  ['book', 'New debriefs', 'As soon as your CFI writes one'],
];

// Shown once before the system prompt: iOS only asks one time, so explain first.
export default function NotifPrompt({ onAnswer }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 40, paddingBottom: 30 }}>
        <View style={n.bell}><Icon name="bell" size={34} color={C.navy} /></View>
        <Text style={n.h} accessibilityRole="header">Stay in the loop</Text>
        <Text style={n.sub}>Turn on notifications so you don’t miss:</Text>
        {REASONS.map(([icon, t, s]) => (
          <View key={t} style={n.row} accessible>
            <View style={n.tile}><Icon name={icon} size={20} color={C.navy} /></View>
            <View style={{ flex: 1 }}>
              <Text style={n.t}>{t}</Text>
              <Text style={n.s}>{s}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={n.foot}>
        <Button title="Turn on notifications" onPress={() => onAnswer(true)} />
        <Button title="Not now" variant="ghost" onPress={() => onAnswer(false)} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

const n = StyleSheet.create({
  bell: { width: 72, height: 72, borderRadius: 20, backgroundColor: C.amberBg, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  h: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  sub: { fontSize: 15, color: C.sub, marginTop: 6, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 10 },
  tile: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  t: { fontSize: 15, fontWeight: '700', color: C.text },
  s: { fontSize: 13, color: C.sub, marginTop: 2 },
  foot: { padding: 16, paddingBottom: 20, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
