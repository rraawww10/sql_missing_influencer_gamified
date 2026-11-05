// Floating particles in the background, different for every episode: dusk embers, rain, coins, signal rings, heartbeats,
// neon dots, stadium confetti… Pure CSS (noir.css .particles), off with reduced motion, never steals clicks.
import { useMemo } from 'react';

const KIND: Record<number, { glyphs: string[]; n: number; mode: 'float' | 'fall' | 'rise' | 'pulse' }> = {
  1: { glyphs: ['•'], n: 18, mode: 'rise' },            // embers of a dusk city
  2: { glyphs: ['▪', '▫'], n: 14, mode: 'float' },      // dust over files
  3: { glyphs: ['╎'], n: 34, mode: 'fall' },            // rain
  4: { glyphs: ['•'], n: 16, mode: 'float' },           // headlights bokeh
  5: { glyphs: ['₹', '•'], n: 16, mode: 'rise' },       // money
  6: { glyphs: ['◌', '○'], n: 12, mode: 'pulse' },      // signal rings
  7: { glyphs: ['♥', '•'], n: 12, mode: 'pulse' },      // heartbeat
  8: { glyphs: ['•'], n: 14, mode: 'float' },           // spotlight dust
  9: { glyphs: ['✕', '•'], n: 14, mode: 'float' },      // pins
  10: { glyphs: ['•', '◦'], n: 22, mode: 'pulse' },     // network nodes
  11: { glyphs: ['╎'], n: 26, mode: 'fall' },           // highway rain
  12: { glyphs: ['0', '1'], n: 22, mode: 'fall' },      // logs
  13: { glyphs: ['✦', '•', '▴'], n: 26, mode: 'rise' }, // stadium sparkle
};

export function Particles({ session }: { session: number }) {
  const k = KIND[session] ?? KIND[1];
  const bits = useMemo(() => Array.from({ length: k.n }, (_, i) => ({
    g: k.glyphs[i % k.glyphs.length],
    x: `${(i * 61 + 7) % 100}%`, y: `${(i * 37 + 13) % 100}%`,
    d: `${(k.mode === 'fall' ? 1.2 : 7) + ((i * 7) % 9) * (k.mode === 'fall' ? 0.15 : 0.9)}s`,
    delay: `-${((i * 13) % 17) * 0.6}s`, s: 0.6 + ((i * 5) % 7) / 8,
  })), [session]);
  return (
    <div className={`particles p-${k.mode}`} aria-hidden="true">
      {bits.map((b, i) => <i key={i} style={{ left: b.x, top: b.y, animationDuration: b.d, animationDelay: b.delay, fontSize: `${b.s}em` } as React.CSSProperties}>{b.g}</i>)}
    </div>
  );
}
