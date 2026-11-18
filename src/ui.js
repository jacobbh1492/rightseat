import React from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Switch, Image, Modal, ScrollView, PanResponder } from 'react-native';
import { Icon } from './icons';
export { Icon };
import * as ImagePicker from 'expo-image-picker';
import Svg, { Rect, Circle, Path } from 'react-native-svg';

// Positive Rate brand: navy + amber, with grays that pass WCAG AA on white.
export const C = {
  navy: '#0B1F3A',
  amber: '#F59E0B',
  amberDark: '#92400E',
  amberBg: '#FEF3C7',
  blue: '#1D4ED8',      // links and accents (7:1 on white)
  sky: '#EEF2F7',       // quiet tile / selected background
  bg: '#F5F7FB',
  card: '#FFFFFF',
  text: '#0F172A',
  body: '#475569',
  sub: '#5B6B82',       // secondary text (5.4:1)
  placeholder: '#687588', // 4.7:1
  chevron: '#7A889C',
  border: '#808EA3',    // input and chip borders (3.3:1, meets non-text contrast)
  line: '#E2E8F0',
  green: '#0B6E4F',
  greenBg: '#DDF3E8',
  red: '#B91C1C',
  redBg: '#FEE2E2',
};
export const HIT = 44; // minimum touch target

// Heading-bug mark: navy tile, white compass ring, amber bug at 12 o'clock.
export function Logo({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityRole="image" accessibilityLabel="Positive Rate">
      <Rect width="32" height="32" rx="9" fill={C.navy} />
      <Circle cx="16" cy="17" r="9" fill="none" stroke="#FFFFFF" strokeWidth="2" />
      <Path d="M11.5 5.5h9v4.5l-4.5 3-4.5-3z" fill={C.amber} />
      <Path d="M16 17l4-5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// Colored notice: tone navy | amber | green | red | gray.
export function Banner({ title, children, tone = 'navy', icon }) {
  const t = { navy: [C.navy, '#fff', '#C9D4E5'], amber: [C.amberBg, C.amberDark, '#78350F'], green: [C.greenBg, C.green, '#14532D'], red: [C.redBg, C.red, '#7F1D1D'], gray: [C.sky, C.text, C.body] }[tone] || [];
  return (
    <View style={[s.banner, { backgroundColor: t[0] }]} accessible accessibilityRole={tone === 'red' ? 'alert' : undefined}>
      {icon ? <View style={{ marginRight: 10, marginTop: 1 }}><Icon name={icon} size={20} color={t[1]} /></View> : null}
      <View style={{ flex: 1 }}>
        {title ? <Text style={{ color: t[1], fontWeight: '800', fontSize: 14 }}>{title}</Text> : null}
        {typeof children === 'string' ? <Text style={{ color: t[2], fontSize: 13, lineHeight: 18, marginTop: title ? 2 : 0 }}>{children}</Text> : children}
      </View>
    </View>
  );
}

// "Step 2 of 4" progress for multi-step setups.
export function Steps({ labels, current }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 14 }} accessible accessibilityLabel={`Step ${current + 1} of ${labels.length}: ${labels[current]}`}>
      {labels.map((l, i) => (
        <View key={l} style={{ flex: 1, marginRight: i < labels.length - 1 ? 6 : 0 }}>
          <View style={{ height: 5, borderRadius: 999, backgroundColor: i < current ? C.green : i === current ? C.amber : C.line }} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: i <= current ? C.navy : C.sub, marginTop: 4 }} numberOfLines={1}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

// Status pill with a symbol, so meaning never relies on color alone.
export function Pill({ label, kind = 'info' }) {
  const m = { ok: ['✓ ', C.green, C.greenBg], pending: ['', C.amberDark, C.amberBg], warn: ['! ', C.amberDark, C.amberBg], bad: ['✕ ', C.red, C.redBg], info: ['', C.navy, C.sky] }[kind] || ['', C.navy, C.sky];
  return <Tag label={m[0] + label} color={m[1]} bg={m[2]} />;
}

// Single-thumb slider (no native module). value in [min, max], snapped to step.
export function Slider({ value, min, max, step = 1, onChange, label, format = (v) => String(v) }) {
  const [w, setW] = React.useState(0);
  const ref = React.useRef({ w: 0, x0: 0 });
  ref.current.w = w;
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const fromX = (x) => clamp(min + (x / Math.max(1, ref.current.w)) * (max - min));
  const pan = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { ref.current.x0 = e.nativeEvent.locationX; onChange(fromX(e.nativeEvent.locationX)); },
    onPanResponderMove: (e, g) => onChange(fromX(ref.current.x0 + g.dx)),
  }), [min, max, step, onChange]);
  const pct = max > min ? (value - min) / (max - min) : 0;
  return (
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: format(value) }}
      onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === 'increment' ? step : -step)))}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      style={{ height: 44, justifyContent: 'center' }} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line }}>
        <View style={{ width: `${pct * 100}%`, height: 6, borderRadius: 3, backgroundColor: C.navy }} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(0, pct * w - 14), width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', borderWidth: 2, borderColor: C.navy }} />
    </View>
  );
}

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
      accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={[s.chip, small && s.chipSmall, active && { backgroundColor: C.navy, borderColor: C.navy }]}
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

// primary: amber with navy text (one per screen) · outline/secondary: white with a navy label ·
// ghost: text only · navy: solid navy · danger: red outline.
export function Button({ title, onPress, variant = 'primary', style, disabled, icon, small }) {
  const outline = variant === 'outline' || variant === 'secondary';
  const ghost = variant === 'ghost';
  const navy = variant === 'navy';
  const danger = variant === 'danger';
  const fg = disabled && !outline && !ghost ? '#5B6B82' : danger ? C.red : navy ? '#fff' : C.navy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        small && { paddingVertical: 10, minHeight: HIT },
        outline && { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.chevron },
        ghost && { backgroundColor: 'transparent' },
        navy && { backgroundColor: C.navy },
        danger && { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.red },
        disabled && !outline && !ghost && { backgroundColor: '#E2E8F0' },
        disabled && (outline || ghost) && { opacity: 0.5 },
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
export function ListRow({ icon, iconColor = C.navy, iconBg = C.sky, title, subtitle, right, onPress, first, danger }) {
  const Wrap = onPress ? Pressable : View; // a non-pressable row must not swallow taps meant for buttons inside it
  return (
    <Wrap onPress={onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={onPress ? ({ pressed }) => [s.listRow, !first && s.listRowBorder, pressed && { backgroundColor: '#F8FAFC' }] : [s.listRow, !first && s.listRowBorder]}>
      {icon ? <View style={[s.listIcon, { backgroundColor: iconBg }]}><Icon name={icon} size={18} color={iconColor} /></View> : null}
      <View style={{ flex: 1 }}>
        <Text style={[s.listTitle, danger && { color: C.red }]}>{title}</Text>
        {subtitle ? <Text style={s.listSub} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right !== undefined ? right : onPress ? <Icon name="chevron" size={18} color={C.chevron} /> : null}
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
          <Pressable key={t.key} onPress={() => onChange(t.key)} style={[s.tab, on && { borderBottomColor: dark ? C.amber : C.navy }]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            {t.icon ? <Icon name={t.icon} size={16} color={on ? (dark ? '#fff' : C.navy) : dark ? '#C9D4E5' : C.sub} /> : null}
            <Text numberOfLines={1} style={[s.tabText, { color: on ? (dark ? '#fff' : C.navy) : dark ? '#C9D4E5' : C.sub }]}>{t.label}</Text>
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
  if (count === 0) return <Text style={{ color: C.amberDark, fontWeight: '700' }}>New</Text>;
  return (
    <Text style={{ color: C.text, fontWeight: '600' }}>
      <Text style={{ color: C.amber }}>★ </Text>
      {rating.toFixed(1)}
      {count != null ? <Text style={{ color: C.sub, fontWeight: '400' }}> ({count})</Text> : null}
    </Text>
  );
}

export function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, prefix, autoCapitalize, autoCorrect, editable = true }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={[s.inputWrap, multiline && { alignItems: 'flex-start' }, !editable && { backgroundColor: '#EEF1F5' }]}>
        {prefix ? <Text style={s.prefix}>{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.placeholder}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          multiline={multiline}
          editable={editable}
          accessibilityLabel={label || placeholder}
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
    <Pressable onPress={() => onValueChange(!value)} style={s.toggle} accessibilityRole="switch" accessibilityState={{ checked: !!value }} accessibilityLabel={label}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: C.text, fontWeight: '600' }}>{label}</Text>
        {hint ? <Text style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: C.navy, false: '#CBD5E1' }} ios_backgroundColor="#CBD5E1" importantForAccessibility="no" />
    </Pressable>
  );
}

export function Stepper({ label, value, onChange, step = 0.5, min = 0, unit = 'hr' }) {
  return (
    <View style={s.stepper}>
      <Text style={{ flex: 1, color: C.text, fontWeight: '600' }}>{label}</Text>
      <Pressable style={s.stepBtn} accessibilityRole="button" accessibilityLabel={`Less ${label || ''}`} hitSlop={4} onPress={() => onChange(Math.max(min, +(value - step).toFixed(1)))}>
        <Text style={s.stepBtnText}>−</Text>
      </Pressable>
      <Text style={s.stepValue}>
        {value} {unit}
      </Text>
      <Pressable style={s.stepBtn} accessibilityRole="button" accessibilityLabel={`More ${label || ''}`} hitSlop={4} onPress={() => onChange(+(value + step).toFixed(1))}>
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
  'Flying club': ['#0B6E4F', '#DDF3E8'],
  'Flight school': ['#1D4ED8', '#E8F1FF'],
  'Rental fleet': ['#B45309', '#FEF3C7'],
  Leaseback: ['#0891B2', '#E0F7FA'],
};
export function OwnerBadge({ type }) {
  // One neutral tag style: color is reserved for status (green good, amber attention, red blocked).
  return <Tag label={type} color={C.text} bg={C.sky} />;
}

export function VerifiedBadge({ role }) {
  return (
    <View style={[s.tag, { backgroundColor: C.greenBg, flexDirection: 'row', alignItems: 'center', marginBottom: 0 }]}>
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
      {r.reply ? <View style={{ marginTop: 8, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: C.line }}><Text style={{ color: C.sub, fontSize: 12, fontWeight: '700' }}>Reply</Text><Text style={{ color: C.text, lineHeight: 20 }}>{r.reply}</Text></View> : null}
    </View>
  );
}

export function StarPicker({ value, onChange, size = 34 }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={6} style={{ marginRight: 6 }} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} accessibilityState={{ selected: n <= value }}>
          <Icon name="star" size={size} color={n <= value ? C.amberDark : C.chevron} fill={n <= value ? C.amber : '#fff'} strokeWidth={1.5} />
        </Pressable>
      ))}
    </View>
  );
}

export const s = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 14, padding: 14, marginBottom: 12 },
  iconBtn: { width: HIT, height: HIT, borderRadius: HIT / 2, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, minHeight: 56 },
  listRowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  listIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  listTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  listSub: { fontSize: 13, color: C.sub, marginTop: 2, lineHeight: 17 },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24, maxWidth: 480, alignSelf: 'center', width: '100%' },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D7DEE8', alignSelf: 'center', marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: C.text },
  sheetFoot: { paddingHorizontal: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabText: { fontWeight: '800', fontSize: 14, marginLeft: 5 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  thumb: { borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  thumbLabel: { color: '#fff', fontSize: 10, fontWeight: '700', marginTop: -2 },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#fff',
    marginRight: 8,
    marginBottom: 8,
  },
  chipSmall: { paddingHorizontal: 13, paddingVertical: 8 },
  chipText: { color: C.text, fontWeight: '600', fontSize: 14 },
  tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, marginRight: 6, marginBottom: 6 },
  tagText: { fontSize: 12, fontWeight: '700' },
  btn: { backgroundColor: C.amber, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  btnText: { color: C.navy, fontWeight: '800', fontSize: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  section: { fontSize: 19, fontWeight: '800', color: C.text, letterSpacing: -0.2 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  statValue: { fontSize: 18, fontWeight: '800', color: C.navy },
  statLabel: { fontSize: 12, color: C.sub, marginTop: 2, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  rowLabel: { color: C.sub, flex: 1, paddingRight: 8 },
  rowValue: { color: C.text, fontWeight: '600', textAlign: 'right' },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  prefix: { color: C.sub, fontWeight: '700', marginRight: 4 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: C.text },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginBottom: 6, minHeight: 48 },
  stepper: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  stepBtn: { width: HIT, height: HIT, borderRadius: HIT / 2, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.chevron, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: C.navy, fontSize: 22, fontWeight: '800' },
  stepValue: { width: 70, textAlign: 'center', fontWeight: '700', color: C.text },
});
