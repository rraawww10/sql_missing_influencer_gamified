// Kaal speaking on a page (episode intro, briefing, solved screen): the figure + a line that types itself out.
import { useEffect, useState } from 'react';
import { Kaal, useTalking } from './Kaal';
import type { KaalMood } from './lines';
import { speak } from '../voice';
import { personalize } from '../../adapters/identity';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function TypeLine({ text, speed = 22 }: { text: string; speed?: number }) {
  const [n, setN] = useState(reduced() ? text.length : 0);
  useEffect(() => {
    if (reduced()) { setN(text.length); return; }
    setN(0);
    const t = setInterval(() => setN((k) => { if (k >= text.length) { clearInterval(t); return k; } return k + 1; }), speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return <span aria-label={text}><span aria-hidden="true">{text.slice(0, n)}</span>{n < text.length && <><span className="caret" aria-hidden="true" /><span className="untyped" aria-hidden="true">{text.slice(n)}</span></>}</span>;
}

// `say`: what is spoken when the line on screen carries a number that has no recording (lines.ts SAY)
export function KaalCard({ line: raw, say, mood = 'whisper', title = 'Kaal', size = 84 }: { line: string; say?: string; mood?: KaalMood; title?: string; size?: number }) {
  const line = personalize(raw);
  const talking = useTalking();
  useEffect(() => { const t = setTimeout(() => speak(line, { mood, say: say ? personalize(say) : undefined }), 400); return () => clearTimeout(t); }, [line, mood, say]);
  return (
    <section className="surface kaal-card pop-in" aria-label={`${title} says`}>
      <Kaal mood={mood} size={size} talking={talking} />
      <div className="say"><b>{title}</b><TypeLine text={line} /></div>
    </section>
  );
}
