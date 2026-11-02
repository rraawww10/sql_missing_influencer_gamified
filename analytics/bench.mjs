// Dashboard timing at scale: node bench.mjs [db=data/demo.sqlite] — times every admin query once warm.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, loadCatalogue, Analytics } from './lib.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const db = openDb(process.argv[2] ?? path.join(HERE, 'data', 'demo.sqlite'));
const a = new Analytics(db, loadCatalogue(path.join(HERE, '..', 'content', 'sessions')));
const rows = db.prepare('SELECT COUNT(*) n, COUNT(DISTINCT student_id) s FROM events').get();
console.log(`${rows.n} events, ${rows.s} students`);
const some = db.prepare('SELECT student_id FROM events LIMIT 1').get().student_id;
const time = (name, fn) => { fn(); const t = performance.now(); fn(); console.log(`${name.padEnd(22)} ${(performance.now() - t).toFixed(0).padStart(6)} ms`); };
time('overview', () => a.overview({}));
time('students', () => a.students({}));
time('student(id)', () => a.student(some));
time('episode(5)', () => a.episode(5, {}));
time('exportCsv', () => a.exportCsv({}));
if (a.feedback) time('feedback', () => a.feedback({}));
