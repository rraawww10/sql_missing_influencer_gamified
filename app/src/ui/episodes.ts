// Episode names and teasers: the learner never sees "S01" / "Session 1" — every stage is named after what happens in it.
// Titles mirror the packs (content/sessions/sNN.json `title`); teasers and skills are written here (no spoilers).
import { storyTime } from './speakers';

export interface EpisodeMeta {
  n: number;
  title: string;
  emoji: string;
  teaser: string;   // one line, no spoilers
  learn: string;    // the SQL / database ideas the episode teaches
}

export const EPISODES: EpisodeMeta[] = [
  { n: 1, title: "She's Gone", emoji: '🚨', teaser: 'A reel star vanishes six hours before her show. Her phone is off. The city’s data is your only witness.', learn: 'Data, databases, DBMS, tables' },
  { n: 2, title: 'Build the Case File', emoji: '🗂️', teaser: 'Five names keep coming up. Put them in a real table before the rumours do.', learn: 'CREATE, INSERT, SELECT, UPDATE, DELETE, ALTER' },
  { n: 3, title: 'Hotel Gate Log', emoji: '🚧', teaser: '300 vehicles went in and out of the hotel since noon. Which one matters?', learn: 'WHERE, =, <, LIKE, AND / OR / NOT' },
  { n: 4, title: 'The Last Cab', emoji: '🚕', teaser: 'She booked a cab to the stadium, then cancelled it herself. Why?', learn: 'IN, BETWEEN, ORDER BY, DISTINCT, LIMIT' },
  { n: 5, title: 'Follow the Money', emoji: '💸', teaser: 'Three days of UPI payments. One of them should not exist.', learn: 'COUNT, SUM, AVG, MIN, MAX, GROUP BY' },
  { n: 6, title: 'Phone Towers', emoji: '📡', teaser: 'Her phone is off. But something of hers is still talking to a tower.', learn: 'HAVING, WHERE vs HAVING' },
  { n: 7, title: 'Smartwatch Secrets', emoji: '⌚', teaser: 'Steps, heart rate, distance. A smartwatch cannot lie.', learn: 'Expressions, functions, CAST, ROUND, UPPER' },
  { n: 8, title: 'Clear the Innocent', emoji: '🧹', teaser: 'Five suspects and one trending hashtag. Hashtags clear no one. Data does.', learn: 'CASE, UNION, INTERSECT, EXCEPT' },
  { n: 9, title: 'The Case Board', emoji: '📌', teaser: 'Ten tables and a wall of red string. Time to design it properly.', learn: 'ER model, keys, relationships' },
  { n: 10, title: 'Connect the Dots', emoji: '🔗', teaser: 'The car, the owner, the company. Join the tables and the dots connect.', learn: 'INNER JOIN, LEFT JOIN, NATURAL JOIN' },
  { n: 11, title: 'The Toll Plaza', emoji: '🛣️', teaser: 'A highway toll plaza, two crossings, one direction that matters.', learn: 'Multi-table joins, RIGHT / FULL / CROSS / SELF JOIN' },
  { n: 12, title: 'The Edited Contract', emoji: '📝', teaser: 'Somebody changed her contract tonight. The system log remembers everything.', learn: 'Views, subqueries, transactions, indexes' },
  { n: 13, title: 'Showtime', emoji: '🎤', teaser: 'Every claim backed by a query. Then the lights go up.', learn: 'Everything, in one case report' },
];

export const EPISODE_COUNT = EPISODES.length;

export const episodeOf = (n: number): EpisodeMeta => EPISODES[n - 1] ?? EPISODES[0];

// Title shown to the learner (the pack's title when loaded, else the planned one)
export const episodeTitle = (n: number, packTitle?: string): string => packTitle ?? episodeOf(n).title;

// "🕕 6:00 PM" — the story clock is the only sequence marker the learner sees
export const episodeClock = (n: number): string => `🕕 ${storyTime(n)}`;

// Short label for a unit (one reading material) inside its episode: "String Operations · part 2 of 3"
export function unitLabel(unit: { title: string; part: number; parts: number; finale?: boolean } | undefined): string {
  if (!unit || unit.finale) return '';
  return unit.parts > 1 ? `${unit.title} · part ${unit.part} of ${unit.parts}` : unit.title;
}
