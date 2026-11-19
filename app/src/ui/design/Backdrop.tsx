// The city at night behind every page: a skyline with lit windows along the bottom and two soft colour blobs.
// Drawn once on a canvas (and again when the window is resized); purely decorative, never takes clicks.
import { useEffect, useRef } from 'react';

function draw(c: HTMLCanvasElement) {
  if (/jsdom/i.test(navigator.userAgent)) return;   // unit tests: jsdom has no canvas
  const w = c.clientWidth || window.innerWidth, h = 240, dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = w * dpr; c.height = h * dpr;
  const x = c.getContext('2d');
  if (!x) return;
  x.scale(dpr, dpr);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let px = 0; px < w;) {
    const bw = 38 + rnd() * 60, bh = 60 + rnd() * 170;
    x.fillStyle = '#15123a';
    x.fillRect(px, h - bh, bw, bh);
    x.fillStyle = '#ffd43b';
    for (let wy = h - bh + 12; wy < h - 12; wy += 18)
      for (let wx = px + 8; wx < px + bw - 10; wx += 14) if (rnd() > 0.55) x.fillRect(wx, wy, 6, 9);
    px += bw + 3;
  }
}

export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    draw(c);
    let t = 0;
    const on = () => { window.clearTimeout(t); t = window.setTimeout(() => draw(c), 150); };
    addEventListener('resize', on);
    return () => { removeEventListener('resize', on); window.clearTimeout(t); };
  }, []);
  return <div className="backdrop" aria-hidden="true"><i /><i /><canvas ref={ref} /></div>;
}
