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

  // A Case Note keeps its learning text (`body`) apart from its story text (`case`); the schema must not drop `case`
  it('a Case Note carries its case text in `case`, apart from the learning text in `body`', async () => {
    for (const pack of [await loader.pack(1), await loader.unitPack(2)]) {
      const note = pack.beats.find((b) => b.id === 'S1.3');
      if (note?.type !== 'note') throw new Error('S1.3 should be a note');
      expect(note.case).toContain('In our case');
      expect(note.body).not.toContain('In our case');
    }
  });
});
