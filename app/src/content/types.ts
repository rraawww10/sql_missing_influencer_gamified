// Schemas for the public session packs produced by pipeline/build_sessions.mjs.
// The loader validates every pack against these before the runner sees it.
import { z } from 'zod';

export const RmRef = z.object({ unit_id: z.string(), heading: z.string() });
export type RmRef = z.infer<typeof RmRef>;

// 'narrator', 'system' or a cast key (content/story/cast.json); the pack's `cast` has names and colours
const Speaker = z.string();
export type Speaker = z.infer<typeof Speaker>;

const base = {
  id: z.string(),
  speaker: Speaker.optional(),
  minutes: z.number().optional(),
  rm_ref: RmRef.optional(),
  see_also: z.array(RmRef).optional(),
};

const Scene = z.object({ ...base, type: z.literal('scene'), body: z.string() });
const Note = z.object({ ...base, type: z.literal('note'), rm_ref: RmRef, body: z.string() });
const Hook = z.object({ ...base, type: z.literal('hook'), body: z.string() });
const Clue = z.object({ ...base, type: z.literal('clue'), clue_id: z.string(), title: z.string(), body: z.string(),
  requires_task: z.string().optional() });

const Check = z.object({
  ...base, type: z.literal('check'), prompt: z.string(), explain: z.string(), source: z.string().optional(),
  options: z.array(z.object({ text: z.string(), correct: z.boolean().optional() })),
});

const activityBase = { ...base, type: z.literal('activity'), prompt: z.string(), feedback: z.string().optional() };
const SortInto = z.object({ ...activityBase, kind: z.literal('sort_into'), buckets: z.array(z.string()),
  items: z.array(z.object({ text: z.string(), bucket: z.string() })) });
const Match = z.object({ ...activityBase, kind: z.literal('match'),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })) });
const Order = z.object({ ...activityBase, kind: z.literal('order'), steps: z.array(z.string()) });
const PickCell = z.object({ ...activityBase, kind: z.literal('pick_cell'),
  tables: z.array(z.object({ caption: z.string(), columns: z.array(z.string()), rows: z.array(z.array(z.unknown())) })),
  answer: z.object({ table: z.string(), row: z.number(), column: z.string() }) });
const MultiSelect = z.object({ ...activityBase, kind: z.literal('multi_select'),
  options: z.array(z.object({ text: z.string(), correct: z.boolean().optional() })) });
const Activity = z.discriminatedUnion('kind', [SortInto, Match, Order, PickCell, MultiSelect]);

const Trap = z.object({
  id: z.string(),
  match: z.object({ error_regex: z.string().optional(), result_hash: z.string().optional(),
    inspect: z.string().optional(), sql_regex: z.string().optional() }),
  reply: z.string(),
  rm_ref: RmRef.optional(),
});
const Hint = z.object({ tier: z.union([z.literal(1), z.literal(2), z.literal(3)]), rm_ref: RmRef.optional(), text: z.string().optional(),
  skeleton: z.string().optional(), solution_ref: z.string().optional() });

const Task = z.object({
  ...base, type: z.literal('task'), task_id: z.string(), ask: z.string(),
  setup: z.array(z.string()).optional(),
  grading: z.object({ ordered: z.boolean().optional(), inspect: z.string().optional(),
    expect_rows: z.number().optional(), allow_empty: z.boolean().optional(), expected_hash: z.string() }),
  hints: z.array(Hint),
  traps: z.array(Trap),
  on_pass: z.object({ clue: z.string().optional() }).optional(),
  reply_on_pass: z.string().optional(),
});

// Engine demo (S12 index demo): runs `script` once on a fresh copy, then times each step
const Demo = z.object({ ...base, type: z.literal('demo'), prompt: z.string(), script: z.string(),
  steps: z.array(z.object({ label: z.string(), sql: z.string(), repeat: z.number().int().min(1).default(1) })),
  feedback: z.string().optional() });

export const Beat = z.union([Scene, Note, Hook, Clue, Check, Task, Activity, Demo]);
export type DemoBeat = z.infer<typeof Demo>;
export type Beat = z.infer<typeof Beat>;
export type TaskBeat = z.infer<typeof Task>;
export type ActivityBeat = z.infer<typeof Activity>;
export type CheckBeat = z.infer<typeof Check>;
export type ClueBeat = z.infer<typeof Clue>;
export type HintDef = z.infer<typeof Hint>;

// A deployable unit: one reading material's slice of its session (pipeline `units:`), or the finale
export const UnitMeta = z.object({
  n: z.number().int(),                     // unit number = reading material #, finale = 38
  unit_id: z.string(),                     // course unit id (the finale carries its topic id)
  learning_resource_id: z.string().nullable(),
  title: z.string(),                       // reading material title
  part: z.number().int(), parts: z.number().int(),
  finale: z.boolean().optional(),
  same_as: z.string().optional(),          // alias: same content as that unit_id (duplicate reading materials)
});
export type UnitMeta = z.infer<typeof UnitMeta>;

export const SessionPack = z.object({
  session: z.number().int().min(1).max(13),
  unit: UnitMeta.optional(),
  title: z.string(),
  story_clock: z.string(),
  course_topic_id: z.string(),
  snapshot: z.string(),
  est_minutes: z.number().optional(),
  minutes_estimate: z.number(),
  reading_materials: z.array(z.object({ unit_id: z.string(), role: z.enum(['primary', 'subset']), rm: z.number(),
    learning_resource_id: z.string() })),
  exit: z.object({ required_clues: z.array(z.string()).default([]), required_beats: z.array(z.string()).default([]) }),
  premise: z.string(),
  headline: z.string(),
  // "the case so far": clues from earlier sessions, so any session can be played on its own
  previously: z.array(z.object({ session: z.number(), clue_id: z.string(), title: z.string(), body: z.string() })),
  cast: z.record(z.object({ name: z.string(), role: z.string(), initials: z.string(), color: z.string() })),
  beats: z.array(Beat),
});
export type BriefedClue = SessionPack['previously'][number];
export type CastEntry = SessionPack['cast'][string];
export type SessionPack = z.infer<typeof SessionPack>;

export const Solutions = z.record(z.object({ ref: z.string(), traps: z.array(z.object({ id: z.string(), sql: z.string() })) }));
export type Solutions = z.infer<typeof Solutions>;

// Progress scope: a whole session ("s3") or one unit of it ("s3.u11"). Keys sittings and resets.
export const packScope = (p: { session: number; unit?: { n: number } | undefined }) => p.unit ? `s${p.session}.u${p.unit.n}` : `s${p.session}`;

export const UnitIndex = z.array(z.object({ n: z.number(), id: z.string(), unit_id: z.string(), learning_resource_id: z.string().nullable(),
  topic_id: z.string(), title: z.string(), session: z.number(), session_title: z.string(), part: z.number(), parts: z.number(), minutes: z.number(),
  beats: z.number(), tasks: z.number(), clues: z.number(), same_as: z.string().optional(), finale: z.boolean().optional() }));
export type UnitIndexEntry = z.infer<typeof UnitIndex>[number];

export const CaseNotes = z.record(z.object({ rm: z.number(), title: z.string(), markdown: z.string() }));
export type CaseNotes = z.infer<typeof CaseNotes>;

// content/story/cast.json — the single source of every character and place (the briefing page shows the cast).
// Text fields may contain {{key}} / {{key.first}} placeholders; `resolveCastText` fills them in.
export const CastFile = z.object({
  premise: z.string().optional(),
  people: z.record(z.object({ name: z.string(), first: z.string().optional(), role: z.string(), initials: z.string(), color: z.string() })),
  places: z.record(z.string()).default({}),
  handles: z.record(z.string()).default({}),
}).passthrough();
export type CastFile = z.infer<typeof CastFile>;
export function resolveCastText(text: string, cast: CastFile): string {
  return text.replace(/\{\{(\w+)(?:\.(\w+))?\}\}/g, (m, key: string, field?: string) => {
    const p = cast.people[key];
    if (p) {
      if (!field) return p.name;
      if (field === 'first') return p.first ?? p.name.split(' ')[0];
      if (field === 'last') return p.name.split(' ').slice(-1)[0];
      return m;
    }
    return cast.places[key] ?? cast.handles[key] ?? m;
  });
}

export const SessionIndex = z.array(z.object({ session: z.number(), title: z.string(), minutes: z.number(), story_clock: z.string(),
  premise: z.string(), headline: z.string() }));
export type SessionIndexEntry = z.infer<typeof SessionIndex>[number];
