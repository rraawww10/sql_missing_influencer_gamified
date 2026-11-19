// Ask Kaal - the answer engine behind the help chat (KaalChat.tsx).
//
// There is no AI here. `ask()` is a small deterministic engine: a hand-written knowledge base about the game, plus a
// search over the course reading material for SQL concept questions. Every number it quotes is read from the code it
// describes (POINTS, RANKS, EPISODES, MAX_ACTIVITY_TRIES), so the answers cannot drift from the game.
// `ask()` is async and gets everything it needs as arguments, so an AI backend can replace its body later
// without touching the UI.
//
// How one question is answered (the first step that matches wins):
//   1. guardrails   asking for a task answer -> a kind "no" + the hint envelopes; story spoilers -> "no spoilers"
//   2. game topics  the knowledge base (TOPICS): every topic has word rules, the best-scoring topic answers
//   3. SQL concept  the best matching heading / definition in the reading material -> a short excerpt + "open-learn"
//   4. off-topic    a one-line redirect to the game
//   5. fallback     "I didn't understand" + 3 suggested questions
//
// Matching is forgiving: lower-case, no punctuation, contractions, plurals, synonyms (SYNONYMS), fixed phrases (PHRASES)
// and one-letter typos (fuzzy match against the words the rules use). Rules are word sets, so word order does not matter.
//
// Text rules for every reply: short simple English in Kaal's voice, 1 to 4 short sentences, hyphens (never em dashes),
// `backticks` only around SQL keywords, no Hindi.
import type { KaalMood } from '../lines';
import { POINTS, RANKS, SESSION_COUNT } from '../../../engine/progress/derive';
import { MAX_ACTIVITY_TRIES } from '../../../engine/runner/sessionRunner';
import { EPISODES } from '../../episodes';
import { storyTime } from '../../speakers';

export interface ChatContext {
  screen: 'map' | 'briefing' | 'intro' | 'play' | 'done' | 'evidence';
  session?: number;      // the episode on screen (1-13)
  beatType?: string;     // the step on screen while playing: scene, hook, note, task, clue, check, activity, demo
  onTask?: boolean;      // a live (unsolved) SQL task is on screen: the hint envelopes can be opened
  rank?: string;
  points?: number;
  name?: string;
}
export type ChatAction = { kind: 'open-learn' | 'open-tables' | 'open-hints' | 'open-evidence' | 'go-map' | 'go-briefing'; label: string };
export interface Reply { text: string; mood: KaalMood; chips?: string[]; action?: ChatAction }
export interface KnowledgeSources { courseNotes(): Promise<Record<string, { title: string; markdown: string }>> }

export const MAX_QUESTION = 300;

// ---------------------------------------------------------------- actions
const ACT = {
  learn: { kind: 'open-learn', label: 'Open the reading material' },
  tables: { kind: 'open-tables', label: 'Open the tables' },
  hints: { kind: 'open-hints', label: 'Open the hint envelopes' },
  evidence: { kind: 'open-evidence', label: 'Open the Evidence Board' },
  map: { kind: 'go-map', label: 'Go to the case map' },
  briefing: { kind: 'go-briefing', label: 'Read the briefing' },
} satisfies Record<string, ChatAction>;

// An action only makes sense on some screens (the chat keeps old messages while the student moves around)
export function actionFits(a: ChatAction, ctx: ChatContext): boolean {
  switch (a.kind) {
    case 'open-hints': return !!ctx.onTask;
    case 'open-tables': return ctx.screen === 'play';
    case 'open-evidence': return ctx.screen !== 'evidence';
    case 'go-map': return ctx.screen !== 'map';
    case 'go-briefing': return ctx.screen !== 'briefing';
    default: return true;
  }
}

// ---------------------------------------------------------------- reading the question
// plural -> singular, good enough for matching ("episodes" -> "episode", "queries" -> "query", "indexes" -> "index")
const KEEP_S = new Set(['this', 'does', 'goes', 'alias', 'always', 'dbms', 'rdbms', 'news', 'thanks', 'yes', 'sms', 'perhaps', 'besides', 'towards']);
function singular(w: string): string {
  if (w.length <= 3 || KEEP_S.has(w) || /(ss|us|is)$/.test(w)) return w;
  if (/ies$/.test(w) && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(xes|ches|shes|sses)$/.test(w)) return w.slice(0, -2);
  return w.endsWith('s') ? w.slice(0, -1) : w;
}

// canonical word <- the other ways students say it
const SYNONYMS: Record<string, string> = {
  hello: 'hi hii hiii hey heyy helo hellow hola namaste yo greetings',
  thanks: 'thank thankyou thanx thx thnx thnks ty tysm tq',
  bye: 'goodbye byee cya tata',
  answer: 'ans solution soln',
  hint: 'envelope envelop',
  point: 'pts pt score scoring marks xp',
  cost: 'penalty deduct deducted deduction charge',
  rank: 'ranking designation',
  promote: 'promoted promotion promoting',
  badge: 'medal achievement',
  episode: 'session ep eps',
  clue: 'evidence proof',
  pin: 'pinned pinning',
  save: 'saved saving autosave autosaved',
  reset: 'resetting restart restarting restarted',
  replay: 'replaying redo',
  run: 'running ran execute executing executed submit',
  database: 'db',
  column: 'col cols field',
  sound: 'audio music volume mute muted unmute noise sfx',
  feedback: 'rating',
  email: 'mail gmail',
  computer: 'device laptop pc desktop machine',
  attempt: 'try retry chance',
  practice: 'practise practicing practising',
  denied: 'deny',
  stuck: 'struck',
  confused: 'confusing confuse confusion',
  difference: 'differ versus vs',
  lock: 'locked unlock unlocked',
  teach: 'taught learn learnt learned learning cover covered',
  shortcut: 'keyboard hotkey',
  activity: 'puzzle',
  forgot: 'forget forgotten forgetting',
  recover: 'recovery retrieve',
  delete: 'deleted deleting erase erased remove removed',
  change: 'changed changing edit',
  disappear: 'disappeared vanish vanished',
  missing: 'lost gone',
  select: 'selecting', insert: 'inserting inserted', update: 'updating updated', create: 'creating created',
  join: 'joining joined', group: 'grouping grouped', order: 'ordering sorting sort sorted', filter: 'filtering filtered',
  alter: 'altering', drop: 'dropping dropped', index: 'indexing indices', aggregation: 'aggregate aggregating', model: 'modelling modeling',
  talk: 'talking talks spoke speak speaking speaks',
  subquery: 'subquerie', alias: 'aliase', organiser: 'organizer', grey: 'gray greyed grayed',
  frustrated: 'frustrating frustration annoying annoyed irritating',
  hard: 'difficult tough',
  insensitive: 'sensitive sensitivity',
};
const SYN = new Map<string, string>();
for (const [canon, list] of Object.entries(SYNONYMS)) for (const v of list.split(' ')) { SYN.set(v, canon); SYN.set(singular(v), canon); }
const word = (w: string): string => { const s = singular(w); return SYN.get(w) ?? SYN.get(s) ?? s; };

// Fixed phrases, replaced by one token before the words are looked at (applied to the clean lower-case text)
const PHRASES: [RegExp, string][] = [
  [/\b(?:ctrl|control|cmd|command) ?(?:plus )?enter\b/g, 'ctrl enter'],
  [/\bnxt ?wave\b|\bnext ?wave\b/g, 'nxtwave'],
  [/\b(?:log|sign|logged|signed) ?in\b/g, 'login'],
  [/\b(?:log|sign) ?out\b/g, 'logout'],
  [/\b(?:sign|signed|signing) ?up\b/g, 'signup'],
  [/\be mail\b/g, 'email'],
  [/\b(?:cheat ?sheets?|course notes?|reading materials?|study materials?)\b/g, 'readingmaterial'],
  [/\bcase notes?\b/g, 'casenote'],
  [/\bquick checks?\b/g, 'quickcheck'],
  [/\b(?:start over|start again|start fresh|from scratch|from the beginning|from start)\b/g, 'reset'],
  [/\bplay(?:ing)? (?:it |this |that |the episode |an episode )?again\b/g, 'replay'],
  [/\bthank you\b|\bthank u\b/g, 'thanks'],
  [/\bgood (?:morning|afternoon|evening|day)\b/g, 'hello'],
  [/\bgood night\b|\bsee (?:you|ya|u)\b|\btake care\b/g, 'bye'],
  [/\bmatch found\b/g, 'matchfound'],
  [/\bnot quite\b/g, 'denied'],
  [/\bfull reveal\b/g, 'fullreveal'],
  [/\bfill in the blanks?\b|\bfill the blanks?\b/g, 'fillblanks'],
  [/\bdata cell\b/g, 'datacell'],
  [/\btime ?limit\b/g, 'timer'],
  [/\bhow long\b/g, 'howlong'],
  [/\bhow (?:many|much)\b/g, 'howmany'],
  [/\b(?:would|d) like\b|\blike to\b|\b(?:looks?|feels?|seems?|something|just) like\b|\blike (?:this|that)\b/g, ' '],
  [/\bgive up\b|\bgiving up\b|\bquit\b/g, 'giveup'],
  [/\b(?:what (?:should|do|shall|can|must) (?:i|we) do|what am i supposed to do|what to do|what do i have to do|what now|now what|what next|what is next|where (?:do|should) i (?:start|begin|go)|what is my (?:task|job) (?:now|here))\b/g, 'whatnow'],
  [/\bhow (?:are|r) (?:you|u)\b|\bhow do you do\b|\bwhat is up\b|\bwassup\b|\bsup\b/g, 'howareyou'],
  [/\bwho (?:are|r) (?:you|u)\b|\bwhat (?:are|r) (?:you|u)\b|\b(?:what is )?your name\b|\babout (?:you|yourself)\b|\bintroduce yourself\b/g, 'whoareyou'],
  [/\bwho am i\b|\bwhat am i\b|\bwhat is my (?:role|job|duty)\b|\bmy role\b/g, 'whoami'],
  [/\bwhat can (?:you|u) do\b|\bwhat can i ask\b|\bwhat do you know\b|\bhow can you help\b|\bwhat (?:should|can) i ask\b/g, 'whatcanyoudo'],
  [/\bno such\b/g, 'nosuch'],
  [/\bfirst (?:try|attempt|go)\b/g, 'firsttry'],
  [/\bsub ?inspector\b/g, 'subinspector'],
];

// SQL words that are also everyday words: they count as SQL only when typed in CAPITALS or `backticks`
const FUNCTION_SQL = ['in', 'and', 'or', 'not', 'by', 'like', 'between', 'as', 'on', 'all', 'is', 'case', 'view', 'index', 'key', 'update', 'order'];

interface Query {
  raw: string;
  plain: string;         // lower-case, no punctuation, contractions expanded: for regexes that read like English
  stems: string;         // plain with every word made singular: for episode titles
  text: string;          // the canonical tokens joined: for the guardrail regexes
  tokens: string[];      // canonical tokens (synonyms, phrases and typos resolved)
  set: Set<string>;
  caps: Set<string>;     // function-like SQL words the student marked as SQL (CAPITALS / backticks)
}

function plainOf(raw: string): string {
  return ` ${raw.toLowerCase()} `
    .replace(/[‘’´`]/g, "'").replace(/[“”]/g, '"')
    .replace(/\bc\+\+/g, 'cplusplus').replace(/\*/g, ' asterisk ').replace(/%/g, ' percent ')
    .replace(/\b(what|who|where|how|when|why|it|that|there|here|he|she)'?s\b/g, '$1 is')
    .replace(/\bi'?m\b/g, 'i am').replace(/\bcan'?t\b|\bcannot\b/g, 'can not').replace(/\bwon'?t\b/g, 'will not')
    .replace(/\b(do|does|did|is|are|was|were|has|have|had|should|would|could)n'?t\b/g, '$1 not')
    .replace(/\b(\w+)'ve\b/g, '$1 have').replace(/\b(\w+)'re\b/g, '$1 are').replace(/\b(\w+)'ll\b/g, '$1 will')
    .replace(/'s\b/g, '').replace(/\bu\b/g, 'you').replace(/\br\b/g, 'are').replace(/\bpls\b|\bplz\b/g, 'please')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

// optimal string alignment distance (insert, delete, replace, swap two neighbours), cut off above `max`
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [], prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur.push(d);
      if (d < best) best = d;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
// the one vocabulary word a mistyped word most likely is (same first letter, 1 edit, or 2 for long words); null when unsure
function nearest(w: string, vocab: Iterable<string>): string | null {
  if (w.length < 4 || /\d/.test(w)) return null;
  const max = w.length >= 8 ? 2 : 1;
  let best: string | null = null, bestD = max + 1, tie = false;
  for (const v of vocab) {
    if (v.length < 4 || v[0] !== w[0]) continue;
    const d = editDistance(w, v, max);
    if (d < bestD) { best = v; bestD = d; tie = false; } else if (d === bestD && v !== best) tie = true;
  }
  return best && !tie ? best : null;
}

// everyday words that are never "corrected" into a game word
const COMMON = new Set(('a an the i you he she it we they me my your his her our their this that these those is are was were be been am do does did '
  + 'have has had can could will would shall should may might must not no yes and or but if then else so because as of in on at to for from with without by about into '
  + 'over under after before between during up down out off again more most some any all each every many much few other another same new old first last next one two '
  + 'three four five six seven eight nine ten what which who whom whose when where why how there here now just only also very too really please tell say said show give '
  + 'get got make made take took want need know think see look find use used using work works working mean means go going come back still yet ever never always thing '
  + 'something anything nothing way time day night today tonight good bad right wrong okay ok like well even than them us him while through once twice done doing being '
  + 'having let keep put start stop open close read write type press tap click button screen page game play help does goes cant wont dont able long short big small '
  + 'full whole part kind sort easy fast slow later soon already almost maybe sure fine great nice cool wait went gone came left stay stand hand line word name '
  + 'home house room side best better worse little lot bit both either neither since until upon else ever such own per via etc eg ie '
  + 'file card text list item test main area mode move face fact form free hold idea kind life live mind miss near once only plan real rest seem send show sign stay talk tell term turn view wait walk want week year').split(' '));

let fuzzyVocab: Set<string> | null = null;
function analyse(raw: string): Query {
  const plain = plainOf(raw);
  let t = ` ${plain} `;
  for (const [re, to] of PHRASES) t = t.replace(re, ` ${to} `);
  const vocab = (fuzzyVocab ??= ruleVocabulary());
  const tokens: string[] = [];
  for (const w of t.split(' ')) {
    if (!w) continue;
    let c = word(w);
    if (!vocab.has(c) && !COMMON.has(w) && !COMMON.has(c) && !SYN.has(w) && !OFF_TOPIC.has(c)) c = nearest(c, vocab) ?? c;   // a typo: the closest word the rules know
    tokens.push(c);
  }
  const caps = new Set<string>();
  for (const m of raw.matchAll(/`([A-Za-z]+)`|\b([A-Z]{2,})\b/g)) {
    const w = (m[1] ?? m[2]).toLowerCase();
    if (FUNCTION_SQL.includes(w)) caps.add(w);
  }
  return { raw, plain, stems: plain.split(' ').map(singular).join(' '), text: tokens.join(' '), tokens, set: new Set(tokens), caps };
}
const has = (q: Query, ...words: string[]) => words.some((w) => q.set.has(w));
// The tokens without a leading "where": "where are the tables?" asks for a place, "what is WHERE?" asks about the keyword
const OPENERS = ['hello', 'kaal', 'please', 'so', 'okay', 'ok', 'and', 'but'];
function sqlTokens(q: Query): string[] {
  const lead = q.tokens.findIndex((t) => !OPENERS.includes(t));
  return q.tokens.filter((t, i) => !(t === 'where' && i === lead && !q.caps.has('where')));
}

// ---------------------------------------------------------------- small helpers for the answers
const firstName = (ctx: ChatContext) => (ctx.name ?? '').trim().split(/\s+/)[0] ?? '';
const comma = (ctx: ChatContext) => (firstName(ctx) ? `, ${firstName(ctx)}` : '');
const an = (noun: string) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
const listOf = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const say = (text: string, mood: KaalMood = 'idle', extra: Pick<Reply, 'chips' | 'action'> = {}): Reply => ({ text, mood, ...extra });
const worthAfterHint = (tier: number) => Math.max(POINTS.taskPassed - (POINTS.hintPenalty[tier] ?? 0), POINTS.taskMinimum);
const TRAPS_FOR_BADGE = 3;   // engine/progress/derive.ts: the "Trap Spotter" badge

// The words students see on buttons and results (components/TaskPanel.tsx, screens/Player.tsx, screens/Home.tsx,
// game/StoryStages.tsx, identity/). If the UI is reworded, change them here and every answer follows.
const UI = {
  run: 'Run query', hint: 'Get a hint', hintsTab: 'Kaal’s hints', resetDb: 'Reset DB', clear: 'Clear editor', tables: 'Tables',
  learn: 'Learn', scroll: 'Open the scroll', pass: 'Correct', wrong: 'Not quite', trap: 'Trap', error: 'Error',
  pin: 'Pin to Evidence Board', upNext: 'Up next', trail: 'Tonight’s trail', next: 'Next episode', switchStudent: 'Log out',
};

// ---------------------------------------------------------------- suggested questions
// Every string here (and every chip in the answers below) is a question the engine itself can answer: brain.test.ts checks that.
export function starters(ctx: ChatContext): string[] {
  switch (ctx.screen) {
    case 'map': return ['How do points work?', 'How do I get promoted?', 'What does each episode teach?', 'How is my progress saved?'];
    case 'briefing': return ['How does the game work?', 'Who is Tara Sen?', 'Who are you, Kaal?', 'How do hints work?'];
    case 'intro': return ['What will I learn in this episode?', 'What should I do now?', 'How do hints work?', 'Can I continue on another computer?'];
    case 'done': return ['Why is the next episode locked?', 'How do I get promoted?', 'Can I play this episode again?', 'How do points work?'];
    case 'evidence': return ['What is the Evidence Board?', 'How do I pin a clue?', 'What should I do now?'];
    default: break;
  }
  switch (ctx.beatType) {
    case 'task': return ['How do I run my query?', 'How do hints work?', `What does ${UI.wrong} mean?`, 'Where are the tables?'];
    case 'note': return ['What is a Learn step?', 'What should I do now?', 'How do points work?'];
    case 'clue': return ['How do I pin a clue?', 'What is the Evidence Board?', 'What should I do now?'];
    case 'check': return ['How does a quick check work?', 'What should I do now?', 'How do points work?'];
    case 'activity': return ['How do activities work?', 'How many tries do I get?', 'What should I do now?'];
    default: return ['What should I do now?', 'Who is Tara Sen?', 'How do I go back a step?', 'How is my progress saved?'];
  }
}

// ---------------------------------------------------------------- answers that depend on where the student is
function whatNow(ctx: ChatContext): Reply {
  switch (ctx.screen) {
    case 'map': return say(`On “${UI.trail}”, tap the stop marked “${UI.upNext}” and press its play button. New here? Read the briefing first - it explains the whole case.`, 'point',
      { action: ACT.briefing, chips: ['How do points work?', 'What does each episode teach?'] });
    case 'briefing': return say(`Read the briefing, then start the first episode, “${EPISODES[0].title}”. You need no SQL to begin - you learn it all inside the case.`, 'point',
      { chips: ['Who is Tara Sen?', 'How do hints work?'] });
    case 'intro': return say('Press the start button to begin this episode. If you were here before, you continue from the step where you stopped.', 'point',
      { chips: ['What will I learn in this episode?', 'How do hints work?'] });
    case 'done': return say(`Send the short feedback card first. Then “${UI.next}” unlocks - or you can go back to the case map.`, 'point',
      { chips: ['Why is the next episode locked?', 'How do I get promoted?'] });
    case 'evidence': return say('Read your clues in order - together they show how the night went. Then go back and keep solving.', 'think',
      { action: ACT.map, chips: ['What is the Evidence Board?'] });
    default: break;
  }
  switch (ctx.beatType) {
    case 'task': return say(`Read what is asked, look at the tables, then write your query and press ${UI.run}. When the console says ${UI.pass}, press Continue.\nStuck? My hint envelopes are ready.`, 'point',
      { action: ACT.hints, chips: ['How do I run my query?', 'How do hints work?', 'Where are the tables?'] });
    case 'note': return say('Read this Learn step slowly - it is the tool for the next task. Then press Continue.', 'think', { chips: ['What is a Learn step?'] });
    case 'check': return say('Pick the answer you think is right. Then read the explanation and press Continue.', 'point', { chips: ['How does a quick check work?'] });
    case 'activity': return say(`Solve the little puzzle on the screen. You get ${MAX_ACTIVITY_TRIES} tries, then I show the answer. After that, press Continue.`, 'point', { chips: ['How do activities work?'] });
    case 'clue': return say('Read the new evidence, then pin it to your Evidence Board. That unlocks Continue.', 'point', { chips: ['How do I pin a clue?', 'What is the Evidence Board?'] });
    case 'demo': return say('Press the Run button on the demo and watch the timings. Then press Continue.', 'point');
    default: return say('Read the story, then press Continue (or the right arrow key). Read carefully - people give away clues when they talk.', 'point',
      { chips: ['How do I go back a step?', 'Who is Tara Sen?'] });
  }
}

function continueLocked(ctx: ChatContext): Reply {
  if (ctx.screen === 'done') return say('Send the feedback card first. The buttons below it unlock right after.', 'point', { chips: ['Why is the next episode locked?'] });
  if (ctx.screen === 'play') switch (ctx.beatType) {
    case 'task': return say(`Continue unlocks after a correct query. Keep running yours until the console says ${UI.pass}.`, 'point', { action: ACT.hints, chips: ['How do hints work?', `What does ${UI.wrong} mean?`] });
    case 'check': return say('Pick an answer first - then Continue unlocks.', 'point');
    case 'activity': return say(`Finish the activity first. After ${MAX_ACTIVITY_TRIES} wrong tries I show the answer, and Continue unlocks.`, 'point');
    case 'clue': return say('Pin the evidence first. If the Pin button does not work, solve the SQL task before it.', 'point', { chips: ['How do I pin a clue?'] });
    case 'demo': return say('Run the demo once - then Continue unlocks.', 'point');
    default: break;
  }
  return say('Continue unlocks when the step is done: run a correct query, pick an answer, finish the activity or pin the clue. Story steps are always open.', 'think',
    { chips: ['What should I do now?', 'How do I go back a step?'] });
}

function stuck(ctx: ChatContext): Reply {
  if (ctx.onTask) return say(`Getting stuck is normal${comma(ctx)}. Read the task once more, then look at the tables.\nStill stuck? Open my first envelope - it costs only ${POINTS.hintPenalty[1]} points.`, 'whisper',
    { action: ACT.hints, chips: ['How do hints work?', 'What do hints cost?', 'Where are the tables?'] });
  return whatNow(ctx);
}

function rankLadder(): string {
  const [start, ...rest] = RANKS;
  const steps = rest.map((r, i) => {
    const count = `${r.minSessions === SESSION_COUNT ? 'all ' : ''}${r.minSessions}`;
    return i === 0 ? `Solve ${count} episodes to become ${an(r.name)}` : `${count} for ${r.name}`;
  });
  return `You start as ${an(start.name)}. ${listOf(steps)}.`;
}
function myRank(ctx: ChatContext): Reply {
  if (!ctx.rank) return say(`${rankLadder()}\nYour rank is shown next to your name.`, 'think', { chips: ['How do points work?'] });
  const i = RANKS.findIndex((r) => r.name === ctx.rank);
  const next = i >= 0 ? RANKS[i + 1] : undefined;
  return say(`You are ${an(ctx.rank)}${comma(ctx)}. ${next ? `Next is ${next.name}, at ${plural(next.minSessions, 'episode')} solved.` : 'That is the top rank in the Data Cell!'}`, 'happy',
    { chips: ['How do I get promoted?', 'How do points work?'] });
}

// ---------------------------------------------------------------- episodes
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth'];
const EP_WORD = '(?:episode|ep|session|level|stage)';
const TITLE_STEMS = EPISODES.map((e) => ({ n: e.n, stem: plainOf(e.title).split(' ').map(singular).join(' ').replace(/^the /, '') }));

// the episode a question names: by title, by number ("episode 5", "5th episode", "fifth episode"), "last" or "next"
function episodeIn(q: Query, ctx: ChatContext): number | null {
  const ok = (n: number) => (n >= 1 && n <= EPISODES.length ? n : null);
  const title = TITLE_STEMS.find((t) => ` ${q.stems} `.includes(` ${t.stem} `));
  if (title) return title.n;
  let m = new RegExp(`\\b${EP_WORD} (?:number |no )?(\\d{1,2})\\b`).exec(q.plain) ?? new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? ${EP_WORD}\\b`).exec(q.plain);
  if (m) return ok(Number(m[1]));
  m = new RegExp(`\\b(${ORDINALS.join('|')}) ${EP_WORD}\\b`).exec(q.plain);
  if (m) return ok(ORDINALS.indexOf(m[1]) + 1);
  if (new RegExp(`\\b(?:last|final) ${EP_WORD}\\b`).test(q.plain)) return EPISODES.length;
  if (ctx.session && new RegExp(`\\bnext ${EP_WORD}\\b`).test(q.plain)) return ok(ctx.session + 1);
  return null;
}
function episodeReply(n: number): Reply {
  const e = EPISODES[n - 1];
  return say(`“${e.title}” is episode ${n} of ${EPISODES.length}, at ${storyTime(n)} in the story. It teaches: ${e.learn}.`, 'think',
    { chips: ['What does each episode teach?', 'How do I get promoted?'] });
}

// what each episode teaches, as searchable items ("GROUP BY" -> episode 5); the finale teaches no new tool
const LEARN_SKIP = new Set(['by', 'in', 'and', 'or', 'not', 'one', 'difference', 'multi']);
const LEARN_ITEMS = EPISODES.filter((e) => e.n < EPISODES.length).flatMap((e) => e.learn.split(',').map((item) => ({
  n: e.n, label: item.trim(), tokens: plainOf(item).split(' ').filter(Boolean).map(word).filter((t) => !LEARN_SKIP.has(t)),
})));
const LEARN_ALIAS: Record<string, string> = { aggregation: 'count', pagination: 'limit', wildcard: 'like', primary: 'key', foreign: 'key', entity: 'er', diagram: 'er', intersect: 'union', except: 'union', natural: 'join' };
function taughtIn(q: Query): { term: string; single: boolean; episodes: number[] } | null {
  const words = sqlTokens(q).map((t) => LEARN_ALIAS[t] ?? t);
  // the items that share the most words with the question; among those, the ones the question covers best ("WHERE" before "WHERE vs HAVING")
  const hits = LEARN_ITEMS.map((item) => { const n = item.tokens.filter((t) => words.includes(t)).length; return { item, n, part: n / (item.tokens.length || 1) }; }).filter((h) => h.n > 0);
  const best = Math.max(0, ...hits.map((h) => h.n));
  const bestPart = Math.max(0, ...hits.filter((h) => h.n === best).map((h) => h.part));
  const top = hits.filter((h) => h.n === best && h.part === bestPart);
  if (!top.length) return null;
  const matched = [...new Set(top.flatMap((h) => h.item.tokens.filter((t) => words.includes(t))))];
  const single = top.length === 1 && !top[0].item.label.includes('/');
  const sameItem = top.every((h) => matched.every((t) => h.item.tokens.includes(t)));   // "join" in five items -> JOIN; "update" + "alter" -> UPDATE / ALTER
  const term = single ? top[0].item.label : matched.join(sameItem ? ' ' : ' / ').toUpperCase();
  return { term, single, episodes: [...new Set(top.map((h) => h.item.n))] };
}

// ---------------------------------------------------------------- the knowledge base
// rules: each rule is a set of words that must ALL be in the question (a|b = either word). A rule scores one point per
// word; "+1" marks a rule built on a word that can only mean this topic. The best-scoring topic answers.
interface Topic {
  id: string;
  rules?: string[];
  small?: boolean;                                   // small talk: loses a tie against a real topic
  score?(q: Query, ctx: ChatContext): number;        // for topics that need more than word rules
  reply(ctx: ChatContext, q: Query): Reply;
}

const P = POINTS;
const TOPICS: Topic[] = [
  // ---- what to do, being stuck
  { id: 'whatnow', rules: ['whatnow +2', 'how start|begin|proceed', 'next step what'], reply: (ctx) => whatNow(ctx) },
  { id: 'stuck', rules: ['stuck +1', 'confused +1', 'not understand|get', 'help task|step|here|query', 'am missing', 'no idea', 'how solve +1', 'not know'], reply: (ctx) => stuck(ctx) },
  { id: 'frustrated', rules: ['hard +1', 'giveup +1', 'can not do', 'boring +1', 'hate this|it|game|sql', 'frustrated +1', 'tired +1'],
    reply: (ctx) => say(`Don’t give up${comma(ctx)}. Every detective gets stuck - it is part of the job. Take one small step: read the task again, look at the tables, or open my first envelope.`, 'whisper',
      { action: ACT.hints, chips: ['How do hints work?', 'What should I do now?'] }) },
  { id: 'beginner', rules: ['not know sql +2', 'beginner|newbie +1', 'new sql +1', 'never sql|code|coded +1', 'need know sql +1'],
    reply: (ctx) => say(`No problem${comma(ctx)}. You need no SQL to begin - every tool is taught inside the case, one Learn step at a time. And my hint envelopes are there when a task feels hard.`, 'happy',
      { chips: ['How does the game work?', 'How do hints work?', 'What does each episode teach?'] }) },
  { id: 'overview', rules: ['game how work|play', 'how play', 'game rule', 'game what', 'how work this|it', 'rule +1', 'instruction|tutorial|guide +1', 'how it work'],
    reply: () => say(`Each episode moves one step at a time: read the story, learn a tool, write SQL on the case database, then pin the clue your query proves. Solve all ${SESSION_COUNT} episodes to close the case.\nThe briefing explains it all.`, 'point',
      { action: ACT.briefing, chips: ['How do points work?', 'How do hints work?', 'Who is Tara Sen?'] }) },

  // ---- points, hints, attempts, ranks, badges
  { id: 'points', rules: ['point +1', 'howmany point', 'howmany point query|task|activity|clue|quickcheck|worth|get|earn +1', 'point earn|get|how|work|system|count|worth|give', 'bonus +1', 'firsttry +1'],
    reply: (ctx) => say(`A correct query gives ${P.taskPassed} points, plus ${P.firstTryBonus} if it is your first try with no hints. An activity gives ${P.activityFirstTry} (${P.activityLater} after a wrong try), a right quick check gives ${P.checkCorrect}, and each pinned clue gives ${P.cluePinned}.\nPoints are counted when you finish the episode.${typeof ctx.points === 'number' ? ` You have ${ctx.points} so far.` : ''}`, 'think',
      { chips: ['What do hints cost?', 'How do I get promoted?', 'How many tries do I get?'] }) },
  { id: 'mypoints', rules: ['my point', 'point have|got', 'howmany point have|got|my +1'],
    reply: (ctx) => (typeof ctx.points === 'number'
      ? say(`You have ${plural(ctx.points, 'point')} so far${comma(ctx)}. Keep going!`, 'happy', { chips: ['How do points work?', 'How do I get promoted?'] })
      : say('Your total is on the case map, and every solved episode shows its own points.', 'think', { action: ACT.map, chips: ['How do points work?'] })) },
  { id: 'hintcost', rules: ['hint cost +1', 'hint point +1', 'hint lose|free|howmany|expensive +1', 'hint howmany point'],
    reply: () => say(`Hints cost points on that task only. Envelope 1 takes ${P.hintPenalty[1]}, envelope 2 takes ${P.hintPenalty[2]} and envelope 3 takes ${P.hintPenalty[3]} - only the highest one you open counts.\nA solved task still gives at least ${P.taskMinimum} points, but the first-try bonus is gone.`, 'think',
      { chips: ['How do hints work?', 'How do points work?'] }) },
  { id: 'hints', rules: ['hint +1', 'sketch +1', 'fullreveal +1', 'fillblanks +1', 'lead the what', 'hint how|what|where|open|use|get|work|give|need|want'],
    reply: () => say(`On every SQL task I keep three sealed envelopes. Press ${UI.hint}, or open the “${UI.hintsTab}” tab under the task. The Lead shows the course note you need, The Sketch is the query with blanks, and Full Reveal types the full query into the console.\nOpen them in order - each one costs a few points.`, 'whisper',
      { action: ACT.hints, chips: ['What do hints cost?', 'How many tries do I get?'] }) },
  { id: 'attempts', rules: ['attempt +1', 'howmany attempt +1', 'wrong cost|point|lose', 'wrong answer|query cost|point|lose +1', 'lose point', 'unlimited +1', 'howmany time'],
    reply: () => say(`Run a SQL task as many times as you need - a wrong run costs no points. You only miss the +${P.firstTryBonus} first-try bonus.\nAn activity gives ${MAX_ACTIVITY_TRIES} tries before I show the answer, and a quick check takes one answer.`, 'happy',
      { chips: ['How do points work?', 'What do hints cost?'] }) },
  { id: 'ranks', rules: ['rank +1', 'promote +1', 'constable|subinspector +1', 'inspector +1', 'become inspector|constable|subinspector +1'],
    reply: (ctx) => say(`${rankLadder()}\nRanks come from episodes solved, not from points.${ctx.rank ? ` You are ${an(ctx.rank)} now.` : ''}`, 'cheer',
      { chips: ['How do points work?', 'What does each episode teach?'] }) },
  { id: 'myrank', rules: ['my rank +1', 'rank am|i'], reply: (ctx) => myRank(ctx) },
  { id: 'badges', rules: ['badge +1', 'trap spotter +1'],
    reply: () => say(`There are two badges. No-Hint Session: finish an episode without opening any envelope. Trap Spotter: walk into ${TRAPS_FOR_BADGE} traps in total - yes, mistakes count here!`, 'smirk',
      { chips: ['What is a Trap?', 'How do I get promoted?'] }) },

  // ---- the SQL console
  { id: 'run', rules: ['run query|sql|code|how|button +1', 'ctrl enter +1', 'query how write|type|enter', 'query where write|type|enter', 'console +1', 'editor +1'],
    reply: () => say(`Type your SQL in the console, then press ${UI.run} or hit Ctrl + Enter (Cmd + Enter on a Mac). The result shows up right below, and the console tells you if it matches what was asked.`, 'point',
      { chips: [`What does ${UI.wrong} mean?`, 'Where are the tables?', `What does ${UI.resetDb} do?`] }) },
  { id: 'shortcuts', rules: ['shortcut +1', 'arrow +1'],
    reply: () => say('Two shortcuts: Ctrl + Enter runs your query, and the left and right arrow keys move between steps. The arrows rest while you are typing in the console.', 'point',
      { chips: ['How do I run my query?', 'How do I go back a step?'] }) },
  { id: 'cleareditor', rules: ['clear editor|console +1'],
    reply: () => say(`${UI.clear} wipes only what you typed in the console. The tables and your progress stay as they are.`, 'idle', { chips: [`What does ${UI.resetDb} do?`] }) },
  { id: 'resetdb', rules: ['reset database +2', 'undo +1', 'delete table|row|data mistake|wrong|accident|accidentally +1', 'table|row|data missing|broke|broken|messed +1', 'database original|restore|fresh'],
    reply: () => say(`${UI.resetDb} puts every table back to how this task started and clears the result. It costs nothing. Every run starts from that clean state anyway, so a wrong \`UPDATE\` or \`DELETE\` never sticks.`, 'happy',
      { chips: ['How do I reset an episode?', 'Where are the tables?'] }) },
  { id: 'resetepisode', rules: ['reset episode|progress|game|everything +1', 'delete|clear progress +1', 'episode fresh'],
    reply: () => say('The Reset button on the top bar of the game screen clears this episode only: your saved place, its points and its clues. Other episodes stay safe. It asks you to confirm first, so it cannot happen by accident.', 'think',
      { chips: [`What does ${UI.resetDb} do?`, 'Can I play this episode again?'] }) },
  { id: 'reset', rules: ['reset +1', 'reset difference +3', 'reset database episode +2'],
    reply: () => say(`There are two resets. ${UI.resetDb} only puts the tables back for the task you are on - no points lost. Reset on the top bar clears your saved place, points and clues for the whole episode, so you start it fresh.`, 'think',
      { chips: [`What does ${UI.resetDb} do?`, 'How do I reset an episode?'] }) },
  { id: 'replay', rules: ['replay +1', 'episode again', 'improve|better point +1'],
    reply: () => say('Yes! Open a solved episode and play it again. Your best run is the one that counts, so replaying cannot lower your points.', 'happy',
      { chips: ['How do points work?', 'How do I reset an episode?'] }) },
  { id: 'tables', rules: ['table drawer +1', 'drawer +1', 'table where|see|open|show|find|list|look|check|which|available|there|name', 'schema +1', 'case database +1', 'column name|see|find|where|list|which'],
    reply: () => say(`${UI.tables} shows every table in the case database. On a SQL task it is the tab under the task brief, and the ${UI.tables} button on the top bar opens it on any step. Switch between Data for the rows and Schema for columns, types and keys.\nOn a task, tap a column name to drop it into the editor.`, 'point',
      { action: ACT.tables, chips: ['How do I run my query?', `What does ${UI.resetDb} do?`] }) },
  { id: 'results', rules: ['result mean|meaning|what|stamp', 'stamp +1', 'verdict +1'],
    reply: () => say(`${UI.pass}: your query matches what was asked. ${UI.wrong}: it ran, but the result is different. ${UI.error}: the database could not read it. ${UI.trap}: you hit a common mistake - read the note with it.`, 'think',
      { chips: [`What does ${UI.wrong} mean?`, 'What is a Trap?', 'What does Error mean?'] }) },
  { id: 'match', rules: ['matchfound +1', 'verified +1', 'correct mean|say|show|what +1'],
    reply: () => say(`“${UI.pass}” means your query returned exactly what was asked. Press Continue - a new clue may be waiting on the next step.`, 'cheer', { chips: ['How do I pin a clue?', 'How do points work?'] }) },
  { id: 'trap', rules: ['trap +1'],
    reply: () => say('A Trap is a common mistake hidden in the case on purpose. Your query gave a wrong lead, and the note with it explains why. Fix the query and run again - it costs no points, only the first-try bonus.', 'smirk',
      { chips: ['How many tries do I get?', `What does ${UI.wrong} mean?`] }) },
  { id: 'nosuchtable', rules: ['nosuch table +2'],
    reply: () => say(`That table name does not exist in the case database. Check the exact spelling in ${UI.tables}.`, 'oops', { action: ACT.tables, chips: ['Where are the tables?'] }) },
  { id: 'nosuchcolumn', rules: ['nosuch column +2'],
    reply: () => say(`That column is not in the table. Open the table in ${UI.tables} to see its real column names.`, 'oops', { action: ACT.tables, chips: ['Where are the tables?'] }) },
  { id: 'syntaxerror', rules: ['syntax error +1', 'incomplete +1'],
    reply: () => say('A syntax error means the database got confused near that word. Check spelling, commas, quotes and brackets around it. “Incomplete input” means the query ends too early.', 'oops', { chips: ['What does Error mean?', 'How do hints work?'] }) },
  { id: 'error', rules: ['error +1', 'sqlite say'],
    reply: () => say('Error means the database could not read your query, so nothing ran. It is usually a small typo: check spelling, commas, quotes and brackets. The line after “SQLite says” shows where it tripped.', 'oops',
      { chips: [`What does ${UI.wrong} mean?`, 'Where are the tables?'] }) },
  { id: 'denied', rules: ['denied +1', 'result wrong|different', 'wrong row|column'],
    reply: () => say(`“${UI.wrong}” means your query ran, but the result is not what the task asked for. Compare your rows and columns with the question - the console often says how many rows were expected.`, 'think',
      { action: ACT.hints, chips: ['How do hints work?', 'How many tries do I get?'] }) },
  { id: 'nottaught', rules: ['later course +1', 'not teach yet +1', 'come later +1'],
    reply: () => say('That note means your query used something the course has not reached yet. It is only a nudge - your result still counts. Try it again with the tools from the episodes so far.', 'think') },
  { id: 'practice', rules: ['practice +1', 'review +1', 'graded +1', 'finished|solved|old|earlier step|task +1', 'read only', 'revisit +1'],
    reply: () => say('Finished steps can be opened again with Back or from the step bar on top. They are read-only. A solved SQL task becomes a practice run: try any query you like - nothing is graded and your progress does not change.', 'think',
      { chips: ['How do I go back a step?', 'Can I play this episode again?'] }) },
  { id: 'checkmine', rules: ['query correct|right|wrong|check|fix|incorrect +1', 'my answer correct|right|wrong|check', 'is this|it correct|right', 'check my', 'query not work'],
    reply: () => say(`I cannot see or grade your query from this chat. Press ${UI.run} - the console tells you right away. If it says ${UI.wrong}, compare your result with what was asked.`, 'think',
      { action: ACT.hints, chips: [`What does ${UI.wrong} mean?`, 'How do hints work?'] }) },

  // ---- clues, steps, moving around
  { id: 'pinlocked', rules: ['pin not +1', 'pin lock|grey|disabled|inactive +1'],
    reply: () => say('The Pin button works only after you solve the SQL task that proves that clue. Go back to that task and get it right first.', 'point', { chips: ['How do I go back a step?'] }) },
  { id: 'clue', rules: ['clue +1', 'pin +1'],
    reply: () => say(`When your query proves something, a clue shows up on the next step. Press ${UI.pin} to keep it. That gives ${P.cluePinned} points and unlocks Continue.`, 'point',
      { chips: ['What is the Evidence Board?', 'How do points work?'] }) },
  { id: 'board', rules: ['board +1', 'clue board +1', 'clue where see|find', 'my clue +1', 'clue all|list +1'],
    reply: () => say('The Evidence Board is your wall of proof: every clue you pinned, with the query that proved it. While you play, the pin counter on the top bar opens the evidence. The full board fills up as you finish episodes.', 'think',
      { action: ACT.evidence, chips: ['How do I pin a clue?'] }) },
  { id: 'steps', rules: ['step +1', 'progress bar +1', 'step bar|list|howmany +1'],
    reply: () => say('An episode is a chain of steps: story, Learn steps, SQL tasks, evidence, quick checks and activities. You take one step at a time. The bar on top shows where you are, and the step chip under it opens the whole list.', 'think',
      { chips: ['How do I go back a step?', 'What is a chapter?'] }) },
  { id: 'chapters', rules: ['chapter +1', 'checkpoint +1', 'break take|when|good'],
    reply: () => say('Each episode is split into chapters, and a chapter closes every time you pin a clue. Your progress is saved right there, so it is a good spot for a break. I may also ask how the chapter felt - it never blocks you.', 'think',
      { chips: ['How is my progress saved?', 'How do I pin a clue?'] }) },
  { id: 'nav', rules: ['back step|button|go|how +1', 'continue button|how', 'next step how|go|move', 'move step|next|forward', 'navigate +1'],
    reply: () => say('Back and Continue are in the dock at the bottom of the screen, and the left and right arrow keys do the same. Continue unlocks once the step is done. You can look back any time, but you cannot skip ahead.', 'point',
      { chips: ['Why can’t I continue?', 'Can I practice on old tasks?'] }) },
  { id: 'continuelocked', rules: ['continue not|lock|grey|disabled|stuck|why +1', 'can not continue +1', 'not move|proceed +1', 'next not +1', 'next|continue button not +1'], reply: (ctx) => continueLocked(ctx) },
  { id: 'skip', rules: ['skip +1', 'jump ahead|next|step|episode|task', 'bypass +1'],
    reply: () => say(`No skipping, I’m afraid - each step unlocks the next. If a task really blocks you, my third envelope shows the full query. It leaves the task worth ${worthAfterHint(3)} points, but you keep moving.`, 'smirk',
      { action: ACT.hints, chips: ['How do hints work?', 'What do hints cost?'] }) },

  // ---- saving, signing in
  { id: 'saving', rules: ['save +1', 'progress keep|safe|store|stored|kept', 'close tab|browser|window', 'come back later|tomorrow', 'continue later|tomorrow', 'stop anytime|later|come|middle|between', 'leave come|middle|between'],
    reply: () => say('Your progress saves by itself after every step - on this device and in your account. Close the tab whenever you like. You will continue from the same step.', 'happy',
      { chips: ['Can I continue on another computer?', 'I forgot my NxtWave ID'] }) },
  { id: 'othercomputer', rules: ['computer +1', 'another|other|different|new computer +1', 'phone|mobile|tablet play|game|use|work|continue|open|my +1', 'home|college|school|lab|office continue|play|open|use +1'],
    reply: () => say('Yes! On the other device, log in with your NxtWave ID or your email. Your episodes, points, clues and even a half-done episode come back.', 'happy',
      { chips: ['I forgot my NxtWave ID', 'How is my progress saved?'] }) },
  { id: 'forgotid', rules: ['forgot id|nxtwave +2', 'recover id|nxtwave|account|progress +2', 'recover +1', 'missing id +1', 'not remember id|nxtwave +1', 'not know id +1'],
    reply: () => say(`No panic. On the log-in screen, type the personal email you signed up with instead of the ID. It logs you in just the same.`, 'whisper',
      { chips: ['Why do you need my email?', 'Can I continue on another computer?'] }) },
  { id: 'email', rules: ['email +1'],
    reply: () => say('Signing up asks for your name, your NxtWave ID and a personal email - all three are needed. Later you can log in with the ID or the email, so use one you remember.', 'think',
      { chips: ['I forgot my NxtWave ID', 'Can I continue on another computer?'] }) },
  { id: 'lostprogress', rules: ['progress missing|disappear|delete|zero|back +1', 'point missing|disappear|zero +1', 'save not +1', 'missing everything +1'],
    reply: () => say(`Don’t worry - your progress is saved in your account. Log in with the same NxtWave ID (or your email) and your case file comes back.`, 'whisper',
      { chips: ['I forgot my NxtWave ID', 'How is my progress saved?'] }) },
  { id: 'switchuser', rules: ['logout +1', 'switch student|user|account|profile +1', 'change|wrong|update|fix|correct name|account|user|student +1', 'different|another|other student|user|account|person +1', 'someone else', 'friend play|use'],
    reply: () => say(`Tap “${UI.switchStudent}” in the name chip at the top. It logs you out on this computer, so a different student can log in. Your progress stays saved in your account.`, 'point',
      { chips: ['How is my progress saved?', 'Can I continue on another computer?'] }) },
  { id: 'forgotpassword', rules: ['forgot password +2', 'reset|change|new|recover|lost password +2', 'password not|wrong work|working|correct|accept|accepted +1', 'not remember|know password +2', 'not login +1', 'temporary password +2'],
    reply: () => say('There is no password to remember. Log in with your NxtWave ID or the email you signed up with.', 'whisper',
      { chips: ['I forgot my NxtWave ID', 'Why do you need my email?'] }) },
  { id: 'signin', rules: ['password +1', 'login +1', 'signup|register|account +1'],
    reply: () => say('No password needed. Sign up once with your name, NxtWave ID and a personal email. After that, log in with your NxtWave ID or that email.', 'happy',
      { chips: ['I forgot my NxtWave ID', 'Why do you need my email?'] }) },
  { id: 'nxtwaveid', rules: ['nxtwave +1', 'id what|which|where|my'],
    reply: () => say('Your NxtWave ID tells the game who you are. Type the same one every time - capital or small letters do not matter. It opens your account, even on another computer.', 'think',
      { chips: ['I forgot my NxtWave ID', 'Can I continue on another computer?'] }) },

  { id: 'bug', rules: ['bug|glitch +1', 'game|page|screen|site frozen|blank|crash|crashed|hang|hanging|broken|stuck +1', 'not load|loading +1', 'report|support|contact +1'],
    reply: (ctx) => say(`Sorry about that${comma(ctx)}. Try reloading the page - your progress is saved, so you come back to the same step. If it keeps happening, tell the team in the feedback card at the end of the episode.`, 'oops',
      { chips: ['How is my progress saved?', 'What is the feedback card?'] }) },

  // ---- sound, voice, feedback
  { id: 'sound', rules: ['sound +1'],
    reply: () => say('The sound button on the top bar turns the game sound on or off. The mic button next to it is only for my voice. Both choices are remembered on this device.', 'point', { chips: ['How do I turn off your voice?'] }) },
  { id: 'voice', rules: ['voice +1', 'mic +1', 'you|kaal talk|quiet|silent +1', 'talk stop|off|loud +1'],
    reply: () => say('The mic button on the top bar turns my voice on or off. If you cannot see it, your browser has no voice for me. I also go quiet when the game sound is off.', 'point', { chips: ['How do I turn off the sound?'] }) },
  { id: 'feedback', rules: ['feedback +1', 'suggestion +1', 'star rate|give|card', 'rate episode|game'],
    reply: () => say(`On the episode solved screen there is a short feedback card: a rating, how it felt and how the SQL was. Send it and “${UI.next}” unlocks. Writing a suggestion is optional. It all goes straight to the team that builds this case.`, 'think',
      { chips: ['Why is the next episode locked?', 'How do I get promoted?'] }) },
  { id: 'nextlocked', rules: ['next episode lock|not +1', 'episode lock +1', 'lock +1', 'episode not open +1'],
    reply: () => say(`Two things can keep an episode locked. On the solved screen, send the feedback card first - then “${UI.next}” unlocks. On the case map, a stop with a lock opens only after you solve the episode before it.`, 'think',
      { chips: ['What is the feedback card?', 'What does each episode teach?'] }) },

  // ---- the story (no spoilers: only what the briefing tells)
  { id: 'tara', rules: ['tara +1', 'influencer|singer +1', 'missing who|girl|star +1', 'reel star'],
    reply: () => say('Tara Sen is a young singer from Chandpur, famous for her reels. Tonight is her first stadium concert. But at 6 PM she was gone from her hotel room, and her phone is switched off.', 'whisper',
      { action: ACT.briefing, chips: ['What is the deadline?', 'Who is Ira Menon?', 'Who are the people in the case?'] }) },
  { id: 'premise', rules: ['story +1', 'case about +2', 'what happened +1', 'plot|mystery +1', 'game about +1'],
    score: (q) => (!q.caps.has('case') && /\b(?:what is|about|explain|describe) (?:the|this|our) case\b(?! (?:database|note|file|map|board))/.test(q.plain) ? 3 : 0),
    reply: () => say('At 6 PM, reel star Tara Sen went missing, six hours before her first stadium concert. Her phone is off and there is no CCTV. You are the new intern at the City Police Data Cell - and the city’s data is our only witness.', 'whisper',
      { action: ACT.briefing, chips: ['Who is Tara Sen?', 'What is the deadline?', 'Who are the people in the case?'] }) },
  { id: 'deadline', rules: ['deadline +1', 'midnight +1', 'concert +1', 'time left|remaining|have +1', 'six hour'],
    reply: () => say('Tara’s concert starts at midnight, and 40,000 fans are coming. The story runs from 6 PM to midnight, so we have six hours to find her.\nThat clock is story time only - there is no real timer on you.', 'whisper',
      { chips: ['Is there a time limit?', 'Who is Tara Sen?'] }) },
  { id: 'timer', rules: ['timer +1', 'timed +1', 'howlong +1', 'clock +1', 'countdown +1', 'hurry|rush +1', 'time take|need +1'],
    reply: (ctx) => say(`No real timer${comma(ctx)}. The 6 PM to midnight clock is story time only, so take as long as you need. You can stop any time and continue later.`, 'happy',
      { chips: ['How is my progress saved?', 'What is the deadline?'] }) },
  { id: 'ira', rules: ['ira +1', 'menon +1', 'mentor +1'],
    reply: () => say('SI Ira Menon is your mentor at the City Police Data Cell. Many of the SQL tasks come from her - you will see her name above them.', 'think', { chips: ['Who is Kabir?', 'Who are the people in the case?'] }) },
  { id: 'kabir', rules: ['kabir +1', 'shaikh +1'],
    reply: () => say('Kabir Shaikh works at the Data Cell with us. You will meet him in the story as the night goes on.', 'think', { chips: ['Who is Ira Menon?', 'Who are the people in the case?'] }) },
  { id: 'people', rules: ['suspect +1', 'character|people|cast +1', 'who everyone|everybody'],
    reply: () => say('Besides Tara, you will meet her sister Mahi, her manager Dev, the singer Nysa, fan-page owner Ishita, cab driver Sunny and organiser Kunal. Some are helpers and some are suspects. The data decides who is which.', 'smirk',
      { action: ACT.briefing, chips: ['Who is Tara Sen?', 'Who is Ira Menon?'] }) },
  { id: 'mahi', rules: ['mahi +1', 'sister +2'], reply: () => person('Mahi Sen is Tara’s younger sister.') },
  { id: 'dev', rules: ['dev +1', 'arora +1', 'manager +2'], reply: () => person('Dev Arora is Tara’s manager.') },
  { id: 'nysa', rules: ['nysa +1', 'kapoor +1'], reply: () => person('Nysa Kapoor is a singer.') },
  { id: 'ishita', rules: ['ishita +1', 'fan page|club|squad +1'], reply: () => person('Ishita Das runs the fan page @tara_squad.') },
  { id: 'sunny', rules: ['sunny +1', 'gill +1', 'cab driver +1', 'driver +2'], reply: () => person('Sunny Gill is a cab driver.') },
  { id: 'kunal', rules: ['kunal +1', 'bajaj +1', 'organiser +2'], reply: () => person('Kunal Bajaj is the event organiser.') },
  { id: 'whoami', rules: ['whoami +2', 'my job|duty +1', 'intern +1'],
    reply: (ctx) => say(`You are the new intern at the City Police Data Cell${comma(ctx)}. You write every query, and every clue tonight comes from your SQL.${ctx.rank && ctx.rank !== RANKS[0].name ? ` By now you are ${an(ctx.rank)}.` : ''}`, 'happy',
      { chips: ['How do I get promoted?', 'Who are you, Kaal?'] }) },
  { id: 'myname', rules: ['my name +1'],
    reply: (ctx) => (ctx.name ? say(`You are ${ctx.name.trim()} - the newest intern at the Data Cell.`, 'happy', { chips: ['How do I get promoted?'] })
      : say('You are the new intern at the Data Cell. I just do not have your name here.', 'think', { chips: ['Who are you, Kaal?'] })) },
  { id: 'datacell', rules: ['datacell +1', 'police +1'],
    reply: () => say('The City Police Data Cell is where we work tonight. There is no CCTV and no phone signal - so we find Tara with data and SQL.', 'think', { chips: ['Who is Ira Menon?', 'Who is Tara Sen?'] }) },

  // ---- episodes and what they teach
  { id: 'episode-n', score: (q, ctx) => (episodeIn(q, ctx) && !has(q, 'lock', 'reset', 'replay', 'feedback') ? 4 : 0),
    reply: (ctx, q) => episodeReply(episodeIn(q, ctx)!) },
  { id: 'this-episode',
    score: (q, ctx) => (ctx.session && ((has(q, 'episode') && has(q, 'this', 'current') && (has(q, 'teach', 'about') || /\bwhat (?:is|are|happen\w*) (?:in )?(?:this|the current) episode\b/.test(q.plain)))
      || (has(q, 'teach') && has(q, 'now', 'here', 'today', 'tonight', 'currently'))) ? 4 : 0),
    reply: (ctx) => { const e = EPISODES[(ctx.session ?? 1) - 1] ?? EPISODES[0]; return say(`This episode is “${e.title}”. ${e.teaser}\nYou will learn: ${e.learn}.`, 'whisper', { chips: ['What does each episode teach?', 'How do hints work?'] }); } },
  { id: 'which-episode',
    score: (q) => ((has(q, 'teach') || /\b(?:which|what) (?:episode|session|level)\b/.test(q.plain)) && taughtIn(q) ? 4 : 0),
    reply: (_ctx, q) => {
      const t = taughtIn(q)!;
      const where = t.episodes.map((n) => `“${EPISODES[n - 1].title}” (episode ${n})`);
      return say(`You learn ${t.term} in ${listOf(where)}.`, 'think', { chips: [...(t.term.includes('/') ? [] : [`Explain ${t.term}`]), 'What does each episode teach?'] });
    } },
  { id: 'learnall', rules: ['teach what|sql|which|each|every +1', 'syllabus|curriculum +1', 'topic which|what|all +1', 'each episode +1'],
    reply: () => say('Beginner SQL, from the ground up: tables and `SELECT` first, then `WHERE`, `GROUP BY` and `HAVING`, and later joins, views and subqueries. Every episode teaches a few tools. Ask me about one, like “What does the 5th episode teach?”', 'think',
      { action: ACT.briefing, chips: ['What does the 5th episode teach?', 'Which episode teaches joins?'] }) },
  { id: 'episodes', rules: ['episode +1', 'howmany episode|level|stage +1', 'level|stage howmany|all|list'],
    reply: () => say(`There are ${EPISODES.length} episodes - one night, from ${storyTime(1)} to midnight. Each one opens when you solve the one before it.\nAsk me about any of them, like “What does the 5th episode teach?”`, 'think',
      { action: ACT.map, chips: ['What does the 5th episode teach?', 'How do I get promoted?'] }) },

  { id: 'map', rules: ['map +1', 'trail +1', 'episode how open|start|choose|pick|play +1', 'star mean|what stop|episode'],
    reply: () => say(`The case map shows “${UI.trail}”: one round stop per episode. Tap a stop to see that episode, then press its play button. Solved stops have a star, and locked ones have a lock.`, 'point',
      { action: ACT.map, chips: ['Why is the next episode locked?', 'What does each episode teach?'] }) },

  // ---- kinds of steps
  { id: 'learnstep', rules: ['casenote +1', 'note +1', 'teach step +2', 'white|dark card +1', 'file card +1'],
    reply: () => say(`A ${UI.learn} step teaches one idea from your course on a white card. When there is a dark “Case file” card below it, that shows how the idea fits tonight’s case. Read it well - it is the tool for the next task.`, 'think',
      { action: ACT.learn, chips: ['Where is the reading material?', 'What should I do now?'] }) },
  { id: 'reading', rules: ['readingmaterial +1', 'scroll +1', 'teach button +2', 'read more', 'copy +1', 'reader +1'],
    reply: () => say(`The ${UI.learn} scroll on the top bar of the game screen opens the complete reading material of the episode, full screen. On a ${UI.learn} step, “${UI.scroll}” does the same. It is read only - copying is switched off.`, 'think',
      { action: ACT.learn, chips: ['What is a Learn step?', 'How do hints work?'] }) },
  { id: 'quickcheck', rules: ['quickcheck +1', 'quiz|mcq +1'],
    reply: () => say(`A quick check is one question with one answer. A right answer gives ${P.checkCorrect} points; a wrong one costs nothing. Either way, read the explanation - that is the real lesson.`, 'think', { chips: ['How do points work?', 'How do activities work?'] }) },
  { id: 'activity', rules: ['activity +1'],
    reply: () => say(`Activities are small puzzles: sort, match, put in order, spot the cell or tick the right ones. Right on the first try gives ${P.activityFirstTry} points, later ${P.activityLater}. After ${MAX_ACTIVITY_TRIES} wrong tries I show the answer so you can move on.`, 'point',
      { chips: ['How do points work?', 'How does a quick check work?'] }) },
  { id: 'demo', rules: ['demo +1'],
    reply: () => say('A live demo runs real SQL and times it for you. Press its Run button and watch how long each step takes.', 'point') },
  { id: 'sqlite', rules: ['sqlite +1', 'mysql|postgres|postgresql|oracle +1', 'which database|sql use|engine|version', 'database engine +1'],
    reply: () => say('The console runs SQLite, right inside your browser. That is why error messages start with “SQLite says”.', 'think', { chips: ['What does Error mean?', 'How do I run my query?'] }) },

  { id: 'topbar', rules: ['top bar', 'toolbar|hud +1', 'button top|which|all +1', 'icon mean|what|which +1'],
    reply: () => say(`On the top bar of the game screen: ${UI.learn} (the reading material), ${UI.tables}, the pin counter (your evidence), sound, my voice and Reset. Back and Continue are in the dock at the bottom.`, 'point',
      { chips: ['Where is the reading material?', 'Where are the tables?', 'How do I reset an episode?'] }) },

  // ---- small talk
  { id: 'openchat', rules: ['chat +1', 'find|reach|call you|kaal +1', 'ask you|kaal how|where +1'],
    reply: () => say('Tap me in the bottom-right corner - the “Ask me” tag - on any screen. This chat opens, and you can ask me anything about the game.', 'happy',
      { chips: ['What can I ask you?', 'How do hints work?'] }) },
  { id: 'whoareyou', rules: ['whoareyou +2', 'kaal who|what', 'kaal inspector +1'],
    reply: () => say('I’m Kaal, your assistant on this case. Tonight I work for you. I explain the game, the tools and the SQL ideas, and I keep hint envelopes ready. The one thing I never do is hand over a task answer.', 'whisper',
      { chips: ['What can I ask you?', 'How do hints work?'] }) },
  { id: 'areyouai', rules: ['bot|robot|ai|chatbot|chatgpt|gpt|llm +1', 'you human|real|person|alive +1'],
    reply: () => say('I’m Kaal, your assistant inside this game - not a person. I answer from what I know about this case and from the course notes, so the game and its SQL are all I know.', 'smirk', { chips: ['What can I ask you?'] }) },
  { id: 'help', small: true, rules: ['whatcanyoudo +2', 'help +1'],
    reply: (ctx) => say(`I’m here${comma(ctx)}. Ask me how the game works: points, hints, ranks, saving, the story so far. Or ask about a SQL idea, like “What is GROUP BY?”\nI cannot give task answers - but I can point you the right way.`, 'happy',
      { chips: ['What should I do now?', 'How do hints work?', 'How do points work?'] }) },
  { id: 'greet', small: true, rules: ['hello +1'],
    reply: (ctx) => say(`Hello${comma(ctx)}! Kaal here, your assistant on this case. Ask me anything about the game.`, 'happy', { chips: starters(ctx).slice(0, 3) }) },
  { id: 'thanks', small: true, rules: ['thanks +1', 'thankful|grateful +1'],
    reply: (ctx) => say(`Any time${comma(ctx)}! That’s what I’m here for.`, 'happy') },
  { id: 'bye', small: true, rules: ['bye +1'],
    reply: (ctx) => say(`See you soon${comma(ctx)}. Your progress is saved - the case will wait for you.`, 'idle') },
  { id: 'howareyou', small: true, rules: ['howareyou +2'],
    reply: (ctx) => say(`Sharp and ready${comma(ctx)}! This case keeps me wide awake. What do you need?`, 'happy', { chips: starters(ctx).slice(0, 3) }) },
  { id: 'joke', small: true, rules: ['joke +1', 'make laugh', 'funny something|tell|say'],
    reply: () => say('Why did the query go to the party alone? It had no `JOIN`.\nOkay, okay - back to the case!', 'smirk') },
  { id: 'compliment', small: true, rules: ['you|kaal awesome|best|smart|amazing|funny|cute|helpful|genius|clever|brilliant +1', 'love you|kaal|this|game', 'good job|work|one', 'well done'],
    reply: (ctx) => say(`Ha! You’ll make me blush under this hat${comma(ctx)}. Now, back to the case?`, 'smirk') },
  { id: 'insult', small: true, rules: ['stupid|idiot|dumb|useless|worst|trash|fool|nonsense|rubbish|pathetic +1', 'shut up', 'hate you|kaal', 'you suck|bad'],
    reply: (ctx) => say(`Ouch. I’ll survive${comma(ctx)}. Tell me what went wrong and I’ll try to help.`, 'oops', { chips: ['What should I do now?', 'What can I ask you?'] }) },
];
function person(line: string): Reply {
  return say(`${line} That is all I can say - no spoilers!`, 'smirk', { action: ACT.briefing, chips: ['Who are the people in the case?', 'Who is Tara Sen?'] });
}

interface Rule { terms: string[][]; weight: number }
const compileRule = (src: string): Rule => {
  const m = /^(.*?)(?:\s+\+(\d+))?$/.exec(src.trim())!;
  const terms = m[1].trim().split(/\s+/).map((t) => t.split('|').map(word));
  return { terms, weight: terms.length + Number(m[2] ?? 0) };
};
const RULES = new Map<string, Rule[]>(TOPICS.map((t) => [t.id, (t.rules ?? []).map(compileRule)]));

// the words a typo may be corrected to: everything the rules look for, plus names and the SQL words of the course
const SQL_WORDS = ('select where group having join inner left right full cross self natural union intersect except minus case cast round upper lower count sum avg min max '
  + 'distinct limit offset order like between insert update delete alter create drop view subquery transaction index primary foreign key entity attribute relationship '
  + 'cardinality dbms database data table row column null alias aggregation function expression operator pagination pragma integer varchar strftime floor ceil '
  + 'atomicity consistency isolation durability relational schema query clause keyword syntax').split(' ');
function ruleVocabulary(): Set<string> {
  const v = new Set<string>(SQL_WORDS.map(word));
  for (const rules of RULES.values()) for (const r of rules) for (const alts of r.terms) for (const w of alts) v.add(w);
  for (const item of LEARN_ITEMS) for (const t of item.tokens) v.add(t);
  for (const w of ['kaal', 'answer', 'solve', 'cheat', 'spoiler', 'culprit', 'kidnap', 'difference', 'explain', 'define', 'meaning', 'example', 'episode', 'teach']) v.add(w);
  return v;
}

function bestTopic(q: Query, ctx: ChatContext): { topic: Topic; score: number } | null {
  let best: { topic: Topic; score: number; terms: number } | null = null;
  for (const topic of TOPICS) {
    let score = topic.score?.(q, ctx) ?? 0, terms = score ? 9 : 0, extra = 0;
    for (const r of RULES.get(topic.id)!) {
      if (!r.terms.every((alts) => alts.some((w) => q.set.has(w)))) continue;
      if (r.weight > score || (r.weight === score && r.terms.length > terms)) { score = r.weight; terms = r.terms.length; }
      extra++;
    }
    if (!score) continue;
    score += Math.min(Math.max(extra - 1, 0), 3) * 0.05 - (topic.small ? 0.6 : 0);
    if (!best || score > best.score || (score === best.score && terms > best.terms)) best = { topic, score, terms };
  }
  return best;
}

// ---------------------------------------------------------------- guardrails
const DET = '(?:(?:me|us|him|her) )?(?:(?:just|only|please|also|directly) )?(?:(?:the|a|an|that|this|my|some|any|one) )?(?:(?:whole|full|complete|correct|right|exact|final|actual|real|direct|sql|entire) )*';
const OBJ = '(?:answer|query|sql|code)(?! (?:keyword|command|term|concept|console|editor|word|idea|topic|function|clause|basic|language|course|note|rule|engine|type|result))';
const ANSWER_SEEKING: RegExp[] = [
  new RegExp(`\\b(?:give|tell|show|send|share|reveal|provide|gimme|say|spill|leak|paste) ${DET}${OBJ}\\b`),
  new RegExp(`\\b(?:need|want|get) ${DET}${OBJ}\\b`),
  new RegExp(`\\b(?:want|need) to (?:see|know|get|have) ${DET}${OBJ}\\b`),
  new RegExp(`\\bwhat (?:is|are|will be|would be) the (?:(?:whole|full|complete|correct|right|exact|final|actual|real|sql) )*${OBJ}\\b`),
  /\bwhat (?:is|are) (?:correct|right) (?:answer|query)\b/,
  /\bwhat (?:query|sql|code|command|statement) (?:should|do|must|can|would|shall|to) ?(?:i|we)? ?(?:write|type|enter|put|use|run)\b/,
  /\bwhat (?:should|do|must|shall|to) ?(?:i|we)? ?(?:write|type|enter|put)\b/,
  /\bwhich (?:query|sql|command) (?:should|do|must|to|is|will)\b/,
  new RegExp(`\\b(?:write|type|make|build|generate|create|compose|prepare|draft|complete|finish|fix|debug|repair) ${DET}${OBJ}\\b`),
  /\b(?:write|do|solve|create|type|finish|complete|fill|answer|build|crack) .{0,40}\bfor me\b/,
  /\bfor me\b.{0,30}\b(?:write|solve|answer|complete|finish)\b/,
  /\b(?:tell|show|give) (?:me )?what to (?:write|type|enter|put)\b/,
  /\b(?:can|could|will|would) you (?:please )?do (?:it|this|that|the task|my task)\b|\b(?:please|kaal|you) do (?:it|this|that)\b|\bdo (?:my|the) (?:task|work|homework|assignment)\b/,
  /\b(?:solve|crack) (?:it|this|that|the|my|task|question|problem|for)\b|^(?:please )?(?:can you |could you |will you )?(?:just )?solve(?: please)?$/,
  /\bcan you (?:solve|answer|complete|finish|write|type)\b/,
  /\bfillblanks\b.*\b(?:for me|please)\b/,
  /\bcheat\b/,
  /^(?:the |please |kaal )*(?:answer|query)(?: please| now| kaal)*$/,
  /\b(?:answer|query|sql|code) (?:please|now|fast|quick|quickly|directly)\b/,
  /\bjust (?:tell|give|show)\b/,
];
const HOW_TO = /\bhow (?:to|do|can|should|does|would)\b|\bwhere (?:to|do|can|should|is|are)\b/;   // asking how the console works, not what to put in it
const PURPOSE = /\b(?:to|that|which|for) (?:find|get|show|list|count|select|fetch|return|display|see|know|check|give|calculate|sum|pull|extract|print|join|group|filter|sort|order)\b|\bfor (?:this|the|my) (?:task|question|step|problem)\b/;

function wantsAnswer(q: Query): boolean {
  if (has(q, 'hint')) return false;                             // "which envelope shows the answer?" is a question about hints
  if (HOW_TO.test(q.text) && !PURPOSE.test(q.text) && !/\bfor me\b/.test(q.text)) return false;   // "how do I write a query?" is about the console
  return ANSWER_SEEKING.some((re) => re.test(q.text));
}
// a query pasted into the chat ("select * from guests - is this right?")
const pastedSql = (q: Query) => /\bselect\b[\s\S]{1,160}\bfrom\b\s+[a-z_]\w*/i.test(q.raw) && /[*,=;()]|\bselect\s+\w+\s+from\b/i.test(q.raw);

const SUSPECTS = 'tara|she|he|they|dev|mahi|nysa|ishita|sunny|kunal|kabir|ira|manager|sister|driver|fan|organiser|someone|anyone|somebody';
const SPOILERS: RegExp[] = [
  /\bwho\b.*\b(?:did it|done it|do it|took|take|taken|kidnap\w*|abduct\w*|culprit|criminal|villain|guilty|behind (?:it|this|all)|responsible|bad guy|killer|thief|lying|liar|lied)\b/,
  /\b(?:culprit|kidnapper|villain|murderer|killer|spoiler|spoil|ending|climax|twist)\b/,
  /\bwhere (?:is|was|did|has|can|will) (?:tara|she|her)\b|\bwhere\b.*\b(?:tara|she)\b.*\b(?:go|went|now|hiding|hidden|kept|held)\b/,
  new RegExp(`\\b(?:is|was|are|did|does|do|will|has|have|can) (?:the |her |his |that |this |tara )?(?:${SUSPECTS})\\b.*\\b(?:found|alive|come back|return|rescued|run away|ran away|guilty|innocent|involved|lying|do it|did it|the one|behind)\\b`),
  /\b(?:do|will|can|did) we (?:find|save|rescue|catch|get) (?:her|tara|him|them)\b/,
  /\bwhat happen\w* (?:next|later|after|in the end|at the end|finally|in the last|in the final)\b/,
  /\bhow (?:does|did|will) (?:it|the story|the case|this|the game|everything) end\b/,
  /\b(?:whole|full|entire|complete|rest of the) story\b/,
  /\bwhy (?:did|has|would|does|is) (?:tara|she|her)\b/,
  /\b(?:main|prime|real|actual|true|top|biggest) suspect\b/,
];
const SAFETY = /\b(?:dead|alive|die|died|killed|murder\w*|hurt|injured|in danger)\b|\b(?:is|was) (?:tara|she) (?:safe|ok|okay|fine|alright)\b/;

// ---------------------------------------------------------------- off-topic
const OFF_TOPIC = new Set(('weather rain temperature news cricket football soccer ipl movie film song lyric actor actress politics president minister election government capital '
  + 'planet space god religion recipe cook food pizza biryani math maths algebra calculus physics chemistry biology history geography python java javascript html css react '
  + 'cplusplus algorithm leetcode dsa essay poem homework exam college job salary interview placement girlfriend boyfriend crush marry marriage dating bitcoin crypto stock '
  + 'instagram youtube whatsapp facebook tiktok google translate birthday horoscope lottery').split(' ').map(word));
const isOffTopic = (q: Query) => q.tokens.some((t) => OFF_TOPIC.has(t)) || /\d\s*[-+*/x]\s*\d/.test(q.raw)
  || /\b(?:who|what|when|where) (?:is|was|are|were) (?:the )?(?:capital|president|prime minister|pm|ceo|founder|inventor|population|tallest|biggest|richest|longest)\b/.test(q.plain);

// ---------------------------------------------------------------- SQL concepts: the course reading material
// The notes are markdown with a few course tags (<Section>, <MultiLineNote>, ...). Each heading becomes a searchable entry
// with a short prose excerpt (never code), and so does each sentence that defines a term ("X is called Y", "`X` clause is used to ...").
interface Piece { text: string; raw: string; bullet: boolean; lead: boolean }
interface Section { label: string; level: number; generic: boolean; pieces: Piece[] }
interface Entry { kind: 'heading' | 'def'; label: string; title: string; tokens: string[]; text: string; level: number; order: number }
interface NoteIndex { entries: Entry[]; vocab: Set<string> }

const HEADING = /^(#{1,6})\s*(.+?)\s*#*\s*$/;
const GENERIC_HEADING = /^(?:syntax|examples?|output.*|expected (?:output|result)|try it yourself|concepts in focus|schema|database schema|approach|understanding.*|solution|summary|advantages|possible mistakes|mistake.*|query \d+|variant \d+|the problem|step.*|question \d.*|let s view.*|correct rule|special cases|use a subquery|why does this error occur)$/;
const GENERIC_TERM = /^(?:note|example|syntax|output|tip|warning|hint|approach|database|table|schema|important|remember|caution|it|this|that|they)$/;
const FLUFF = /^(?:previously|so far|now,|let.?s |in the previous|from here on|we have already|we have learn|the (?:given |imdb )?(?:database|dataset) (?:consists|stores|contains)|the imdb|here,|you can (?:run|check|refer)|the first step|following |in the following|as (?:we|you) (?:know|have)|till now|the below|and many more)/i;
const BACK_REFERENCE = /^(?:in such|in that|this|these|it|such|hence|so,|similarly|and,|but,?|also|then)\b/i;

function cleanInline(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1$2').replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/`\s*([^`]+?)\s*`/g, ' `$1` ').replace(/\\([_*|])/g, '$1')
    .replace(/[\u2014\u2013]/g, ' - ').replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ').replace(/ ([.,;:!?)])/g, '$1').replace(/\( /g, '(').trim();
}
const labelOf = (heading: string) => cleanInline(heading).replace(/`/g, '').replace(/^\d+[.)]\s*/, '').replace(/[:!?.\s]+$/, '').trim();
const noteTitle = (t: string) => t.replace(/\s*\|\s*/g, ' - ').replace(/Part\s*-\s*(\d)/i, 'Part $1').trim();
const tokensOf = (label: string) => [...new Set(plainOf(label).split(' ').filter(Boolean).map(word))];

function parseSections(markdown: string): Section[] {
  const sections: Section[] = [{ label: '', level: 0, generic: true, pieces: [] }];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const h = HEADING.exec(line.trim());
    if (h) {
      const label = labelOf(h[2]);
      const level = h[1].length;
      const key = plainOf(label);
      sections.push({ label, level, generic: GENERIC_HEADING.test(key) || (level >= 3 && /^(?:tables?|database)$/.test(key)), pieces: [] });
      continue;
    }
    if (line.replace(/`[^`]*`/g, '').includes('|') || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) continue;   // tables, rules
    const bullet = /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
    const body = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/^\s*>\s?/, '');
    for (const raw of body.split(/(?<=[.!?])\s+(?=[A-Z`*_"“(])/)) {
      let text = cleanInline(raw);
      if (!text) continue;
      const lead = /:$/.test(text);
      const words = text.split(' ').length;
      if (!lead && !/[.!?]$/.test(text)) { if (words < 4 && !bullet) continue; text += '.'; }   // a bare label ("Database") is not a sentence
      sections[sections.length - 1].pieces.push({ text, raw, bullet, lead });
    }
  }
  return sections;
}

// the prose worth quoting: no filler sentences ("So far, we have learnt ..."), no "Database:" labels with their bullet lists
function usefulPieces(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.lead && p.text.split(' ').length < 4) { while (i + 1 < pieces.length && pieces[i + 1].bullet) i++; continue; }
    if (!FLUFF.test(p.text)) out.push(p);
  }
  return out;
}

// up to `max` sentences, short enough for a chat bubble; "X has four properties:" + its bullets become one sentence
function compose(src: Piece[], max = 3, budget = 300): string {
  const out: string[] = [];
  let length = 0;
  for (let i = 0; i < src.length && out.length < max; i++) {
    let s = src[i].text;
    if (src[i].lead) {
      const items: string[] = [];
      while (i + 1 < src.length && src[i + 1].bullet && !src[i + 1].lead && items.length < 6) items.push(src[++i].text.replace(/[.!?]$/, ''));
      if (!items.length) continue;
      s = `${s} ${items.join(', ')}.`;
    }
    if (out.length && length + s.length > budget) break;
    out.push(s);
    length += s.length + 1;
  }
  const text = out.join(' ').replace(/^THE /, 'The ');
  return text.length > 340 ? `${text.slice(0, 336).replace(/\s+\S*$/, '')}...` : text;
}

// the words of a heading that carry its meaning ("LIKE Operator" -> like, operator; "Introduction to Subquery" -> subquery)
const keyTokens = (label: string) => { const all = tokensOf(label); const keys = all.filter((t) => !LIGHT.has(t)); return keys.length ? keys : all; };
// a section's excerpt starts at the first sentence that talks about the heading itself (skipping the warm-up before it)
function sectionText(s: Section, keys: string[]): { text: string; relevant: boolean } {
  const useful = usefulPieces(s.pieces);
  const found = useful.findIndex((p) => tokensOf(p.text).some((t) => keys.includes(t)));
  let start = Math.max(found, 0);
  for (let back = 0; back < 2 && start > 0 && BACK_REFERENCE.test(useful[start].text); back++) start--;   // "In such cases, we use CAST" needs the line before it
  return { text: compose(useful.slice(start)), relevant: found >= 0 };
}
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z`"“(])/;
const NO_SUBJECT = /^(?:Retrieves|Creates|Returns|Deletes|Adds|Removes|Does|Used|Updates|Combines|Sorts|Filters|Renames|Drops|Gives|Counts|Calculates)\b/;
// "Atomicity: Either all SQL statements or none are applied ..." when the sentence alone does not say what it is about
function withLabel(label: string, text: string, keys: string[]): string {
  if (!text) return text;
  const mentions = tokensOf(text.split(SENTENCE_END)[0]).some((t) => keys.includes(t));
  return !mentions || NO_SUBJECT.test(text) ? `${label}: ${text}` : text;
}

// the term a sentence defines, if it is a definition
function definedTerm(p: Piece): string | null {
  const raw = p.raw.trim();
  let m = !p.bullet ? /^\*\*([^*:]{2,40}?)\s*(:)?\*\*\s*(:)?\s+\S/.exec(raw) : null;
  if (m && (m[2] || m[3])) return m[1];
  m = /\b(?:is|are)\s+(?:also\s+)?(?:called|known)\s+(?:as\s+)?(?:an?\s+|the\s+)?(?:\*\*|`)?([A-Za-z][\w -]{1,38}?)(?:\*\*|`)?(?:\s+in\s+[\w ]{2,20})?[.!]?\s*$/.exec(raw);
  if (m) return m[1];
  m = /^(?:an?\s+|the\s+)?\*\*([^*]{2,40})\*\*\s+(?:is|are|refers|means|stands)\b/i.exec(raw);
  if (m) return m[1];
  m = /^(?:the\s*)?`([^`]{2,30})`\s*(?:clause|keyword|operator|function|statement|command)?\s*(?:in sql\s+)?(?:is|are|specifies|returns|allows|helps|gives|sorts|filters|combines|removes|limits)\b/i.exec(raw);
  if (m && (/^[A-Z][A-Z ]*$/.test(m[1]) || /\(\)$/.test(m[1]))) return m[1];   // a SQL keyword or a function(), not a column name like `price`
  m = /^(?:an?|the)\s*`([^`]{2,30})`\s*(?:is|are)\s+(?:an?|the)\b/i.exec(raw);
  if (m) return m[1];
  m = /\b(?:we use|(?:is|are) represented as)\s+(?:an?\s+|the\s+)?\*\*([^*]{2,40})\*\*(?:\s+of\s+[\w ]{2,30})?\.?\s*$/i.exec(raw);
  if (m) return m[1];
  m = /^(?:[Ww]e use|[Uu]se)\s+(?:the\s+)?`?([A-Z][A-Z ]{1,24}?)`?\s*(?:clause|keyword|operator|function|statement|command)s?\s+to\b/.exec(raw);
  if (m) return m[1];
  m = /^(?:[Tt]he\s+)?`?([A-Z][A-Z ]{1,24}?)`?\s*(?:clause|keyword|operator|function|statement|command)\s+(?:in sql\s+)?(?:is|are)\s+used\b/.exec(raw);
  return m ? m[1] : null;
}

const INDEXES = new WeakMap<object, NoteIndex>();
function indexOf(notes: Record<string, { title: string; markdown: string }>): NoteIndex {
  const cached = INDEXES.get(notes);
  if (cached) return cached;
  const entries: Entry[] = [];
  const seen = new Set<string>();
  const add = (e: Omit<Entry, 'order' | 'tokens'>) => {
    const tokens = tokensOf(e.label);
    const key = `${e.kind}|${tokens.join(' ')}|${e.text.slice(0, 50)}`;   // some reading materials are stored twice
    if (!tokens.length || !e.text || seen.has(key)) return;
    seen.add(key);
    entries.push({ ...e, tokens, order: entries.length });
  };
  for (const note of Object.values(notes)) {
    const title = noteTitle(note.title);
    const sections = parseSections(note.markdown ?? '');
    sections.forEach((s, i) => {
      const useful = usefulPieces(s.pieces);
      if (!s.generic && s.label) {
        const keys = keyTokens(s.label);
        const own = sectionText(s, keys);
        let text = own.text;
        // an opening section that only sets the scene: quote the first sub-section that explains something
        if (!text || (!own.relevant && s.level <= 1)) {
          for (let j = i + 1; j < sections.length && sections[j].level > s.level; j++) {
            if (sections[j].generic) continue;
            const child = sectionText(sections[j], keys);
            const about = child.relevant || tokensOf(sections[j].label).some((t) => keys.includes(t)) || !text;   // a sub-section on the same subject
            if (about && child.text) { text = sectionText(sections[j], keyTokens(sections[j].label)).text; break; }
          }
        }
        // only code under this heading ("Add Column"): the section it belongs to ("Alter Table") says what it is for
        for (let j = i - 1; !text && j > 0; j--) {
          if (sections[j].level <= s.level && !sections[j].generic) text = sectionText(sections[j], keyTokens(sections[j].label)).text;
        }
        text = withLabel(s.label, text, keys);
        const acronym = /^(.*\S)\s*\(([A-Za-z]{2,10})\)$/.exec(s.label);
        if (acronym) { add({ kind: 'heading', label: acronym[1], title, text, level: s.level }); add({ kind: 'heading', label: acronym[2], title, text, level: s.level }); }
        else add({ kind: 'heading', label: s.label, title, text, level: s.level });
      }
      useful.forEach((p, j) => {
        const term = definedTerm(p);
        if (!term || GENERIC_TERM.test(plainOf(term))) return;
        const before = j > 0 && /^(?:this|these|it|such|they)\b/i.test(p.text) && !useful[j - 1].lead ? [useful[j - 1]] : [];
        const after = useful[j + 1] && !useful[j + 1].bullet && !useful[j + 1].lead && !before.length ? [useful[j + 1]] : [];
        add({ kind: 'def', label: term, title, text: compose([...before, { ...p, lead: false }, ...after], 2, 240) || p.text, level: s.level });
      });
    });
  }
  const index = { entries, vocab: new Set(entries.flatMap((e) => e.tokens)) };
  INDEXES.set(notes, index);
  return index;
}

// words that carry no meaning in a concept question / little meaning in a heading
const ASK_WORDS = new Set(('what is are was a an the how do does did work mean meaning define definition explain tell me about of to i we you can could please when why should would '
  + 'use used using in on and or not for it this that kaal hello by with there any some my your need want know understand exactly actually really simple simply term word thing '
  + 'give show example one help here get difference purpose so then if all as into from at has have will be which who each every write make').split(' ').map(word));
const LIGHT = new Set(['introduction', 'intro', 'to', 'of', 'in', 'and', 'or', 'not', 'by', 'with', 'on', 'a', 'an', 'the', 'using', 'use', 'why', 'do', 'we', 'how', 'what', 'is', 'it', 'core', 'common', 'cont', 'd', 'part', 'difference', 'for', 'as']);
const QUALIFIER = new Set(['operator', 'function', 'clause', 'keyword', 'statement', 'command', 'sql', 'concept']);
const headWeight = (t: string) => (LIGHT.has(t) ? 0.3 : QUALIFIER.has(t) ? 0.4 : 1);
const askWeight = (t: string) => (QUALIFIER.has(t) ? 0.4 : 1);
// everyday names for things the notes file under another heading
const CONCEPT_ALIAS: Record<string, string> = {
  sql: 'introduction to sql', count: 'aggregation function', sum: 'aggregation function', avg: 'aggregation function', average: 'aggregation function',
  min: 'aggregation function', max: 'aggregation function', asc: 'order by', desc: 'order by', ascending: 'order by', descending: 'order by',
  unique: 'distinct', duplicate: 'distinct', pk: 'primary key', fk: 'foreign key', wildcard: 'like operator', percent: 'like operator', pattern: 'like operator',
  nested: 'subquery', acid: 'transaction', datatype: 'data type', integer: 'data type', varchar: 'data type', er: 'modelling databases part 1',
  except: 'minus', cartesian: 'cross join', and: 'and or not', or: 'and or not', not: 'and or not', upper: 'string function', lower: 'string function', asterisk: 'select all column', paging: 'pagination', rename: 'rename column', condition: 'select specific row',
};
const SOLO_ALIAS: Record<string, string> = { table: 'relational database' };   // only when the word is the whole question ("what is a table?")
const DEF_SHAPED = /\b(?:what|define|definition|meaning|mean|explain|how|describe)\b/;
const CONCEPT_SHAPED = /\b(?:what (?:is|are|does|do)|define|definition|meaning of|explain|describe|how (?:does|do|is|are)|difference|when (?:do|should|to|is)|why (?:do|use|is|are)|syntax|example|use of|purpose of|insensitive)\b/;

interface ConceptHit { entry: Entry; score: number; recall: number; text: string }
function scoreEntries(index: NoteIndex, all: Set<string>, content: string[], defBonus: number): ConceptHit | null {
  const total = content.reduce((a, t) => a + askWeight(t), 0);
  if (!total) return null;
  let best: ConceptHit | null = null;
  for (const e of index.entries) {
    let matched = 0, whole = 0, covered = 0;
    for (const t of e.tokens) { const w = headWeight(t); whole += w; if (all.has(t)) matched += w; }
    for (const t of content) if (e.tokens.includes(t)) covered += askWeight(t);
    if (!covered || !whole) continue;
    const p = matched / whole, r = covered / total;
    const score = (2 * p * r) / (p + r) + (e.kind === 'def' ? defBonus : 0) + matched * 0.002;   // "UNION ALL" beats "UNION" when both words were asked
    if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && (e.level < best.entry.level || (e.level === best.entry.level && e.order < best.entry.order))))
      best = { entry: e, score, recall: r, text: e.text };
  }
  return best;
}

function findConcept(q: Query, index: NoteIndex): ConceptHit | null {
  const comparing = q.set.has('difference');
  let content = [...new Set(sqlTokens(q).filter((t) => (!ASK_WORDS.has(t) || q.caps.has(t)) && !(comparing && t === 'between')))];
  if (comparing && content.length) content.push('difference');
  if (!content.length) return null;
  // a typo in a course word ("havng", "primery key"): fix it against the words the notes use
  content = content.map((t) => (index.vocab.has(t) || CONCEPT_ALIAS[t] || SOLO_ALIAS[t] ? t : nearest(t, index.vocab) ?? t));
  const all = new Set([...q.tokens, ...content]);
  const defBonus = DEF_SHAPED.test(q.text) && !comparing ? 0.04 : 0;
  let best = scoreEntries(index, all, content, defBonus);
  for (const t of content) {
    const alias = CONCEPT_ALIAS[t] ?? (content.length === 1 ? SOLO_ALIAS[t] : undefined);
    if (!alias) continue;
    const swapped = [...content.filter((x) => x !== t), ...alias.split(' ').map(word)];
    const alt = scoreEntries(index, new Set([...all, ...swapped]), swapped, defBonus);
    if (alt && (!best || alt.score * 0.97 > best.score)) best = { ...alt, score: alt.score * 0.97 };
  }
  // "LEFT JOIN vs RIGHT JOIN" with no such heading: one sentence about each side
  if (comparing && (!best || best.score < 0.75)) {
    const sides = content.filter((t) => t !== 'difference' && !QUALIFIER.has(t) && !['join'].includes(t));
    const hits = sides.map((t) => scoreEntries(index, all, content.includes('join') && t !== 'join' ? [t, 'join'] : [t], 0)).filter((h): h is ConceptHit => !!h && h.score >= 0.6);
    const two = hits.filter((h, i) => hits.findIndex((x) => x.entry === h.entry) === i).slice(0, 2);
    if (two.length === 2) {
      const firstSentence = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-Z`"“(])/)[0];
      return { entry: two[0].entry, score: 0.8, recall: 1, text: `${firstSentence(two[0].text)} ${firstSentence(two[1].text)}` };
    }
  }
  return best;
}

// ---------------------------------------------------------------- the engine
const NOTES_TIMEOUT_MS = 5000;
// the searchable course notes, or null when they cannot be loaded (offline, slow network): game questions still get answered
async function loadIndex(kb: KnowledgeSources): Promise<NoteIndex | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('course notes timed out')), NOTES_TIMEOUT_MS); });
    return indexOf(await Promise.race([kb.courseNotes(), late]));
  } catch { return null; } finally { clearTimeout(timer); }
}

function refuse(ctx: ChatContext, q: Query): Reply {
  const keyword = taughtIn(q);
  const chips = ['How do hints work?', 'What do hints cost?', keyword && !keyword.term.includes('/') ? `Explain ${keyword.term}` : 'What should I do now?'];
  return ctx.onTask
    ? say(`I cannot hand over the answer${comma(ctx)} - cracking it yourself is the whole fun.\nBut my hint envelopes help step by step. The first one costs only ${P.hintPenalty[1]} points.`, 'smirk', { action: ACT.hints, chips })
    : say(`I cannot hand over answers${comma(ctx)} - cracking a task yourself is the whole fun.\nOn a SQL task, open my hint envelopes. They help step by step.`, 'smirk', { chips });
}
const fallbackChips = (ctx: ChatContext) => starters(ctx).slice(0, 3);

// Which part of the engine answered (for tests and for debugging a strange answer) and the reply itself
export async function route(question: string, ctx: ChatContext, kb: KnowledgeSources): Promise<{ topic: string; reply: Reply }> {
  const { topic, reply } = await decide(String(question ?? '').slice(0, MAX_QUESTION), ctx, kb);
  const action = reply.action && actionFits(reply.action, ctx) ? reply.action : undefined;
  return { topic, reply: { text: reply.text, mood: reply.mood, ...(reply.chips?.length ? { chips: reply.chips.slice(0, 3) } : {}), ...(action ? { action } : {}) } };
}

async function decide(question: string, ctx: ChatContext, kb: KnowledgeSources): Promise<{ topic: string; reply: Reply }> {
  const q = analyse(question);
  if (!q.tokens.length) return { topic: 'empty', reply: say('Type a question and I’ll do my best. For example:', 'idle', { chips: fallbackChips(ctx) }) };
  if (/^(?:ok|okay|k|kk|fine|cool|alright|sure|yes|yeah|yep|yup|no|nope|nah|hmm+|hm|oh|ohh|i see|got it|understood|right|nice|great|wow)$/.test(q.plain))
    return { topic: 'ok', reply: say(`Okay${comma(ctx)}! I’m right here if you need me.`, 'idle') };
  if (/^(?:hey |hi |hello |oh |dear )?kaal$/.test(q.plain)) return { topic: 'greet', reply: TOPICS.find((t) => t.id === 'greet')!.reply(ctx, q) };
  if (/^(?:lol|lmao|rofl|ha(?:ha)+|he(?:he)+|hehe|xd)$/.test(q.plain)) return { topic: 'laugh', reply: say(`Good to see you smiling${comma(ctx)}! Ready for the next clue?`, 'happy') };

  // 1. guardrails
  if (wantsAnswer(q)) return { topic: 'no-answers', reply: refuse(ctx, q) };
  const conceptShaped = CONCEPT_SHAPED.test(q.text);
  if (pastedSql(q) && !conceptShaped) return { topic: 'checkmine', reply: TOPICS.find((t) => t.id === 'checkmine')!.reply(ctx, q) };
  const namesEpisode = episodeIn(q, ctx) !== null;
  if (!namesEpisode && SAFETY.test(q.plain) && /\b(?:tara|she|her|anyone|someone|anybody|people)\b/.test(q.plain))
    return { topic: 'safe', reply: say('Tara is missing, not hurt - there is no violence in this case, ever. Where she is, the data will tell us. No spoilers from me!', 'whisper', { chips: ['Who is Tara Sen?', 'What is the deadline?'] }) };
  if (!namesEpisode && SPOILERS.some((re) => re.test(q.plain)))
    return { topic: 'no-spoilers', reply: say(`No spoilers from me${comma(ctx)}! The data will tell you, one query at a time. Keep playing and we will find out together.`, 'smirk', { chips: ['Who is Tara Sen?', 'What should I do now?'] }) };

  // 2. the game, 3. SQL concepts
  const game = bestTopic(q, ctx);
  const g = game?.score ?? 0;
  if (g < 3) {
    const index = await loadIndex(kb);
    const failed = !index;
    const hit = index ? findConcept(q, index) : null;
    const strong = !!hit && hit.score >= 0.75;
    if (hit && ((strong && (g < 2 || (conceptShaped && hit.recall >= 0.99))) || (hit.score >= 0.55 && g < 1.5)))
      return { topic: 'concept', reply: say(`${hit.text}\nRead more in “${hit.entry.title}”.`, 'think', { action: ACT.learn, chips: conceptChips(q) }) };
    if (failed && !game && conceptShaped)
      return { topic: 'notes-down', reply: say('I cannot open the course notes right now. Check your internet and ask me again in a moment.', 'oops', { chips: fallbackChips(ctx) }) };
  }
  if (game) return { topic: game.topic.id, reply: game.topic.reply(ctx, q) };

  // 4. off-topic, 5. not understood
  if (isOffTopic(q)) return { topic: 'off-topic', reply: say(`That one is outside my case file${comma(ctx)}. I only know this game and its SQL - ask me about hints, points or the story!`, 'smirk', { chips: fallbackChips(ctx) }) };
  return { topic: 'fallback', reply: say(`Sorry${comma(ctx)}, I did not understand that one. Try saying it another way, or tap one of these.`, 'oops', { chips: fallbackChips(ctx) }) };
}

function conceptChips(q: Query): string[] {
  const taught = taughtIn(q);
  return [taught?.single ? `Which episode teaches ${taught.term}?` : 'What does each episode teach?', 'How do hints work?'];
}

// The one function the chat UI calls. Never throws: a broken knowledge source still gets a friendly reply.
export async function ask(question: string, ctx: ChatContext, kb: KnowledgeSources): Promise<Reply> {
  try { return (await route(question, ctx, kb)).reply; }
  catch { return say('Something went wrong on my side. Please ask me once more.', 'oops', { chips: fallbackChips(ctx) }); }
}
