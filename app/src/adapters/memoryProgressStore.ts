// In-memory ProgressStore for tests and the dev harness.
import type { ProgressEvent, ProgressStore } from '../ports/progress';

export class MemoryProgressStore implements ProgressStore {
  readonly events = new Map<string, ProgressEvent>();
  async append(e: ProgressEvent) { if (!this.events.has(e.event_id)) this.events.set(e.event_id, e); }
  async list(userId: string) { return [...this.events.values()].filter((e) => e.user_id === userId); }
}
