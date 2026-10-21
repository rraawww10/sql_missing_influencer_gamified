// Renders story text and reading-material markdown. Course content uses a few custom tags
// (<Section>, <MultiLineNote>, <ImageInlineText> …); they're mapped to plain HTML, then sanitised.
import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const TAGS: [RegExp, string][] = [
  [/<\/?Section>/g, ''],
  [/<(MultiLineNote|SingleLineNote|SingleLineQuickTip|Checkpoint)>/g, '\n<div class="rm-note">\n'],
  [/<\/(MultiLineNote|SingleLineNote|SingleLineQuickTip|Checkpoint)>/g, '\n</div>\n'],
  [/<MultiLineWarning>/g, '\n<div class="rm-warning">\n'],
  [/<\/MultiLineWarning>/g, '\n</div>\n'],
  [/<IndexList>/g, '\n<ul>\n'], [/<\/IndexList>/g, '\n</ul>\n'],
  [/<IndexItem>/g, '<li>'], [/<\/IndexItem>/g, '</li>'],
  [/<ImageInlineText[^>]*imageSrc\s*=\s*['"]([^'"]+)['"][^>]*>/g, '\n<div class="rm-figure"><img src="$1" alt="" loading="lazy" />\n\n'],
  [/<\/ImageInlineText>/g, '\n</div>\n'],
  [/```(\w+)\|[A-Z|]+/g, '```$1'],                // ```sql|UGLY → ```sql
  [/<img([^>]*?)\s*,\s*width/g, '<img$1 width'],  // a stray comma in one course <img>
];

export function toHtml(md: string): string {
  let src = md.replace(/\r\n/g, '\n');
  for (const [re, to] of TAGS) src = src.replace(re, to);
  const html = marked.parse(src, { async: false, gfm: true, breaks: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['loading'] });
}

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const html = useMemo(() => toHtml(source), [source]);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
