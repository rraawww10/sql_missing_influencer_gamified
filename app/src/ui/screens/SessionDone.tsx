// Episode solved: confetti, points that count up, the rank bar, new clues, the feedback card (required), and where to go next.
import { badgeOf, nextTier, pinnedBadges, setPinned, PASS_PCT } from '../badges';
import { Medal } from '../components/Medal';
import { useCallback, useEffect, useState } from 'react';
import { useProgress } from '../useProgress';
import { useServices } from '../services';
import { postToParent } from '../embed';
import { ResetControl } from '../components/ResetControl';
import { Confetti } from '../components/Confetti';
import { progressOf, RANKS } from '../../engine/progress/derive';
import type { SessionPack } from '../../content/types';
import { episodeOf, episodeTitle, unitLabel, EPISODE_COUNT } from '../episodes';
import { storyTime } from '../speakers';
import { FeedbackCard } from '../components/FeedbackCard';
import { KaalCard } from '../kaal/KaalCard';
import { SAY, TEASE } from '../kaal/lines';
import { sfx } from '../sound';
import { kaal } from '../kaal/bus';
import { rankIcon, nextRank, solvedCount, takePromotion } from '../ranks';
import { Backdrop } from '../design/Backdrop';
import { Icon } from '../design/Icon';
import { TopBar } from '../components/TopBar';

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
  const points = useCountUp(p?.points ?? 0);
  // the episode's score out of 100 % and its badge (whole episodes only; a part of an episode has no badge)
  const badge = whole?.status === 'completed' && !(pack?.unit && pack.unit.parts > 1) ? badgeOf(session, whole.points) : null;
  const pctShown = useCountUp(badge?.pct ?? 0);
  const [pinned, setPinnedState] = useState(() => pinnedBadges().includes(session));
  const togglePin = () => setPinnedState(setPinned(session, !pinned).includes(session));
  // "Promoted!" once, on the episode that earns a new rank
  const [promoted, setPromoted] = useState<string | null>(null);
  useEffect(() => { if (whole?.status === 'completed' && !promoted) { const r = takePromotion(progress); if (r) setPromoted(r); } }, [progress, whole?.status, promoted]);
  const upNext = nextRank(solvedCount(progress));
  // the next steps unlock once this episode's feedback is in (FeedbackCard is required)
  const [fbDone, setFbDone] = useState(false);
  const markFb = useCallback(() => setFbDone(true), []);

  // tell the embedding page (once per completion) that this episode / unit is solved
  useEffect(() => {
    if (!p || p.status !== 'completed' || !p.completedAt) return;
    const key = `tmi.completed-posted.s${session}${unit ? `.u${unit.n}` : ''}.${p.completedAt}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* still post */ }
    postToParent('completed', { session, points: p.points, hints: p.hintsUsed, traps: p.trapsFound,
      ...(unit ? { unit: unit.n, unit_id: unit.unit_id, part: unit.part, parts: unit.parts, session_completed: whole?.status === 'completed' } : {}) });
  }, [p, session, unit, whole?.status]);

  useEffect(() => { const t = setTimeout(() => { sfx('solved'); kaal('solved', { silent: true, mute: true, line: '' }); }, 300); return () => clearTimeout(t); }, []);
  const multiPart = !!unit && unit.parts > 1;
  // below the pass mark the next episode stays locked: replay this one (the best try counts)
  const short = !!badge && !standalone && badge.pct < PASS_PCT && session < EPISODE_COUNT;
  const nextN = session + 1 <= EPISODE_COUNT ? session + 1 : null;
  // how far along the rank ladder: from the current rank's threshold to the next one's
  const solvedN = solvedCount(progress);
  const fromN = [...RANKS].reverse().find((r) => r.minSessions <= solvedN)?.minSessions ?? 0;
  const rankPct = upNext ? Math.round(((solvedN - fromN) / Math.max(1, solvedN + upNext.left - fromN)) * 100) : 100;
  return (
    <div className="page">
      <Backdrop />
      <Confetti count={60} rain />
      <div className="page-inner">
        <TopBar time={storyTime(session)} rank={progress?.rank}>
          <button className="btn small ghost" disabled={!fbDone} onClick={onMap}><Icon name={standalone ? 'pin' : 'map'} /> {standalone ? 'Evidence Board' : 'Case map'}</button>
        </TopBar>

        <section className="win result-hero">
          <div className="win-big">
            <span className="pill mint"><Icon name="tick" /> Episode {session} · {storyTime(session)}</span>
            <h1 className="shadowed">{multiPart ? `Part ${unit!.part} of ${unit!.parts} solved` : `Solved: ${title}`}</h1>
            {unit && !unit.finale && <p className="unit-line"><Icon name="scroll" /> {unitLabel(unit)}{whole?.status === 'completed' && multiPart && <> · all {unit.parts} parts of {title} done</>}</p>}
            {p && (
              <div className="stats score">
                <div className="stat"><b>{points}</b><span>points</span></div>
                <div className="stat"><b>{p.hintsUsed}</b><span>hint{p.hintsUsed === 1 ? '' : 's'} used</span></div>
                <div className="stat"><b>{p.trapsFound}</b><span>trap{p.trapsFound === 1 ? '' : 's'} spotted</span></div>
              </div>
            )}
            {badge && (
              <div className="surface card score-card pop-in" role="status" aria-label={`Episode score ${badge.pct} percent. ${badge.tier.name} badge: ${badge.name}`}>
                <Medal tier={badge.tier.id} icon={badge.icon} episode={session} size={110} />
                <div>
                  <span className="cap">Episode score · badge earned</span>
                  <div className="score-line"><span className="score-pct">{pctShown}%</span><span className={`tier-pill ${badge.tier.id}`}><Icon name="medal" /> {badge.tier.name}</span></div>
                  <h3>{badge.name}</h3>
                  <div className="score-bar" aria-hidden="true"><i style={{ width: `${badge.pct}%` }} /></div>
                  <p className="muted small">{badge.points} of {badge.max} points · {badge.tier.line}
                    {(() => { const up = nextTier(badge.pct); return up ? ` Replay to reach ${up.name} at ${up.min}%.` : ''; })()}</p>
                  <div className="row">
                    <button type="button" className={`btn small ${pinned ? 'ghost' : 'primary'}`} onClick={togglePin} aria-pressed={pinned}>
                      <Icon name="pin" /> {pinned ? 'Pinned to your badge wall' : 'Pin to my badge wall'}</button>
                  </div>
                </div>
              </div>
            )}
            {promoted && (
              <div className="surface card promotion pop-in" role="status">
                <Icon name={rankIcon(promoted)} className="xl" />
                <div><div className="cap">Achievement unlocked · Promoted!</div>
                  <h3>You are now a {promoted}</h3>
                  <p>{upNext ? `${upNext.left} more episode${upNext.left === 1 ? '' : 's'} to become ${upNext.name}.` : 'The highest rank in the Data Cell. Case closed, Inspector.'}</p></div>
              </div>
            )}
            {progress && (
              <div className="rankbar">
                <div className="row between"><span className="rank-badge"><Icon name={rankIcon(progress.rank)} /> Rank: {progress.rank}</span>
                  {upNext ? <span>{upNext.left} more episode{upNext.left === 1 ? '' : 's'} to {upNext.name}</span> : <span>Top rank reached</span>}</div>
                <div className="xp" aria-hidden="true"><i style={{ width: `${Math.max(6, rankPct)}%` }} /></div>
              </div>
            )}
            {progress && progress.badges.length > 0 && <p className="row">{progress.badges.map((x) => <span key={x} className="pill white"><Icon name="medal" /> {x}</span>)}</p>}
            {clues.length > 0 && <div className="stack" style={{ gap: 8 }}><span className="cap">New on your Evidence Board</span><p className="row">{clues.map((c) => <span key={c.clue_id} className="pill white wrap"><Icon name="pin" /> {c.title}</span>)}</p></div>}
            {standalone && <p className="muted">Well done. {unit && unit.part < unit.parts ? 'Open the next reading material to continue the case.' : 'Continue with the next part of your course to follow the case.'}</p>}
            <KaalCard mood="cheer" title="Kaal · your assistant" line={promoted && session !== EPISODE_COUNT ? SAY.promoted(promoted) : session === EPISODE_COUNT ? SAY.caseClosed : SAY.goodWork} />
          </div>

          <div className="win-side">
            <FeedbackCard session={session} onDone={markFb} />
            <div className="surface card next-card">
              {!fbDone && <p className="locknote"><Icon name="lock" /> Send your feedback to unlock the next episode.</p>}
              {short && <p className="locknote"><Icon name="lock" /> You need at least {PASS_PCT}% to open the next episode. You scored {badge!.pct}%. Play this episode again; your best try counts.</p>}
              <div className="row">
                {short && <button className="btn primary big go" disabled={!fbDone} onClick={onReset}>Play this episode again <Icon name="right" /></button>}
                {hasNext && !short && <button className="btn primary big go" disabled={!fbDone} onClick={onNext}>Next episode: {episodeOf(session + 1).title} <Icon name="right" /></button>}
                <button className={`btn ${hasNext || short ? 'ghost' : 'primary big'}`} disabled={!fbDone} onClick={onMap}>{standalone ? 'See the Evidence Board' : 'Back to the case map'}</button>
              </div>
              {nextN && !multiPart && (
                <div className="next-lead">
                  <span className="cap">Coming up · {storyTime(nextN)}</span>
                  <h3>{episodeOf(nextN).title}</h3>
                  <p>{TEASE[nextN] ?? episodeOf(nextN).teaser}</p>
                </div>
              )}
              <ResetControl session={session} label={multiPart ? 'Reset this part and play again' : 'Reset this episode and play again'} small onDone={onReset} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
