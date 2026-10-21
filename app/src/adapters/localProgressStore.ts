// LocalProgressStore: append-only event log in IndexedDB (Dexie). Later replaced by
// ApiProgressStore (pilot) / LmsProgressStore without touching the UI or runner.
import Dexie, { type Table } from 'dexie';
import type { ProgressEvent, ProgressStore } from '../ports/progress';

class EventDb extends Dexie {
  events!: Table<ProgressEvent, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ events: 'event_id, user_id, sitting_id, verb, client_ts' });
  }
}

export class LocalProgressStore implements ProgressStore {
  private db: EventDb;
  constructor(name = 'tmi-progress') { this.db = new EventDb(name); }

  async append(event: ProgressEvent) {
    // put() keyed by event_id: replaying the same event is harmless
    await this.db.events.put(event);
  }

  async list(userId: string) {
    const rows = await this.db.events.where('user_id').equals(userId).toArray();
    return rows.sort((a, b) => (a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : 0));
  }
}
