// Enter a launch promo code (Runup, Hold Short, Short Final) and see the ones you've redeemed.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { C, Card, Field, Button, SectionTitle, Icon } from '../ui';
import { Header } from './Details';
import { PROMOS, normalizePromo, isActive } from '../promos';

const byLabel = (code) => Object.values(PROMOS).find((p) => normalizePromo(p.label) === normalizePromo(code));
const endLabel = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function PromoCode({ nav }) {
  const { promos, redeemPromo } = useStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  const apply = async () => {
    setErr(''); setDone(null); setBusy(true);
    try {
      const res = await redeemPromo(code);
      setDone(res); setCode('');
    } catch (e) {
      setErr(e.message || 'That code didn’t work.');
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Promo code" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Field label="Promo code" value={code} onChangeText={(t) => { setCode(t); setErr(''); }} placeholder="Enter code" autoCapitalize="characters" autoCorrect={false} />
          {err ? <Text style={ps.err}>{err}</Text> : null}
          <Button title={busy ? 'Applying…' : 'Apply code'} disabled={!normalizePromo(code) || busy} onPress={apply} style={{ marginTop: 4 }} />
        </Card>

        {done && (
          <Card style={ps.win}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={ps.check}><Icon name="check" size={16} color="#fff" /></View>
              <Text style={{ fontWeight: '900', color: '#065F46', fontSize: 16, marginLeft: 10, flex: 1 }}>{done.code} applied</Text>
            </View>
            <Text style={{ color: '#065F46', marginTop: 6, lineHeight: 19 }}>
              {(byLabel(done.code) || {}).title}. Free until {endLabel(done.endsAt)}.
              {done.kind === 'fee_free' ? ' Your lessons and rentals show $0 booking fee.' : done.kind === 'cfi_pro' ? ' 0% host fees, free instant payouts and the Pro badge are on.' : ' Students booking your instructors and planes pay the $5 School Pro booking fee.'}
            </Text>
          </Card>
        )}

        <SectionTitle>Your promos</SectionTitle>
        {promos.length === 0 && <Text style={{ color: C.sub }}>Codes you redeem show up here with their end date.</Text>}
        {promos.map((p) => {
          const info = byLabel(p.code) || {};
          const on = isActive(p.endsAt);
          return (
            <Card key={p.code} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '900', color: C.text }}>{info.label || p.code}</Text>
                <Text style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>{info.title}</Text>
              </View>
              <Text style={{ fontWeight: '800', fontSize: 12, color: on ? C.green : C.sub }}>{on ? `Until ${endLabel(p.endsAt)}` : 'Ended'}</Text>
            </Card>
          );
        })}

        <Text style={{ color: C.sub, fontSize: 12, marginTop: 14, lineHeight: 17 }}>
          Each code can be used once per account (Hold Short once per school). When the free period ends your plan returns to the standard one; nothing is charged automatically.
        </Text>
      </ScrollView>
    </View>
  );
}

const ps = StyleSheet.create({
  err: { color: '#B91C1C', fontWeight: '700', marginBottom: 8 },
  win: { backgroundColor: '#E3F7EF', borderWidth: 1, borderColor: '#A7F3D0' },
  check: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
});
