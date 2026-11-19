import { kaal } from '../kaal/bus';
// Story steps on the stage: a chat scene (with a "typing…" beat before each new line), a Learn card (course learning,
// with the case link on its own card below it), and a clue reveal.
import { useEffect, useState } from 'react';
import type { Beat, CastEntry, ClueBeat } from '../../content/types';
import type { SessionRunner } from '../../engine/runner/sessionRunner';
import { speakerOf } from '../speakers';
import { Markdown } from '../components/Markdown';
import { Icon } from '../design/Icon';
import { openReader } from '../reader/store';
import { ScrollArt } from '../reader/ScrollArt';
import { Confetti } from '../components/Confetti';
import { sfx } from '../sound';

type SceneBeat = Extract<Beat, { type: 'scene' | 'hook' }>;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function Line({ beat, cast, faded = false }: { beat: SceneBeat; cast: Record<string, CastEntry>; faded?: boolean }) {
  const s = speakerOf(beat.speaker, cast);
  if (s.key === 'system') return (
    <div className={`surface notification ${faded ? 'faded' : ''}`}>
      <div className="from"><Icon name="bell" /> Notification · now</div>
      <Markdown source={beat.body} />
    </div>
  );
  if (s.key === 'narrator') return (
    <div className={`speech narration ${faded ? 'faded' : ''}`}><Markdown source={beat.body} /></div>
  );
  return (
    <div className={`dialogue ${faded ? 'faded' : ''}`}>
      <div className="portrait" style={{ background: s.color }} aria-hidden="true">{s.initials}</div>
      <div className="surface speech">
        <div className="name">{s.name}{s.role && <span> · {s.role}</span>}</div>
        <Markdown source={beat.body} />
      </div>
    </div>
  );
}

// The line before this one stays on screen (dimmed) so a conversation reads naturally.
// A new line from a person shows "typing…" for a moment first (not for notifications, not with reduced motion).
export function SceneStage({ runner, beat, index }: { runner: SessionRunner; beat: SceneBeat; index: number }) {
  const prev = runner.pack.beats[index - 1];
  const showPrev = prev && (prev.type === 'scene' || prev.type === 'hook');
  const s = speakerOf(beat.speaker, runner.pack.cast);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (s.key === 'system') sfx('notify');
    if (s.key === 'system' || s.key === 'narrator' || reducedMotion()) { setTyping(false); return; }
    setTyping(true);
    const blips = [0, 160, 320, 480].map((ms) => setTimeout(() => sfx('typing'), ms));
    const t = setTimeout(() => setTyping(false), 650);
    return () => { clearTimeout(t); blips.forEach(clearTimeout); };
  }, [beat.id, s.key]);
  return (
    <div className="scene">
      <div className="scene-inner" key={beat.id}>
        <div className="stage-label"><Icon name={beat.type === 'hook' ? 'film' : 'story'} /> {beat.type === 'hook' ? 'Coming up next' : 'Story'}</div>
        <div className="lines">
          {showPrev && <Line beat={prev as SceneBeat} cast={runner.pack.cast} faded />}
          {typing
            ? <div className="dialogue" aria-live="polite" aria-label={`${s.name} is typing`}>
                <div className="portrait" style={{ background: s.color }} aria-hidden="true">{s.initials}</div>
                <div><div className="surface typing"><i /><i /><i /></div></div>
              </div>
            : <Line beat={beat} cast={runner.pack.cast} />}
        </div>
      </div>
    </div>
  );
}

// A Learn step keeps two things apart: what the course teaches (the white card, with the scroll that opens the complete
// reading material) and how it connects to tonight's case (the dark card below it). Students read them separately.
export function NoteStage({ beat, session }: { beat: Extract<Beat, { type: 'note' }>; session: number }) {
  return (
    <div className="lesson" key={beat.id}>
      <div className="stage-label"><Icon name="scroll" /> Learn <span className="topic">{beat.rm_ref.heading}</span></div>
      <article className="surface card lesson-card">
        <span className="cap">From your course · learn this</span>
        <Markdown source={beat.body} />
        <footer className="lesson-foot">
          <button className="learn-btn big" onClick={() => openReader({ session, focus: beat.rm_ref })} aria-label="Learn: open the full reading material">
            <ScrollArt size={46} />
            <span><b>Open the scroll</b><small>The complete reading material for this episode</small></span>
          </button>
        </footer>
      </article>
      {beat.case && (
        <aside className="night card case-card" aria-label="How this connects to the case">
          <span className="cap"><Icon name="pin" /> Case file · how this fits tonight</span>
          <Markdown source={beat.case} />
        </aside>
      )}
    </div>
  );
}

export function ClueStage({ runner, beat, review, onChanged }: { runner: SessionRunner; beat: ClueBeat; review: boolean; onChanged(): void }) {
  const pinned = runner.pinned.includes(beat.clue_id);
  const canPin = runner.canPin(beat);
  const [justPinned, setJustPinned] = useState(false);
  return (
    <div className="reveal" key={beat.id}>
      {justPinned && <Confetti count={36} />}
      <div className="reveal-inner">
        <div className="new"><Icon name="spark" /> New evidence <Icon name="spark" /></div>
        <article className={`surface card evi ${pinned ? 'pinned' : ''}`}>
          <span className="evi-pin" aria-hidden="true"><Icon name="pin" /></span>
          <div className="cap">Clue {beat.clue_id}</div>
          <h3>{beat.title}</h3>
          <Markdown source={beat.body} />
          {pinned && <span className="pill mint stamp">Pinned</span>}
        </article>
        <div className="row center">
          {!pinned && !review && (
            <button className="btn primary big go" disabled={!canPin} onClick={async () => { await runner.pinClue(); setJustPinned(true); kaal('pinned'); onChanged(); }}><Icon name="pin" /> Pin to Evidence Board</button>
          )}
          {!pinned && !canPin && <p className="muted small">Solve task {beat.requires_task} first.</p>}
          {pinned && <p className="muted"><Icon name="pin" /> On your Evidence Board</p>}
        </div>
      </div>
    </div>
  );
}
