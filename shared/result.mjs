// Result normalisation + hashing shared by the content pipeline and the game's grader.
// Works in Node 20+ and browsers (Web Crypto). Keep this file dependency-free.
//
// Rules (also documented in docs/IMPLEMENTATION_PLAN.md §4.2):
//   - column NAMES are ignored, column COUNT matters
//   - integers stay as-is; non-integers are rounded to 6 decimal places
//   - strings are trimmed; NULL stays null
//   - unordered results are compared as a multiset (rows sorted by their JSON form)

export function normaliseValue(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : Math.round(v * 1e6) / 1e6;
  if (typeof v === 'string') return v.trim();
  if (v instanceof Uint8Array) return `blob:${Array.from(v).join(',')}`;
  return v ?? null;
}

// `result` is one sql.js exec() entry ({ columns, values }) or undefined for statements with no rows
export function normaliseResult(result, { ordered = false } = {}) {
  const columns = result?.columns?.length ?? 0;
  const rows = (result?.values ?? []).map((row) => row.map(normaliseValue));
  if (!ordered) rows.sort((a, b) => {
    const x = JSON.stringify(a), y = JSON.stringify(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return { columns, rows };
}

export async function hashResult(result, opts) {
  const text = JSON.stringify(normaliseResult(result, opts));
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return 'sha256:' + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
