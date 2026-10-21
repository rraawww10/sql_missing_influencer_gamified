import { useState } from 'react';
import type { ActivityBeat } from '../../content/types';
import type { WidgetProps } from './ActivityPanel';

type Beat = Extract<ActivityBeat, { kind: 'multi_select' }>;

export function MultiSelect({ beat, locked, parts, reveal, onSubmit }: WidgetProps<Beat>) {
  const [selected, setSelected] = useState<string[]>([]);
  const shown = reveal ? beat.options.filter((o) => o.correct).map((o) => o.text) : selected;
  return (
    <div>
      <p className="muted small">Choose all that apply.</p>
      <div className="choices">
        {beat.options.map((o, i) => {
          const on = shown.includes(o.text);
          const cls = ['choice', on && 'selected', parts && o.text in parts && !parts[o.text] && 'wrong'].filter(Boolean).join(' ');
          return (
            <button key={o.text} className={cls} disabled={locked} aria-pressed={on} style={{ '--i': i } as React.CSSProperties}
              onClick={() => setSelected(on ? selected.filter((x) => x !== o.text) : [...selected, o.text])}>
              <span className="letter" aria-hidden="true">{on ? '✓' : ''}</span><span>{o.text}</span>
            </button>
          );
        })}
      </div>
      {!locked && <div className="row" style={{ marginTop: 14 }}><button className="btn pop" disabled={!selected.length} onClick={() => onSubmit({ kind: 'multi_select', selected })}>Check</button></div>}
    </div>
  );
}
