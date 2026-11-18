import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../backend/auth';
import { callFn } from '../backend/supabase';
import { useAddCard, CARD_PAYMENTS_SUPPORTED } from '../backend/payments';
import { C, Card, Button, Icon } from '../ui';
import { Header } from './Details';
import { useStore } from '../store';

const BRANDS = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay' };
const brandName = (b) => BRANDS[b] || 'Card';
const exp = (c) => (c.expMonth && c.expYear ? `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}` : '');

// Account → Payment methods: see, add, remove and choose the default card.
export function PaymentMethods({ nav }) {
  const auth = useAuth();
  const addCard = useAddCard();
  const [cards, setCards] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const { requests } = useStore();
  const charges = requests.filter((r) => r.status === 'Completed').sort((a, b) => new Date(b.when) - new Date(a.when)).slice(0, 5);

  const run = useCallback(async (key, fn) => {
    setBusy(key); setErr('');
    try {
      const res = await fn();
      if (res?.cards) setCards(res.cards);
    } catch (e) {
      setErr(e.message || 'Something went wrong. Try again.');
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    if (auth?.session && CARD_PAYMENTS_SUPPORTED) run('load', () => callFn('payment-methods', { action: 'list' }));
  }, [auth?.session, run]);

  const remove = (c) =>
    Alert.alert('Remove this card?', `${brandName(c.brand)} ending in ${c.last4}. Upcoming lessons booked with it will be charged to your default card instead.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run('rm-' + c.id, () => callFn('payment-methods', { action: 'remove', id: c.id })) },
    ]);

  if (!auth?.session) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Payment methods" />
        <View style={{ padding: 16 }}>
          <Text style={{ color: C.text, lineHeight: 20 }}>Sign in to see and manage your saved cards.</Text>
          <Button title="Sign in" style={{ marginTop: 12 }} onPress={() => nav.push('SignIn')} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Payment methods" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {!CARD_PAYMENTS_SUPPORTED && <Text style={{ color: C.text, lineHeight: 20 }}>Manage your cards from the Positive Rate iPhone or Android app.</Text>}

        {CARD_PAYMENTS_SUPPORTED && cards === null && busy === 'load' && <ActivityIndicator style={{ marginTop: 24 }} color={C.blue} />}

        {CARD_PAYMENTS_SUPPORTED && cards?.length === 0 && (
          <Card><Text style={{ color: C.text, lineHeight: 20 }}>No saved cards yet. Add one now, or when you book your first lesson.</Text></Card>
        )}

        {(cards || []).map((c) => (
          <Card key={c.id} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' }}><Icon name="card" size={20} color={C.navy} /></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontWeight: '800', color: C.text }}>{brandName(c.brand)} •• {c.last4}</Text>
                <Text style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>{exp(c) ? `Expires ${exp(c)}` : ''}{c.isDefault ? `${exp(c) ? ' · ' : ''}Default` : ''}</Text>
              </View>
              {busy === 'def-' + c.id || busy === 'rm-' + c.id ? <ActivityIndicator color={C.blue} /> : null}
            </View>
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              {!c.isDefault && (
                <Pressable disabled={!!busy} onPress={() => run('def-' + c.id, () => callFn('payment-methods', { action: 'default', id: c.id }))} style={{ marginRight: 20, minHeight: 44, justifyContent: 'center' }} accessibilityRole="button">
                  <Text style={{ color: C.blue, fontWeight: '700' }}>Make default</Text>
                </Pressable>
              )}
              <Pressable disabled={!!busy} onPress={() => remove(c)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: C.red, fontWeight: '700' }}>Remove</Text>
              </Pressable>
            </View>
          </Card>
        ))}

        {CARD_PAYMENTS_SUPPORTED && (
          <Button
            title={busy === 'add' ? 'Opening…' : 'Add a card'}
            disabled={!!busy}
            style={{ marginTop: 6 }}
            onPress={() => run('add', async () => { const r = await addCard(); return r?.cancelled ? null : r; })}
          />
        )}
        {!!err && <Text style={{ color: '#B91C1C', fontWeight: '600', marginTop: 10 }} accessibilityLiveRegion="polite">{err}</Text>}

        {charges.length > 0 && (
          <>
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.sub, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 22, marginBottom: 8 }}>Recent charges</Text>
            <Card style={{ paddingVertical: 4 }}>
              {charges.map((r, i) => (
                <Pressable key={r.id} onPress={() => r.receipt && nav.push('Receipt', { id: r.id })} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }} accessibilityRole="button">
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: C.text }}>{r.goal}</Text>
                    <Text style={{ color: C.sub, fontSize: 12 }}>{r.date}</Text>
                  </View>
                  <Text style={{ fontWeight: '800', color: C.text }}>${Number(r.myTotal ?? r.total ?? 0).toFixed(2)}</Text>
                </Pressable>
              ))}
            </Card>
          </>
        )}
        <Text style={{ color: C.sub, marginTop: 16, lineHeight: 20, fontSize: 13 }}>
          Prepaid training accounts with block rates are coming in a future update.
        </Text>
        <Text style={{ color: C.sub, marginTop: 8, lineHeight: 20, fontSize: 13 }}>
          Cards are stored by Stripe, not on Positive Rate. Each lesson is charged after the flight to the card you saved when booking it. If you remove that card, we charge your default card instead.
        </Text>
      </ScrollView>
    </View>
  );
}
