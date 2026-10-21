// Validate session sources and build the game's session packs.
//
// Usage: node pipeline/build_sessions.mjs [--only 3]
//
// In:  content/sessions/src/sNN.yaml              (authored: story, beats, tasks with reference SQL)
//      content/reading_materials.json             (verbatim course extract)
//      content/case_db/snapshots/sNN.sqlite       (built by pipeline/build_case_db.py)
// Out: content/sessions/sNN.json                  (public pack: no reference SQL, expected results hashed)
//      content/sessions/solutions/sNN.json        (reference + trap SQL, lazy-loaded for hint 3)
//      content/sessions/coverage.json             (RM heading coverage report)
//      content/units/uNN.json + index.json        (one pack per reading material: a slice of its session, see `units:`)
//
// Fails (exit 1) on: bad structure, unknown/duplicate ids, rm_ref not found, uncovered RM headings,
// reference queries that error or return nothing, traps that equal the answer or don't trigger,
// reference queries using SQL taught in a later session, clue references that don't resolve,
// and sessions over the 60-minute budget.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import initSqlJs from 'sql.js';
import { hashResult } from '../shared/result.mjs';
import { untaught } from '../shared/sql_features.mjs';
import { fillDeep, makeFill } from '../shared/cast.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'content/sessions/src');
const OUT = path.join(ROOT, 'content/sessions');
const SOLUTIONS = path.join(OUT, 'solutions');
const UNITS_OUT = path.join(ROOT, 'content/units');
const FINALE_UNIT = 38;   // the finale (no reading material) comes after the 37 reading-material units
const SNAP = path.join(ROOT, 'content/case_db/snapshots');
const RM_FILE = path.join(ROOT, 'content/reading_materials.json');
const CAST = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/story/cast.json'), 'utf8'));
const fill = makeFill(CAST);

const BUDGET_MINUTES = 60;

// Clues of every session, so each session can brief the learner on "the case so far" (standalone play)
function cluesBySession() {
  const out = {};
  for (const f of fs.readdirSync(SRC).filter((x) => /^s\d\d\.yaml$/.test(x))) {
    const src = fillDeep(yaml.load(fs.readFileSync(path.join(SRC, f), 'utf8')), fill);
    out[src.session] = src.beats.filter((b) => b.type === 'clue').map((b) => ({ session: src.session, clue_id: b.clue_id, title: b.title, body: b.body }));
  }
  return out;
}
const DEFAULT_MINUTES = { scene: 0.5, note: 1.5, activity: 2, task: 3, clue: 0.5, check: 1, hook: 0.5, demo: 2 };
const RUNTIME = path.join(ROOT, 'content/case_db/runtime');
const BEAT_TYPES = Object.keys(DEFAULT_MINUTES);
const ACTIVITY_KINDS = ['sort_into', 'match', 'order', 'pick_cell', 'multi_select'];
// speakers are cast keys (content/story/cast.json) plus two non-people voices
const SPEAKERS = ['narrator', 'system', ...Object.keys(CAST.people)];
// Generic RM headings that are structure, not concepts — not required for coverage
const GENERIC_HEADINGS = new Set(['example', 'examples', 'output', 'syntax', 'try it yourself', 'expected output',
  'approach', 'schema', 'database', 'tables', 'concepts in focus', 'query 1', 'query 2', 'expected result',
  'understanding', 'example log']);

const only = process.argv.includes('--only') ? Number(process.argv[process.argv.indexOf('--only') + 1]) : null;
const norm = (h) => h.toLowerCase().replace(/[*_`!:]/g, '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
const rmUnits = new Map();   // unit_id -> { rm, title, topic_id, headings:Set }
for (const t of JSON.parse(fs.readFileSync(RM_FILE, 'utf8')).topics) {
  for (const m of t.reading_materials) {
    rmUnits.set(m.unit_id, {
      rm: m.global_sequence, title: m.title, topic_id: t.topic_id, learning_resource_id: m.learning_resource_id,
      headings: new Map(m.headings.map((h) => [norm(h.text), h.text])),
    });
  }
}

const SQL = await initSqlJs();
const snapCache = new Map();
function openSnapshot(name) {
  const file = path.join(SNAP, `${name}.sqlite`);
  if (!snapCache.has(file)) snapCache.set(file, fs.readFileSync(file));
  const db = new SQL.Database(new Uint8Array(snapCache.get(file)));
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

// Run setup + sql (+ inspect) on a fresh snapshot copy. Returns { result } or { error }.
function execute(snapshot, setup, sql, inspect) {
  const db = openSnapshot(snapshot);
  try {
    for (const s of setup ?? []) db.exec(s);
    let res;
    try { res = db.exec(sql); } catch (e) { return { error: e.message }; }
    if (inspect) res = db.exec(inspect);
    return { result: res.at(-1) };
  } catch (e) {
    return { setupError: e.message };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
async function buildSession(file) {
  const errors = [], warnings = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  let src;
  try {
    // {{placeholders}} → names, places and plates from the cast, before anything else (SQL included)
    src = fillDeep(yaml.load(fs.readFileSync(file, 'utf8')), fill);
  } catch (e) { return { errors: [`${path.basename(file)}: ${e.message}`], warnings }; }
  const S = src.session;
  const tag = `S${S}`;

  for (const k of ['session', 'title', 'story_clock', 'course_topic_id', 'snapshot', 'reading_materials', 'beats', 'exit'])
    if (src[k] === undefined) err(tag, `missing "${k}"`);
  if (errors.length) return { errors, warnings };

  // reading materials belong to this course topic
  const sessionUnits = new Set();
  for (const r of src.reading_materials) {
    const u = rmUnits.get(r.unit_id);
    if (!u) { err(tag, `reading_materials: unknown unit_id ${r.unit_id}`); continue; }
    if (u.topic_id !== src.course_topic_id) err(tag, `RM #${u.rm} belongs to another topic`);
    if (!['primary', 'subset'].includes(r.role)) err(tag, `RM #${u.rm}: role must be primary|subset`);
    sessionUnits.add(r.unit_id);
  }

  const ids = new Set(), clueDefs = new Map(), taskIds = new Set(), referenced = new Set();
  let minutes = 0;
  const pubBeats = [], solutions = {};

  const checkRmRef = (where, ref) => {
    if (!ref) return;
    const u = rmUnits.get(ref.unit_id);
    if (!u) return err(where, `rm_ref unknown unit_id ${ref.unit_id}`);
    if (!sessionUnits.has(ref.unit_id)) return err(where, `rm_ref RM #${u.rm} is not listed in reading_materials`);
    if (!u.headings.has(norm(ref.heading))) return err(where, `rm_ref heading "${ref.heading}" not in RM #${u.rm} (${[...u.headings.values()].join(' | ')})`);
    referenced.add(norm(ref.heading));
  };

  for (const b of src.beats) {
    const where = `${tag} ${b.id ?? '?'}`;
    if (!b.id || ids.has(b.id)) err(where, 'missing or duplicate beat id');
    ids.add(b.id);
    if (!BEAT_TYPES.includes(b.type)) { err(where, `unknown type "${b.type}"`); continue; }
    minutes += b.minutes ?? DEFAULT_MINUTES[b.type];
    if (b.speaker && !SPEAKERS.includes(b.speaker)) err(where, `unknown speaker "${b.speaker}"`);
    checkRmRef(where, b.rm_ref);
    for (const r of b.see_also ?? []) checkRmRef(where, r);
    const pub = { ...b };

    if (b.type === 'note' && !b.rm_ref) err(where, 'note needs rm_ref');
    if (['scene', 'note', 'hook', 'clue'].includes(b.type) && !b.body) err(where, 'needs body');

    if (b.type === 'activity') {
      if (!ACTIVITY_KINDS.includes(b.kind)) err(where, `activity kind must be one of ${ACTIVITY_KINDS}`);
      if (!b.prompt) err(where, 'activity needs prompt');
      if (b.kind === 'sort_into') {
        for (const it of b.items ?? []) if (!b.buckets?.includes(it.bucket)) err(where, `item "${it.text}" bucket "${it.bucket}" not in buckets`);
        if (!(b.items?.length >= 2)) err(where, 'sort_into needs ≥ 2 items');
      }
      if (b.kind === 'match' && !(b.pairs?.length >= 2)) err(where, 'match needs ≥ 2 pairs');
      if (b.kind === 'order' && !(b.steps?.length >= 3)) err(where, 'order needs ≥ 3 steps');
      if (b.kind === 'multi_select' && !(b.options?.some((o) => o.correct))) err(where, 'multi_select needs a correct option');
      if (b.kind === 'pick_cell') {
        const a = b.answer, t = b.tables?.find((x) => x.caption === a?.table);
        if (!t || !t.columns.includes(a.column) || !(a.row >= 0 && a.row < t.rows.length)) err(where, 'pick_cell answer does not point at a cell');
      }
      for (const r of b.rm_refs ?? []) checkRmRef(where, r);
    }

    if (b.type === 'check') {
      if (!(b.options?.filter((o) => o.correct).length === 1)) err(where, 'check needs exactly one correct option');
      if (!b.explain) err(where, 'check needs explain (shown after answering)');
    }

    if (b.type === 'demo') {
      // engine demo (e.g. the S12 index demo): a setup script + timed steps, run in the learner's browser
      if (!b.prompt || !b.script_file || !(b.steps?.length >= 2)) err(where, 'demo needs prompt, script_file and ≥ 2 steps');
      else {
        const file = path.join(RUNTIME, b.script_file);
        if (!fs.existsSync(file)) err(where, `demo script ${b.script_file} not found in content/case_db/runtime`);
        else {
          pub.script = fs.readFileSync(file, 'utf8');   // inline: the session site stays self-contained
          delete pub.script_file;
          const db = openSnapshot(src.snapshot);
          try { db.exec(pub.script); for (const st of b.steps) db.exec(st.sql); }
          catch (e) { err(where, `demo fails on the snapshot: ${e.message}`); }
          finally { db.close(); }
        }
      }
    }

    if (b.type === 'clue') {
      if (!b.clue_id) err(where, 'clue needs clue_id');
      clueDefs.set(b.clue_id, b);
    }

    if (b.type === 'task') {
      const tw = `${tag} ${b.task_id}`;
      if (!b.task_id || taskIds.has(b.task_id)) err(where, 'missing or duplicate task_id');
      taskIds.add(b.task_id);
      if (!b.ask || !b.ref) err(tw, 'task needs ask + ref');
      const g = b.grading ?? {};
      for (const h of b.hints ?? []) checkRmRef(tw, h.rm_ref);
      const h1 = (b.hints ?? []).find((h) => h.tier === 1);
      if (!h1 || !(h1.rm_ref || h1.text) || !(b.hints ?? []).some((h) => h.tier === 2)) err(tw, 'needs hint tier 1 (rm_ref, or text when the session has no reading material) and tier 2 (skeleton)');

      // feature audit (reference only — traps are allowed to be wrong)
      const bad = untaught(b.ref, S);
      if (bad.length) err(tw, `reference uses SQL not taught yet: ${bad.map((f) => `${f.id} (S${f.session === Infinity ? '—' : f.session})`).join(', ')}`);

      const ran = execute(src.snapshot, b.setup, b.ref, g.inspect);
      let expected_hash = null;
      if (ran.setupError) err(tw, `setup failed: ${ran.setupError}`);
      else if (ran.error) err(tw, `reference query failed: ${ran.error}`);
      else {
        const rows = ran.result?.values?.length ?? 0;
        if (!rows && !g.allow_empty) err(tw, 'reference returns no rows (set grading.allow_empty if intended)');
        if (g.expect_rows !== undefined && rows !== g.expect_rows) err(tw, `reference returns ${rows} rows, expect_rows ${g.expect_rows}`);
        expected_hash = await hashResult(ran.result, { ordered: !!g.ordered });
      }

      const pubTraps = [], solTraps = [];
      for (const t of b.traps ?? []) {
        const trw = `${tw} trap ${t.id}`;
        checkRmRef(trw, t.rm_ref);
        if (!t.reply) err(trw, 'trap needs reply');
        // optional: the learner's SQL must also match this pattern (tells apart traps with the same error)
        if (t.sql_regex && !new RegExp(t.sql_regex, 'i').test(t.sql)) err(trw, `trap sql does not match its own sql_regex /${t.sql_regex}/`);
        const sqlMatch = t.sql_regex ? { sql_regex: t.sql_regex } : {};
        const tr = execute(src.snapshot, b.setup, t.sql, t.inspect ?? g.inspect);
        if (t.match === 'error') {
          if (!tr.error) err(trw, 'expected an error, query ran');
          else if (!new RegExp(t.error_regex).test(tr.error)) err(trw, `error "${tr.error}" !~ /${t.error_regex}/`);
          pubTraps.push({ id: t.id, match: { error_regex: t.error_regex, ...sqlMatch }, reply: t.reply, rm_ref: t.rm_ref });
        } else if (t.match === 'result') {
          if (tr.error || tr.setupError) err(trw, `trap query failed: ${tr.error ?? tr.setupError}`);
          else {
            const h = await hashResult(tr.result, { ordered: !!g.ordered });
            if (h === expected_hash) err(trw, 'trap result equals the correct result');
            pubTraps.push({ id: t.id, match: { result_hash: h, ...(t.inspect ? { inspect: t.inspect } : {}), ...sqlMatch }, reply: t.reply, rm_ref: t.rm_ref });
          }
        } else err(trw, 'match must be "error" or "result"');
        solTraps.push({ id: t.id, sql: t.sql });
      }

      if (b.on_pass?.clue) referenced.add(`clue:${b.on_pass.clue}`);
      delete pub.ref;
      pub.grading = { ...g, expected_hash };
      pub.traps = pubTraps;
      pub.hints = [...(b.hints ?? []), { tier: 3, solution_ref: `solutions/s${String(S).padStart(2, '0')}.json#${b.task_id}` }];
      solutions[b.task_id] = { ref: b.ref, traps: solTraps };
    }
    pubBeats.push(pub);
  }

  // clue wiring
  for (const [id, c] of clueDefs) {
    if (c.requires_task && !taskIds.has(c.requires_task)) err(`${tag} ${c.id}`, `requires_task ${c.requires_task} not found`);
  }
  for (const b of src.beats) if (b.on_pass?.clue && !clueDefs.has(b.on_pass.clue)) err(`${tag} ${b.task_id}`, `on_pass clue ${b.on_pass.clue} has no clue beat`);
  for (const id of src.exit.required_clues ?? []) if (!clueDefs.has(id)) err(`${tag} exit`, `required clue ${id} not defined`);
  for (const id of src.exit.required_beats ?? []) if (!ids.has(id)) err(`${tag} exit`, `required beat ${id} not defined`);

  // coverage: every non-generic heading of every RM in this session is referenced somewhere
  const coverage = [];
  for (const unitId of sessionUnits) {
    const u = rmUnits.get(unitId);
    for (const [n, text] of u.headings) {
      if (GENERIC_HEADINGS.has(n)) continue;
      const ok = referenced.has(n);
      coverage.push({ rm: u.rm, heading: text, covered: ok });
      if (!ok) err(`${tag} coverage`, `RM #${u.rm} heading "${text}" is not referenced by any beat`);
    }
  }

  if (minutes > BUDGET_MINUTES) err(`${tag} budget`, `${minutes} min > ${BUDGET_MINUTES}`);
  if (src.est_minutes && Math.abs(src.est_minutes - minutes) > 10) warnings.push(`${tag}: est_minutes ${src.est_minutes} vs beat sum ${minutes}`);

  const pack = {
    generated_by: 'pipeline/build_sessions.mjs — do not edit; edit content/sessions/src instead',
    ...Object.fromEntries(Object.entries(src).filter(([k]) => !['beats', 'units'].includes(k) && !k.startsWith('x-'))),   // x-*: YAML anchors
    reading_materials: src.reading_materials.map((r) => ({ ...r, rm: rmUnits.get(r.unit_id)?.rm,
      learning_resource_id: rmUnits.get(r.unit_id)?.learning_resource_id })),
    minutes_estimate: minutes,
    premise: fill(CAST.premise),
    headline: fill('{{star}} is missing.'),
    // "the case so far": clues from earlier sessions (briefed if the learner hasn't earned them)
    previously: Object.entries(ALL_CLUES).filter(([n]) => Number(n) < S).sort(([a], [b]) => a - b).flatMap(([, c]) => c),
    // who speaks in this session (self-contained: a standalone session site needs nothing else)
    cast: Object.fromEntries([...new Set(['mentor', ...src.beats.map((b) => b.speaker).filter((x) => CAST.people[x])])]
      .map((k) => [k, { name: CAST.people[k].name, role: fill(CAST.people[k].role), initials: CAST.people[k].initials, color: CAST.people[k].color }])),
    beats: pubBeats,
  };
  // ---------------------------------------------------------------- units: one deployable pack per reading material
  // `units:` lists contiguous slices of the beats (`from`..`to`), one per primary RM, in order; a subset RM is
  // `same_as` a sliced one (an alias: same content, its own unit_id). The finale (no RM) is `{ finale: true }`.
  // Each unit may add an `opener` (scene) and a `closer` (hook) so it reads as a story on its own.
  const unitPacks = [];
  const unitCoverage = [];
  if (!Array.isArray(src.units) || !src.units.length) err(`${tag} units`, 'missing "units" (one slice per reading material)');
  else {
    const beatIndex = new Map(src.beats.map((b, i) => [b.id, i]));
    const slices = [];
    let cursor = 0;
    const unitsSeen = new Set();
    for (const u of src.units) {
      const uw = `${tag} units ${u.unit_id ?? (u.finale ? 'finale' : '?')}`;
      if (u.same_as) {
        if (!sessionUnits.has(u.unit_id)) err(uw, 'alias unit_id not in reading_materials');
        if (!src.units.some((x) => x.unit_id === u.same_as && x.from)) err(uw, `same_as ${u.same_as} is not a sliced unit of this session`);
        continue;
      }
      if (!u.finale && !sessionUnits.has(u.unit_id)) { err(uw, 'unit_id not in reading_materials'); continue; }
      if (u.finale && src.reading_materials.length) err(uw, 'finale unit only for a session without reading materials');
      if (unitsSeen.has(u.unit_id ?? 'finale')) err(uw, 'duplicate unit');
      unitsSeen.add(u.unit_id ?? 'finale');
      const a = beatIndex.get(u.from), z = beatIndex.get(u.to);
      if (a === undefined || z === undefined) { err(uw, `from/to beat not found (${u.from} → ${u.to})`); continue; }
      if (a !== cursor) err(uw, `slices must be contiguous and in order: expected from ${src.beats[cursor]?.id}, got ${u.from}`);
      if (z < a) err(uw, 'to before from');
      for (const k of ['opener', 'closer']) if (u[k] && (!u[k].body || (u[k].speaker && !SPEAKERS.includes(u[k].speaker)))) err(uw, `${k} needs body (+ known speaker)`);
      slices.push({ u, a, z });
      cursor = z + 1;
    }
    if (!errors.length && cursor !== src.beats.length) err(`${tag} units`, `slices end at ${src.beats[cursor - 1]?.id}, last beat is ${src.beats.at(-1).id}`);
    for (const id of sessionUnits) if (!src.units.some((x) => x.unit_id === id)) err(`${tag} units`, `RM #${rmUnits.get(id).rm} has no unit (slice it or mark it same_as another)`);

    if (!errors.length) {
      const parts = slices.length;
      const sessionClues = pubBeats.filter((b) => b.type === 'clue');
      const sliced = new Map();
      slices.forEach(({ u, a, z }, i) => {
        const rm = u.finale ? null : rmUnits.get(u.unit_id);
        const n = u.finale ? FINALE_UNIT : rm.rm;
        const body = pubBeats.slice(a, z + 1);
        const opener = u.opener ? [{ id: `U${n}.open`, type: 'scene', speaker: u.opener.speaker ?? 'mentor', body: u.opener.body }] : [];
        const closer = u.closer ? [{ id: `U${n}.close`, type: 'hook', speaker: u.closer.speaker ?? 'mentor', body: u.closer.body }] : [];
        const beats = [...opener, ...body, ...closer];
        const ids = new Set(beats.map((b) => b.id));
        const clueIds = new Set(body.filter((b) => b.type === 'clue').map((b) => b.clue_id));
        const earlierHere = sessionClues.filter((c) => beatIndex.get(c.id) < a).map((c) => ({ session: S, clue_id: c.clue_id, title: c.title, body: c.body }));
        const minutes = beats.reduce((m, b) => m + (b.minutes ?? DEFAULT_MINUTES[b.type]), 0);
        const unitPack = {
          ...pack,
          unit: { n, unit_id: u.finale ? src.course_topic_id : u.unit_id, learning_resource_id: rm?.learning_resource_id ?? null,
            title: u.finale ? pack.title : rm.title, part: i + 1, parts, finale: !!u.finale },
          minutes_estimate: minutes,
          exit: { required_clues: (src.exit.required_clues ?? []).filter((c) => clueIds.has(c)),
            required_beats: (src.exit.required_beats ?? []).filter((id) => ids.has(id)) },
          previously: [...pack.previously, ...earlierHere],
          beats,
        };
        unitPacks.push(unitPack);
        sliced.set(u.unit_id, unitPack);
        // per-unit coverage: a learner who plays only this unit should meet every concept of its RM
        if (rm) {
          const seen = new Set();
          const take = (r) => { if (r && r.unit_id === u.unit_id) seen.add(norm(r.heading)); };
          for (const b of body) {
            take(b.rm_ref); for (const r of b.see_also ?? []) take(r); for (const r of b.rm_refs ?? []) take(r);
            if (b.type === 'task') { for (const h of b.hints ?? []) take(h.rm_ref); for (const t of b.traps ?? []) take(t.rm_ref); }
          }
          for (const [k, text] of rm.headings) {
            if (GENERIC_HEADINGS.has(k)) continue;
            unitCoverage.push({ unit: n, rm: rm.rm, heading: text, covered: seen.has(k) });
            if (!seen.has(k)) warnings.push(`${tag} unit u${String(n).padStart(2, '0')} (RM #${rm.rm}): heading "${text}" is only covered elsewhere in the session`);
          }
        }
      });
      for (const u of src.units.filter((x) => x.same_as)) {
        const base = sliced.get(u.same_as), rm = rmUnits.get(u.unit_id);
        unitPacks.push({ ...base, unit: { ...base.unit, n: rm.rm, unit_id: u.unit_id, learning_resource_id: rm.learning_resource_id, title: rm.title, same_as: base.unit.unit_id } });
      }
    }
  }

  return { errors, warnings, pack, solutions, coverage, minutes, S, unitPacks, unitCoverage };
}

// ---------------------------------------------------------------------------
fs.mkdirSync(SOLUTIONS, { recursive: true });
fs.mkdirSync(UNITS_OUT, { recursive: true });
const ALL_CLUES = cluesBySession();
const unitIndexFile = path.join(UNITS_OUT, 'index.json');
const unitIndex = fs.existsSync(unitIndexFile) ? JSON.parse(fs.readFileSync(unitIndexFile, 'utf8')) : [];
const files = fs.readdirSync(SRC).filter((f) => /^s\d\d\.yaml$/.test(f)).sort()
  .filter((f) => only === null || Number(f.slice(1, 3)) === only);
let failed = false;
const coverageReport = fs.existsSync(path.join(OUT, 'coverage.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'coverage.json'), 'utf8')) : {};

for (const f of files) {
  const r = await buildSession(path.join(SRC, f));
  const name = f.replace('.yaml', '');
  for (const w of r.warnings) console.log(`warn ${w}`);
  if (r.errors.length) {
    failed = true;
    console.log(`FAIL ${name}`);
    for (const e of r.errors) console.log(`  - ${e}`);
    continue;
  }
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(r.pack, null, 2) + '\n');
  fs.writeFileSync(path.join(SOLUTIONS, `${name}.json`), JSON.stringify(r.solutions, null, 2) + '\n');
  coverageReport[name] = r.coverage;
  coverageReport[`${name}.units`] = r.unitCoverage;
  const tasks = Object.keys(r.solutions).length;
  console.log(`ok   ${name}  beats ${r.pack.beats.length}  tasks ${tasks}  ~${r.minutes} min  RM headings covered ${r.coverage.length}/${r.coverage.length}`);
  for (const u of r.unitPacks) {
    const id = `u${String(u.unit.n).padStart(2, '0')}`;
    fs.writeFileSync(path.join(UNITS_OUT, `${id}.json`), JSON.stringify(u, null, 2) + '\n');
    const entry = { n: u.unit.n, id, unit_id: u.unit.unit_id, learning_resource_id: u.unit.learning_resource_id, topic_id: u.course_topic_id,
      title: u.unit.title, session: u.session, session_title: u.title, part: u.unit.part, parts: u.unit.parts, minutes: Math.round(u.minutes_estimate),
      beats: u.beats.length, tasks: u.beats.filter((b) => b.type === 'task').length, clues: u.beats.filter((b) => b.type === 'clue').length,
      ...(u.unit.same_as ? { same_as: u.unit.same_as } : {}), ...(u.unit.finale ? { finale: true } : {}) };
    const at = unitIndex.findIndex((e) => e.n === u.unit.n);
    if (at >= 0) unitIndex[at] = entry; else unitIndex.push(entry);
    console.log(`     ${id}  part ${u.unit.part}/${u.unit.parts}  ${u.unit.title}${u.unit.same_as ? ' (alias)' : ''}  beats ${u.beats.length}  ~${u.minutes_estimate} min`);
  }
}
fs.writeFileSync(path.join(OUT, 'coverage.json'), JSON.stringify(coverageReport, null, 2) + '\n');
unitIndex.sort((a, b) => a.n - b.n);
fs.writeFileSync(unitIndexFile, JSON.stringify(unitIndex, null, 2) + '\n');
process.exit(failed ? 1 : 0);
