// Story steps on the stage: a cinematic scene (with a "typing…" beat before each new line), a Case Note card, and a clue reveal.
import { useEffect, useState } from 'react';
import type { Beat, CastEntry, ClueBeat } from '../../content/types';
import type { SessionRunner } from '../../engine/runner/sessionRunner';
import { speakerOf } from '../speakers';
import { Markdown } from '../components/Markdown';
import { SceneArt } from '../art/SceneArt';
import { Sheet } from '../components/Sheet';
import { CourseNote } from '../components/CourseNote';
import { Confetti } from '../components/Confetti';

type SceneBeat = Extract<Beat, { type: 'scene' | 'hook' }>;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function Line({ beat, cast, faded = false }: { beat: SceneBeat; cast: Record<string, CastEntry>; faded?: boolean }) {
  const s = speakerOf(beat.speaker, cast);
  if (s.key === 'system') return (
    <div className={`notification ${faded ? 'faded' : ''}`}>
      <div className="app"><i aria-hidden="true">🔔</i> Notification · now</div>
      <Markdown source={beat.body} />
    </div>
  );
  if (s.key === 'narrator') return (
    <div className={`speech narration ${faded ? 'faded' : ''}`}><Markdown source={beat.body} /></div>
  );
  return (
    <div className={`dialogue ${faded ? 'faded' : ''}`}>
      <div className="portrait" style={{ background: s.color }} aria-hidden="true">{s.initials}</div>
      <div className="speech">
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
    if (s.key === 'system' || s.key === 'narrator' || reducedMotion()) { setTyping(false); return; }
    setTyping(true);
    const t = setTimeout(() => setTyping(false), 650);
    return () => clearTimeout(t);
  }, [beat.id, s.key]);
  return (
    <div className="scene">
      <div className="scene-bg" aria-hidden="true"><SceneArt session={runner.pack.session} fill /></div>
      <div className="scene-inner" key={beat.id}>
        <div className="stage-label">{beat.type === 'hook' ? '🎬 Coming up next' : '💬 Story'}</div>
        <div style={{ display: 'grid', gap: 14 }}>
          {showPrev && <Line beat={prev as SceneBeat} cast={runner.pack.cast} faded />}
          {typing
            ? <div className="dialogue" aria-live="polite" aria-label={`${s.name} is typing`}>
                <div className="portrait" style={{ background: s.color }} aria-hidden="true">{s.initials}</div>
                <div><div className="typing"><i /><i /><i /></div></div>
              </div>
            : <Line beat={beat} cast={runner.pack.cast} />}
        </div>
      </div>
    </div>
  );
}

export function NoteStage({ beat }: { beat: Extract<Beat, { type: 'note' }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lesson" key={beat.id}>
      <div className="stage-label">📖 Case Note <span className="sticker flat">learn this</span><span className="topic">{beat.rm_ref.heading}</span></div>
      <article className="lesson-card">
        <Markdown source={beat.body} />
        <footer className="lesson-foot">
          <button className="btn" onClick={() => setOpen(true)}>📚 Read the full course note</button>
          <span className="muted small">The exact section of the course this note comes from — same words, more examples.</span>
        </footer>
      </article>
      {open && (
        <Sheet title="Course note" onClose={() => setOpen(false)}>
          <CourseNote refs={[beat.rm_ref, ...(beat.see_also ?? [])]} />
        </Sheet>
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
      <div style={{ width: '100%', maxWidth: 520, position: 'relative' }}>
        <div className="new">✦ New evidence ✦</div>
        <article className="evi">
          <div className="tag">Clue {beat.clue_id}</div>
          <h3>{beat.title}</h3>
          <Markdown source={beat.body} />
          {pinned && <span className="stamp">Pinned</span>}
        </article>
        <div className="row" style={{ justifyContent: 'center', marginTop: 22 }}>
          {!pinned && !review && (
            <button className="btn primary big go" disabled={!canPin} onClick={async () => { await runner.pinClue(); setJustPinned(true); onChanged(); }}>📌 Pin to Evidence Board</button>
          )}
          {!pinned && !canPin && <p className="muted small">Solve task {beat.requires_task} first.</p>}
          {pinned && <p className="muted" style={{ margin: 0 }}>📌 On your Evidence Board</p>}
        </div>
      </div>
    </div>
  );
}
