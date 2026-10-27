"""Clue audit (run after build_sessions): for every clue in every session, print the task that unlocks it (ask + reference SQL),
result of that SQL on the session snapshot, the beats just before, and the clue text. Flags clues whose facts
(numbers/times/words) do not appear in the result."""
import json, re, shutil, sqlite3, sys, tempfile, os

# Windows consoles default to cp1252, which cannot print the arrows and dashes below — force UTF-8 on stdout/stderr.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'content')
only = [int(a) for a in sys.argv[1:]] or range(1, 14)

def run(snapshot, setup, sql):
    tmp = tempfile.mktemp(suffix='.sqlite')
    shutil.copy(f'{ROOT}/case_db/snapshots/{snapshot}.sqlite', tmp)
    con = sqlite3.connect(tmp)
    try:
        for s in setup or []:
            con.executescript(s)
        cur = con.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
        rows = cur.fetchall()
        return cols, rows
    except Exception as e:
        return [], [('ERROR', str(e))]
    finally:
        con.close(); os.unlink(tmp)

def short(s, n=160):
    s = ' '.join(s.split())
    return s if len(s) <= n else s[:n] + '…'

# Facts may also come from earlier PINNED clues (cited by id) — collect every clue body of earlier sessions
earlier = ''
for m in range(1, min(only) if only else 1):
    earlier += ' '.join(b['body'] for b in json.load(open(f'{ROOT}/sessions/s{m:02d}.json', encoding='utf-8'))['beats'] if b['type'] == 'clue') + ' '

flags = 0
for n in only:
    pack = json.load(open(f'{ROOT}/sessions/s{n:02d}.json', encoding='utf-8'))
    sol = json.load(open(f'{ROOT}/sessions/solutions/s{n:02d}.json', encoding='utf-8'))
    beats = pack['beats']
    print(f"\n{'='*100}\nS{n} · {pack['title']}  snapshot={pack['snapshot']}")
    seen = earlier   # + results and clue cards the learner has already seen in THIS session
    for i, b in enumerate(beats):
        if b['type'] == 'task':
            cols, rows = run(pack['snapshot'], b.get('setup'), sol[b['task_id']]['ref'])
            seen += ' ' + ' '.join(str(v) for r in rows for v in r) + ' ' + b['ask']
        if b['type'] != 'clue':
            continue
        seen += ' ' + b['body']
        task = next((t for t in beats if t['type'] == 'task' and (t.get('on_pass') or {}).get('clue') == b['clue_id']), None)
        print(f"\n--- CLUE {b['clue_id']} (beat {b['id']}, #{i+1}): {b['title']}")
        print('    text:', short(b['body'], 300))
        # context: 3 beats before the clue
        for c in beats[max(0, i-3):i]:
            kind = c['type'] + (f"/{c.get('kind')}" if c.get('kind') else '')
            txt = c.get('body') or c.get('ask') or c.get('prompt') or ''
            print(f"    ← {c['id']} {kind} [{c.get('speaker','')}] {short(txt, 140)}")
        if not task:
            print('    !! NO TASK unlocks this clue (requires_task =', b.get('requires_task'), ')')
            continue
        ref = sol[task['task_id']]['ref']
        print(f"    TASK {task['task_id']} ({task['id']}): {short(task['ask'], 200)}")
        print('    SQL:', short(ref, 200))
        cols, rows = run(pack['snapshot'], task.get('setup'), ref)
        print(f"    RESULT {len(rows)} rows · cols: {cols}")
        for r in rows[:4]:
            print('      ', r)
        if task.get('reply_on_pass'):
            print('    reply_on_pass:', short(task['reply_on_pass'], 200))
        # crude fact check: tokens in clue text that look like times/numbers/plates/ids must appear in the result
        flat = ' '.join(str(v) for r in rows for v in r) + ' ' + ' '.join(cols) + ' ' + task['ask'] + ' ' + seen
        facts = set(re.findall(r"\b\d{1,2}:\d{2}(?::\d{2})?\b|\b\d{2} BH \d{4} [A-Z]{2}\b|\b[A-Z]{2,4}-\d+\b|₹\s?[\d,]+", b['body']))
        missing = [f for f in facts if f.replace('₹', '').replace(',', '').strip() not in flat.replace(',', '')]
        if missing:
            flags += 1
            print('    ?? facts in clue not visible in this result, an earlier result, or an earlier clue:', missing)
    earlier += ' '.join(b['body'] for b in beats if b['type'] == 'clue') + ' '
print(f"\n{'='*100}\n{flags} clue(s) flagged")
sys.exit(1 if flags else 0)
