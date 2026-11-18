import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useStore, money } from '../store';
import { SYLLABUS } from '../data';
import { quote, isRepeat, bookingChecks, money2, dateLabel, timeLabel, hoursUntil, FEES, r2 } from '../logic';
import { C, Card, Avatar, Chip, Row, SectionTitle, Button, Stepper, Tag, StarPicker, Field, VerifiedBadge, Toggle, Icon, Banner } from '../ui';

function Step({ n, title, done }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10 }}>
      <View style={[bs.stepNum, done && { backgroundColor: C.green }]}>{done ? <Icon name="check" size={14} color="#fff" strokeWidth={3} /> : <Text style={{ color: C.navy, fontWeight: '900', fontSize: 13 }}>{n}</Text>}</View>
      <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }} accessibilityRole="header">{title}</Text>
    </View>
  );
}
import { PlaneImage } from '../art';
import { useAuth } from '../backend/auth';
import { useBookingPayment, useSplitDeposit, useAcceptProposal, CARD_PAYMENTS_SUPPORTED } from '../backend/payments';
import { bookingAction, splitAction } from '../backend/bookings';
import { postReview } from '../backend/profiles';
import { useLibrary } from '../library/useLibrary';
import { ReviewChip } from './Library';
import { RenterInsuranceCard } from './RenterInsurance';
import { useOpenTimes } from '../useOpenTimes';
import { usePilot, requestCheckout } from '../backend/pilot';
import { renterChecks, ownerChecksOut, ymdIn } from '../renterChecks';
import { aircraftChecks } from '../aircraftStatus';
import { MonthCalendar, cmpDate, shortDate, longDate } from '../calendarUi';
import { DEFAULT_TZ, todayIn, addDays, dateKey, timeIn, tzAbbrev } from '../schedule';

// Listings stored in the live database have UUID ids; the built-in sample listings don't.
const isLive = (id) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id);
import { Header } from './Details';
import { planeVerified } from './Verify';
import { ALL_LESSONS, lessonState, hasPrior, upcomingEndorsements } from '../progress';
import { DebriefEditor, emptyDebrief } from './Debrief';
import { focusAreas, isEmptyDebrief } from '../debrief';

const GOALS = ['Assessment flight', 'Discovery flight', 'Private Pilot lesson', 'Dual cross-country', 'Night flying', 'Instrument lesson', 'Commercial maneuvers', 'Multi-engine', 'Flight review (BFR)', 'IPC', 'Aircraft checkout', 'Tailwheel'];

export function CheckList({ checks }) {
  return (
    <Card>
      {checks.map((c) => (
        <View key={c.label} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5 }}>
          <Text style={{ width: 22, fontWeight: '900', color: c.ok ? C.green : c.blocking ? '#B91C1C' : '#B45309' }}>{c.ok ? '✓' : c.blocking ? '✕' : '!'}</Text>
          <Text style={{ flex: 1, color: c.ok ? C.text : c.blocking ? '#B91C1C' : '#B45309', fontWeight: c.ok ? '500' : '700' }}>{c.label}</Text>
        </View>
      ))}
    </Card>
  );
}

// What to do about failing renter checks: fill in the pilot profile, or ask the owner for a checkout.
export function RenterFixes({ checks, plane, nav, onCheckout, busy, err, onCheckoutFlight, student }) {
  const bad = checks.filter((c) => c.blocking && !c.ok);
  const needProfile = bad.some((c) => c.fix === 'profile');
  const needCheckout = bad.some((c) => c.fix === 'checkout') || checks.some((c) => c.key === 'checkout' && !c.ok);
  const waiting = checks.some((c) => c.key === 'checkout' && !c.ok && !c.fix);
  // The owner does checkouts: book a checkout flight with them (not for student pilots).
  const flightWithOwner = onCheckoutFlight && needCheckout && !needProfile && !student && ownerChecksOut(plane);
  if (!needProfile && !needCheckout && !waiting) return null;
  return (
    <View style={bs.fixes}>
      {needProfile && (
        <Pressable onPress={() => nav.push('PilotProfile')} accessibilityRole="button" style={bs.fixRow}>
          <Text style={bs.fixText}>Update your pilot profile ›</Text>
        </Pressable>
      )}
      {flightWithOwner && (
        <Pressable onPress={onCheckoutFlight} accessibilityRole="button" style={bs.fixRow}>
          <Text style={bs.fixText}>Book a checkout flight with the owner ›</Text>
        </Pressable>
      )}
      {needCheckout && !needProfile && !waiting && !(flightWithOwner && plane.checkoutBy === 'owner') && (
        <Pressable onPress={onCheckout} disabled={busy} accessibilityRole="button" style={bs.fixRow}>
          <Text style={bs.fixText}>{busy ? 'Sending…' : `Ask the owner to check you out in ${plane.tail} ›`}</Text>
        </Pressable>
      )}
      {waiting && <Text style={[bs.hint, { marginTop: 0 }]}>{ownerChecksOut(plane) ? 'The owner reviews your pilot profile and confirms you’re checked out, usually after a checkout flight with them.' : 'The owner reviews your pilot profile and confirms you’re checked out. Usually you’ll fly a checkout with a CFI first: book one from this plane’s page.'} You’ll get a notification.</Text>}
      {!!err && <Text style={[bs.warn, { marginTop: 6 }]}>{err}</Text>}
    </View>
  );
}

export function RequestLesson({ nav, params }) {
  const { cfis, planes, getCfi, getPlane, addRequest, requests, pilot, available, training, docs, setSharing, affiliationFor, feeContextFor, refreshLive } = useStore();
  const [shareRecord, setShareRecord] = useState(true);
  const [cfiId, setCfiId] = useState(params.cfiId);
  const [planeId, setPlaneId] = useState(params.planeId);
  const [ownPlane, setOwnPlane] = useState(false);
  const [date, setDate] = useState(null);   // calendar date in the instructor's time zone
  const [start, setStart] = useState(null); // chosen start time (Date)
  const [goal, setGoal] = useState(params.goal || (params.cfiId && !isRepeat(requests, { cfiId: params.cfiId }) ? (hasPrior(training) ? 'Assessment flight' : 'Discovery flight') : 'Private Pilot lesson'));
  const [flightHours, setFlightHours] = useState(params.flightHours || 1.5);
  const [groundHours, setGroundHours] = useState(0.5);
  const [method, setMethod] = useState('card'); // wallet (prepaid) is on the V2 list
  const [sent, setSent] = useState(null);
  const [moreGoals, setMoreGoals] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [showCost, setShowCost] = useState(false);
  // A checkout flight with the plane's owner on board (for planes whose owner does checkouts).
  const [checkoutFlight, setCheckoutFlight] = useState(!!params.checkout);
  // Shared solo rental: invite another pilot; the cost is split 50/50 (FAA 61.113(c)).
  const [shareOn, setShareOn] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const sharePct = 50; // FAA 61.113(c): each pilot pays their pro rata share, so always 50/50

  const cfi = getCfi(cfiId);
  const plane = ownPlane ? null : getPlane(planeId);
  const repeat = isRepeat(requests, { cfiId: cfi?.id, planeId: plane?.id });
  const prepaid = method === 'wallet';
  const fees = feeContextFor({ cfi, plane });
  const q = quote({ cfi, plane, flightHours, groundHours: cfi ? groundHours : 0, repeat, prepaid, cfiPro: cfi?.pro, ...fees, method, affiliation: cfi ? affiliationFor(cfi.id) : null });
  // Renting a real plane without an instructor: your pilot profile and the owner's checkout.
  // (Sample listings keep the sample pilot so guests can try the flow.)
  const me = usePilot();
  const liveSolo = !cfi && !!plane && isLive(plane.id);
  // A real plane's condition: grounding squawks, 100-hour (when tracked) and annual.
  const airChecks = plane && isLive(plane.id)
    ? aircraftChecks({ plane, squawks: plane.squawks || [], flightHours, day: ymdIn(start || new Date()), include100hr: !liveSolo }) : [];
  const checks = liveSolo ? [
    ...(!me.signedIn ? [{ key: 'signin', label: 'Sign in to check you can rent this plane solo', ok: false, blocking: false }]
      : me.loading ? [{ key: 'loading', label: 'Checking your pilot profile…', ok: false, blocking: true }]
      : renterChecks({ profile: me.profile, checkout: me.checkoutFor(plane.id), plane, flightHours, start: start || new Date(), forCheckout: checkoutFlight && !cfi })),
    ...airChecks,
    { label: 'Aircraft registration & insurance verified', ok: planeVerified(plane, docs), blocking: true },
  ] : [
    // (A real plane's 100-hour and squawks come from airChecks instead of the sample rules.)
    ...bookingChecks({ pilot, cfi, plane, flightHours }).filter((c) => !(airChecks.length && /^100-hr|grounding squawk/i.test(c.label))),
    ...airChecks,
    ...(cfi?.live ? [{ label: 'Instructor verified by Positive Rate', ok: !!cfi.verified, blocking: true }] : []),
    ...(plane ? [{ label: 'Aircraft registration & insurance verified', ok: planeVerified(plane, docs), blocking: true }] : []),
    ...(!cfi && plane ? [{ label: 'Medical verified in Positive Rate', ok: docs.me?.medical?.status === 'approved', blocking: true }] : []),
  ];
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutErr, setCheckoutErr] = useState('');
  const askCheckout = async () => {
    setCheckoutErr(''); setCheckoutBusy(true);
    try { await requestCheckout(plane.id); } catch (e) { setCheckoutErr(e.message); }
    setCheckoutBusy(false);
  };
  const blocked = checks.some((c) => c.blocking && !c.ok);
  const walletShort = method === 'wallet' && available < q.total;

  // Calendar: open start times from the instructor's hours (or the plane's rental hours).
  const durationMin = Math.round((flightHours + (cfi ? groundHours : 0)) * 60);
  const ot = useOpenTimes({ cfi, plane, durationMin, requests });
  const tz = ot.schedule?.timezone || DEFAULT_TZ;
  const today = todayIn(tz);
  const lastDay = ot.schedule ? addDays(today, ot.schedule.maxDaysAhead) : addDays(today, 60);
  const [month, setMonth] = useState({ y: today.y, m: today.m });
  const monthSlots = useMemo(() => {
    const out = {};
    if (!ot.schedule) return out;
    const n = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
    for (let d = 1; d <= n; d++) {
      const dt = { y: month.y, m: month.m, d };
      if (cmpDate(dt, today) < 0 || cmpDate(dt, lastDay) > 0) continue;
      out[dateKey(dt)] = ot.slotsFor(dt);
    }
    return out;
  }, [ot.schedule, ot.busy.length, durationMin, month.y, month.m]);
  const slots = date ? monthSlots[dateKey(date)] || ot.slotsFor(date) : [];
  // Pick the first open day once the calendar loads; drop a time that no longer fits.
  useEffect(() => {
    if (date || ot.loading) return;
    const first = Object.keys(monthSlots).sort().find((k) => monthSlots[k].length);
    if (first) { const [y, m, d] = first.split('-').map(Number); setDate({ y, m, d }); }
    else if (cmpDate({ y: month.y, m: month.m, d: 28 }, lastDay) < 0 && !ot.error) setMonth(({ y, m }) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }));
  }, [ot.loading, monthSlots]);
  useEffect(() => { if (start && !slots.some((x) => +x === +start)) setStart(null); }, [slots.map((x) => +x).join()]);
  const localTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return tz; } })();

  const planeOptions = cfi
    ? [...cfi.aircraftIds.map(getPlane).filter(Boolean), ...planes.filter((p) => !cfi.aircraftIds.includes(p.id))]
    : planes.filter((p) => p.soloRental);
  const cfiOptions = plane ? [...cfis.filter((c) => c.aircraftIds.includes(plane.id)), ...cfis.filter((c) => !c.aircraftIds.includes(plane.id))] : cfis;

  const auth = useAuth();
  const payForBooking = useBookingPayment();
  const [busy, setBusy] = useState(false);
  const [payErr, setPayErr] = useState('');
  const live = isLive(cfi?.id) || isLive(plane?.id);
  const canShare = live && !cfi && !!plane && !checkoutFlight;
  const sharing = canShare && shareOn;
  const shareEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shareEmail.trim());
  const myShare = sharing ? r2(q.total * sharePct / 100) : q.total;
  const submit = async () => {
    const when = start.toISOString();
    if (live) {
      // Real booking: server prices it, then the student saves a card (charged after the flight).
      if (!auth?.session) { nav.push('SignIn', { reason: 'Sign in to book. We’ll email you a 6-digit code.' }); return; }
      if (!CARD_PAYMENTS_SUPPORTED) { setPayErr('Book from the Positive Rate iPhone or Android app.'); return; }
      setBusy(true); setPayErr('');
      try {
        const rentalGoal = checkoutFlight ? 'Checkout flight with the owner' : sharing ? 'Shared rental' : 'Solo rental';
        const res = await payForBooking({ cfiId: cfi?.id || null, planeId: plane?.id || null, startsAt: when, goal: cfi ? goal : rentalGoal, flightHours, groundHours: cfi ? groundHours : 0, prepaid,
          split: sharing ? { email: shareEmail.trim(), bookerPct: sharePct } : undefined, checkout: checkoutFlight && !cfi ? true : undefined });
        setBusy(false);
        if (res.cancelled) { setPayErr('Card not saved, so the request wasn’t sent. Tap Send request to try again.'); return; }
        const r = { id: res.booking.id, cfiId: cfi?.id || null, planeId: plane?.id || null, when, date: dateLabel(when), time: timeLabel(when), goal: cfi ? goal : rentalGoal, flightHours, groundHours: cfi ? groundHours : 0, total: res.quote.total, repeat, prepaid, method: 'card', deposit: res.quote.deposit, status: 'Pending', live: true, role: 'student',
          split: res.split ? { status: 'invited', bookerPct: res.split.bookerPct, partnerPct: 100 - res.split.bookerPct, partnerName: shareEmail.trim(), holdUntil: res.split.holdUntil, pending: true, bookerEst: res.split.booker, partnerEst: res.split.partner } : null,
          myTotal: res.split ? res.split.booker : res.quote.total };
        addRequest(r);
        refreshLive?.().catch(() => {});
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
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={bs.check}><Icon name="check" size={40} color="#fff" strokeWidth={3} /></View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: C.text, marginTop: 16 }} accessibilityRole="header">{sent.split ? 'Invite sent' : 'Request sent'}</Text>
            <Text style={{ color: C.sub, textAlign: 'center', marginTop: 6, lineHeight: 21, fontSize: 15 }}>
              {sent.split
                ? `${plane.tail} is held until ${new Date(sent.split.holdUntil).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })} while ${sent.split.partnerName} accepts.`
                : `${sent.date} at ${sent.time}${plane ? ` · ${plane.tail}` : ''}. It isn’t booked until ${cfi ? cfi.name.split(' ')[0] : 'the owner'} confirms.`}
            </Text>
          </View>
          <Text style={[bs.kicker, { marginTop: 22 }]}>What happens next</Text>
          {[
            sent.split
              ? ['Your co-pilot accepts', `They pay their half (${money2(sent.split.partnerEst)}) to lock the plane. If they don’t in time, the hold is released and nothing is charged.`]
              : [`${cfi ? cfi.name.split(' ')[0] : 'The owner'} confirms`, 'Most requests are answered within a few hours. We’ll notify you.'],
            ['Nothing is charged yet', `Your card is saved now and charged after the flight for actual Hobbs time${sent.deposit > 0 ? `, plus a ${money2(sent.deposit)} refundable deposit hold` : ''}. Weather cancellations are free.`],
            ['Do your preflight', 'The day before, run the go/no-go check: weather, NOTAMs and I’M SAFE.'],
          ].map(([t, d], i) => (
            <View key={t} style={bs.nextRow} accessible>
              <View style={bs.nextNum}><Text style={{ color: C.navy, fontWeight: '800' }}>{i + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: C.text, fontSize: 15 }}>{t}</Text>
                <Text style={{ color: C.sub, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{d}</Text>
              </View>
            </View>
          ))}
          <Card style={{ marginTop: 10 }}>
            <Row label={sent.split ? `Your half (estimate)` : 'Estimated total'} value={money2(sent.myTotal ?? sent.total)} bold />
          </Card>
          <Button title="View my lessons" style={{ marginTop: 16 }} onPress={() => nav.goTab('Lessons')} />
          {cfi && <Button title={`Message ${cfi.name.split(' ')[0]}`} variant="outline" style={{ marginTop: 10 }} onPress={() => nav.push('Chat', { key: cfi.id })} />}
          <Button title="Keep browsing" variant="ghost" style={{ marginTop: 4 }} onPress={() => nav.goTab('Explore')} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title={cfi ? 'Book a lesson' : 'Rent solo'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150 }}>
        <Step n={1} title="Instructor" done={!!cfi || (!!plane && plane.soloRental)} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {plane && plane.soloRental && (
            <Pressable onPress={() => setCfiId(null)} style={[bs.pick, !cfi && bs.pickOn]} accessibilityRole="radio" accessibilityState={{ checked: !cfi }}>
              <View style={bs.soloIcon}><Icon name="user" size={22} color={C.navy} /></View>
              <Text style={bs.pickName}>No instructor</Text>
              <Text style={bs.pickSub}>Rent solo</Text>
            </Pressable>
          )}
          {cfiOptions.map((c) => (
            <Pressable key={c.id} onPress={() => { setCfiId(c.id); setStart(null); }} style={[bs.pick, cfiId === c.id && bs.pickOn]} accessibilityRole="radio" accessibilityState={{ checked: cfiId === c.id }}>
              <Avatar initials={c.initials} color={c.color} size={44} photo={c.photo} />
              <Text style={bs.pickName} numberOfLines={1}>{c.name.split(' ')[0]}</Text>
              <Text style={bs.pickSub}>{money(c.flightRate)}/hr</Text>
              {isRepeat(requests, { cfiId: c.id }) ? <Text style={bs.flies}>Your CFI · $0 fee</Text> : plane && c.aircraftIds.includes(plane.id) ? <Text style={bs.flies}>Flies {plane.tail}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>

        <Step n={2} title="Aircraft" done={ownPlane || !!plane} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {cfi?.teachesInYourPlane && (
            <Pressable onPress={() => setOwnPlane(true)} style={[bs.pick, ownPlane && bs.pickOn]} accessibilityRole="radio" accessibilityState={{ checked: ownPlane }}>
              <View style={bs.soloIcon}><Icon name="key" size={22} color={C.navy} /></View>
              <Text style={bs.pickName}>My own plane</Text>
              <Text style={bs.pickSub}>$0 rental</Text>
            </Pressable>
          )}
          {planeOptions.map((p) => (
            <Pressable key={p.id} onPress={() => { setPlaneId(p.id); setOwnPlane(false); setStart(null); }} style={[bs.pick, !ownPlane && planeId === p.id && bs.pickOn]} accessibilityRole="radio" accessibilityState={{ checked: !ownPlane && planeId === p.id }}>
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
            <Step n={3} title="What are we working on?" done={!!goal} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {(moreGoals ? GOALS : [...new Set([goal, ...GOALS.slice(0, 5)])]).map((g) => <Chip key={g} small label={g} active={goal === g} onPress={() => setGoal(g)} />)}
              {!moreGoals && <Chip small label="More…" onPress={() => setMoreGoals(true)} />}
            </View>
          </>
        )}

        <Step n={cfi ? 4 : 3} title="How long" done />
        <Card>
          <Stepper label="Flight (Hobbs)" value={flightHours} onChange={setFlightHours} min={0.5} />
          {cfi && <Stepper label="Ground / briefing" value={groundHours} onChange={setGroundHours} />}
        </Card>
        <Step n={cfi ? 5 : 4} title="Date & time" done={!!start} />
        <MonthCalendar month={month} onMonth={(mo) => { setMonth(mo); }} selected={date}
          onSelect={(dt) => { setDate(dt); setStart(null); }}
          enabled={(dt) => (monthSlots[dateKey(dt)] || []).length > 0}
          minMonth={{ y: today.y, m: today.m }} maxMonth={{ y: lastDay.y, m: lastDay.m }} />
        {ot.loading && <Text style={bs.hint}>Checking {cfi ? `${cfi.name.split(' ')[0]}’s` : 'the plane’s'} calendar…</Text>}
        {!!ot.error && <Text style={[bs.hint, { color: '#B45309' }]}>{ot.error}</Text>}
        {!ot.loading && date && (
          <>
            <Text style={{ fontWeight: '900', color: C.text, fontSize: 16, marginTop: 14 }}>{longDate(date)}</Text>
            <Text style={[bs.hint, { marginTop: 2 }]}>
              {slots.length ? `${slots.length} open start time${slots.length > 1 ? 's' : ''} for a ${r2(durationMin / 60)} hr lesson` : 'No times left that fit this lesson. Try another day or a shorter lesson.'}
              {localTz !== tz ? ` · times in ${tzAbbrev(tz, slots[0] || new Date())}` : ''}
            </Text>
            <View style={bs.slots}>
              {slots.map((t) => {
                const on = start && +start === +t;
                return (
                  <Pressable key={+t} onPress={() => setStart(t)} style={[bs.slot, on && { backgroundColor: C.navy, borderColor: C.navy }]}
                    accessibilityRole="button" accessibilityState={{ selected: !!on }} accessibilityLabel={`${timeIn(t, tz)}`}>
                    <Text style={{ fontWeight: '800', color: on ? '#fff' : C.text, fontSize: 14 }}>{timeIn(t, tz)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        <Text style={bs.hint}>Live calendar: {cfi ? `${cfi.name.split(' ')[0]}’s working hours and bookings` : 'no instructor'}{plane ? ` + ${plane.tail}’s bookings` : ''}. {cfi ? `They confirm every request.` : ''}</Text>


        {checkoutFlight && !cfi && plane && (
          <View style={bs.checkoutCard}>
            <Text style={{ fontWeight: '800', color: C.navy }}>✈︎ Checkout flight with the owner</Text>
            <Text style={{ color: C.navy, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
              {plane.ownerName && plane.ownerName !== 'Private owner' ? plane.ownerName : 'The owner'} flies along. You pay the normal rental for the Hobbs time; at the end they mark you checked out, and you can rent {plane.tail} solo after that.
            </Text>
            <Pressable onPress={() => setCheckoutFlight(false)} accessibilityRole="button" style={{ minHeight: 36, justifyContent: 'center' }}>
              <Text style={{ color: C.blue, fontWeight: '700' }}>Not a checkout? Book a solo rental instead</Text>
            </Pressable>
          </View>
        )}

        {canShare && (
          <>
            <Step n={5} title="Share the cost?" done={!shareOn || shareEmailOk} />
            <Card>
              <Toggle label="Fly with another pilot and split the cost" value={shareOn} onValueChange={setShareOn}
                hint="They pay a deposit to accept. Your request goes to the owner once they do." />
              {shareOn && (
                <>
                  <Field label="Their Positive Rate email" value={shareEmail} onChangeText={setShareEmail} placeholder="pilot@example.com"
                    keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                  <Text style={{ fontWeight: '800', color: C.text, marginTop: 10 }}>Split 50/50</Text>
                  <Row label={`You · ${sharePct}%`} value={money2(r2(q.total * sharePct / 100))} />
                  <Row label={`Them · ${100 - sharePct}%`} value={money2(r2(q.total - r2(q.total * sharePct / 100)))} />
                  <Text style={[bs.hint, { marginTop: 6 }]}>
                    FAA rule 61.113(c): a private pilot can’t pay less than their pro rata share of a flight’s operating expenses, so the two of you split it evenly. Only one of you logs PIC for any part of the flight.
                  </Text>
                </>
              )}
            </Card>
          </>
        )}

        <Step n={cfi ? 6 : canShare ? 6 : 5} title="Payment" done />
        <Pressable onPress={() => nav.push('PaymentMethods')} style={bs.pay} accessibilityRole="button" accessibilityLabel="Payment card. Change">
          <View style={bs.cardIcon}><Icon name="card" size={20} color={C.navy} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: C.text }}>Card on file</Text>
            <Text style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>Saved when you send the request. Charged after the flight for actual Hobbs time.</Text>
          </View>
          <Text style={{ color: C.blue, fontWeight: '700' }}>Change</Text>
        </Pressable>
        <Pressable onPress={() => setShowCost(!showCost)} style={bs.detailsRow} accessibilityRole="button" accessibilityState={{ expanded: showCost }}>
          <Text style={{ flex: 1, fontWeight: '700', color: C.text }}>Price details</Text>
          {fees.feeFree ? <Text style={{ color: C.green, fontWeight: '700', fontSize: 12, marginRight: 8 }}>No booking fee</Text> : null}
          <Icon name={showCost ? 'down' : 'chevron'} size={18} color={C.chevron} />
        </Pressable>
        {showCost && (
          <Card>
            {cfi && <Row label={`Flight instruction · ${flightHours} hr × ${money(cfi.flightRate)}`} value={money2(q.instruction)} />}
            {cfi && groundHours > 0 && <Row label={`Ground · ${groundHours} hr × ${money(cfi.groundRate)}`} value={money2(q.ground)} />}
            {plane && <Row label={`${plane.tail} ${prepaid ? 'prepaid block' : 'wet'} · ${flightHours} hr × ${money(q.rate)}`} value={money2(q.aircraft)} />}
            {ownPlane && <Row label="Your aircraft" value="$0.00" />}
            {plane && FEES.protectionPerHr > 0 && <Row label={`Rental protection · ${money(FEES.protectionPerHr)}/hr`} value={money2(q.protection)} />}
            {fees.feeFree
              ? <Row label="Booking fee · waived (Short Final)" value="$0.00" />
              : <Row label={fees.schoolPro ? 'Booking fee · School Pro rate' : 'Booking fee'} value={money2(q.bookingFee)} />}
            {q.deposit > 0 && <Row label="Refundable damage deposit (hold only)" value={money2(q.deposit)} />}
            <Text style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>Estimate. The final charge uses actual Hobbs time.</Text>
          </Card>
        )}

        <Pressable onPress={() => setShowChecks(!showChecks)} style={[bs.summary, blocked && { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]} accessibilityRole="button" accessibilityLabel="Safety and insurance checks">
          <Icon name={blocked ? 'info' : 'shieldCheck'} size={20} color={blocked ? '#B91C1C' : C.green} />
          <Text style={{ flex: 1, marginLeft: 10, fontWeight: '700', color: blocked ? '#B91C1C' : C.text }}>
            {blocked ? `${checks.filter((c) => c.blocking && !c.ok).length} check${checks.filter((c) => c.blocking && !c.ok).length > 1 ? 's' : ''} not met` : `All ${checks.length} safety & insurance checks passed`}
          </Text>
          <Icon name={showChecks || blocked ? 'down' : 'chevron'} size={18} color="#7A889C" />
        </Pressable>
        {(showChecks || blocked) && <CheckList checks={blocked && !showChecks ? checks.filter((c) => !c.ok) : checks} />}
        {!cfi && !!plane && <RenterInsuranceCard />}
        {liveSolo && me.signedIn && !checkoutFlight && <RenterFixes checks={checks} plane={plane} nav={nav} onCheckout={askCheckout} busy={checkoutBusy} err={checkoutErr}
          onCheckoutFlight={() => setCheckoutFlight(true)} student={me.profile?.certificate === 'Student'} />}
        {blocked && !cfi && plane && !liveSolo && (
          <Pressable onPress={() => setCfiId(planeOptions.length && getPlane(plane.id) ? (cfis.find((c) => c.aircraftIds.includes(plane.id))?.id || cfis[0].id) : cfis[0].id)}>
            <Text style={{ color: C.blue, fontWeight: '700', marginBottom: 8 }}>Book a checkout with a CFI instead ›</Text>
          </Pressable>
        )}

        <View style={[bs.covered, { flexDirection: 'row' }]}>
          <Icon name="cloud" size={20} color={C.navy} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontWeight: '800', color: C.navy }}>Free weather cancellation</Text>
            <Text style={{ color: C.body, fontSize: 13, marginTop: 2, lineHeight: 18 }}>
              {cfi ? `${cfi.name.split(' ')[0]} confirms every request. ` : 'The owner confirms every request. '}Nothing is charged until after the flight{cfi ? ', and it’s logged to your training record' : ''}.
            </Text>
          </View>
        </View>
      </ScrollView>
      {!!payErr && <Text style={{ color: '#B91C1C', fontWeight: '600', paddingHorizontal: 16, paddingBottom: 6, backgroundColor: '#fff' }} accessibilityLiveRegion="polite">{payErr}</Text>}
      <View style={bs.cta}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', fontSize: 20, color: C.text }}>{money2(myShare)}</Text>
          <Pressable onPress={() => setShowCost(!showCost)} accessibilityRole="button" hitSlop={8}>
            <Text style={{ color: C.blue, fontSize: 12, fontWeight: '700' }}>{sharing ? 'Your half · ' : 'Est. · '}Price details</Text>
          </Pressable>
        </View>
        <Button
          title={busy ? 'Sending…' : blocked ? 'Checks not met' : !start ? 'Pick a time' : sharing && !shareEmailOk ? 'Add their email' : sharing ? `Invite · ${shortDate(date).split(',')[0]} ${timeIn(start, tz)}` : `Request ${shortDate(date).split(',')[0]} ${timeIn(start, tz)}`}
          style={{ paddingHorizontal: 22 }}
          disabled={busy || blocked || !start || (!cfi && !plane) || (!live && walletShort) || (sharing && !shareEmailOk)}
          onPress={submit}
        />
      </View>
    </View>
  );
}

// Shared rental status on a lesson card, for the booker or the other pilot.
function SplitBox({ r, nav, onChanged }) {
  const sp = r.split;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!sp) return null;
  const partner = r.role === 'partner';
  const other = partner ? sp.bookerName.split(' ')[0] : sp.partnerName.split(' ')[0];
  const by = sp.holdUntil ? new Date(sp.holdUntil).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  const act = async (action) => {
    setErr(''); setBusy(true);
    try { await splitAction(r.id, action); await onChanged(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const open = ['Pending', 'Confirmed'].includes(r.status);
  let line;
  if (sp.status === 'invited') line = partner ? `${other} invited you to share this flight. You’d pay ${sp.partnerPct}% (about ${money2(sp.partnerEst)}).${by ? ` Reply by ${by}.` : ''}` : `Waiting for ${other} to accept and pay their ${sp.partnerPct}% deposit${by ? ` by ${by}` : ''}. The owner gets your request once they do.`;
  else if (sp.status === 'declined') line = partner ? 'You declined this flight.' : `${other} can’t make it. Fly solo (you pay 100%) or cancel at no charge.`;
  else if (sp.status === 'expired') line = partner ? 'This invite expired.' : `${other} didn’t accept in time, so the plane was released.`;
  else if (r.status === 'Completed') line = `Split ${sp.bookerPct}/${sp.partnerPct} with ${other}. Your share: ${money2(partner ? sp.partnerFinal ?? sp.partnerEst : sp.bookerFinal ?? sp.bookerEst)}.`;
  else line = partner ? `You’re in. Deposit paid: ${money2(sp.deposit || 0)} (${sp.partnerPct}%). The difference is settled after the flight.` : `${other} is in and paid their ${sp.partnerPct}% deposit.`;
  return (
    <View style={bs.split}>
      <Text style={{ fontWeight: '800', color: C.navy }}>👥 Shared flight · {sp.bookerPct}/{sp.partnerPct}</Text>
      <Text style={{ color: C.navy, fontSize: 13, marginTop: 4, lineHeight: 18 }}>{line}</Text>
      {open && (
        <View style={{ flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' }}>
          {partner && sp.status === 'invited' && <Button title="Review invite" style={{ paddingVertical: 9, marginRight: 8 }} onPress={() => nav.push('SplitInvite', { id: r.id })} />}
          {partner && sp.status === 'accepted' && <Button title={busy ? 'Leaving…' : 'Leave flight'} variant="outline" disabled={busy} style={{ paddingVertical: 9 }} onPress={() => act('leave')} />}
          {!partner && ['invited', 'declined'].includes(sp.status) && <Button title={busy ? 'Updating…' : 'Fly solo instead'} variant="outline" disabled={busy} style={{ paddingVertical: 9 }} onPress={() => act('solo')} />}
        </View>
      )}
      {!!err && <Text style={[bs.warn, { marginTop: 6 }]}>{err}</Text>}
    </View>
  );
}

// A lesson the instructor booked for this student: accept (add a card) or decline.
function ProposalBox({ r, cfiName, onChanged }) {
  const accept = useAcceptProposal();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const by = new Date(r.proposal.expires).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const open = new Date(r.proposal.expires) > new Date();
  const run = async (kind) => {
    setErr(''); setBusy(kind);
    try {
      if (kind === 'accept') {
        if (!CARD_PAYMENTS_SUPPORTED) throw new Error('Accept lessons from the Positive Rate iPhone or Android app.');
        const res = await accept(r.id);
        if (res.cancelled) { setErr('Card not saved, so the lesson isn’t accepted yet.'); setBusy(null); return; }
      } else {
        await bookingAction(r.id, 'reject', { reason: 'Can’t make it' });
      }
      await onChanged();
    } catch (e) { setErr(e.message); }
    setBusy(null);
  };
  return (
    <View style={bs.proposal}>
      <Text style={{ fontWeight: '800', color: '#5B21B6' }}>{cfiName} booked this lesson for you</Text>
      <Text style={{ color: '#5B21B6', fontSize: 13, marginTop: 4, lineHeight: 18 }}>
        {open ? `Accept by ${by} to lock it in. Accepting saves your card; it’s charged after the flight for actual Hobbs time.` : 'This lesson wasn’t accepted in time.'}
      </Text>
      {open && (
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          <Button title={busy === 'reject' ? 'Declining…' : 'Decline'} variant="outline" disabled={!!busy} style={{ flex: 0.6, marginRight: 8, paddingVertical: 10 }} onPress={() => run('reject')} />
          <Button title={busy === 'accept' ? 'Accepting…' : 'Accept'} disabled={!!busy} style={{ flex: 1, paddingVertical: 10 }} onPress={() => run('accept')} />
        </View>
      )}
      {!!err && <Text style={[bs.warn, { marginTop: 6 }]}>{err}</Text>}
    </View>
  );
}

const STATUS_TAG = {
  Proposed: ['Needs you', C.amberDark, C.amberBg], Pending: ['Waiting to confirm', C.amberDark, C.amberBg], Confirmed: ['✓ Confirmed', C.green, C.greenBg],
  Completed: ['✓ Completed', C.green, C.greenBg], Cancelled: ['Cancelled', C.sub, C.sky],
};
const statusTag = (r) => { const [l, fg, bg] = STATUS_TAG[r.status] || [r.status, C.sub, C.sky]; return <Tag label={l} color={fg} bg={bg} />; };

export function Lessons({ nav }) {
  const { requests, getCfi, getPlane, debriefForRequest, refreshLive } = useStore();
  const lib = useLibrary();
  React.useEffect(() => { lib.refresh(); }, []);
  const [tab, setTab] = useState('upcoming');
  const reviewFor = (r) => (['Pending', 'Confirmed'].includes(r.status) ? lib.reviews.find((x) => x.bookingId === r.id && x.studentId === lib.uid) : null);
  const upcoming = requests.filter((r) => ['Proposed', 'Pending', 'Confirmed'].includes(r.status)).sort((a, b) => (a.status === 'Proposed' ? 0 : 1) - (b.status === 'Proposed' ? 0 : 1) || new Date(a.when) - new Date(b.when));
  const past = requests.filter((r) => ['Completed', 'Cancelled'].includes(r.status)).sort((a, b) => new Date(b.when) - new Date(a.when));
  const list = tab === 'upcoming' ? upcoming : past;

  const card = (r) => {
    const c = getCfi(r.cfiId);
    const p = getPlane(r.planeId);
    const d = debriefForRequest(r.id);
    const who = c ? c.name : r.split && ['invited', 'accepted'].includes(r.split.status) ? `With ${(r.role === 'partner' ? r.split.bookerName : r.split.partnerName).split(' ')[0]}` : 'Solo rental';
    return (
      <Card key={r.id}>
        <Pressable onPress={() => nav.push('LessonDetail', { id: r.id })} accessibilityRole="button" accessibilityLabel={`${r.goal}, ${r.date} ${r.time}, ${STATUS_TAG[r.status]?.[0] || r.status}. Details`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontWeight: '800', fontSize: 16, color: C.text }}>{r.goal}</Text>
              <Text style={{ color: C.sub, marginTop: 2 }}>{r.date} · {r.time}</Text>
            </View>
            {statusTag(r)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
            {c && <Avatar initials={c.initials} color={c.color} size={36} photo={c.photo} />}
            {p && <View style={{ marginLeft: c ? 8 : 0 }}><PlaneImage plane={p} size={36} style={{ borderRadius: 10 }} /></View>}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{who}{p ? ` · ${p.tail}` : r.ownPlane ? ' · Own aircraft' : ''}</Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>{r.flightHours} hr flight{r.groundHours ? ` + ${r.groundHours} hr ground` : ''} · Card</Text>
            </View>
            <Text style={{ fontWeight: '800', color: C.text, fontSize: 16 }}>{money2(r.status === 'Cancelled' ? r.cancel?.fee || 0 : r.myTotal ?? r.total)}</Text>
          </View>
        </Pressable>
        {r.status === 'Cancelled' && (
          <Text style={{ color: C.sub, fontSize: 12, marginTop: 8 }}>{r.cancel?.reason}{r.cancel?.fee ? ` · late-cancel fee ${money2(r.cancel.fee)}` : ' · no charge'}</Text>
        )}
        {r.dispute && <Text style={[bs.warn, { marginTop: 8 }]}>Problem reported: {r.dispute.reason} · {r.dispute.status}</Text>}
        <SplitBox r={r} nav={nav} onChanged={() => refreshLive().catch(() => {})} />
        {r.status === 'Proposed' && r.proposal && <ProposalBox r={r} cfiName={c ? c.name.split(' ')[0] : 'Your instructor'} onChanged={() => refreshLive().catch(() => {})} />}
        {reviewFor(r) && <ReviewChip review={reviewFor(r)} studied={lib.studied} onPress={() => nav.push('PreflightReview', { bookingId: r.id })} />}
        {r.live && r.status === 'Pending' && !r.split?.pending && r.role !== 'partner' && <Text style={[bs.hint, { marginTop: 8 }]}>Waiting for {c ? c.name.split(' ')[0] : 'the owner'} to confirm. Nothing is charged until after the flight.</Text>}

        {['Pending', 'Confirmed'].includes(r.status) && (
          <View style={bs.cardActions}>
            {r.status === 'Confirmed'
              ? <Button title="Preflight" icon="checkCircle" small style={{ flex: 1, marginRight: 8 }} onPress={() => nav.push('Preflight', { bookingId: r.id })} />
              : null}
            {(c || p) && <Button title="Message" variant="outline" small style={{ flex: r.status === 'Confirmed' ? 0.8 : 1, marginRight: 8 }} onPress={() => nav.push('Chat', { key: c ? c.id : p.id })} />}
            <Pressable onPress={() => nav.push('LessonDetail', { id: r.id })} style={bs.more} accessibilityRole="button" accessibilityLabel="More: details, reschedule or cancel">
              <Text style={{ color: C.navy, fontWeight: '800', fontSize: 18, marginTop: -6 }}>…</Text>
            </Pressable>
          </View>
        )}
        {r.status === 'Completed' && (
          <>
            {c && r.role !== 'partner' && <Button title={`Book again with ${c.name.split(' ')[0]}`} small style={{ marginTop: 12 }} onPress={() => nav.push('Request', { cfiId: c.id, planeId: p?.id || null })} />}
            <View style={bs.links}>
              {d && <Pressable onPress={() => nav.push('Debrief', { id: d.id })} style={bs.linkBtn} accessibilityRole="button"><Text style={bs.link}>{d.pending ? 'Debrief pending' : !d.acknowledged ? 'Debrief · new' : 'Debrief'}</Text></Pressable>}
              {r.receipt && <Pressable onPress={() => nav.push('Receipt', { id: r.id })} style={bs.linkBtn} accessibilityRole="button"><Text style={bs.link}>Receipt</Text></Pressable>}
              {r.role !== 'partner' && (c || p) && !(r.reviewedCfi && (r.reviewedPlane || !p)) && (
                <Pressable onPress={() => nav.push('Review', { requestId: r.id, kind: c && !r.reviewedCfi ? 'cfi' : 'plane' })} style={bs.linkBtn} accessibilityRole="button">
                  <Text style={bs.link}>{c && !r.reviewedCfi ? `Review ${c.name.split(' ')[0]}` : `Review ${p.tail}`}</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </Card>
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={bs.h1} accessibilityRole="header">My lessons</Text>
      <View style={bs.seg} accessibilityRole="tablist">
        {[['upcoming', `Upcoming${upcoming.length ? ` · ${upcoming.length}` : ''}`], ['past', 'Past']].map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[bs.segBtn, tab === k && bs.segOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={{ fontWeight: '800', color: tab === k ? C.navy : C.sub }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {list.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 30 }}>
          <View style={bs.emptyIcon}><Icon name="calendar" size={28} color={C.navy} /></View>
          <Text style={{ fontWeight: '800', color: C.text, fontSize: 17, marginTop: 12 }}>{tab === 'upcoming' ? 'Nothing scheduled' : 'No past lessons yet'}</Text>
          <Text style={{ color: C.sub, marginTop: 4, textAlign: 'center' }}>{tab === 'upcoming' ? 'Book a lesson or a plane to get started.' : 'Finished lessons, receipts and debriefs show up here.'}</Text>
          {tab === 'upcoming' && <Button title="Find a lesson" style={{ marginTop: 14, alignSelf: 'stretch' }} onPress={() => nav.goTab('Explore')} />}
        </View>
      )}
      {list.map(card)}
    </ScrollView>
  );
}

// One upcoming lesson: preflight first, homework, cost, then directions, calendar and cancel.
export function LessonDetail({ nav, params }) {
  const { requests, getCfi, getPlane } = useStore();
  const lib = useLibrary();
  React.useEffect(() => { lib.refresh(); }, []);
  const r = requests.find((x) => x.id === params.id);
  if (!r) return null;
  const c = getCfi(r.cfiId);
  const p = getPlane(r.planeId);
  const review = lib.reviews.find((x) => x.bookingId === r.id && x.studentId === lib.uid);
  const airport = p?.homeAirport || c?.homeAirport;
  const start = r.when ? new Date(r.when) : null;
  const end = start ? new Date(start.getTime() + ((r.flightHours || 1) + (r.groundHours || 0)) * 3600e3) : null;
  const ics = start ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${r.goal}${c ? ` with ${c.name}` : ''}`)}&dates=${start.toISOString().replace(/[-:]|\.\d{3}/g, '')}/${end.toISOString().replace(/[-:]|\.\d{3}/g, '')}&location=${encodeURIComponent(airport || '')}` : null;
  const open = (url) => require('react-native').Linking.openURL(url).catch(() => {});
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Lesson" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.text }} accessibilityRole="header">{r.goal}</Text>
            <Text style={{ color: C.sub, fontSize: 15, marginTop: 2 }}>{r.date} · {r.time}{airport ? ` · ${airport}` : ''}</Text>
          </View>
          {statusTag(r)}
        </View>
        <Card style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
          {c ? <Avatar initials={c.initials} color={c.color} size={44} photo={c.photo} /> : p ? <PlaneImage plane={p} size={44} /> : null}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontWeight: '800', color: C.text }}>{c ? c.name : 'Solo rental'}</Text>
            <Text style={{ color: C.sub, fontSize: 13 }}>{p ? `${p.year} ${p.make} ${p.model} · ${p.tail}` : r.ownPlane ? 'Your aircraft' : ''}</Text>
          </View>
          {(c || p) && <IconBtn icon="chat" label="Message" onPress={() => nav.push('Chat', { key: c ? c.id : p.id })} />}
        </Card>
        {r.status === 'Confirmed' && <Button title="Start preflight" icon="checkCircle" onPress={() => nav.push('Preflight', { bookingId: r.id })} />}
        {r.status === 'Pending' && <Text style={[bs.hint, { marginTop: 0 }]}>Preflight opens once {c ? c.name.split(' ')[0] : 'the owner'} confirms.</Text>}

        {review && (
          <>
            <Text style={[bs.kicker, { marginTop: 18 }]}>Homework</Text>
            <ReviewChip review={review} studied={lib.studied} onPress={() => nav.push('PreflightReview', { bookingId: r.id })} />
          </>
        )}

        <Text style={[bs.kicker, { marginTop: 18 }]}>Cost</Text>
        <Card>
          <Row label={`${r.flightHours} hr flight${r.groundHours ? ` + ${r.groundHours} hr ground` : ''}`} value={money2(r.myTotal ?? r.total)} bold />
          <Text style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>Estimate. Your card is charged after the flight for actual Hobbs time. Weather cancellations are free.</Text>
        </Card>

        <Text style={[bs.kicker, { marginTop: 18 }]}>Getting there</Text>
        <Card style={{ paddingVertical: 4 }}>
          {airport && (
            <Pressable onPress={() => open(`https://maps.apple.com/?q=${encodeURIComponent(airport + ' airport')}`)} style={bs.detailRow} accessibilityRole="link">
              <Icon name="pin" size={20} color={C.navy} />
              <Text style={bs.detailText}>Directions to {airport}</Text>
              <Icon name="chevron" size={18} color={C.chevron} />
            </Pressable>
          )}
          {ics && (
            <Pressable onPress={() => open(ics)} style={[bs.detailRow, airport && { borderTopWidth: 1, borderTopColor: C.line }]} accessibilityRole="link">
              <Icon name="calendar" size={20} color={C.navy} />
              <Text style={bs.detailText}>Add to calendar</Text>
              <Icon name="chevron" size={18} color={C.chevron} />
            </Pressable>
          )}
        </Card>

        {['Pending', 'Confirmed'].includes(r.status) && r.role !== 'partner' && (
          <>
            <Text style={[bs.kicker, { marginTop: 18 }]}>Change of plans</Text>
            {(c || p) && <Button title="Ask to reschedule" variant="outline" onPress={() => nav.push('Chat', { key: c ? c.id : p.id, draft: `Hi! Could we move ${r.goal.toLowerCase()} on ${r.date} to another time?` })} />}
            <Button title="Cancel lesson" variant="danger" style={{ marginTop: 10 }} onPress={() => nav.push('Cancel', { id: r.id })} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function IconBtn({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={bs.iconBtn} accessibilityRole="button" accessibilityLabel={label}>
      <Icon name={icon} size={20} color={C.navy} />
    </Pressable>
  );
}

// The invited pilot's side of a shared rental: the same checks as renting solo, a
// confirmation that they're current, and the deposit for their share.
export function SplitInvite({ nav, params }) {
  const { getRequest, getPlane, refreshLive } = useStore();
  const r = getRequest(params.id);
  const me = usePilot();
  const payDeposit = useSplitDeposit();
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutErr, setCheckoutErr] = useState('');
  useEffect(() => { if (!r) refreshLive().catch(() => {}); }, []);
  if (!r || !r.split) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Shared flight" />
        <Text style={{ color: C.sub, padding: 24, textAlign: 'center' }}>Loading the invite…</Text>
      </View>
    );
  }
  const sp = r.split;
  const plane = getPlane(r.planeId);
  const booker = sp.bookerName.split(' ')[0];
  const checks = plane ? renterChecks({ profile: me.profile, checkout: me.checkoutFor(plane.id), plane, flightHours: r.flightHours, start: new Date(r.when) }) : [];
  const askCheckout = async () => {
    setCheckoutErr(''); setCheckoutBusy(true);
    try { await requestCheckout(plane.id); } catch (e) { setCheckoutErr(e.message); }
    setCheckoutBusy(false);
  };
  const blocked = checks.some((c) => c.blocking && !c.ok);
  const openInvite = sp.status === 'invited' && r.status === 'Pending' && (!sp.holdUntil || new Date(sp.holdUntil) > new Date());

  const accept = async () => {
    if (!CARD_PAYMENTS_SUPPORTED) { setErr('Pay your deposit from the Positive Rate iPhone or Android app.'); return; }
    setErr(''); setBusy(true);
    try {
      const res = await payDeposit(r.id);
      if (res.cancelled) setErr('Deposit not paid, so you haven’t joined yet. Tap Pay deposit to try again.');
      else { await refreshLive().catch(() => {}); setDone('accepted'); }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const decline = async () => {
    setErr(''); setBusy(true);
    try { await splitAction(r.id, 'decline'); await refreshLive().catch(() => {}); setDone('declined'); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header nav={nav} title="Shared flight" />
        <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
          <View style={[bs.check, done === 'declined' && { backgroundColor: C.sub }]}><Text style={{ color: '#fff', fontSize: 40, fontWeight: '900' }}>{done === 'accepted' ? '✓' : '–'}</Text></View>
          <Text style={{ fontSize: 22, fontWeight: '900', color: C.text, marginTop: 16 }}>{done === 'accepted' ? 'You’re in!' : 'Invite declined'}</Text>
          <Text style={{ color: C.sub, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
            {done === 'accepted' ? `Deposit paid. ${booker}’s request is now with the owner, and you’ll both hear when it’s confirmed.` : `We let ${booker} know. Nothing was charged.`}
          </Text>
          <Button title="View my lessons" style={{ alignSelf: 'stretch', marginTop: 16 }} onPress={() => nav.goTab('Lessons')} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Shared flight invite" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150 }}>
        <Text style={bs.h1}>{booker} wants to split a flight</Text>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {plane && <PlaneImage plane={plane} size={44} style={{ borderRadius: 10 }} />}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontWeight: '800', color: C.text }}>{plane ? `${plane.tail} · ${plane.make} ${plane.model}` : r.goal}</Text>
              <Text style={{ color: C.sub, marginTop: 2 }}>{r.date} · {r.time} · {r.flightHours} hr</Text>
            </View>
          </View>
          <View style={{ height: 10 }} />
          <Row label={`${booker} · ${sp.bookerPct}%`} value={money2(sp.bookerEst)} />
          <Row label={`You · ${sp.partnerPct}%`} value={money2(sp.partnerEst)} />
          <Text style={{ color: C.sub, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
            You pay {money2(sp.partnerEst)} now as a deposit. After the flight you pay {sp.partnerPct}% of the actual Hobbs time: we charge the difference to the same card, or refund it. Cancelled or declined by the owner: full refund.
          </Text>
        </Card>
        {sp.holdUntil && openInvite && <Text style={bs.hint}>Reply by {new Date(sp.holdUntil).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Until then the plane is held for you both.</Text>}

        <SectionTitle>Your rental checks</SectionTitle>
        <Text style={[bs.hint, { marginTop: 0, marginBottom: 6 }]}>The same checks as renting {plane?.tail || 'the plane'} solo.</Text>
        {me.loading ? <Text style={bs.hint}>Checking your pilot profile…</Text> : <CheckList checks={checks} />}
        {plane && !me.loading && <RenterFixes checks={checks} plane={plane} nav={nav} onCheckout={askCheckout} busy={checkoutBusy} err={checkoutErr} />}

        <Card style={{ marginTop: 12 }}>
          <Toggle label="I’m current and meet this plane’s rental requirements" value={attest} onValueChange={setAttest}
            hint={`Medical, flight review, checkout and insurance minimums. Agree with ${booker} before the flight who is pilot in command; only one of you logs PIC for any part of it.`} />
          <Text style={{ color: C.sub, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
            FAA rule 61.113(c): private pilots may share a flight’s operating expenses, and each pays at least their pro rata share.
          </Text>
        </Card>
        {!openInvite && <Text style={[bs.warn, { marginTop: 12 }]}>This invite is no longer open.</Text>}
      </ScrollView>
      {!!err && <Text style={{ color: '#B91C1C', fontWeight: '600', paddingHorizontal: 16, paddingBottom: 6, backgroundColor: '#fff' }} accessibilityLiveRegion="polite">{err}</Text>}
      <View style={bs.cta}>
        <Button title="Decline" variant="outline" style={{ paddingHorizontal: 18, marginRight: 10 }} disabled={busy || !openInvite} onPress={decline} />
        <Button title={busy ? 'Working…' : me.loading ? 'Checking…' : blocked ? 'Checks not met' : !attest ? 'Confirm you’re current' : `Pay ${money2(sp.partnerEst)} deposit`}
          style={{ flex: 1 }} disabled={busy || me.loading || blocked || !attest || !openInvite} onPress={accept} />
      </View>
    </View>
  );
}

const CANCEL_REASONS = ['Weather', 'Aircraft maintenance / squawk', 'Instructor unavailable', 'Personal / schedule change'];

export function CancelLesson({ nav, params }) {
  const { getRequest, getCfi, cancelRequest, refreshLive } = useStore();
  const r = getRequest(params.id);
  const [reason, setReason] = useState(null); // nothing preselected
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
            {CANCEL_REASONS.map((x) => {
              const confirmed = x === 'Weather' || x.startsWith('Aircraft') || x.startsWith('Instructor');
              const tag = confirmed ? `Free once ${x.startsWith('Aircraft') ? 'the owner' : cfi ? cfi.name.split(' ')[0] : 'the owner'} confirms` : late ? 'Late fee applies' : 'Free';
              return (
                <Pressable key={x} onPress={() => setReason(x)} style={[bs.pay, reason === x && bs.pickOn]} accessibilityRole="radio" accessibilityState={{ checked: reason === x }}>
                  <View style={[bs.radio, reason === x && { borderColor: C.navy }, { marginRight: 12 }]}>{reason === x && <View style={bs.radioDot} />}</View>
                  <Text style={{ flex: 1, fontWeight: '700', color: C.text }}>{x}</Text>
                  <Text style={{ color: !confirmed && late ? C.amberDark : C.green, fontWeight: '700', fontSize: 12, maxWidth: 130, textAlign: 'right' }}>{tag}</Text>
                </Pressable>
              );
            })}
            {reason && (
              <Card style={{ marginTop: 8 }}>
                <Row bold label="Cancellation charge" value={money2(fee)} />
                {(reason === 'Weather' || reason.startsWith('Aircraft') || reason.startsWith('Instructor')) && (
                  <Text style={[bs.warn, { marginTop: 6 }]}>We’ll ask {reason.startsWith('Aircraft') ? 'the owner' : cfi ? cfi.name.split(' ')[0] : 'the owner'} to confirm. Once they do, any charge is refunded.</Text>
                )}
              </Card>
            )}
            <Text style={{ color: C.sub, fontSize: 13, lineHeight: 18, marginTop: 8 }}>
              Free until 24 hours before. After that, half the instruction goes to your instructor, unless it’s weather, maintenance or they cancel.
            </Text>
          </>
        )}
      </ScrollView>
      {done === null && (
        <View style={bs.cta}>
          {!!err && <Text style={{ color: '#B91C1C', fontWeight: '600', position: 'absolute', top: -24, left: 16 }}>{err}</Text>}
          <View style={{ flex: 1 }}>
            <Button title={busy ? 'Cancelling…' : !reason ? 'Pick a reason' : fee ? `Cancel & pay ${money2(fee)}` : 'Cancel lesson'} variant="danger" disabled={busy || !reason} onPress={cancel} />
            <Button title="Keep my lesson" variant="ghost" style={{ marginTop: 4 }} onPress={nav.pop} />
          </View>
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
  const [problem, setProblem] = useState(null);
  const [details, setDetails] = useState('');
  const [photos, setPhotos] = useState([]);
  if (!r || !r.receipt) return null;
  const q = r.receipt;
  const cfi = getCfi(r.cfiId);
  const plane = getPlane(r.planeId);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Receipt" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {params.fresh && (
          <View style={[bs.covered, { backgroundColor: '#DDF3E8', marginTop: 0 }]}>
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
          {q.instruction > 0 && <Row label={`Flight instruction · ${r2(q.hobbsIn - q.hobbsOut || r.flightHours)} hr × ${money(cfi?.flightRate || 0)}`} value={money2(q.instruction)} />}
          {q.ground > 0 && <Row label={`Ground · ${r.groundHours} hr × ${money(cfi?.groundRate || 0)}`} value={money2(q.ground)} />}
          {q.aircraft > 0 && <Row label={`${plane.tail} · ${r2(q.hobbsIn - q.hobbsOut || r.flightHours)} hr × ${money(q.rate)}`} value={money2(q.aircraft)} />}
          {q.protection > 0 && <Row label="Rental protection" value={money2(q.protection)} />}
          <Row label={q.bookingFee ? 'Booking fee' : q.waivedFee ? 'Booking fee (waived — Short Final)' : 'Booking fee'} value={money2(q.bookingFee)} />
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
          <Row bold label={`Paid · ${q.paidWith === 'Wallet' ? 'Card' : q.paidWith || 'Card'}`} value={money2(q.total)} />
          {q.prepaidSavings > 0 && <Text style={{ color: C.green, fontWeight: '700', fontSize: 12 }}>You saved {money2(q.prepaidSavings)} with prepaid block rates.</Text>}
          {q.depositReleased > 0 && <Text style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>Damage deposit hold of {money2(q.depositReleased)} released.</Text>}
        </Card>

        <Button title="Share receipt" variant="outline" icon="share" onPress={() => require('react-native').Share.share({ message: `Positive Rate receipt · ${r.goal} · ${r.date} · ${money2(q.total)}${plane ? ` · ${plane.tail} Hobbs ${q.hobbsOut}–${q.hobbsIn}` : ''}` }).catch(() => {})} />

        <SectionTitle>Problem with this flight?</SectionTitle>
        {r.dispute ? (
          <Banner tone="amber" icon="info" title={`Problem reported · ${r.dispute.status}`}>{`${r.dispute.reason}. We reply within 48 hours and resolve most reports within 5 business days. The payout is held until then.`}</Banner>
        ) : showDispute ? (
          <Card>
            <Text style={{ fontWeight: '800', color: C.text, marginBottom: 6 }}>What went wrong?</Text>
            {DISPUTES.map((d) => (
              <Pressable key={d} onPress={() => setProblem(d)} style={[bs.pay, problem === d && bs.pickOn]} accessibilityRole="radio" accessibilityState={{ checked: problem === d }}>
                <View style={[bs.radio, problem === d && { borderColor: C.navy }, { marginRight: 12 }]}>{problem === d && <View style={bs.radioDot} />}</View>
                <Text style={{ flex: 1, fontWeight: '700', color: C.text }}>{d}</Text>
              </Pressable>
            ))}
            <Field label="Details (optional)" value={details} onChangeText={setDetails} multiline placeholder="e.g. Hobbs read 6421.8 when we shut down" />
            <Button title={photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''} added · add more` : 'Add a photo (Hobbs, receipt, damage)'} variant="outline" icon="camera" small
              onPress={async () => { const { pickImages } = require('../ui'); const u = await pickImages(true); if (u.length) setPhotos((x) => [...x, ...u]); }} />
            <Text style={[bs.hint, { marginTop: 8 }]}>We reply within 48 hours and resolve most reports within 5 business days.</Text>
            <Button title="Send report" disabled={!problem} style={{ marginTop: 10 }} onPress={() => { dispute(r.id, details.trim() ? `${problem}: ${details.trim()}` : problem); setShowDispute(false); }} />
          </Card>
        ) : (
          <Button title="Report a problem" variant="outline" onPress={() => setShowDispute(true)} />
        )}
        <Text style={[bs.hint, { marginTop: 8 }]}>Disputes, refunds and weather credits are only available for flights booked and paid in Positive Rate.</Text>
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
  if (!r) return null;
  // Shown as first name + last initial, from the account (never typed in).
  const full = (auth?.account?.full_name || '').trim().split(/\s+/);
  const displayName = full[0] ? `${full[0]}${full[1] ? ` ${full[full.length - 1][0]}.` : ''}` : 'Positive Rate pilot';
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
      name: displayName, verified: true, role, lesson: r.goal,
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
        <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6, lineHeight: 18 }}>
          Only people who completed a booking can review, so yours shows a verified badge.
        </Text>
        <SectionTitle>Overall rating</SectionTitle>
        <StarPicker value={rating} onChange={setRating} size={44} />
        <Text style={{ color: C.sub, marginTop: 4 }}>{rating ? ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][rating] : 'Tap a star to rate'}</Text>
        <SectionTitle>What stood out?</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {(isCfi ? CFI_TAGS : PLANE_TAGS).map((t) => (
            <Chip key={t} small label={t} active={tags.includes(t)} onPress={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])} />
          ))}
        </View>
        <SectionTitle>Tell other pilots (optional)</SectionTitle>
        <Field multiline value={text} onChangeText={setText} placeholder={isCfi ? 'How was the lesson, briefing and debrief?' : 'Condition, squawks, scheduling, billing…'} />
        <Text style={{ color: C.sub, fontSize: 12 }}>Shown as “{displayName}”.</Text>
        {!!err && <Text style={{ color: '#B91C1C', fontWeight: '600', marginTop: 10 }}>{err}</Text>}
      </ScrollView>
      <View style={bs.cta}>
        <Button title={busy ? 'Posting…' : rating ? 'Post verified review' : 'Tap a star rating'} disabled={!rating || busy} style={{ flex: 1 }} onPress={submit} />
      </View>
    </View>
  );
}

const bs = StyleSheet.create({
  checkoutCard: { backgroundColor: '#EEF4FF', borderRadius: 12, padding: 12, marginTop: 16 },
  proposal: { backgroundColor: '#F5F0FF', borderRadius: 12, padding: 12, marginTop: 10 },
  fixes: { marginBottom: 10 },
  fixRow: { minHeight: 40, justifyContent: 'center' },
  fixText: { color: C.blue, fontWeight: '800' },
  split: { backgroundColor: '#EEF4FF', borderRadius: 12, padding: 12, marginTop: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  summary: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 18, marginBottom: 8, borderWidth: 1, borderColor: C.line, minHeight: 52 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.navy },
  h1: { fontSize: 28, fontWeight: '900', color: C.text, marginTop: 6 },
  hint: { color: C.sub, fontSize: 12, marginBottom: 6 },
  pick: { width: 116, backgroundColor: '#fff', borderRadius: 14, padding: 10, marginRight: 10, alignItems: 'center', borderWidth: 1, borderColor: C.line, minHeight: 112 },
  pickOn: { borderWidth: 2, borderColor: C.navy, backgroundColor: '#fff' },
  pickName: { fontWeight: '800', color: C.text, marginTop: 6, fontSize: 13 },
  pickSub: { color: C.sub, fontSize: 11, marginTop: 1, textAlign: 'center' },
  flies: { color: C.green, fontSize: 10, fontWeight: '800', marginTop: 3, textAlign: 'center' },
  soloIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' },
  date: { width: 64, paddingVertical: 10, backgroundColor: '#fff', borderRadius: 12, alignItems: 'center', marginRight: 8, borderWidth: 2, borderColor: 'transparent' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 10 },
  slot: { width: '31.5%', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1.5, borderColor: C.border },
  slotBusy: { backgroundColor: '#F1F3F7', borderColor: '#F1F3F7' },
  pay: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.line, minHeight: 64 },
  cardIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  detailsRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 4, marginBottom: 6 },
  repeat: { flexDirection: 'row', backgroundColor: '#DDF3E8', borderRadius: 8, padding: 8, marginVertical: 4 },
  covered: { backgroundColor: C.sky, borderRadius: 14, padding: 14, marginTop: 16 },
  coveredLine: { color: C.navy, fontSize: 13, marginTop: 3 },
  warn: { color: '#B45309', backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10, marginBottom: 8, fontSize: 12, fontWeight: '600' },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.line },
  kicker: { color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  nextRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 8 },
  nextNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.amberBg, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardActions: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  more: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: C.chevron, alignItems: 'center', justifyContent: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  linkBtn: { minHeight: 44, justifyContent: 'center', marginRight: 18 },
  link: { color: C.blue, fontWeight: '700' },
  seg: { flexDirection: 'row', backgroundColor: C.sky, borderRadius: 12, padding: 4, marginTop: 12, marginBottom: 14 },
  segBtn: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: '#fff' },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  detailText: { flex: 1, marginLeft: 12, fontWeight: '700', color: C.text },
  iconBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: C.chevron, alignItems: 'center', justifyContent: 'center' },
  check: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  actions: { flexDirection: 'row', marginTop: 12 },
  action: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F1F5F9', marginRight: 8 },
  actionText: { color: C.blue, fontWeight: '800', fontSize: 13 },
  demo: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#F8FAFC', borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: '#CBD5E1' },
  demoText: { color: C.sub, fontWeight: '700', fontSize: 12 },
  reviewBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
});
