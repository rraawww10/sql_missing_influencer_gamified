import { describe, expect, it } from 'vitest';
import { extractSection } from './caseNotes';

const md = `# Title
intro
## Precedence
NOT, AND, OR
\`\`\`sql
# not a heading
\`\`\`
### Example
nested stays
## Next
gone`;

describe('extractSection', () => {
  it('returns the section up to the next heading of the same level', () => {
    const s = extractSection(md, 'Precedence')!;
    expect(s).toContain('NOT, AND, OR');
    expect(s).toContain('# not a heading');
    expect(s).toContain('nested stays');
    expect(s).not.toContain('gone');
  });
  it('matches headings loosely (case, ! and :)', () => {
    expect(extractSection('## Try it Yourself!\nx', 'try it yourself')).toBe('## Try it Yourself!\nx');
    expect(extractSection(md, 'Missing')).toBeNull();
  });
});
