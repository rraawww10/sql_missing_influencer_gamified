// A burst of confetti (CSS only, no library). Place inside a `position: relative` box, or `rain` for the whole screen.
// Hidden when the learner prefers reduced motion (styles.css).
import { useMemo } from 'react';

const COLORS = ['var(--pop)', 'var(--accent)', 'var(--glow)', '#fff', 'var(--success)'];

export function Confetti({ count = 28, rain = false }: { count?: number; rain?: boolean }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: `${(i * 37 + 11) % 100}%`, dx: `${((i * 53) % 120) - 60}px`, d: `${1.4 + ((i * 7) % 10) / 8}s`, delay: `${((i * 13) % 9) * 50}ms`, c: COLORS[i % COLORS.length],
  })), [count]);
  return (
    <div className={`confetti ${rain ? 'rain' : ''}`} aria-hidden="true">
      {bits.map((b, i) => <i key={i} style={{ '--x': b.x, '--dx': b.dx, '--d': b.d, '--delay': b.delay, '--c': b.c } as React.CSSProperties} />)}
    </div>
  );
}
