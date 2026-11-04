import React from 'react';
import Svg, { Path, Circle, Rect, Polygon, Line } from 'react-native-svg';

// Lightweight stroke icon set (24x24, 2px stroke). Drawn with react-native-svg so it works on iOS, Android and web
// without font files.
const P = {
  tag: [<Path key="a" d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" />, <Circle key="b" cx="7" cy="7" r="1.5" />],
  search: [<Circle key="a" cx="11" cy="11" r="7" />, <Path key="b" d="M21 21l-4.3-4.3" />],
  explore: [<Circle key="a" cx="12" cy="12" r="10" />, <Polygon key="b" points="16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9" />],
  calendar: [<Rect key="a" x="3" y="4" width="18" height="18" rx="2" />, <Path key="b" d="M16 2v4M8 2v4M3 10h18" />],
  book: [<Path key="a" d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />, <Path key="b" d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />],
  chat: [<Path key="a" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />],
  user: [<Path key="a" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />, <Circle key="b" cx="12" cy="7" r="4" />],
  users: [<Path key="a" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />, <Circle key="b" cx="9" cy="7" r="4" />],
  back: [<Path key="a" d="M15 18l-6-6 6-6" />],
  chevron: [<Path key="a" d="M9 18l6-6-6-6" />],
  down: [<Path key="a" d="M6 9l6 6 6-6" />],
  heart: [<Path key="a" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.2l7.8-7.8 1.1-1.1a5.5 5.5 0 0 0 0-7.7z" />],
  plane: [<Path key="a" d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />],
  filter: [<Path key="a" d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />],
  check: [<Path key="a" d="M20 6L9 17l-5-5" />],
  checkCircle: [<Path key="a" d="M22 11.1V12a10 10 0 1 1-5.9-9.1" />, <Path key="b" d="M22 4L12 14l-3-3" />],
  x: [<Path key="a" d="M18 6L6 18M6 6l12 12" />],
  plus: [<Path key="a" d="M12 5v14M5 12h14" />],
  lock: [<Rect key="a" x="3" y="11" width="18" height="11" rx="2" />, <Path key="b" d="M7 11V7a5 5 0 0 1 10 0v4" />],
  wallet: [<Rect key="a" x="2" y="5" width="20" height="15" rx="2" />, <Path key="b" d="M2 10h20M16 15h2" />],
  shield: [<Path key="a" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />],
  shieldCheck: [<Path key="a" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, <Path key="b" d="M9 12l2 2 4-4" />],
  clock: [<Circle key="a" cx="12" cy="12" r="10" />, <Path key="b" d="M12 6v6l4 2" />],
  pin: [<Path key="a" d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />, <Circle key="b" cx="12" cy="10" r="3" />],
  bell: [<Path key="a" d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />],
  file: [<Path key="a" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />, <Path key="b" d="M14 2v6h6M8 13h8M8 17h5" />],
  school: [<Path key="a" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />],
  tool: [<Path key="a" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z" />],
  chart: [<Path key="a" d="M12 20V10M18 20V4M6 20v-4" />],
  dollar: [<Path key="a" d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />],
  send: [<Path key="a" d="M12 19V5M5 12l7-7 7 7" />],
  zap: [<Path key="a" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />],
  edit: [<Path key="a" d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />],
  star: [<Polygon key="a" points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" />],
  info: [<Circle key="a" cx="12" cy="12" r="10" />, <Path key="b" d="M12 16v-4M12 8h.01" />],
  logout: [<Path key="a" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />],
  sparkle: [<Path key="a" d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />, <Path key="b" d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z" />],
  grad: [<Path key="a" d="M22 10L12 5 2 10l10 5 10-5z" />, <Path key="b" d="M6 12v5c3 2 9 2 12 0v-5" />],
  key: [<Circle key="a" cx="7.5" cy="15.5" r="4.5" />, <Path key="b" d="M10.7 12.3L21 2M17 6l3 3M14 9l2 2" />],
};

export function Icon({ name, size = 22, color = '#0F172A', fill = 'none', strokeWidth = 2 }) {
  const shapes = P[name] || P.info;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {shapes}
    </Svg>
  );
}
