// Tap one cell in one of the tables.
import { useState } from 'react';
import type { ActivityBeat } from '../../content/types';
import type { WidgetProps } from './ActivityPanel';

type Beat = Extract<ActivityBeat, { kind: 'pick_cell' }>;
type Cell = { table: string; row: number; column: string };

export function PickCell({ beat, locked, reveal, onSubmit }: WidgetProps<Beat>) {
  const [cell, setCell] = useState<Cell | null>(null);
  const chosen = reveal ? beat.answer : cell;
  const is = (t: string, r: number, c: string) => chosen?.table === t && chosen.row === r && chosen.column === c;
  return (
    <div className="pick">
      {!locked && <p className="howto-line">Tap one cell in the table{beat.tables.length > 1 ? 's' : ''} below.</p>}
      {beat.tables.map((t) => (
        <div key={t.caption} style={{ overflowX: 'auto' }}>
          <table>
            <caption>{t.caption}</caption>
            <thead><tr>{t.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
            <tbody>
              {t.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((v, ci) => (
                    <td key={ci}>
                      <button className={is(t.caption, ri, t.columns[ci]) ? 'selected' : ''} disabled={locked}
                        aria-pressed={is(t.caption, ri, t.columns[ci])} aria-label={`${t.caption}, row ${ri + 1}, ${t.columns[ci]}: ${String(v)}`}
                        onClick={() => setCell({ table: t.caption, row: ri, column: t.columns[ci] })}>{String(v)}</button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {!locked && <div className="row"><button className="btn pop" disabled={!cell} onClick={() => cell && onSubmit({ kind: 'pick_cell', ...cell })}>Check</button>{cell && <span className="muted small">Picked: <b>{cell.column}</b> in row {cell.row + 1}</span>}</div>}
    </div>
  );
}
