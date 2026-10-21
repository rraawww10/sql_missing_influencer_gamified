// Which SQL features a query uses, and in which session the course (reading materials) teaches them.
// Shared by the content pipeline (reference-query audit) and the game (gentle "not taught yet" nudge).
// Session numbers follow docs/SESSION_PLAN.md Appendix A.

export const FEATURES = [
  // S2 — RM #3–#9
  { id: 'CREATE TABLE', session: 2, re: /\bCREATE\s+TABLE\b/ },
  { id: 'PRAGMA', session: 2, re: /\bPRAGMA\b/ },
  { id: 'INSERT', session: 2, re: /\bINSERT\s+INTO\b/ },
  { id: 'SELECT', session: 2, re: /\bSELECT\b/ },
  { id: 'WHERE', session: 2, re: /\bWHERE\b/ },
  { id: '=', session: 2, re: /(?<![<>!=])=(?!=)/ },
  { id: 'UPDATE', session: 2, re: /\bUPDATE\b/ },
  { id: 'DELETE', session: 2, re: /\bDELETE\s+FROM\b/ },
  { id: 'DROP TABLE', session: 2, re: /\bDROP\s+TABLE\b/ },
  { id: 'ALTER TABLE', session: 2, re: /\bALTER\s+TABLE\b/ },
  // S3 — RM #10–#12
  { id: '<>', session: 3, re: /<>/ },
  { id: '< > <= >=', session: 3, re: /<=|>=|<(?!>)|(?<!<)>/ },
  { id: 'LIKE', session: 3, re: /\bLIKE\b/ },
  { id: 'AND', session: 3, re: /\bAND\b/ },
  { id: 'OR', session: 3, re: /\bOR\b/ },
  { id: 'NOT', session: 3, re: /\bNOT\b/ },
  // S4 — RM #13–#15
  { id: 'IN', session: 4, re: /\bIN\s*\(/ },
  { id: 'BETWEEN', session: 4, re: /\bBETWEEN\b/ },
  { id: 'ORDER BY', session: 4, re: /\bORDER\s+BY\b/ },
  { id: 'DISTINCT', session: 4, re: /\bDISTINCT\b/ },
  { id: 'LIMIT', session: 4, re: /\bLIMIT\b/ },
  { id: 'OFFSET', session: 4, re: /\bOFFSET\b/ },
  // S5 — RM #16–#17
  { id: 'aggregate functions', session: 5, re: /\b(COUNT|SUM|MIN|MAX|AVG)\s*\(/ },
  { id: 'AS (alias)', session: 5, re: /\bAS\b/ },
  { id: 'GROUP BY', session: 5, re: /\bGROUP\s+BY\b/ },
  // S6 — RM #18
  { id: 'HAVING', session: 6, re: /\bHAVING\b/ },
  // S7 — RM #19–#22
  { id: 'arithmetic + - * / %', session: 7, re: /[+\-/%]|\w\s*\*\s*\w/ },
  { id: '|| (concatenate)', session: 7, re: /\|\|/ },
  { id: 'strftime', session: 7, re: /\bSTRFTIME\s*\(/ },
  { id: 'CAST', session: 7, re: /\bCAST\s*\(/ },
  { id: 'FLOOR / CEIL / ROUND', session: 7, re: /\b(FLOOR|CEIL|ROUND)\s*\(/ },
  { id: 'UPPER / LOWER', session: 7, re: /\b(UPPER|LOWER)\s*\(/ },
  // S8 — RM #23–#25
  { id: 'CASE', session: 8, re: /\bCASE\b/ },
  { id: 'INTERSECT', session: 8, re: /\bINTERSECT\b/ },
  { id: 'EXCEPT', session: 8, re: /\bEXCEPT\b/ },
  { id: 'UNION', session: 8, re: /\bUNION\b/ },
  // S9 — RM #26–#30
  { id: 'PRIMARY KEY', session: 9, re: /\bPRIMARY\s+KEY\b/ },
  { id: 'FOREIGN KEY', session: 9, re: /\bFOREIGN\s+KEY\b|\bREFERENCES\b/ },
  { id: 'ON DELETE CASCADE', session: 9, re: /\bON\s+DELETE\s+CASCADE\b/ },
  { id: 'JOIN … ON', session: 9, re: /\bJOIN\b/ },
  // S10 — RM #31
  { id: 'NATURAL JOIN', session: 10, re: /\bNATURAL\s+JOIN\b/ },
  { id: 'INNER JOIN', session: 10, re: /\bINNER\s+JOIN\b/ },
  { id: 'LEFT JOIN', session: 10, re: /\bLEFT\s+(OUTER\s+)?JOIN\b/ },
  { id: 'IS NULL', session: 10, re: /\bIS\s+(NOT\s+)?NULL\b/ },
  // S11 — RM #32–#33
  { id: 'RIGHT JOIN', session: 11, re: /\bRIGHT\s+(OUTER\s+)?JOIN\b/ },
  { id: 'FULL JOIN', session: 11, re: /\bFULL\s+(OUTER\s+)?JOIN\b/ },
  { id: 'CROSS JOIN', session: 11, re: /\bCROSS\s+JOIN\b/ },
  // S12 — RM #35–#36
  { id: 'CREATE VIEW', session: 12, re: /\bCREATE\s+VIEW\b/ },
  { id: 'DROP VIEW', session: 12, re: /\bDROP\s+VIEW\b/ },
  { id: 'subquery', session: 12, re: /\(\s*SELECT\b/ },
  { id: 'sqlite_master', session: 12, re: /\bSQLITE_MASTER\b/ },
];

// Functions the course teaches; any other `name(` call is reported as untaught.
const KNOWN_FUNCTIONS = new Set(['COUNT', 'SUM', 'MIN', 'MAX', 'AVG', 'STRFTIME', 'CAST', 'FLOOR', 'CEIL', 'ROUND',
  'UPPER', 'LOWER', 'TABLE_INFO']);
// Words that may be followed by "(" without being a function call
const NOT_CALLS = new Set(['VALUES', 'IN', 'KEY', 'VARCHAR', 'FROM', 'JOIN', 'ON', 'AND', 'OR', 'NOT', 'WHERE',
  'HAVING', 'AS', 'SELECT', 'THEN', 'ELSE', 'WHEN', 'BY', 'UNION', 'INTERSECT', 'EXCEPT', 'ALL', 'EXISTS']);
const NAME_BEFORE_PAREN = new Set(['INTO', 'TABLE', 'REFERENCES', 'EXISTS']);   // "INTO t(", "TABLE t ("

// Remove string literals and comments, upper-case the rest; drop "*" used as "all columns".
export function strip(sql) {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, "''")
    .toUpperCase()
    .replace(/\bSELECT\s+(DISTINCT\s+)?\*/g, 'SELECT $1')
    .replace(/\(\s*\*\s*\)/g, '()')
    .replace(/(\w)\.\*/g, '$1');
}

export function featuresUsed(sql) {
  const s = strip(sql);
  const used = FEATURES.filter((f) => f.re.test(s)).map((f) => ({ id: f.id, session: f.session }));
  const tokens = s.match(/[A-Z_][A-Z0-9_]*|\(|[^\sA-Z0-9_(]/g) ?? [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (tokens[i + 1] !== '(' || !/^[A-Z_]/.test(t)) continue;
    if (KNOWN_FUNCTIONS.has(t) || NOT_CALLS.has(t) || NAME_BEFORE_PAREN.has(tokens[i - 1])) continue;
    used.push({ id: `function ${t}()`, session: Infinity });   // never taught
  }
  return used;
}

// Features used before the session that teaches them
export function untaught(sql, session) {
  return featuresUsed(sql).filter((f) => f.session > session);
}
