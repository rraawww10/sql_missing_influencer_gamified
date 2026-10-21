import { describe, it, expect } from 'vitest';
import { fileLoader, nodeEngine } from '../test/fixtures';

// Regression: a learner's valid CREATE TABLE was graded wrong (2026-10-05 report)
describe('S2 table-structure grading', async () => {
  const loader = fileLoader();
  const engine = await nodeEngine();
  const pack = await loader.pack(2);
  await engine.loadSnapshot('s02', await loader.snapshot('s02'));
  const task = (id: string) => pack.beats.find((b) => b.type === 'task' && b.task_id === id) as Parameters<typeof engine.grade>[1];
  const grade = async (id: string, sql: string) => (await engine.grade('s02', task(id), sql, 2)).verdict.status;

  it('accepts the reported query (lower-case keyword, different VARCHAR size)', async () => {
    expect(await grade('T2.1', 'CREATE table suspects (\n  name VARCHAR(200),\n  role VARCHAR(200),\n  phone VARCHAR(15),\n  age INT\n);')).toBe('pass');
  });
  it('accepts INTEGER for INT and any letter case in column names', async () => {
    expect(await grade('T2.1', 'create table suspects (Name varchar(200), ROLE varchar(100), phone varchar(15), age INTEGER);')).toBe('pass');
  });
  it('still rejects a missing column, a wrong type or a wrong order', async () => {
    expect(await grade('T2.1', 'CREATE TABLE suspects (name VARCHAR(200), role VARCHAR(100), phone VARCHAR(15));')).toBe('wrong');
    expect(await grade('T2.1', 'CREATE TABLE suspects (name VARCHAR(200), role VARCHAR(100), phone INT, age INT);')).toBe('wrong');
    expect(await grade('T2.1', 'CREATE TABLE suspects (role VARCHAR(100), name VARCHAR(200), phone VARCHAR(15), age INT);')).toBe('wrong');
  });
  it('ADD COLUMN accepts any VARCHAR size', async () => {
    expect(await grade('T2.9', 'ALTER TABLE suspects ADD alibi VARCHAR(500);')).toBe('pass');
  });
});

describe('ContentLoader rejects non-content responses', () => {
  it('HTML instead of a snapshot or JSON → ContentNotReady (dev-server fallback page)', async () => {
    const { ContentLoader, ContentNotReady } = await import('./loader');
    const html = new ContentLoader(async () => new Response('<!doctype html><html></html>', { status: 200 }));
    await expect(html.snapshot('s02')).rejects.toBeInstanceOf(ContentNotReady);
    await expect(html.pack(2)).rejects.toBeInstanceOf(ContentNotReady);
    await expect(html.caseNotes()).rejects.toBeInstanceOf(ContentNotReady);
  });
});
