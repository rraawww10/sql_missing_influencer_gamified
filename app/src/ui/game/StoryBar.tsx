// Progress like a stories bar: one segment per step of the episode. Finished steps can be opened again (read-only);
// steps ahead show only what kind of step they are — never a clue's title. StepsList is the same thing as a list (in a sheet).
import type { Beat } from '../../content/types';
import type { SessionRunner } from '../../engine/runner/sessionRunner';
import { speakerOf } from '../speakers';

export const ICON: Record<Beat['type'], string> = { scene: '💬', hook: '🎬', note: '📖', task: '💻', clue: '🔎', check: '❓', activity: '🧩', demo: '⚡' };
export const KIND: Record<Beat['type'], string> = { scene: 'Story', hook: 'Coming up', note: 'Case Note', task: 'SQL task', clue: 'Evidence', check: 'Quick check', activity: 'Activity', demo: 'Live demo' };

function firstHeading(md: string): string | undefined {
  return md.match(/^#{1,4}\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, '').trim();
}

export function beatLabel(runner: SessionRunner, b: Beat, revealed: boolean): string {
  if (!revealed) return KIND[b.type];
  switch (b.type) {
    case 'scene': case 'hook': { const s = speakerOf(b.speaker, runner.pack.cast); return s.key === 'narrator' ? KIND[b.type] : s.key === 'system' ? 'Notification' : s.name; }
    case 'note': return firstHeading(b.body) ?? b.rm_ref.heading;
    case 'task': return `Task ${b.task_id}`;
    case 'clue': return b.title;
    default: return KIND[b.type];
  }
}

interface Props { runner: SessionRunner; viewing: number; onPick(i: number): void }

export function StoryBar({ runner, viewing, onPick }: Props) {
  const beats = runner.pack.beats;
  return (
    <nav className="storybar" aria-label="Steps of this episode">
      {beats.map((b, i) => {
        const done = i < runner.index || !!runner.beatState(b.id)?.done;
        const reachable = i <= runner.index;
        const cls = ['seg', b.type, done && 'done', i === runner.index && 'current', i === viewing && i !== runner.index && 'viewing'].filter(Boolean).join(' ');
        const label = `Step ${i + 1} of ${beats.length}: ${reachable ? beatLabel(runner, b, true) : KIND[b.type]}`;
        return <button key={b.id} className={cls} disabled={!reachable} title={label} aria-label={label} aria-current={i === viewing ? 'step' : undefined} onClick={() => onPick(i)} />;
      })}
    </nav>
  );
}

export function StepsList({ runner, viewing, onPick }: Props) {
  const beats = runner.pack.beats;
  return (
    <ol className="steps">
      {beats.map((b, i) => {
        const done = i < runner.index || !!runner.beatState(b.id)?.done;
        const reachable = i <= runner.index;
        const cls = ['step-item', done && 'done', i === runner.index && 'current', i === viewing && i !== runner.index && 'viewing'].filter(Boolean).join(' ');
        return (
          <li key={b.id}>
            <button className={cls} disabled={!reachable} onClick={() => onPick(i)} aria-current={i === viewing ? 'step' : undefined}>
              <span className="ico" aria-hidden="true">{done && i !== runner.index ? '✓' : ICON[b.type]}</span>
              <span className="lbl">{reachable ? beatLabel(runner, b, true) : KIND[b.type]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
