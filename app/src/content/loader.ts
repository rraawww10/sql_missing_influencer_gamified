// Loads and validates content served from /content (copied there by scripts/sync-content.mjs).
import { CaseNotes, CastFile, SessionIndex, SessionPack, Solutions, UnitIndex, type SessionIndexEntry, type UnitIndexEntry } from './types';

export type Fetcher = (path: string) => Promise<Response>;

// Thrown when the server sends something that isn't our content (e.g. a dev server's HTML fallback
// while content is being re-synced). Nothing is cached, so trying again works.
export class ContentNotReady extends Error {
  constructor(what: string) { super(`${what} isn't available right now. Please reload the page.`); this.name = 'ContentNotReady'; }
}

const SQLITE_MAGIC = 'SQLite format 3\0';

const pad = (n: number) => String(n).padStart(2, '0');

export class ContentLoader {
  private packs = new Map<number, SessionPack>();
  private solutions = new Map<number, Solutions>();
  private notes: CaseNotes | null = null;

  // base follows Vite's `base`: '/content' in dev, './content' in a standalone session build (works in any folder)
  // unit: a standalone UNIT site (one reading material): pack() then returns that unit's pack — a slice of its session
  constructor(private readonly fetcher: Fetcher = (p) => fetch(p), private readonly base = `${import.meta.env.BASE_URL}content`,
              readonly unit: number | null = null) {}

  private async json(path: string): Promise<unknown> {
    const res = await this.fetcher(`${this.base}/${path}`);
    if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
    const text = await res.text();
    if (text.trimStart().startsWith('<')) throw new ContentNotReady(path);   // HTML page, not JSON
    return JSON.parse(text);
  }

  async index(): Promise<SessionIndexEntry[]> {
    return SessionIndex.parse(await this.json('sessions/index.json'));
  }

  async pack(session: number): Promise<SessionPack> {
    if (this.unit !== null) return this.unitPack(this.unit);
    if (!this.packs.has(session)) {
      const parsed = SessionPack.safeParse(await this.json(`sessions/s${pad(session)}.json`));
      if (!parsed.success) {
        const i = parsed.error.issues[0];
        throw new Error(`Session ${session} pack is invalid at ${i?.path.join('.') || '(root)'}: ${i?.message}`);
      }
      this.packs.set(session, parsed.data);
    }
    return this.packs.get(session)!;
  }

  // One reading material's unit (content/units/uNN.json). Cached under a negative key so it never collides with sessions.
  async unitPack(n: number): Promise<SessionPack> {
    const key = -n;
    if (!this.packs.has(key)) {
      const parsed = SessionPack.safeParse(await this.json(`units/u${pad(n)}.json`));
      if (!parsed.success) {
        const i = parsed.error.issues[0];
        throw new Error(`Unit ${n} pack is invalid at ${i?.path.join('.') || '(root)'}: ${i?.message}`);
      }
      if (!parsed.data.unit) throw new Error(`Unit ${n} pack has no unit metadata`);
      this.packs.set(key, parsed.data);
    }
    return this.packs.get(key)!;
  }

  async unitIndex(): Promise<UnitIndexEntry[]> {
    return UnitIndex.parse(await this.json('units/index.json'));
  }

  // Only fetched when a learner opens hint tier 3
  async solutionsFor(session: number): Promise<Solutions> {
    if (!this.solutions.has(session)) this.solutions.set(session, Solutions.parse(await this.json(`solutions/s${pad(session)}.json`)));
    return this.solutions.get(session)!;
  }

  async snapshot(name: string): Promise<Uint8Array> {
    const res = await this.fetcher(`${this.base}/snapshots/${name}.sqlite`);
    if (!res.ok) throw new Error(`Could not load snapshot ${name} (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 16)) !== SQLITE_MAGIC) throw new ContentNotReady(`The case database (${name})`);
    return bytes;
  }

  async caseNotes(): Promise<CaseNotes> {
    this.notes ??= CaseNotes.parse(await this.json('reading_materials.json'));
    return this.notes;
  }

  // The cast (people and places) for the briefing page: content/story/cast.json
  async cast(): Promise<CastFile> {
    return CastFile.parse(await this.json('cast.json'));
  }
}
