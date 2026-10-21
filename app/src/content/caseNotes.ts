// Pulls one section out of a reading material's markdown, by heading — used for Case Notes
// and hint tier 1. The reading material itself is never modified.
const norm = (h: string) => h.toLowerCase().replace(/[*_`!:]/g, '').replace(/\s+/g, ' ').trim();
const HEADING = /^(#{1,6})\s*(.+?)\s*#*\s*$/;

export function extractSection(markdown: string, heading: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const target = norm(heading);
  let inFence = false, start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = HEADING.exec(line);
    if (!m) continue;
    if (start === -1) {
      if (norm(m[2]) === target) { start = i; level = m[1].length; }
    } else if (m[1].length <= level) {
      return lines.slice(start, i).join('\n').trim();
    }
  }
  return start === -1 ? null : lines.slice(start).join('\n').trim();
}
