// Runs one activity: renders the right widget, submits to the runner, shows feedback.
// After MAX_ACTIVITY_TRIES wrong tries the answer is revealed and the learner can continue.
import { useState } from 'react';
import type { ActivityBeat } from '../../content/types';
import { MAX_ACTIVITY_TRIES, type SessionRunner } from '../../engine/runner/sessionRunner';
import type { ActivityAnswer, ActivityResult } from '../../engine/activities/check';
import { Markdown } from '../components/Markdown';
import { Confetti } from '../components/Confetti';
import { SortInto } from './SortInto';
import { MatchPairs } from './MatchPairs';
import { OrderSteps } from './OrderSteps';
import { PickCell } from './PickCell';
import { MultiSelect } from './MultiSelect';

export interface WidgetProps<B extends ActivityBeat> {
  beat: B;
  locked: boolean;                 // finished: show the final state, no more input
  parts?: Record<string, boolean>; // last result, for highlighting
  reveal: boolean;                 // show the correct answer
  onSubmit(answer: ActivityAnswer): void;
}

interface Props { runner: SessionRunner; beat: ActivityBeat; review?: boolean; onChanged(): void }

export function ActivityPanel({ runner, beat, review = false, onChanged }: Props) {
  const st = runner.beatState(beat.id);
  const [last, setLast] = useState<(ActivityResult & { revealed: boolean; attempts: number }) | null>(null);
  const done = st.done;
  const reveal = !!st.revealed || (review && done);   // looking back: show the right answer

  const submit = async (answer: ActivityAnswer) => {
    setLast(await runner.answerActivity(answer));
    onChanged();
  };

  const common = { locked: done, parts: last?.parts, reveal, onSubmit: submit };
  const right = last ? Object.values(last.parts).filter(Boolean).length : 0;
  const total = last ? Object.keys(last.parts).length : 0;

  return (
    <section className="fade-in" aria-label="Activity" style={{ maxWidth: 900, margin: '0 auto', position: 'relative' }}>
      {last?.correct && <Confetti count={34} />}
      <div className="stage-label">🧩 Activity{done && <span className="sticker flat">✓ done</span>}</div>
      <div className="quiz-q" style={{ fontSize: 'clamp(18px, 2.6vw, 24px)' }}><Markdown source={beat.prompt} /></div>
      <div className="board">
        {beat.kind === 'sort_into' && <SortInto beat={beat} {...common} />}
        {beat.kind === 'match' && <MatchPairs beat={beat} {...common} />}
        {beat.kind === 'order' && <OrderSteps beat={beat} {...common} />}
        {beat.kind === 'pick_cell' && <PickCell beat={beat} {...common} />}
        {beat.kind === 'multi_select' && <MultiSelect beat={beat} {...common} />}
      </div>
      <div aria-live="polite">
        {done && !reveal && <div className="feedback right"><b>✓ Well done.</b> {beat.feedback && <Markdown source={beat.feedback} />}</div>}
        {done && reveal && <div className="feedback"><b>Here’s the answer.</b> {beat.feedback && <Markdown source={beat.feedback} />}</div>}
        {!done && last && !last.correct && (
          <div className="feedback nope" key={last.attempts}>
            {total > 1 ? <>{right} of {total} right. </> : <>Not quite. </>}
            Try again — {MAX_ACTIVITY_TRIES - last.attempts} {MAX_ACTIVITY_TRIES - last.attempts === 1 ? 'try' : 'tries'} left before we show the answer.
          </div>
        )}
      </div>
    </section>
  );
}
