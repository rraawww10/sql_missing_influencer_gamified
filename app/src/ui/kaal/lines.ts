// What Inspector Kaal says. Kaal is the learner's partner on the case - a quiet, sharp detective SI Ira Menon
// assigned to "look after the new intern". He never gives away an answer (the hints do that); he reacts, cheers, nudges and teases - 
// lively and warm, with a little Hinglish ("Shabash!", "Arre", "Chalo") because he's spoken aloud with an Indian voice (voice.ts).
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

export const LINES: Record<KaalEvent, string[]> = {
  intro: [
    // no self-introduction here: Kaal introduces himself once, on the Briefing
    'Chalo, {you}! Rule number one: data never lies. People? Always.',
    'Here we go, {you}! Tonight the database is our only witness. Let’s make it talk!',
  ],
  scene: ['Ooh, listen to that. Somebody always says one word too many.', 'Note that down, {you}. It may matter later!', 'Hmm hmm. Interesting… very interesting.', 'Did you catch that? I did.'],
  hook: ['Uh-oh. Something big is coming. I can smell it!', 'The night isn’t done with us yet, {you}!', 'Stay sharp! The next part gets spicy.'],
  note: ['Read this one properly, okay? It’s the tool you need in a minute.', 'Every great detective knows their tools. Here’s a new one!', 'Learn this, and the next query becomes easy-peasy.'],
  task: ['Your turn, {you}! Ask the database.', 'The answer is hiding in those tables. Go and catch it!', 'Write the query. Don’t worry, I’ve got your back.', 'Peek at the tables first, then type. Chalo!'],
  running: ['Running it…', 'Let’s see what the data says…', 'Searching the records…'],
  pass: ['Shabash! That’s it!', 'Clean query! The data started singing.', 'Got it! Ira will be so pleased.', 'See? The database never lies. Well done!', 'Ekdum perfect, {you}!'],
  passFirst: ['First try?! Wah, you’re a natural!', 'Bilkul sahi, in one shot! I’m impressed.', 'Not a single wrong step. That’s real detective work!'],
  wrong: ['Close, close! Look at the result again - what’s missing?', 'Not quite, {you}. Compare it with what was asked.', 'Hmm. Count the rows. Do they match?', 'Koi baat nahi! Every wrong turn teaches something. Try again.'],
  error: ['Oops! The database didn’t understand that. Check the spelling and commas.', 'Probably a small typo. Read the error slowly.', 'Even I mistype, {you}. Fix it and run again!'],
  trap: ['Hehe! That’s the trap everybody falls into. Read why.', 'Gotcha! Classic mistake - now you’ll never make it again.', 'Arre, the case tried to fool you! Read the note.'],
  hint1: ['Here, a clue for you: read the course note. Everything you need is in it.', 'A small lead. Start here!'],
  hint2: ['I’ve sketched half the query. You fill in the blanks!', 'Half done already. You finish it, {you}.'],
  hint3: ['Here’s the full query. Read every line before you run it, okay?', 'No shame in it! Understand it, then we move on.'],
  activity: ['Quick one! Trust your gut.', 'Sort this out for me, {you}.', 'A little puzzle. Take your time.'],
  activityRight: ['Exactly right!', 'Spot on, {you}!', 'Arre wah, you’re getting good at this!'],
  activityWrong: ['Not quite. Look again!', 'One more try, you’ve got this.', 'Hmm, think it through once more.'],
  check: ['Quick question, {you}!', 'Let’s see if that stuck.'],
  checkRight: ['Correct! Read why anyway.', 'Right on the money!'],
  checkWrong: ['Not this time - the explanation shows why.', 'Read the explanation. That’s the real lesson.'],
  clue: ['Evidence! Look at it closely.', 'Your own query found this. Not a rumour - a fact!', 'Ooh, this changes things…'],
  pinned: ['Pinned! The board is filling up nicely.', 'Another piece of the puzzle!', 'We’re getting closer to her, {you}!'],
  demo: ['Watch this! In a hunt, speed matters.'],
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
  9: 'Ten tables and a wall of red string. Let’s draw it properly, so nothing slips through.',
  10: 'A car, an owner, a company. One table can’t tell us - join them and the dots connect.',
  11: 'Highways have eyes. The toll booths saw a car tonight.',
  12: 'Somebody changed her contract tonight. Systems keep logs. Logs remember.',
  13: 'Midnight. 40,000 fans. Last chance, {you}. Let’s bring her home.',
};
