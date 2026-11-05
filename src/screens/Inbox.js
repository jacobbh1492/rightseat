import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, RefreshControl } from 'react-native';
import { useStore } from '../store';
import { useAuth } from '../backend/auth';
import { fetchThreads, threadWith, fetchMessages, sendMessage as sendLive, markRead, subscribe } from '../backend/messages';
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

const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(String(id || ''));
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// Signed in: real conversations from the server. Guests see the sample inbox.
export function Inbox({ nav }) {
  const auth = useAuth();
  if (auth?.session) return <LiveInbox nav={nav} uid={auth.session.user.id} />;
  return <DemoInbox nav={nav} />;
}

function LiveInbox({ nav, uid }) {
  const [threads, setThreads] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = async () => { try { setThreads(await fetchThreads(uid)); } catch { setThreads((t) => t || []); } };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [uid]);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Text style={s.h1}>Inbox</Text>
      {threads && threads.length === 0 && (
        <Card><Text style={{ color: C.sub, lineHeight: 20 }}>No messages yet. Open an instructor’s profile and tap the message button to ask a question before you book.</Text></Card>
      )}
      {(threads || []).map((t) => (
        <Card key={t.id} onPress={() => nav.push('Chat', { key: t.other, other: t.other, name: t.name, photo: t.photo })} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Avatar initials={initials(t.name)} color={C.blue} photo={t.photo} size={44} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: C.text }}>{t.name}</Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>{t.last?.at}</Text>
            </View>
            <Text style={{ color: t.unread ? C.text : C.sub, fontWeight: t.unread ? '800' : '400', marginTop: 2 }} numberOfLines={1}>{t.last?.mine ? 'You: ' : ''}{t.last?.text}</Text>
          </View>
          {t.unread && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.blue, marginLeft: 8 }} />}
        </Card>
      ))}
      <Text style={s.policy}>Messages stay in Positive Rate so bookings, payments and your training record stay protected. Phone numbers and emails are shared after your first booking together.</Text>
    </ScrollView>
  );
}

function DemoInbox({ nav }) {
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
      <Text style={s.policy}>Messages stay in Positive Rate so bookings, payments and your training record stay protected. Phone numbers and emails are shared automatically after your first booking.</Text>
    </ScrollView>
  );
}

export function Chat({ nav, params }) {
  const auth = useAuth();
  const store = useStore();
  // Who is on the other side: an instructor (their id), a plane's owner, or a person from the inbox.
  const cfi = store.getCfi(params.key);
  const plane = store.getPlane(params.key);
  const other = params.other || (cfi?.live ? cfi.id : plane?.live ? plane.ownerId : null);
  if (auth?.session && isUuid(other)) return <LiveChat nav={nav} params={params} uid={auth.session.user.id} other={other} cfi={cfi} plane={plane} />;
  if (auth?.session && (cfi || plane) && !cfi?.live && !plane?.live) return <DemoChat nav={nav} params={params} />;
  return <DemoChat nav={nav} params={params} />;
}

function LiveChat({ nav, params, uid, other, cfi, plane }) {
  const { requests, teaching } = useStore();
  const [thread, setThread] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState(null);
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef(null);
  const name = params.name || cfi?.name || (plane ? `${plane.tail} · owner` : 'Message');
  const booked = requests.some((r) => r.live && ['Confirmed', 'Completed'].includes(r.status) && (r.cfiId === other || (plane && r.planeId === plane.id)))
    || teaching.some((r) => r.studentId === other && ['Confirmed', 'Completed'].includes(r.status));
  const add = (m) => setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));

  useEffect(() => {
    if (other === uid) { setErr('This is you.'); return; }
    let unsub = () => {}; let poll; let alive = true;
    (async () => {
      try {
        const t = await threadWith(uid, other);
        if (!alive) return;
        setThread(t);
        setMsgs(await fetchMessages(t.id));
        markRead(t, uid).catch(() => {});
        unsub = subscribe(t.id, (m) => { add(m); markRead(t, uid).catch(() => {}); });
        poll = setInterval(async () => { try { const all = await fetchMessages(t.id); setMsgs(all); } catch {} }, 10000);
      } catch (e) { setErr(e.message); }
    })();
    return () => { alive = false; unsub(); clearInterval(poll); };
  }, [uid, other]);

  const send = async () => {
    const body = text.trim();
    if (!body || !thread || sending) return;
    setSending(true); setErr('');
    try {
      const m = await sendLive(thread.id, uid, body);
      add(m); setText('');
      setNotice(m.body !== body ? 'masked' : m.flagged?.includes('off_app') ? 'offapp' : null);
    } catch (e) { setErr(e.message); }
    setSending(false);
    setTimeout(() => ref.current?.scrollToEnd?.({ animated: true }), 50);
  };
  const preview = text ? scanMessage(text, booked) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={name} />
      <View style={s.bookBar}>
        <Text style={{ flex: 1, color: C.navy, fontSize: 12, fontWeight: '600' }}>
          {booked ? '✓ You’ve booked together. Contact info is unlocked.' : 'Contact info unlocks after your first booking together.'}
        </Text>
        {(cfi?.live || plane?.live) && (
          <Pressable onPress={() => nav.push('Request', { cfiId: cfi?.id || null, planeId: cfi ? cfi.aircraftIds[0] || null : plane?.id })} style={s.bookBtn}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Book</Text>
          </Pressable>
        )}
      </View>
      <ScrollView ref={ref} contentContainerStyle={{ padding: 16, paddingBottom: 140 }} onContentSizeChange={() => ref.current?.scrollToEnd?.({ animated: false })}>
        {thread && msgs.length === 0 && <Text style={{ color: C.sub, textAlign: 'center', marginTop: 20 }}>Say hi. Ask about availability, the plane, or how they teach.</Text>}
        {msgs.map((m) => {
          const mine = m.sender_id === uid;
          return (
            <View key={m.id} style={[s.bubble, mine ? s.me : s.them]}>
              <Text style={{ color: mine ? '#fff' : C.text, lineHeight: 20 }}>{m.body}</Text>
            </View>
          );
        })}
        {notice && (
          <View style={s.nudge}>
            <Text style={{ fontWeight: '800', color: '#92400E' }}>{notice === 'masked' ? 'We hid that contact info' : 'Heads up'}</Text>
            <Text style={{ color: '#92400E', fontSize: 13, marginTop: 4, lineHeight: 18 }}>
              Lessons and rentals paid outside Positive Rate aren’t covered by payment protection, free weather cancellations or your automatic training record.
            </Text>
          </View>
        )}
        {!!err && <Text style={{ color: '#B91C1C', fontWeight: '600', marginTop: 8 }}>{err}</Text>}
      </ScrollView>
      <View style={s.composer}>
        {preview?.flagged && (
          <Text style={s.preview}>{preview.masked ? 'Phone/email will be hidden until your first booking.' : 'Keep payments in the app to stay protected.'}</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput value={text} onChangeText={setText} placeholder="Message…" placeholderTextColor="#9AA3B2" style={s.input} onSubmitEditing={send} editable={!!thread} />
          <Pressable onPress={send} style={[s.send, (!thread || sending) && { opacity: 0.5 }]} accessibilityLabel="Send"><Text style={{ color: '#fff', fontWeight: '900' }}>↑</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

function DemoChat({ nav, params }) {
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
              Lessons and rentals paid outside Positive Rate aren’t covered by payment protection, free weather cancellations or your automatic training record.
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
