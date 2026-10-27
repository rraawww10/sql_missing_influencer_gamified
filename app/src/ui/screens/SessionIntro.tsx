// Before an episode: a poster, the story clock, what's inside (minutes, tasks, clues), how it works,
// "the case so far" (clues from earlier episodes), and start / continue / reset.
import { useEffect, useState } from 'react';
import type { SessionPack } from '../../content/types';
import { useServices } from '../services';
import { storyTime } from '../speakers';
import { Markdown } from '../components/Markdown';
import { SceneArt } from '../art/SceneArt';
import { ResetControl } from '../components/ResetControl';
import { useProgress } from '../useProgress';
import { progressOf } from '../../engine/progress/derive';
import { packScope } from '../../content/types';
import { episodeOf, episodeTitle, unitLabel } from '../episodes';

interface Props { session: number; onStart(): void; onBack(): void; onBriefing?(): void; standalone?: boolean }

const HOW = [
  { ico: '💬', title: 'Story', text: 'Read the chats and notifications, one step at a time.' },
  { ico: '📖', title: 'Case Notes', text: 'Learn one idea from the course, in the words of the case.' },
  { ico: '💻', title: 'SQL console', text: 'Run queries on the real case database. Hints if you get stuck.' },
  { ico: '📌', title: 'Evidence', text: 'Pin what you prove. Finish the episode to solve it.' },
];

export function SessionIntro({ session, onStart, onBack, onBriefing, standalone = false }: Props) {
  const { loader, auth, sittings } = useServices();
  const { progress, reload } = useProgress();
  const [pack, setPack] = useState<SessionPack | null>(null);
  const [error, setError] = useState('');
  const [resumable, setResumable] = useState(false);
  const [notice, setNotice] = useState('');
  const check = () => Promise.all([auth.currentUser(), loader.pack(session)]).then(([u, p]) => setResumable(sittings.canResume(u.id, packScope(p)))).catch(() => {});
  useEffect(() => {
    loader.pack(session).then(setPack).catch((e) => setError((e as Error).message));
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader, session]);

  if (error) return <div className="page"><div className="page-inner" style={{ paddingTop: 40 }}><div className="panel" role="alert">{error}</div></div></div>;
  if (!pack) return <div className="page"><div className="page-inner" style={{ paddingTop: 40 }}><p className="muted">Loading…</p></div></div>;
  const unit = pack.unit;
  const ep = episodeOf(session);
  const title = episodeTitle(session, pack.title);
  const mine = progressOf(progress, session, unit?.n);
  const done = mine?.status === 'completed';
  const tasks = pack.beats.filter((b) => b.type === 'task').length;
  const clues = pack.beats.filter((b) => b.type === 'clue').length;
  const first = session === 1 && (!unit || unit.part === 1);
  return (
    <div className="page">
      <div className="page-inner">
        <nav className="topnav">
          <span className="brand">SQL: The Missing Influencer</span>
          <button className="btn small ghost" onClick={onBack}>{standalone ? '📌 Evidence Board' : '← Case map'}</button>
        </nav>

        <section className="poster pop-in">
          <SceneArt session={session} />
          <div className="poster-body">
            <div className="stickers">
              <span className="sticker">🕕 {storyTime(session)}</span>
              {unit && unit.parts > 1 && <span className="sticker paper">Part {unit.part} of {unit.parts}</span>}
              {done && <span className="sticker" style={{ background: 'var(--success)' }}>✓ solved · {mine!.points} pts</span>}
            </div>
            <h1>{ep.emoji} {title}</h1>
            {unit && !unit.finale && <p><b>📖 {unitLabel(unit)}</b></p>}
            <p>{standalone ? <><b>{pack.headline}</b> {pack.premise}</> : ep.teaser}</p>
          </div>
        </section>

        <div className="stats">
          <div className="stat rise" style={{ '--i': 0 } as React.CSSProperties}><b>{Math.round(pack.minutes_estimate)}</b><span>minutes, about</span></div>
          {tasks > 0 && <div className="stat rise" style={{ '--i': 1 } as React.CSSProperties}><b>{tasks}</b><span>SQL task{tasks === 1 ? '' : 's'}</span></div>}
          {clues > 0 && <div className="stat rise" style={{ '--i': 2 } as React.CSSProperties}><b>{clues}</b><span>piece{clues === 1 ? '' : 's'} of evidence to find</span></div>}
          <div className="stat rise" style={{ '--i': 3 } as React.CSSProperties}><b>{ep.emoji}</b><span>{ep.learn}</span></div>
        </div>

        <section>
          {notice && <p className="notice" role="status">{notice}</p>}
          <div className="mission-actions">
            <button className="btn primary big go" onClick={onStart}>{resumable ? 'Continue where I left off →' : done ? 'Play again →' : 'Start the episode →'}</button>
            {(resumable || done) && <ResetControl session={session} onDone={() => { setNotice('Progress reset. You can start fresh.'); check(); reload(); }} />}
            {first && onBriefing && <button className="btn ghost" onClick={onBriefing}>📋 New here? Read the briefing</button>}
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>💾 Stop any time — your place is saved on this device.</p>
        </section>

        {(first || standalone) && (
          <section style={{ marginTop: 26 }} aria-label="How it works">
            <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>How this works</h2>
            <div className="howto">
              {HOW.map((h, i) => <div key={h.title} className="how rise" style={{ '--i': i } as React.CSSProperties}><span className="num" aria-hidden="true">{i + 1}</span><div className="ico">{h.ico}</div><b>{h.title}</b><p>{h.text}</p></div>)}
            </div>
          </section>
        )}

        {pack.previously.length > 0 && (
          <section style={{ marginTop: 26 }} aria-label="The case so far">
            <h2 style={{ margin: '0 0 12px', fontSize: 22 }}>The case so far</h2>
            <div className="wall">
              <div className="evidence">
                {pack.previously.map((c) => (
                  <article key={c.clue_id} className="evi">
                    <div className="tag">{c.session === session ? 'Earlier in this episode' : `${episodeTitle(c.session)} · ${storyTime(c.session)}`}</div>
                    <h4>{c.title}</h4>
                    <Markdown source={c.body} />
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
