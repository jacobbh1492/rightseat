import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share } from 'react-native';
import { C, Card, Button, Field, Chip, SectionTitle, Tag, Avatar } from '../ui';
import { Header } from './Details';
import { useStore } from '../store';
import { money2 } from '../logic';
import { useAuth } from '../backend/auth';
import { useGiftPurchase, CARD_PAYMENTS_SUPPORTED } from '../backend/payments';
import { useMyGifts, claimGift, giftShareText, spendable } from '../backend/gifts';

const PRESETS = [150, 200, 250, 350];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function shareGift(g) {
  try { await Share.share({ message: giftShareText(g), title: 'A flight lesson for you' }); } catch {}
}

// Give someone a flight. Paid now; they redeem the code and book any instructor.
export function GiftFlight({ nav, params }) {
  const { getCfi } = useStore();
  const auth = useAuth();
  const cfi = params?.cfiId ? getCfi(params.cfiId) : null;
  const suggested = cfi?.discoveryFlight > 0 ? Math.round(cfi.discoveryFlight) : 200;
  const [amount, setAmount] = useState(String(suggested));
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [fromName, setFromName] = useState(auth?.account?.full_name?.split(' ')[0] || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const buy = useGiftPurchase();
  const amt = Number(amount);
  const valid = amt >= 50 && amt <= 1500 && recipientName.trim() && (!recipientEmail.trim() || EMAIL.test(recipientEmail.trim()));

  const pay = async () => {
    if (!auth?.session) { nav.push('SignIn', { reason: 'Sign in to send a gift. We’ll email you a 6-digit code.' }); return; }
    setErr(''); setBusy(true);
    try {
      const res = await buy({ amount: amt, recipientName: recipientName.trim(), recipientEmail: recipientEmail.trim() || undefined, fromName: fromName.trim(), message: message.trim(), cfiId: cfi?.live ? cfi.id : undefined });
      if (res.cancelled) setErr('Payment cancelled. Nothing was charged.');
      else setDone(res.gift);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Gift ready" />
        <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 46 }}>🎁</Text>
          <Text style={{ fontSize: 22, fontWeight: '900', color: C.text, marginTop: 8, textAlign: 'center' }}>{money2(done.amount)} flight for {done.recipientName}</Text>
          <Text style={[gs.sub, { textAlign: 'center', marginTop: 8 }]}>Send them this code. They enter it in the RightSeat app under Account → Gifts and book any instructor.</Text>
          <View style={gs.code}><Text style={gs.codeText} selectable>{done.code}</Text></View>
          <Button title="Send the gift" style={{ alignSelf: 'stretch', marginTop: 12 }} onPress={() => shareGift(done)} />
          <Button title="Done" variant="outline" style={{ alignSelf: 'stretch', marginTop: 10 }} onPress={nav.pop} />
          <Text style={[gs.sub, { textAlign: 'center', marginTop: 14 }]}>The gift never expires. You can always find the code under Account → Gifts.</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Gift a flight" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        <Card style={{ backgroundColor: C.navy }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>Give someone their first flight ✈️</Text>
          <Text style={{ color: '#C7D3E6', marginTop: 4, lineHeight: 19 }}>They take the controls with a certified instructor. Works for a discovery flight or any lesson with a RightSeat instructor.</Text>
        </Card>
        {cfi && (
          <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Avatar initials={cfi.initials} color={cfi.color} size={40} photo={cfi.photo} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontWeight: '800', color: C.text }}>Suggested: {cfi.name}</Text>
              <Text style={gs.sub}>{cfi.discoveryFlight > 0 ? `Discovery flight ${money2(cfi.discoveryFlight)} incl. plane` : cfi.homeAirport}. They can pick any instructor.</Text>
            </View>
          </Card>
        )}
        <SectionTitle>Amount</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[...new Set([suggested, ...PRESETS])].sort((a, b) => a - b).map((p) => <Chip key={p} label={`$${p}`} active={amt === p} onPress={() => setAmount(String(p))} />)}
        </View>
        <Field label="Or enter an amount ($50–$1,500)" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" prefix="$" />
        <Text style={gs.hint}>A discovery flight is usually $150–$250. Anything left over stays on their gift for the next lesson.</Text>

        <SectionTitle>Who’s it for?</SectionTitle>
        <Field label="Their name" value={recipientName} onChangeText={setRecipientName} placeholder="Alex" />
        <Field label="Their email (optional)" value={recipientEmail} onChangeText={setRecipientEmail} placeholder="alex@email.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Text style={gs.hint}>If they already use RightSeat, we’ll let them know. Either way, you get a code to send them.</Text>
        <Field label="From" value={fromName} onChangeText={setFromName} placeholder="Your name" />
        <Field label="Message (optional)" value={message} onChangeText={setMessage} multiline placeholder="Happy birthday! Time to finally fly." />
        {!CARD_PAYMENTS_SUPPORTED && <Text style={[gs.hint, { color: '#B45309' }]}>Buy gifts from the RightSeat iPhone or Android app.</Text>}
        {!!err && <Text style={gs.err}>{err}</Text>}
      </ScrollView>
      <View style={gs.cta}>
        <Button title={busy ? 'Opening payment…' : valid ? `Pay ${money2(amt)}` : 'Add the amount and their name'} disabled={busy || !valid || !CARD_PAYMENTS_SUPPORTED} style={{ flex: 1 }} onPress={pay} />
      </View>
    </View>
  );
}

const STATUS = { active: ['Not redeemed', '#B45309', '#FEF3C7'], claimed: ['Redeemed', C.blue, C.sky], used: ['Used', C.green, '#E3F7EF'], refunded: ['Refunded', C.sub, '#EEF1F5'] };

// Account → Gifts: redeem a code, see what's left, and find codes you've sent.
export function Gifts({ nav, params }) {
  const auth = useAuth();
  const g = useMyGifts();
  const [code, setCode] = useState(params?.code || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (params?.code) setCode(params.code); }, [params?.code]);
  const redeem = async () => {
    setErr(''); setMsg(''); setBusy(true);
    try { const gift = await claimGift(code); setMsg(`${money2(gift.remaining)} added ✓ It’s applied when you book a lesson with an instructor.`); setCode(''); g.refresh(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const usable = spendable(g.received);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Gifts" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={{ fontWeight: '900', color: C.text, fontSize: 16 }}>Got a gift code?</Text>
          <Field value={code} onChangeText={setCode} placeholder="RS-ABCD-2345" autoCapitalize="characters" autoCorrect={false} />
          {auth?.session
            ? <Button title={busy ? 'Redeeming…' : 'Redeem'} disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 8} onPress={redeem} />
            : <Button title="Sign in to redeem" onPress={() => nav.push('SignIn', { reason: 'Sign in to redeem your gift. We’ll email you a 6-digit code.' })} />}
          {!!msg && <Text style={[gs.sub, { color: C.green, fontWeight: '700', marginTop: 8 }]}>{msg}</Text>}
          {!!err && <Text style={gs.err}>{err}</Text>}
        </Card>

        {usable.length > 0 && (
          <>
            <SectionTitle>Ready to fly</SectionTitle>
            {usable.map((x) => (
              <Card key={x.id}>
                <Text style={{ fontWeight: '900', color: C.text, fontSize: 18 }}>{money2(x.remaining)} <Text style={gs.sub}>of {money2(x.amount)}</Text></Text>
                <Text style={gs.sub}>From {x.fromName || 'a friend'}{x.message ? ` · “${x.message}”` : ''}</Text>
                <Button title="Book a discovery flight" style={{ marginTop: 10 }} onPress={() => (x.cfiId ? nav.push('Request', { cfiId: x.cfiId, goal: 'Discovery flight' }) : nav.goTab('Explore'))} />
              </Card>
            ))}
          </>
        )}

        <SectionTitle right={<Pressable onPress={() => nav.push('GiftFlight')} accessibilityRole="button"><Text style={{ color: C.blue, fontWeight: '800' }}>+ Gift a flight</Text></Pressable>}>Gifts you sent</SectionTitle>
        {!g.loading && g.sent.length === 0 && <Text style={gs.sub}>Give someone their first flight. They pick the instructor.</Text>}
        {g.sent.map((x) => {
          const st = STATUS[x.status] || STATUS.active;
          return (
            <Card key={x.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontWeight: '800', color: C.text, flex: 1 }}>{money2(x.amount)} for {x.recipientName}</Text>
                <Tag label={st[0]} color={st[1]} bg={st[2]} />
              </View>
              <Text style={[gs.sub, { marginTop: 2 }]} selectable>Code {x.code}</Text>
              {x.status === 'active' && <Button title="Send again" variant="outline" small style={{ marginTop: 8 }} onPress={() => shareGift(x)} />}
            </Card>
          );
        })}
        {!!g.error && <Text style={gs.err}>{g.error}</Text>}
      </ScrollView>
    </View>
  );
}

const gs = StyleSheet.create({
  sub: { color: C.sub, fontSize: 13, lineHeight: 18 },
  hint: { color: C.sub, fontSize: 12, lineHeight: 17, marginTop: -8, marginBottom: 6 },
  err: { color: '#B91C1C', fontWeight: '600', marginTop: 8 },
  code: { marginTop: 18, paddingVertical: 16, paddingHorizontal: 22, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: C.blue, backgroundColor: C.sky },
  codeText: { fontSize: 26, fontWeight: '900', color: C.navy, letterSpacing: 2 },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: 16, paddingBottom: 28, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});
