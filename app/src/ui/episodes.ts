// Episode names and teasers: the learner never sees "S01" / "Session 1" - every stage is named after what happens in it.
// Titles mirror the packs (content/sessions/sNN.json `title`); teasers and skills are written here (no spoilers).

export interface EpisodeMeta {
  n: number;
  title: string;
  teaser: string;   // one line, no spoilers
  story: string;    // the episode's context in 2-3 sentences: the situation and the question, never the answer
                    // (shown in the briefing's timeline and on the episode intro; all episodes are open, so no spoilers)
  learn: string;    // the SQL / database ideas the episode teaches
}

export const EPISODES: EpisodeMeta[] = [
  { n: 1, title: "She's Gone", teaser: 'A reel star vanishes six hours before her show. Her phone is off. The city’s data is your only witness.', story: 'Breaking news: singer Tara Sen is missing, six hours before her first stadium concert. It is your first night at the City Police Data Cell, with SI Ira Menon. Learn what data and databases are, and find out where Tara was last seen.', learn: 'Data, databases, DBMS, tables' },
  { n: 2, title: 'Build the Case File', teaser: 'Five names keep coming up. Put them in a real table before the rumours do.', story: 'Five names keep coming up around Tara, and rumours are spreading fast. Ira wants them in a proper table, not a notebook. Write your first SQL to build the case file, then check the hotel\'s key-card records for Tara\'s last move.', learn: 'CREATE, INSERT, SELECT, UPDATE, DELETE, ALTER' },
  { n: 3, title: 'Hotel Gate Log', teaser: '300 vehicles went in and out of the hotel since noon. Which one matters?', story: 'The hotel has three gates, and security logged every vehicle that came in or went out since noon. A guard remembers a car leaving by the service gate around six, but only part of its number plate. Search the gate log to find that car.', learn: 'WHERE, =, <, LIKE, AND / OR / NOT' },
  { n: 4, title: 'The Last Cab', teaser: 'She booked a cab to the stadium, then cancelled it herself. Why?', story: 'Tara booked a cab to the stadium before she vanished, then cancelled it herself. Why would she cancel her own ride? Read the cab company\'s rides to see what happened in those few minutes, and test the rumours about the driver with data.', learn: 'IN, BETWEEN, ORDER BY, DISTINCT, LIMIT' },
  { n: 5, title: 'Follow the Money', teaser: 'Three days of UPI payments. One of them should not exist.', story: 'Tara\'s sister Mahi gets a strange ₹1 payment from Tara\'s smartwatch. The bank shares three days of UPI payments. Find that tiny payment and read its note, then follow the bigger money moving around Tara\'s team.', learn: 'COUNT, SUM, AVG, MIN, MAX, GROUP BY' },
  { n: 6, title: 'Phone Towers', teaser: 'Her phone is off. But something of hers is still talking to a tower.', story: 'Tara\'s phone is off, but her smartwatch has its own SIM and keeps talking to phone towers. Use the tower records to narrow down where she is, and check whether everyone\'s story about where they were tonight holds up.', learn: 'HAVING, WHERE vs HAVING' },
  { n: 7, title: 'Smartwatch Secrets', teaser: 'Steps, heart rate, distance. A smartwatch cannot lie.', story: 'One tower covers a big area. Tara\'s watch also logs her steps, distance and heart rate every five minutes. Read the watch log to learn how she is, and decode a message written in strange capital letters.', learn: 'Expressions, functions, CAST, ROUND, UPPER' },
  { n: 8, title: 'Clear the Innocent', teaser: 'Five suspects and one trending hashtag. Hashtags clear no one. Data does.', story: 'Online, people are blaming each other, and a fan club post says "she\'s safe, trust me". Hashtags clear no one; data does. Compare lists of people tonight and clear the innocent, one by one.', learn: 'CASE, UNION, INTERSECT, EXCEPT' },
  { n: 9, title: 'The Case Board', teaser: 'Ten tables and a wall of red string. Time to design it properly.', story: 'The evidence is spread across many tables, and the case board is a wall of photos and red string. Turn it into a clean design, an ER model and real tables, and add a new booking that a witness sends in.', learn: 'ER model, keys, relationships' },
  { n: 10, title: 'Connect the Dots', teaser: 'The car, the owner, the company. Join the tables and the dots connect.', story: 'New city records arrive: people, companies, bank accounts, rehearsals and insurance. Each table holds one kind of thing, so you have to join them. Connect the dots to find out who really owns the car from the gate log.', learn: 'INNER JOIN, LEFT JOIN, NATURAL JOIN' },
  { n: 11, title: 'The Toll Plaza', teaser: 'A highway toll plaza, two crossings, one direction that matters.', story: 'You know whose car it is, but where did it go? Highway toll records show every crossing tonight. Rebuild the car\'s route, and help the police unit plan the fastest way to get there.', learn: 'Multi-table joins, RIGHT / FULL / CROSS / SELF JOIN' },
  { n: 12, title: 'The Edited Contract', teaser: 'Somebody changed her contract tonight. The system log remembers everything.', story: 'A lawyer says Tara chose to skip her shows, and that her contract allows it. The record label shares its contracts, payments and a log of every change. Find out who changed the contract, and when.', learn: 'Views, subqueries, transactions, indexes' },
  { n: 13, title: 'Showtime', teaser: 'Every claim backed by a query. Then the lights go up.', story: 'Midnight is close and the stadium is full. The court needs proof, not a story. Prove each claim with a query and close the case before the show.', learn: 'Everything, in one case report' },
];

export const EPISODE_COUNT = EPISODES.length;

export const episodeOf = (n: number): EpisodeMeta => EPISODES[n - 1] ?? EPISODES[0];

// Title shown to the learner (the pack's title when loaded, else the planned one)
export const episodeTitle = (n: number, packTitle?: string): string => packTitle ?? episodeOf(n).title;

// "🕕 6:00 PM" - the story clock is the only sequence marker the learner sees

// Short label for a unit (one reading material) inside its episode: "String Operations · part 2 of 3"
export function unitLabel(unit: { title: string; part: number; parts: number; finale?: boolean } | undefined): string {
  if (!unit || unit.finale) return '';
  return unit.parts > 1 ? `${unit.title} · part ${unit.part} of ${unit.parts}` : unit.title;
}
