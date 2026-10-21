import { describe, expect, it } from 'vitest';
import { fileLoader, nodeEngine } from '../../test/fixtures';
import type { TaskBeat } from '../../content/types';

describe('SqlJsEngine', async () => {
  const loader = fileLoader();
  const engine = await nodeEngine();
  const pack = await loader.pack(3);
  await engine.loadSnapshot(pack.snapshot, await loader.snapshot(pack.snapshot));
  const task = (id: string) => pack.beats.find((b) => b.type === 'task' && b.task_id === id) as TaskBeat;

  it('passes the reference answer and recognises the precedence trap', async () => {
    const ok = await engine.grade('s03', task('T3.8'), "SELECT * FROM gate_log WHERE vehicle_colour = 'Grey' AND (gate = 'SERVICE' OR gate = 'STAFF');", 3);
    expect(ok.verdict.status).toBe('pass');
    const trap = await engine.grade('s03', task('T3.8'), "SELECT * FROM gate_log WHERE vehicle_colour = 'Grey' AND gate = 'SERVICE' OR gate = 'STAFF';", 3);
    expect(trap.verdict.status).toBe('trap');
    if (trap.verdict.status === 'trap') expect(trap.verdict.trap.id).toBe('precedence');
  });

  it('reports SQLite errors that are not traps', async () => {
    const r = await engine.grade('s03', task('T3.1'), 'SELEC * FROM gate_log;', 3);
    expect(r.verdict.status).toBe('error');
  });

  it('nudges (never blocks) SQL that is taught later', async () => {
    const r = await engine.grade('s03', task('T3.1'), "SELECT * FROM gate_log WHERE ts >= '2026-12-12 18:00:00' ORDER BY ts;", 3);
    expect(r.verdict.status).toBe('pass');
    expect(r.notTaughtYet.map((f) => f.id)).toContain('ORDER BY');
  });

  it('grades every run on a fresh copy — learner changes never leak', async () => {
    await engine.grade('s03', task('T3.1'), 'DELETE FROM gate_log;', 3);
    const r = await engine.grade('s03', task('T3.1'), "SELECT * FROM gate_log WHERE ts >= '2026-12-12 18:00:00';", 3);
    expect(r.verdict.status).toBe('pass');
  });

  it('table tabs include tables from the task setup and from the learner\'s query', async () => {
    const pack2 = await loader.pack(2);
    await engine.loadSnapshot('s02', await loader.snapshot('s02'));
    const t27 = pack2.beats.find((b) => b.type === 'task' && b.task_id === 'T2.7') as TaskBeat;
    expect((await engine.schema('s02', t27.setup)).map((t) => t.table)).toEqual(['hotel_guests', 'rumours', 'suspects']);
    const created = await engine.schema('s02', [], 'CREATE TABLE suspects (name VARCHAR(200));');
    expect(created.map((t) => t.table)).toContain('suspects');
    expect((await engine.schema('s02', [], 'CREATE TABL oops')).map((t) => t.table)).toEqual(['hotel_guests', 'rumours']);
  });

  it('lists the schema for the sidebar', async () => {
    const s = await engine.schema('s03');
    expect(s.map((t) => t.table)).toEqual(['gate_log', 'hotel_guests', 'suspects', 'vehicles']);
    expect(s.find((t) => t.table === 'gate_log')!.columns).toContain('vehicle_colour');
  });

  it('runs the S12 index demo script in under a few seconds', async () => {
    const pack12 = 's12';
    await engine.loadSnapshot(pack12, await loader.snapshot(pack12));
    const fs = await import('node:fs');
    const script = fs.readFileSync(new URL('../../../../content/case_db/runtime/index_demo.sql', import.meta.url), 'utf8');
    const r = await engine.runScript(pack12, script, 'SELECT COUNT(*), COUNT(DISTINCT device_owner) FROM tower_pings_archive;');
    expect(r.error).toBeUndefined();
    expect(r.result!.values[0]).toEqual([100000, 33]);   // every public person in `people`
  });
});
