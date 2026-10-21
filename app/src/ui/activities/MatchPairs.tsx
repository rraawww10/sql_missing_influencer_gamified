// One dropdown per left-hand item: simple, accessible, works on every phone.
import { useMemo, useState } from 'react';
import type { ActivityBeat } from '../../content/types';
import { shuffled } from '../../engine/activities/check';
import type { WidgetProps } from './ActivityPanel';

type Beat = Extract<ActivityBeat, { kind: 'match' }>;

export function MatchPairs({ beat, locked, parts, reveal, onSubmit }: WidgetProps<Beat>) {
  const rights = useMemo(() => shuffled([...new Set(beat.pairs.map((p) => p.right))], beat.id), [beat]);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const shown = reveal ? Object.fromEntries(beat.pairs.map((p) => [p.left, p.right])) : pairs;
  const complete = beat.pairs.every((p) => pairs[p.left]);

  return (
    <div>
      {!locked && <p className="howto-line">Pick the matching answer for each item.</p>}
      <div className="match">
        {beat.pairs.map((p, i) => {
          const state = parts && p.left in parts ? (parts[p.left] ? 'right' : 'wrong') : '';
          return (
            <label key={p.left} className={`match-row ${state}`}>
              <span className="n" aria-hidden="true">{i + 1}</span>
              <span className="left">{p.left}</span>
              <select value={shown[p.left] ?? ''} disabled={locked} aria-label={`Match for item ${i + 1}`}
                onChange={(e) => setPairs({ ...pairs, [p.left]: e.target.value })}>
                <option value="" disabled>Choose…</option>
                {rights.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          );
        })}
      </div>
      {!locked && <div className="row" style={{ marginTop: 14 }}><button className="btn pop" disabled={!complete} onClick={() => onSubmit({ kind: 'match', pairs })}>Check</button></div>}
    </div>
  );
}
