// Episode solved: confetti, a medal, points that count up, new clues, and where to go next.
import { useEffect, useState } from 'react';
import { useProgress } from '../useProgress';
import { useServices } from '../services';
import { postToParent } from '../embed';
import { SceneArt } from '../art/SceneArt';
import { ResetControl } from '../components/ResetControl';
import { Confetti } from '../components/Confetti';
import { progressOf } from '../../engine/progress/derive';
import type { SessionPack } from '../../content/types';
import { episodeOf, episodeTitle, unitLabel } from '../episodes';

interface Props { session: number; onNext(): void; onMap(): void; onReset(): void; hasNext: boolean; standalone?: boolean }

// numbers count up from 0 (skipped with reduced motion)
function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / ms); setV(Math.round(target * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function SessionDone({ session, onNext, onMap, onReset, hasNext, standalone = false }: Props) {
  const { progress } = useProgress();
  const { loader } = useServices();
  const [pack, setPack] = useState<SessionPack | null | undefined>(undefined);   // undefined = not loaded yet
  useEffect(() => { loader.pack(session).then(setPack).catch(() => setPack(null)); }, [loader, session]);
  const unit = pack?.unit ?? null;
  const p = pack === undefined ? null : progressOf(progress, session, unit?.n);
  const whole = progress?.sessions[session - 1];
  const clues = (progress?.evidence ?? []).filter((c) => c.session === session);
  const title = episodeTitle(session, pack?.title);
  const ep = episodeOf(session);
  const points = useCountUp(p?.points ?? 0);

  // tell the embedding page (once per completion) that this episode / unit is solved
  useEffect(() => {
    if (!p || p.status !== 'completed' || !p.completedAt) return;
    const key = `tmi.completed-posted.s${session}${unit ? `.u${unit.n}` : ''}.${p.completedAt}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* still post */ }
    postToParent('completed', { session, points: p.points, hints: p.hintsUsed, traps: p.trapsFound,
      ...(unit ? { unit: unit.n, unit_id: unit.unit_id, part: unit.part, parts: unit.parts, session_completed: whole?.status === 'completed' } : {}) });
  }, [p, session, unit, whole?.status]);

  const multiPart = !!unit && unit.parts > 1;
  return (
    <div className="page">
      <Confetti count={60} rain />
      <div className="page-inner">
        <nav className="topnav">
          <span className="brand">SQL: The Missing Influencer</span>
          <button className="btn small ghost" onClick={onMap}>{standalone ? '📌 Evidence Board' : '← Case map'}</button>
        </nav>
        <section className="poster art-only"><SceneArt session={session} /></section>
        <section className="panel result-hero pop-in">
          <div className="medal" aria-hidden="true">{ep.emoji}</div>
          <div className="row" style={{ justifyContent: 'center' }}><span className="sticker">Case update</span></div>
          <h2>{multiPart ? `Part ${unit!.part} of ${unit!.parts} solved` : `Solved: ${title}`}</h2>
          {unit && !unit.finale && <p className="muted" style={{ marginTop: 0 }}>📖 {unitLabel(unit)}{whole?.status === 'completed' && multiPart && <> · ✓ all {unit.parts} parts of {title} done</>}</p>}
          {p && (
            <div className="stats" style={{ maxWidth: 560, margin: '14px auto' }}>
              <div className="stat"><b>{points}</b><span>points</span></div>
              <div className="stat"><b>{p.hintsUsed}</b><span>hint{p.hintsUsed === 1 ? '' : 's'} used</span></div>
              <div className="stat"><b>{p.trapsFound}</b><span>trap{p.trapsFound === 1 ? '' : 's'} spotted</span></div>
            </div>
          )}
          {progress && !standalone && <p className="muted">Rank: <b>{progress.rank}</b>{progress.badges.length > 0 && <> · 🏅 {progress.badges.join(', ')}</>}</p>}
          {clues.length > 0 && <p>New on your Evidence Board: {clues.map((c) => <span key={c.clue_id} className="chip accent" style={{ margin: 3 }}>📌 {c.title}</span>)}</p>}
          {standalone && <p className="muted">Well done. {unit && unit.part < unit.parts ? 'Open the next reading material to continue the case.' : 'Continue with the next part of your course to follow the case.'}</p>}
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            {hasNext && <button className="btn primary big go" onClick={onNext}>Next episode: {episodeOf(session + 1).title} →</button>}
            <button className={`btn ${hasNext ? '' : 'primary big'}`} onClick={onMap}>{standalone ? 'See the Evidence Board' : 'Back to the case map'}</button>
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <ResetControl session={session} label={multiPart ? '↺ Reset this part and play again' : '↺ Reset this episode and play again'} small onDone={onReset} />
          </div>
        </section>
      </div>
    </div>
  );
}
