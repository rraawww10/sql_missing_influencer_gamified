// Ask Kaal: the chat panel that opens above Kaal in the corner (kaal/Kaal.tsx owns the launcher and where it sits).
// The student types a question about the game; brain.ts answers it. Replies can carry follow-up chips and one button
// ("Open the reading material", "Open the tables" …) that the screen behind handles. The conversation is kept for the
// browser tab (sessionStorage), so it survives moving between screens. Kaal also says his answers aloud when his voice is on.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useServices } from '../../services';
import { Icon } from '../../design/Icon';
import { Kaal } from '../Kaal';
import type { KaalMood } from '../lines';
import { speak } from '../../voice';
import { sfx } from '../../sound';
import { MAX_QUESTION, actionFits, ask, starters, type ChatAction, type ChatContext, type KnowledgeSources } from './brain';

interface Msg { who: 'you' | 'kaal'; text: string; mood?: KaalMood; chips?: string[]; action?: ChatAction }
const KEY = 'tmi.kaal-chat.v1', KEEP = 30;

function load(): Msg[] {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.slice(-KEEP) : []; } catch { return []; }
}
function save(m: Msg[]) { try { sessionStorage.setItem(KEY, JSON.stringify(m.slice(-KEEP))); } catch { /* private window: the chat just does not persist */ } }

// Replies are plain text with line breaks and `backticks` around SQL words
function rich(text: string): ReactNode {
  return text.split('\n').map((line, i) => (
    <p key={i}>{line.split(/(`[^`]+`)/g).map((part, j) => (part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={j}>{part.slice(1, -1)}</code> : part))}</p>
  ));
}

export function KaalChat({ ctx, onAction, open, onOpenChange }: { ctx: ChatContext; onAction(a: ChatAction): void; open: boolean; onOpenChange(open: boolean): void }) {
  const { loader } = useServices();
  const [msgs, setMsgs] = useState<Msg[]>(load);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { save(msgs); }, [msgs]);
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, busy, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onOpenChange(false); } };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [open, onOpenChange]);
  if (!open) return null;

  const kb: KnowledgeSources = { courseNotes: () => loader.caseNotes() };
  const send = async (raw: string) => {
    const q = raw.trim().slice(0, MAX_QUESTION);
    if (!q || busy) return;
    setText('');
    setMsgs((m) => [...m, { who: 'you', text: q }]);
    setBusy(true);
    sfx('typing');
    // a short "typing…" beat reads better than an instant answer
    const [reply] = await Promise.all([ask(q, ctx, kb), new Promise((r) => setTimeout(r, 450))]);
    if (!alive.current) return;
    setBusy(false);
    setMsgs((m) => [...m, { who: 'kaal', text: reply.text, mood: reply.mood, chips: reply.chips, action: reply.action }]);
    speak(reply.text, { mood: reply.mood });
    input.current?.focus();
  };
  const last = msgs.length - 1;
  const mood: KaalMood = busy ? 'think' : [...msgs].reverse().find((m) => m.who === 'kaal')?.mood ?? 'idle';

  return (
    <section className="kchat-panel" role="dialog" aria-label="Ask Kaal">
      <header className="kchat-head">
        <Kaal mood={mood} size={46} />
        <div className="kchat-title"><h2>Ask Kaal</h2><p>Your assistant. Ask anything about the game.</p></div>
        {msgs.length > 0 && <button className="kchat-clear" onClick={() => setMsgs([])} title="Start a new chat">Clear</button>}
        <button className="kchat-close" onClick={() => onOpenChange(false)} aria-label="Close the chat"><Icon name="close" /></button>
      </header>

      <div className="kchat-list" ref={list} aria-live="polite">
        {msgs.length === 0 && (
          <div className="kchat-empty">
            <p className="kchat-msg kchat-kaal">Hello{ctx.name ? `, ${ctx.name}` : ''}! I’m right here in the corner all night. Ask me how something works, or tap a question.</p>
            <div className="kchat-chips">{starters(ctx).map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`kchat-row kchat-row-${m.who}`}>
            <div className={`kchat-msg kchat-${m.who}`}>{m.who === 'kaal' ? rich(m.text) : m.text}</div>
            {m.who === 'kaal' && m.action && actionFits(m.action, ctx) && (
              <button className="kchat-action" onClick={() => onAction(m.action!)}>{m.action.label} <Icon name="right" /></button>
            )}
            {/* follow-up chips only under the newest answer: older ones would crowd the chat */}
            {m.who === 'kaal' && i === last && !busy && m.chips && m.chips.length > 0 && (
              <div className="kchat-chips">{m.chips.map((c) => <button key={c} onClick={() => send(c)}>{c}</button>)}</div>
            )}
          </div>
        ))}
        {busy && <div className="kchat-row kchat-row-kaal"><div className="kchat-msg kchat-kaal kchat-typing" aria-label="Kaal is typing"><i /><i /><i /></div></div>}
      </div>

      <form className="kchat-form" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <label className="sr-only" htmlFor="kchat-input">Your question for Kaal</label>
        <input id="kchat-input" ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_QUESTION} autoComplete="off"
          placeholder="Type your question…" />
        <button className="kchat-send" type="submit" disabled={busy || !text.trim()} aria-label="Send"><Icon name="send" /></button>
      </form>
      <p className="kchat-note">Kaal knows this game and its SQL. He never gives task answers.</p>
    </section>
  );
}
