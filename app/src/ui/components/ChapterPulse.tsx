// The quick check-in after every chapter (between the full feedback cards on the solved screens): one tap on how that
// chapter felt, plus an optional suggestion. Asked once per chapter per student; no Skip button (2026-11-17), but it never blocks the game.
// Stored on the analytics server (POST /api/checkpoint) → dashboard Feedback tab and the student's own page.
import { useEffect, useState } from 'react';
import { useServices } from '../services';
import { checkpointGiven, sendCheckpoint, type Checkpoint } from '../feedback';
import { personalize } from '../../adapters/identity';
import { Icon, Face, type FaceMood } from '../design/Icon';

const FACES: [Checkpoint['rating'], FaceMood, string][] = [[1, 'confused', 'Lost'], [2, 'ok', 'Okay'], [3, 'good', 'Good'], [4, 'love', 'Great']];

export function ChapterPulse({ session, chapter, of }: { session: number; chapter: number; of: number }) {
  const { auth } = useServices();
  const [user, setUser] = useState<string | null>(null);
  const [rating, setRating] = useState<Checkpoint['rating'] | null>(null);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'ask' | 'sent' | 'hidden'>('ask');
  useEffect(() => { auth.currentUser().then((u) => { setUser(u.id); if (checkpointGiven(u.id, session, chapter)) setState('hidden'); }); }, [auth, session, chapter]);
  if (!user || state === 'hidden') return null;
  if (state === 'sent') return <div className="surface pulse sent" role="status"><Icon name="ok" /> {personalize('Thanks, {you}! Noted for the team.')}</div>;
  const send = () => {
    if (!rating) return;
    void sendCheckpoint({ user_id: user, session, chapter, rating, comment: comment.trim().slice(0, 1000) || undefined, client_ts: new Date().toISOString() });
    setState('sent');
  };
  return (
    <div className="surface pulse" role="group" aria-label={`How was chapter ${chapter} of ${of}?`}>
      <span className="pulse-q">How was chapter {chapter}?</span>
      <span className="pulse-faces">
        {FACES.map(([n, e, l]) => <button key={n} className={rating === n ? 'on' : ''} aria-pressed={rating === n} onClick={() => setRating(n)} title={l}><Face mood={e} /><small>{l}</small></button>)}
      </span>
      {rating && <input className="pulse-text" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000}
        placeholder="Any suggestion? (optional)" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') send(); }} aria-label="Your suggestion (optional)" />}
      <span className="pulse-actions">
        <button className="btn small pop" disabled={!rating} onClick={send}>Send</button>
      </span>
    </div>
  );
}
