import { describe, expect, it } from 'vitest';
import { builtSessions, builtUnits, fileLoader } from '../test/fixtures';
import { extractSection } from './caseNotes';

describe('built session packs', async () => {
  const loader = fileLoader();
  const notes = await loader.caseNotes();

  it.each(builtSessions())('session %i validates against the app schema', async (n) => {
    const pack = await loader.pack(n);
    expect(pack.session).toBe(n);
  });

  it.each(builtUnits())('unit %i validates against the app schema and its rm_refs resolve', async (n) => {
    const pack = await loader.unitPack(n);
    expect(pack.unit?.n).toBe(n);
    const refs = pack.beats.flatMap((b) => [b.rm_ref, ...(b.see_also ?? []), ...(b.type === 'task' ? b.hints.map((h) => h.rm_ref) : [])])
      .filter((r): r is NonNullable<typeof r> => !!r);
    for (const r of refs) expect(extractSection(notes[r.unit_id].markdown, r.heading), `${r.heading}`).not.toBeNull();
  });

  it.each(builtSessions())('session %i: every rm_ref resolves to a Case Note section', async (n) => {
    const pack = await loader.pack(n);
    const refs = pack.beats.flatMap((b) => [b.rm_ref, ...(b.see_also ?? []), ...(b.type === 'task' ? b.hints.map((h) => h.rm_ref) : [])])
      .filter((r): r is NonNullable<typeof r> => !!r);
    for (const r of refs) expect(extractSection(notes[r.unit_id].markdown, r.heading), `${r.heading}`).not.toBeNull();
  });
});
