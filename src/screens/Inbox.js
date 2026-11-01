import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { PACKS } from '../data';
import { money2, scanMessage } from '../logic';
import { C, Card, Avatar, SectionTitle, Button, Tag } from '../ui';
import { PlaneImage } from '../art';
import { Header } from './Details';

const who = (store, key) => {
  const c = store.getCfi(key);
  if (c) return { name: c.name, sub: c.certs.join(' · '), avatar: <Avatar initials={c.initials} color={c.color} photo={c.photo} size={44} /> };
  const p = store.getPlane(key);
  if (p) return { name: `${p.tail} · ${p.ownerName}`, sub: `${p.make} ${p.model}`, avatar: <PlaneImage plane={p} size={44} /> };
  return { name: 'Unknown', sub: '', avatar: null };
};

export function Inbox({ nav }) {
  const store = useStore();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={s.h1}>Inbox</Text>
      {store.threads.map((t) => {
        const w = who(store, t.key);
        const last = t.messages[t.messages.length - 1];
        return (
          <Card key={t.key} onPress={() => nav.push('Chat', { key: t.key })} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {w.avatar}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '800', color: C.text }}>{w.name}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>{last.at}</Text>
              </View>
              <Text style={{ color: C.sub, marginTop: 2 }} numberOfLines={1}>{last.from === 'me' ? 'You: ' : ''}{last.text}</Text>
            </View>
          </Card>
        );
      })}
      <Text style={s.policy}>Messages stay in RightSeat so bookings, payments and your training record stay protected. Phone numbers and emails are shared automatically after your first booking.</Text>
    </ScrollView>
  );
}

export function Chat({ nav, params }) {
  const store = useStore();
  const { threads, sendMessage, hasBookingWith, getCfi, getPlane } = store;
  const [text, setText] = useState('');
  const [notice, setNotice] = useState(null);
  const ref = useRef(null);
  const key = params.key;
  const thread = threads.find((t) => t.key === key) || { key, messages: [] };
  const w = who(store, key);
  const booked = hasBookingWith(key);
  const preview = text ? scanMessage(text, booked) : null;
  const cfi = getCfi(key);
  const plane = getPlane(key);

  const send = () => {
    if (!text.trim()) return;
    const res = sendMessage(key, text.trim());
    setNotice(res.flagged ? (res.masked ? 'masked' : 'offapp') : null);
    setText('');
    setTimeout(() => ref.current?.scrollToEnd?.({ animated: true }), 50);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={w.name} />
      <View style={s.bookBar}>
        <Text style={{ flex: 1, color: C.navy, fontSize: 12, fontWeight: '600' }}>
          {booked ? '✓ You’ve booked together — contact info is unlocked.' : 'Contact info unlocks after your first booking.'}
        </Text>
        <Pressable onPress={() => nav.push('Request', { cfiId: cfi?.id || null, planeId: cfi ? cfi.aircraftIds[0] || null : plane?.id })} style={s.bookBtn}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Book</Text>
        </Pressable>
      </View>
      <ScrollView ref={ref} contentContainerStyle={{ padding: 16, paddingBottom: 140 }} onContentSizeChange={() => ref.current?.scrollToEnd?.({ animated: false })}>
        {thread.messages.map((m, i) => (
          <View key={i} style={[s.bubble, m.from === 'me' ? s.me : s.them]}>
            <Text style={{ color: m.from === 'me' ? '#fff' : C.text, lineHeight: 20 }}>{m.text}</Text>
            {m.masked && <Text style={{ color: '#DCE8FF', fontSize: 11, marginTop: 4 }}>Contact info hidden until first booking</Text>}
          </View>
        ))}
        {notice && (
          <View style={s.nudge}>
            <Text style={{ fontWeight: '800', color: '#92400E' }}>{notice === 'masked' ? 'We hid that contact info' : 'Heads up'}</Text>
            <Text style={{ color: '#92400E', fontSize: 13, marginTop: 4, lineHeight: 18 }}>
              Lessons and rentals paid outside RightSeat aren’t covered by payment protection, free weather cancellations or your automatic training record.
            </Text>
          </View>
        )}
      </ScrollView>
      <View style={s.composer}>
        {preview?.flagged && (
          <Text style={s.preview}>{preview.masked ? 'Phone/email will be hidden until your first booking.' : 'Keep payments in the app to stay protected.'}</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput value={text} onChangeText={setText} placeholder="Message…" placeholderTextColor="#9AA3B2" style={s.input} onSubmitEditing={send} />
          <Pressable onPress={send} style={s.send}><Text style={{ color: '#fff', fontWeight: '900' }}>↑</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

export function Wallet({ nav }) {
  const { wallet, held, available, topUp } = useStore();
  const [added, setAdded] = useState(null);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Wallet" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={s.walletHero}>
          <Text style={{ color: '#AFC3E0', fontWeight: '700' }}>Available to fly</Text>
          <Text style={{ color: '#fff', fontSize: 36, fontWeight: '900', marginTop: 2 }}>{money2(available)}</Text>
          <Text style={{ color: '#AFC3E0', marginTop: 4 }}>Balance {money2(wallet.balance)} · {money2(held)} held for upcoming lessons</Text>
        </View>
        {added && <Text style={s.added}>✓ Added {money2(added.amount)}{added.bonus ? ` + ${money2(added.bonus)} bonus` : ''}</Text>}

        <SectionTitle>Prepay & save</SectionTitle>
        <Text style={{ color: C.sub, fontSize: 13, marginBottom: 10, lineHeight: 18 }}>
          Prepaid training accounts get aircraft block rates on every flight, plus bonus credit. No card fees on wallet bookings.
        </Text>
        {PACKS.map((p) => (
          <Card key={p.amount} onPress={() => { topUp(p); setAdded(p); }} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontWeight: '900', fontSize: 18, color: C.text }}>Add {money2(p.amount).replace('.00', '')}</Text>
                {p.popular && <View style={{ marginLeft: 8 }}><Tag label="Most popular" /></View>}
              </View>
              <Text style={{ color: C.green, fontWeight: '700', marginTop: 2 }}>+ {money2(p.bonus).replace('.00', '')} bonus credit · block rates</Text>
            </View>
            <Text style={{ color: C.blue, fontWeight: '900', fontSize: 20 }}>+</Text>
          </Card>
        ))}

        <SectionTitle>Activity</SectionTitle>
        <Card>
          {wallet.transactions.map((t) => (
            <View key={t.id} style={s.tx}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '600' }}>{t.label}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>{t.date}</Text>
              </View>
              <Text style={{ fontWeight: '800', color: t.amount > 0 ? C.green : C.text }}>{t.amount > 0 ? '+' : ''}{money2(t.amount)}</Text>
            </View>
          ))}
        </Card>
        <Text style={s.policy}>Unused balance is refundable to your card at any time. Bonus credit is non-cash and used last.</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '900', color: C.text, marginTop: 6, marginBottom: 14 },
  policy: { color: C.sub, fontSize: 12, marginTop: 10, lineHeight: 17 },
  bookBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.sky, paddingHorizontal: 14, paddingVertical: 10 },
  bookBtn: { backgroundColor: C.blue, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, marginLeft: 10 },
  bubble: { maxWidth: '82%', borderRadius: 16, padding: 11, marginBottom: 8 },
  me: { alignSelf: 'flex-end', backgroundColor: C.blue, borderBottomRightRadius: 4 },
  them: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  nudge: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginTop: 6 },
  composer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', padding: 10, paddingBottom: 22, borderTopWidth: 1, borderTopColor: C.line },
  preview: { color: '#B45309', fontSize: 12, fontWeight: '600', marginBottom: 6, marginLeft: 4 },
  input: { flex: 1, backgroundColor: C.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.text },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  walletHero: { backgroundColor: C.navy, borderRadius: 18, padding: 18 },
  added: { color: C.green, fontWeight: '800', marginTop: 10 },
  tx: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F3F7' },
});
