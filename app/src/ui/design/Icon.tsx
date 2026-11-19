// The game's own icon set ("Arcade Night", 2026-11-18): chunky sticker-style drawings with an ink outline and flat fills,
// replacing the emoji that used to stand in for icons. One 24x24 grid, one outline weight, one palette (design/base.css).
// <Icon name="clue" /> is decorative by default (aria-hidden); pass `label` when the icon is the only content of a control.
import type { ReactNode } from 'react';

const SUN = '#ffd43b', PINK = '#ff4d8d', MINT = '#19d39a', SKY = '#38bdf8', RED = '#ff5a5f', NIGHT = '#15123a', WHITE = '#ffffff', CREAM = '#fff6d6';
const L = 'var(--ico-line, currentColor)';   // the outline follows the text colour around it (ink on cards, white on colour)
const none = { fill: 'none' } as const;

const ICONS = {
  // ----- kinds of step -----
  story: <><path d="M11 8h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-.5v3L15 17h-4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z" fill={WHITE} /><path d="M5 3h8a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H8.5L5 14v-3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill={PINK} /></>,
  scroll: <><path d="M6 5h12v14H6z" fill={CREAM} /><rect x="3.5" y="3" width="17" height="4" rx="2" fill={SUN} /><rect x="3.5" y="17" width="17" height="4" rx="2" fill={SUN} /><path d="M9 10.2h6M9 13.6h4" {...none} /></>,
  code: <><rect x="2.5" y="4" width="19" height="16" rx="3" fill={NIGHT} /><path d="M7 9.5l3.2 2.5L7 14.5" stroke={MINT} {...none} /><path d="M12.5 15H17" stroke={SUN} {...none} /></>,
  clue: <><path d="M15.2 15.2L21 21" stroke={L} strokeWidth="5.4" /><path d="M15.6 15.6L20.6 20.6" stroke={SUN} strokeWidth="2.6" /><circle cx="10.5" cy="10.5" r="6.8" fill={SKY} /><path d="M7.6 9.6a3.2 3.2 0 0 1 2.6-2.4" stroke={WHITE} {...none} /></>,
  check: <><circle cx="12" cy="12" r="9.5" fill={SUN} /><path d="M9.2 9.3a2.9 2.9 0 1 1 4.4 2.5c-1 .6-1.6 1.1-1.6 2.2" {...none} strokeWidth="2.2" /><circle cx="12" cy="17.3" r="1.2" fill={L} stroke="none" /></>,
  puzzle: <path d="M4 9h4.3a2.2 2.2 0 1 1 4.4 0H17v3.8a2.2 2.2 0 1 1 0 4.4V21H4z" fill={MINT} />,
  bolt: <path d="M13.2 2L4.5 13.4h6L9.8 22l8.7-11.6h-6z" fill={SUN} />,
  film: <><rect x="3" y="9.5" width="18" height="11" rx="2.2" fill={NIGHT} /><path d="M3.2 9.4l.2-3.2 16.6-3 .8 3.2z" fill={WHITE} /><path d="M8 5.4l1.2 3M12.6 4.6l1.2 3M17.2 3.8l1.2 3" {...none} /><path d="M10.2 13v4l3.6-2z" fill={SUN} stroke="none" /></>,
  // ----- tools -----
  db: <><path d="M4 6.5v11c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-11" fill={SKY} /><ellipse cx="12" cy="6.5" rx="8" ry="3.5" fill="#c9edff" /><path d="M4 12c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5" {...none} /></>,
  pin: <><path d="M12 13.5V21" {...none} strokeWidth="2.2" /><path d="M8.2 3h7.6l-1.1 5 2.7 3.4c.5.7 0 1.6-.8 1.6H7.4c-.8 0-1.3-.9-.8-1.6L9.3 8z" fill={RED} /></>,
  reset: <><path d="M19.4 12.4a7.4 7.4 0 1 1-2.4-5.9" {...none} strokeWidth="2.3" /><path d="M17.6 2.6v4.3h-4.3" {...none} strokeWidth="2.3" /></>,
  sound: <><path d="M3.5 9.5H7l4.8-4v13L7 14.5H3.5z" fill={WHITE} /><path d="M15.2 9.2a4 4 0 0 1 0 5.6M17.8 6.6a7.6 7.6 0 0 1 0 10.8" {...none} /></>,
  mute: <><path d="M3.5 9.5H7l4.8-4v13L7 14.5H3.5z" fill={WHITE} /><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" {...none} strokeWidth="2.2" /></>,
  mic: <><rect x="9" y="2.8" width="6" height="11" rx="3" fill={PINK} /><path d="M6 11.2a6 6 0 0 0 12 0M12 17.4V21M8.8 21h6.4" {...none} /></>,
  'mic-off': <><rect x="9" y="2.8" width="6" height="11" rx="3" fill="#d9d4ee" /><path d="M6 11.2a6 6 0 0 0 12 0M12 17.4V21M8.8 21h6.4" {...none} /><path d="M4 3.5l16 17" {...none} strokeWidth="2.2" /></>,
  envelope: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" fill={SUN} /><path d="M3.8 7.2l8.2 5.6 8.2-5.6" {...none} /><circle cx="12" cy="14.2" r="2.1" fill={PINK} /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" fill={WHITE} /><path d="M3.8 7.2l8.2 5.6 8.2-5.6" {...none} /></>,
  lock: <><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" {...none} strokeWidth="2.2" /><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill={SUN} /><circle cx="12" cy="15.4" r="1.4" fill={L} stroke="none" /></>,
  key: <><circle cx="8" cy="8.5" r="4.5" fill={SUN} /><path d="M11.3 11.8L20 20.5M16.5 17l2.3-2.3M14 14.5l1.8-1.8" {...none} strokeWidth="2.2" /></>,
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" {...none} strokeWidth="2.2" />,
  list: <><path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" {...none} strokeWidth="2.2" /><circle cx="5" cy="6.5" r="1.6" fill={SUN} /><circle cx="5" cy="12" r="1.6" fill={PINK} /><circle cx="5" cy="17.5" r="1.6" fill={MINT} /></>,
  // ----- arrows and marks -----
  left: <path d="M14.5 5.5L8 12l6.5 6.5" {...none} strokeWidth="2.8" />,
  right: <path d="M9.5 5.5L16 12l-6.5 6.5" {...none} strokeWidth="2.8" />,
  up: <path d="M5.5 14.5L12 8l6.5 6.5" {...none} strokeWidth="2.8" />,
  down: <path d="M5.5 9.5L12 16l6.5-6.5" {...none} strokeWidth="2.8" />,
  close: <path d="M6 6l12 12M18 6L6 18" {...none} strokeWidth="2.8" />,
  tick: <path d="M4.8 12.6l4.6 4.6L19.2 7.2" {...none} strokeWidth="3" />,
  play: <path d="M7 4.5v15l12-7.5z" fill={WHITE} />,
  send: <path d="M3.2 11.2L20.8 3.6l-5 17-3.6-6.8z" fill={WHITE} />,
  warn: <><path d="M12 3.2l9.4 16.6H2.6z" fill={SUN} /><path d="M12 9.5v4.6" {...none} strokeWidth="2.2" /><circle cx="12" cy="16.9" r="1.1" fill={L} stroke="none" /></>,
  error: <><circle cx="12" cy="12" r="9.5" fill={RED} /><path d="M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8" stroke={WHITE} {...none} strokeWidth="2.4" /></>,
  ok: <><circle cx="12" cy="12" r="9.5" fill={MINT} /><path d="M7.4 12.4l3.2 3.2 6-6.4" stroke={WHITE} {...none} strokeWidth="2.6" /></>,
  // ----- story and status -----
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.8 1.5H4.2z" fill={SUN} /><path d="M10 20.5a2 2 0 0 0 4 0" {...none} /><circle cx="17.5" cy="6" r="2.6" fill={RED} /></>,
  clock: <><circle cx="12" cy="12" r="9.5" fill={WHITE} /><path d="M12 6.8V12l3.6 2.2" {...none} strokeWidth="2.2" /></>,
  user: <><circle cx="12" cy="8" r="4.3" fill={WHITE} /><path d="M4 20.5a8 8 0 0 1 16 0z" fill={PINK} /></>,
  people: <><circle cx="8.5" cy="8.5" r="3.6" fill={WHITE} /><path d="M2 20a6.5 6.5 0 0 1 13 0z" fill={SKY} /><circle cx="16.8" cy="9.5" r="3" fill={WHITE} /><path d="M12.8 20a5.2 5.2 0 0 1 9.4-2.8V20z" fill={PINK} /></>,
  save: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H16l4 4v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" fill={SKY} /><rect x="7.5" y="4" width="7" height="5" fill={WHITE} /><rect x="7" y="13" width="10" height="7" rx="1" fill={WHITE} /></>,
  bulb: <><path d="M12 2.8a6.5 6.5 0 0 0-3.8 11.8c.6.5.9 1.1.9 1.9h5.8c0-.8.3-1.4.9-1.9A6.5 6.5 0 0 0 12 2.8z" fill={SUN} /><path d="M9.6 19h4.8M10.4 21.4h3.2" {...none} strokeWidth="2.2" /></>,
  target: <><circle cx="12" cy="12" r="9.5" fill={WHITE} /><circle cx="12" cy="12" r="5.6" fill={RED} /><circle cx="12" cy="12" r="1.9" fill={WHITE} /></>,
  chat: <><path d="M5.5 4h13A2.5 2.5 0 0 1 21 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-5 4v-4h-.5A2.5 2.5 0 0 1 3 13.5v-7A2.5 2.5 0 0 1 5.5 4z" fill={WHITE} /><circle cx="8.4" cy="10" r="1.2" fill={L} stroke="none" /><circle cx="12" cy="10" r="1.2" fill={L} stroke="none" /><circle cx="15.6" cy="10" r="1.2" fill={L} stroke="none" /></>,
  spark: <path d="M12 2.5l2.2 7.3 7.3 2.2-7.3 2.2L12 21.5l-2.2-7.3L2.5 12l7.3-2.2z" fill={SUN} />,
  map: <><path d="M3 6.2l6-2.6 6 2.6 6-2.6v14.2l-6 2.6-6-2.6-6 2.6z" fill={MINT} /><path d="M9 3.6v14.2M15 6.2v14.2" {...none} /></>,
  flag: <><path d="M5.5 21V3.5" {...none} strokeWidth="2.4" /><path d="M5.5 4.5h12.8l-3 4 3 4H5.5z" fill={PINK} /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill={WHITE} /><circle cx="12" cy="12" r="3.3" fill={SKY} /></>,
  // ----- rewards and ranks -----
  star: <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.4l-5.8 3 1.1-6.4-4.7-4.6 6.5-.9z" fill={SUN} />,
  trophy: <><path d="M7.2 5.6H4.4v1.2a3.4 3.4 0 0 0 3.2 3.4M16.8 5.6h2.8v1.2a3.4 3.4 0 0 1-3.2 3.4" {...none} /><path d="M7 3.8h10v5.4a5 5 0 0 1-10 0z" fill={SUN} /><path d="M12 14.2V17" {...none} strokeWidth="2.2" /><rect x="8" y="17" width="8" height="3.6" rx="1.2" fill={PINK} /></>,
  cap: <><path d="M12 4.2L1.8 9.2 12 14.2l10.2-5z" fill={SKY} /><path d="M6.2 11.6v4.2c0 1.2 2.6 2.4 5.8 2.4s5.8-1.2 5.8-2.4v-4.2" fill={WHITE} /><path d="M21 9.6v5.2" {...none} strokeWidth="2.2" /></>,
  shield: <><path d="M12 2.6l8 2.8v6.2c0 4.6-3.2 8.2-8 9.8-4.8-1.6-8-5.2-8-9.8V5.4z" fill={SKY} /><path d="M8.4 11.8l2.6 2.6 4.8-5" stroke={WHITE} {...none} strokeWidth="2.4" /></>,
  medal: <><path d="M7.6 2.8h3.2l1.2 5.4M16.4 2.8h-3.2L12 8.2" fill={PINK} /><circle cx="12" cy="14.5" r="6.3" fill={SUN} /><path d="M12 11.2l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill={WHITE} strokeWidth="1.2" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, label, className = '' }: { name: IconName; label?: string; className?: string }) {
  return (
    <svg className={`ico ${className}`} viewBox="0 0 24 24" stroke={L} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      {ICONS[name]}
    </svg>
  );
}

// Feedback faces (the episode feedback card and the chapter check-in)
export type FaceMood = 'love' | 'happy' | 'good' | 'ok' | 'confused' | 'sleepy';
const FACES: Record<FaceMood, ReactNode> = {
  love: <><path d="M8.2 7.6l.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2zM15.8 7.6l.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2z" fill={PINK} strokeWidth="1" /><path d="M7.4 14.2a4.9 4.9 0 0 0 9.2 0z" fill={WHITE} /></>,
  happy: <><circle cx="8.6" cy="9.6" r="1.3" fill={L} stroke="none" /><circle cx="15.4" cy="9.6" r="1.3" fill={L} stroke="none" /><path d="M7.4 13.8a4.9 4.9 0 0 0 9.2 0z" fill={WHITE} /></>,
  good: <><circle cx="8.6" cy="9.8" r="1.3" fill={L} stroke="none" /><circle cx="15.4" cy="9.8" r="1.3" fill={L} stroke="none" /><path d="M8 14.4a5 5 0 0 0 8 0" {...none} strokeWidth="2" /></>,
  ok: <><circle cx="8.6" cy="9.8" r="1.3" fill={L} stroke="none" /><circle cx="15.4" cy="9.8" r="1.3" fill={L} stroke="none" /><path d="M8.4 15h7.2" {...none} strokeWidth="2" /></>,
  confused: <><circle cx="8.6" cy="10.2" r="1.3" fill={L} stroke="none" /><circle cx="15.4" cy="9.4" r="1.3" fill={L} stroke="none" /><path d="M6.6 7.4l3-.6M14 6.2l3.2 1" {...none} /><path d="M8.2 15.6c1.2-1.4 2.4 1.2 3.8 0s2.4-1.4 3.8 0" {...none} strokeWidth="2" /></>,
  sleepy: <><path d="M6.8 10.2c1 .9 2.4.9 3.4 0M13.8 10.2c1 .9 2.4.9 3.4 0" {...none} strokeWidth="2" /><ellipse cx="12" cy="15.6" rx="1.8" ry="2.1" fill={WHITE} /></>,
};
export function Face({ mood, className = '' }: { mood: FaceMood; className?: string }) {
  return (
    <svg className={`ico face ${className}`} viewBox="0 0 24 24" stroke={L} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" fill={SUN} />
      {FACES[mood]}
    </svg>
  );
}
