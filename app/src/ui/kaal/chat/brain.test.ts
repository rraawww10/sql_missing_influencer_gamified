import { describe, expect, it } from 'vitest';
import { POINTS, RANKS, SESSION_COUNT } from '../../../engine/progress/derive';
import { MAX_ACTIVITY_TRIES } from '../../../engine/runner/sessionRunner';
import { EPISODES } from '../../episodes';
import { fileLoader } from '../../../test/fixtures';
import { actionFits, ask, route, starters, type ChatContext, type KnowledgeSources } from './brain';

// A small fake course: the shapes the real reading material uses (course tags, bold terms, code fences, images, tables)
const NOTES: Record<string, { title: string; markdown: string }> = {
  groupBy: {
    title: 'Group By with Having',
    markdown: [
      '<Section>', '', '# Group By with Having', '',
      'Previously, we have learned to perform aggregations on all the rows of a table.', '',
      'The `GROUP BY` keyword in SQL is used to group rows which have the same values. You can perform aggregations on these groups \u2014 to get finer analytics.', '',
      '**Database**', 'The database consists of `player_match_details` table that stores the details of players.', '',
      '#### Syntax', '', '```sql', 'SELECT name, COUNT(*) FROM player_match_details GROUP BY name;', '```', '', '</Section>', '',
      '<Section>', '', '## HAVING', '`HAVING`clause is used to filter the resultant rows after the application of`GROUP BY`clause.', '',
      '|name|half_centuries|', '|---|---|', 'Lokesh|2', '',
      '<MultiLineNote>', '#### WHERE vs HAVING: ', '',
      '- `WHERE` is used to filter rows and this operation is performed before grouping.',
      '- `HAVING` is used to filter groups and this operation is performed after grouping.',
      '</MultiLineNote>', '</Section>',
    ].join('\n'),
  },
  keys: {
    title: 'ER Model to Relational Database',
    markdown: [
      '# ER Model to Relational Database', '', '## Entity Type to Table', '',
      '![Entity Type to Table](https://example.com/entity_type_to_table.png)', '',
      '**Primary key**: A minimal set of attributes (columns) in a table that uniquely identifies rows in a table.', '',
      '## Relationships', '',
      'We store the primary key of a customer in the address table.',
      'This new column in the table that refers to the primary key of another table is called **Foreign Key**.',
    ].join('\n'),
  },
  joins: {
    title: 'Joins | Part - 1',
    markdown: [
      '# JOINS', '', 'So far, we have learnt to analyse the data that is present in a single table.', '',
      'We use JOIN clause to combine rows from two or more tables, based on a related column between them.', '',
      '## INNER JOIN', '', '`INNER JOIN` combines rows from both the tables if they meet a specified condition.', '',
      '#### Syntax', '', '```sql', 'SELECT * FROM table1 INNER JOIN table2 ON table1.c1 = table2.c2;', '```',
    ].join('\n'),
  },
  subqueries: {
    title: 'Subqueries',
    markdown: ['## 1. Introduction to Subquery', '', 'A **subquery** is a query written **inside** another SQL query.', '', '- The **inner query (subquery) runs first**'].join('\n'),
  },
};
const kb: KnowledgeSources = { courseNotes: async () => NOTES };
const brokenKb: KnowledgeSources = { courseNotes: async () => { throw new Error('offline'); } };

const onTask: ChatContext = { screen: 'play', session: 5, beatType: 'task', onTask: true, rank: 'Constable', points: 120, name: 'Priya' };
const onMap: ChatContext = { screen: 'map' };
const topicOf = async (q: string, ctx: ChatContext = onTask) => (await route(q, ctx, kb)).topic;
const textOf = async (q: string, ctx: ChatContext = onTask) => (await ask(q, ctx, kb)).text;

// question -> the part of the knowledge base that must answer it
const GAME: [string, string][] = [
  // points, hints, attempts
  ['How do points work?', 'points'], ['how are points calculated', 'points'], ['how many points for a correct query', 'points'], ['scoring system', 'points'],
  ['how many points do I have', 'mypoints'], ['what is my score', 'mypoints'],
  ['What do hints cost?', 'hintcost'], ['how many points do I lose for a hint', 'hintcost'], ['are hints free', 'hintcost'],
  ['How do hints work?', 'hints'], ['what are the three envelopes', 'hints'], ['what is the sketch', 'hints'], ['i need a hint', 'hints'],
  ['How many tries do I get?', 'attempts'], ['do wrong answers cost points', 'attempts'], ['can I try again', 'attempts'],
  // ranks and badges
  ['How do I get promoted?', 'ranks'], ['when do I become inspector', 'ranks'], ['what is my rank', 'myrank'], ['what badges are there', 'badges'],
  // the SQL console
  ['How do I run my query?', 'run'], ['what does ctrl+enter do', 'run'], ['where do I type my query', 'run'], ['how do I write a query', 'run'], ['keyboard shortcuts', 'shortcuts'],
  ['What does Reset DB do?', 'resetdb'], ['i deleted the whole table by mistake', 'resetdb'], ['How do I reset an episode?', 'resetepisode'],
  ['what does reset do', 'reset'], ['difference between reset db and reset episode', 'reset'], ['Can I play this episode again?', 'replay'],
  ['Where are the tables?', 'tables'], ['show me the schema', 'tables'], ['what is the case database', 'tables'],
  ['what do the results mean', 'results'], ['what does correct mean', 'match'], ['What does Not quite mean?', 'denied'], ['what does denied mean', 'denied'],
  ['What is a Trap?', 'trap'], ['What does Error mean?', 'error'], ['no such table', 'nosuchtable'], ['it says no such column', 'nosuchcolumn'], ['syntax error near from', 'syntaxerror'],
  ['Can I practice on old tasks?', 'practice'], ['is my query correct', 'checkmine'], ['why is my query wrong', 'checkmine'],
  // clues, steps, moving around
  ['How do I pin a clue?', 'clue'], ['What is the Evidence Board?', 'board'], ['pin button is disabled', 'pinlocked'], ['what are the steps', 'steps'],
  ['What is a chapter?', 'chapters'], ['How do I go back a step?', 'nav'], ['can I use arrow keys', 'shortcuts'], ['Why can’t I continue?', 'continuelocked'],
  ['continue button is grey', 'continuelocked'], ['can I skip this task', 'skip'], ['what are the buttons on the top bar', 'topbar'],
  // saving and signing in
  ['How is my progress saved?', 'saving'], ['can I stop and come back later', 'saving'], ['Can I continue on another computer?', 'othercomputer'], ['can I play on my phone', 'othercomputer'],
  ['I forgot my NxtWave ID', 'forgotid'], ['how do I recover my id', 'forgotid'], ['Why do you need my email?', 'email'], ['my progress is gone', 'lostprogress'],
  ['how do I switch student', 'switchuser'], ['is there a password', 'signin'], ['how do I sign up', 'signin'], ['what is nxtwave id', 'nxtwaveid'],
  ['I forgot my password', 'forgotpassword'], ['how do I reset my password', 'forgotpassword'], ['my password is not working', 'forgotpassword'], ['i dont remember my password', 'forgotpassword'],
  // sound, feedback
  ['How do I turn off the sound?', 'sound'], ['How do I turn off your voice?', 'voice'], ['stop talking', 'voice'], ['What is the feedback card?', 'feedback'],
  ['Why is the next episode locked?', 'nextlocked'],
  // the story, without spoilers
  ['Who is Tara Sen?', 'tara'], ['what is the story', 'premise'], ['what is this case about', 'premise'], ['What is the deadline?', 'deadline'], ['Is there a time limit?', 'timer'],
  ['how long does an episode take', 'timer'], ['Who is Ira Menon?', 'ira'], ['Who is Kabir?', 'kabir'], ['Who are the people in the case?', 'people'], ['who is tara’s manager', 'dev'],
  ['who am I', 'whoami'], ['what is my name', 'myname'], ['what is the data cell', 'datacell'],
  // episodes
  ['how many episodes are there', 'episodes'], ['What does each episode teach?', 'learnall'], ['What does the 5th episode teach?', 'episode-n'], ['tell me about follow the money', 'episode-n'],
  ['What will I learn in this episode?', 'this-episode'], ['Which episode teaches joins?', 'which-episode'], ['when do we learn subqueries', 'which-episode'],
  ['what is the case map', 'map'], ['how do I open an episode', 'map'],
  // kinds of steps
  ['What is a Learn step?', 'learnstep'], ['what is a case note', 'learnstep'], ['Where is the reading material?', 'reading'], ['how do I open the scroll', 'reading'],
  ['How does a quick check work?', 'quickcheck'], ['How do activities work?', 'activity'], ['what is a live demo', 'demo'], ['is this mysql', 'sqlite'],
  // what to do, being stuck
  ['What should I do now?', 'whatnow'], ['what next', 'whatnow'], ['i dont know what to do', 'whatnow'], ['i am stuck', 'stuck'], ['I don’t understand this', 'stuck'],
  ['this is too hard', 'frustrated'], ['How does the game work?', 'overview'], ['how do I play', 'overview'],
  ['i dont know sql', 'beginner'], ['i am a beginner', 'beginner'], ['the game is frozen', 'bug'], ['the page is not loading', 'bug'],
  // small talk
  ['hi', 'greet'], ['hello kaal', 'greet'], ['good morning', 'greet'], ['Kaal?', 'greet'], ['thanks', 'thanks'], ['thank you so much kaal', 'thanks'], ['bye', 'bye'], ['see you later', 'bye'],
  ['Who are you, Kaal?', 'whoareyou'], ['what is your name', 'whoareyou'], ['are you a robot', 'areyouai'], ['how are you', 'howareyou'], ['What can I ask you?', 'help'],
  ['how do I open this chat', 'openchat'], ['ok', 'ok'], ['lol', 'laugh'], ['you are awesome', 'compliment'], ['you are stupid', 'insult'], ['tell me a joke', 'joke'],
];

describe('game questions reach the right part of the knowledge base', () => {
  it.each(GAME)('%s -> %s', async (q, topic) => { expect(await topicOf(q)).toBe(topic); });

  it('matching forgives typos, missing punctuation, capitals and word order', async () => {
    const same: [string, string][] = [
      ['how do pionts work', 'points'], ['hw do hints wrk', 'hints'], ['cost of hints?', 'hintcost'], ['envelops?', 'hints'], ['promotion how', 'ranks'],
      ['evidance board', 'board'], ['tabels where', 'tables'], ['where r the tables', 'tables'], ['progress saved how', 'saving'], ['i forgot my nxt wave id', 'forgotid'],
      ['I FORGOT MY ID!!!', 'forgotid'], ['whats reset db', 'resetdb'], ['WHAT DOES DENIED MEAN', 'denied'], ['who’s tara', 'tara'], ['how many epsiodes', 'episodes'],
      ['feedbak card', 'feedback'], ['iam struck', 'stuck'], ['hey kaal how do points work', 'points'], ['thanks, how do hints work', 'hints'], ['Kaal, what does reset db do?', 'resetdb'],
    ];
    for (const [q, topic] of same) expect(await topicOf(q), q).toBe(topic);
  });
});

describe('answers are true to the code', () => {
  it('points: every number comes from POINTS', async () => {
    const t = await textOf('how do points work');
    for (const n of [POINTS.taskPassed, POINTS.firstTryBonus, POINTS.activityFirstTry, POINTS.activityLater, POINTS.checkCorrect, POINTS.cluePinned]) expect(t).toContain(String(n));
    expect(t).toContain('You have 120 so far');
    expect(await textOf('how many points do I have')).toContain('120 points');
    expect(await textOf('how many points do I have', onMap)).toMatch(/case map/);
  });

  it('hints: three envelopes, opened in order, and what each one costs', async () => {
    const how = await ask('how do hints work', onTask, kb);
    expect(how.text).toMatch(/three sealed envelopes/);
    for (const name of ['The Lead', 'The Sketch', 'Full Reveal', 'Get a hint', 'Kaal’s hints']) expect(how.text).toContain(name);
    expect(how.action?.kind).toBe('open-hints');
    const cost = await textOf('what do hints cost');
    expect(cost).toContain(`Envelope 1 takes ${POINTS.hintPenalty[1]}, envelope 2 takes ${POINTS.hintPenalty[2]} and envelope 3 takes ${POINTS.hintPenalty[3]}`);
    expect(cost).toContain(`at least ${POINTS.taskMinimum} points`);
  });

  it('attempts and activities', async () => {
    const t = await textOf('how many tries do I get');
    expect(t).toMatch(/as many times as you need/);
    expect(t).toContain(`${MAX_ACTIVITY_TRIES} tries`);
    expect(await textOf('how do activities work')).toContain(`After ${MAX_ACTIVITY_TRIES} wrong tries`);
  });

  it('ranks: the ladder comes from RANKS, and Kaal knows the student’s rank', async () => {
    const t = await textOf('how do I get promoted');
    for (const r of RANKS) expect(t).toContain(r.name);
    for (const r of RANKS.slice(1)) expect(t).toContain(String(r.minSessions));
    expect(t).toMatch(/not from points/);
    expect(await textOf('what is my rank')).toMatch(/You are a Constable, Priya\. Next is Sub-Inspector, at 8 episodes solved\./);
    expect(await textOf('what is my rank', { ...onTask, rank: 'Inspector' })).toMatch(/top rank/);
  });

  it('the SQL console: running, the two resets, the tables, the results', async () => {
    expect(await textOf('how do I run my query')).toMatch(/Run query.*Ctrl \+ Enter/);
    expect(await textOf('what does reset db do')).toMatch(/costs nothing.*never sticks/s);
    expect(await textOf('how do I reset an episode')).toMatch(/this episode only.*confirm/s);
    const tables = await ask('where are the tables', onTask, kb);
    expect(tables.text).toMatch(/Data.*Schema/s);
    expect(tables.action?.kind).toBe('open-tables');
    const results = await textOf('what do the results mean');
    for (const word of ['Correct', 'Not quite', 'Error', 'Trap']) expect(results).toContain(word);
    expect(results).not.toMatch(/MATCH FOUND|Denied|Verified/);
    expect(await textOf('what does not quite mean')).toMatch(/ran, but the result is not what the task asked/);
    expect(await textOf('can I practice on old tasks')).toMatch(/nothing is graded/);
  });

  it('saving, another computer, the email and a forgotten ID', async () => {
    expect(await textOf('how is my progress saved')).toMatch(/after every step.*in your account/s);
    expect(await textOf('can I continue on another computer')).toMatch(/log in with your email or NxtWave ID\. Your episodes/);
    expect(await textOf('why do you need my email')).toMatch(/Any personal email works.*no OTP/s);
    expect(await textOf('is there a password')).toMatch(/No password and no OTP/);
    expect(await textOf('I forgot my password')).toMatch(/no password to remember/);
    expect(await textOf('i forgot my nxtwave id')).toMatch(/personal email.*NxtWave profile.*dashboard/s);
    expect(await textOf('how do I switch student')).toContain('“Log out”');
  });

  it('the feedback card unlocks the next episode; reading material is read only; no real timer', async () => {
    expect(await textOf('what is the feedback card')).toMatch(/“Next episode” unlocks.*optional/s);
    expect(await textOf('where is the reading material')).toMatch(/Learn scroll.*complete reading material.*read only/s);
    const timer = await textOf('is there a time limit');
    expect(timer).toMatch(/No real timer.*story time only/s);
    expect(timer).not.toMatch(/minutes/);
  });

  it('the story basics, without spoilers', async () => {
    expect(await textOf('who is tara sen')).toMatch(/singer from Chandpur.*first stadium concert/s);
    expect(await textOf('what is the deadline')).toMatch(/midnight.*40,000 fans.*no real timer/s);
    expect(await textOf('who is ira menon')).toMatch(/mentor at the City Police Data Cell/);
    expect(await textOf('who is kabir')).toMatch(/Kabir Shaikh works at the Data Cell/);
    expect(await textOf('who are you')).toMatch(/I’m Kaal, your assistant.*I work for you.*never do is hand over a task answer/s);
  });

  it('episodes: how many, what each teaches, and where a SQL idea is taught', async () => {
    expect(await textOf('how many episodes are there')).toContain(`There are ${SESSION_COUNT} episodes`);
    expect(await textOf('what does the 5th episode teach')).toBe(`“${EPISODES[4].title}” is episode 5 of ${EPISODES.length}, at 8:00 PM in the story. It teaches: ${EPISODES[4].learn}.`);
    expect(await textOf('what does episode 12 teach')).toContain(EPISODES[11].learn);
    expect(await textOf('what is the last episode')).toContain(EPISODES[EPISODES.length - 1].title);
    expect(await textOf('what will I learn in this episode')).toContain(EPISODES[4].learn);
    expect(await textOf('which episode teaches group by')).toBe('You learn GROUP BY in “Follow the Money” (episode 5).');
    expect(await textOf('which episode teaches joins')).toBe('You learn JOIN in “Connect the Dots” (episode 10) and “The Toll Plaza” (episode 11).');
    expect(await textOf('where will I learn having')).toBe('You learn HAVING in “Phone Towers” (episode 6).');
  });
});

describe('answers follow the screen the student is on', () => {
  it('"what should I do now" depends on the screen and the step', async () => {
    expect(await textOf('what should I do now', onMap)).toMatch(/Up next/);
    expect(await textOf('what should I do now', { screen: 'briefing' })).toContain(EPISODES[0].title);
    expect(await textOf('what should I do now', { screen: 'done', session: 3 })).toMatch(/feedback card/);
    expect(await textOf('what should I do now', onTask)).toMatch(/Run query.*Correct.*Continue/s);
    expect(await textOf('what should I do now', { screen: 'play', beatType: 'clue' })).toMatch(/pin it/);
    expect(await textOf('what should I do now', { screen: 'play', beatType: 'check' })).toMatch(/Pick the answer/);
    expect(await textOf('what should I do now', { screen: 'play', beatType: 'scene' })).toMatch(/Read the story/);
  });

  it('"why can’t I continue" names what the current step still needs', async () => {
    expect(await textOf('why can’t I continue', onTask)).toMatch(/correct query/);
    expect(await textOf('why can’t I continue', { screen: 'play', beatType: 'clue' })).toMatch(/Pin the evidence/);
    expect(await textOf('why can’t I continue', { screen: 'done' })).toMatch(/feedback card/);
  });

  it('an action is only offered where it can work', async () => {
    expect((await ask('how do hints work', { screen: 'play', beatType: 'note' }, kb)).action).toBeUndefined();
    expect((await ask('where are the tables', onMap, kb)).action).toBeUndefined();
    expect((await ask('what is the evidence board', onMap, kb)).action?.kind).toBe('open-evidence');
    expect((await ask('what is the evidence board', { screen: 'evidence' }, kb)).action).toBeUndefined();
    expect((await ask('who is tara', onTask, kb)).action).toEqual({ kind: 'go-briefing', label: 'Read the briefing' });
    expect(actionFits({ kind: 'open-hints', label: '' }, onTask)).toBe(true);
    expect(actionFits({ kind: 'open-hints', label: '' }, onMap)).toBe(false);
    expect(actionFits({ kind: 'go-map', label: '' }, onMap)).toBe(false);
  });

  it('uses the student’s first name when it knows it, and works without one', async () => {
    expect(await textOf('hello', { ...onTask, name: 'Priya Sharma' })).toMatch(/^Hello, Priya!/);
    expect(await textOf('hello', onMap)).toMatch(/^Hello! Kaal here/);
  });
});

describe('guardrails', () => {
  const ASKING_FOR_THE_ANSWER = [
    'give me the answer', 'what is the answer', 'solve this', 'solve this for me please', 'what is the query', 'write the SQL for me', 'can you write the query',
    'tell me the solution', 'just tell me what to type', 'what should I write here', 'what query should I run', 'answer please', 'i need the correct query',
    'show me the full query', 'pls give ans', 'do it for me', 'complete my query', 'write a query to find all cabs after 6 pm', 'how do I write a query to find the car',
    'whats the answer to this quick check', 'can I cheat', 'kaal give me the code', 'I want the solution',
  ];
  it.each(ASKING_FOR_THE_ANSWER)('never hands over an answer: %s', async (q) => {
    const { topic, reply } = await route(q, onTask, kb);
    expect(topic).toBe('no-answers');
    expect(reply.text).toMatch(/cannot hand over/);
    expect(reply.text).toMatch(/envelopes/);
    expect(reply.text).not.toMatch(/select|from\s+\w+\s+where/i);
    expect(reply.action).toEqual({ kind: 'open-hints', label: 'Open the hint envelopes' });
  });

  it('points to the envelopes without the button when no task is on screen', async () => {
    const r = await ask('give me the answer', onMap, kb);
    expect(r.text).toMatch(/cannot hand over answers.*hint envelopes/s);
    expect(r.action).toBeUndefined();
  });

  it('offers the concept instead when the request names a SQL keyword', async () => {
    expect((await ask('write the group by query for me', onTask, kb)).chips).toContain('Explain GROUP BY');
  });

  it('does not refuse honest questions that only sound similar', async () => {
    expect(await topicOf('which envelope shows the answer')).not.toBe('no-answers');
    expect(await topicOf('how do I write a query')).toBe('run');
    expect(await topicOf('give me a hint')).toBe('hints');
    expect(await topicOf('give me an example of group by')).toBe('concept');
    expect(await topicOf('tell me about the sql console')).toBe('run');
    expect(await topicOf('do wrong answers cost points')).toBe('attempts');
  });

  it('a pasted query is not graded in the chat', async () => {
    const { topic, reply } = await route("select * from hotel_guests where name = 'Tara' - is this right?", onTask, kb);
    expect(topic).toBe('checkmine');
    expect(reply.text).toMatch(/cannot see or grade your query/);
  });

  const SPOILERS = ['who did it', 'who kidnapped tara', 'who is the culprit', 'where is tara', 'what happens next', 'how does the story end', 'is dev guilty',
    'did the manager do it', 'do we find her', 'tell me the whole story', 'why did she leave', 'who is the main suspect'];
  it.each(SPOILERS)('no story spoilers: %s', async (q) => {
    const { topic, reply } = await route(q, onTask, kb);
    expect(topic).toBe('no-spoilers');
    expect(reply.text).toMatch(/No spoilers/);
  });

  it('says only what the briefing says about Tara’s safety', async () => {
    for (const q of ['is tara dead', 'is she safe', 'is tara alive?']) expect(await textOf(q), q).toMatch(/missing, not hurt.*No spoilers/s);
  });

  it('story questions the briefing answers are not treated as spoilers', async () => {
    expect(await topicOf('what happened to tara')).toMatch(/premise|tara/);
    expect(await topicOf('who are the suspects')).toBe('people');
    expect(await topicOf('what happens in episode 5')).toBe('episode-n');
    expect(await topicOf('what does clear the innocent teach')).toBe('episode-n');
    expect(await textOf('who is dev arora')).toMatch(/Tara’s manager.*no spoilers/s);
  });

  const OFF_TOPIC = ['what is the weather today', 'who is the prime minister of india', 'tell me about cricket', 'what is 2+2', 'best movie this year'];
  it.each(OFF_TOPIC)('off-topic gets a one-line redirect: %s', async (q) => {
    const { topic, reply } = await route(q, onTask, kb);
    expect(topic).toBe('off-topic');
    expect(reply.text).toMatch(/I only know this game and its SQL/);
    expect(reply.text).not.toContain('\n');
  });
});

describe('when Kaal does not understand', () => {
  it.each(['asdfgh qwerty', 'blah blah blah', 'purple elephant umbrella'])('says so plainly and offers 3 chips: %s', async (q) => {
    const { topic, reply } = await route(q, onTask, kb);
    expect(topic).toBe('fallback');
    expect(reply.text).toMatch(/did not understand/);
    expect(reply.chips).toHaveLength(3);
    expect(reply.mood).toBe('oops');
  });

  it('an empty question gets examples, and a very long one is cut, never an error', async () => {
    expect((await route('   ', onTask, kb)).topic).toBe('empty');
    expect((await route('???', onTask, kb)).reply.chips).toHaveLength(3);
    expect((await ask(`how do points work ${'x'.repeat(5000)}`, onTask, kb)).text.length).toBeLessThan(400);
  });

  it('a SQL idea that is not in the course is not guessed', async () => {
    expect(await topicOf('what is a trigger')).toBe('fallback');
    expect(await topicOf('what is a stored procedure')).toBe('fallback');
  });
});

describe('SQL concept questions are answered from the reading material', () => {
  it('a bold definition: what is a primary key', async () => {
    const r = await ask('What is a primary key?', onTask, kb);
    expect(r.text).toBe('Primary key: A minimal set of attributes (columns) in a table that uniquely identifies rows in a table.\nRead more in “ER Model to Relational Database”.');
    expect(r.action).toEqual({ kind: 'open-learn', label: 'Open the reading material' });
    expect(r.mood).toBe('think');
  });

  it('a keyword: how does GROUP BY work (markdown cleaned, the warm-up sentence skipped, no code, no em dash)', async () => {
    const r = await ask('how does GROUP BY work', onTask, kb);
    expect(r.text).toMatch(/^The `GROUP BY` keyword in SQL is used to group rows which have the same values\. You can perform aggregations on these groups - to get finer analytics\./);
    expect(r.text).not.toMatch(/Previously|SELECT name|\*\*|<|\u2014|player_match_details/);
    expect(r.text).toContain('Read more in “Group By with Having”.');
    expect(r.chips).toContain('Which episode teaches GROUP BY?');
  });

  it('a comparison: difference between WHERE and HAVING', async () => {
    for (const q of ['difference between WHERE and HAVING', 'what is the difference between where and having?', 'where vs having']) {
      const r = await ask(q, onTask, kb);
      expect(r.text, q).toMatch(/^`WHERE` is used to filter rows and this operation is performed before grouping\. `HAVING` is used to filter groups and this operation is performed after grouping\./);
      expect(r.action?.kind).toBe('open-learn');
    }
  });

  it('a "called X" sentence, a section intro, a sub-heading, and a tidy note title', async () => {
    expect(await textOf('what is a foreign key')).toMatch(/is called Foreign Key\./);
    const join = await textOf('what is a join');
    expect(join).toMatch(/^We use JOIN clause to combine rows from two or more tables/);
    expect(join).not.toMatch(/So far/);
    const inner = await textOf('what is inner join');
    expect(inner).toMatch(/^`INNER JOIN` combines rows from both the tables if they meet a specified condition\./);
    expect(inner).not.toMatch(/SELECT \*/);
    expect(inner).toContain('Read more in “Joins - Part 1”.');
    expect(await textOf('what is having')).toMatch(/^`HAVING` clause is used to filter the resultant rows/);
    expect(await textOf('Explain subqueries')).toMatch(/^A subquery is a query written inside another SQL query\./);
  });

  it('forgives a typo in a course word', async () => {
    expect(await textOf('whats a primery key')).toMatch(/^Primary key: A minimal set of attributes/);
    expect(await textOf('explain gruop by')).toMatch(/^The `GROUP BY` keyword/);
    expect(await textOf('what is havng')).toMatch(/`HAVING` clause is used/);
  });

  it('game words win over look-alike course words, and the other way round', async () => {
    expect(await topicOf('what is a hint')).toBe('hints');
    expect(await topicOf('where is the table')).toBe('tables');
    expect(await topicOf('what is the case about')).toBe('premise');
    expect(await topicOf('what is group by')).toBe('concept');
    expect(await topicOf('how do I update my name')).toBe('switchuser');
  });

  it('still answers game questions when the reading material cannot be loaded', async () => {
    expect((await ask('how do points work', onTask, brokenKb)).text).toMatch(/A correct query gives/);
    const r = await route('what is a primary key', onTask, brokenKb);
    expect(r.topic).toBe('notes-down');
    expect(r.reply.text).toMatch(/cannot open the course notes right now/);
  });
});

describe('the real course reading material', async () => {
  const real: KnowledgeSources = { courseNotes: () => fileLoader().caseNotes() };
  const notes = await real.courseNotes().catch(() => null);
  const cached: KnowledgeSources = { courseNotes: async () => notes! };

  it.skipIf(!notes)('answers the usual concept questions with a short, clean excerpt', async () => {
    const expected: [string, RegExp][] = [
      ['what is a primary key', /uniquely identifies rows in a table/],
      ['how does GROUP BY work', /used to group rows which have the same values/],
      ['difference between WHERE and HAVING', /before grouping.*after grouping/s],
      ['what is a join', /combine rows from two or more tables/],
      ['what is a subquery', /query written inside another SQL query/],
      ['what is a view', /name to a SQL Query/],
      ['what is a database', /organised collection of data/],
      ['what is order by', /`ORDER BY` clause to order rows/],
      ['delete vs drop', /`DELETE` clause.*`DROP` clause/s],
      ['what is a transaction', /logical group of one or more SQL statements/],
    ];
    for (const [q, re] of expected) {
      const { topic, reply } = await route(q, onTask, cached);
      expect(topic, q).toBe('concept');
      expect(reply.text, q).toMatch(re);
      expect(reply.text, q).not.toMatch(/\*\*|<\/?[A-Za-z]|```|!\[|\u2014|https?:/);
      expect(reply.text.length, q).toBeLessThan(480);
      expect(reply.action?.kind, q).toBe('open-learn');
    }
  });

  it.skipIf(!notes)('every SQL idea an episode teaches can be found, and its follow-up chips work', async () => {
    const items = EPISODES.slice(0, -1).flatMap((e) => e.learn.split(',').map((x) => x.trim())).filter((x) => /^[A-Za-z][A-Za-z -]+$/.test(x) && x !== 'IN');
    expect(items.length).toBeGreaterThan(30);
    for (const item of items) {
      const where = await route(`Which episode teaches ${item}?`, onTask, cached);
      expect(where.topic, item).toBe('which-episode');
      for (const chip of where.reply.chips ?? []) expect(['fallback', 'off-topic', 'no-answers']).not.toContain((await route(chip, onTask, cached)).topic);
    }
  });
});

describe('suggested questions', () => {
  const CONTEXTS: ChatContext[] = [
    onMap, { screen: 'briefing' }, { screen: 'intro', session: 2 }, { screen: 'done', session: 2 }, { screen: 'evidence' }, onTask,
    ...['scene', 'hook', 'note', 'clue', 'check', 'activity', 'demo'].map((beatType): ChatContext => ({ screen: 'play', session: 6, beatType })),
  ];
  const UNDERSTOOD = (topic: string) => !['fallback', 'off-topic', 'empty', 'no-answers', 'no-spoilers', 'notes-down'].includes(topic);

  it('starters: 3 or 4 per screen, each one a question Kaal can answer', async () => {
    for (const ctx of CONTEXTS) {
      const list = starters(ctx);
      expect(list.length, ctx.screen).toBeGreaterThanOrEqual(3);
      expect(list.length, ctx.screen).toBeLessThanOrEqual(4);
      for (const q of list) expect(UNDERSTOOD((await route(q, ctx, kb)).topic), `${ctx.screen}/${ctx.beatType}: ${q}`).toBe(true);
    }
  });

  it('every chip Kaal offers leads to a real answer (followed until no new chip appears)', async () => {
    const seeds = [...GAME.map(([q]) => q), 'give me the answer', 'who did it', 'what is the weather', 'asdfgh', 'what is a primary key', 'how does group by work', 'where vs having'];
    for (const ctx of [onTask, onMap, { screen: 'done', session: 2 } as ChatContext]) {
      const seen = new Set<string>();
      const queue = [...seeds, ...starters(ctx)];
      while (queue.length) {
        const q = queue.pop()!;
        if (seen.has(q)) continue;
        seen.add(q);
        const { topic, reply } = await route(q, ctx, kb);
        if (!seeds.includes(q)) expect(UNDERSTOOD(topic), `${ctx.screen}: chip “${q}” -> ${topic}`).toBe(true);
        expect(reply.chips?.length ?? 0, q).toBeLessThanOrEqual(3);
        queue.push(...(reply.chips ?? []));
      }
    }
  });
});

describe('every reply follows the text rules', () => {
  it('short, plain text, no em dashes, no markdown, a known mood', async () => {
    const moods = ['idle', 'think', 'happy', 'smirk', 'point', 'cheer', 'oops', 'whisper'];
    const questions = [...GAME.map(([q]) => q), 'give me the answer', 'who did it', 'is tara dead', 'what is the weather', 'asdfgh', '', 'what is a primary key', 'how does group by work', 'where vs having'];
    for (const ctx of [onTask, onMap, { screen: 'play', beatType: 'clue', session: 1 } as ChatContext]) {
      for (const q of questions) {
        const r = await ask(q, ctx, kb);
        expect(r.text, q).not.toMatch(/[\u2014\u2013]|\*\*|^#|```|<[a-z/]/im);
        expect(r.text.length, q).toBeGreaterThan(10);
        expect(r.text.length, q).toBeLessThan(430);
        expect(r.text.split('\n').length, q).toBeLessThanOrEqual(2);
        expect(moods, q).toContain(r.mood);
        for (const chip of r.chips ?? []) expect(chip.length, chip).toBeLessThan(48);
      }
    }
  });
});
