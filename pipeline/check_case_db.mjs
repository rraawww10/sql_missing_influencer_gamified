// Runs every reference query, trap and clue check in content/case_db/checks.json against the
// session snapshots, using sql.js — the same SQLite build the browser uses.
//
// Usage: node pipeline/check_case_db.mjs [--only S07] [--show]
//
// Check fields
//   id, session            "T3.3c", 3            (snapshot = snapshots/sNN.sqlite)
//   setup: [sql]           run first (state the learner would have by then)
//   sql                    the reference / trap query
//   inspect                optional query run after `sql` (for DDL/DML); its result is what gets checked
//   expect                 one or more of:
//     rows: [[..]]           exact result (multiset; add "ordered": true for sequence)
//     contains: [[..]]       these rows are present
//     excludes: [[..]]       these rows are absent
//     count: n               number of rows
//     columns: n             number of columns
//     error: "regex"         the statement must fail with a matching message
//     no_error: true         the statement must run (used for "SQLite doesn't complain" traps)
//     sorted_by: n           rows are in ascending order of column n (name-independent ORDER BY checks)
//   pair_columns: [a, b]   compare these two cells as a set (e.g. self-join pairs ordered by name)
//   differs_from: "id"     trap result must differ from that check's result
//   clue: "S3-C1"          informational: this check produces a pinned clue

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { fillDeep, makeFill } from '../shared/cast.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = path.join(ROOT, 'content/case_db/snapshots');
const CHECKS = path.join(ROOT, 'content/case_db/checks.json');

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const show = args.includes('--show');

const SQL = await initSqlJs();
const snapshots = new Map();

function openSnapshot(session) {
  const file = path.join(SNAP, `s${String(session).padStart(2, '0')}.sqlite`);
  if (!snapshots.has(file)) snapshots.set(file, fs.readFileSync(file));
  const db = new SQL.Database(new Uint8Array(snapshots.get(file)));   // fresh copy per check
  db.exec('PRAGMA foreign_keys = ON;');   // RM #30: enabled by default on the platform
  return db;
}

function norm(v) {
  if (typeof v === 'number' && !Number.isInteger(v)) return Math.round(v * 1e6) / 1e6;
  return v;
}
const key = (row) => JSON.stringify(row.map(norm));

function run(check) {
  const db = openSnapshot(check.session);
  try {
    for (const s of check.setup ?? []) db.exec(s);
    let result;
    try {
      result = db.exec(check.sql);
    } catch (e) {
      return { error: e.message };
    }
    if (check.inspect) result = db.exec(check.inspect);
    const last = result.at(-1) ?? { columns: [], values: [] };
    return { columns: last.columns, rows: last.values.map((r) => r.map(norm)) };
  } finally {
    db.close();
  }
}

function sameMultiset(a, b) {
  if (a.length !== b.length) return false;
  const count = new Map();
  for (const r of a) count.set(key(r), (count.get(key(r)) ?? 0) + 1);
  for (const r of b) {
    const k = key(r);
    if (!count.get(k)) return false;
    count.set(k, count.get(k) - 1);
  }
  return true;
}

function verify(check, out, results) {
  const e = check.expect ?? {};
  const fails = [];
  if (e.error) {
    if (!out.error) fails.push(`expected error /${e.error}/, query ran`);
    else if (!new RegExp(e.error).test(out.error)) fails.push(`error "${out.error}" !~ /${e.error}/`);
    return fails;
  }
  if (out.error) return [`unexpected error: ${out.error}`];
  let rows = out.rows;
  const pairCols = check.pair_columns;
  const pairNorm = (r) => { if (!pairCols) return r; const c = [...r]; const [a, b] = pairCols; if (String(c[a]) > String(c[b])) [c[a], c[b]] = [c[b], c[a]]; return c; };
  rows = rows.map(pairNorm);
  if (e.sorted_by !== undefined) {
    const col = rows.map((r) => String(r[e.sorted_by]));
    if (col.some((v, i) => i > 0 && col[i - 1] > v)) fails.push(`rows not sorted by column ${e.sorted_by}`);
  }
  if (e.rows) e.rows = e.rows.map(pairNorm);
  if (e.contains) e.contains = e.contains.map(pairNorm);
  if (e.rows) {
    const ok = e.ordered ? key(rows.flat()) === key(e.rows.flat()) && rows.length === e.rows.length
                         : sameMultiset(rows, e.rows);
    if (!ok) fails.push(`rows differ`);
  }
  if (e.count !== undefined && rows.length !== e.count) fails.push(`count ${rows.length} != ${e.count}`);
  if (e.columns !== undefined && out.columns.length !== e.columns) fails.push(`columns ${out.columns.length} != ${e.columns}`);
  const have = new Set(rows.map(key));
  for (const r of e.contains ?? []) if (!have.has(key(r))) fails.push(`missing row ${key(r)}`);
  for (const r of e.excludes ?? []) if (have.has(key(r))) fails.push(`unexpected row ${key(r)}`);
  if (check.differs_from) {
    const other = results.get(check.differs_from);
    if (!other) fails.push(`differs_from ${check.differs_from}: not run yet`);
    else if (!other.error && sameMultiset(rows, other.rows)) fails.push(`trap result equals ${check.differs_from}`);
  }
  return fails;
}

// names, places and plates come from content/story/cast.json via {{placeholders}}
const fill = makeFill(JSON.parse(fs.readFileSync(path.join(ROOT, 'content/story/cast.json'), 'utf8')));
const checks = fillDeep(JSON.parse(fs.readFileSync(CHECKS, 'utf8')).checks, fill);
const results = new Map();
let failed = 0;
const ids = new Set();
for (const check of checks) {
  if (ids.has(check.id)) { console.log(`DUP  ${check.id}`); failed++; }
  ids.add(check.id);
  if (only && `S${String(check.session).padStart(2, '0')}` !== only) continue;
  const out = run(check);
  results.set(check.id, out);
  const fails = verify(check, out, results);
  const tag = fails.length ? 'FAIL' : 'ok  ';
  if (fails.length) failed++;
  const summary = out.error ? `error: ${out.error}` : `${out.rows.length} row(s)`;
  console.log(`${tag} S${String(check.session).padStart(2, '0')} ${check.id.padEnd(14)} ${summary}${check.clue ? `  [${check.clue}]` : ''}`);
  for (const f of fails) console.log(`       - ${f}`);
  if ((fails.length || show) && !out.error) {
    console.log(`       columns: ${out.columns.join(', ')}`);
    for (const r of out.rows.slice(0, 12)) console.log(`       ${JSON.stringify(r)}`);
    if (out.rows.length > 12) console.log(`       … ${out.rows.length - 12} more`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
