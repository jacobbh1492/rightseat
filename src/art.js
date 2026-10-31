import React, { useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Ellipse, Line, Circle, G, Text as SvgText } from 'react-native-svg';

// Side-profile illustration used when a listing has no uploaded photos yet.
// kind: highwing | lowwing | twin | cub | cirrus
export function AircraftArt({ kind = 'highwing', color = '#1F6FEB', tail = '', height = 200, scene = 'ramp' }) {
  const tailDragger = kind === 'cub';
  const low = kind === 'lowwing' || kind === 'twin' || kind === 'cirrus';
  const body = kind === 'cub' ? '#F5C518' : '#FFFFFF';
  const stripe = kind === 'cub' ? '#111827' : color;
  const sky = scene === 'sky' ? ['#5AA9F0', '#CDE7FF'] : ['#9ED0F7', '#EAF5FF'];

  const fuselage = kind === 'cirrus'
    ? 'M44 98 C52 78 86 70 118 68 L170 68 C200 70 230 80 262 88 L268 98 C230 104 160 110 110 110 C80 110 52 106 44 98 Z'
    : kind === 'cub'
      ? 'M46 96 C50 82 64 74 96 70 L160 68 C190 72 230 84 266 92 L268 100 C230 104 150 110 110 110 C80 110 54 106 46 96 Z'
      : 'M42 96 C46 82 70 74 100 70 L120 60 L166 60 L180 70 C210 74 236 82 264 88 L268 98 C236 104 160 110 110 110 C80 110 50 106 42 96 Z';

  return (
    <Svg width="100%" height={height} viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={sky[0]} />
          <Stop offset="1" stopColor={sky[1]} />
        </LinearGradient>
        <LinearGradient id="body" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={body} />
          <Stop offset="1" stopColor={kind === 'cub' ? '#D9A90F' : '#DCE3EC'} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="320" height="160" fill="url(#sky)" />
      <Ellipse cx="60" cy="30" rx="34" ry="9" fill="#fff" opacity="0.7" />
      <Ellipse cx="250" cy="22" rx="28" ry="7" fill="#fff" opacity="0.6" />
      {scene === 'ramp' && (
        <G>
          <Rect x="0" y="128" width="320" height="32" fill="#8A9099" />
          <Rect x="0" y="126" width="320" height="3" fill="#6B7280" />
          <Line x1="0" y1="146" x2="320" y2="146" stroke="#F5C518" strokeWidth="2" strokeDasharray="16 10" />
        </G>
      )}
      <G transform={tailDragger && scene === 'ramp' ? 'rotate(-7 160 110)' : undefined}>
        {/* gear */}
        {scene === 'ramp' && (tailDragger ? (
          <G>
            <Line x1="92" y1="108" x2="82" y2="128" stroke="#374151" strokeWidth="3" />
            <Circle cx="82" cy="130" r="8" fill="#1F2937" />
            <Circle cx="264" cy="102" r="3.5" fill="#1F2937" />
          </G>
        ) : (
          <G>
            <Line x1="70" y1="106" x2="70" y2="124" stroke="#374151" strokeWidth="3" />
            <Circle cx="70" cy="126" r="6" fill="#1F2937" />
            <Line x1="138" y1="108" x2="146" y2="124" stroke="#374151" strokeWidth="3" />
            <Circle cx="146" cy="126" r="7" fill="#1F2937" />
          </G>
        ))}
        {/* horizontal stab */}
        {kind === 'twin'
          ? <Path d="M246 42 L296 40 L298 45 L248 47 Z" fill={stripe} />
          : <Path d="M238 92 L292 90 L294 95 L240 97 Z" fill={stripe} />}
        {/* vertical fin */}
        <Path d={kind === 'cirrus' ? 'M228 86 L262 48 L282 48 L272 94 Z' : 'M232 86 L258 42 L280 42 L272 94 Z'} fill={kind === 'cub' ? body : '#fff'} stroke="#B8C2CF" strokeWidth="1" />
        <Path d="M262 50 L279 50 L276 62 L256 62 Z" fill={stripe} />
        {/* fuselage */}
        <Path d={fuselage} fill="url(#body)" stroke="#B8C2CF" strokeWidth="1" />
        {/* cheat line */}
        <Path d="M50 98 C90 104 180 102 266 94 L267 97 C180 106 90 108 52 102 Z" fill={stripe} />
        {/* windows */}
        {kind === 'cirrus' ? (
          <Path d="M86 76 C100 70 120 68 140 68 L176 70 L182 82 L92 84 Z" fill="#23384F" />
        ) : kind === 'cub' ? (
          <Path d="M98 74 L150 71 L150 86 L96 88 Z" fill="#23384F" />
        ) : (
          <G>
            <Path d="M100 72 L122 62 L124 84 L94 86 Z" fill="#23384F" />
            <Path d="M128 62 L162 62 L166 84 L130 84 Z" fill="#23384F" />
            <Path d="M170 70 L184 72 L186 84 L170 84 Z" fill="#23384F" />
          </G>
        )}
        {/* wing (edge-on) */}
        {low ? (
          <Ellipse cx="128" cy="106" rx="46" ry="5" fill={kind === 'cub' ? body : '#EEF2F6'} stroke="#B8C2CF" />
        ) : (
          <G>
            <Ellipse cx="140" cy={kind === 'cub' ? 68 : 59} rx="48" ry="5" fill={kind === 'cub' ? body : '#EEF2F6'} stroke="#B8C2CF" />
            <Line x1="150" y1={kind === 'cub' ? 70 : 62} x2="122" y2="104" stroke="#8B95A3" strokeWidth="2" />
          </G>
        )}
        {/* twin nacelle + prop */}
        {kind === 'twin' && (
          <G>
            <Path d="M74 100 C78 94 120 94 126 100 L126 108 C120 112 80 112 74 106 Z" fill="#fff" stroke="#B8C2CF" />
            <Ellipse cx="70" cy="103" rx="2.5" ry="20" fill="#374151" opacity="0.35" />
          </G>
        )}
        {/* spinner + prop */}
        <Path d="M42 96 C36 94 34 90 40 88 Z" fill={stripe} />
        <Ellipse cx="38" cy="92" rx="3" ry={kind === 'cub' ? 24 : 28} fill="#374151" opacity="0.3" />
        {/* tail number */}
        <SvgText x="206" y="92" fontSize="9" fontWeight="bold" fill={kind === 'cub' ? '#111827' : '#334155'}>{tail}</SvgText>
      </G>
    </Svg>
  );
}

// Swipeable gallery: uploaded photos first, then an illustration fallback.
export function PlaneGallery({ plane, height = 220 }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 480);
  const [i, setI] = useState(0);
  const items = [
    ...(plane.photos || []).map((uri) => ({ type: 'photo', uri })),
    ...((plane.photos || []).length ? [] : [{ type: 'art', scene: 'ramp' }, { type: 'art', scene: 'sky' }]),
  ];
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / w))}
        scrollEventThrottle={32}
      >
        {items.map((it, k) => (
          <View key={k} style={{ width: w, height }}>
            {it.type === 'photo' ? (
              <Image source={{ uri: it.uri }} style={{ width: w, height }} resizeMode="cover" />
            ) : (
              <AircraftArt kind={plane.art} color={plane.color} tail={plane.tail} height={height} scene={it.scene} />
            )}
          </View>
        ))}
      </ScrollView>
      <View style={g.dots}>
        {items.map((_, k) => <View key={k} style={[g.dot, k === i && g.dotOn]} />)}
      </View>
      <View style={g.count}>
        <Text style={g.countText}>
          {(plane.photos || []).length ? `${i + 1}/${items.length} photos` : 'Owner photos coming soon'}
        </Text>
      </View>
    </View>
  );
}

// Small rounded thumbnail for list cards.
export function PlaneImage({ plane, size = 60, style }) {
  const uri = plane.photos && plane.photos[0];
  return (
    <View style={[{ width: size, height: size, borderRadius: 14, overflow: 'hidden', backgroundColor: '#EAF5FF' }, style]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      ) : (
        <AircraftArt kind={plane.art} color={plane.color} tail="" height={size} />
      )}
    </View>
  );
}

export function PhotoStrip({ photos, onRemove }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
      {photos.map((uri, k) => (
        <View key={uri + k} style={{ marginRight: 8 }}>
          <Image source={{ uri }} style={{ width: 92, height: 92, borderRadius: 12 }} />
          {k === 0 && <Text style={g.cover}>Cover</Text>}
          <Pressable onPress={() => onRemove(k)} style={g.remove} hitSlop={8}>
            <Text style={{ color: '#fff', fontWeight: '900' }}>×</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const g = StyleSheet.create({
  dots: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.6)', marginHorizontal: 3 },
  dotOn: { backgroundColor: '#fff', width: 18 },
  count: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(11,31,58,0.65)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  countText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cover: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(11,31,58,0.75)', color: '#fff', fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
});
