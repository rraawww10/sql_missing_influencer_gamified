// Case map: the night's timeline (6 PM → 12 AM), one card per episode — named after what happens, never numbered.
import { useEffect, useState } from 'react';
import type { SessionIndexEntry } from '../../content/types';
import { SESSION_COUNT } from '../../engine/progress/derive';
import { useServices } from '../services';
import { useProgress } from '../useProgress';
import { storyTime } from '../speakers';
import { SceneArt } from '../art/SceneArt';
import { themeVars } from '../theme';
import { episodeOf } from '../episodes';

export function Home({ onOpen, onEvidence, onBriefing }: { onOpen(n: number): void; onEvidence(): void; onBriefing(): void }) {
  const { loader } = useServices();
  const { progress } = useProgress();
  const [built, setBuilt] = useState<SessionIndexEntry[]>([]);
  useEffect(() => { loader.index().then(setBuilt).catch(() => setBuilt([])); }, [loader]);
  const solved = progress?.sessions.filter((s) => s.status === 'completed').length ?? 0;
  const nextUp = progress?.sessions.find((s) => s.status === 'available')?.session;

  return (
    <div className="page themed" style={themeVars(13) as React.CSSProperties}>
      <div className="page-inner">
        <nav className="topnav"><span className="brand">Police Data Cell · Case file</span>{progress && <span className="chip accent">🎖 {progress.rank}</span>}</nav>
        <section className="poster">
          <SceneArt session={13} />
          <div className="poster-body map-hero">
            <div className="stickers"><span className="sticker">A SQL mystery</span><span className="sticker paper">{SESSION_COUNT} episodes · one night</span></div>
            <h1 className="gradient-text">{built[0]?.headline ?? ''}</h1>
            <p>{built[0]?.premise}</p>
            <div className="row" style={{ marginTop: 8 }}>
              {solved === 0 && <button className="btn pop big" onClick={onBriefing}>📋 Read the briefing first</button>}
              {nextUp && <button className="btn primary big go" onClick={() => onOpen(nextUp)}>▶ {solved === 0 ? 'Start' : 'Continue'}: {episodeOf(nextUp).title}</button>}
              {solved > 0 && <button className="btn ghost" onClick={onBriefing}>📋 Briefing</button>}
            </div>
          </div>
        </section>
        {progress && (
          <div className="stats">
            <div className="stat"><b>{progress.totalPoints}</b><span>points</span></div>
            <div className="stat"><b>{solved}/{SESSION_COUNT}</b><span>episodes solved</span></div>
            <button className="stat" onClick={onEvidence}><b>{progress.evidence.length}</b><span>clues pinned ›</span></button>
          </div>
        )}
        {progress && progress.badges.length > 0 && <p className="row">{progress.badges.map((b) => <span key={b} className="chip">🏅 {b}</span>)}</p>}

        <h2 style={{ margin: '26px 0 0', fontSize: 24 }}>Tonight, 6 PM → midnight</h2>
        <ol className="timeline" aria-label="Episodes">
          {Array.from({ length: SESSION_COUNT }, (_, i) => i + 1).map((n) => {
            const p = progress?.sessions[n - 1];
            const b = built.find((x) => x.session === n);
            const ep = episodeOf(n);
            const status = !b ? 'soon' : p?.status ?? 'locked';
            return (
              <li key={n} className={`stop themed rise ${status === 'soon' ? 'locked' : status}`} style={{ ...themeVars(n), '--i': n } as React.CSSProperties}>
                <SceneArt session={n} height={120} />
                {status === 'available' && <span className="sticker badge-corner">▶ up next</span>}
                {status === 'completed' && <span className="sticker badge-corner" style={{ background: 'var(--success)' }}>✓ solved</span>}
                <div className="stop-body">
                  <span className="time">🕕 {storyTime(n)}</span>
                  <h3>{ep.emoji} {b?.title ?? ep.title}</h3>
                  <p className="teaser">{ep.teaser}</p>
                  <span className="muted small">
                    {status === 'completed' && `${p!.points} pts · ${b!.minutes} min`}
                    {status === 'available' && `~${b!.minutes} min · ${ep.learn}`}
                    {status === 'locked' && '🔒 Solve the episode before this one'}
                    {status === 'soon' && 'Coming soon'}
                  </span>
                  {(status === 'available' || status === 'completed') && (
                    <div className="stop-cta"><button className={`btn small ${status === 'available' ? 'primary' : ''}`} onClick={() => onOpen(n)}>
                      {status === 'completed' ? 'Replay' : 'Play'}
                    </button></div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

      </div>
    </div>
  );
}
