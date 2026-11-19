// What Inspector Kaal says. Kaal is the learner's own assistant and partner on the case - a quiet, sharp detective who works
// for the student (not for SI Ira Menon, and not sent by her). He never gives away an answer (the hints do that); he reacts, cheers, nudges and teases -
// lively and warm, in plain simple English (no Hindi: many students don't speak it), spoken aloud by voice.ts.
// Lines live here, in the UI layer, so the episode YAML (and the build's content rules) are untouched.
// {name} = the mentor's first name, {who} = the speaker, {you} = the student's first name (start screen; adapters/identity.ts). Keep them short: one breath, simple English.

export type KaalMood = 'idle' | 'think' | 'happy' | 'smirk' | 'point' | 'cheer' | 'oops' | 'whisper';
export type KaalEvent =
  | 'intro' | 'scene' | 'hook' | 'note' | 'task' | 'running' | 'pass' | 'passFirst' | 'wrong' | 'error' | 'trap'
  | 'hint1' | 'hint2' | 'hint3' | 'activity' | 'activityRight' | 'activityWrong' | 'check' | 'checkRight' | 'checkWrong'
  | 'clue' | 'pinned' | 'demo' | 'idle' | 'solved' | 'resume' | 'review';

export const MOOD: Record<KaalEvent, KaalMood> = {
  intro: 'whisper', scene: 'idle', hook: 'whisper', note: 'think', task: 'point', running: 'think', pass: 'happy', passFirst: 'cheer',
  wrong: 'oops', error: 'oops', trap: 'smirk', hint1: 'whisper', hint2: 'whisper', hint3: 'oops', activity: 'point',
  activityRight: 'happy', activityWrong: 'oops', check: 'think', checkRight: 'happy', checkWrong: 'think', clue: 'whisper',
  pinned: 'cheer', demo: 'point', idle: 'point', solved: 'cheer', resume: 'whisper', review: 'idle',
};

// Reactions that only comment on a new step (not on something the student did). They never cut off a line Kaal is
// still saying, and on a phone they are not shown as a bubble.
export const PASSIVE_EVENTS = new Set<KaalEvent>(['scene', 'note', 'task', 'activity', 'check', 'clue', 'demo', 'hook', 'review', 'resume', 'running']);

export const LINES: Record<KaalEvent, string[]> = {
  intro: [
    // no self-introduction here: Kaal introduces himself once, on the Briefing
    'Let’s go, {you}! Rule number one: data never lies. People sometimes do.',
    'Here we go, {you}! Tonight the database is our only witness. Let’s make it talk!',
  ],
  scene: ['Read that carefully, {you}. Someone just gave away a clue.', 'Note that down, {you}. It may matter later!', 'Interesting. Keep this in mind.', 'Did you catch that? I did.'],
  hook: ['Uh-oh. Something big is coming. I can smell it!', 'The night isn’t done with us yet, {you}!', 'Stay sharp! The next part gets spicy.'],
  note: ['Read this one properly, okay? It’s the tool you need in a minute.', 'Every great detective knows their tools. Here’s a new one!', 'Learn this, and the next query becomes easy-peasy.'],
  task: ['Your turn, {you}! Ask the database.', 'The answer is hiding in those tables. Go and catch it!', 'Write the query. Don’t worry, I’ve got your back.', 'Peek at the tables first, then type. Let’s go!'],
  running: ['Running it…', 'Let’s see what the data says…', 'Searching the records…'],
  pass: ['Well done! That’s it!', 'Clean query! That’s exactly the data we needed.', 'Got it! Ira will be so pleased.', 'See? The database never lies. Well done!', 'Perfect, {you}!'],
  passFirst: ['First try! You’re a natural!', 'Exactly right, in one shot! I’m impressed.', 'Not a single wrong step. That’s real detective work!'],
  wrong: ['Close, close! Look at the result again - what’s missing?', 'Not quite, {you}. Compare it with what was asked.', 'Count the rows in your result. Is that what the question asked for?', 'No problem! Every wrong turn teaches something. Try again.'],
  error: ['Oops! The database didn’t understand that. Check the spelling and commas.', 'Probably a small typo. Read the error slowly.', 'Even I mistype, {you}. Fix it and run again!'],
  trap: ['That’s a common mistake! Read the note to see why.', 'Gotcha! Classic mistake - now you’ll never make it again.', 'The case tried to fool you! Read the note.'],
  hint1: ['Here, a clue for you: read the course note. Everything you need is in it.', 'Here’s your first hint: the course note. Start there.'],
  hint2: ['I’ve sketched half the query. You fill in the blanks!', 'Half done already. You finish it, {you}.'],
  hint3: ['Here’s the full query. Read every line before you run it, okay?', 'Here’s the full answer. Read how it works, then we move on.'],
  activity: ['Quick one! Trust your gut.', 'Your turn, {you}. Sort this one out.', 'A little puzzle. Take your time.'],
  activityRight: ['Exactly right!', 'Spot on, {you}!', 'Wow, you’re getting good at this!'],
  activityWrong: ['Not quite. Look again!', 'One more try, you’ve got this.', 'Hmm, think it through once more.'],
  check: ['Quick question, {you}!', 'Let’s see if that stuck.'],
  checkRight: ['Correct! Read why anyway.', 'Correct! Well done.'],
  checkWrong: ['Not this time - the explanation shows why.', 'Read the explanation. That’s the real lesson.'],
  clue: ['Evidence! Look at it closely.', 'Your own query found this. Not a rumour - a fact!', 'Ooh, this changes things…'],
  pinned: ['Pinned! The board is filling up nicely.', 'Another piece of the puzzle!', 'We’re getting closer to her, {you}!'],
  demo: ['Watch how fast this query finds the answer.'],
  idle: ['Stuck? Open a hint envelope - that’s what they’re for!', 'Take your time. The tables drawer shows every column.', 'Hello? Still with me, {you}?'],
  solved: ['Case update filed! Fantastic work tonight.', 'One more step closer to Tara!', 'That, {you}, is how it’s done!'],
  resume: ['Welcome back, {you}! Right where we left it.', 'You came back! Good. The case was waiting for you.'],
  review: ['Looking back is smart. Patterns hide in old evidence!'],
};

let seed = Math.floor(Math.random() * 1000);
export function lineFor(e: KaalEvent): string {
  const list = LINES[e];
  seed = (seed + 1) % 9973;
  return list[seed % list.length];
}

// Episode-level teasers: Kaal's take on the episode, shown on the intro (no spoilers - only what the episode name promises)
export const TEASE: Record<number, string> = {
  1: 'A star vanishes six hours before her show. Her phone is off. Let’s see what the data remembers.',
  2: 'Before we chase anyone, we need a place to keep what we find. Let’s build our case file.',
  3: 'Hotels write down every car that comes in. Every car that goes out, too…',
  4: 'Cabs leave trails. Pickup, drop, time. Someone took a ride tonight.',
  5: 'Money always moves before people do. Follow the UPI trail.',
  6: 'Her phone is off. But something of hers is still talking to a tower…',
  7: 'Her watch counted every heartbeat. Was she calm? Or scared?',
  8: 'Five people. Five stories. Not all of them are true.',
  9: 'Ten tables, all connected. Let’s draw how they link, so nothing slips through.',
  10: 'A car, an owner, a company. One table can’t tell us - join them and the dots connect.',
  11: 'Highways have eyes. The toll booths saw a car tonight.',
  12: 'Somebody changed her contract tonight. Systems keep logs. Logs remember.',
  13: 'Midnight. 40,000 fans. Last chance, {you}. Let’s bring her home.',
};

// ---------------------------------------------------------------- lines the screens build (kept here so they can be recorded)
// Everything Kaal says outside the reactions above. The screens call these; tools/kaal-voice records every one of them
// (ALL_SPOKEN below), so a line added anywhere else has no recorded voice. `say` is what is spoken when the text on
// screen carries a number that cannot be recorded in advance.
export const SAY = {
  briefing: (star: string) => `I'm your assistant, {you}, and tonight I work for you. I'll be in the corner of your screen all night. Stuck on a query? Open one of my hint envelopes. Run your query and I'll tell you if it's right. If it's wrong, I'll show you what to fix. Got a question about the game? Tap me and ask. Let's find ${star}.`,
  introFirst: () => `${TEASE[1]} Stay close, {you}.`,
  introBack: (session: number) => `Welcome back, {you}. ${TEASE[session] ?? ''}`.trim(),
  newLead: '{you}! New lead tonight. Stay close, let’s go!',
  chapterClosed: (n: number, of: number) => `Chapter ${n} of ${of} closed - your progress is saved. Good place for a break, {you}… or keep going?`,
  chapterClosedSay: 'Chapter closed - your progress is saved. Good place for a break, {you}… or keep going?',
  promoted: (rank: string) => `Promoted, {you}! ${rank} now. Wear it well - and don’t go far. The night isn’t over.`,
  caseClosed: 'We did it, {you}. Every claim backed by a query. Ira says you’ve earned your badge.',
  goodWork: 'Good work tonight, {you}. File it - and don’t go far. The night isn’t over.',
  evidence: (n: number) => `${n} piece${n === 1 ? '' : 's'} of evidence, {you}. Read them in order - they show how the night unfolds.`,
  evidenceSay: 'Your evidence so far, {you}. Read it in order - it shows how the night unfolds.',
  evidenceEmpty: 'An empty board. Solve a task, pin what you prove, and it starts to fill.',
  openEpisodeFirst: 'Open an episode first, {you}. That tool lives on the game screen.',
  notInThisEpisode: 'That page is not part of this episode, {you}. Find it in your course.',
  voiceOn: 'I’m your assistant. I’ll talk you through it, {you}.',
} as const;

// Every line that gets a recording: the template (as the game shows it, "{you}" for the name) and the mood it is said in.
// `star` is the missing singer's name from the cast (the Briefing line names her); `ranks` are the ranks one can be promoted to.
export function allSpokenLines(star: string, ranks: string[], episodes = Object.keys(TEASE).map(Number)): { template: string; mood: KaalMood }[] {
  const out: { template: string; mood: KaalMood }[] = [];
  for (const e of Object.keys(LINES) as KaalEvent[]) for (const t of LINES[e]) out.push({ template: t, mood: MOOD[e] });
  for (const n of episodes) {
    out.push({ template: TEASE[n], mood: 'think' });
    out.push({ template: SAY.introBack(n), mood: 'think' });
  }
  out.push({ template: SAY.introFirst(), mood: 'whisper' }, { template: SAY.briefing(star), mood: 'whisper' }, { template: SAY.newLead, mood: 'whisper' },
    { template: SAY.chapterClosedSay, mood: 'cheer' }, { template: SAY.caseClosed, mood: 'cheer' }, { template: SAY.goodWork, mood: 'cheer' },
    { template: SAY.evidenceSay, mood: 'think' }, { template: SAY.evidenceEmpty, mood: 'point' },
    { template: SAY.openEpisodeFirst, mood: 'point' }, { template: SAY.notInThisEpisode, mood: 'point' }, { template: SAY.voiceOn, mood: 'idle' });
  for (const r of ranks) out.push({ template: SAY.promoted(r), mood: 'cheer' });
  const seen = new Set<string>();
  return out.filter((l) => l.template && !seen.has(l.template) && seen.add(l.template));
}

