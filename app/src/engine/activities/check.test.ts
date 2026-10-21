import { describe, expect, it } from 'vitest';
import { checkActivity, shuffled } from './check';
import type { ActivityBeat } from '../../content/types';

const sort = { id: 'a', type: 'activity', kind: 'sort_into', prompt: 'p', buckets: ['X', 'Y'],
  items: [{ text: 'one', bucket: 'X' }, { text: 'two', bucket: 'Y' }] } as ActivityBeat;

describe('activities', () => {
  it('marks each part', () => {
    const r = checkActivity(sort, { kind: 'sort_into', placement: { one: 'X', two: 'X' } });
    expect(r).toEqual({ correct: false, parts: { one: true, two: false } });
    expect(checkActivity(sort, { kind: 'sort_into', placement: { one: 'X', two: 'Y' } }).correct).toBe(true);
  });

  it('checks order and pick_cell', () => {
    const order = { id: 'o', type: 'activity', kind: 'order', prompt: 'p', steps: ['a', 'b', 'c'] } as ActivityBeat;
    expect(checkActivity(order, { kind: 'order', steps: ['a', 'c', 'b'] }).correct).toBe(false);
    const pick = { id: 'k', type: 'activity', kind: 'pick_cell', prompt: 'p',
      tables: [{ caption: 'T', columns: ['c'], rows: [[1], [2]] }], answer: { table: 'T', row: 1, column: 'c' } } as ActivityBeat;
    expect(checkActivity(pick, { kind: 'pick_cell', table: 'T', row: 1, column: 'c' }).correct).toBe(true);
    expect(checkActivity(pick, { kind: 'pick_cell', table: 'T', row: 0, column: 'c' }).correct).toBe(false);
  });

  it('multi_select needs exactly the correct options', () => {
    const ms = { id: 'm', type: 'activity', kind: 'multi_select', prompt: 'p',
      options: [{ text: 'a', correct: true }, { text: 'b' }, { text: 'c', correct: true }] } as ActivityBeat;
    expect(checkActivity(ms, { kind: 'multi_select', selected: ['a', 'c'] }).correct).toBe(true);
    expect(checkActivity(ms, { kind: 'multi_select', selected: ['a', 'b', 'c'] }).correct).toBe(false);
  });

  it('shuffles deterministically and never returns the answer order', () => {
    const steps = ['a', 'b', 'c', 'd'];
    expect(shuffled(steps, 'S1.17')).toEqual(shuffled(steps, 'S1.17'));
    for (const seed of ['x', 'y', 'z', 'S1.17', 'S2.1']) expect(shuffled(steps, seed)).not.toEqual(steps);
  });
});
