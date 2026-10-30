// Session runner: plays one session pack, one attempt ("sitting") at a time; attempts resume any time.
// UI-agnostic — the React screens (M4) call these methods and render `view()`.
//
// Beat completion rules
//   scene / note / hook  done when the learner moves past it
//   task                 done when the SQL passes
//   activity             done when answered correctly, or revealed after MAX_ACTIVITY_TRIES wrong tries
//   check                done when answered (right or wrong — the explanation is the lesson)
//   clue                 done when pinned (needs its `requires_task` passed)
import { packScope, type ActivityBeat, type Beat, type ClueBeat, type DemoBeat, type SessionPack, type TaskBeat } from '../../content/types';
import type { ContentLoader } from '../../content/loader';
import { extractSection } from '../../content/caseNotes';
import type { GradeOutcome, SqlEngine } from '../sql/engine';
import { checkActivity, type ActivityAnswer, type ActivityResult } from '../activities/check';
import type { ProgressEvent, ProgressStore, Verb } from '../../ports/progress';
import type { GameUser } from '../../ports/auth';
import type { SittingStore } from './sitting';

export const MAX_ACTIVITY_TRIES = 3;

// What a session-level event says about the unit it came from (so progress can tell when all parts are done)
const unitResult = (pack: SessionPack): Record<string, unknown> | undefined =>
  pack.unit ? { unit: pack.unit.n, unit_id: pack.unit.unit_id, part: pack.unit.part, parts: pack.unit.parts } : undefined;

export interface BeatState {
  done: boolean;
  attempts: number;
  hintTier: 0 | 1 | 2 | 3;
  revealed?: boolean;          // activity answer shown after too many tries
  lastStatus?: string;
  passSql?: string;            // the learner's passing query (evidence for the clue it unlocks)
}

export interface RunnerState {
  sittingId: string;
  session: number;
  userId: string;
  index: number;
  startedAt: string;
  beats: Record<string, BeatState>;
  pinned: string[];
  completed: boolean;
}

export interface Deps {
  engine: SqlEngine;
  loader: ContentLoader;
  store: ProgressStore;
  sittings: SittingStore<RunnerState>;
  now?: () => Date;
  uuid?: () => string;
}

export type HintContent =
  | { tier: 1; heading: string; title: string; markdown: string }
  | { tier: 2; skeleton: string }
  | { tier: 3; sql: string };

export interface SubmitOutcome extends GradeOutcome {
  attempt: number;
  clueUnlocked?: string;
  replyOnPass?: string;
}

export class SessionRunner {
  private constructor(readonly pack: SessionPack, private state: RunnerState, private readonly deps: Required<Deps>) {}

  // Resumes the unfinished sitting saved on this device (no time limit), or starts a new one.
  // `startOver` drops the saved sitting (logged as abandoned, so it never earns points).
  static async open(pack: SessionPack, user: GameUser, deps: Deps, { startOver = false } = {}): Promise<SessionRunner> {
    const d: Required<Deps> = { now: () => new Date(), uuid: () => crypto.randomUUID(), ...deps };
    await d.engine.loadSnapshot(pack.snapshot, await d.loader.snapshot(pack.snapshot));
    const now = d.now();
    const saved = d.sittings.load(user.id, packScope(pack));

    if (saved && !saved.completed && !startOver) {
      const r = new SessionRunner(pack, saved, d);
      await r.emit('session_resumed', { type: 'session', id: `S${pack.session}` }, unitResult(pack));
      return r;
    }
    const fresh: RunnerState = {
      sittingId: d.uuid(), session: pack.session, userId: user.id, index: 0, startedAt: now.toISOString(),
      beats: Object.fromEntries(pack.beats.map((b) => [b.id, { done: false, attempts: 0, hintTier: 0 } as BeatState])),
      pinned: [], completed: false,
    };
    const r = new SessionRunner(pack, fresh, d);
    if (saved && !saved.completed) {
      await r.emit('session_abandoned', { type: 'session', id: `S${pack.session}` }, { reason: 'start_over' }, saved.sittingId);
    }
    await r.emit('session_started', { type: 'session', id: `S${pack.session}` }, unitResult(pack));
    r.save();
    return r;
  }

  // Reset a session: drop the saved attempt and wipe its points, clues and completion (logged as session_reset).
  static async reset(pack: SessionPack, user: GameUser, deps: Deps): Promise<void> {
    const d: Required<Deps> = { now: () => new Date(), uuid: () => crypto.randomUUID(), ...deps };
    d.sittings.clear(user.id, packScope(pack));
    await d.store.append({
      event_id: d.uuid(), user_id: user.id, sitting_id: `reset-${d.uuid()}`, verb: 'session_reset',
      object: { type: 'session', id: `S${pack.session}`, session: pack.session, ...(pack.unit ? { unit: pack.unit.n } : {}) },
      course_ref: { topic_id: pack.course_topic_id, ...(pack.unit?.learning_resource_id ? { unit_id: pack.unit.unit_id, learning_resource_id: pack.unit.learning_resource_id } : {}) },
      ...(pack.unit ? { result: unitResult(pack) } : {}), client_ts: d.now().toISOString(),
    });
  }

  // ---------------------------------------------------------------- reading state
  get index() { return this.state.index; }
  get beat(): Beat { return this.pack.beats[this.state.index]; }
  get sittingId() { return this.state.sittingId; }
  get pinned(): readonly string[] { return this.state.pinned; }
  get completed() { return this.state.completed; }
  beatState(id = this.beat.id): BeatState { return this.state.beats[id]; }
  snapshotState(): RunnerState { return structuredClone(this.state); }

  canAdvance(): boolean {
    const b = this.beat;
    if (['scene', 'note', 'hook'].includes(b.type)) return true;
    return this.state.beats[b.id].done;
  }

  exitSatisfied(): boolean {
    const { required_clues, required_beats } = this.pack.exit;
    return required_clues.every((c) => this.state.pinned.includes(c))
      && required_beats.every((id) => this.state.beats[id]?.done);
  }

  // ---------------------------------------------------------------- navigation
  async advance(): Promise<{ finished: boolean }> {
    if (!this.canAdvance()) throw new Error(`Beat ${this.beat.id} is not finished yet`);
    const b = this.beat;
    if (['scene', 'note', 'hook'].includes(b.type) && !this.state.beats[b.id].done) {
      this.state.beats[b.id].done = true;
      await this.emit('beat_viewed', { type: 'beat', id: b.id }, undefined, undefined, b);
    }
    if (this.state.index < this.pack.beats.length - 1) {
      this.state.index++;
      this.save();
      return { finished: false };
    }
    if (!this.exitSatisfied()) throw new Error('Session end reached but exit criteria are not met');
    await this.complete();
    return { finished: true };
  }

  // Look back at an earlier beat (read-only); the learner can't skip ahead
  goBack() {
    if (this.state.index > 0) { this.state.index--; this.save(); }
  }

  // ---------------------------------------------------------------- tasks
  async submitSql(sql: string): Promise<SubmitOutcome> {
    const b = this.requireBeat('task') as TaskBeat;
    const st = this.state.beats[b.id];
    st.attempts++;
    const outcome = await this.deps.engine.grade(this.pack.snapshot, b, sql, this.pack.session);
    const v = outcome.verdict;
    st.lastStatus = v.status;
    const obj = { type: 'task' as const, id: b.task_id };
    await this.emit('task_attempted', obj, { attempt: st.attempts, status: v.status, sql, ms: Math.round(outcome.ms),
      not_taught_yet: outcome.notTaughtYet.map((f) => f.id) }, undefined, b);
    if (v.status === 'trap') await this.emit('trap_hit', obj, { trap: v.trap.id, attempt: st.attempts }, undefined, b);

    const res: SubmitOutcome = { ...outcome, attempt: st.attempts };
    if (v.status === 'pass' && !st.done) {
      st.done = true;
      st.passSql = sql;
      await this.emit('task_passed', obj, { attempts: st.attempts, max_hint_tier: st.hintTier }, undefined, b);
      if (b.on_pass?.clue) res.clueUnlocked = b.on_pass.clue;
      res.replyOnPass = b.reply_on_pass;
    }
    this.save();
    return res;
  }

  // Hints unlock in order (1 → 2 → 3). Tier 3 fetches the solution file only now.
  async hint(tier: 1 | 2 | 3): Promise<HintContent> {
    const b = this.requireBeat('task') as TaskBeat;
    const st = this.state.beats[b.id];
    if (tier > st.hintTier + 1) throw new Error(`Open hint ${st.hintTier + 1} first`);
    let content: HintContent;
    if (tier === 1) {
      const h1 = b.hints.find((h) => h.tier === 1);
      const ref = h1?.rm_ref;
      if (!ref && h1?.text) {
        content = { tier: 1, heading: 'Tip', title: 'Case recap', markdown: h1.text };
        return this.recordHint(b, st, tier, content);
      }
      if (!ref) throw new Error('No tier 1 hint');
      const note = (await this.deps.loader.caseNotes())[ref.unit_id];
      content = { tier: 1, heading: ref.heading, title: note?.title ?? '', markdown: extractSection(note?.markdown ?? '', ref.heading) ?? '' };
    } else if (tier === 2) {
      content = { tier: 2, skeleton: b.hints.find((h) => h.tier === 2)?.skeleton ?? '' };
    } else {
      const sol = (await this.deps.loader.solutionsFor(this.pack.session))[b.task_id];
      content = { tier: 3, sql: sol.ref };
    }
    return this.recordHint(b, st, tier, content);
  }

  private async recordHint(b: TaskBeat, st: BeatState, tier: 1 | 2 | 3, content: HintContent): Promise<HintContent> {
    if (tier > st.hintTier) {
      st.hintTier = tier;
      await this.emit('hint_used', { type: 'hint', id: `${b.task_id}#${tier}` }, { tier }, undefined, b);
      this.save();
    }
    return content;
  }

  // ---------------------------------------------------------------- engine demos
  async runDemo(): Promise<{ label: string; ms: number }[]> {
    const b = this.requireBeat('demo') as DemoBeat;
    const times = await this.deps.engine.timeSteps(this.pack.snapshot, b.script, b.steps);
    const out = b.steps.map((s, i) => ({ label: s.label, ms: times[i].ms }));
    const st = this.state.beats[b.id];
    st.attempts++;
    if (!st.done) {
      st.done = true;
      await this.emit('activity_done', { type: 'activity', id: b.id },
        { first_try: true, attempts: st.attempts, demo_ms: out.map((o) => Math.round(o.ms * 100) / 100) }, undefined, b);
    }
    this.save();
    return out;
  }

  // ---------------------------------------------------------------- activities, checks, clues
  async answerActivity(answer: ActivityAnswer): Promise<ActivityResult & { revealed: boolean; attempts: number }> {
    const b = this.requireBeat('activity') as ActivityBeat;
    const st = this.state.beats[b.id];
    if (st.done) throw new Error('Activity already finished');
    st.attempts++;
    const r = checkActivity(b, answer);
    const revealed = !r.correct && st.attempts >= MAX_ACTIVITY_TRIES;
    if (r.correct || revealed) {
      st.done = true;
      st.revealed = revealed;
      await this.emit('activity_done', { type: 'activity', id: b.id },
        { first_try: r.correct && st.attempts === 1, attempts: st.attempts, revealed }, undefined, b);
    }
    this.save();
    return { ...r, revealed, attempts: st.attempts };
  }

  async answerCheck(optionIndex: number): Promise<{ correct: boolean; explain: string }> {
    const b = this.requireBeat('check');
    if (b.type !== 'check') throw new Error('not a check');
    const st = this.state.beats[b.id];
    const correct = !!b.options[optionIndex]?.correct;
    if (!st.done) {
      st.done = true;
      st.attempts = 1;
      await this.emit('check_answered', { type: 'check', id: b.id }, { correct, option: optionIndex, source: b.source ?? 'authored' }, undefined, b);
      this.save();
    }
    return { correct, explain: b.explain };
  }

  canPin(clue: ClueBeat): boolean {
    if (!clue.requires_task) return true;
    const task = this.pack.beats.find((x) => x.type === 'task' && x.task_id === clue.requires_task);
    return !!task && this.state.beats[task.id].done;
  }

  async pinClue(): Promise<void> {
    const b = this.requireBeat('clue') as ClueBeat;
    if (!this.canPin(b)) throw new Error(`Solve ${b.requires_task} first`);
    if (this.state.pinned.includes(b.clue_id)) return;
    this.state.pinned.push(b.clue_id);
    this.state.beats[b.id].done = true;
    const task = b.requires_task ? this.pack.beats.find((x) => x.type === 'task' && x.task_id === b.requires_task) : undefined;
    await this.emit('clue_pinned', { type: 'clue', id: b.clue_id }, {
      title: b.title, body: b.body,
      ...(task ? { task_id: b.requires_task, sql: this.state.beats[task.id].passSql } : {}),
    });
    this.save();
  }

  // ---------------------------------------------------------------- internals
  private requireBeat(type: Beat['type']): Beat {
    if (this.beat.type !== type) throw new Error(`Current beat ${this.beat.id} is a ${this.beat.type}, not a ${type}`);
    return this.beat;
  }

  private async complete() {
    this.state.completed = true;
    const started = new Date(this.state.startedAt).getTime();
    await this.emit('session_completed', { type: 'session', id: `S${this.pack.session}` },
      { minutes: Math.round((this.deps.now().getTime() - started) / 60000), clues: [...this.state.pinned], ...unitResult(this.pack) });
    this.deps.sittings.clear(this.state.userId, packScope(this.pack));
  }

  private save() {
    if (!this.state.completed) this.deps.sittings.save(this.state.userId, packScope(this.pack), this.state, this.deps.now().getTime());
  }

  private async emit(verb: Verb, object: Omit<ProgressEvent['object'], 'session'>, result?: Record<string, unknown>,
                     sittingId = this.state.sittingId, beat?: Beat) {
    const unit = beat?.rm_ref?.unit_id ?? (beat?.type === 'task' ? beat.hints.find((h) => h.rm_ref)?.rm_ref?.unit_id : undefined);
    const rm = unit ? this.pack.reading_materials.find((r) => r.unit_id === unit) : undefined;
    await this.deps.store.append({
      event_id: this.deps.uuid(),
      user_id: this.state.userId,
      sitting_id: sittingId,
      verb,
      object: { ...object, session: this.pack.session, ...(this.pack.unit ? { unit: this.pack.unit.n } : {}), ...(beat ? { beat: beat.id } : {}) },
      course_ref: { topic_id: this.pack.course_topic_id, ...(unit ? { unit_id: unit } : {}),
        ...(rm ? { learning_resource_id: rm.learning_resource_id } : {}) },
      ...(result ? { result } : {}),
      client_ts: this.deps.now().toISOString(),
    });
  }
}
