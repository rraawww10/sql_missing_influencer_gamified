// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { nextRank, takePromotion } from './ranks';
import type { Progress } from '../engine/progress/derive';

const prog = (solved: number, rank: string) => ({
  rank, sessions: Array.from({ length: 13 }, (_, i) => ({ status: i < solved ? 'completed' : 'available' })),
}) as unknown as Progress;

describe('ranks', () => {
  beforeEach(() => localStorage.clear());
  it('counts episodes to the next rank', () => {
    expect(nextRank(0)).toEqual({ name: 'Constable', left: 4 });
    expect(nextRank(5)).toEqual({ name: 'Sub-Inspector', left: 3 });
    expect(nextRank(13)).toBeNull();
  });
  it('celebrates a promotion once, only on the episode that earns it', () => {
    expect(takePromotion(prog(3, 'Intern'))).toBeNull();
    expect(takePromotion(prog(4, 'Constable'))).toBe('Constable');
    expect(takePromotion(prog(4, 'Constable'))).toBeNull();      // already shown
    expect(takePromotion(prog(5, 'Constable'))).toBeNull();      // not the earning episode
    expect(takePromotion(prog(13, 'Inspector'))).toBe('Inspector');
  });
});
