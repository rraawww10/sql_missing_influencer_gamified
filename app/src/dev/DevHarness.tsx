// DEV ONLY — a bare page to drive the engine in a real browser (worker + wasm + IndexedDB).
// Not the game UI (that's M4). Lets the team click through sessions and try SQL.
import { useEffect, useState } from 'react';
import { ContentLoader } from '../content/loader';
import { WorkerEngine } from '../engine/sql/client';
import { SessionRunner, type RunnerState, type SubmitOutcome } from '../engine/runner/sessionRunner';
import { SittingStore } from '../engine/runner/sitting';
import { GuestAuth } from '../adapters/guestAuth';
import { LocalProgressStore } from '../adapters/localProgressStore';
import { deriveProgress, type Progress } from '../engine/progress/derive';
import type { ActivityBeat } from '../content/types';
import type { ActivityAnswer } from '../engine/activities/check';

const loader = new ContentLoader();
const engine = new WorkerEngine();
const store = new LocalProgressStore();
const auth = new GuestAuth();
const sittings = new SittingStore<RunnerState>(localStorage);

function key(b: ActivityBeat): ActivityAnswer {
  switch (b.kind) {
    case 'sort_into': return { kind: 'sort_into', placement: Object.fromEntries(b.items.map((i) => [i.text, i.bucket])) };
    case 'match': return { kind: 'match', pairs: Object.fromEntries(b.pairs.map((p) => [p.left, p.right])) };
    case 'order': return { kind: 'order', steps: [...b.steps] };
    case 'pick_cell': return { kind: 'pick_cell', ...b.answer };
    case 'multi_select': return { kind: 'multi_select', selected: b.options.filter((o) => o.correct).map((o) => o.text) };
  }
}

export function DevHarness() {
  const [runner, setRunner] = useState<SessionRunner | null>(null);
  const [, force] = useState(0);
  const [sql, setSql] = useState('');
  const [out, setOut] = useState<SubmitOutcome | null>(null);
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');

  const refresh = async () => {
    const u = await auth.currentUser();
    setProgress(deriveProgress(await store.list(u.id)));
    force((x) => x + 1);
  };
  useEffect(() => { refresh(); }, []);

  const act = (fn: () => Promise<unknown>) => async () => {
    setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); }
    await refresh();
  };

  const open = (n: number) => act(async () => {
    setOut(null); setNote(''); setSql('');
    setRunner(await SessionRunner.open(await loader.pack(n), await auth.currentUser(), { engine, loader, store, sittings }));
  });

  const b = runner?.beat;
  (globalThis as { __runner?: SessionRunner | null }).__runner = runner;   // dev: inspect from the console
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 20 }}>Engine dev harness <small style={{ color: '#888' }}>(not the game UI)</small></h1>
      <p>
        {[1, 2, 3].map((n) => (
          <button key={n} onClick={open(n)} disabled={progress?.sessions[n - 1].status === 'locked'} style={{ marginRight: 8 }}>
            Session {n} ({progress?.sessions[n - 1].status ?? '…'})
          </button>
        ))}
        {progress && <span> · {progress.totalPoints} pts · {progress.rank} · {progress.badges.join(', ')}</span>}
      </p>
      {error && <p style={{ color: 'crimson' }}>⚠ {error}</p>}
      {runner && b && (
        <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12 }}>
          <div style={{ color: '#666' }}>S{runner.pack.session} · beat {runner.index + 1}/{runner.pack.beats.length} · {b.id} · {b.type}
            {'kind' in b ? ` (${b.kind})` : ''} · clues: {runner.pinned.join(', ') || '—'}</div>
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {'body' in b ? b.body : 'ask' in b ? b.ask : 'prompt' in b ? b.prompt : ''}
          </pre>
          {b.type === 'task' && (
            <>
              <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={4} style={{ width: '100%', fontFamily: 'monospace' }} />
              <button onClick={act(async () => setOut(await runner.submitSql(sql)))}>Run</button>{' '}
              {[1, 2, 3].map((t) => (
                <button key={t} onClick={act(async () => {
                  const h = await runner.hint(t as 1 | 2 | 3);
                  setNote(h.tier === 1 ? h.markdown : h.tier === 2 ? h.skeleton : h.sql);
                  if (h.tier === 3) setSql(h.sql);
                })}>Hint {t}</button>
              ))}
              {out && (
                <div>
                  <b>{out.verdict.status}</b> · attempt {out.attempt} · {out.ms.toFixed(1)} ms
                  {out.verdict.status === 'trap' && <p>{out.verdict.trap.reply}</p>}
                  {out.verdict.status === 'error' && <p>{out.verdict.error}</p>}
                  {out.replyOnPass && <p>{out.replyOnPass}</p>}
                  {out.notTaughtYet.length > 0 && <p>Not taught yet: {out.notTaughtYet.map((f) => f.id).join(', ')}</p>}
                  {'result' in out.verdict && out.verdict.result && (
                    <pre>{[out.verdict.result.columns.join(' | '), ...out.verdict.result.values.slice(0, 10).map((r) => r.join(' | '))].join('\n')}</pre>
                  )}
                </div>
              )}
            </>
          )}
          {b.type === 'activity' && <button onClick={act(() => runner.answerActivity(key(b)))}>Answer correctly (dev)</button>}
          {b.type === 'check' && b.options.map((o, i) => <button key={i} onClick={act(async () => setNote((await runner.answerCheck(i)).explain))}>{o.text}</button>)}
          {b.type === 'clue' && <button onClick={act(() => runner.pinClue())} disabled={!runner.canPin(b)}>Pin clue</button>}
          {note && <pre style={{ background: '#f6f6f6', whiteSpace: 'pre-wrap', padding: 8 }}>{note}</pre>}
          <p>
            <button onClick={() => { runner.goBack(); force((x) => x + 1); }}>◀ Back</button>{' '}
            <button disabled={!runner.canAdvance()} onClick={act(async () => {
              setOut(null); setNote(''); setSql('');
              const { finished } = await runner.advance();
              if (finished) setRunner(null);
            })}>Next ▶</button>
          </p>
        </section>
      )}
    </main>
  );
}
