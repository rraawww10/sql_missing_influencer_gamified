// Kaal's recorded voice: the list of lines to record, and the guarantee that the game finds the clip for each of them.
//   npm run voice:lines     writes tools/kaal-voice/lines.json (what tools/kaal-voice/generate.py records)
// When a voice pack is installed (content/voice/manifest.json), this also checks that every line has its clip:
// a line that was added or reworded after the recording fails here, so Kaal never goes silent unnoticed.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LINES, SAY, allSpokenLines } from './lines';
import { RANKS } from '../../engine/progress/derive';
import { candidateKeys, spokenText, voiceKey } from '../voiceKey';

const ROOT = path.resolve(__dirname, '../../../..');
const cast = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/story/cast.json'), 'utf8')) as { people: Record<string, { name: string }> };
const star = cast.people.star.name;
const lines = allSpokenLines(star, RANKS.slice(1).map((r) => r.name)).map((l) => ({ key: voiceKey(l.template), text: spokenText(l.template), mood: l.mood, show: l.template }));

if (process.env.MAKE_VOICE_LINES) {
  const out = path.join(ROOT, 'tools/kaal-voice/lines.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(lines, null, 2)}\n`);
  console.log(`wrote ${lines.length} lines (${lines.reduce((n, l) => n + l.text.length, 0)} characters) to ${out}`);
}

describe("Kaal's lines to record", () => {
  it('covers every reaction, every episode and every line the screens build', () => {
    expect(lines.length).toBeGreaterThan(110);
    for (const list of Object.values(LINES)) for (const t of list) expect(lines.some((l) => l.show === t), t).toBe(true);
    for (const t of [SAY.briefing(star), SAY.introFirst(), SAY.introBack(7), SAY.newLead, SAY.chapterClosedSay, SAY.promoted('Constable'), SAY.caseClosed, SAY.goodWork,
      SAY.evidenceSay, SAY.evidenceEmpty, SAY.openEpisodeFirst, SAY.notInThisEpisode, SAY.voiceOn]) expect(lines.some((l) => l.show === t), t).toBe(true);
  });

  it('every line has its own key', () => {
    const keys = new Set(lines.map((l) => l.key));
    expect(keys.size).toBe(lines.length);
    for (const k of keys) expect(k).toMatch(/^[0-9a-f]{8}$/);
  });

  it('what is recorded never contains the name slot, emoji or markup, and reads as a sentence', () => {
    for (const l of lines) {
      expect(l.text, l.show).not.toMatch(/[{}*_`#]|\s{2}|\s[,.!?]/);
      expect(l.text.length, l.show).toBeGreaterThan(3);
      expect(l.text[0], l.show).toBe(l.text[0].toUpperCase());
      expect(l.text, l.show).not.toMatch(/^[,.!? ]|,\s*[.!?]/);
    }
    expect(spokenText('Well done, {you}!')).toBe('Well done!');
    expect(spokenText('{you}! New lead tonight. Stay close, let’s go!')).toBe("New lead tonight. Stay close, let's go!");
    expect(spokenText('That, {you}, is how it’s done!')).toBe("That is how it's done!");
    expect(spokenText('Hello? Still with me, {you}?')).toBe('Hello? Still with me?');
    expect(spokenText('Money always moves. Follow the UPI trail - with SQL…')).toBe('Money always moves. Follow the U P I trail, with S Q L...');
  });

  it('the game finds the clip of every line once the student\'s name is in it, whatever the name', () => {
    for (const name of ['Priya', 'partner', 'Mohammed', 'A.J', 'Zoë', "D'Souza", 'Kaal']) {
      for (const l of lines) {
        const onScreen = l.show.replace(/\{you\}/g, name);
        expect(candidateKeys(onScreen, name), `${name}: ${l.show}`).toContain(l.key);
      }
    }
    // a small edit of punctuation keeps the clip; other words need a new one
    expect(voiceKey('Well done! That’s it!')).toBe(voiceKey("well done - that's it"));
    expect(voiceKey('Well done! That’s it!')).not.toBe(voiceKey('Well done! That was it!'));
  });

  it('lines whose text on screen carries a number are spoken through a fixed recording', () => {
    expect(SAY.chapterClosed(2, 3)).toContain('Chapter 2 of 3');
    expect(lines.some((l) => l.show === SAY.chapterClosed(2, 3))).toBe(false);
    expect(lines.some((l) => l.show === SAY.chapterClosedSay)).toBe(true);
    expect(lines.some((l) => l.show === SAY.evidence(4))).toBe(false);
  });
});

const manifestFile = path.join(ROOT, 'content/voice/manifest.json');
describe.skipIf(!fs.existsSync(manifestFile))('the installed voice pack', () => {
  it('has a clip for every line (re-run tools/kaal-voice/generate.py after changing a line)', () => {
    const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as { clips: Record<string, string> };
    const missing = lines.filter((l) => !m.clips[l.key] || !fs.existsSync(path.join(path.dirname(manifestFile), m.clips[l.key])));
    expect(missing.map((l) => l.show)).toEqual([]);
  });
});
