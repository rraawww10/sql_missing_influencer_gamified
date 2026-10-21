// Tap an item, then tap a bucket. Tap a placed item to take it back.
import { useMemo, useState } from 'react';
import type { ActivityBeat } from '../../content/types';
import { shuffled } from '../../engine/activities/check';
import type { WidgetProps } from './ActivityPanel';

type Beat = Extract<ActivityBeat, { kind: 'sort_into' }>;

export function SortInto({ beat, locked, parts, reveal, onSubmit }: WidgetProps<Beat>) {
  const items = useMemo(() => shuffled(beat.items.map((i) => i.text), beat.id), [beat]);
  const answerOf = Object.fromEntries(beat.items.map((i) => [i.text, i.bucket]));
  const [placement, setPlacement] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const shown = reveal ? answerOf : placement;

  const put = (bucket: string) => {
    if (!picked || locked) return;
    setPlacement({ ...placement, [picked]: bucket });
    setPicked(null);
  };
  const pill = (text: string) => {
    const cls = ['pill', picked === text && 'selected', parts && text in parts && (parts[text] ? 'right' : 'wrong')].filter(Boolean).join(' ');
    return (
      <button key={text} className={cls} disabled={locked} aria-pressed={picked === text}
        onClick={() => {
          if (shown[text]) { const { [text]: _, ...rest } = placement; setPlacement(rest); }
          else setPicked(picked === text ? null : text);
        }}>{text}</button>
    );
  };
  const unplaced = items.filter((t) => !shown[t]);

  return (
    <div className="sort">
      {!locked && <p className="howto-line">{picked ? <>Now tap the box <b>“{picked}”</b> belongs in.</> : <>Tap an item, then tap the box it belongs in. Tap a placed item to take it back.</>}</p>}
      {unplaced.length > 0 && <div className="tray" aria-label="Items to sort">{unplaced.map(pill)}</div>}
      <div className="buckets">
        {beat.buckets.map((b) => {
          const inside = items.filter((t) => shown[t] === b);
          return (
            <div key={b} className={`bucket ${picked && !locked ? 'armed' : ''}`} role="button" tabIndex={locked ? -1 : 0} aria-label={`Put in ${b}`}
              onClick={() => put(b)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && put(b)}>
              <h4>{b}<span className="count">{inside.length}</span></h4>
              {inside.map(pill)}
              {inside.length === 0 && !picked && <span className="empty">Nothing here yet</span>}
              {picked && !locked && <span className="drop">+ put “{picked}” here</span>}
            </div>
          );
        })}
      </div>
      {!locked && <div className="row" style={{ marginTop: 14 }}><button className="btn pop" disabled={unplaced.length > 0} onClick={() => onSubmit({ kind: 'sort_into', placement })}>Check</button>{unplaced.length > 0 && <span className="muted small">{unplaced.length} left to sort</span>}</div>}
    </div>
  );
}
