import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, RefreshControl } from 'react-native';
import { useStore } from '../store';
import { useAuth } from '../backend/auth';
import { fetchThreads, threadWith, fetchMessages, sendMessage as sendLive, markRead, subscribe } from '../backend/messages';
import { PACKS } from '../data';
import { money2, scanMessage } from '../logic';
import { C, Card, Avatar, SectionTitle, Button, Tag, Icon, Sheet } from '../ui';
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
  const load = async () => { try { setThreads(await fetchThreads(uid)); } catch { setThreads((t) => t || []); } };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [uid]);
  const rows = (threads || []).map((t) => ({
    key: t.id, name: t.name, at: t.last?.at, text: `${t.last?.mine ? 'You: ' : ''}${t.last?.text || ''}`, unread: !!t.unread,
    avatar: <Avatar initials={initials(t.name)} color={C.navy} photo={t.photo} size={48} />,
    open: () => nav.push('Chat', { key: t.other, other: t.other, name: t.name, photo: t.photo }),
  }));
  return <InboxList nav={nav} rows={rows} loading={!threads} onRefresh={load} />;
}

function DemoInbox({ nav }) {
  const store = useStore();
  const rows = store.threads.map((t) => {
    const w = who(store, t.key);
    const last = t.messages[t.messages.length - 1];
    return { key: t.key, name: w.name, at: last.at, text: `${last.from === 'me' ? 'You: ' : ''}${last.text}`, unread: !!t.unread || last.from !== 'me', avatar: w.avatar, open: () => nav.push('Chat', { key: t.key }) };
  });
  return <InboxList nav={nav} rows={rows} />;
}

// Full-width rows; unread threads are bold with an amber dot. Search and a new-message button on top.
function InboxList({ nav, rows, loading, onRefresh }) {
  const store = useStore();
  const [q, setQ] = useState('');
  const [picker, setPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const t = q.trim().toLowerCase();
  const shown = rows.filter((r) => !t || `${r.name} ${r.text}`.toLowerCase().includes(t));
  const unread = rows.filter((r) => r.unread).length;
  // People you can message: instructors and owners from your bookings, then saved instructors.
  const contacts = [...new Set([...store.requests.flatMap((r) => [r.cfiId, r.planeId]), ...store.favorites].filter(Boolean))]
    .map((id) => ({ id, ...who(store, id) })).filter((x) => x.name !== 'Unknown');
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={s.top}>
        <Text style={s.h1} accessibilityRole="header">Inbox{unread ? <Text style={s.count}>  {unread} unread</Text> : null}</Text>
        <Pressable onPress={() => setPicker(true)} style={s.newBtn} accessibilityRole="button" accessibilityLabel="New message">
          <Icon name="edit" size={20} color={C.navy} />
        </Pressable>
      </View>
      <View style={s.searchWrap}>
        <View style={s.search}>
          <Icon name="search" size={18} color={C.sub} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search messages" placeholderTextColor={C.placeholder} style={s.searchInput} accessibilityLabel="Search messages" />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }} /> : undefined}>
        {!loading && rows.length === 0 && (
          <View style={{ alignItems: 'center', padding: 28 }}>
            <View style={s.emptyIcon}><Icon name="chat" size={28} color={C.navy} /></View>
            <Text style={{ fontWeight: '800', color: C.text, fontSize: 17, marginTop: 12 }}>No messages yet</Text>
            <Text style={{ color: C.sub, textAlign: 'center', marginTop: 4, lineHeight: 20 }}>Ask an instructor a question before you book. Tap the message button on their profile.</Text>
          </View>
        )}
        {shown.map((r, i) => (
          <Pressable key={r.key} onPress={r.open} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.bg }]} accessibilityRole="button"
            accessibilityLabel={`${r.unread ? 'Unread. ' : ''}${r.name}. ${r.text}. ${r.at || ''}`}>
            {r.avatar}
            <View style={[s.rowBody, i > 0 && s.rowBorder]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[s.name, r.unread && { fontWeight: '800' }]} numberOfLines={1}>{r.name}</Text>
                <Text style={[s.at, r.unread && { color: C.amberDark, fontWeight: '700' }]}>{r.at}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Text style={[s.snippet, r.unread && { color: C.text, fontWeight: '700' }]} numberOfLines={1}>{r.text}</Text>
                {r.unread && <View style={s.dot} />}
              </View>
            </View>
          </Pressable>
        ))}
        {t && shown.length === 0 && rows.length > 0 && <Text style={{ color: C.sub, padding: 16 }}>No messages match “{q.trim()}”.</Text>}
        <Text style={s.policy}>Messages stay in Positive Rate so bookings, payments and your training record stay protected. Phone numbers and emails are shared after your first booking together.</Text>
      </ScrollView>
      <Sheet visible={picker} onClose={() => setPicker(false)} title="New message">
        {contacts.length === 0 && <Text style={{ color: C.sub, lineHeight: 20, paddingBottom: 12 }}>Instructors and owners you book with, or save, show up here. To ask someone new a question, open their profile from Explore.</Text>}
        {contacts.map((x) => (
          <Pressable key={x.id} onPress={() => { setPicker(false); nav.push('Chat', { key: x.id }); }} style={s.contact} accessibilityRole="button">
            {x.avatar}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontWeight: '800', color: C.text }}>{x.name}</Text>
              <Text style={{ color: C.sub, fontSize: 13 }}>{x.sub}</Text>
            </View>
            <Icon name="chevron" size={18} color={C.chevron} />
          </Pressable>
        ))}
        {contacts.length === 0 && <Button title="Browse instructors" variant="outline" onPress={() => { setPicker(false); nav.goTab('Explore'); }} />}
      </Sheet>
    </View>
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
  const [text, setText] = useState(params?.draft || '');
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
            <Text style={{ color: C.navy, fontWeight: '800', fontSize: 14 }}>Book</Text>
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
          <TextInput value={text} onChangeText={setText} placeholder="Message…" placeholderTextColor="#687588" style={s.input} onSubmitEditing={send} editable={!!thread} />
          <Pressable onPress={send} style={[s.send, (!thread || sending) && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel="Send"><Icon name="send" size={20} color={C.navy} strokeWidth={2.6} /></Pressable>
        </View>
      </View>
    </View>
  );
}

function DemoChat({ nav, params }) {
  const store = useStore();
  const { threads, sendMessage, hasBookingWith, getCfi, getPlane } = store;
  const [text, setText] = useState(params?.draft || '');
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
          <Text style={{ color: C.navy, fontWeight: '800', fontSize: 14 }}>Book</Text>
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
          <TextInput value={text} onChangeText={setText} placeholder="Message…" placeholderTextColor="#687588" style={s.input} onSubmitEditing={send} />
          <Pressable onPress={send} style={s.send} accessibilityRole="button" accessibilityLabel="Send"><Icon name="send" size={20} color={C.navy} strokeWidth={2.6} /></Pressable>
        </View>
      </View>
    </View>
  );
}

// The prepaid wallet is a V2 feature; until then this route shows payment methods.
export function Wallet({ nav, params }) {
  const { PaymentMethods } = require('./PaymentMethods');
  return <PaymentMethods nav={nav} params={params} />;
}

const s = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '900', color: C.text },
  count: { fontSize: 14, fontWeight: '700', color: C.amberDark },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, backgroundColor: '#fff' },
  newBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: C.chevron, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: C.text, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, minHeight: 72, backgroundColor: '#fff' },
  rowBody: { flex: 1, marginLeft: 12, paddingVertical: 12, paddingRight: 16 },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: C.text },
  at: { fontSize: 12, color: C.sub, marginLeft: 8 },
  snippet: { flex: 1, color: C.sub, fontSize: 14 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.amber, marginLeft: 8 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' },
  contact: { flexDirection: 'row', alignItems: 'center', minHeight: 60, borderBottomWidth: 1, borderBottomColor: C.line },
  policy: { color: C.sub, fontSize: 12, marginTop: 14, lineHeight: 17, paddingHorizontal: 16 },
  bookBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.sky, paddingHorizontal: 14, paddingVertical: 10 },
  bookBtn: { backgroundColor: C.amber, borderRadius: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', marginLeft: 10 },
  bubble: { maxWidth: '82%', borderRadius: 16, padding: 11, marginBottom: 8 },
  me: { alignSelf: 'flex-end', backgroundColor: C.navy, borderBottomRightRadius: 4 },
  them: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.line },
  nudge: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginTop: 6 },
  composer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', padding: 10, paddingBottom: 22, borderTopWidth: 1, borderTopColor: C.line },
  preview: { color: '#B45309', fontSize: 12, fontWeight: '600', marginBottom: 6, marginLeft: 4 },
  input: { flex: 1, backgroundColor: C.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.text },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  walletHero: { backgroundColor: C.navy, borderRadius: 18, padding: 18 },
  added: { color: C.green, fontWeight: '800', marginTop: 10 },
  tx: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F3F7' },
});
