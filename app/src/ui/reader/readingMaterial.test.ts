// @vitest-environment jsdom
// Every unit of the real reading material, rendered the way the Reader renders it: nothing of the course's Markdown may
// show up as raw text (a "##", a "|---|" table row, "**bold**"), every table must be a table, and the Contents column
// must list exactly the headings that are on the page (it scrolls to them by position).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { toHtml, courseMarkdown } from '../components/Markdown';
import { withoutContentsList } from './Reader';

const FILE = path.resolve(__dirname, '../../../public/content/reading_materials.json');
const units = fs.existsSync(FILE) ? Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')) as Record<string, { title: string; markdown: string }>) : [];
const norm = (h: string) => h.toLowerCase().replace(/[*_`!:#]/g, '').replace(/\s+/g, ' ').trim();
function render(md: string) {
  const el = document.createElement('div');
  el.innerHTML = toHtml(courseMarkdown(withoutContentsList(md)), { course: true });
  return el;
}
// the text a student reads, without code blocks and inline code (SQL may contain "|" or "#")
function prose(el: HTMLElement): string {
  const c = el.cloneNode(true) as HTMLElement;
  c.querySelectorAll('pre, code').forEach((n) => n.remove());
  return c.textContent ?? '';
}

describe.skipIf(!units.length)('the reading material renders cleanly', () => {
  it.each(units.map(([id, u]) => [u.title, id, u.markdown]))('%s', (_title, _id, md) => {
    const el = render(md as string);
    const text = prose(el);
    expect(text, 'a Markdown heading shown as text').not.toMatch(/(^|\n)\s*#{1,6}\s*\S/);
    expect(text, 'a table row shown as text').not.toMatch(/\|\s*-{3,}\s*\|/);
    expect(text, 'bold markers shown as text').not.toMatch(/\*\*[^*\s][^*]*\*\*/);
    expect(text, 'a course tag shown as text').not.toMatch(/<\/?(Section|IndexList|IndexItem|MultiLine|SingleLine|ImageInlineText)/);
    expect(el.querySelector('h2, h3') ?? el.querySelector('p'), 'nothing rendered').toBeTruthy();
    // every table in the source (a row, then a dashes row) is a real table on the page
    const fixed = courseMarkdown(withoutContentsList(md as string)).split('\n');
    let fence = false, sourceTables = 0;
    fixed.forEach((l, i) => {
      if (/^\s*```/.test(l)) fence = !fence;
      if (!fence && /^\s*\|/.test(l) && !/^\s*\|/.test(fixed[i - 1] ?? '') && /^\s*\|?[\s:|-]*-{3,}[\s:|-]*$/.test(fixed[i + 1] ?? '')) sourceTables++;
    });
    expect(el.querySelectorAll('table').length, 'tables').toBeGreaterThanOrEqual(sourceTables);
    for (const row of el.querySelectorAll('tbody tr')) {
      const cells = row.querySelectorAll('td'), cols = row.closest('table')!.querySelectorAll('thead th').length;
      const filled = [...cells].filter((c) => c.textContent!.trim()).length;
      expect(filled === 1 && cols > 1 && /\s\S+\s\S+\s/.test(cells[0].textContent!), `a sentence drawn as a table row: ${row.textContent!.trim().slice(0, 60)}`).toBe(false);
    }
    // the Contents column (the same rule as the Reader's) lists exactly the h2 headings on the page, in order
    const listed = courseMarkdown(withoutContentsList(md as string)).split('\n').reduce<{ fence: boolean; out: string[] }>((a, l) => {
      if (/^\s*```/.test(l)) a.fence = !a.fence;
      const m = !a.fence && /^\s{0,3}##\s+(.+?)\s*#*\s*$/.exec(l);
      if (m && norm(m[1]) !== 'concepts in focus') a.out.push(norm(m[1]));
      return a;
    }, { fence: false, out: [] }).out;
    const onPage = [...el.querySelectorAll('h2')].map((h) => norm(h.textContent ?? '')).filter((h) => h !== 'concepts in focus');
    expect(onPage).toEqual(listed);
    expect(onPage, 'the "Concepts in Focus" list of links is left out').not.toContain('concepts in focus');
  });
});

describe('course Markdown fixes', () => {
  it('a heading without its space, a heading right after a section tag, a table in a fold-out box', () => {
    const el = document.createElement('div');
    el.innerHTML = toHtml('<Section id="s2">\n## SQLite is Case Insensitive!\n###Database\n\n<details>\n<summary>**student table**</summary>\n| name | age |\n|---|---|\n| Ramesh | 21 |\n</details>', { course: true });
    expect(el.querySelector('h2')?.textContent).toBe('SQLite is Case Insensitive!');
    expect(el.querySelector('h3')?.textContent).toBe('Database');
    expect(el.querySelector('details summary strong')?.textContent).toBe('student table');
    expect(el.querySelector('details table td')?.textContent).toBe('Ramesh');
    expect(el.querySelector('details')?.hasAttribute('open')).toBe(true);                       // a table: open
    const hint = document.createElement('div');
    hint.innerHTML = toHtml('<details>\n  <summary>Click to view hints</summary>\n\n  - Use COUNT.\n</details>', { course: true });
    expect(hint.querySelector('details')?.hasAttribute('open')).toBe(false);                    // a hint: closed
  });

  it('story text is not touched: a line starting with a hashtag stays a hashtag', () => {
    const el = document.createElement('div');
    el.innerHTML = toHtml('#FindTara is trending.\n\nAnd **this** is bold.');
    expect(el.querySelector('h1')).toBeNull();
    expect(el.textContent).toContain('#FindTara is trending.');
    expect(el.querySelector('strong')?.textContent).toBe('this');
  });

  it('code blocks are left exactly as they are', () => {
    const md = '```sql\n#not a heading\n<summary>**x**</summary>\n```';
    expect(courseMarkdown(md)).toBe(md);
  });
});

describe('course table and bold fixes', () => {
  const render = (md: string) => { const el = document.createElement('div'); el.innerHTML = toHtml(md, { course: true }); return el; };
  it('a dashes row with the wrong number of columns, or without its first "|", still makes a table', () => {
    expect(render('| movie_genre |\n|---|----|--------|\n| The Matrix - Sci-fi |').querySelector('table td')?.textContent).toBe('The Matrix - Sci-fi');
    expect(render('|course_name |full_name |\n----------------  |----------|\n|Machine Learning |Varun |').querySelectorAll('table td').length).toBe(2);
    expect(render('|id|name|age|\n|---|---|---|---|\n|1|Sai|40|').querySelectorAll('table th').length).toBe(3);
  });
  it('a table inside a list item stays a table inside that item', () => {
    const el = render('- Aggregate functions on strings\n  \n    | Function | Output |\n    | --- | --- |\n    | MIN | text order |\n- Next point');
    expect(el.querySelector('li table td')?.textContent).toBe('MIN');
    expect(el.querySelectorAll('li').length).toBe(2);
  });
  it('a sentence right under a table is a paragraph, not a row of the table', () => {
    const el = render('| name | age |\n|---|---|\n| Ramesh | 21 |\n`student` table stores the data of the student.');
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    expect(el.querySelector('table + p')?.textContent).toBe('student table stores the data of the student.');
  });
  it('rows of dashes inside a table body are left alone', () => {
    const el = render('| a | b |\n|---|---|\n| 1 | 2 |\n|---|---|\n| 3 | 4 |');
    expect(el.querySelectorAll('table').length).toBe(1);
    expect(el.querySelectorAll('tbody tr').length).toBe(3);
  });
  it('bold that closes after a space, and text right under a <br/>', () => {
    expect(render('**Addition (+) ** : Adds two numbers').querySelector('strong')?.textContent).toBe('Addition (+)');
    expect(render('**a** and **b**').querySelectorAll('strong').length).toBe(2);
    const el = render('<details>\n  <summary>Click to view hints</summary>\n\n  <br/>\n  **To solve the problem:**\n\n  - Use `COUNT()`.\n</details>');
    expect(el.querySelector('details strong')?.textContent).toBe('To solve the problem:');
    expect(el.querySelector('details li code')?.textContent).toBe('COUNT()');
  });
});

