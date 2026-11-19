// Kaal's recorded voice: how a line of text finds its audio clip.
//
// Every line Kaal can say is recorded once (tools/kaal-voice) as content/voice/<key>.mp3, where <key> comes from the
// line's TEMPLATE - the text as written in the code, with "{you}" where the student's name goes. The recording itself
// leaves the name out ("Well done, {you}!" is recorded as "Well done!"): a name cannot be recorded in advance.
// At run time the game has the finished text ("Well done, Priya!"), so it puts "{you}" back before looking the clip up.
// Pure functions, no browser APIs: the game, the exporter and the tests all use these.

// The key of a line: 8 hex characters. Case, punctuation and spacing do not matter, so a small edit like "!" → "."
// keeps the same clip; a change of words gives a new key (and needs a new recording).
export function voiceKey(template: string): string {
  const t = template.replace(/\{you\}/g, ' @ ').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9@]+/g, ' ').trim();
  let h = 0x811c9dc5;                                    // FNV-1a, 32 bit
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// The keys to try for a finished line: as it is, and with the student's first name turned back into "{you}".
// The name can also be a word of the line itself (a student called Kaal hears "I'm Kaal, Kaal, and …"), so every
// single occurrence is tried on its own as well as all of them together.
export function candidateKeys(text: string, firstName: string): string[] {
  const keys = new Set([voiceKey(text)]);
  const name = firstName.trim();
  if (!name) return [...keys];
  const re = new RegExp(`(?<![\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu');
  const at = [...text.matchAll(re)].map((m) => m.index!);
  if (!at.length) return [...keys];
  const swap = (which: number[]) => which.reduceRight((t, i) => `${t.slice(0, i)}{you}${t.slice(i + name.length)}`, text);
  keys.add(voiceKey(swap(at)));
  if (at.length > 1) for (const i of at.slice(0, 6)) keys.add(voiceKey(swap([i])));
  return [...keys];
}

// What is actually recorded for a template: the name is left out and the text is tidied the way it should be read aloud
export function spokenText(template: string): string {
  let t = template
    .replace(/,\s*\{you\},/g, '')                       // "That, {you}, is how" → "That is how"
    .replace(/,\s*\{you\}(?=[\s,.!?…]|$)/g, '')          // "Well done, {you}!"  → "Well done!"
    .replace(/\{you\}[,!]\s*/g, '')                       // "{you}! New lead."   → "New lead."
    .replace(/\s*\{you\}/g, '')                           // anything left
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}✦]/gu, '')
    .replace(/[*_`#>|]/g, '')
    .replace(/\bSQL\b/g, 'S Q L').replace(/\bUPI\b/g, 'U P I').replace(/\b40,000\b/g, 'forty thousand')
    .replace(/\bKaal\b/g, 'Kahl')                        // the voice says "Kaal" as "Kyle" half the time; "Kahl" comes out right
    .replace(/…/g, '...').replace(/ - /g, ', ').replace(/[“”]/g, '"').replace(/’/g, "'")
    .replace(/\s+([,.!?])/g, '$1').replace(/\s+/g, ' ').trim();
  t = t.replace(/^[,.!?\s]+/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
