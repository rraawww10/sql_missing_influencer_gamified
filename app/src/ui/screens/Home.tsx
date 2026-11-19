// Case map: tonight's trail from 6 PM to midnight. One round stop per episode; tapping a stop shows that episode
// in the big panel on top, and the whole page takes its colours. Solved stops get a star, the next one hops, locked ones shake.
import { useEffect, useState } from 'react';
import type { SessionIndexEntry } from '../../content/types';
import { SESSION_COUNT } from '../../engine/progress/derive';
import { useServices } from '../services';
import { useProgress } from '../useProgress';
import { storyTime } from '../speakers';
import { SceneArt } from '../art/SceneArt';
import { themeOf, themeVars } from '../theme';
import { episodeOf } from '../episodes';
import { Backdrop } from '../design/Backdrop';
import { Icon } from '../design/Icon';
import { TopBar } from '../components/TopBar';
import { sfx } from '../sound';

type Status = 'completed' | 'available' | 'locked' | 'soon';
const STATE: Record<Status, string> = { completed: 'Solved', available: 'Up next', locked: 'Locked', soon: 'Coming soon' };

export function Home({ onOpen, onEvidence, onBriefing }: { onOpen(n: number): void; onEvidence(): void; onBriefing(): void }) {
  const { loader } = useServices();
  const { progress } = useProgress();
  const [built, setBuilt] = useState<SessionIndexEntry[]>([]);
  useEffect(() => { loader.index().then(setBuilt).catch(() => setBuilt([])); }, [loader]);
  const solved = progress?.sessions.filter((s) => s.status === 'completed').length ?? 0;
  const nextUp = progress?.sessions.find((s) => s.status === 'available')?.session;
  const [picked, setPicked] = useState<number | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const sel = picked ?? nextUp ?? Math.max(1, Math.min(solved, SESSION_COUNT));

  const statusOf = (n: number): Status => {
    if (!built.find((x) => x.session === n)) return 'soon';
    return (progress?.sessions[n - 1]?.status as Status | undefined) ?? 'locked';
  };
  // with every episode open, only the first unsolved one is "Up next"; the others are simply open
  const labelOf = (n: number, st: Status) => (st === 'available' && n !== nextUp ? 'Open' : STATE[st]);
  const pick = (n: number) => {
    setPicked(n);
    const st = statusOf(n);
    if (st === 'locked' || st === 'soon') { setShake(null); requestAnimationFrame(() => setShake(n)); sfx('fail'); }
  };

  const ep = episodeOf(sel);
  const b = built.find((x) => x.session === sel);
  const p = progress?.sessions[sel - 1];
  const status = statusOf(sel);
  const playable = status === 'available' || status === 'completed';

  return (
    <div className="page" style={themeVars(sel) as React.CSSProperties}>
      <Backdrop />
      <div className="page-inner">
        <TopBar time={storyTime(sel)} rank={progress?.rank} full>
          {progress && <>
            <span className="hudchip"><b>{progress.totalPoints}</b>points</span>
            <span className="hudchip" title="Episodes solved"><b>{solved}/{SESSION_COUNT}</b>solved</span>
            <button className="hudchip" onClick={onEvidence} aria-label={`Evidence board: ${progress.evidence.length} clues pinned`}><Icon name="pin" /><b>{progress.evidence.length}</b>clues</button>
          </>}
        </TopBar>
        <div className="countdown" title="Story time left until midnight" aria-hidden="true"><i style={{ width: `${8 + (sel - 1) * 7.6}%` }} /></div>

        <section className="hero" aria-label="Selected episode">
          <div className="hero-info" key={sel}>
            <div className="row">
              <span className="pill sun"><Icon name="clock" /> {storyTime(sel)}</span>
              <span className={`pill ${status === 'completed' ? 'mint' : ''}`}>{status === 'completed' && p ? `Solved · ${p.points} points` : labelOf(sel, status)}</span>
            </div>
            <h1 className="shadowed">{b?.title ?? ep.title}</h1>
            <p className="teaser">{ep.teaser}</p>
            <div className="row">
              <button className={`btn primary big ${status === 'available' ? 'go' : ''}`} disabled={!playable} onClick={() => onOpen(sel)}>
                {playable && <Icon name="play" />}
                {status === 'completed' ? 'Replay this episode' : status === 'available' ? (solved === 0 ? 'Start this episode' : 'Play this episode') : status === 'soon' ? 'Coming soon' : 'Solve the episode before this one'}
              </button>
              <button className={`btn ${solved === 0 ? 'pop' : 'ghost'}`} onClick={onBriefing}><Icon name="flag" /> {solved === 0 ? 'Read the briefing first' : 'Briefing'}</button>
            </div>
          </div>
          <div className="surface card epcard" key={`c${sel}`}>
            <SceneArt session={sel} height={132} />
            <div className="epcard-body">
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <span className="num" aria-hidden="true">{String(sel).padStart(2, '0')}</span>
                <span className="pill">Episode {sel} of {SESSION_COUNT}</span>
              </div>
              <div><span className="cap">SQL you will use</span>
                <ul className="tags">{ep.learn.split(', ').map((x) => <li key={x} className="pill">{x}</li>)}</ul></div>
            </div>
          </div>
        </section>

        {progress && progress.badges.length > 0 && <p className="row" aria-label="Badges">{progress.badges.map((x) => <span key={x} className="pill white"><Icon name="medal" /> {x}</span>)}</p>}

        <section className="trail" aria-label="Episodes">
          <div className="row between"><h2>Tonight's trail</h2><span className="pill">{solved} of {SESSION_COUNT} solved · tap a stop</span></div>
          <ol className="nodes">
            {Array.from({ length: SESSION_COUNT }, (_, i) => i + 1).map((n) => {
              const st = statusOf(n), t = themeOf(n), e = episodeOf(n);
              const title = built.find((x) => x.session === n)?.title ?? e.title;
              return (
                <li key={n}>
                  <button className={`node ${st} ${n === nextUp ? 'next' : ''} ${shake === n ? 'shake' : ''}`} aria-pressed={n === sel}
                    style={{ '--g': `linear-gradient(135deg, ${t.sky[0]}, ${t.sky[1]})` } as React.CSSProperties}
                    aria-label={`Episode ${n}: ${title}, ${storyTime(n)}, ${labelOf(n, st).toLowerCase()}`} title={`${storyTime(n)} · ${title}`}
                    onClick={() => pick(n)} onDoubleClick={() => (st === 'available' || st === 'completed') && onOpen(n)}>
                    <span className="node-face">{st === 'locked' || st === 'soon' ? <Icon name="lock" /> : n}</span>
                    {st === 'completed' && <span className="node-star" aria-hidden="true"><Icon name="star" /></span>}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="hours" aria-hidden="true"><span>6 PM</span><span>7 PM</span><span>8 PM</span><span>9 PM</span><span>10 PM</span><span>11 PM</span><span>12 AM</span></div>
        </section>
      </div>
    </div>
  );
}
