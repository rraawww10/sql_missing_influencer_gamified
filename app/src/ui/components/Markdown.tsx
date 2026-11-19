// Renders story text and reading-material markdown. Course content uses a few custom tags
// (<Section>, <MultiLineNote>, <ImageInlineText> …); they're mapped to plain HTML, then sanitised.
import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { personalize } from '../../adapters/identity';

// The course's custom tags, mapped to plain HTML. Every block tag gets a blank line on both sides: in Markdown an HTML
// line swallows the lines right after it until a blank line, so "<Section id=…>" followed directly by "## Heading"
// showed the "##" as text, and a note's list or a table under "<summary>" never became a list or a table.
const TAGS: [RegExp, string][] = [
  [/<\/?Section\b[^>]*>/g, '\n\n'],                                  // also <Section id="…">
  [/<(MultiLineNote|SingleLineNote|SingleLineQuickTip|Checkpoint)\b[^>]*>/g, '\n\n<div class="rm-note">\n\n'],
  [/<\/(MultiLineNote|SingleLineNote|SingleLineQuickTip|Checkpoint)>/g, '\n\n</div>\n\n'],
  [/<MultiLineWarning\b[^>]*>/g, '\n\n<div class="rm-warning">\n\n'],
  [/<\/MultiLineWarning>/g, '\n\n</div>\n\n'],
  [/<IndexList\b[^>]*>/g, '\n\n<ul>\n'], [/<\/IndexList>/g, '\n</ul>\n\n'],
  [/<IndexItem\b[^>]*>/g, '<li>'], [/<\/IndexItem>/g, '</li>'],     // also <IndexItem href="…">
  [/<ImageInlineText[^>]*imageSrc\s*=\s*['"]([^'"]+)['"][^>]*>/g, '\n\n<div class="rm-figure"><img src="$1" alt="" loading="lazy" />\n\n'],
  [/<\/ImageInlineText>/g, '\n\n</div>\n\n'],
  [/```(\w+)\|[A-Z|]+/g, '```$1'],                // ```sql|UGLY → ```sql
  [/<img([^>]*?)\s*,\s*width/g, '<img$1 width'],  // a stray comma in one course <img>
  [/[ \t]*\u2014[ \t]*/g, ' - '],                  // no em dashes anywhere on screen (incl. the verbatim course extract)
];

// Fixes for the course's own Markdown habits. Only for reading material (the Reader and the course-note hint),
// never for story text, where a line starting with "#" could be a hashtag.
//   "###Database", " ## Try it"  → "### Database", "## Try it"   (a heading needs the space, and starts the line)
//   "**Addition (+) ** :"        → "**Addition (+)** :"           (bold does not close after a space)
//   a table whose dashes row has a different number of columns than its header, or does not start with "|"
//                                → the dashes row is rebuilt to match the header, so it is drawn as a table
//   <summary>**x**</summary>     → <summary><strong>x</strong></summary>, with a blank line after it and before </details>,
//                                  so the table or list inside a fold-out box is drawn as one; the box starts open unless it hides
//                                  a hint, an answer or a solution
//   a line that is only <br/>, <img …> or <hr/> gets a blank line after it, so the text below it is not swallowed
//   a sentence written right under a table gets a blank line before it, so it is not drawn as a row of that table
// Lines inside code blocks are left alone.
const isRow = (l: string) => /^\s*\|/.test(l);
const isDashes = (l: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l) && l.includes('|');
const cellsOf = (row: string) => row.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).length;

export function courseMarkdown(md: string): string {
  const out: string[] = [];
  let fence = false;
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) { fence = !fence; out.push(line); continue; }
    if (fence) { out.push(line); continue; }
    let l = line.replace(/^\s{1,3}(#{1,6}\s)/, '$1').replace(/^(#{1,6})(?=[^#\s])/, '$1 ');
    l = l.replace(/\*\*(\S[^*\n`]*?)\s+\*\*/g, '**$1**');
    l = l.replace(/<summary>\s*\*\*(.+?)\*\*\s*<\/summary>/g, '<summary><strong>$1</strong></summary>');
    // a fold-out box that holds a table or an example opens by itself; one that hides a hint or an answer stays closed
    const sum = /<summary>(.*?)<\/summary>/.exec(l);
    if (sum && !/hint|answer|solution/i.test(sum[1])) {
      const at = out.map((x) => x.trim()).lastIndexOf('<details>');
      if (at >= 0 && out.slice(at + 1).every((x) => x.trim() === '')) out[at] = '<details open>';
    }
    // the dashes row right under a table's header (the first row of a run of rows)
    const prev = out[out.length - 1] ?? '', before = out[out.length - 2] ?? '';
    // (only when it is broken, and at the same indent: a table inside a list item must stay inside it)
    if (isDashes(l) && isRow(prev) && !isRow(before) && !isDashes(prev) && (cellsOf(l) !== cellsOf(prev) || !isRow(l)))
      l = `${/^\s*/.exec(prev)![0]}|${'---|'.repeat(cellsOf(prev))}`;
    // a sentence right under a table is not a row of it (without a blank line Markdown makes it one, and stretches the table)
    if (l.trim() && !isRow(l) && isRow(prev) && !isDashes(l)) out.push('');
    if (/<\/summary>\s*$/.test(l) || /^\s*<(br|hr)\s*\/?>\s*$|^\s*<img\b[^>]*>\s*$/i.test(l)) { out.push(l, ''); continue; }
    if (/^\s*<\/details>/.test(l)) { out.push('', l.trim(), ''); continue; }
    if (/^\s*<details>/.test(l)) { out.push('', l.trim()); continue; }
    out.push(l);
  }
  return out.join('\n');
}

export function toHtml(md: string, opts: { course?: boolean } = {}): string {
  let src = personalize(md.replace(/\r\n/g, '\n'));   // [[name]] → the student's first name
  for (const [re, to] of TAGS) src = src.replace(re, to);
  if (opts.course) src = courseMarkdown(src);
  const html = marked.parse(src, { async: false, gfm: true, breaks: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['loading'] });
}

// course: the text is reading material from the course (see courseMarkdown)
export function Markdown({ source, className = '', course = false }: { source: string; className?: string; course?: boolean }) {
  const html = useMemo(() => toHtml(source, { course }), [source, course]);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
