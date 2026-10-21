// Saves an unfinished session on this device so the learner can continue any time —
// there is no time limit. Starting over is the learner's choice (SessionRunner.open with startOver).
// Completed sessions live in the event log, not here.
type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface Saved<T> { savedAt: number; state: T }

export class SittingStore<T> {
  constructor(private readonly storage: KV, private readonly prefix = 'tmi.sitting.v1') {}

  // scope: a session number (whole session, key "s3") or a pack scope string ("s3.u11" — one unit; see packScope)
  private key(userId: string, scope: number | string) { return `${this.prefix}.${userId}.${typeof scope === 'number' ? `s${scope}` : scope}`; }

  save(userId: string, scope: number | string, state: T, now: number) {
    try { this.storage.setItem(this.key(userId, scope), JSON.stringify({ savedAt: now, state } satisfies Saved<T>)); }
    catch { /* storage full or blocked: the session just won't survive a reload */ }
  }

  load(userId: string, scope: number | string): T | null {
    try {
      const raw = this.storage.getItem(this.key(userId, scope));
      return raw ? (JSON.parse(raw) as Saved<T>).state : null;
    } catch { return null; }
  }

  canResume(userId: string, scope: number | string): boolean {
    return this.load(userId, scope) !== null;
  }

  clear(userId: string, scope: number | string) {
    try { this.storage.removeItem(this.key(userId, scope)); } catch { /* ignore */ }
  }
}

export class MemoryKV implements KV {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
