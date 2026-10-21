// The case database, always in reach: one tab per table, the rows (first 100) or the schema (columns, types, keys).
// Shows the tables as they exist for the current task — snapshot + task setup + the learner's last passing query —
// so a table the learner just created is there too. Column names can be tapped into the editor.
import { useEffect, useState } from 'react';
import type { TablePreview } from '../../engine/sql/engine';
import { useServices } from '../services';
import { ResultTable } from './ResultTable';

interface Props {
  snapshot: string;
  setup?: string[];
  learnerSql?: string;
  refreshKey?: number;          // bump to reload (after a run, after Reset DB)
  onInsert?(text: string): void; // present only when an editor is on screen
  rows?: number;
}

export function TablesDrawer({ snapshot, setup, learnerSql, refreshKey = 0, onInsert, rows = 100 }: Props) {
  const { engine } = useServices();
  const [tables, setTables] = useState<{ table: string; columns: string[] }[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [view, setView] = useState<'data' | 'schema'>('data');
  const [preview, setPreview] = useState<TablePreview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    engine.schema(snapshot, setup, learnerSql).then((t) => {
      if (!alive) return;
      setTables(t);
      setActive((a) => (a && t.some((x) => x.table === a) ? a : t[0]?.table ?? null));
    }).catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, snapshot, learnerSql, refreshKey]);

  useEffect(() => {
    if (!active) { setPreview(null); return; }
    let alive = true;
    setPreview(null);
    engine.preview(snapshot, active, setup, learnerSql, rows).then((p) => alive && setPreview(p)).catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, snapshot, active, learnerSql, refreshKey, rows]);

  if (error) return <div className="tables" role="group" aria-label="Tables"><p className="muted small">Could not read the database: {error}</p></div>;
  if (!tables) return <div className="tables" role="group" aria-label="Tables"><p className="muted small">Opening the case database…</p></div>;

  return (
    <div className="tables" role="group" aria-label="Tables">
      <div className="tables-head">
        <h3>🗄 Case database</h3>
        <div className="seg" role="group" aria-label="View">
          <button className={view === 'data' ? 'on' : ''} aria-pressed={view === 'data'} onClick={() => setView('data')}>Data</button>
          <button className={view === 'schema' ? 'on' : ''} aria-pressed={view === 'schema'} onClick={() => setView('schema')}>Schema</button>
        </div>
      </div>
      {tables.length === 0 && <p className="muted small">No tables yet. Create one and it appears here.</p>}
      <div className="tables-tabs">
        {tables.map((t) => (
          <button key={t.table} className={t.table === active ? 'on' : ''} aria-pressed={t.table === active} onClick={() => setActive(t.table)}>
            {t.table}<small>{t.columns.length}</small>
          </button>
        ))}
      </div>
      {active && !preview && <p className="muted small">Reading {active}…</p>}
      {active && preview && view === 'data' && (
        <ResultTable result={preview} caption={active} limit={rows} total={preview.total} compact />
      )}
      {active && preview && view === 'schema' && (
        <table className="schema-table">
          <thead><tr><th>column</th><th>type</th><th>key</th></tr></thead>
          <tbody>
            {preview.schema.map((c) => (
              <tr key={c.name}>
                <td><code>{c.name}</code></td>
                <td className="muted">{c.type || '—'}{c.notnull && !c.pk ? ' · not null' : ''}</td>
                <td>{c.pk ? <span className="chip accent">PK</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {active && preview && onInsert && (
        <div className="tables-cols" aria-label={`Columns of ${active}`}>
          {preview.schema.map((c) => <button key={c.name} title={`Type ${c.name} into the editor`} onClick={() => onInsert(c.name)}>{c.name}</button>)}
        </div>
      )}
      {onInsert && <p className="muted small" style={{ margin: '8px 2px 0' }}>Tap a column name to type it into the editor.</p>}
    </div>
  );
}
