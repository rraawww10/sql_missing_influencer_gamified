// Every clue with the learner's own query that proved it (earned, red pin, "PROVED" stamp).
// In a standalone episode, earlier clues the learner hasn't earned here are shown as briefed (grey card).
import { useEffect, useState } from 'react';
import type { BriefedClue } from '../../content/types';
import { useServices } from '../services';
import { useProgress } from '../useProgress';
import { Markdown } from '../components/Markdown';
import { storyTime } from '../speakers';
import { episodeTitle } from '../episodes';
import { KaalCard } from '../kaal/KaalCard';

export function EvidenceBoard({ onBack, session }: { onBack(): void; session?: number }) {
  const { loader } = useServices();
  const { progress } = useProgress();
  const [briefed, setBriefed] = useState<BriefedClue[]>([]);
  useEffect(() => { if (session) loader.pack(session).then((p) => setBriefed(p.previously)).catch(() => {}); }, [loader, session]);

  const earned = (progress?.evidence ?? []).filter((c) => !session || c.session <= session);
  const earnedIds = new Set(earned.map((c) => c.clue_id));
  const cards = [
    ...briefed.filter((c) => !earnedIds.has(c.clue_id)).map((c) => ({ ...c, kind: 'briefed' as const })),
    ...earned.map((c) => ({ ...c, kind: 'earned' as const })),
  ].sort((a, b) => a.session - b.session || a.clue_id.localeCompare(b.clue_id));

  return (
    <div className="page">
      <div className="page-inner">
        <nav className="topnav">
          <span className="brand">SQL: The Missing Influencer</span>
          <button className="btn small ghost" onClick={onBack}>{session ? '← Episode' : '← Case map'}</button>
        </nav>
        <div className="row"><span className="sticker">{cards.length} clue{cards.length === 1 ? '' : 's'}</span></div>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', margin: '10px 0 6px' }}>📌 Evidence Board</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Every clue you proved, with the query that proved it.{briefed.length > 0 && ' Grey cards were briefed by the team from earlier parts of the case.'}
        </p>
        <div style={{ margin: '14px 0 18px' }}>
          <KaalCard mood={cards.length ? 'think' : 'point'} line={cards.length
            ? `${cards.length} piece${cards.length === 1 ? '' : 's'} of evidence, {you}. Read them in order - the red string shows how the night unfolds.`
            : 'An empty board. Solve a task, pin what you prove, and it starts to fill.'} />
        </div>
        <div className="wall board-cork">
          {cards.length > 1 && <svg className="strings" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
            {cards.slice(1).map((_, i) => { const n = cards.length; const x1 = 8 + (i % 3) * 33, y1 = 6 + Math.floor(i / 3) * (88 / Math.ceil(n / 3)); const x2 = 8 + ((i + 1) % 3) * 33, y2 = 6 + Math.floor((i + 1) / 3) * (88 / Math.ceil(n / 3));
              return <path key={i} d={`M${x1 + 10} ${y1} Q ${(x1 + x2) / 2 + 10} ${Math.max(y1, y2) + 6} ${x2 + 10} ${y2}`} vectorEffect="non-scaling-stroke" style={{ animationDelay: `${i * 0.15}s` }} />; })}
          </svg>}
          {progress && cards.length === 0 && <p className="muted" style={{ margin: 0 }}>No clues yet. Solve tasks to pin evidence here.</p>}
          <div className="evidence">
            {cards.map((c, i) => (
              <article key={c.clue_id} className={`evi ${c.kind} rise`} style={{ '--i': i } as React.CSSProperties}>
                <div className="tag">{episodeTitle(c.session)} · {storyTime(c.session)} · {c.clue_id}{c.kind === 'briefed' ? ' · briefed' : ''}</div>
                <h3>{c.title}</h3>
                <Markdown source={c.body} />
                {'sql' in c && c.sql && <><p className="small" style={{ margin: '10px 0 4px', color: '#6b5a3a' }}>Proved by your query ({c.task_id}):</p><pre className="sql wrap">{c.sql}</pre></>}
                <span className="stamp" style={'sql' in c && c.sql ? { position: 'static', display: 'inline-block', marginTop: 10 } : undefined}>{c.kind === 'earned' ? 'Proved' : 'Briefed'}</span>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
