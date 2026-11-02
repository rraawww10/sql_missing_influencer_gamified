// What Inspector Kaal says. Kaal is the learner's partner on the case — a quiet, sharp detective SI Ira Menon
// assigned to "look after the new intern". He never gives away an answer (the hints do that); he reacts, nudges and teases.
// Lines live here, in the UI layer, so the episode YAML (and the build's content rules) are untouched.
// {name} = the mentor's first name, {who} = the speaker. Keep them short: one breath, simple English.

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
    'Kaal. Ira asked me to keep an eye on you. Data never lies, partner — people do.',
    'New intern, huh? Stick close. Tonight the database is our only witness.',
  ],
  scene: ['Listen carefully. Somebody always says one word too many.', 'Note who said that. It may matter later.', 'Hmm. Keep that in mind.', 'Interesting…'],
  hook: ['Something’s coming. I can feel it.', 'The night isn’t done with us yet.', 'Stay sharp. Next part gets interesting.'],
  note: ['Read this one twice. It’s the tool you’ll need in a minute.', 'Every good detective knows their tools. This is one.', 'Learn this and the next query is easy.'],
  task: ['Your turn, partner. Ask the database.', 'The answer is in those tables. Go get it.', 'Write the query. I’ll watch your back.', 'Check the tables first, then type.'],
  running: ['Running it…', 'Let’s see what the data says…', 'Searching the records…'],
  pass: ['That’s it. Nice work.', 'Clean query. The data talked.', 'Got it. Ira will be pleased.', 'See? The database doesn’t lie.'],
  passFirst: ['First try! You’re a natural.', 'Sharp. First attempt. I’m impressed.', 'Not one wrong step. That’s detective work.'],
  wrong: ['Close. Look at the result again — what’s missing?', 'Not quite. Compare it with what was asked.', 'Hmm. Count the rows. Does it match?', 'Every wrong turn tells you something. Try again.'],
  error: ['The database didn’t understand that. Check spelling and commas.', 'A typo, probably. Read the error slowly.', 'Even I mistype. Fix it and run again.'],
  trap: ['Heh. That’s the trap most people fall into. Read why.', 'Gotcha! Classic mistake. Now you’ll never make it again.', 'The case tried to fool you. Read the note.'],
  hint1: ['Here — read the course note. Everything you need is in it.', 'A lead. Start here.'],
  hint2: ['I’ve sketched the query. Fill in the blanks.', 'Half the query’s done. You finish it.'],
  hint3: ['Here’s the full query. Read every line before you run it.', 'No shame in it. Understand it, then move on.'],
  activity: ['Quick one. Trust your gut.', 'Sort this out for me, partner.', 'A small puzzle. Take your time.'],
  activityRight: ['Exactly right.', 'Spot on.', 'You’re getting good at this.'],
  activityWrong: ['Not quite. Look again.', 'One more try.', 'Hmm. Think it through.'],
  check: ['Quick question, partner.', 'Let’s see if that stuck.'],
  checkRight: ['Correct. Read why anyway.', 'Right on.'],
  checkWrong: ['Not this time — the explanation shows why.', 'Read the explanation. That’s the lesson.'],
  clue: ['Evidence. Look at it closely.', 'Your query found this. Not a rumour — a fact.', 'This changes things…'],
  pinned: ['Pinned. The board is filling up.', 'Another piece of the puzzle.', 'We’re getting closer to her.'],
  demo: ['Watch this. Speed matters in a hunt.'],
  idle: ['Stuck? The 💡 envelopes are there for a reason.', 'Take your time. The tables drawer shows every column.', 'Still with me, partner?'],
  solved: ['Case update filed. Good work tonight.', 'One more step closer to Tara.', 'That’s how it’s done, partner.'],
  resume: ['Welcome back, partner. Right where we left it.', 'You came back. Good. The case is waiting.'],
  review: ['Looking back is smart. Patterns hide in old evidence.'],
};

let seed = Math.floor(Math.random() * 1000);
export function lineFor(e: KaalEvent): string {
  const list = LINES[e];
  seed = (seed + 1) % 9973;
  return list[seed % list.length];
}

// Episode-level teasers: Kaal's take on the episode, shown on the intro (no spoilers — only what the episode name promises)
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
  10: 'A car, an owner, a company. One table can’t tell us — join them and the dots connect.',
  11: 'Highways have eyes. The toll booths saw a car tonight.',
  12: 'Somebody changed her contract tonight. Systems keep logs. Logs remember.',
  13: 'Midnight. 40,000 fans. Last chance, partner. Let’s bring her home.',
};
