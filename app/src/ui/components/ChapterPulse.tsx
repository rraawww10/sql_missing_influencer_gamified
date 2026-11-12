// The quick check-in after every chapter (between the full feedback cards on the solved screens): one tap on how that
// chapter felt, plus an optional suggestion. Asked once per chapter per student; skippable; never blocks the game.
// Stored on the analytics server (POST /api/checkpoint) → dashboard Feedback tab and the student's own page.
import { useEffect, useState } from 'react';
import { useServices } from '../services';
import { checkpointGiven, sendCheckpoint, skipCheckpoint, type Checkpoint } from '../feedback';
import { personalize } from '../../adapters/identity';

const FACES: [Checkpoint['rating'], string, string][] = [[1, '😕', 'Lost'], [2, '😐', 'Okay'], [3, '🙂', 'Good'], [4, '🤩', 'Great']];

export function ChapterPulse({ session, chapter, of }: { session: number; chapter: number; of: number }) {
  const { auth } = useServices();
  const [user, setUser] = useState<string | null>(null);
  const [rating, setRating] = useState<Checkpoint['rating'] | null>(null);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'ask' | 'sent' | 'hidden'>('ask');
  useEffect(() => { auth.currentUser().then((u) => { setUser(u.id); if (checkpointGiven(u.id, session, chapter)) setState('hidden'); }); }, [auth, session, chapter]);
  if (!user || state === 'hidden') return null;
  if (state === 'sent') return <div className="pulse sent" role="status">✅ {personalize('Thanks, {you}! Noted for the team.')}</div>;
  const send = () => {
    if (!rating) return;
    void sendCheckpoint({ user_id: user, session, chapter, rating, comment: comment.trim().slice(0, 1000) || undefined, client_ts: new Date().toISOString() });
    setState('sent');
  };
  return (
    <div className="pulse" role="group" aria-label={`How was chapter ${chapter} of ${of}?`}>
      <span className="pulse-q">How was chapter {chapter}?</span>
      <span className="pulse-faces">
        {FACES.map(([n, e, l]) => <button key={n} className={rating === n ? 'on' : ''} aria-pressed={rating === n} onClick={() => setRating(n)} title={l}>{e}<small>{l}</small></button>)}
      </span>
      {rating && <input className="pulse-text" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000}
        placeholder="Any suggestion? (optional)" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') send(); }} aria-label="Your suggestion (optional)" />}
      <span className="pulse-actions">
        <button className="btn small primary" disabled={!rating} onClick={send}>Send</button>
        <button className="btn small ghost" onClick={() => { skipCheckpoint(user, session, chapter); setState('hidden'); }}>Skip</button>
      </span>
    </div>
  );
}
