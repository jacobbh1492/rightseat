import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useStore } from '../store';
import { useAuth } from '../backend/auth';
import { C, Card, Button, Chip, Field, Toggle, Icon, SectionTitle } from '../ui';
import { Header } from './Details';
import { fetchSchedule, saveSchedule, fetchTimeOff, addTimeOff, removeTimeOff } from '../backend/schedule';
import {
  DAY_KEYS, DAY_NAMES, NOTICE_OPTIONS, AHEAD_OPTIONS, BUFFER_OPTIONS, INCREMENT_OPTIONS, TIMEZONES,
  DEFAULT_SCHEDULE, cleanRanges, minutesLabel, zonedTime, zonedParts, todayIn, addDays, dayOfWeek, dateKey, timeIn, tzAbbrev,
} from '../schedule';
import { MonthCalendar, TimeSheet, WeekStrip, sameDate, cmpDate, shortDate, longDate } from '../calendarUi';

// Instructor calendar, Calendly-style: weekly working hours, booking rules, time off,
// and a day-by-day view of lessons and blocked time. Students only ever see open
// start times; the server enforces the same rules when they book.

const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const rangeText = (r) => `${minutesLabel(r[0])} – ${r[1] === 1440 ? 'midnight' : minutesLabel(r[1])}`;
const hoursText = (s) => {
  const days = ORDER.filter((k) => s.weekly[k].length);
  if (!days.length) return 'No working hours set';
  const same = days.every((k) => JSON.stringify(s.weekly[k]) === JSON.stringify(s.weekly[days[0]]));
  const names = days.map((k) => DAY_NAMES[k].slice(0, 3));
  return same ? `${names.length === 5 && days.join() === 'mon,tue,wed,thu,fri' ? 'Mon–Fri' : names.join(', ')} · ${s.weekly[days[0]].map(rangeText).join(', ')}` : `${names.join(', ')} · varies by day`;
};

// The signed-in instructor's own calendar data.
function useMyCalendar() {
  const auth = useAuth();
  const { cfis, myCfiId } = useStore();
  const uid = auth?.session?.user?.id;
  const me = cfis.find((c) => c.id === uid && c.live);
  const [state, setState] = useState({ loading: true, schedule: null, saved: false, timeOff: [], error: '' });
  const load = async () => {
    if (!uid || !me) { setState((s) => ({ ...s, loading: false })); return; }
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const [{ schedule, saved }, timeOff] = await Promise.all([fetchSchedule(uid, me.availability), fetchTimeOff(uid)]);
      setState({ loading: false, schedule, saved, timeOff, error: '' });
    } catch (e) { setState((s) => ({ ...s, loading: false, error: e.message })); }
  };
  useEffect(() => { load(); }, [uid, !!me, myCfiId]);
  return { uid, me, ...state, reload: load, setState };
}

function NotInstructor({ nav, signedIn }) {
  return (
    <Card style={{ borderWidth: 1.5, borderColor: C.blue }}>
      <Text style={a.title}>{signedIn ? 'Create your instructor profile first' : 'Sign in to set your hours'}</Text>
      <Text style={a.sub}>{signedIn ? 'Your working hours and time off belong to your instructor profile.' : 'Your calendar is saved to your account.'}</Text>
      <Button title={signedIn ? 'Create instructor profile' : 'Sign in'} style={{ marginTop: 12 }} onPress={() => nav.push(signedIn ? 'CfiForm' : 'SignIn')} />
    </Card>
  );
}

// ---------------------------------------------------------------- working hours + rules + time off
export function Availability({ nav }) {
  const cal = useMyCalendar();
  const { refreshListings } = useStore();
  const [s, setS] = useState(null);
  const [picker, setPicker] = useState(null); // { day, i, end }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (cal.schedule) setS(cal.schedule); }, [cal.schedule]);
  const dirty = s && cal.schedule && JSON.stringify(s) !== JSON.stringify(cal.schedule);

  const setDay = (k, ranges) => setS((x) => ({ ...x, weekly: { ...x.weekly, [k]: ranges } }));
  const toggleDay = (k) => setDay(k, s.weekly[k].length ? [] : [[480, 1080]]);
  const addRange = (k) => {
    const r = s.weekly[k];
    const last = r[r.length - 1];
    const startAt = last ? Math.min(last[1] + 60, 1380) : 480;
    setDay(k, cleanRanges([...r, [startAt, Math.min(startAt + 180, 1440)]]));
  };
  const setTime = (k, i, end, t) => {
    const r = s.weekly[k].map((x) => [...x]);
    r[i][end ? 1 : 0] = t;
    if (r[i][1] - r[i][0] < 30) { if (end) r[i][0] = Math.max(0, t - 60); else r[i][1] = Math.min(1440, t + 60); }
    setDay(k, cleanRanges(r));
  };
  const copyToWeekdays = (k) => setS((x) => ({ ...x, weekly: { ...x.weekly, ...Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, x.weekly[k].map((r) => [...r])])) } }));

  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const { schedule } = await saveSchedule(cal.uid, s);
      cal.setState((st) => ({ ...st, schedule, saved: true }));
      setMsg('Saved ✓ Students now see these hours.');
      refreshListings().catch(() => {});
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const removeOff = async (t) => {
    try { await removeTimeOff(t.id); cal.setState((st) => ({ ...st, timeOff: st.timeOff.filter((x) => x.id !== t.id) })); }
    catch (e) { setMsg(e.message); }
  };

  const tz = s?.timezone || DEFAULT_SCHEDULE.timezone;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Hours & time off" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: dirty ? 120 : 60 }} refreshControl={<RefreshControl refreshing={cal.loading} onRefresh={cal.reload} />}>
        {!cal.uid || (!cal.me && !cal.loading) ? <NotInstructor nav={nav} signedIn={!!cal.uid} /> : !s ? (
          <Text style={a.sub}>{cal.error || 'Loading your calendar…'}</Text>
        ) : (
          <>
            <Text style={a.lead}>Students can only request times inside your working hours, outside your time off and other lessons. You still confirm every request.</Text>
            {!cal.saved && <Text style={[a.note, { marginTop: 8 }]}>You haven’t saved hours yet, so students see 8 AM – 6 PM on your working days. Adjust and save below.</Text>}

            <SectionTitle>Weekly hours</SectionTitle>
            <View style={a.list}>
              {ORDER.map((k) => {
                const on = s.weekly[k].length > 0;
                return (
                  <View key={k} style={a.dayRow}>
                    <Pressable onPress={() => toggleDay(k)} style={a.dayToggle} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={DAY_NAMES[k]}>
                      <View style={[a.box, on && { backgroundColor: C.blue, borderColor: C.blue }]}>{on && <Icon name="check" size={14} color="#fff" strokeWidth={3} />}</View>
                      <Text style={[a.dayName, !on && { color: C.sub }]}>{DAY_NAMES[k].slice(0, 3)}</Text>
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      {!on && <Text style={[a.sub, { marginTop: 12 }]}>Unavailable</Text>}
                      {s.weekly[k].map((r, i) => (
                        <View key={i} style={a.rangeRow}>
                          <Pressable onPress={() => setPicker({ day: k, i, end: false })} style={a.timeBtn} accessibilityRole="button" accessibilityLabel={`${DAY_NAMES[k]} start ${minutesLabel(r[0])}`}>
                            <Text style={a.timeText}>{minutesLabel(r[0])}</Text>
                          </Pressable>
                          <Text style={{ color: C.sub, marginHorizontal: 6 }}>–</Text>
                          <Pressable onPress={() => setPicker({ day: k, i, end: true })} style={a.timeBtn} accessibilityRole="button" accessibilityLabel={`${DAY_NAMES[k]} end ${minutesLabel(r[1])}`}>
                            <Text style={a.timeText}>{r[1] === 1440 ? 'Midnight' : minutesLabel(r[1])}</Text>
                          </Pressable>
                          <Pressable onPress={() => setDay(k, s.weekly[k].filter((_, j) => j !== i))} style={a.iconBtn} accessibilityRole="button" accessibilityLabel="Remove these hours">
                            <Icon name="x" size={18} color={C.sub} />
                          </Pressable>
                        </View>
                      ))}
                      {on && (
                        <View style={{ flexDirection: 'row', gap: 14, marginTop: 2 }}>
                          <Pressable onPress={() => addRange(k)} style={a.link} accessibilityRole="button"><Text style={a.linkText}>+ Add hours</Text></Pressable>
                          {['mon', 'tue', 'wed', 'thu', 'fri'].includes(k) && (
                            <Pressable onPress={() => copyToWeekdays(k)} style={a.link} accessibilityRole="button"><Text style={a.linkText}>Copy to Mon–Fri</Text></Pressable>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            <SectionTitle>Booking rules</SectionTitle>
            <Card>
              <Text style={a.label}>Time zone</Text>
              <View style={a.chips}>{TIMEZONES.map(([id, label]) => <Chip key={id} small label={label} active={tz === id} onPress={() => setS({ ...s, timezone: id })} />)}</View>
              <Text style={a.label}>Minimum notice</Text>
              <View style={a.chips}>{NOTICE_OPTIONS.map((h) => <Chip key={h} small label={h < 24 ? `${h} hr` : `${h / 24} day${h > 24 ? 's' : ''}`} active={s.minNoticeHours === h} onPress={() => setS({ ...s, minNoticeHours: h })} />)}</View>
              <Text style={a.label}>Students can book up to</Text>
              <View style={a.chips}>{AHEAD_OPTIONS.map((d) => <Chip key={d} small label={d >= 180 ? '6 months' : d >= 30 ? `${d / 30} month${d > 30 ? 's' : ''}` : `${d / 7} weeks`} active={s.maxDaysAhead === d} onPress={() => setS({ ...s, maxDaysAhead: d })} />)}</View>
              <Text style={a.label}>Buffer after each lesson</Text>
              <View style={a.chips}>{BUFFER_OPTIONS.map((m) => <Chip key={m} small label={m ? `${m} min` : 'None'} active={s.bufferMin === m} onPress={() => setS({ ...s, bufferMin: m })} />)}</View>
              <Text style={a.label}>Offer start times every</Text>
              <View style={a.chips}>{INCREMENT_OPTIONS.map((m) => <Chip key={m} small label={m === 60 ? 'Hour' : `${m} min`} active={s.incrementMin === m} onPress={() => setS({ ...s, incrementMin: m })} />)}</View>
              <Text style={a.note}>The buffer covers post-flight, fueling and the next preflight. It’s added after every lesson, so back-to-back requests can’t overlap.</Text>
            </Card>

            <SectionTitle right={<Pressable onPress={() => nav.push('BlockTime', { tz })} accessibilityRole="button"><Text style={a.linkText}>+ Block time</Text></Pressable>}>Time off</SectionTitle>
            {cal.timeOff.length === 0 && <Text style={a.sub}>Block a few hours or whole days (checkride, vacation, maintenance). Students won’t see a reason, just that you’re unavailable.</Text>}
            {cal.timeOff.length > 0 && (
              <View style={a.list}>
                {cal.timeOff.map((t) => (
                  <View key={t.id} style={[a.offRow]}>
                    <View style={{ flex: 1 }}>
                      <Text style={a.offTitle}>{t.label || 'Time off'}</Text>
                      <Text style={a.sub}>{offText(t, tz)}</Text>
                    </View>
                    <Pressable onPress={() => removeOff(t)} style={a.iconBtn} accessibilityRole="button" accessibilityLabel={`Remove ${t.label || 'time off'}`}>
                      <Icon name="x" size={18} color={C.sub} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            {!!msg && !dirty && <Text style={[a.msg, /✓/.test(msg) ? null : { color: '#B91C1C' }]}>{msg}</Text>}
          </>
        )}
      </ScrollView>
      {dirty && (
        <View style={a.saveBar}>
          {!!msg && <Text style={[a.msg, { marginTop: 0, marginBottom: 8, color: '#B91C1C' }]}>{msg}</Text>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Undo" variant="outline" style={{ flex: 0.5 }} onPress={() => { setS(cal.schedule); setMsg(''); }} />
            <Button title={busy ? 'Saving…' : 'Save hours'} disabled={busy} style={{ flex: 1 }} onPress={save} />
          </View>
        </View>
      )}
      {picker && s && (
        <TimeSheet visible title={`${DAY_NAMES[picker.day]} · ${picker.end ? 'until' : 'from'}`}
          value={s.weekly[picker.day][picker.i]?.[picker.end ? 1 : 0]}
          min={picker.end ? 30 : 0} max={picker.end ? 1440 : 1410}
          onPick={(t) => setTime(picker.day, picker.i, picker.end, t)} onClose={() => setPicker(null)} />
      )}
    </View>
  );
}

function offText(t, tz) {
  const a1 = zonedParts(t.start, tz), b1 = zonedParts(new Date(t.end.getTime() - 1), tz);
  const d1 = { y: a1.y, m: a1.m, d: a1.d }, d2 = { y: b1.y, m: b1.m, d: b1.d };
  if (t.allDay) return sameDate(d1, d2) ? `${shortDate(d1)} · all day` : `${shortDate(d1)} – ${shortDate(d2)} · all day`;
  if (sameDate(d1, d2)) return `${shortDate(d1)} · ${timeIn(t.start, tz)} – ${timeIn(t.end, tz)}`;
  return `${shortDate(d1)} ${timeIn(t.start, tz)} – ${shortDate(d2)} ${timeIn(t.end, tz)}`;
}

// ---------------------------------------------------------------- block time
export function BlockTime({ nav, params }) {
  const { teaching } = useStore();
  const auth = useAuth();
  const uid = auth?.session?.user?.id;
  const tz = params.tz || DEFAULT_SCHEDULE.timezone;
  const today = todayIn(tz);
  const [allDay, setAllDay] = useState(params.allDay ?? true);
  const [from, setFrom] = useState(params.date || today);
  const [to, setTo] = useState(params.date || today);
  const [pickEnd, setPickEnd] = useState(false);
  const [startMin, setStartMin] = useState(params.startMin ?? 720);
  const [endMin, setEndMin] = useState(params.endMin ?? 840);
  const [month, setMonth] = useState({ y: (params.date || today).y, m: (params.date || today).m });
  const [label, setLabel] = useState('');
  const [picker, setPicker] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const preset = (k) => {
    setErr('');
    if (k === 'today') { const p = zonedParts(new Date(), tz); setAllDay(false); setFrom(today); setTo(today); setStartMin(Math.ceil(p.minutes / 15) * 15); setEndMin(1440); }
    if (k === 'tomorrow') { const t = addDays(today, 1); setAllDay(true); setFrom(t); setTo(t); }
    if (k === 'weekend') { const sat = addDays(today, (6 - dayOfWeek(today) + 7) % 7 || 0); setAllDay(true); setFrom(sat); setTo(addDays(sat, 1)); setMonth({ y: sat.y, m: sat.m }); }
    if (k === 'week') { setAllDay(true); setFrom(today); setTo(addDays(today, 6)); }
  };
  const tap = (dt) => {
    if (!allDay) { setFrom(dt); setTo(dt); return; }
    if (!pickEnd) { setFrom(dt); setTo(dt); setPickEnd(true); }
    else { if (cmpDate(dt, from) < 0) { setFrom(dt); setTo(from); } else setTo(dt); setPickEnd(false); }
  };

  const start = allDay ? zonedTime(from.y, from.m, from.d, 0, tz) : zonedTime(from.y, from.m, from.d, startMin, tz);
  const end = allDay ? (() => { const n = addDays(to, 1); return zonedTime(n.y, n.m, n.d, 0, tz); })() : zonedTime(from.y, from.m, from.d, endMin, tz);
  const valid = end > start && end > new Date();
  const clashes = teaching.filter((r) => r.role === 'cfi' && ['Pending', 'Confirmed'].includes(r.status) && new Date(r.when) < end && new Date(new Date(r.when).getTime() + (r.flightHours + (r.groundHours || 0)) * 3600e3) > start);

  const save = async () => {
    setBusy(true); setErr('');
    try { await addTimeOff({ start, end, allDay, label }); nav.pop(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Block time" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {!uid ? <NotInstructor nav={nav} signedIn={false} /> : (
          <>
            <View style={a.chips}>
              {[['today', 'Rest of today'], ['tomorrow', 'Tomorrow'], ['weekend', 'This weekend'], ['week', 'Next 7 days']].map(([k, l]) => <Chip key={k} small label={l} onPress={() => preset(k)} />)}
            </View>
            <Card>
              <Toggle label="All day" value={allDay} onValueChange={(v) => { setAllDay(v); setTo(from); setPickEnd(false); }} hint={allDay ? 'Tap a start day, then an end day for several days.' : 'Pick the day, then the times.'} />
            </Card>
            <MonthCalendar month={month} onMonth={setMonth} selected={allDay && pickEnd ? from : to} onSelect={tap}
              enabled={(dt) => cmpDate(dt, today) >= 0} inRange={(dt) => cmpDate(dt, from) >= 0 && cmpDate(dt, to) <= 0}
              minMonth={{ y: today.y, m: today.m }} />
            {!allDay && (
              <View style={[a.rangeRow, { marginTop: 12 }]}>
                <Pressable onPress={() => setPicker('start')} style={[a.timeBtn, { flex: 1 }]} accessibilityRole="button"><Text style={a.timeText}>From {minutesLabel(startMin)}</Text></Pressable>
                <Text style={{ color: C.sub, marginHorizontal: 8 }}>–</Text>
                <Pressable onPress={() => setPicker('end')} style={[a.timeBtn, { flex: 1 }]} accessibilityRole="button"><Text style={a.timeText}>Until {endMin === 1440 ? 'midnight' : minutesLabel(endMin)}</Text></Pressable>
              </View>
            )}
            <Card style={{ marginTop: 12 }}>
              <Text style={a.label}>Blocking</Text>
              <Text style={a.title}>{allDay ? (sameDate(from, to) ? `${longDate(from)} · all day` : `${shortDate(from)} – ${shortDate(to)} · all day`) : `${longDate(from)} · ${minutesLabel(startMin)} – ${endMin === 1440 ? 'midnight' : minutesLabel(endMin)}`}</Text>
              <Text style={a.sub}>{tzAbbrev(tz, start)} · students just see you as unavailable</Text>
            </Card>
            <Field label="Note to yourself (optional)" value={label} onChangeText={(t) => setLabel(t.slice(0, 80))} placeholder="e.g. CFII checkride, vacation, annual" />
            {clashes.length > 0 && (
              <Card style={{ backgroundColor: '#FEF3C7' }}>
                <Text style={{ fontWeight: '800', color: '#92400E' }}>{clashes.length} lesson{clashes.length > 1 ? 's' : ''} already booked in this time</Text>
                {clashes.map((r) => <Text key={r.id} style={{ color: '#92400E', marginTop: 4 }}>{r.date} · {r.time} · {r.studentName}</Text>)}
                <Text style={{ color: '#92400E', marginTop: 6, fontSize: 13 }}>Blocking time doesn’t cancel them. Message the student or cancel from Schedule if you need to.</Text>
              </Card>
            )}
            {!!err && <Text style={[a.msg, { color: '#B91C1C' }]}>{err}</Text>}
            <Button title={busy ? 'Saving…' : 'Block this time'} disabled={busy || !valid} onPress={save} />
            {!valid && <Text style={[a.sub, { textAlign: 'center' }]}>Pick an end after the start, in the future.</Text>}
          </>
        )}
      </ScrollView>
      {picker && (
        <TimeSheet visible title={picker === 'start' ? 'Block from' : 'Block until'} value={picker === 'start' ? startMin : endMin}
          min={picker === 'start' ? 0 : startMin + 15} max={picker === 'start' ? 1425 : 1440}
          onPick={(t) => { if (picker === 'start') { setStartMin(t); if (endMin <= t) setEndMin(Math.min(1440, t + 60)); } else setEndMin(t); }}
          onClose={() => setPicker(null)} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------- calendar (day view)
export function CfiCalendar({ nav }) {
  const cal = useMyCalendar();
  const { teaching, refreshLive } = useStore();
  const s = cal.schedule;
  const tz = s?.timezone || DEFAULT_SCHEDULE.timezone;
  const today = todayIn(tz);
  const [sel, setSel] = useState(today);
  const [weekStart, setWeekStart] = useState(today);
  useEffect(() => { refreshLive().catch(() => {}); }, []);

  const lessons = teaching.filter((r) => r.role === 'cfi' && ['Pending', 'Confirmed', 'Completed'].includes(r.status));
  const dayOf = (d) => { const p = zonedParts(d, tz); return { y: p.y, m: p.m, d: p.d }; };
  const hasLesson = (dt) => lessons.some((r) => sameDate(dayOf(new Date(r.when)), dt) && r.status !== 'Completed');
  const dayStart = zonedTime(sel.y, sel.m, sel.d, 0, tz);
  const n = addDays(sel, 1);
  const dayEnd = zonedTime(n.y, n.m, n.d, 0, tz);

  const items = useMemo(() => {
    const out = [];
    for (const r of lessons) {
      const st = new Date(r.when), en = new Date(st.getTime() + (r.flightHours + (r.groundHours || 0)) * 3600e3);
      if (st < dayEnd && en > dayStart) out.push({ kind: 'lesson', start: st, end: en, r });
    }
    for (const t of cal.timeOff) if (t.start < dayEnd && t.end > dayStart) out.push({ kind: 'off', start: t.start < dayStart ? dayStart : t.start, end: t.end > dayEnd ? dayEnd : t.end, t });
    return out.sort((x, y) => x.start - y.start);
  }, [lessons.length, cal.timeOff, dateKey(sel)]);

  const ranges = s ? s.weekly[DAY_KEYS[dayOfWeek(sel)]] : [];
  const offAllDay = items.some((i) => i.kind === 'off' && i.start <= dayStart && i.end >= dayEnd);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header nav={nav} title="Calendar" right={<Pressable onPress={() => nav.push('Availability')} hitSlop={10} accessibilityRole="button"><Text style={a.linkText}>Hours</Text></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={cal.loading} onRefresh={() => { cal.reload(); refreshLive().catch(() => {}); }} />}>
        {!cal.uid || (!cal.me && !cal.loading) ? <NotInstructor nav={nav} signedIn={!!cal.uid} /> : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Pressable onPress={() => setWeekStart(addDays(weekStart, -7))} style={a.navBtn} accessibilityRole="button" accessibilityLabel="Previous week"><Icon name="back" size={20} color={C.blue} /></Pressable>
              <Pressable onPress={() => { setWeekStart(today); setSel(today); }} accessibilityRole="button"><Text style={a.linkText}>Today</Text></Pressable>
              <Pressable onPress={() => setWeekStart(addDays(weekStart, 7))} style={a.navBtn} accessibilityRole="button" accessibilityLabel="Next week"><Icon name="chevron" size={20} color={C.blue} /></Pressable>
            </View>
            <WeekStrip start={weekStart} selected={sel} onSelect={setSel} dot={hasLesson} />

            <Text style={[a.title, { marginTop: 16, fontSize: 18 }]}>{longDate(sel)}</Text>
            <Text style={a.sub}>
              {offAllDay ? 'Blocked all day' : ranges.length ? `Working ${ranges.map(rangeText).join(', ')}` : 'Not a working day'}{` · ${tzAbbrev(tz, dayStart)}`}
            </Text>

            {items.length === 0 && (
              <Card style={{ marginTop: 12 }}>
                <Text style={a.sub}>{ranges.length && !offAllDay ? 'Nothing booked. Students can request any open time.' : 'Nothing booked.'}</Text>
              </Card>
            )}
            {items.map((it, i) => it.kind === 'lesson' ? (
              <Card key={'l' + i} style={[a.item, { borderLeftColor: it.r.status === 'Pending' ? C.amber : it.r.status === 'Completed' ? C.green : C.blue }]}>
                <Text style={a.itemTime}>{timeIn(it.start, tz)} – {timeIn(it.end, tz)}</Text>
                <Text style={a.title}>{it.r.studentName} · {it.r.goal}</Text>
                <Text style={a.sub}>{it.r.status === 'Pending' ? 'Request · confirm on Schedule' : it.r.status}{it.r.tail ? ` · ${it.r.tail}` : ''}</Text>
              </Card>
            ) : (
              <Card key={'o' + i} style={[a.item, { borderLeftColor: '#94A3B8', backgroundColor: '#F1F4F8' }]}>
                <Text style={a.itemTime}>{it.t.allDay || (it.start <= dayStart && it.end >= dayEnd) ? 'All day' : `${timeIn(it.start, tz)} – ${timeIn(it.end, tz)}`}</Text>
                <Text style={a.title}>{it.t.label || 'Time off'}</Text>
                <Pressable onPress={async () => { await removeTimeOff(it.t.id).catch(() => {}); cal.reload(); }} accessibilityRole="button" style={{ marginTop: 6, minHeight: 32, justifyContent: 'center' }}>
                  <Text style={a.linkText}>Remove</Text>
                </Pressable>
              </Card>
            ))}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Button title="Block time" variant="outline" style={{ flex: 1 }} onPress={() => nav.push('BlockTime', { tz, date: sel, allDay: !ranges.length })} />
              <Button title="Edit hours" variant="outline" style={{ flex: 1 }} onPress={() => nav.push('Availability')} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Schedule-tab card: hours at a glance, with Calendar / Hours buttons.
export function CalendarCard({ nav }) {
  const cal = useMyCalendar();
  if (!cal.uid || !cal.me) return null;
  const upcomingOff = cal.timeOff.filter((t) => t.end > new Date()).length;
  return (
    <Card>
      <Text style={a.kicker}>YOUR CALENDAR</Text>
      <Text style={[a.title, { marginTop: 2 }]}>{cal.schedule ? hoursText(cal.schedule) : 'Loading…'}</Text>
      <Text style={a.sub}>{cal.saved ? '' : 'Default hours · '}{upcomingOff ? `${upcomingOff} time-off block${upcomingOff > 1 ? 's' : ''} coming up` : 'No time off blocked'}</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Button title="Calendar" icon="calendar" variant="outline" small style={{ flex: 1 }} onPress={() => nav.push('CfiCalendar')} />
        <Button title="Hours & time off" variant="outline" small style={{ flex: 1.2 }} onPress={() => nav.push('Availability')} />
      </View>
    </Card>
  );
}

const a = StyleSheet.create({
  lead: { color: C.text, lineHeight: 21 },
  title: { fontWeight: '900', color: C.text, fontSize: 16 },
  sub: { color: C.sub, fontSize: 13, marginTop: 2, lineHeight: 18 },
  note: { color: C.navy, fontSize: 13, lineHeight: 18, marginTop: 10 },
  kicker: { color: C.sub, fontSize: 12, fontWeight: '700' },
  label: { color: C.text, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  list: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  dayRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  dayToggle: { flexDirection: 'row', alignItems: 'center', width: 84, minHeight: 44, alignSelf: 'flex-start' },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#B6C0CF', alignItems: 'center', justifyContent: 'center' },
  dayName: { fontWeight: '800', color: C.text, marginLeft: 10, fontSize: 15 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  timeBtn: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  timeText: { fontWeight: '700', color: C.text },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 36, justifyContent: 'center' },
  linkText: { color: C.blue, fontWeight: '700' },
  offRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  offTitle: { fontWeight: '800', color: C.text },
  msg: { color: C.green, fontWeight: '700', marginTop: 12 },
  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, padding: 12, paddingBottom: 24 },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.sky },
  item: { borderLeftWidth: 4, marginTop: 10 },
  itemTime: { color: C.sub, fontWeight: '800', fontSize: 12, marginBottom: 2 },
});
