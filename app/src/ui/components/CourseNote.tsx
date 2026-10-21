// The exact reading-material sections a Case Note is based on (shown in a side sheet).
import { useEffect, useState } from 'react';
import type { RmRef } from '../../content/types';
import { extractSection } from '../../content/caseNotes';
import { useServices } from '../services';
import { Markdown } from './Markdown';

export function CourseNote({ refs }: { refs: RmRef[] }) {
  const { loader } = useServices();
  const [sections, setSections] = useState<{ title: string; md: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = refs.map((r) => `${r.unit_id}#${r.heading}`).join('|');
  useEffect(() => {
    let alive = true;
    setFailed(false);
    loader.caseNotes().then((notes) => alive && setSections(refs.map((r) => ({
      title: notes[r.unit_id]?.title ?? '', md: extractSection(notes[r.unit_id]?.markdown ?? '', r.heading) ?? '',
    })))).catch(() => alive && setFailed(true));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader, key, attempt]);
  if (failed) return <p>Couldn’t load the course note. <button className="btn small" onClick={() => setAttempt((a) => a + 1)}>Try again</button></p>;
  if (!sections) return <p className="muted">Loading…</p>;
  return (
    <div className="course-note">
      {sections.map((s, i) => (
        <section key={i} className="hint-card">
          <div className="tier">{s.title}</div>
          <Markdown source={s.md} />
        </section>
      ))}
    </div>
  );
}
