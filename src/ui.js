import React from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Switch, Image, Modal, ScrollView } from 'react-native';
import { Icon } from './icons';
export { Icon };
import * as ImagePicker from 'expo-image-picker';

export const C = {
  navy: '#0B1F3A',
  blue: '#1F6FEB',
  sky: '#EAF2FF',
  bg: '#F5F7FB',
  card: '#FFFFFF',
  text: '#0F172A',
  sub: '#64748B',
  line: '#E5E9F0',
  green: '#0E9F6E',
  amber: '#F59E0B',
};

export function Avatar({ initials, color, size = 52, photo }) {
  if (photo) return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function PlaneThumb({ color, size = 56, label }) {
  return (
    <View style={[s.thumb, { width: size, height: size, backgroundColor: color }]}>
      <Text style={{ fontSize: size * 0.45, color: '#fff' }}>✈</Text>
      {label ? <Text style={s.thumbLabel}>{label}</Text> : null}
    </View>
  );
}

export function Card({ children, style, onPress }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, small }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, small && s.chipSmall, active && { backgroundColor: C.blue, borderColor: C.blue }]}
    >
      <Text style={[s.chipText, small && { fontSize: 12 }, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Tag({ label, color = C.blue, bg = C.sky }) {
  return (
    <View style={[s.tag, { backgroundColor: bg }]}>
      <Text style={[s.tagText, { color }]}>{label}</Text>
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', style, disabled, icon, small }) {
  const outline = variant === 'outline';
  const ghost = variant === 'ghost';
  const fg = outline || ghost ? C.blue : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        small && { paddingVertical: 10 },
        outline && { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.blue },
        ghost && { backgroundColor: C.sky },
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {icon ? <View style={{ marginRight: 8 }}><Icon name={icon} size={18} color={fg} /></View> : null}
        <Text style={[s.btnText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
      </View>
    </Pressable>
  );
}

export function IconButton({ name, onPress, label, color = C.text, bg = '#fff', size = 22, badge, style }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label || name} onPress={onPress} hitSlop={8}
      style={({ pressed }) => [s.iconBtn, { backgroundColor: bg }, pressed && { opacity: 0.7 }, style]}>
      <Icon name={name} size={size} color={color} />
      {badge ? <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View> : null}
    </Pressable>
  );
}

export function Badge({ count, style }) {
  if (!count) return null;
  return <View style={[s.badge, { position: 'relative', top: 0, right: 0 }, style]}><Text style={s.badgeText}>{count}</Text></View>;
}

// Settings-style row with an icon tile.
export function ListRow({ icon, iconColor = C.blue, iconBg = C.sky, title, subtitle, right, onPress, first, danger }) {
  const Wrap = onPress ? Pressable : View; // a non-pressable row must not swallow taps meant for buttons inside it
  return (
    <Wrap onPress={onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={onPress ? ({ pressed }) => [s.listRow, !first && s.listRowBorder, pressed && { backgroundColor: '#F8FAFC' }] : [s.listRow, !first && s.listRowBorder]}>
      {icon ? <View style={[s.listIcon, { backgroundColor: iconBg }]}><Icon name={icon} size={18} color={iconColor} /></View> : null}
      <View style={{ flex: 1 }}>
        <Text style={[s.listTitle, danger && { color: '#DC2626' }]}>{title}</Text>
        {subtitle ? <Text style={s.listSub} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right !== undefined ? right : onPress ? <Icon name="chevron" size={18} color="#94A3B8" /> : null}
    </Wrap>
  );
}

// Bottom sheet (modal) for filters and pickers.
export function Sheet({ visible, onClose, title, children, footer }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.grabber} />
        <View style={s.sheetHead}>
          <Text style={s.sheetTitle}>{title}</Text>
          <IconButton name="x" label="Close" onPress={onClose} bg="#F1F5F9" size={18} />
        </View>
        <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12 }}>{children}</ScrollView>
        {footer ? <View style={s.sheetFoot}>{footer}</View> : null}
      </View>
    </Modal>
  );
}

// Underline tabs for switching views within a screen.
export function Tabs({ tabs, value, onChange, dark }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} style={[s.tab, on && { borderBottomColor: dark ? '#fff' : C.blue }]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            {t.icon ? <Icon name={t.icon} size={16} color={on ? (dark ? '#fff' : C.blue) : dark ? '#9FB3D1' : C.sub} /> : null}
            <Text numberOfLines={1} style={[s.tabText, { color: on ? (dark ? '#fff' : C.blue) : dark ? '#9FB3D1' : C.sub }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Stat({ value, label }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export function Row({ label, value, bold }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, bold && { color: C.text, fontWeight: '700' }]}>{label}</Text>
      <Text style={[s.rowValue, bold && { fontWeight: '800', fontSize: 16 }]}>{value}</Text>
    </View>
  );
}

export function Stars({ rating, count }) {
  if (count === 0) return <Text style={{ color: C.blue, fontWeight: '700' }}>New</Text>;
  return (
    <Text style={{ color: C.text, fontWeight: '600' }}>
      <Text style={{ color: C.amber }}>★ </Text>
      {rating.toFixed(1)}
      {count != null ? <Text style={{ color: C.sub, fontWeight: '400' }}> ({count})</Text> : null}
    </Text>
  );
}

export function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, prefix }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={[s.inputWrap, multiline && { alignItems: 'flex-start' }]}>
        {prefix ? <Text style={s.prefix}>{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9AA3B2"
          keyboardType={keyboardType}
          multiline={multiline}
          style={[s.input, multiline && { minHeight: 80, textAlignVertical: 'top' }]}
        />
      </View>
    </View>
  );
}

export function MultiSelect({ label, options, selected, onChange, single }) {
  const toggle = (o) => {
    if (single) return onChange([o]);
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  };
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.wrap}>
        {options.map((o) => (
          <Chip key={o} small label={o} active={selected.includes(o)} onPress={() => toggle(o)} />
        ))}
      </View>
    </View>
  );
}

export function Toggle({ label, value, onValueChange, hint }) {
  return (
    <Pressable onPress={() => onValueChange(!value)} style={s.toggle}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: C.text, fontWeight: '600' }}>{label}</Text>
        {hint ? <Text style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: C.blue }} />
    </Pressable>
  );
}

export function Stepper({ label, value, onChange, step = 0.5, min = 0, unit = 'hr' }) {
  return (
    <View style={s.stepper}>
      <Text style={{ flex: 1, color: C.text, fontWeight: '600' }}>{label}</Text>
      <Pressable style={s.stepBtn} onPress={() => onChange(Math.max(min, +(value - step).toFixed(1)))}>
        <Text style={s.stepBtnText}>−</Text>
      </Pressable>
      <Text style={s.stepValue}>
        {value} {unit}
      </Text>
      <Pressable style={s.stepBtn} onPress={() => onChange(+(value + step).toFixed(1))}>
        <Text style={s.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export async function pickImages(multiple = true) {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: multiple,
    quality: 0.7,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => a.uri);
}

const OWNER_COLORS = {
  'Private owner': ['#7C3AED', '#F3E8FF'],
  'Flying club': ['#0E9F6E', '#E3F7EF'],
  'Flight school': ['#1F6FEB', '#E8F1FF'],
  'Rental fleet': ['#B45309', '#FEF3C7'],
  Leaseback: ['#0891B2', '#E0F7FA'],
};
export function OwnerBadge({ type }) {
  const [fg, bg] = OWNER_COLORS[type] || [C.sub, '#EEF1F5'];
  return <Tag label={type} color={fg} bg={bg} />;
}

export function VerifiedBadge({ role }) {
  return (
    <View style={[s.tag, { backgroundColor: '#E3F7EF', flexDirection: 'row', alignItems: 'center', marginBottom: 0 }]}>
      <Text style={[s.tagText, { color: C.green }]}>✓ Verified {role ? role.toLowerCase() : 'customer'}</Text>
    </View>
  );
}

export function ReviewCard({ r }) {
  return (
    <View style={[s.card, { marginBottom: 10 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: '800', color: C.text }}>{r.name}</Text>
        <Text style={{ color: C.amber, fontSize: 13 }}>{'★'.repeat(r.rating)}<Text style={{ color: C.line }}>{'★'.repeat(5 - r.rating)}</Text></Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        {r.verified && <VerifiedBadge role={r.role} />}
        <Text style={{ color: C.sub, fontSize: 12, marginLeft: 6 }}>{[r.lesson, r.date].filter(Boolean).join(' · ')}</Text>
      </View>
      {r.tags && r.tags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {r.tags.map((t) => <Tag key={t} label={t} color={C.sub} bg="#EEF1F5" />)}
        </View>
      )}
      {r.text ? <Text style={{ color: C.text, lineHeight: 20, marginTop: 6 }}>{r.text}</Text> : null}
    </View>
  );
}

export function StarPicker({ value, onChange, size = 34 }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={6} style={{ marginRight: 6 }}>
          <Text style={{ fontSize: size, color: n <= value ? C.amber : C.line }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const s = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, minHeight: 56 },
  listRowBorder: { borderTopWidth: 1, borderTopColor: '#F1F4F8' },
  listIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  listTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  listSub: { fontSize: 12, color: C.sub, marginTop: 2 },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24, maxWidth: 480, alignSelf: 'center', width: '100%' },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D7DEE8', alignSelf: 'center', marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: C.text },
  sheetFoot: { paddingHorizontal: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabText: { fontWeight: '800', fontSize: 13, marginLeft: 5 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  thumb: { borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  thumbLabel: { color: '#fff', fontSize: 10, fontWeight: '700', marginTop: -2 },
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EDF1F6',
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: '#fff',
    marginRight: 8,
    marginBottom: 8,
  },
  chipSmall: { paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { color: C.text, fontWeight: '600', fontSize: 13 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 6, marginBottom: 6 },
  tagText: { fontSize: 11, fontWeight: '700' },
  btn: { backgroundColor: C.blue, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  section: { fontSize: 19, fontWeight: '800', color: C.text, letterSpacing: -0.2 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  statValue: { fontSize: 18, fontWeight: '800', color: C.navy },
  statLabel: { fontSize: 11, color: C.sub, marginTop: 2, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  rowLabel: { color: C.sub, flex: 1, paddingRight: 8 },
  rowValue: { color: C.text, fontWeight: '600', textAlign: 'right' },
  label: { fontSize: 13, fontWeight: '700', color: C.sub, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  prefix: { color: C.sub, fontWeight: '700', marginRight: 4 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: C.text },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginBottom: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: C.blue, fontSize: 20, fontWeight: '800' },
  stepValue: { width: 70, textAlign: 'center', fontWeight: '700', color: C.text },
});
