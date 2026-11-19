// The episode stories in the briefing timeline and on each episode intro: every episode is open from the start,
// so a story sets up the situation and the question and never gives away an answer found later in the case.
import { describe, expect, it } from 'vitest';
import { EPISODES } from './episodes';

const SPOILERS = [/\bDev\b/, /Arora/, /Green Acres/i, /farm/i, /\bSUV\b/i, /Ramesh/, /B-?88/, /RRO-17/, /charged|custody|culprit|kidnap/i];

describe('episode stories', () => {
  it('every episode has a short story: 2 or 3 sentences, plain hyphens (no em dashes), no spoilers', () => {
    expect(EPISODES).toHaveLength(13);
    for (const e of EPISODES) {
      const sentences = e.story.split(/(?<=[.?!])\s+(?=[A-Z"])/).filter(Boolean);
      expect(sentences.length, `${e.n}: ${e.story}`).toBeGreaterThanOrEqual(2);
      expect(sentences.length, `${e.n}: ${e.story}`).toBeLessThanOrEqual(4);
      expect(e.story.length, `${e.n}`).toBeLessThan(330);
      expect(e.story, `${e.n}`).not.toMatch(/—/);
      for (const s of SPOILERS) expect(e.story, `${e.n} gives away ${s}`).not.toMatch(s);
    }
  });
});
