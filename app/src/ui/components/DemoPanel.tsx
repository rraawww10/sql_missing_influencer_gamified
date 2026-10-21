// Engine demo (Session 12 index demo): runs real SQL in the browser and shows how long each step took.
import { useState } from 'react';
import type { DemoBeat } from '../../content/types';
import type { SessionRunner } from '../../engine/runner/sessionRunner';
import { Markdown } from './Markdown';

export function DemoPanel({ runner, beat, onChanged }: { runner: SessionRunner; beat: DemoBeat; onChanged(): void }) {
  const [busy, setBusy] = useState(false);
  const [times, setTimes] = useState<{ label: string; ms: number }[] | null>(null);
  const run = async () => {
    setBusy(true);
    try { setTimes(await runner.runDemo()); onChanged(); } finally { setBusy(false); }
  };
  const first = times?.[0]?.ms ?? 0, last = times?.at(-1)?.ms ?? 0;
  const max = Math.max(1e-6, ...(times ?? []).map((t) => t.ms));
  return (
    <section className="fade-in" aria-label="Demo" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="stage-label">⚡ Live demo</div>
      <div className="quiz-q" style={{ fontSize: 'clamp(18px, 2.4vw, 22px)' }}><Markdown source={beat.prompt} /></div>
      <div className="board">
        <div className="row"><button className="btn primary big" onClick={run} disabled={busy}>{busy ? 'Running… (building 1 lakh rows)' : times ? 'Run again' : 'Run the demo ▶'}</button></div>
        {times && (
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }} aria-live="polite">
            {times.map((t) => (
              <div key={t.label}>
                <div className="row" style={{ justifyContent: 'space-between' }}><span>{t.label}</span><b style={{ fontFamily: 'var(--mono)' }}>{t.ms < 1 ? t.ms.toFixed(2) : t.ms.toFixed(1)} ms</b></div>
                <div style={{ height: 10, borderRadius: 6, background: 'var(--panel-3)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(2, (t.ms / max) * 100)}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--pop))', transition: 'width .6s var(--ease)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {times && last > 0 && <div className="feedback right"><b>About {Math.max(1, Math.round(first / last))}× faster with the index.</b> {beat.feedback && <Markdown source={beat.feedback} />}</div>}
    </section>
  );
}
