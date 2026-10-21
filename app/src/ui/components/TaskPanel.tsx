// A SQL task on the stage, laid out like a small IDE: the brief on top, the console (editor → run → verdict → result)
// on the left, and the case database (every table, its rows and schema) in a drawer on the right.
// "Reset DB" puts the tables back to the task's starting state (every run starts from there anyway — the engine
// grades on a fresh copy — so this clears the console and reloads the drawer). Hints open in a side sheet.
// In review mode (a task already solved) the console is a free practice run — nothing is graded.
import { useEffect, useRef, useState } from 'react';
import type { TaskBeat } from '../../content/types';
import type { QueryResult } from '../../engine/sql/engine';
import type { HintContent, SessionRunner, SubmitOutcome } from '../../engine/runner/sessionRunner';
import { POINTS } from '../../engine/progress/derive';
import { useServices } from '../services';
import { speakerOf } from '../speakers';
import { Markdown } from './Markdown';
import { ResultTable } from './ResultTable';
import { SqlEditor, type SqlEditorHandle } from './SqlEditor';
import { Sheet } from './Sheet';
import { Confetti } from './Confetti';
import { TablesDrawer } from './TablesDrawer';

// A plain-English line under SQLite's own message
export function friendlyError(msg: string): string {
  if (/no such table/i.test(msg)) return 'That table name doesn’t exist. Check the Tables drawer on this screen.';
  if (/no such column/i.test(msg)) return 'That column name doesn’t exist in this table. Open the table in the Tables drawer to see its columns.';
  if (/syntax error/i.test(msg)) return 'SQLite couldn’t read the query near that word. Check spelling, commas, quotes and brackets.';
  if (/incomplete input/i.test(msg)) return 'The query ends too early. Did you finish the last line (and close every quote)?';
  if (/values for \d+ columns/i.test(msg)) return 'The number of values must match the number of columns.';
  return 'Read the message, fix the query and run it again.';
}

const HINT_LABEL = { 1: 'Case Note', 2: 'Fill in the blanks', 3: 'Show the answer' } as const;

interface Props { runner: SessionRunner; beat: TaskBeat; review?: boolean; onChanged(): void; onContinue?(): void }

export function TaskPanel({ runner, beat, review = false, onChanged, onContinue }: Props) {
  const { engine } = useServices();
  const st = runner.beatState(beat.id);
  const [sql, setSql] = useState(st.passSql ?? '');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<SubmitOutcome | null>(null);
  const [practice, setPractice] = useState<{ result?: QueryResult; error?: string } | null>(null);
  const [hints, setHints] = useState<HintContent[]>([]);
  const [hintsOpen, setHintsOpen] = useState(false);
  const [confirmAnswer, setConfirmAnswer] = useState(false);
  const [schema, setSchema] = useState<Record<string, string[]>>({});
  const [dbKey, setDbKey] = useState(0);           // bumps the Tables drawer after a run / a reset
  const [resetNote, setResetNote] = useState(false);
  const [sheet, setSheet] = useState<'tables' | 'result' | null>(null);
  const editor = useRef<SqlEditorHandle | null>(null);
  const outBox = useRef<HTMLDivElement>(null);
  const mentor = speakerOf(beat.speaker ?? (runner.pack.cast.mentor ? 'mentor' : 'narrator'), runner.pack.cast);

  // the editor's autocomplete needs the table list; the drawer loads its own
  const loadSchema = (learnerSql?: string) =>
    engine.schema(runner.pack.snapshot, beat.setup, learnerSql).then((t) => setSchema(Object.fromEntries(t.map((x) => [x.table, x.columns])))).catch(() => setSchema({}));
  useEffect(() => { loadSchema(st.passSql); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [engine, runner.pack.snapshot, beat.id]);

  const run = async () => {
    if (!sql.trim() || busy) return;
    setBusy(true);
    setResetNote(false);
    try {
      if (review) {
        const r = await engine.runScript(runner.pack.snapshot, [...(beat.setup ?? []), sql].join(';\n'));
        setPractice({ result: r.result as QueryResult | undefined, error: r.error });
      } else {
        setOut(await runner.submitSql(sql));
        onChanged();
      }
      loadSchema(sql);   // a table the query created (CREATE TABLE) appears in the list
      setDbKey((k) => k + 1);
    } finally { setBusy(false); }
    // on small screens the verdict is below the editor: bring it into view
    requestAnimationFrame(() => outBox.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }));
  };

  // every run starts from the task's starting state; "Reset DB" makes that visible: clear the console, reload the tables
  const resetDb = () => {
    setOut(null); setPractice(null); setResetNote(true);
    loadSchema(st.passSql);
    setDbKey((k) => k + 1);
  };

  const openHint = async (tier: 1 | 2 | 3) => {
    if (tier === 3 && !confirmAnswer) { setConfirmAnswer(true); return; }
    setConfirmAnswer(false);
    const h = await runner.hint(tier);
    setHints((prev) => [...prev.filter((x) => x.tier !== tier), h]);
    if (h.tier === 3) { editor.current?.set(h.sql); setHintsOpen(false); }
    onChanged();
  };

  const nextTier = (st.hintTier + 1) as 1 | 2 | 3;
  const v = out?.verdict;
  const result = review ? practice?.result : v && 'result' in v ? v.result : undefined;
  // the drawer shows the tables as the learner left them: the passing query (CREATE / INSERT / UPDATE) is applied on top of the setup
  const drawerSql = st.passSql ?? (review ? undefined : (v && v.status === 'pass' ? sql : undefined));
  const drawer = (insert: boolean) => (
    <TablesDrawer snapshot={runner.pack.snapshot} setup={beat.setup} learnerSql={drawerSql} refreshKey={dbKey}
      onInsert={insert ? (t) => editor.current?.insert(t) : undefined} />
  );

  return (
    <div className="task fade-in">
      <div className="stage-label">💻 SQL task {beat.task_id}{st.done && <span className="sticker flat">✓ solved</span>}{review && <span className="chip">practice run · nothing is graded</span>}</div>
      <section className="brief-card" aria-label="Task">
        <div className="who"><span className="mini" style={{ background: mentor.color }} aria-hidden="true">{mentor.initials}</span>{mentor.key === 'narrator' ? 'Case brief' : `${mentor.name} asks`}</div>
        <Markdown source={beat.ask} />
      </section>

      <div className="ide">
        <section className="terminal" aria-label="SQL console">
          <div className="terminal-bar">
            <span className="dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="name">case_db.sqlite</span>
            <button className="btn small ghost ide-tables-btn" onClick={() => setSheet('tables')}>🗄 Tables</button>
            <span className="kbd">Ctrl + Enter</span>
          </div>
          <SqlEditor key={beat.id} initial={sql} schema={schema} onChange={setSql} onRun={run} handle={(h) => { editor.current = h; }} />
          <div className="terminal-actions">
            <button className="btn pop" onClick={run} disabled={busy || !sql.trim()}>{busy ? 'Running…' : 'Run ▶'}</button>
            <button className="btn small" onClick={resetDb} disabled={busy} title="Put every table back to this task's starting state">↺ Reset DB</button>
            <button className="btn small ghost" onClick={() => editor.current?.set('')} disabled={busy}>Clear editor</button>
            <span className="spacer" />
            {!review && !st.done && (
              <button className="btn small" onClick={() => setHintsOpen(true)}>💡 Hints{st.hintTier > 0 && ` (${st.hintTier}/3)`}</button>
            )}
            {!review && !st.done && hints.length > 0 && !hintsOpen && (
              <button className="btn ghost small" onClick={() => setHintsOpen(true)}>Show my hints</button>
            )}
          </div>

          <div className="out" aria-live="polite" ref={outBox}>
            {resetNote && <div className="verdict reset"><span className="badge">↺</span><div><b>Database reset.</b> Every table is back to this task's starting state. Every run starts from here — a wrong UPDATE or DELETE never sticks.</div></div>}
            {review && practice && (practice.error
              ? <div className="verdict error"><span className="badge">!</span><div>SQLite says: <code>{practice.error}</code><p className="small" style={{ margin: '4px 0 0' }}>{friendlyError(practice.error)}</p></div></div>
              : null)}
            {review && !practice && st.passSql && <p className="muted small" style={{ margin: 0 }}>Your solving query is in the editor. Press <b>Run</b> to see its result again.</p>}

            {v?.status === 'pass' && (
              <div className="verdict pass"><Confetti count={30} /><span className="badge">✓</span>
                <div>
                  <b>✓ Correct.</b> {out?.replyOnPass && <Markdown source={out.replyOnPass} />}
                  {out?.clueUnlocked && <p className="small" style={{ margin: '6px 0 0' }}>🔎 New evidence unlocked — it’s on the next step.</p>}
                  {onContinue && <div className="row" style={{ marginTop: 10 }}><button className="btn primary small" onClick={onContinue}>Continue →</button></div>}
                </div>
              </div>
            )}
            {v?.status === 'trap' && (
              <div className="verdict trap"><span className="badge">⚠</span><div><Markdown source={v.trap.reply} />{v.error && <p className="small">SQLite says: <code>{v.error}</code></p>}</div></div>
            )}
            {v?.status === 'error' && (
              <div className="verdict error"><span className="badge">!</span><div>SQLite says: <code>{v.error}</code><p className="small" style={{ margin: '4px 0 0' }}>{friendlyError(v.error)}</p></div></div>
            )}
            {v?.status === 'wrong' && (
              <div className="verdict wrong"><span className="badge">✗</span>
                <div><b>Not quite.</b> The query ran, but the result isn’t what {mentor.key === 'narrator' ? 'the task' : mentor.name.split(' ')[0]} asked for.
                  {beat.grading.expect_rows !== undefined && result && <> Expected <b>{beat.grading.expect_rows}</b> row{beat.grading.expect_rows === 1 ? '' : 's'}; you got <b>{result.values.length}</b>.</>}
                </div>
              </div>
            )}
            {out && out.notTaughtYet.length > 0 && (
              <p className="muted small" style={{ margin: 0 }}>Nice — but <b>{out.notTaughtYet.map((f) => f.id).join(', ')}</b> comes later in the course. Try it with what we've learnt so far.</p>
            )}
            {result && <ResultTable result={result} caption={beat.grading.inspect ? 'Table after your query' : 'Result'} onExpand={() => setSheet('result')} />}
            {review && practice && !practice.error && !practice.result && <p className="muted small" style={{ margin: 0 }}>The query ran. It returned no table.</p>}
          </div>
        </section>

        <aside className="tables-aside">{drawer(true)}</aside>
      </div>

      {sheet === 'tables' && <Sheet title="Case database" wide onClose={() => setSheet(null)}>{drawer(true)}</Sheet>}
      {sheet === 'result' && result && (
        <Sheet title="Result — full view" wide onClose={() => setSheet(null)}>
          <ResultTable result={result} caption={beat.grading.inspect ? 'Table after your query' : 'Result'} limit={500} />
        </Sheet>
      )}

      {hintsOpen && (
        <Sheet title="Hints" onClose={() => { setHintsOpen(false); setConfirmAnswer(false); }}>
          <p className="muted small" style={{ marginTop: 0 }}>Each hint helps more — and lowers this task’s points a little.</p>
          {[...hints].sort((a, b) => a.tier - b.tier).map((h) => (
            <div key={h.tier} className="hint-card">
              <div className="tier">Hint {h.tier} · {HINT_LABEL[h.tier]}</div>
              {h.tier === 1 && <><b>{h.title} › {h.heading}</b><Markdown source={h.markdown} /></>}
              {h.tier === 2 && <pre className="sql">{h.skeleton}</pre>}
              {h.tier === 3 && <p style={{ margin: 0 }}>The answer is now in the editor. Read it, then press <b>Run</b>.</p>}
            </div>
          ))}
          {st.hintTier < 3 && !st.done && (
            <div className="hint-card next">
              {confirmAnswer && <p style={{ marginTop: 0 }}>Sure? The full answer will be typed into the editor.</p>}
              <div className="row">
                <button className="btn primary small" onClick={() => openHint(nextTier)}>
                  {nextTier === 3 && confirmAnswer ? 'Yes, show the answer' : `💡 Hint ${nextTier}: ${HINT_LABEL[nextTier]}`}
                </button>
                {confirmAnswer && <button className="btn small ghost" onClick={() => setConfirmAnswer(false)}>Cancel</button>}
              </div>
              <p className="muted small" style={{ marginBottom: 0 }}>Task then worth up to {Math.max(POINTS.taskPassed - POINTS.hintPenalty[nextTier], POINTS.taskMinimum)} pts</p>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
