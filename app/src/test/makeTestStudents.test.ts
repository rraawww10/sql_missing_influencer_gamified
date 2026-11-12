// Generates the TEST STUDENTS used by the local test kit (docs/TESTING_GUIDE.md).
// Not a normal test: it only runs with MAKE_TEST_STUDENTS=1 (npm run make:test-students) and writes
// ../analytics/test-data/test-students.json, which analytics/seed-test.mjs loads into the test database.
//
// Each student's history is produced by the REAL game engine (SessionRunner + sql.js + the reference answers), so the
// events, points, clues, hints, traps and unfinished sittings are exactly what the browser would have sent - which is
// what makes "sign in as NWTEST03 on a fresh browser → welcome back, continue episode 4 at step N" testable.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SessionRunner, type RunnerState } from '../engine/runner/sessionRunner';
import { MemoryKV, SittingStore } from '../engine/runner/sitting';
import { MemoryProgressStore } from '../adapters/memoryProgressStore';
import { deriveProgress } from '../engine/progress/derive';
import { chapterOf } from '../ui/screens/Player';
import { answerKey, fileLoader, nodeEngine } from './fixtures';
import type { ProgressEvent } from '../ports/progress';
import type { GameUser } from '../ports/auth';

const OUT = path.resolve(__dirname, '../../../analytics/test-data/test-students.json');
const DAY = 86400_000;

interface EpisodePlan {
  session: number;
  stopAt?: number;          // stop BEFORE this step index (0-based) and leave the episode unfinished
  hintsOn?: number[];       // task indexes (0-based, within the episode's tasks) where hint tiers 1+2 are opened
  wrongOn?: number[];       // task indexes with one wrong query first
  trapOn?: boolean;         // run a known trap query first where the task has one
  resetAfter?: boolean;     // reset the episode after solving it (then it is replayed by the next plan entry)
  slow?: number;            // seconds of active time per step (default 40)
}
interface Plan {
  id: string; name: string; batch: string; startDaysAgo: number;
  episodes: EpisodePlan[];
  feedback?: Record<number, { rating: number; mood: string; difficulty: 'easy' | 'right' | 'hard'; liked: string[]; comment?: string }>;
  checkpoint?: { rating: 1 | 2 | 3 | 4; comments?: string[] };   // answered after every chapter it closes
  sawBriefing?: boolean;
}

const all = (n: number): EpisodePlan[] => Array.from({ length: n }, (_, i) => ({ session: i + 1 }));
const PLANS: Plan[] = [
  { id: 'NWTEST01', name: 'Riya Kapoor', batch: 'Test-Batch', startDaysAgo: 1, episodes: [] },   // registered, never played
  { id: 'NWTEST02', name: 'Arjun Mehta', batch: 'Test-Batch', startDaysAgo: 2, sawBriefing: true, episodes: [{ session: 1, stopAt: 6 }] },
  {
    id: 'NWTEST03', name: 'Sana Qureshi', batch: 'Test-Batch', startDaysAgo: 5, sawBriefing: true,
    episodes: [{ session: 1 }, { session: 2, hintsOn: [3], wrongOn: [1, 5] }, { session: 3, trapOn: true, wrongOn: [2] }, { session: 4, stopAt: 14, wrongOn: [0] }],
    feedback: {
      1: { rating: 5, mood: 'Loved it', difficulty: 'easy', liked: ['The story', 'Inspector Kaal'], comment: 'Great start, the story pulled me in!' },
      2: { rating: 4, mood: 'Fun', difficulty: 'right', liked: ['SQL tasks'], comment: 'ALTER TABLE was a bit tricky' },
      3: { rating: 4, mood: 'Fun', difficulty: 'right', liked: ['Puzzles', 'The look'] },
    },
    checkpoint: { rating: 3, comments: ['Clear so far', 'Liked the hint envelopes'] },
  },
  {
    id: 'NWTEST04', name: 'Vikram Rao', batch: 'Test-Batch', startDaysAgo: 12, sawBriefing: true,
    episodes: [{ session: 1, slow: 80 }, { session: 2, hintsOn: [0, 1, 2, 3, 4, 5, 6], wrongOn: [0, 1, 2, 3, 4], slow: 90 }, { session: 3, stopAt: 9, wrongOn: [0, 1], hintsOn: [0, 1], slow: 120 }],
    feedback: {
      1: { rating: 3, mood: 'Okay', difficulty: 'right', liked: [] },
      2: { rating: 2, mood: 'Confusing', difficulty: 'hard', liked: ['Inspector Kaal'], comment: 'Too many new commands in one episode, I got lost' },
    },
    checkpoint: { rating: 1, comments: ['I did not understand data types', 'Need more examples before the task'] },
  },
  {
    id: 'NWTEST05', name: 'Meera Iyer', batch: 'Test-Batch', startDaysAgo: 9, sawBriefing: true, episodes: all(13),
    feedback: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [i + 1, { rating: i % 4 === 3 ? 4 : 5, mood: i % 3 ? 'Fun' : 'Loved it', difficulty: i > 8 ? 'hard' : 'right',
      liked: ['The story', 'SQL tasks', 'Puzzles'], ...(i === 12 ? { comment: 'Best course module ever. Please make a sequel!' } : {}) }])),
    checkpoint: { rating: 4, comments: ['Awesome chapter'] },
  },
  {
    id: 'NWTEST06', name: 'Kabir Singh', batch: 'Test-Batch', startDaysAgo: 4, sawBriefing: false,
    episodes: [{ session: 1 }, { session: 2, resetAfter: true }, { session: 2, hintsOn: [2] }],
    feedback: { 2: { rating: 4, mood: 'Okay', difficulty: 'right', liked: ['Case Notes'], comment: 'Replayed it after reset to get more points' } },
  },
];

describe.skipIf(!process.env.MAKE_TEST_STUDENTS)('make test students', () => {
  it('plays every test student through the real engine and writes test-students.json', async () => {
    const loader = fileLoader();
    const engine = await nodeEngine();
    const now = Date.now();
    const students = [];
    for (const plan of PLANS) {
      const user: GameUser = { id: `lms:${plan.id}`, displayName: plan.name, provider: 'lms', lmsUserId: plan.id };
      const store = new MemoryProgressStore();
      const kv = new MemoryKV();
      const sittings = new SittingStore<RunnerState>(kv);
      let t = now - plan.startDaysAgo * DAY;
      let n = 0;
      const uuid = () => `${plan.id}-${String(++n).padStart(5, '0')}`;
      const clock = () => new Date(t);
      const beats: ProgressEvent[] = [];   // heartbeats (only the server keeps them)
      const heartbeat = (session: number, beat: string | null, seconds: number, sitting: string) => {
        for (let s = seconds; s > 0; s -= 30) {
          const sec = Math.min(30, s); t += sec * 1000;
          beats.push({ event_id: uuid(), user_id: user.id, sitting_id: sitting, verb: 'heartbeat' as never,
            object: { type: 'session', id: `S${session}`, session, ...(beat ? { beat } : {}) }, course_ref: { topic_id: '' }, result: { seconds: sec }, client_ts: new Date(t).toISOString() });
        }
      };
      if (plan.sawBriefing) heartbeat(0, null, 60, 'none');
      const checkpoints: { session: number; chapter: number; rating: number; comment?: string; client_ts: string }[] = [];
      const feedback: Record<string, unknown>[] = [];
      const deps = { engine, loader, store, sittings, now: clock, uuid };

      for (const ep of plan.episodes) {
        t += 0.4 * DAY;
        const pack = await loader.pack(ep.session);
        const sol = await loader.solutionsFor(ep.session);
        const r = await SessionRunner.open(pack, user, deps);
        let taskNo = -1, lastDone: string | null = null;
        for (;;) {
          if (ep.stopAt !== undefined && r.index >= ep.stopAt) break;
          const b = r.beat;
          heartbeat(ep.session, lastDone, ep.slow ?? 40, r.sittingId);
          if (b.type === 'task') {
            taskNo++;
            if (ep.trapOn && sol[b.task_id].traps?.[0]) { await r.submitSql(sol[b.task_id].traps[0].sql); t += 20_000; }
            if (ep.wrongOn?.includes(taskNo)) { await r.submitSql('SELECT 1;'); t += 20_000; }
            if (ep.hintsOn?.includes(taskNo)) { await r.hint(1); await r.hint(2); t += 30_000; }
            expect((await r.submitSql(sol[b.task_id].ref)).verdict.status, `${plan.id} ${b.task_id}`).toBe('pass');
          } else if (b.type === 'activity') await r.answerActivity(answerKey(b));
          else if (b.type === 'check') await r.answerCheck(b.options.findIndex((o) => o.correct));
          else if (b.type === 'clue') await r.pinClue();
          else if (b.type === 'demo') await r.runDemo();
          t += 15_000;
          const closing = b.type === 'clue' ? chapterOf(pack.beats, r.index) : null;
          lastDone = b.id;
          const { finished } = await r.advance();
          if (closing && !finished && plan.checkpoint) {
            const c = plan.checkpoint.comments?.[checkpoints.length % (plan.checkpoint.comments.length || 1)];
            checkpoints.push({ session: ep.session, chapter: closing.n, rating: plan.checkpoint.rating, ...(c && checkpoints.length < 3 ? { comment: c } : {}), client_ts: new Date(t).toISOString() });
          }
          if (finished) break;
        }
        if (r.completed && plan.feedback?.[ep.session] && !ep.resetAfter)
          feedback.push({ session: ep.session, ...plan.feedback[ep.session], sound_on: true, client_ts: new Date(t + 60_000).toISOString() });
        if (ep.resetAfter) { t += 3600_000; await SessionRunner.reset(pack, user, deps); }
      }
      // unfinished sittings, exactly as the game stores them
      const open = [];
      for (let s = 1; s <= 13; s++) {
        const raw = kv.getItem(`tmi.sitting.v1.${user.id}.s${s}`);
        if (raw) open.push({ scope: `s${s}`, saved_at: JSON.parse(raw).savedAt, value: raw });
      }
      const events = [...await store.list(user.id), ...beats].sort((a, b) => (a.client_ts < b.client_ts ? -1 : 1));
      const p = deriveProgress(await store.list(user.id));
      students.push({
        id: plan.id, name: plan.name, batch: plan.batch, registered_at: new Date(now - plan.startDaysAgo * DAY - 600_000).toISOString(),
        summary: { solved: p.sessions.filter((x) => x.status === 'completed').map((x) => x.session), points: p.totalPoints, rank: p.rank, clues: p.evidence.length,
          unfinished: open.map((o) => ({ scope: o.scope, step: (JSON.parse(o.value).state.index as number) + 1 })) },
        events, sittings: open, feedback, checkpoints,
      });
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date(now).toISOString(), note: 'Made by app/src/test/makeTestStudents.test.ts. Invented people, test only.', students }, null, 1));
    for (const s of students) console.log(`${s.id} ${s.name}: ${JSON.stringify(s.summary)} · ${s.events.length} events`);
  }, 120_000);
});
