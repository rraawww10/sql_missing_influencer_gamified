// Kaal speaking on a page (episode intro, briefing, solved screen): the figure + a line that types itself out.
import { useEffect, useState } from 'react';
import { Kaal } from './Kaal';
import type { KaalMood } from './lines';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function TypeLine({ text, speed = 22 }: { text: string; speed?: number }) {
  const [n, setN] = useState(reduced() ? text.length : 0);
  useEffect(() => {
    if (reduced()) { setN(text.length); return; }
    setN(0);
    const t = setInterval(() => setN((k) => { if (k >= text.length) { clearInterval(t); return k; } return k + 1; }), speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return <span aria-label={text}><span aria-hidden="true">{text.slice(0, n)}</span>{n < text.length && <span className="caret" aria-hidden="true" />}</span>;
}

export function KaalCard({ line, mood = 'whisper', title = 'Inspector Kaal', size = 84 }: { line: string; mood?: KaalMood; title?: string; size?: number }) {
  return (
    <section className="kaal-card pop-in" aria-label={`${title} says`}>
      <Kaal mood={mood} size={size} />
      <div className="say"><b>{title}</b><TypeLine text={line} /></div>
    </section>
  );
}
