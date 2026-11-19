// A SQL task on the stage, laid out like a small IDE: the brief and, under it, one card with two tabs (the case database
// with every table's rows and schema, and Kaal's three hint envelopes) on the left; the console (editor → run → verdict → result) on the right.
// "Reset DB" puts the tables back to the task's starting state (every run starts from there anyway - the engine
// grades on a fresh copy - so this clears the console and reloads the drawer).
// In review mode (a task already solved) the console is a free practice run - nothing is graded.
import { personalize } from '../../adapters/identity';
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
import { kaal } from '../kaal/bus';
import { Kaal } from '../kaal/Kaal';
import { sfx } from '../sound';
import { Icon } from '../design/Icon';
import { HINTS_EVENT } from '../kaal/dock';
import { noCopy } from '../reader/noCopy';

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
// the three sealed envelopes Kaal hands over
const ENVELOPE = {
  1: { name: 'The Lead', blurb: 'The course note that explains exactly the tool you need.' },
  2: { name: 'The Sketch', blurb: 'The query with blanks. You fill in the missing words.' },
  3: { name: 'Full Reveal', blurb: 'The complete query, typed into the console for you.' },
} as const;

interface Props { runner: SessionRunner; beat: TaskBeat; review?: boolean; onChanged(): void; onContinue?(): void }

export function TaskPanel({ runner, beat, review = false, onChanged, onContinue }: Props) {
  const { engine } = useServices();
  const st = runner.beatState(beat.id);
  const [sql, setSql] = useState(st.passSql ?? '');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<SubmitOutcome | null>(null);
  const [practice, setPractice] = useState<{ result?: QueryResult; error?: string } | null>(null);
  const [hints, setHints] = useState<HintContent[]>([]);
  const [tab, setTab] = useState<'tables' | 'hints'>('tables');   // the card under the brief: the case database, or Kaal's envelopes
  const [confirmAnswer, setConfirmAnswer] = useState(false);
  const [schema, setSchema] = useState<Record<string, string[]>>({});
  const [dbKey, setDbKey] = useState(0);           // bumps the Tables drawer after a run / a reset
  const [resetNote, setResetNote] = useState(false);
  const [sheet, setSheet] = useState<'result' | null>(null);
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
        kaal('running', { silent: true, mute: true }); sfx('run');
        const o = await runner.submitSql(sql);
        setOut(o);
        const after = runner.beatState(beat.id);
        const s = o.verdict.status;
        if (s === 'pass') { kaal(after.attempts <= 1 && after.hintTier === 0 ? 'passFirst' : 'pass'); setTimeout(() => sfx('stamp'), 250); }
        else if (s === 'trap') kaal('trap');
        else if (s === 'error') kaal('error');
        else kaal('wrong');
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
    kaal(`hint${tier}` as 'hint1');
    setHints((prev) => [...prev.filter((x) => x.tier !== tier), h]);
    if (h.tier === 3) editor.current?.set(h.sql);
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

  // Kaal's chat (and the Get a hint button) can ask this task to show its envelopes
  const side = useRef<HTMLElement>(null);
  const showHints = () => { setTab('hints'); requestAnimationFrame(() => side.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })); };
  useEffect(() => {
    const on = () => { if (!review && !st.done) showHints(); };
    addEventListener(HINTS_EVENT, on);
    return () => removeEventListener(HINTS_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, st.done]);
  const hintsTab = !review && (!st.done || hints.length > 0);

  return (
    <div className="task fade-in">
      <div className="stage-label"><Icon name="code" /> SQL task {beat.task_id}{st.done && <span className="pill mint"><Icon name="tick" /> solved</span>}{review && <span className="pill">practice run · nothing is graded</span>}</div>

      <div className="ide">
        <section className="surface card brief-card" aria-label="Task">
          <div className="who"><span className="mini" style={{ background: mentor.color }} aria-hidden="true">{mentor.initials}</span>{mentor.key === 'narrator' ? 'Case brief' : `${mentor.name} asks`}</div>
          <Markdown source={beat.ask} />
        </section>

        <section className="night card terminal" aria-label="SQL console">
          <div className="terminal-bar">
            <span className="dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="name">case_db.sqlite</span>
            <span className="grow" />
            <span className="kbd">Ctrl + Enter to run</span>
          </div>
          <SqlEditor key={beat.id} initial={sql} schema={schema} onChange={(t) => { if (Math.abs(t.length - sql.length) === 1) sfx('type'); setSql(t); }} onRun={run} handle={(h) => { editor.current = h; }} />
          <div className="terminal-actions">
            <button className="btn primary" onClick={run} disabled={busy || !sql.trim()}><Icon name="play" /> {busy ? 'Running…' : 'Run query'}</button>
            <button className="btn small ghost" onClick={resetDb} disabled={busy} title="Put every table back to this task's starting state"><Icon name="reset" /> Reset DB</button>
            <button className="btn small ghost" onClick={() => editor.current?.set('')} disabled={busy}>Clear editor</button>
            <span className="grow" />
            {!review && !st.done && (
              <button className="btn small pop" onClick={showHints}><Icon name="envelope" /> Get a hint{st.hintTier > 0 && ` (${st.hintTier}/3)`}</button>
            )}
          </div>

          <div className="out" aria-live="polite" ref={outBox}>
            {!resetNote && !out && !practice && !(review && st.passSql) && !st.done && <p className="idle">Results appear here. Write your query above, then press Run query.</p>}
            {!resetNote && !out && !review && st.done && <div className="verdict pass"><Icon name="ok" className="lg" /><div><b>Solved.</b> The query that solved this task is in the editor. Press Continue to move on.</div></div>}
            {resetNote && <div className="verdict reset"><Icon name="reset" className="lg" /><div><b>Database reset.</b> Every table is back to this task's starting state. Every run starts from here - a wrong UPDATE or DELETE never sticks.</div></div>}
            {review && practice && (practice.error
              ? <div className="verdict error"><Icon name="error" className="lg" /><div>SQLite says: <code>{practice.error}</code><p className="small">{friendlyError(practice.error)}</p></div></div>
              : null)}
            {review && !practice && st.passSql && <p className="idle">Your solving query is in the editor. Press Run query to see its result again.</p>}

            {v?.status === 'pass' && (
              <div className="verdict pass" key={`p${st.attempts}`}><Confetti count={30} /><Icon name="ok" className="lg" />
                <div>
                  <b>Correct.</b> {out?.replyOnPass && <Markdown source={out.replyOnPass} />}
                  {out?.clueUnlocked && <p className="small"><Icon name="clue" /> New evidence unlocked - it’s on the next step.</p>}
                  {onContinue && <div className="row"><button className="btn small" onClick={onContinue}>Continue <Icon name="right" /></button></div>}
                </div>
              </div>
            )}
            {v?.status === 'trap' && (
              <div className="verdict trap" key={`t${st.attempts}`}><Icon name="warn" className="lg" /><div><b>Trap!</b> <Markdown source={v.trap.reply} />{v.error && <p className="small">SQLite says: <code>{v.error}</code></p>}</div></div>
            )}
            {v?.status === 'error' && (
              <div className="verdict error" key={`e${st.attempts}`}><Icon name="error" className="lg" /><div><b>Error.</b> SQLite says: <code>{v.error}</code><p className="small">{friendlyError(v.error)}</p></div></div>
            )}
            {v?.status === 'wrong' && (
              <div className="verdict wrong" key={`w${st.attempts}`}><Icon name="error" className="lg" />
                <div><b>Not quite.</b> The query ran, but the result isn’t what {mentor.key === 'narrator' ? 'the task' : mentor.name.split(' ')[0]} asked for.
                  {beat.grading.expect_rows !== undefined && result && <> Expected <b>{beat.grading.expect_rows}</b> row{beat.grading.expect_rows === 1 ? '' : 's'}; you got <b>{result.values.length}</b>.</>}
                </div>
              </div>
            )}
            {out && out.notTaughtYet.length > 0 && (
              <p className="idle">Nice - but <b>{out.notTaughtYet.map((f) => f.id).join(', ')}</b> comes later in the course. Try it with what we've learnt so far.</p>
            )}
            {result && <ResultTable result={result} caption={beat.grading.inspect ? 'Table after your query' : 'Result'} onExpand={() => setSheet('result')} />}
            {review && practice && !practice.error && !practice.result && <p className="idle">The query ran. It returned no table.</p>}
          </div>
        </section>

        <section className="surface card side-tabs" ref={side} aria-label="Tables and hints">
          {hintsTab && (
            <div className="seg tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'tables'} className={tab === 'tables' ? 'on' : ''} onClick={() => setTab('tables')}><Icon name="db" /> Tables</button>
              <button role="tab" aria-selected={tab === 'hints'} className={tab === 'hints' ? 'on' : ''} onClick={() => setTab('hints')}><Icon name="envelope" /> Kaal’s hints{st.hintTier > 0 && ` (${st.hintTier}/3)`}</button>
            </div>
          )}
          {(tab === 'tables' || !hintsTab) && drawer(true)}
          {tab === 'hints' && hintsTab && (
            <div className="hints">
              <div className="kaal-hint-head"><Kaal mood={st.hintTier >= 2 ? 'whisper' : 'think'} size={54} /><span>{personalize('Three envelopes, {you}. Open them in order. Each one helps more - and costs a few points.')}</span></div>
              <div className="envelopes">
                {([1, 2, 3] as const).map((tier) => {
                  const opened = hints.some((h) => h.tier === tier) || st.hintTier >= tier;
                  const isNext = tier === nextTier && !st.done;
                  return (
                    <button key={tier} className={`envelope ${opened ? 'opened' : ''} ${isNext && !confirmAnswer ? 'next' : ''}`} disabled={opened || !isNext}
                      onClick={() => openHint(tier)} aria-label={`Envelope ${tier}: ${ENVELOPE[tier].name}${opened ? ' (opened)' : isNext ? '' : ' (open the earlier envelope first)'}`}>
                      <Icon name={opened ? 'ok' : isNext ? 'envelope' : 'lock'} className="lg" />
                      <b>{ENVELOPE[tier].name}</b>
                      <small>{opened ? 'Opened' : `-${POINTS.hintPenalty[tier]} pts`}</small>
                    </button>
                  );
                })}
              </div>
              {!st.done && nextTier <= 3 && !confirmAnswer && (
                <p className="muted small"><b>{ENVELOPE[nextTier].name} · {HINT_LABEL[nextTier]}.</b> {ENVELOPE[nextTier].blurb} The task is then worth up to {Math.max(POINTS.taskPassed - POINTS.hintPenalty[nextTier], POINTS.taskMinimum)} pts.</p>
              )}
              {confirmAnswer && (
                <div className="hint-letter">
                  <p>Sure? The full answer will be typed into the console.</p>
                  <div className="row"><button className="btn pop small" onClick={() => openHint(3)}>Yes, show the answer</button><button className="btn small ghost" onClick={() => setConfirmAnswer(false)}>Cancel</button></div>
                </div>
              )}
              {[...hints].sort((x, y) => y.tier - x.tier).map((h) => (
                <div key={h.tier} className="hint-letter">
                  <div className="cap">Envelope {h.tier} · {ENVELOPE[h.tier].name}</div>
                  {h.tier === 1 && <div {...noCopy}><b>{h.title} › {h.heading}</b><Markdown source={h.markdown} course /></div>}
                  {h.tier === 2 && <pre className="sql">{h.skeleton}</pre>}
                  {h.tier === 3 && <p>The answer is now in the console. Read it, then press <b>Run query</b>.</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {sheet === 'result' && result && (
        <Sheet title="Result - full view" wide onClose={() => setSheet(null)}>
          <ResultTable result={result} caption={beat.grading.inspect ? 'Table after your query' : 'Result'} limit={500} />
        </Sheet>
      )}
    </div>
  );
}
