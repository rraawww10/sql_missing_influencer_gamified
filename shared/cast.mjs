// {{placeholder}} filling from content/story/cast.json — used for session text, reference SQL and checks.
//   {{star}} → full name   {{star.first}} / {{star.last}} / {{star.role}} / {{manager.login}} (first initial + surname)   {{hotel}} / {{suv}} (places, plates, handles)
//   add |lower for lower case: {{star.first|lower}}
// Unknown placeholders throw, so a typo can never reach learners.

const RE = /\{\{\s*(\w+)(?:\.(\w+))?(?:\|(\w+))?\s*\}\}/g;

export function makeFill(cast) {
  const people = cast.people ?? {};
  const flat = { ...(cast.places ?? {}), ...(cast.plates ?? {}), ...(cast.handles ?? {}) };
  for (const [k, v] of Object.entries({ ...flat, ...Object.fromEntries(Object.entries(people).map(([k, p]) => [k, p.name])) })) {
    if (String(v).includes("'")) throw new Error(`cast value for "${k}" contains an apostrophe — it would break SQL strings`);
  }
  return function fill(text) {
    return text.replace(RE, (m, key, field, filter) => {
      let v;
      if (people[key]) {
        const p = people[key];
        v = field === undefined ? p.name : field === 'first' ? p.first : field === 'last' ? p.name.split(' ').at(-1)
          : field === 'role' ? p.role : field === 'initials' ? p.initials
          : field === 'login' ? (p.first[0] + p.name.split(' ').at(-1)).toLowerCase() : undefined;   // e.g. darora
      } else if (key in flat && field === undefined) v = flat[key];
      if (v === undefined) throw new Error(`unknown placeholder ${m}`);
      if (filter === 'lower') v = v.toLowerCase();
      else if (filter) throw new Error(`unknown filter in ${m}`);
      return v;
    });
  };
}

// Fill every string inside a JSON-like value
export function fillDeep(value, fill) {
  if (typeof value === 'string') return fill(value);
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, fill));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillDeep(v, fill)]));
  return value;
}
