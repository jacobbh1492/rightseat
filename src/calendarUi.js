import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { C, Sheet, Icon } from './ui';
import { dateKey, addDays, dayOfWeek, minutesLabel } from './schedule';

// Calendar pieces shared by booking (students) and the instructor calendar.
// Dates are plain calendar dates { y, m, d } in the instructor's time zone.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (m) => MONTHS[m - 1];
export const sameDate = (a, b) => !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d;
export const cmpDate = (a, b) => dateKey(a).localeCompare(dateKey(b));
export const shortDate = (dt) => new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
export const longDate = (dt) => new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

// Month grid. `enabled(date)` decides which days can be tapped; `dot(date)` marks days
// (e.g. lessons booked); `inRange(date)` shades a selected span (time off).
export function MonthCalendar({ month, onMonth, selected, onSelect, enabled = () => true, dot, inRange, minMonth, maxMonth }) {
  const first = { y: month.y, m: month.m, d: 1 };
  const lead = dayOfWeek(first);
  const daysIn = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => ({ y: month.y, m: month.m, d: i + 1 }))];
  while (cells.length % 7) cells.push(null);
  const step = (n) => { const t = new Date(Date.UTC(month.y, month.m - 1 + n, 1)); onMonth({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 }); };
  const mk = (x) => x.y * 12 + x.m;
  const canBack = !minMonth || mk(month) > mk(minMonth);
  const canNext = !maxMonth || mk(month) < mk(maxMonth);
  return (
    <View style={cs.cal}>
      <View style={cs.calHead}>
        <Pressable onPress={() => canBack && step(-1)} disabled={!canBack} style={[cs.navBtn, !canBack && { opacity: 0.3 }]} accessibilityRole="button" accessibilityLabel="Previous month">
          <Icon name="back" size={20} color={C.blue} />
        </Pressable>
        <Text style={cs.calTitle}>{monthName(month.m)} {month.y}</Text>
        <Pressable onPress={() => canNext && step(1)} disabled={!canNext} style={[cs.navBtn, !canNext && { opacity: 0.3 }]} accessibilityRole="button" accessibilityLabel="Next month">
          <Icon name="chevron" size={20} color={C.blue} />
        </Pressable>
      </View>
      <View style={cs.row}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={cs.dow}>{d}</Text>)}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <View key={w} style={cs.row}>
          {cells.slice(w * 7, w * 7 + 7).map((dt, i) => {
            if (!dt) return <View key={i} style={cs.cell} />;
            const on = enabled(dt);
            const sel = sameDate(dt, selected);
            const span = inRange && inRange(dt);
            return (
              <Pressable key={i} disabled={!on} onPress={() => onSelect(dt)} style={cs.cell}
                accessibilityRole="button" accessibilityLabel={`${longDate(dt)}${on ? '' : ', unavailable'}`} accessibilityState={{ selected: sel, disabled: !on }}>
                <View style={[cs.day, on && cs.dayOn, span && cs.daySpan, sel && cs.daySel]}>
                  <Text style={[cs.dayText, on && { color: C.blue, fontWeight: '800' }, span && { color: C.navy }, sel && { color: '#fff' }]}>{dt.d}</Text>
                </View>
                {dot && dot(dt) ? <View style={[cs.dot, sel && { backgroundColor: '#fff' }]} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// Pick a time of day (minutes after midnight) from a list.
export function TimeSheet({ visible, title, value, min = 0, max = 1440, step = 15, onPick, onClose }) {
  const times = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) times.push(t);
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <ScrollView style={{ maxHeight: 380 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {times.map((t) => (
            <Pressable key={t} onPress={() => { onPick(t); onClose(); }} style={[cs.timeBtn, value === t && { backgroundColor: C.blue, borderColor: C.blue }]} accessibilityRole="button">
              <Text style={{ fontWeight: '700', color: value === t ? '#fff' : C.text }}>{t === 1440 ? '12:00 AM (midnight)' : minutesLabel(t)}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Sheet>
  );
}

// Seven days starting at `start`, as a strip of day buttons.
export function WeekStrip({ start, selected, onSelect, dot }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((dt) => {
        const sel = sameDate(dt, selected);
        const label = new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
        return (
          <Pressable key={dateKey(dt)} onPress={() => onSelect(dt)} style={[cs.weekDay, sel && { backgroundColor: C.blue, borderColor: C.blue }]}
            accessibilityRole="button" accessibilityLabel={longDate(dt)} accessibilityState={{ selected: sel }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: sel ? '#DCE8FF' : C.sub }}>{label}</Text>
            <Text style={{ fontSize: 17, fontWeight: '900', color: sel ? '#fff' : C.text, marginTop: 2 }}>{dt.d}</Text>
            <View style={[cs.dot, { opacity: dot && dot(dt) ? 1 : 0 }, sel && { backgroundColor: '#fff' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

export const cs = StyleSheet.create({
  cal: { backgroundColor: '#fff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: C.line },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  calTitle: { fontWeight: '900', fontSize: 17, color: C.text },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.sky },
  row: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', color: C.sub, fontSize: 12, fontWeight: '700', paddingVertical: 6 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3, minHeight: 48 },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: C.sky },
  daySpan: { backgroundColor: '#FDE7B8' },
  daySel: { backgroundColor: C.blue },
  dayText: { fontSize: 15, color: '#A3ACBA', fontWeight: '600' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.amber, marginTop: 2 },
  timeBtn: { minWidth: '30%', flexGrow: 1, minHeight: 44, borderRadius: 10, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, backgroundColor: '#fff' },
  weekDay: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', minHeight: 64 },
});
