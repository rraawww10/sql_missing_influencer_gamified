// Every clue with the learner's own query that proved it (earned, with a red pin and "Proved").
// In a standalone episode, earlier clues the learner hasn't earned here are shown as briefed (paler card).
import { useEffect, useState } from 'react';
import type { BriefedClue } from '../../content/types';
import { useServices } from '../services';
import { useProgress } from '../useProgress';
import { Markdown } from '../components/Markdown';
import { storyTime } from '../speakers';
import { episodeTitle } from '../episodes';
import { KaalCard } from '../kaal/KaalCard';
import { Backdrop } from '../design/Backdrop';
import { Icon } from '../design/Icon';
import { TopBar } from '../components/TopBar';
import { themeVars } from '../theme';
import { SAY } from '../kaal/lines';

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
    <div className="page" style={session ? undefined : themeVars(9) as React.CSSProperties}>
      <Backdrop />
      <div className="page-inner">
        <TopBar rank={progress?.rank}>
          <button className="btn small ghost" onClick={onBack}><Icon name={session ? 'left' : 'map'} /> {session ? 'Episode' : 'Case map'}</button>
        </TopBar>
        <div className="stack">
          <div className="row"><span className="pill sun"><Icon name="pin" /> {cards.length} clue{cards.length === 1 ? '' : 's'}</span></div>
          <h1 className="shadowed">Evidence Board</h1>
          <p className="sub">Every clue you proved, with the query that proved it.{briefed.length > 0 && ' Paler cards were briefed by the team from earlier parts of the case.'}</p>
        </div>
        <KaalCard mood={cards.length ? 'think' : 'point'} title="Kaal · your assistant" line={cards.length ? SAY.evidence(cards.length) : SAY.evidenceEmpty} say={cards.length ? SAY.evidenceSay : undefined} />
        {progress && cards.length === 0 && <p className="surface card panel">No clues yet. Solve tasks to pin evidence here.</p>}
        <div className="evidence evidence-board">
          {cards.map((c, i) => (
            <article key={c.clue_id} className={`surface card evi ${c.kind} rise`} style={{ '--i': i } as React.CSSProperties}>
              <span className="evi-pin" aria-hidden="true"><Icon name="pin" /></span>
              <div className="cap">{episodeTitle(c.session)} · {storyTime(c.session)} · {c.clue_id}{c.kind === 'briefed' ? ' · briefed' : ''}</div>
              <h3>{c.title}</h3>
              <Markdown source={c.body} />
              {'sql' in c && c.sql && <><p className="cap">Proved by your query ({c.task_id})</p><pre className="sql wrap">{c.sql}</pre></>}
              <span className={`pill ${c.kind === 'earned' ? 'mint' : ''} stamp`}>{c.kind === 'earned' ? 'Proved' : 'Briefed'}</span>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
