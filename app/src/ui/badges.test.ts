// Episode score % and badges: the maximum per episode must match the real content, and the tiers must be right.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BADGES, EPISODE_MAX, GAME_MAX, badgeOf, maxPoints, nextTier, scorePct, tierOf } from './badges';

const packs = path.join(__dirname, '..', '..', '..', 'content', 'sessions');

describe('episode score and badges', () => {
  it('EPISODE_MAX is what each episode can really give (all tasks first try, no hints, every activity, check and clue)', () => {
    for (let n = 1; n <= 13; n++) {
      const pack = JSON.parse(fs.readFileSync(path.join(packs, `s${String(n).padStart(2, '0')}.json`), 'utf8')) as { beats: { type: string }[] };
      expect(maxPoints(pack.beats), `episode ${n}`).toBe(EPISODE_MAX[n - 1]);
    }
    expect(GAME_MAX).toBe(1488);
    expect(BADGES).toHaveLength(13);
  });

  it('tiers: 100 platinum, 90 gold, 70 silver, else bronze; scores are capped at 100', () => {
    expect([100, 99, 90, 89, 70, 69, 0].map((p) => tierOf(p).id)).toEqual(['platinum', 'gold', 'gold', 'silver', 'silver', 'bronze', 'bronze']);
    expect(scorePct(250, 200)).toBe(100);
    expect(badgeOf(2, 200)).toMatchObject({ name: 'Case File Architect', pct: 100, max: 200, tier: { id: 'platinum' } });
    expect(badgeOf(2, 140).tier.id).toBe('silver');
    expect(nextTier(85)?.name).toBe('Gold');
    expect(nextTier(100)).toBeNull();
  });
});
