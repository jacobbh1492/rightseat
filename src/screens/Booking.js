import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useStore, money } from '../store';
import { SYLLABUS } from '../data';
import { quote, isRepeat, bookingChecks, slotStatus, SLOTS, money2, dateLabel, timeLabel, hoursUntil, FEES, r2 } from '../logic';
import { C, Card, Avatar, Chip, Row, SectionTitle, Button, Stepper, Tag, StarPicker, Field, VerifiedBadge, Toggle, Icon } from '../ui';

function Step({ n, title, done }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10 }}>
      <View style={[bs.stepNum, done && { backgroundColor: C.green }]}>{done ? <Icon name="check" size={14} color="#fff" strokeWidth={3} /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>{n}</Text>}</View>
      <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>{title}</Text>
    </View>
  );
}
import { PlaneImage } from '../art';
import { useAuth } from '../backend/auth';
import { useBookingPayment, CARD_PAYMENTS_SUPPORTED } from '../backend/payments';
import { bookingAction } from '../backend/bookings';
import { postReview } from '../backend/profiles';
import { useLibrary } from '../library/useLibrary';
import { ReviewChip } from './Library';

// Listings stored in the live database have UUID ids; the built-in sample listings don't.
const isLive = (id) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id);
import { Header } from './Details';
import { planeVerified } from './Verify';
import { ALL_LESSONS, lessonState, hasPrior, upcomingEndorsements } from '../progress';
import { DebriefEditor, emptyDebrief } from './Debrief';
import { focusAreas, isEmptyDebrief } from '../debrief';

const GOALS = ['Assessment flight', 'Discovery flight', 'Private Pilot lesson', 'Dual cross-country', 'Night flying', 'Instrument lesson', 'Commercial maneuvers', 'Multi-engine', 'Flight review (BFR)', 'IPC', 'Aircraft checkout', 'Tailwheel'];

function nextDays(n = 12) {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i));
}

export function CheckList({ checks }) {
  return (
    <Card>
      {checks.map((c) => (
        <View key={c.label} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5 }}>
          <Text style={{ width: 22, fontWeight: '900', color: c.ok ? C.green : c.blocking ? '#DC2626' : '#B45309' }}>{c.ok ? '✓' : c.blocking ? '✕' : '!'}</Text>
          <Text style={{ flex: 1, color: c.ok ? C.text : c.blocking ? '#DC2626' : '#B45309', fontWeight: c.ok ? '500' : '700' }}>{c.label}</Text>
        </View>
      ))}
    </Card>
  );
}

export function RequestLesson({ nav, params }) {
  const { cfis, planes, getCfi, getPlane, addRequest, requests, pilot, available, training, docs, setSharing, affiliationFor } = useStore();
  const [shareRecord, setShareRecord] = useState(true);
  const [cfiId, setCfiId] = useState(params.cfiId);
  const [planeId, setPlaneId] = useState(params.planeId);
  const [ownPlane, setOwnPlane] = useState(false);
  const days = nextDays();
  const [dayIdx, setDayIdx] = useState(() => {
    const c0 = getCfi(params.cfiId);
    const p0 = getPlane(params.planeId);
    const i = days.findIndex((d) => SLOTS.some((sl) => slotStatus({ cfi: c0, plane: p0, day: d, hour: sl.h, requests }) === 'free'));
    return i < 0 ? 1 : i;
  });
  const [slot, setSlot] = useState(null);
  const [goal, setGoal] = useState(params.goal || (params.cfiId && !isRepeat(requests, { cfiId: params.cfiId }) ? (hasPrior(training) ? 'Assessment flight' : 'Discovery flight') : 'Private Pilot lesson'));
  const [flightHours, setFlightHours] = useState(params.flightHours || 1.5);
  const [groundHours, setGroundHours] = useState(0.5);
  const [method, setMethod] = useState(available > 300 ? 'wallet' : 'card');
  const [sent, setSent] = useState(null);
  const [moreGoals, setMoreGoals] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [showCost, setShowCost] = useState(false);

  const cfi = getCfi(cfiId);
  const plane = ownPlane ? null : getPlane(planeId);
  const repeat = isRepeat(requests, { cfiId: cfi?.id, planeId: plane?.id });
  const prepaid = method === 'wallet';
  const q = quote({ cfi, plane, flightHours, groundHours: cfi ? groundHours : 0, repeat, prepaid, cfiPro: cfi?.pro, method, affiliation: cfi ? affiliationFor(cfi.id) : null });
  const checks = [
    ...bookingChecks({ pilot, cfi, plane, flightHours }),
    ...(cfi?.live ? [{ label: 'Instructor verified by RightSeat', ok: !!cfi.verified, blocking: true }] : []),
    ...(plane ? [{ label: 'Aircraft registration & insurance verified', ok: planeVerified(plane, docs), blocking: true }] : []),
    ...(!cfi && plane ? [{ label: 'Medical verified in RightSeat', ok: docs.me?.medical?.status === 'approved', blocking: true }] : []),
  ];
  const blocked = checks.some((c) => c.blocking && !c.ok);
  const walletShort = method === 'wallet' && available < q.total;
  const day = days[dayIdx];

  const planeOptions = cfi
    ? [...cfi.aircraftIds.map(getPlane).filter(Boolean), ...planes.filter((p) => !cfi.aircraftIds.includes(p.id))]
    : planes.filter((p) => p.soloRental);
  const cfiOptions = plane ? [...cfis.filter((c) => c.aircraftIds.includes(plane.id)), ...cfis.filter((c) => !c.aircraftIds.includes(plane.id))] : cfis;

  const auth = useAuth();
  const payForBooking = useBookingPayment();
  const [busy, setBusy] = useState(false);
  const [payErr, setPayErr] = useState('');
  const live = isLive(cfi?.id) || isLive(plane?.id);

  const submit = async () => {
    const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), slot).toISOString();
    if (live) {
      // Real booking: server prices it, then the student saves a card (charged after the flight).
      if (!auth?.session) { nav.push('SignIn', { reason: 'Sign in to book. We’ll email you a 6-digit code.' }); return; }
      if (!CARD_PAYMENTS_SUPPORTED) { setPayErr('Book from the RightSeat iPhone or Android app.'); return; }
      setBusy(true); setPayErr('');
      try {
        const res = await payForBooking({ cfiId: cfi?.id || null, planeId: plane?.id || null, startsAt: when, goal: cfi ? goal : 'Solo rental', flightHours, groundHours: cfi ? groundHours : 0, prepaid });
        setBusy(false);
        if (res.cancelled) { setPayErr('Card not saved, so the request wasn’t sent. Tap Send request to try again.'); return; }
        const r = { id: res.booking.id, cfiId: cfi?.id || null, planeId: plane?.id || null, when, date: dateLabel(when), time: timeLabel(when), goal: cfi ? goal : 'Solo rental', flightHours, groundHours: cfi ? groundHours : 0, total: res.quote.total, repeat, prepaid, method: 'card', deposit: res.quote.deposit, status: 'Pending', live: true };
        addRequest(r);
        setSent(r);
      } catch (e) { setBusy(false); setPayErr(e.message || 'Something went wrong. Try again.'); }
      return;
    }
    const r = {
      id: 'r' + Date.now(),
      cfiId: cfi?.id || null,
      planeId: plane?.id || null,
      ownPlane,
      when,
      date: dateLabel(when),
      time: timeLabel(when),
      goal: cfi ? goal : 'Solo rental',
      flightHours,
      groundHours: cfi ? groundHours : 0,
      total: q.total,
      repeat,
      prepaid,
      method,
      deposit: q.deposit,
      status: 'Pending',
    };
    addRequest(r);
    if (cfi && shareRecord && !training.sharing.cfiIds.includes(cfi.id)) setSharing({ cfiIds: [...training.sharing.cfiIds, cfi.id] });
    setSent(r);
  };

  if (sent) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Request sent" />
        <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
          <View style={bs.check}><Text style={{ color: '#fff', fontSize: 40, fontWeight: '900' }}>✓</Text></View>
          <Text style={{ fontSize: 22, fontWeight: '900', color: C.text, marginTop: 16 }}>Request sent!</Text>
          <Text style={{ color: C.sub, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
            {cfi ? `${cfi.name.split(' ')[0]} will confirm ${sent.date} at ${sent.time}` : `The owner will confirm ${sent.date} at ${sent.time}`}
            {plane ? ` and ${plane.tail} is held for you.` : '.'}
          </Text>
          <Card style={{ alignSelf: 'stretch', marginTop: 18 }}>
            <Row label={sent.method === 'wallet' ? 'Held in your wallet' : 'Card hold (Visa •• 4242)'} value={money2(sent.total)} />
            {sent.deposit > 0 && <Row label="Damage deposit hold" value={money2(sent.deposit)} />}
            <Text style={{ color: C.sub, fontSize: 12, marginTop: 6 }}>
              You’re only charged for actual Hobbs time after the flight. Weather cancellations are always free.
            </Text>
          </Card>
          <Button title="View my lessons" style={{ alignSelf: 'stretch', marginTop: 16 }} onPress={() => nav.goTab('Lessons')} />
          <Button title="Keep browsing" variant="outline" style={{ alignSelf: 'stretch', marginTop: 10 }} onPress={() => nav.goTab('Explore')} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Book a flight" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150 }}>
        <Step n={1} title="Instructor & aircraft" done={!!(cfi || plane)} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {plane && plane.soloRental && (
            <Pressable onPress={() => setCfiId(null)} style={[bs.pick, !cfi && bs.pickOn]}>
              <View style={bs.soloIcon}><Text style={{ fontSize: 20 }}>🧑‍✈️</Text></View>
              <Text style={bs.pickName}>No CFI</Text>
              <Text style={bs.pickSub}>Solo rental</Text>
            </Pressable>
          )}
          {cfiOptions.map((c) => (
            <Pressable key={c.id} onPress={() => { setCfiId(c.id); setSlot(null); }} style={[bs.pick, cfiId === c.id && bs.pickOn]}>
              <Avatar initials={c.initials} color={c.color} size={44} photo={c.photo} />
              <Text style={bs.pickName} numberOfLines={1}>{c.name.split(' ')[0]}</Text>
              <Text style={bs.pickSub}>{money(c.flightRate)}/hr</Text>
              {isRepeat(requests, { cfiId: c.id }) ? <Text style={bs.flies}>Your CFI · $0 fee</Text> : plane && c.aircraftIds.includes(plane.id) ? <Text style={bs.flies}>Flies {plane.tail}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>

        <View style={{ height: 12 }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {cfi?.teachesInYourPlane && (
            <Pressable onPress={() => setOwnPlane(true)} style={[bs.pick, ownPlane && bs.pickOn]}>
              <View style={bs.soloIcon}><Text style={{ fontSize: 20 }}>🛩️</Text></View>
              <Text style={bs.pickName}>My plane</Text>
              <Text style={bs.pickSub}>$0 rental</Text>
            </Pressable>
          )}
          {planeOptions.map((p) => (
            <Pressable key={p.id} onPress={() => { setPlaneId(p.id); setOwnPlane(false); setSlot(null); }} style={[bs.pick, !ownPlane && planeId === p.id && bs.pickOn]}>
              <PlaneImage plane={p} size={44} />
              <Text style={bs.pickName} numberOfLines={1}>{p.make} {p.model.split(' ')[0]}</Text>
              <Text style={bs.pickSub}>{money(p.wetRate)}/hr · {p.homeAirport}</Text>
              {cfi && cfi.aircraftIds.includes(p.id) && <Text style={bs.flies}>{cfi.name.split(' ')[0]} flies this</Text>}
            </Pressable>
          ))}
        </ScrollView>

        {cfi && !repeat && (
          <View style={bs.covered}>
            <Text style={{ fontWeight: '800', color: C.navy }}>
              {hasPrior(training) ? `✓ Your previous experience will be shared with ${cfi.name.split(' ')[0]}` : `First lesson with ${cfi.name.split(' ')[0]}. Trained before?`}
            </Text>
            <Text style={{ color: C.navy, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
              {hasPrior(training)
                ? 'They’ll see your hours, what you’ve covered and your endorsements. Most CFIs start with a 1-hour assessment flight to confirm where you are.'
                : 'Add your hours, what you’ve covered and your endorsements so they can plan your first lesson instead of starting over.'}
            </Text>
            <Pressable onPress={() => nav.push('PriorExperience', { shareWith: cfi.id })}>
              <Text style={{ color: C.blue, fontWeight: '800', marginTop: 8 }}>{hasPrior(training) ? 'Review what you’re sharing ›' : 'Add previous experience ›'}</Text>
            </Pressable>
            <Toggle label={`Share my training record & debriefs with ${cfi.name.split(' ')[0]}`} value={shareRecord} onValueChange={setShareRecord} hint="Hours, progress, endorsements and past CFIs’ debrief notes" />
            {hasPrior(training) && goal !== 'Assessment flight' && (
              <Pressable onPress={() => setGoal('Assessment flight')}><Text style={{ color: C.blue, fontWeight: '800', marginTop: 6 }}>Make this an assessment flight ›</Text></Pressable>
            )}
          </View>
        )}

        {cfi && (
          <>
            <Step n={2} title="What are we working on?" done={!!goal} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {(moreGoals ? GOALS : [...new Set([goal, ...GOALS.slice(0, 5)])]).map((g) => <Chip key={g} small label={g} active={goal === g} onPress={() => setGoal(g)} />)}
              {!moreGoals && <Chip small label="More…" onPress={() => setMoreGoals(true)} />}
            </View>
          </>
        )}

        <Step n={cfi ? 3 : 2} title="Date & time" done={!!slot} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {days.map((d, i) => {
            const open = SLOTS.some((s) => slotStatus({ cfi, plane, day: d, hour: s.h, requests }) === 'free');
            return (
              <Pressable key={i} disabled={!open} onPress={() => { setDayIdx(i); setSlot(null); }} style={[bs.date, dayIdx === i && bs.pickOn, !open && { opacity: 0.35 }]}>
                <Text style={{ fontWeight: '800', color: C.text }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={bs.slots}>
          {SLOTS.map((s) => {
            const st = slotStatus({ cfi, plane, day, hour: s.h, requests });
            const on = slot === s.h;
            return (
              <Pressable key={s.h} disabled={st !== 'free'} onPress={() => setSlot(s.h)} style={[bs.slot, on && { backgroundColor: C.blue, borderColor: C.blue }, st !== 'free' && bs.slotBusy]}>
                <Text style={{ fontWeight: '800', color: on ? '#fff' : st === 'free' ? C.text : '#9AA3B2', fontSize: 13 }}>{s.label}</Text>
                <Text style={{ fontSize: 10, color: on ? '#fff' : '#9AA3B2', marginTop: 1 }}>
                  {st === 'free' ? 'Open' : st === 'cfi' ? 'CFI booked' : st === 'plane' ? 'Plane booked' : 'Unavailable'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={bs.hint}>Live calendars: {cfi ? `${cfi.name.split(' ')[0]}’s schedule` : 'no instructor'}{plane ? ` + ${plane.tail}’s bookings` : ''}.</Text>

        <Step n={cfi ? 4 : 3} title="How long" done />
        <Card>
          <Stepper label="Flight (Hobbs)" value={flightHours} onChange={setFlightHours} min={0.5} />
          {cfi && <Stepper label="Ground / briefing" value={groundHours} onChange={setGroundHours} />}
        </Card>

        <Pressable onPress={() => setShowChecks(!showChecks)} style={[bs.summary, blocked && { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]} accessibilityRole="button" accessibilityLabel="Safety and insurance checks">
          <Icon name={blocked ? 'info' : 'shieldCheck'} size={20} color={blocked ? '#DC2626' : C.green} />
          <Text style={{ flex: 1, marginLeft: 10, fontWeight: '700', color: blocked ? '#DC2626' : C.text }}>
            {blocked ? `${checks.filter((c) => c.blocking && !c.ok).length} check${checks.filter((c) => c.blocking && !c.ok).length > 1 ? 's' : ''} not met` : `All ${checks.length} safety & insurance checks passed`}
          </Text>
          <Icon name={showChecks || blocked ? 'down' : 'chevron'} size={18} color="#94A3B8" />
        </Pressable>
        {(showChecks || blocked) && <CheckList checks={blocked && !showChecks ? checks.filter((c) => !c.ok) : checks} />}
        {blocked && !cfi && plane && (
          <Pressable onPress={() => setCfiId(planeOptions.length && getPlane(plane.id) ? (cfis.find((c) => c.aircraftIds.includes(plane.id))?.id || cfis[0].id) : cfis[0].id)}>
            <Text style={{ color: C.blue, fontWeight: '700', marginBottom: 8 }}>Book a checkout with a CFI instead ›</Text>
          </Pressable>
        )}

        <Step n={cfi ? 5 : 4} title="Pay with" done />
        <Pressable onPress={() => setMethod('wallet')} style={[bs.pay, method === 'wallet' && bs.pickOn]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: C.text }}>RightSeat wallet · {money2(available)}</Text>
            <Text style={{ color: C.green, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
              {plane && q.prepaidSavings > 0 ? `Prepaid block rate saves ${money2(q.prepaidSavings)}` : plane ? 'Prepaid block rate applied' : 'No card processing'}
            </Text>
          </View>
          <View style={[bs.radio, method === 'wallet' && { borderColor: C.blue }]}>{method === 'wallet' && <View style={bs.radioDot} />}</View>
        </Pressable>
        <Pressable onPress={() => setMethod('card')} style={[bs.pay, method === 'card' && bs.pickOn]}>
          <Text style={{ flex: 1, fontWeight: '800', color: C.text }}>Visa •• 4242</Text>
          <View style={[bs.radio, method === 'card' && { borderColor: C.blue }]}>{method === 'card' && <View style={bs.radioDot} />}</View>
        </Pressable>
        {walletShort && (
          <Pressable onPress={() => nav.push('Wallet')}>
            <Text style={bs.warn}>Wallet balance is short by {money2(q.total - available)}. Add funds ›</Text>
          </Pressable>
        )}

        <Card style={{ marginTop: 18 }}>
          <Pressable onPress={() => setShowCost(!showCost)} style={{ flexDirection: 'row', alignItems: 'center' }} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.sub, fontWeight: '700', fontSize: 13 }}>Estimated total</Text>
              <Text style={{ fontSize: 26, fontWeight: '900', color: C.navy }}>{money2(q.total)}</Text>
              {repeat ? <Text style={{ color: C.green, fontWeight: '700', fontSize: 12 }}>No booking fee: you’ve flown with {cfi ? cfi.name.split(' ')[0] : 'this plane'} before</Text> : null}
            </View>
            <Text style={{ color: C.blue, fontWeight: '800', marginRight: 4 }}>{showCost ? 'Hide' : 'Details'}</Text>
            <Icon name={showCost ? 'down' : 'chevron'} size={16} color={C.blue} />
          </Pressable>
          {showCost && <View style={{ marginTop: 10 }}>
          {cfi && <Row label={`Flight instruction · ${flightHours} hr × ${money(cfi.flightRate)}`} value={money2(q.instruction)} />}
          {cfi && groundHours > 0 && <Row label={`Ground · ${groundHours} hr × ${money(cfi.groundRate)}`} value={money2(q.ground)} />}
          {plane && <Row label={`${plane.tail} ${prepaid ? 'prepaid block' : 'wet'} · ${flightHours} hr × ${money(q.rate)}`} value={money2(q.aircraft)} />}
          {ownPlane && <Row label="Your aircraft" value="$0.00" />}
          {plane && FEES.protectionPerHr > 0 && <Row label={`Rental protection · ${money(FEES.protectionPerHr)}/hr`} value={money2(q.protection)} />}
          {repeat ? (
            <View style={bs.repeat}>
              <Text style={{ color: C.green, fontWeight: '800', flex: 1 }}>Repeat booking · no booking fee</Text>
              <Text style={{ color: C.green, fontWeight: '800', textDecorationLine: 'line-through' }}>{money2(q.waivedFee)}</Text>
            </View>
          ) : (
            <Row label={`Booking fee (first ${cfi ? 'lesson with ' + cfi.name.split(' ')[0] : 'rental of this plane'}) · 6%`} value={money2(q.bookingFee)} />
          )}
          </View>}
          {q.deposit > 0 && <Row label="Refundable damage deposit (hold only)" value={money2(q.deposit)} />}
          <Text style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>
            {repeat ? 'Every lesson after your first with the same CFI is fee-free.' : 'Book again with the same CFI and the booking fee drops to $0.'} Final charge uses actual Hobbs time.
          </Text>
        </Card>

        <View style={[bs.covered, { flexDirection: 'row' }]}>
          <Icon name="shield" size={20} color={C.navy} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontWeight: '800', color: C.navy }}>Protected booking</Text>
            <Text style={{ color: C.navy, fontSize: 13, marginTop: 2, lineHeight: 18 }}>
              Payment protection, free weather cancellations{cfi ? ', and it’s logged to your training record' : ''}. You’re only charged after the flight.
            </Text>
          </View>
        </View>
      </ScrollView>
      {!!payErr && <Text style={{ color: '#B91C1C', fontWeight: '600', paddingHorizontal: 16, paddingBottom: 6, backgroundColor: '#fff' }} accessibilityLiveRegion="polite">{payErr}</Text>}
      <View style={bs.cta}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '900', fontSize: 20, color: C.navy }}>{money2(q.total)}</Text>
          <Text style={{ color: C.sub, fontSize: 12 }}>{slot ? `${dateLabel(day.toISOString())} · ${SLOTS.find((s) => s.h === slot).label}` : 'Pick a time'}</Text>
        </View>
        <Button
          title={busy ? 'Sending…' : blocked ? 'Checks not met' : !slot ? 'Pick a time' : 'Send request'}
          style={{ paddingHorizontal: 22 }}
          disabled={busy || blocked || !slot || (!cfi && !plane) || (!live && walletShort)}
          onPress={submit}
        />
      </View>
    </View>
  );
}

export function Lessons({ nav }) {
  const { requests, getCfi, getPlane, updateRequest, debriefForRequest } = useStore();
  const lib = useLibrary();
  React.useEffect(() => { lib.refresh(); }, []);
  const reviewFor = (r) => (['Pending', 'Confirmed'].includes(r.status) ? lib.reviews.find((x) => x.bookingId === r.id && x.studentId === lib.uid) : null);
  const upcoming =requests.filter((r) => ['Pending', 'Confirmed'].includes(r.status)).sort((a, b) => new Date(a.when) - new Date(b.when));
  const past = requests.filter((r) => ['Completed', 'Cancelled'].includes(r.status)).sort((a, b) => new Date(b.when) - new Date(a.when));

  const card = (r) => {
    const c = getCfi(r.cfiId);
    const p = getPlane(r.planeId);
    const colors = { Confirmed: [C.green, '#E3F7EF'], Completed: [C.green, '#E3F7EF'], Pending: ['#B45309', '#FEF3C7'], Cancelled: [C.sub, '#EEF1F5'] }[r.status];
    return (
      <Card key={r.id}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: C.text, flex: 1 }}>{r.goal}</Text>
          <Tag label={r.status} color={colors[0]} bg={colors[1]} />
        </View>
        <Text style={{ color: C.sub, marginTop: 2 }}>{r.date} · {r.time}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
          {c && <Avatar initials={c.initials} color={c.color} size={36} photo={c.photo} />}
          {p && <View style={{ marginLeft: c ? 8 : 0 }}><PlaneImage plane={p} size={36} style={{ borderRadius: 10 }} /></View>}
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ color: C.text, fontWeight: '600' }}>{c ? c.name : 'Solo'}{p ? ` · ${p.tail}` : r.ownPlane ? ' · Own aircraft' : ''}</Text>
            <Text style={{ color: C.sub, fontSize: 12 }}>
              {r.flightHours} hr flight{r.groundHours ? ` + ${r.groundHours} hr ground` : ''} · {r.method === 'wallet' ? 'Wallet' : 'Card'}
            </Text>
          </View>
          <Text style={{ fontWeight: '900', color: C.navy, fontSize: 16 }}>{money2(r.status === 'Cancelled' ? r.cancel?.fee || 0 : r.total)}</Text>
        </View>
        {r.status === 'Cancelled' && (
          <Text style={{ color: C.sub, fontSize: 12, marginTop: 8 }}>
            {r.cancel.reason}{r.cancel.fee ? ` · late-cancel fee ${money2(r.cancel.fee)} paid to CFI` : ' · no charge, hold released'}
          </Text>
        )}
        {r.dispute && <Text style={[bs.warn, { marginTop: 8 }]}>Dispute: {r.dispute.reason} · {r.dispute.status}</Text>}
        {reviewFor(r) && <ReviewChip review={reviewFor(r)} studied={lib.studied} onPress={() => nav.push('PreflightReview', { bookingId: r.id })} />}

        <View style={bs.actions}>
          {(c || p) && r.status !== 'Cancelled' && (
            <Pressable onPress={() => nav.push('Chat', { key: c ? c.id : p.id })} style={bs.action}><Text style={bs.actionText}>Message</Text></Pressable>
          )}
          {['Pending', 'Confirmed'].includes(r.status) && (
            <Pressable onPress={() => nav.push('Cancel', { id: r.id })} style={bs.action}><Text style={[bs.actionText, { color: '#DC2626' }]}>Cancel</Text></Pressable>
          )}
          {debriefForRequest(r.id) && (
            <Pressable onPress={() => nav.push('Debrief', { id: debriefForRequest(r.id).id })} style={[bs.action, !debriefForRequest(r.id).acknowledged && !debriefForRequest(r.id).pending && { backgroundColor: C.sky }]}>
              <Text style={bs.actionText}>{debriefForRequest(r.id).pending ? 'Debrief pending' : debriefForRequest(r.id).acknowledged ? 'Debrief' : 'Debrief · new'}</Text>
            </Pressable>
          )}
          {r.receipt && (
            <Pressable onPress={() => nav.push('Receipt', { id: r.id })} style={bs.action}><Text style={bs.actionText}>Receipt</Text></Pressable>
          )}
        </View>

        {r.live && r.status === 'Pending' && <Text style={[bs.hint, { marginTop: 8 }]}>Waiting for {c ? c.name.split(' ')[0] : 'the owner'} to confirm. Your card is saved and charged only after the flight.</Text>}
        {r.live && r.status === 'Completed' && <Text style={[bs.hint, { marginTop: 8 }]}>Charged {money2(r.total)}{r.actualHobbs ? ` for ${r.actualHobbs} hr on the Hobbs` : ''}.</Text>}
        {!r.live && r.status === 'Pending' && (
          <Pressable onPress={() => updateRequest(r.id, { status: 'Confirmed' })} style={bs.demo}>
            <Text style={bs.demoText}>Demo: {c ? 'CFI' : 'owner'} confirms ›</Text>
          </Pressable>
        )}
        {!r.live && r.status === 'Confirmed' && (
          <Pressable onPress={() => nav.push('CloseOut', { id: r.id })} style={bs.demo}>
            <Text style={bs.demoText}>Demo: {c ? 'CFI closes out flight (Hobbs, lesson, endorsements)' : 'close out rental (Hobbs, squawks)'} ›</Text>
          </Pressable>
        )}
        {r.status === 'Completed' && (
          <View style={bs.reviewBox}>
            <Text style={{ color: C.text, fontWeight: '800', marginBottom: 8 }}>How did it go?</Text>
            <View style={{ flexDirection: 'row' }}>
              {c && (
                <Button title={r.reviewedCfi ? '✓ Reviewed' : `Review ${c.name.split(' ')[0]}`} variant="outline" disabled={r.reviewedCfi}
                  style={{ flex: 1, paddingVertical: 10, marginRight: p ? 8 : 0 }} onPress={() => nav.push('Review', { requestId: r.id, kind: 'cfi' })} />
              )}
              {p && (
                <Button title={r.reviewedPlane ? '✓ Reviewed' : `Review ${p.tail}`} variant="outline" disabled={r.reviewedPlane}
                  style={{ flex: 1, paddingVertical: 10 }} onPress={() => nav.push('Review', { requestId: r.id, kind: 'plane' })} />
              )}
            </View>
            {c && (
              <Button title={`Book again with ${c.name.split(' ')[0]} · $0 fee`} style={{ marginTop: 8, paddingVertical: 11 }}
                onPress={() => nav.push('Request', { cfiId: c.id, planeId: p?.id || null })} />
            )}
          </View>
        )}
      </Card>
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={bs.h1}>My lessons</Text>
      <SectionTitle>Upcoming</SectionTitle>
      {upcoming.length === 0 && <Text style={{ color: C.sub }}>Nothing scheduled. Find a CFI and a plane to get started.</Text>}
      {upcoming.map(card)}
      <SectionTitle>Past</SectionTitle>
      {past.map(card)}
    </ScrollView>
  );
}

const CANCEL_REASONS = ['Weather', 'Aircraft maintenance / squawk', 'Instructor unavailable', 'Personal / schedule change'];

export function CancelLesson({ nav, params }) {
  const { getRequest, getCfi, cancelRequest, refreshLive } = useStore();
  const r = getRequest(params.id);
  const [reason, setReason] = useState('Weather');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!r) return null;
  const cfi = getCfi(r.cfiId);
  const late = hoursUntil(r.when) < 24;
  // Live bookings follow the server's rule: cancelling a confirmed lesson yourself inside
  // 24 hours costs half the instruction. For weather or maintenance, the instructor cancels (free).
  const liveFee = r.live && r.status === 'Confirmed' && r.cfiId && late ? r2(((r.quote?.instruction || 0) + (r.quote?.ground || 0)) * FEES.lateCancel) : 0;
  const fee = r.live ? liveFee : reason === 'Personal / schedule change' && late && cfi ? r2(cfi.flightRate * r.flightHours * FEES.lateCancel) : 0;
  const cancel = async () => {
    if (!r.live) { setDone(cancelRequest(r.id, reason)); return; }
    setErr(''); setBusy(true);
    try {
      const res = await bookingAction(r.id, 'cancel', { reason });
      await refreshLive().catch(() => {});
      setDone(res.feeCharged || 0);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Cancel lesson" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
        {done !== null ? (
          <Card>
            <Text style={{ fontWeight: '900', fontSize: 18, color: C.text }}>Lesson cancelled</Text>
            <Text style={{ color: C.sub, marginTop: 6, lineHeight: 20 }}>
              {done > 0 ? `A late-cancel fee of ${money2(done)} was charged and paid to ${cfi.name.split(' ')[0]} (instructors are guaranteed pay for late cancellations).` : 'No charge. Your hold has been released.'}
            </Text>
            <Button title="Back to lessons" style={{ marginTop: 14 }} onPress={() => nav.goTab('Lessons')} />
          </Card>
        ) : (
          <>
            <Card>
              <Text style={{ fontWeight: '800', color: C.text }}>{r.goal}</Text>
              <Text style={{ color: C.sub, marginTop: 2 }}>{r.date} · {r.time} · {late ? 'less than 24 hrs away' : 'more than 24 hrs away'}</Text>
            </Card>
            <SectionTitle>Why are you cancelling?</SectionTitle>
            {CANCEL_REASONS.map((x) => (
              <Pressable key={x} onPress={() => setReason(x)} style={[bs.pay, reason === x && bs.pickOn]}>
                <Text style={{ flex: 1, fontWeight: '700', color: C.text }}>{x}</Text>
                <Text style={{ color: (r.live ? liveFee > 0 : x === 'Personal / schedule change' && late) ? '#B45309' : C.green, fontWeight: '800', fontSize: 12 }}>
                  {r.live ? (liveFee > 0 ? 'Late fee' : 'Free') : x === 'Personal / schedule change' ? (late ? 'Late fee' : 'Free') : 'Always free'}
                </Text>
              </Pressable>
            ))}
            <Card style={{ marginTop: 8 }}>
              <Row bold label="Cancellation charge" value={money2(fee)} />
              {r.live && liveFee > 0 && <Text style={[bs.warn, { marginTop: 6 }]}>Cancelling for weather or a plane problem? Message {cfi ? cfi.name.split(' ')[0] : 'your instructor'} and ask them to cancel. When they cancel, it’s free.</Text>}
              <Text style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>
                Policy: weather, maintenance and instructor cancellations are always free. Personal cancellations are free until 24 hrs before; after that, 50% of instruction goes to your CFI.
              </Text>
            </Card>
          </>
        )}
      </ScrollView>
      {done === null && (
        <View style={bs.cta}>
          {!!err && <Text style={{ color: '#B91C1C', fontWeight: '600', position: 'absolute', top: -24, left: 16 }}>{err}</Text>}
          <Button title={busy ? 'Cancelling…' : fee ? `Cancel & pay ${money2(fee)}` : 'Cancel lesson — no charge'} style={{ flex: 1, backgroundColor: '#DC2626' }} disabled={busy} onPress={cancel} />
        </View>
      )}
    </View>
  );
}

const ENDORSEMENT_OPTIONS = [
  { name: 'Solo cross-country', ref: '61.93(c)' },
  { name: 'Solo XC (each flight)', ref: '61.93(c)(2)' },
  { name: 'Practical test', ref: '61.103(f) / 61.39' },
];

export function CloseOut({ nav, params }) {
  const { getRequest, getCfi, getPlane, closeOut, training } = useStore();
  const r = getRequest(params.id);
  const plane = r && getPlane(r.planeId);
  const cfi = r && getCfi(r.cfiId);
  const startH = plane ? plane.hobbsTotal : 0;
  const [hobbsOut, setOut] = useState(String(startH));
  const [hobbsIn, setIn] = useState(String(r2(startH + (r?.flightHours || 1))));
  const [ground, setGround] = useState(r?.groundHours || 0);
  const [night, setNight] = useState(/night/i.test(r?.goal || ''));
  const [xc, setXc] = useState(/cross/i.test(r?.goal || ''));
  const [instrument, setInstrument] = useState(false);
  const [lessons, setLessons] = useState([]);
  const [endorse, setEndorse] = useState(null);
  const [squawk, setSquawk] = useState('');
  const [grounding, setGrounding] = useState(false);
  const [debrief, setDebrief] = useState(emptyDebrief());
  if (!r) return null;
  const carryOver = focusAreas(training.debriefs).map((f) => f.item);
  const suggested = /cross/i.test(r.goal) ? ['Pilotage & dead reckoning', 'Flight following / ATC', 'Normal takeoff & landing'] : /night/i.test(r.goal) ? ['Normal takeoff & landing', 'Pattern work', 'ADM & risk management'] : /assess/i.test(r.goal) ? ['Preflight & checklists', 'Normal takeoff & landing', 'Slow flight', 'Power-off stall', 'Emergency procedures'] : ['Normal takeoff & landing', 'Radio calls'];
  const next = ALL_LESSONS.filter((l) => lessonState(training, l) !== 'app').slice(0, 4);
  const fh = r2(Math.max(0, +hobbsIn - +hobbsOut));

  const submit = () => {
    closeOut(r.id, {
      hobbsOut: +hobbsOut, hobbsIn: +hobbsIn, groundHours: cfi ? ground : 0, night, xc, instrument,
      lessonNames: lessons, endorsement: endorse, squawk: squawk.trim(), grounding, debrief: cfi ? debrief : null,
    });
    nav.replace('Receipt', { id: r.id, fresh: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Close out flight" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
        <Text style={bs.hint}>Demo of the {cfi ? 'instructor' : 'owner'}’s screen after landing. Billing, the student’s training record and the aircraft logs all update from this one step.</Text>
        <SectionTitle>Hobbs</SectionTitle>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label="Hobbs out" keyboardType="numeric" value={hobbsOut} onChangeText={setOut} /></View>
          <View style={{ flex: 1 }}><Field label="Hobbs in" keyboardType="numeric" value={hobbsIn} onChangeText={setIn} /></View>
        </View>
        <Text style={{ color: C.navy, fontWeight: '800', marginBottom: 6 }}>Flight time: {fh} hr</Text>
        {cfi && <Card><Stepper label="Ground instruction" value={ground} onChange={setGround} /></Card>}

        {cfi && (
          <>
            <SectionTitle>Log to training record</SectionTitle>
            <Toggle label="Night" value={night} onValueChange={setNight} />
            <Toggle label="Cross-country" value={xc} onValueChange={setXc} />
            <Toggle label="Simulated instrument" value={instrument} onValueChange={setInstrument} />
            <Text style={[bs.hint, { marginTop: 6 }]}>Syllabus items completed today</Text>
            {next.map((l) => (
              <React.Fragment key={l}>
              <Pressable key={l} onPress={() => setLessons(lessons.includes(l) ? lessons.filter((x) => x !== l) : [...lessons, l])} style={[bs.pay, lessons.includes(l) && bs.pickOn]}>
                <Text style={{ flex: 1, fontWeight: '700', color: C.text }}>{l}</Text>
                <Text style={{ color: lessons.includes(l) ? C.blue : C.line, fontWeight: '900', fontSize: 18 }}>✓</Text>
              </Pressable>
              {['prior', 'rusty'].includes(lessonState(training, l)) && <Text style={[bs.hint, { marginTop: -4 }]}>{lessonState(training, l) === 'rusty' ? 'Flagged for review from previous training' : 'Student says they covered this before. Sign off once you’ve seen it.'}</Text>}
              </React.Fragment>
            ))}
            <Text style={[bs.hint, { marginTop: 6 }]}>Sign an endorsement (optional)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {ENDORSEMENT_OPTIONS.filter((e) => upcomingEndorsements(training).some((u) => u.name === e.name)).map((e) => (
                <Chip key={e.name} small label={`${e.name} · ${e.ref}`} active={endorse?.name === e.name} onPress={() => setEndorse(endorse?.name === e.name ? null : e)} />
              ))}
            </View>
          </>
        )}

        {cfi && (
          <>
            <SectionTitle>Debrief</SectionTitle>
            <Text style={bs.hint}>Saved to the student’s training record. They can review it any time, and so can a future CFI if they share their record.</Text>
            <DebriefEditor value={debrief} onChange={setDebrief} suggested={suggested} carryOver={carryOver} />
            {isEmptyDebrief(debrief) && <Text style={[bs.warn, { marginTop: 10 }]}>No debrief yet. You can close out now and write it later. It’ll show as “Debrief due” on your dashboard.</Text>}
          </>
        )}

        {plane && (
          <>
            <SectionTitle>Aircraft squawks</SectionTitle>
            <Field value={squawk} onChangeText={setSquawk} placeholder="Anything wrong with the plane? (optional)" />
            {squawk ? <Toggle label="Grounding — aircraft unairworthy" value={grounding} onValueChange={setGrounding} hint="Blocks new bookings until the owner resolves it" /> : null}
          </>
        )}
      </ScrollView>
      <View style={bs.cta}>
        <Button title={fh > 0 ? `Close out ${fh} hr & bill` : 'Check Hobbs times'} disabled={!(fh > 0)} style={{ flex: 1 }} onPress={submit} />
      </View>
    </View>
  );
}

const DISPUTES = ['Hobbs time looks wrong', 'Aircraft issue during flight', 'Instructor no-show / late', 'Charged incorrectly'];

export function Receipt({ nav, params }) {
  const { getRequest, getCfi, getPlane, getSchool, dispute, debriefForRequest } = useStore();
  const r = getRequest(params.id);
  const [showDispute, setShowDispute] = useState(false);
  if (!r || !r.receipt) return null;
  const q = r.receipt;
  const cfi = getCfi(r.cfiId);
  const plane = getPlane(r.planeId);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Receipt" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {params.fresh && (
          <View style={[bs.covered, { backgroundColor: '#E3F7EF', marginTop: 0 }]}>
            <Text style={{ color: C.green, fontWeight: '900' }}>✓ Flight closed out</Text>
            <Text style={{ color: C.text, marginTop: 4, fontSize: 13 }}>Billed from Hobbs, training record updated{plane ? ', aircraft logs updated' : ''}, payouts queued.</Text>
          </View>
        )}
        {debriefForRequest(r.id) && (
          <Card onPress={() => nav.push('Debrief', { id: debriefForRequest(r.id).id })} style={{ flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: C.blue }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: C.text }}>{debriefForRequest(r.id).pending ? 'Debrief pending' : 'Instructor debrief'}</Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>{debriefForRequest(r.id).pending ? 'Your CFI will add notes soon' : 'Grades, notes, next lesson & homework'}</Text>
            </View>
            <Text style={{ color: C.blue, fontSize: 20 }}>›</Text>
          </Card>
        )}
        <Card>
          <Text style={{ fontWeight: '900', fontSize: 18, color: C.text }}>{r.goal}</Text>
          <Text style={{ color: C.sub, marginTop: 2 }}>{r.date} · {r.time}</Text>
          {plane && <Row label={`Hobbs ${q.hobbsOut} → ${q.hobbsIn}`} value={`${r2(q.hobbsIn - q.hobbsOut)} hr`} />}
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
          {q.instruction > 0 && <Row label={`Flight instruction · ${cfi?.name}`} value={money2(q.instruction)} />}
          {q.ground > 0 && <Row label="Ground instruction" value={money2(q.ground)} />}
          {q.aircraft > 0 && <Row label={`${plane.tail} · ${money(q.rate)}/hr${q.prepaidSavings ? ' (prepaid)' : ''}`} value={money2(q.aircraft)} />}
          {q.protection > 0 && <Row label="Rental protection" value={money2(q.protection)} />}
          <Row label={q.bookingFee ? 'Booking fee (first lesson)' : 'Booking fee (repeat — waived)'} value={money2(q.bookingFee)} />
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
          <Row bold label={`Paid · ${q.paidWith}`} value={money2(q.total)} />
          {q.prepaidSavings > 0 && <Text style={{ color: C.green, fontWeight: '700', fontSize: 12 }}>You saved {money2(q.prepaidSavings)} with prepaid block rates.</Text>}
          {q.depositReleased > 0 && <Text style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>Damage deposit hold of {money2(q.depositReleased)} released.</Text>}
        </Card>

        <SectionTitle>Where your money went</SectionTitle>
        <Card>
          {cfi && <Row label={`${cfi.name} (instructor)`} value={money2(q.split.cfi)} />}
          {cfi && q.split.school > 0 && (
            <Row label={`${getSchool(cfi.schoolId)?.name || 'Flight school'} (school share)`} value={money2(q.split.school)} />
          )}
          {plane && <Row label={`${plane.ownerName} (aircraft)`} value={money2(q.split.owner)} />}
          {q.split.protection > 0 && <Row label="Insurance partner (rental protection)" value={money2(q.split.protection)} />}
          {q.split.processing > 0 && <Row label="Card processing (Stripe)" value={money2(q.split.processing)} />}
          <Row label="RightSeat" value={money2(q.split.platform)} />
          <Text style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>Paid out automatically through Stripe Connect. No Venmo, no chasing invoices.</Text>
        </Card>

        <SectionTitle>Problem with this flight?</SectionTitle>
        {r.dispute ? (
          <Text style={bs.warn}>Dispute opened {r.dispute.opened}: {r.dispute.reason} · {r.dispute.status}. We hold the payout until it’s resolved.</Text>
        ) : showDispute ? (
          DISPUTES.map((d) => (
            <Pressable key={d} onPress={() => { dispute(r.id, d); setShowDispute(false); }} style={bs.pay}>
              <Text style={{ flex: 1, fontWeight: '700', color: C.text }}>{d}</Text>
              <Text style={{ color: C.blue, fontWeight: '800' }}>›</Text>
            </Pressable>
          ))
        ) : (
          <Button title="Report a problem" variant="outline" onPress={() => setShowDispute(true)} />
        )}
        <Text style={[bs.hint, { marginTop: 8 }]}>Disputes, refunds and weather credits are only available for flights booked and paid in RightSeat.</Text>
      </ScrollView>
    </View>
  );
}

const CFI_TAGS = ['Well prepared', 'Patient', 'Clear explanations', 'Great debriefs', 'On time', 'Safety-focused', 'Good value'];
const PLANE_TAGS = ['Clean', 'Well maintained', 'Great avionics', 'Easy to schedule', 'Accurate squawk list', 'Great value', 'Fuel/billing as listed'];

export function LeaveReview({ nav, params }) {
  const { getRequest, getCfi, getPlane, addReview, updateRequest, refreshListings, refreshLive } = useStore();
  const auth = useAuth();
  const r = getRequest(params.requestId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState([]);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  if (!r) return null;
  const isCfi = params.kind === 'cfi';
  const target = isCfi ? getCfi(r.cfiId) : getPlane(r.planeId);
  const role = isCfi || r.cfiId ? 'Student' : 'Renter';
  const title = isCfi ? target.name : `${target.year} ${target.make} ${target.model}`;

  const submit = async () => {
    if (r.live) {
      setErr(''); setBusy(true);
      try {
        await postReview(auth.session.user.id, { bookingId: r.id, subject: isCfi ? 'cfi' : 'plane', rating, tags, text: text.trim() });
        await Promise.all([refreshListings().catch(() => {}), refreshLive().catch(() => {})]);
        nav.replace(isCfi ? 'Cfi' : 'Plane', { id: target.id });
      } catch (e) { setErr(e.message); }
      setBusy(false);
      return;
    }
    const review = {
      name: name.trim() || 'RightSeat pilot', verified: true, role, lesson: r.goal,
      date: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), bookingId: r.id, tags, rating, text: text.trim(),
    };
    addReview(isCfi ? 'cfi' : 'plane', target.id, review);
    if (isCfi && target.schoolId) addReview('school', target.schoolId, review);
    updateRequest(r.id, isCfi ? { reviewedCfi: true } : { reviewedPlane: true });
    nav.replace(isCfi ? 'Cfi' : 'Plane', { id: target.id });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={isCfi ? 'Review instructor' : 'Review aircraft'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          {isCfi ? <Avatar initials={target.initials} color={target.color} photo={target.photo} size={52} /> : <PlaneImage plane={target} size={56} />}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontWeight: '900', fontSize: 16, color: C.text }}>{title}</Text>
            <Text style={{ color: C.sub, marginTop: 2 }}>{r.goal} · {r.date} · {r.flightHours} hr</Text>
            <View style={{ flexDirection: 'row', marginTop: 6 }}><VerifiedBadge role={role} /></View>
          </View>
        </Card>
        <Text style={{ color: C.sub, fontSize: 12, marginBottom: 6 }}>
          Your review is tied to booking #{r.id.slice(0, 8).toUpperCase()}, so it shows a verified badge. Only people who completed a booking can review.
        </Text>
        <SectionTitle>Overall rating</SectionTitle>
        <StarPicker value={rating} onChange={setRating} />
        <SectionTitle>What stood out?</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {(isCfi ? CFI_TAGS : PLANE_TAGS).map((t) => (
            <Chip key={t} small label={t} active={tags.includes(t)} onPress={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])} />
          ))}
        </View>
        <SectionTitle>Tell other pilots</SectionTitle>
        <Field multiline value={text} onChangeText={setText} placeholder={isCfi ? 'How was the lesson, briefing and debrief?' : 'Condition, squawks, scheduling, billing…'} />
        {r.live
          ? <Text style={{ color: C.sub, fontSize: 12 }}>Shown with your first name and last initial.</Text>
          : <Field label="Display name" value={name} onChangeText={setName} placeholder="e.g. Sam C." />}
        {!!err && <Text style={{ color: '#B91C1C', fontWeight: '600', marginTop: 10 }}>{err}</Text>}
      </ScrollView>
      <View style={bs.cta}>
        <Button title={busy ? 'Posting…' : rating ? 'Post verified review' : 'Tap a star rating'} disabled={!rating || busy} style={{ flex: 1 }} onPress={submit} />
      </View>
    </View>
  );
}

const bs = StyleSheet.create({
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  summary: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 18, marginBottom: 8, borderWidth: 1, borderColor: '#D1FAE5' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.blue },
  h1: { fontSize: 28, fontWeight: '900', color: C.text, marginTop: 6 },
  hint: { color: C.sub, fontSize: 12, marginBottom: 6 },
  pick: { width: 112, backgroundColor: '#fff', borderRadius: 14, padding: 10, marginRight: 10, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  pickOn: { borderColor: C.blue, backgroundColor: C.sky },
  pickName: { fontWeight: '800', color: C.text, marginTop: 6, fontSize: 13 },
  pickSub: { color: C.sub, fontSize: 11, marginTop: 1, textAlign: 'center' },
  flies: { color: C.green, fontSize: 10, fontWeight: '800', marginTop: 3, textAlign: 'center' },
  soloIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEF1F5', alignItems: 'center', justifyContent: 'center' },
  date: { width: 64, paddingVertical: 10, backgroundColor: '#fff', borderRadius: 12, alignItems: 'center', marginRight: 8, borderWidth: 2, borderColor: 'transparent' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 10 },
  slot: { width: '31.5%', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginBottom: 8, borderWidth: 1.5, borderColor: C.line },
  slotBusy: { backgroundColor: '#F1F3F7', borderColor: '#F1F3F7' },
  pay: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 2, borderColor: 'transparent' },
  repeat: { flexDirection: 'row', backgroundColor: '#E3F7EF', borderRadius: 8, padding: 8, marginVertical: 4 },
  covered: { backgroundColor: C.sky, borderRadius: 14, padding: 14, marginTop: 16 },
  coveredLine: { color: C.navy, fontSize: 13, marginTop: 3 },
  warn: { color: '#B45309', backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10, marginBottom: 8, fontSize: 12, fontWeight: '600' },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.line },
  check: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  actions: { flexDirection: 'row', marginTop: 12 },
  action: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F1F5F9', marginRight: 8 },
  actionText: { color: C.blue, fontWeight: '800', fontSize: 13 },
  demo: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#F8FAFC', borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: '#CBD5E1' },
  demoText: { color: C.sub, fontWeight: '700', fontSize: 12 },
  reviewBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
});
