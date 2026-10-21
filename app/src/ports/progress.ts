// ProgressStore port + the append-only event shape (docs/IMPLEMENTATION_PLAN.md §4.4).
// Events are the source of truth; anything else (points, rank, unlocks) is derived from them.
export type Verb =
  | 'session_started' | 'session_resumed' | 'session_abandoned' | 'session_completed'
  | 'session_reset'               // learner reset the session: everything of it before this event is ignored
  | 'beat_viewed' | 'task_attempted' | 'task_passed' | 'trap_hit' | 'hint_used'
  | 'activity_done' | 'check_answered' | 'clue_pinned';

export interface CourseRef {
  topic_id: string;
  unit_id?: string;               // reading-material unit this beat teaches from
  learning_resource_id?: string;
}

export interface ProgressEvent {
  event_id: string;               // client-generated uuid → idempotent sync
  user_id: string;
  sitting_id: string;              // one attempt at one session (resumable any time)
  verb: Verb;
  // unit: set when the event comes from a standalone unit site (one reading material = a slice of the session)
  object: { type: 'session' | 'beat' | 'task' | 'activity' | 'check' | 'clue' | 'hint'; id: string; session: number; unit?: number };
  course_ref: CourseRef;
  result?: Record<string, unknown>;
  client_ts: string;              // ISO time
}

export interface ProgressStore {
  append(event: ProgressEvent): Promise<void>;   // must ignore an event_id it already has
  list(userId: string): Promise<ProgressEvent[]>;
}
