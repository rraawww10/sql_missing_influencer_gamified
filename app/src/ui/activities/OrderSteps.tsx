// Move steps up and down with buttons (keyboard and touch friendly).
import { useState } from 'react';
import type { ActivityBeat } from '../../content/types';
import { shuffled } from '../../engine/activities/check';
import type { WidgetProps } from './ActivityPanel';

type Beat = Extract<ActivityBeat, { kind: 'order' }>;

export function OrderSteps({ beat, locked, parts, reveal, onSubmit }: WidgetProps<Beat>) {
  const [steps, setSteps] = useState(() => shuffled(beat.steps, beat.id));
  const list = reveal ? beat.steps : steps;
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };
  return (
    <div>
      {!locked && <p className="howto-line">Use the arrows to move each step up or down until the order is right.</p>}
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {list.map((s, i) => (
          <li key={s} className={`order-item ${parts && s in parts ? (parts[s] ? 'right' : 'wrong') : ''}`}>
            <b>{i + 1}</b><span>{s}</span>
            {!locked && (
              <span className="row" style={{ gap: 4 }}>
                <button className="btn small" aria-label={`Move "${s}" up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn small" aria-label={`Move "${s}" down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {!locked && <div className="row" style={{ marginTop: 14 }}><button className="btn pop" onClick={() => onSubmit({ kind: 'order', steps })}>Check</button></div>}
    </div>
  );
}
