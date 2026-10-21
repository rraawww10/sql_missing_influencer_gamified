// Shared helpers for the browser smoke tests. `f` is a Playwright Page or Frame (both work).
export const stepOf = async (f) => Number((await f.getByText(/^Step \d+\/\d+$/).innerText()).match(/Step (\d+)/)[1]);

export async function cont(f) {
  const before = await stepOf(f).catch(() => null);
  await f.getByRole('button', { name: /Continue →|Finish episode ✓|Finish this part ✓/ }).last().click();   // tasks show two (verdict + bottom)
  if (before !== null) await f.waitForFunction((b) => {
    const m = document.body.innerText.match(/Step (\d+)\//);
    return !m || Number(m[1]) !== b;
  }, before);
}

export async function answerActivity(f, b) {
  if (b.kind === 'sort_into') for (const it of b.items) {
    await f.getByRole('button', { name: it.text, exact: true }).click();
    await f.getByRole('button', { name: `Put in ${it.bucket}` }).click();
  }
  if (b.kind === 'match') for (const [i, p] of b.pairs.entries()) await f.getByLabel(`Match for item ${i + 1}`).selectOption({ label: p.right });
  if (b.kind === 'order') for (let i = 0; i < b.steps.length; i++) {
    for (;;) {
      const items = await f.locator('.order-item span:nth-child(2)').allInnerTexts();
      if (items.indexOf(b.steps[i]) <= i) break;
      await f.getByRole('button', { name: `Move "${b.steps[i]}" up` }).click();
    }
  }
  if (b.kind === 'pick_cell') {
    const t = b.tables.find((x) => x.caption === b.answer.table);
    const v = t.rows[b.answer.row][t.columns.indexOf(b.answer.column)];
    await f.getByRole('button', { name: `${b.answer.table}, row ${b.answer.row + 1}, ${b.answer.column}: ${v}` }).click();
  }
  if (b.kind === 'multi_select') for (const o of b.options.filter((x) => x.correct)) await f.getByRole('button', { name: o.text }).click();
  await f.getByRole('button', { name: 'Check', exact: true }).click();
  await f.getByText('✓ Well done.').waitFor();
}

export async function runSql(f, sql) {
  await f.locator('.cm-content').fill(sql);
  await f.getByRole('button', { name: 'Run ▶' }).click();
}

// Plays the current session from its first step to "solved". hooks.beforeBeat(b, i) can add extra checks.
export async function playBeats(f, pack, solutions, hooks = {}) {
  for (;;) {
    const i = (await stepOf(f)) - 1;
    const b = pack.beats[i];
    await hooks.beforeBeat?.(b, i);
    if (b.type === 'activity') await answerActivity(f, b);
    if (b.type === 'check') {
      await f.locator('.choices button').nth(b.options.findIndex((o) => o.correct)).click();
      await f.getByText('✓ Right.').waitFor();
    }
    if (b.type === 'clue') await f.getByRole('button', { name: '📌 Pin to Evidence Board' }).click();
    if (b.type === 'demo') {
      await f.getByRole('button', { name: 'Run the demo ▶' }).click();
      await f.getByText(/faster with the index/).waitFor({ timeout: 30000 });
    }
    if (b.type === 'task') {
      await hooks.beforeTask?.(b);
      await runSql(f, solutions[b.task_id].ref);
      await f.getByText('✓ Correct.').waitFor({ timeout: 10000 });
    }
    const last = i === pack.beats.length - 1;
    await cont(f);
    if (last) return;
  }
}
