// The complete reading material of an episode, full screen. Every course unit the episode uses is here, in order,
// with a contents list on the side. It covers the whole game, and copying from it is switched off (noCopy.ts).
// Opened with openReader() from the Learn scroll in the game bar, a Learn step, a hint or Kaal's chat.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RmRef } from '../../content/types';
import { useServices } from '../services';
import { Markdown, courseMarkdown } from '../components/Markdown';
import { Icon } from '../design/Icon';
import { episodeTitle, EPISODE_COUNT } from '../episodes';
import { closeReader, useReader } from './store';
import { noCopy } from './noCopy';
import { themeVars } from '../theme';
import { ScrollArt } from './ScrollArt';

interface Unit { id: string; title: string; markdown: string; heads: string[] }

const norm = (h: string) => h.toLowerCase().replace(/[*_`!:#]/g, '').replace(/\s+/g, ' ').trim();
// the "## " headings of a unit, in order, skipping code blocks and the course's own contents list
function headingsOf(md: string): string[] {
  const out: string[] = [];
  let fence = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) fence = !fence;
    if (fence) continue;
    const m = /^\s{0,3}##\s+(.+?)\s*#*\s*$/.exec(line);
    if (m && norm(m[1]) !== 'concepts in focus') out.push(m[1].replace(/[*_`]/g, '').trim());
  }
  return out;
}

// Every unit opens with a "Concepts in Focus" list of links to its own sections. The Contents column does that job here
// (and some of those links point at sections this version of the unit does not have), so the list is left out.
// It comes in two shapes: a Markdown list, or the course's <IndexList><IndexItem href="…">…</IndexItem></IndexList>.
export function withoutContentsList(md: string): string {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s*concepts in focus\s*$/i.test(l.trim()));
  if (start < 0) return md;
  let end = start + 1, inIndex = false, sawList = false;
  // the section ends at the next heading, or at the first line that is not part of a list (the list may run straight
  // into the next section's opening tag or a "###Database" heading without its space)
  for (; end < lines.length; end++) {
    const l = lines[end].trim();
    if (/^<IndexList\b/.test(l)) { inIndex = sawList = true; continue; }
    if (/^<\/IndexList>/.test(l)) { inIndex = false; continue; }
    if (/^[-*]\s/.test(l)) { sawList = true; continue; }
    if (inIndex || l === '' || /^---+$/.test(l)) continue;
    break;
  }
  if (!sawList) return md;   // not a list of links: keep it
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
}

export function ReaderHost() {
  const req = useReader();
  return req ? <Reader key={`${req.session}-${req.focus?.unit_id ?? ''}-${req.focus?.heading ?? ''}`} session={req.session} focus={req.focus} onClose={closeReader} /> : null;
}

function Reader({ session, focus, onClose }: { session: number; focus?: RmRef; onClose(): void }) {
  const { loader } = useServices();
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [title, setTitle] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState(0);
  const page = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    (async () => {
      const [pack, notes] = await Promise.all([loader.pack(session), loader.caseNotes()]);
      // the units this episode is built on: its primary reading materials, plus any other unit a step points at
      const pick = (p: typeof pack) => {
        const used = new Set<string>();
        for (const b of p.beats) { if ('rm_ref' in b && b.rm_ref) used.add(b.rm_ref.unit_id); for (const r of ('see_also' in b && b.see_also) || []) used.add(r.unit_id); }
        return p.reading_materials.filter((r) => r.role === 'primary' || used.has(r.unit_id)).map((r) => r.unit_id);
      };
      let ids = pick(pack);
      // the finale has no reading material of its own: it uses everything, so show every earlier episode's units
      if (ids.length === 0) {
        const index = await loader.index();
        const packs = await Promise.all(index.filter((e) => e.session < session).map((e) => loader.pack(e.session)));
        ids = packs.flatMap(pick);
      }
      const seen = new Set<string>();
      const list = ids.filter((id) => notes[id] && !seen.has(id) && seen.add(id)).map((id) => {
        const md = courseMarkdown(withoutContentsList(notes[id].markdown));
        return { id, title: notes[id].title, markdown: md, heads: headingsOf(md) };
      });
      if (alive) { setUnits(list); setTitle(episodeTitle(session, pack.title)); }
    })().catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [loader, session, attempt]);

  // full screen: lock the page behind, Esc closes, and the copy / save / print shortcuts do nothing while it is open
  useEffect(() => {
    document.body.classList.add('reader-open');
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 's', 'p', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopPropagation(); }
    };
    const block = (e: Event) => e.preventDefault();
    addEventListener('keydown', onKey, true);
    document.addEventListener('copy', block, true);
    document.addEventListener('cut', block, true);
    return () => {
      document.body.classList.remove('reader-open');
      removeEventListener('keydown', onKey, true);
      document.removeEventListener('copy', block, true);
      document.removeEventListener('cut', block, true);
    };
  }, [onClose]);

  // after the units render: number the headings so the contents list can scroll to them
  useEffect(() => {
    if (!units || !page.current) return;
    page.current.querySelectorAll<HTMLElement>('article[data-unit]').forEach((art) => {
      const u = art.dataset.unit!;
      let n = 0;
      art.querySelectorAll<HTMLElement>('.md > h2').forEach((h) => { if (norm(h.textContent ?? '') !== 'concepts in focus') h.id = `rm-${u}-${n++}`; });
    });
  }, [units]);

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // the course's own "Concepts in Focus" links (#data …) would change the page address: scroll to that heading instead
  const onLink = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    const href = a.getAttribute('href') ?? '';
    if (!href.startsWith('#')) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noreferrer'); return; }
    e.preventDefault();
    const want = norm(a.textContent ?? '');
    const art = a.closest('article');
    const h = [...(art?.querySelectorAll<HTMLElement>('h2, h3, h4') ?? [])].find((x) => norm(x.textContent ?? '') === want);
    h?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const focusAt = useMemo(() => {
    if (!focus || !units) return null;
    const ui = units.findIndex((u) => u.id === focus.unit_id);
    if (ui < 0) return null;
    const hi = units[ui].heads.findIndex((h) => norm(h) === norm(focus.heading));
    return { ui, hi, id: hi >= 0 ? `rm-${ui}-${hi}` : `rm-unit-${ui}` };
  }, [focus, units]);

  return (
    <div className="reader" role="dialog" aria-modal="true" aria-label="Reading material" style={themeVars(session) as React.CSSProperties}>
      <header className="reader-bar">
        <ScrollArt size={40} />
        <div className="reader-title"><span className="cap">Reading material · Episode {session} of {EPISODE_COUNT}</span><h2>{title || 'Loading…'}</h2></div>
        <span className="pill hide-phone"><Icon name="lock" /> Read only - copying is switched off</span>
        <button ref={closeBtn} className="btn primary" onClick={onClose}><Icon name="close" /> Back to the case</button>
        <div className="reader-progress" aria-hidden="true"><i style={{ width: `${read}%` }} /></div>
      </header>
      {failed && <div className="reader-body"><div className="surface card panel"><p>Couldn’t load the reading material.</p><button className="btn small primary" onClick={() => setAttempt((a) => a + 1)}>Try again</button></div></div>}
      {!failed && !units && <div className="reader-body"><p className="loading">Unrolling the scroll…</p></div>}
      {!failed && units && (
        <div className="reader-body">
          <nav className="reader-toc" aria-label="Contents">
            {focusAt && <button className="btn small pop jump" onClick={() => go(focusAt.id)}><Icon name="target" /> Jump to: {focus!.heading}</button>}
            <span className="cap">Contents · {units.length} chapter{units.length === 1 ? '' : 's'}</span>
            <ol>
              {units.map((u, ui) => (
                <li key={u.id}>
                  <button className="toc-unit" onClick={() => go(`rm-unit-${ui}`)}><span className="toc-n">{ui + 1}</span>{u.title}</button>
                  <ul>{u.heads.map((h, hi) => (
                    <li key={hi}><button className={focusAt && focusAt.ui === ui && focusAt.hi === hi ? 'here' : ''} onClick={() => go(`rm-${ui}-${hi}`)}>{h}</button></li>
                  ))}</ul>
                </li>
              ))}
            </ol>
          </nav>
          <main {...noCopy} className="surface reader-page nocopy" ref={page} tabIndex={0} onClick={onLink}
            onScroll={(e) => { const el = e.currentTarget; setRead(Math.round((el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * 100)); }}>
            {units.length === 0 && <p>This episode has no reading material of its own.</p>}
            {units.map((u, ui) => (
              <article key={u.id} id={`rm-unit-${ui}`} data-unit={ui}>
                <span className="pill sun">Chapter {ui + 1} of {units.length}</span>
                <Markdown source={u.markdown} course />
              </article>
            ))}
            {units.length > 0 && <p className="reader-end"><Icon name="ok" /> That is the complete reading material for this episode.</p>}
          </main>
        </div>
      )}
    </div>
  );
}
