// A quick check from the mentor: one answer; the explanation is the lesson either way.
import { useState } from 'react';
import type { CheckBeat } from '../../content/types';
import type { SessionRunner } from '../../engine/runner/sessionRunner';
import { speakerOf } from '../speakers';
import { Markdown } from './Markdown';
import { Confetti } from './Confetti';

export function CheckPanel({ runner, beat, onChanged }: { runner: SessionRunner; beat: CheckBeat; onChanged(): void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const done = runner.beatState(beat.id).done;
  const mentor = runner.pack.cast.mentor ? speakerOf('mentor', runner.pack.cast) : null;
  const answer = async (i: number) => {
    setPicked(i);
    await runner.answerCheck(i);
    onChanged();
  };
  const correctIdx = beat.options.findIndex((o) => o.correct);
  const right = picked !== null && picked === correctIdx;
  return (
    <section className="fade-in" aria-label="Quick check" style={{ maxWidth: 760, margin: '0 auto', position: 'relative' }}>
      {right && <Confetti count={30} />}
      <div className="stage-label">❓ Quick check{mentor && <> · {mentor.name} asks</>}</div>
      <div className="quiz-q"><Markdown source={beat.prompt} /></div>
      <div className="choices">
        {beat.options.map((o, i) => {
          const cls = ['choice', done && i === correctIdx && 'right', done && picked === i && i !== correctIdx && 'wrong'].filter(Boolean).join(' ');
          return (
            <button key={i} className={cls} disabled={done} onClick={() => answer(i)} style={{ '--i': i } as React.CSSProperties}>
              <span className="letter" aria-hidden="true">{done && i === correctIdx ? '✓' : String.fromCharCode(65 + i)}</span>
              <Markdown source={o.text} />
            </button>
          );
        })}
      </div>
      {done && (
        <div className={`feedback ${picked === null || picked === correctIdx ? 'right' : 'nope'}`} aria-live="polite">
          {picked !== null && <b>{picked === correctIdx ? '✓ Right. ' : 'Not this time. '}</b>}
          <Markdown source={beat.explain} />
        </div>
      )}
    </section>
  );
}
