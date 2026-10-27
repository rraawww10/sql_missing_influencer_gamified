// Plays one episode as a game screen: a HUD with the episode name and a stories-style progress bar on top,
// ONE step at a time on the stage, and a floating dock with Back / Continue at the bottom (← → keys work too).
// Finished steps can be opened again from the bar (or the steps sheet) or with Back — read-only, and SQL tasks become a practice run.
import { useCallback, useEffect, useRef, useState } from 'react';
import { SessionRunner } from '../../engine/runner/sessionRunner';
import type { Beat } from '../../content/types';
import { useServices, type Services } from '../services';
import { TaskPanel } from '../components/TaskPanel';
import { CheckPanel } from '../components/CheckPanel';
import { ActivityPanel } from '../activities/ActivityPanel';
import { DemoPanel } from '../components/DemoPanel';
import { ClueStage, NoteStage, SceneStage } from '../game/StoryStages';
import { StoryBar, StepsList, beatLabel, ICON, KIND } from '../game/StoryBar';
import { Sheet } from '../components/Sheet';
import { Markdown } from '../components/Markdown';
import { storyTime } from '../speakers';
import { episodeTitle, unitLabel } from '../episodes';
import { ResetControl } from '../components/ResetControl';
import { TablesDrawer } from '../components/TablesDrawer';

// One runner per session per page load (React StrictMode mounts effects twice in dev)
const opening = new Map<number, Promise<SessionRunner>>();
export function openRunner(services: Services, session: number): Promise<SessionRunner> {
  if (!opening.has(session)) {
    const p = (async () => {
      const pack = await services.loader.pack(session);
      const user = await services.auth.currentUser();
      return SessionRunner.open(pack, user, services);
    })();
    p.catch(() => opening.delete(session));   // never keep a failed open: "Try again" must really retry
    opening.set(session, p);
  }
  return opening.get(session)!;
}
export function forgetRunner(session: number) { opening.delete(session); }

// what the learner has to do before Continue unlocks
const TODO: Partial<Record<Beat['type'], string>> = {
  task: 'Run a correct query to continue', check: 'Pick an answer to continue', activity: 'Finish the activity to continue',
  clue: 'Pin the evidence to continue', demo: 'Run the demo to continue',
};

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest('.cm-editor'));

export function Player({ session, onExit, onFinished, exitLabel = '← Map' }: { session: number; onExit(): void; onFinished(): void; exitLabel?: string }) {
  const services = useServices();
  const [runner, setRunner] = useState<SessionRunner | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [, setTick] = useState(0);
  const [viewAt, setViewAt] = useState<number | null>(null);   // null = the live step
  const [sheet, setSheet] = useState<'steps' | 'evidence' | 'tables' | null>(null);
  const [bump, setBump] = useState(false);
  const pinsBefore = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    openRunner(services, session).then((r) => alive && setRunner(r)).catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [services, session, attempt]);

  const index = runner?.index ?? 0;
  const view = viewAt ?? index;
  const review = view < index;
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [view, runner]);

  // the evidence counter bounces when a clue gets pinned
  const pins = runner?.pinned.length ?? 0;
  useEffect(() => {
    if (pins > pinsBefore.current) { setBump(true); const t = setTimeout(() => setBump(false), 600); pinsBefore.current = pins; return () => clearTimeout(t); }
    pinsBefore.current = pins;
  }, [pins]);

  const next = useCallback(async () => {
    if (!runner) return;
    if (review) { setViewAt(view + 1 >= runner.index ? null : view + 1); return; }
    if (!runner.canAdvance()) return;
    const { finished } = await runner.advance();
    if (finished) { forgetRunner(session); onFinished(); } else { setViewAt(null); refresh(); }
  }, [runner, review, view, session, onFinished, refresh]);
  const back = useCallback(() => { if (view > 0) setViewAt(view - 1); }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || typing(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [next, back, sheet]);

  if (error) return (
    <div className="page"><div className="page-inner" style={{ paddingTop: 40 }}>
      <div className="panel" role="alert">
        <p style={{ marginTop: 0 }}>Could not open this episode. {error}</p>
        <div className="row">
          <button className="btn primary" onClick={() => { setError(''); setAttempt((a) => a + 1); }}>Try again</button>
          <button className="btn" onClick={onExit}>Back</button>
        </div>
      </div>
    </div></div>
  );
  if (!runner) return <div className="page"><div className="page-inner" style={{ paddingTop: 40 }}><p className="muted">Opening the case file…</p></div></div>;

  const beats = runner.pack.beats;
  const beat = beats[view];
  const last = runner.index === beats.length - 1;
  const canGo = review || runner.canAdvance();
  const unit = runner.pack.unit;
  const multiPart = !!unit && unit.parts > 1;
  const title = episodeTitle(session, runner.pack.title);
  const pinnedClues = beats.filter((b): b is Extract<Beat, { type: 'clue' }> => b.type === 'clue' && runner.pinned.includes(b.clue_id));
  const pickStep = (i: number) => { setViewAt(i >= runner.index ? null : i); setSheet(null); };

  const stage = (() => {
    switch (beat.type) {
      case 'scene': case 'hook': return <SceneStage runner={runner} beat={beat} index={view} />;
      case 'note': return <NoteStage beat={beat} />;
      case 'clue': return <ClueStage runner={runner} beat={beat} review={review} onChanged={refresh} />;
      case 'task': return <TaskPanel key={`${beat.id}-${review}`} runner={runner} beat={beat} review={review} onChanged={refresh} onContinue={review ? undefined : next} />;
      case 'check': return <CheckPanel key={beat.id} runner={runner} beat={beat} onChanged={refresh} />;
      case 'activity': return <ActivityPanel key={`${beat.id}-${review}`} runner={runner} beat={beat} review={review} onChanged={refresh} />;
      case 'demo': return <DemoPanel key={beat.id} runner={runner} beat={beat} onChanged={refresh} />;
    }
  })();
  const fullBleed = beat.type === 'scene' || beat.type === 'hook';

  return (
    <div className="game">
      <header className="hud">
        <button className="btn small ghost" onClick={onExit} aria-label={exitLabel}><span className="hide-phone">{exitLabel}</span><span className="only-phone" aria-hidden="true">←</span></button>
        <div className="ep">
          <span className="clock">🕕 {storyTime(session)}<span className="hide-phone"> · Police Data Cell</span>{multiPart && <> · part {unit!.part} of {unit!.parts}</>}</span>
          <h1>{title}{unit && !unit.finale && <small>{unitLabel(unit)}</small>}</h1>
        </div>
        <div className="tools">
          <button className="hud-stat" onClick={() => setSheet('tables')} aria-label="Open the case database tables">🗄<span className="hide-phone"> Tables</span></button>
          <button className={`hud-stat pins ${bump ? 'bump' : ''}`} onClick={() => setSheet('evidence')} aria-label={`Evidence: ${runner.pinned.length} clues pinned`}>📌 {runner.pinned.length}</button>
          <ResetControl session={session} small popover label="↺ Reset" onDone={() => { setRunner(null); setViewAt(null); setAttempt((a) => a + 1); }} />
        </div>
        <StoryBar runner={runner} viewing={view} onPick={pickStep} />
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <button className="nowchip" onClick={() => setSheet('steps')} aria-label="Open the list of steps">
            <span className="ico" aria-hidden="true">{ICON[beat.type]}</span>
            <span className="lbl">{KIND[beat.type]}{beatLabel(runner, beat, true) !== KIND[beat.type] && <> · {beatLabel(runner, beat, true)}</>}</span>
            <span className="count">Step {runner.index + 1}/{beats.length}</span>
          </button>
          <span className="muted small hide-phone">{beats.filter((b) => runner.beatState(b.id)?.done).length} of {beats.length} done</span>
        </div>
      </header>

      <main className="stage">
        {review && (
          <div className="review-banner strip" role="status">
            <span>👀 Looking back at an earlier step — <b>{beatLabel(runner, beat, true)}</b>. Nothing here changes your progress.</span>
            <button className="btn small primary" onClick={() => setViewAt(null)}>Back to current step ⏭</button>
          </div>
        )}
        <div className="stage-scroll" ref={scroller}>
          {fullBleed ? stage : <div className={`stage-content ${beat.type === 'task' ? 'wide' : beat.type === 'note' ? 'reading' : ''}`} style={beat.type === 'clue' ? { minHeight: '100%', display: 'grid' } : undefined}>{stage}</div>}
        </div>

        <div className={`dock${fullBleed ? ' floating' : ''}`}>
          <button className="btn" onClick={back} disabled={view === 0} aria-label="Back to the previous step">← Back</button>
          <div className={`status ${canGo && !review ? 'ok' : ''}`} aria-live="polite">
            {review ? `Step ${view + 1} of ${beats.length} · review` : canGo ? (last ? (multiPart ? 'Last step — finish this part' : 'Last step — finish the episode') : 'Ready when you are') : TODO[beat.type] ?? ''}
          </div>
          {review
            ? <button className="btn primary" onClick={next}>Next ›</button>
            : <button className="btn primary" disabled={!canGo} onClick={next}>{last ? (multiPart ? 'Finish this part ✓' : 'Finish episode ✓') : <>Continue <span className="arrow">→</span></>}</button>}
        </div>
      </main>

      {sheet === 'steps' && <Sheet title="Steps in this episode" side="left" onClose={() => setSheet(null)}><StepsList runner={runner} viewing={view} onPick={pickStep} /></Sheet>}
      {sheet === 'tables' && (
        <Sheet title="Case database" wide onClose={() => setSheet(null)}>
          <p className="muted small" style={{ marginTop: 0 }}>Every table you can query right now{beat.type === 'task' ? ', as they stand at the start of this task' : ''}. Rows and schema.</p>
          <TablesDrawer snapshot={runner.pack.snapshot} setup={beat.type === 'task' ? beat.setup : undefined} learnerSql={beat.type === 'task' ? runner.beatState(beat.id).passSql : undefined} />
        </Sheet>
      )}
      {sheet === 'evidence' && (
        <Sheet title="Evidence" onClose={() => setSheet(null)}>
          {pinnedClues.length === 0 && <p className="muted">Nothing pinned in this episode yet. Solve tasks to find evidence.</p>}
          <div style={{ display: 'grid', gap: 16 }}>
            {pinnedClues.map((c) => (
              <article key={c.clue_id} className="evi"><div className="tag">This episode · {c.clue_id}</div><h4>{c.title}</h4><Markdown source={c.body} /></article>
            ))}
          </div>
          {runner.pack.previously.length > 0 && <>
            <h3 style={{ margin: '22px 0 10px', fontSize: 15 }}>The case so far</h3>
            <div style={{ display: 'grid', gap: 16 }}>
              {runner.pack.previously.map((c) => (
                <article key={c.clue_id} className="evi briefed"><div className="tag">{c.session === session ? 'Earlier in this episode' : `${episodeTitle(c.session)} · ${storyTime(c.session)}`}</div><h4>{c.title}</h4><Markdown source={c.body} /></article>
              ))}
            </div>
          </>}
        </Sheet>
      )}
    </div>
  );
}
