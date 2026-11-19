// Engine demo (Session 12 index demo): runs real SQL in the browser and shows how long each step took.
import { useState } from 'react';
import type { DemoBeat } from '../../content/types';
import type { SessionRunner } from '../../engine/runner/sessionRunner';
import { Markdown } from './Markdown';
import { Icon } from '../design/Icon';

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
    <section className="quiz fade-in" aria-label="Demo">
      <div className="stage-label"><Icon name="bolt" /> Live demo</div>
      <div className="surface card quiz-q"><Markdown source={beat.prompt} /></div>
      <div className="surface card board">
        <div className="row"><button className="btn primary big" onClick={run} disabled={busy}><Icon name="play" /> {busy ? 'Running… (building 1 lakh rows)' : times ? 'Run again' : 'Run the demo'}</button></div>
        {times && (
          <div className="demo-times" aria-live="polite">
            {times.map((t) => (
              <div key={t.label}>
                <div className="row between"><span>{t.label}</span><b className="ms">{t.ms < 1 ? t.ms.toFixed(2) : t.ms.toFixed(1)} ms</b></div>
                <div className="demo-bar"><i style={{ width: `${Math.max(2, (t.ms / max) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
      {times && last > 0 && <div className="feedback right"><b>About {Math.max(1, Math.round(first / last))}× faster with the index.</b> {beat.feedback && <Markdown source={beat.feedback} />}</div>}
    </section>
  );
}
