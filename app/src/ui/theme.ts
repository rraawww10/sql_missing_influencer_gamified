// One look per session: a bright, distinct animated gradient per episode (2026-11-17 feedback: every episode looked the same).
// One look per session. The story runs from 6 PM to midnight, so the sky darkens session by session - 
// dusk orange → violet → electric blue → neon purple (kept vivid: 2026-11-05 feedback said the old navy was too dark) - and each stage gets an accent colour that fits what happens in it.
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
  1: { sky: ['#ff7a18', '#ff2e88'], accent: '#c2410c', onAccent: '#ffffff', glow: '#ffd8a8', motif: 'alert', alt: 'A phone lights up with breaking news over the city at dusk' },
  2: { sky: ['#00c9a7', '#3a7bd5'], accent: '#d6336c', onAccent: '#ffffff', glow: '#ffc9c9', motif: 'casefile', alt: 'An open case file and a notebook on a desk' },
  3: { sky: ['#ff4e8a', '#8e2de2'], accent: '#c2255c', onAccent: '#ffffff', glow: '#fcc2d7', motif: 'gate', alt: 'A hotel at night with a gate barrier' },
  4: { sky: ['#ffb300', '#ff5e3a'], accent: '#f59f00', onAccent: '#1b1f2a', glow: '#ffe066', motif: 'cab', alt: 'A yellow cab waiting under streetlights' },
  5: { sky: ['#00e08a', '#0072ff'], accent: '#087f5b', onAccent: '#ffffff', glow: '#96f2d7', motif: 'money', alt: 'A phone with coins floating around it' },
  6: { sky: ['#00d2ff', '#7a00ff'], accent: '#1864ab', onAccent: '#ffffff', glow: '#a5d8ff', motif: 'towers', alt: 'Phone towers sending signals across the night' },
  7: { sky: ['#ff416c', '#ff9a44'], accent: '#e03131', onAccent: '#ffffff', glow: '#ffa8a8', motif: 'watch', alt: 'A smartwatch showing a heartbeat line' },
  8: { sky: ['#f7971e', '#c32aa3'], accent: '#f08c00', onAccent: '#1b1f2a', glow: '#ffe8a3', motif: 'lineup', alt: 'Five silhouettes standing under spotlights' },
  9: { sky: ['#e94057', '#8a2387'], accent: '#c92a2a', onAccent: '#ffffff', glow: '#ffc9c9', motif: 'board', alt: 'A cork board with pinned cards and red strings' },
  10: { sky: ['#11e8bb', '#5b5cf0'], accent: '#0b7262', onAccent: '#ffffff', glow: '#63e6be', motif: 'network', alt: 'Glowing dots connected by lines' },
  11: { sky: ['#fc4a1a', '#f7b733'], accent: '#e67700', onAccent: '#1b1f2a', glow: '#ffd43b', motif: 'toll', alt: 'A highway toll booth with headlights in the dark' },
  12: { sky: ['#7f00ff', '#00c6ff'], accent: '#7048e8', onAccent: '#ffffff', glow: '#d0bfff', motif: 'document', alt: 'A document with blacked-out lines under a magnifying glass' },
  13: { sky: ['#ff00cc', '#3333ff'], accent: '#d6336c', onAccent: '#ffffff', glow: '#faa2c1', motif: 'stage', alt: 'A concert stage with spotlights and a crowd' },
};

export const themeOf = (session: number): SessionTheme => THEMES[session] ?? THEMES[1];

// CSS custom properties for a session (set on a wrapper element)
export function themeVars(session: number): Record<string, string> {
  const t = themeOf(session);
  return { '--accent': t.accent, '--on-accent': t.onAccent, '--sky1': t.sky[0], '--sky2': t.sky[1], '--glow': t.glow };
}
