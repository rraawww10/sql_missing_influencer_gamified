// A query result (or a table preview): scrolls both ways with visible scrollbars, sticky header and first column,
// says how many rows there are, hints when there are more columns to the right, and can open in a full-width view.
import { useEffect, useRef, useState } from 'react';
import type { QueryResult } from '../../engine/sql/engine';

interface Props {
  result: QueryResult | undefined;
  caption?: string;
  limit?: number;        // rows rendered (default 50)
  total?: number;        // real row count when the result is already a slice (table preview)
  compact?: boolean;
  onExpand?(): void;     // "⤢ Full view"
}

export function ResultTable({ result, caption, limit = 50, total, compact = false, onExpand }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 2);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [result]);

  if (!result || result.columns.length === 0) return <p className="muted small">The query ran. It returned no table.</p>;
  const rows = result.values;
  const count = total ?? rows.length;
  const shown = Math.min(rows.length, limit);
  return (
    <div className={`results-wrap ${compact ? 'compact' : ''}`}>
      <div className="results-bar">
        <span><b>{caption ?? 'Result'}</b> · {count} row{count === 1 ? '' : 's'} · {result.columns.length} column{result.columns.length === 1 ? '' : 's'}{shown < count ? ` · showing first ${shown}` : ''}</span>
        {overflow && <span className="scroll-hint">↔ scroll for more columns</span>}
        {onExpand && <button className="btn small ghost" onClick={onExpand}>⤢ Full view</button>}
      </div>
      <div className="results" tabIndex={0} aria-label={caption ? `${caption} rows` : 'Query result'} ref={box}>
        <table>
          <thead><tr>{result.columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, limit).map((r, i) => (
              <tr key={i}>{r.map((v, j) => <td key={j} className={v === null ? 'null' : ''}>{v === null ? 'NULL' : String(v)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
