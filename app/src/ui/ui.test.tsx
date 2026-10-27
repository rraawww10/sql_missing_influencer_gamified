// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toHtml } from './components/Markdown';
import { friendlyError } from './components/TaskPanel';
import { SortInto } from './activities/SortInto';
import { MatchPairs } from './activities/MatchPairs';
import { storyTime } from './speakers';
import type { ActivityBeat } from '../content/types';
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

    // with another item picked, clicking the placed pill means "drop it in this box" — the pill is the box
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
