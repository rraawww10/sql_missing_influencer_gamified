// @vitest-environment jsdom
// The Learn step and the reading material: learning text and case text stay on separate cards, the reader's
// contents list replaces the course's own, and nothing in the reading material can be copied.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { NoteStage } from '../game/StoryStages';
import { withoutContentsList } from './Reader';
import { noCopy } from './noCopy';
import { closeReader, useReader } from './store';
import type { Beat } from '../../content/types';

const note = (extra: object = {}) => ({
  id: 'S1.3', type: 'note', rm_ref: { unit_id: 'u1', heading: 'Data' },
  body: '**Data** is any information that is stored.', ...extra,
}) as Extract<Beat, { type: 'note' }>;

afterEach(() => { cleanup(); closeReader(); });

describe('Learn step', () => {
  it('shows course learning and the case link on two separate cards', () => {
    const { container } = render(<NoteStage beat={note({ case: 'In our case: the hotel register.' })} session={1} />);
    const learn = container.querySelector('.lesson-card')!, cas = container.querySelector('.case-card')!;
    expect(learn.textContent).toContain('is any information that is stored');
    expect(learn.textContent).not.toContain('hotel register');
    expect(cas.textContent).toContain('In our case: the hotel register.');
    expect(cas.textContent).not.toContain('is any information');
  });

  it('has no case card when the note has no case text', () => {
    const { container } = render(<NoteStage beat={note()} session={1} />);
    expect(container.querySelector('.case-card')).toBeNull();
  });

  it('the scroll asks for the full reading material of the episode, with the topic it came from', () => {
    function Probe() { const r = useReader(); return <output>{r ? `${r.session}:${r.focus?.heading}` : 'closed'}</output>; }
    const { container, getByRole } = render(<><NoteStage beat={note()} session={4} /><Probe /></>);
    expect(container.querySelector('output')!.textContent).toBe('closed');
    fireEvent.click(getByRole('button', { name: /Learn: open the full reading material/ }));
    expect(container.querySelector('output')!.textContent).toBe('4:Data');
  });
});

describe('reading material', () => {
  it('drops the course\'s own "Concepts in Focus" link list and keeps every real section', () => {
    const md = '# Intro\n\n## Concepts in Focus\n\n- [Data](#data)\n  - [More](#more)\n\n---\n\n## Data\n\nAny information.\n\n## Database\n\nOrganised.';
    const out = withoutContentsList(md);
    expect(out).not.toContain('Concepts in Focus');
    expect(out).not.toContain('(#data)');
    expect(out).toContain('# Intro');
    expect(out).toContain('## Data\n\nAny information.');
    expect(out).toContain('## Database');
  });

  it('leaves a unit alone when that section holds real content, or is missing', () => {
    const real = '# T\n\n## Concepts in Focus\n\nThis part explains things.\n\n## Data\n\nx';
    expect(withoutContentsList(real)).toBe(real);
    expect(withoutContentsList('# T\n\n## Data\n\nx')).toBe('# T\n\n## Data\n\nx');
  });

  it('blocks copy, cut, the right-click menu and dragging', () => {
    const { container } = render(<div {...noCopy}>SELECT * FROM suspects;</div>);
    const el = container.firstElementChild!;
    expect(el.className).toContain('nocopy');
    for (const type of ['copy', 'cut', 'contextmenu', 'dragstart']) {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      expect(ev.defaultPrevented, type).toBe(true);
    }
  });
});
