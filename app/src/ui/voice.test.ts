// @vitest-environment jsdom
// Kaal's recorded voice at run time: a line plays its clip, a line with no clip stays silent (one voice only),
// and without a voice pack the browser's own voice is used as before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasRecordedVoice, hush, setVoicePack, speak, voiceSupported } from './voice';
import { voiceKey } from './voiceKey';
import { setCurrentIdentity } from '../adapters/identity';
import { SAY } from './kaal/lines';

const played: string[] = [];
let paused = 0;
const rates: number[] = [];
class FakeAudio {
  onplaying: (() => void) | null = null; onended: (() => void) | null = null; onerror: (() => void) | null = null;
  playbackRate = 1; preservesPitch = false; paused = true; ended = false; preload = '';
  constructor(public src: string) {}
  play() { played.push(this.src); rates.push(this.playbackRate); this.paused = false; return Promise.resolve(); }
  pause() { paused++; this.paused = true; }
}
const spokenByBrowser: string[] = [];
const synth = { speak: (u: { text: string }) => { spokenByBrowser.push(u.text); }, cancel: () => {}, getVoices: () => [], addEventListener: () => {} };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('SpeechSynthesisUtterance', class { voice = null; lang = ''; pitch = 1; rate = 1; volume = 1; onstart = null; onend = null; onerror = null; constructor(public text: string) {} });
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  played.length = 0; rates.length = 0; spokenByBrowser.length = 0; paused = 0;
  setCurrentIdentity({ id: 'NW1', name: 'Priya Sharma', email: 'p@x.com', at: '' });
});
afterEach(() => { hush(); setVoicePack(null); setCurrentIdentity(null); vi.useRealTimers(); vi.unstubAllGlobals(); });

const pack = (templates: string[], extra: object = {}) => ({ voice: 'test', clips: Object.fromEntries(templates.map((t) => [voiceKey(t), `${voiceKey(t)}.mp3`])), ...extra });

describe("Kaal's recorded voice", () => {
  it('plays the clip of a line, found through the template even though the text carries the student\'s name', () => {
    setVoicePack(pack(['Perfect, {you}!', 'Well done! That’s it!']));
    expect(hasRecordedVoice()).toBe(true);
    speak('Perfect, Priya!', { mood: 'happy' });
    expect(played).toEqual([`/content/voice/${voiceKey('Perfect, {you}!')}.mp3`]);
    vi.advanceTimersByTime(2000);
    speak('Well done! That’s it!');
    expect(played[1]).toBe(`/content/voice/${voiceKey('Well done! That’s it!')}.mp3`);
    expect(paused).toBe(1);                               // the first clip is stopped when the next line starts
    expect(spokenByBrowser).toEqual([]);                  // never the browser's voice on top
  });

  it('every clip plays at the speed it was recorded at: no time-stretching (it warbles), even if an old pack asks for it', () => {
    const p = pack(['Perfect, {you}!', 'Well done! That’s it!']);
    setVoicePack({ ...p, rates: { [voiceKey('Well done! That’s it!')]: 0.86 } });
    speak('Perfect, Priya!');
    vi.advanceTimersByTime(2000);
    speak('Well done! That’s it!');
    expect(rates).toEqual([1, 1]);
  });

  it('a comment on a new step never cuts off a line Kaal is still saying; a reaction does', () => {
    setVoicePack(pack(['Well done! That’s it!', 'Read this one properly.', 'Not quite. Look again!']));
    speak('Well done! That’s it!');
    vi.advanceTimersByTime(2000);
    speak('Read this one properly.', { passive: true });
    expect(played.length).toBe(1);                         // still saying "Well done": the step comment waits its turn (skipped)
    vi.advanceTimersByTime(2000);
    speak('Not quite. Look again!');
    expect(played.length).toBe(2);                         // a reaction to what the student did takes over
    expect(paused).toBe(1);
  });

  it('a line shown with a number is spoken through its fixed recording (say)', () => {
    setVoicePack(pack([SAY.chapterClosedSay]));
    speak('Chapter 2 of 3 closed - your progress is saved. Good place for a break, Priya… or keep going?', { say: SAY.chapterClosedSay.replace('{you}', 'Priya') });
    expect(played).toEqual([`/content/voice/${voiceKey(SAY.chapterClosedSay)}.mp3`]);
  });

  it('a line with no clip (a chat answer) is not spoken at all, so Kaal keeps one voice', () => {
    setVoicePack(pack(['Perfect, {you}!']));
    speak('A correct query gives 10 points, plus 3 if it is your first try.');
    vi.advanceTimersByTime(200);
    expect(played).toEqual([]);
    expect(spokenByBrowser).toEqual([]);
  });

  it('…unless the pack says to fall back to the browser voice', () => {
    setVoicePack(pack(['Perfect, {you}!'], { fallback: 'browser' }));
    speak('A correct query gives 10 points.');
    vi.advanceTimersByTime(200);
    expect(spokenByBrowser).toEqual(['A correct query gives 10 points.']);
  });

  it('without a voice pack the browser speaks, as before', () => {
    expect(hasRecordedVoice()).toBe(false);
    expect(voiceSupported()).toBe(true);
    speak('Well done! That’s it!');
    vi.advanceTimersByTime(200);
    expect(played).toEqual([]);
    expect(spokenByBrowser).toEqual(['Well done! That’s it!']);
  });
});

describe("Kaal's recorded voice through Web Audio (the normal path in a browser)", () => {
  it('downloads the whole clip, decodes it, then plays it from memory with a fade-out when the next line takes over', async () => {
    const log: string[] = [];
    class FakeParam { value = 1; cancelScheduledValues() {} setValueAtTime(v: number) { this.value = v; } linearRampToValueAtTime(v: number, t: number) { log.push(`fade to ${v} by ${t}`); } }
    class FakeCtx {
      state = 'running'; currentTime = 10; destination = {};
      resume() { return Promise.resolve(); }
      createGain() { return { gain: new FakeParam(), context: this, connect: (d: unknown) => d }; }
      createBufferSource() {
        const node = { buffer: null as unknown, onended: null as null | (() => void), connect: (g: unknown) => g,
          start: () => log.push(`start ${(node.buffer as { name: string }).name}`), stop: (t: number) => log.push(`stop at ${t}`) };
        return node;
      }
      decodeAudioData(b: ArrayBuffer) { return Promise.resolve({ duration: 2, name: new TextDecoder().decode(b) }); }
    }
    vi.stubGlobal('AudioContext', FakeCtx);
    const fetched: string[] = [];
    vi.stubGlobal('fetch', (url: string) => { fetched.push(url); return Promise.resolve(new Response(new TextEncoder().encode(url.split('/').pop()!))); });
    vi.useRealTimers();
    setVoicePack(pack(['Exactly right!', 'Hmm, think it through once more.']));
    speak('Exactly right!');
    await new Promise((r) => setTimeout(r, 20));
    speak('Hmm, think it through once more.');
    await new Promise((r) => setTimeout(r, 20));
    expect(fetched).toEqual([`/content/voice/${voiceKey('Exactly right!')}.mp3`, `/content/voice/${voiceKey('Hmm, think it through once more.')}.mp3`]);
    expect(log[0]).toBe(`start ${voiceKey('Exactly right!')}.mp3`);
    expect(log[1]).toBe('fade to 0.0001 by 10.12');                                   // the first line fades out, it is not chopped
    expect(Number(log[2].replace('stop at ', ''))).toBeCloseTo(10.14, 5);
    expect(log[3]).toBe(`start ${voiceKey('Hmm, think it through once more.')}.mp3`);
    expect(played).toEqual([]);                                                         // no <audio> streaming at all
  });
});

