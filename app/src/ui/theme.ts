// One look per session. The story runs from 6 PM to midnight, so the sky darkens session by session —
// dusk orange → violet → navy → midnight — and each stage gets an accent colour that fits what happens in it.
// Motifs hint at the stage without giving away the answer.
export interface SessionTheme {
  sky: [string, string];   // top → bottom
  accent: string;          // buttons, highlights
  onAccent: string;        // text on accent (contrast-checked)
  glow: string;            // lights in the art
  motif: string;           // which illustration (see art/SceneArt.tsx)
  alt: string;             // what the art shows (no spoilers)
}

export const THEMES: Record<number, SessionTheme> = {
  1: { sky: ['#ff9a5a', '#5b3d8f'], accent: '#e8590c', onAccent: '#ffffff', glow: '#ffd8a8', motif: 'alert', alt: 'A phone lights up with breaking news over the city at dusk' },
  2: { sky: ['#f6795a', '#4a3a8a'], accent: '#d6336c', onAccent: '#ffffff', glow: '#ffc9c9', motif: 'casefile', alt: 'An open case file and a notebook on a desk' },
  3: { sky: ['#e0627a', '#3b3784'], accent: '#c2255c', onAccent: '#ffffff', glow: '#fcc2d7', motif: 'gate', alt: 'A hotel at night with a gate barrier' },
  4: { sky: ['#b85c9e', '#2f3478'], accent: '#f59f00', onAccent: '#1b1f2a', glow: '#ffe066', motif: 'cab', alt: 'A yellow cab waiting under streetlights' },
  5: { sky: ['#8d5bb4', '#28306e'], accent: '#0ca678', onAccent: '#ffffff', glow: '#96f2d7', motif: 'money', alt: 'A phone with coins floating around it' },
  6: { sky: ['#6b58c4', '#222a66'], accent: '#1c7ed6', onAccent: '#ffffff', glow: '#a5d8ff', motif: 'towers', alt: 'Phone towers sending signals across the night' },
  7: { sky: ['#5155c8', '#1d245c'], accent: '#e03131', onAccent: '#ffffff', glow: '#ffa8a8', motif: 'watch', alt: 'A smartwatch showing a heartbeat line' },
  8: { sky: ['#3f4fc0', '#1a2052'], accent: '#f08c00', onAccent: '#1b1f2a', glow: '#ffe8a3', motif: 'lineup', alt: 'Five silhouettes standing under spotlights' },
  9: { sky: ['#3446ad', '#171c48'], accent: '#c92a2a', onAccent: '#ffffff', glow: '#ffc9c9', motif: 'board', alt: 'A cork board with pinned cards and red strings' },
  10: { sky: ['#2c3d98', '#141940'], accent: '#099268', onAccent: '#ffffff', glow: '#63e6be', motif: 'network', alt: 'Glowing dots connected by lines' },
  11: { sky: ['#253482', '#11163a'], accent: '#e67700', onAccent: '#1b1f2a', glow: '#ffd43b', motif: 'toll', alt: 'A highway toll booth with headlights in the dark' },
  12: { sky: ['#1f2b6e', '#0e1233'], accent: '#7048e8', onAccent: '#ffffff', glow: '#d0bfff', motif: 'document', alt: 'A document with blacked-out lines under a magnifying glass' },
  13: { sky: ['#2a0f4f', '#0b0820'], accent: '#d6336c', onAccent: '#ffffff', glow: '#faa2c1', motif: 'stage', alt: 'A concert stage with spotlights and a crowd' },
};

export const themeOf = (session: number): SessionTheme => THEMES[session] ?? THEMES[1];

// CSS custom properties for a session (set on a wrapper element)
export function themeVars(session: number): Record<string, string> {
  const t = themeOf(session);
  return { '--accent': t.accent, '--on-accent': t.onAccent, '--sky1': t.sky[0], '--sky2': t.sky[1], '--glow': t.glow };
}
