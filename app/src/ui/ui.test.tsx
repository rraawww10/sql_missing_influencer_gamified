// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toHtml } from './components/Markdown';
import { friendlyError } from './components/TaskPanel';
import { SortInto } from './activities/SortInto';
import { MatchPairs } from './activities/MatchPairs';
import { storyTime } from './speakers';
import type { ActivityBeat, CheckBeat } from '../content/types';
import type { SessionRunner } from '../engine/runner/sessionRunner';
import { ActivityPanel } from './activities/ActivityPanel';
import { CheckPanel } from './components/CheckPanel';
import type { ActivityAnswer } from '../engine/activities/check';

afterEach(cleanup);

describe('Markdown', () => {
  it('maps the course tags and strips anything unsafe', () => {
    const html = toHtml('<Section>\n\n## Title\n\n<MultiLineNote>\n\n**Note** text\n\n</MultiLineNote>\n\n<script>alert(1)</script>\n<img src=x onerror="alert(1)">\n\n```sql|UGLY\nError: x\n```\n</Section>');
    expect(html).toContain('<h2');
    expect(html).toContain('class="rm-note"');
    expect(html).toContain('<strong>Note</strong>');
    expect(html).not.toMatch(/<script|onerror|<Section/i);
    expect(html).toContain('language-sql');
  });
});

describe('friendlyError', () => {
  it('adds a plain-English line under SQLite errors', () => {
    expect(friendlyError('no such table: suspect_list')).toMatch(/table name/);
    expect(friendlyError('near "FORM": syntax error')).toMatch(/spelling/);
  });
});

describe('storyTime', () => {
  it('runs from 6 PM to midnight in 30-minute steps', () => {
    expect([1, 2, 13].map(storyTime)).toEqual(['6:00 PM', '6:30 PM', '12:00 AM']);
  });
});

describe('activity widgets', () => {
  it('SortInto: tap an item, tap a box, then Check', async () => {
    const beat = { id: 'x', type: 'activity', kind: 'sort_into', prompt: 'p', buckets: ['Data', 'Not data'],
      items: [{ text: 'register', bucket: 'Data' }, { text: 'rumour', bucket: 'Not data' }] } as ActivityBeat & { kind: 'sort_into' };
    let got: ActivityAnswer | null = null;
    render(<SortInto beat={beat} locked={false} reveal={false} onSubmit={(a) => { got = a; }} />);
    const check = screen.getByRole('button', { name: 'Check' });
    expect((check as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'register' }));
    await userEvent.click(screen.getByRole('button', { name: 'Put in Data' }));
    await userEvent.click(screen.getByRole('button', { name: 'rumour' }));
    await userEvent.click(screen.getByRole('button', { name: 'Put in Not data' }));
    await userEvent.click(check);
    expect(got).toEqual({ kind: 'sort_into', placement: { register: 'Data', rumour: 'Not data' } });
  });

  it('SortInto: a placed item goes back to the tray, and a box still takes a drop on top of one', async () => {
    const beat = { id: 'x', type: 'activity', kind: 'sort_into', prompt: 'p', buckets: ['Data', 'Not data'],
      items: [{ text: 'register', bucket: 'Data' }, { text: 'rumour', bucket: 'Not data' }] } as ActivityBeat & { kind: 'sort_into' };
    render(<SortInto beat={beat} locked={false} reveal={false} onSubmit={() => {}} />);
    const bucket = () => screen.getByRole('button', { name: 'Put in Data' });
    await userEvent.click(screen.getByRole('button', { name: 'register' }));
    await userEvent.click(bucket());
    expect(bucket().textContent).toContain('register');

    // with another item picked, clicking the placed pill means "drop it in this box" - the pill is the box
    await userEvent.click(screen.getByRole('button', { name: 'rumour' }));
    await userEvent.click(screen.getByRole('button', { name: 'register' }));
    expect(bucket().textContent).toContain('rumour');
    expect(bucket().textContent).toContain('register');

    // with nothing picked, the same pill takes the item back out (the bucket must not re-place it)
    await userEvent.click(screen.getByRole('button', { name: 'register' }));
    expect(bucket().textContent).not.toContain('register');
    expect(screen.getByLabelText('Items to sort').textContent).toContain('register');
  });

  it('MatchPairs: one dropdown per item; reveal shows the key', () => {
    const beat = { id: 'm', type: 'activity', kind: 'match', prompt: 'p',
      pairs: [{ left: 'age', right: 'INTEGER' }, { left: 'phone', right: 'VARCHAR' }] } as ActivityBeat & { kind: 'match' };
    render(<MatchPairs beat={beat} locked reveal onSubmit={() => {}} />);
    expect((screen.getByLabelText('Match for item 1') as HTMLSelectElement).value).toBe('INTEGER');
    expect((screen.getByLabelText('Match for item 2') as HTMLSelectElement).value).toBe('VARCHAR');
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
  });
});

// Coming back to a step that is already answered (Back, the step bar, leaving and returning): the answer is still there
describe('finished steps keep their answers on screen', () => {
  const runnerWith = (state: object, extra: object = {}) => ({ beatState: () => ({ done: true, attempts: 1, hintTier: 0, ...state }), pack: { cast: {} }, ...extra }) as unknown as SessionRunner;

  it('a solved sort activity shows every item in its box again, not an empty board', () => {
    const beat = { id: 'S1.4', type: 'activity', kind: 'sort_into', prompt: 'Which are data?', buckets: ['Data', 'Not data'], feedback: 'Stored = data.',
      items: [{ text: 'register', bucket: 'Data' }, { text: 'receipt', bucket: 'Data' }, { text: 'rumour', bucket: 'Not data' }] } as ActivityBeat;
    render(<ActivityPanel runner={runnerWith({})} beat={beat} onChanged={() => {}} />);          // a fresh mount: nothing remembered in the component
    expect(screen.getByRole('button', { name: 'Put in Data' }).textContent).toContain('register');
    expect(screen.getByRole('button', { name: 'Put in Data' }).textContent).toContain('receipt');
    expect(screen.getByRole('button', { name: 'Put in Not data' }).textContent).toContain('rumour');
    expect(screen.queryByLabelText('Items to sort')).toBeNull();                                 // nothing left in the tray
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    expect(screen.getByText('Well done.')).toBeTruthy();                                         // solved, so no "Here's the answer"
  });

  it('a solved matching activity shows the chosen matches', () => {
    const beat = { id: 'S1.7', type: 'activity', kind: 'match', prompt: 'Match', pairs: [{ left: 'age', right: 'INTEGER' }, { left: 'name', right: 'VARCHAR' }] } as ActivityBeat;
    render(<ActivityPanel runner={runnerWith({})} beat={beat} onChanged={() => {}} />);
    expect((screen.getByLabelText('Match for item 1') as HTMLSelectElement).value).toBe('INTEGER');
    expect((screen.getByLabelText('Match for item 2') as HTMLSelectElement).value).toBe('VARCHAR');
  });

  it('an answered quick check shows the option that was picked, right or wrong', () => {
    const beat = { id: 'S1.12', type: 'check', prompt: 'Which is a Relational DBMS?', explain: 'SQLite is relational.',
      options: [{ text: 'MongoDB' }, { text: 'SQLite', correct: true }, { text: 'Redis' }] } as unknown as CheckBeat;
    const { unmount, container } = render(<CheckPanel runner={runnerWith({ picked: 2 })} beat={beat} onChanged={() => {}} />);   // they picked Redis
    expect(container.querySelector('.choice.wrong')?.textContent).toContain('Redis');
    expect(container.querySelector('.choice.right')?.textContent).toContain('SQLite');
    expect(screen.getByText(/Not this time\./)).toBeTruthy();
    unmount();
    const again = render(<CheckPanel runner={runnerWith({ picked: 1 })} beat={beat} onChanged={() => {}} />);                     // they picked SQLite
    expect(again.container.querySelector('.choice.wrong')).toBeNull();
    expect(screen.getByText(/Right\./)).toBeTruthy();
  });
});
