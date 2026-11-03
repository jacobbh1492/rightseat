import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { diagramFor } from './index';

// Draws a lesson's flight-path diagram from the path layers in content.js.
// Layers paint back to front: sky, ground, attitude-indicator earth, runways/fields,
// dashed reference lines, outlines, "ghost" comparison path, the flight path (amber),
// wind, direction arrows, key points, airplanes, then labels.
const AMBER = '#F5A623';
// SVG text falls back to a serif font on web unless one is named; phones use the system font.
const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : undefined;

export default function Diagram({ id, view, caption, alt }) {
  const d = diagramFor(id);
  if (!d) return null;
  const labels = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => d['l' + i]).filter((l) => l && l.t);
  return (
    <View style={st.card} accessible accessibilityRole="image" accessibilityLabel={alt || caption}>
      {!!view && <Text style={st.view}>{view.toUpperCase()}</Text>}
      <View style={{ width: '100%', aspectRatio: 320 / 170 }}>
        <Svg width="100%" height="100%" viewBox="0 0 320 170">
          {!!d.sky && <Path d={d.sky} fill="#2C5D8F" />}
          {!!d.ground && <Path d={d.ground} fill="#1C3A63" />}
          {!!d.brown && <Path d={d.brown} fill="#7A5532" />}
          {!!d.surface && <Path d={d.surface} fill="#3A5682" />}
          {!!d.dash && <Path d={d.dash} fill="none" stroke="#8FA3C4" strokeWidth={1.2} strokeDasharray="4 3" />}
          {!!d.ref && <Path d={d.ref} fill="none" stroke="#9AAACB" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />}
          {!!d.ghost && <Path d={d.ghost} fill="none" stroke={AMBER} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />}
          {!!d.track && <Path d={d.track} fill="none" stroke={AMBER} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
          {!!d.wind && <Path d={d.wind} fill="none" stroke="#8FD0FF" strokeWidth={2} strokeLinecap="round" />}
          {!!d.windHead && <Path d={d.windHead} fill="#8FD0FF" />}
          {!!d.arrows && <Path d={d.arrows} fill={AMBER} />}
          {!!d.dots && <Path d={d.dots} fill="#FFFFFF" />}
          {!!d.planes && <Path d={d.planes} fill="#FFFFFF" stroke="#0B1B33" strokeWidth={0.6} strokeLinejoin="round" />}
          {labels.map((l, i) => (
            <SvgText key={i} x={l.x} y={l.y} textAnchor={l.a} fill={l.c} fontSize={9.5} fontWeight="600" fontFamily={FONT}>{l.t}</SvgText>
          ))}
        </Svg>
      </View>
      {!!caption && <Text style={st.cap}>{caption}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: '#132A4C', borderRadius: 14, padding: 12, paddingBottom: 10, marginTop: 12 },
  view: { color: '#AFC0D9', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  cap: { color: '#DCE4F0', fontSize: 13, lineHeight: 18, marginTop: 6 },
});
