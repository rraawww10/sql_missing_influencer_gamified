// "How was this episode?" - one short card on the solved screen. Skippable, asked once per episode per student.
import { useEffect, useState } from 'react';
import { useServices } from '../services';
import { feedbackGiven, sendFeedback, type Feedback } from '../feedback';
import { soundOn, sfx } from '../sound';
import { Kaal } from '../kaal/Kaal';

const MOODS = [['🤩', 'Loved it'], ['😀', 'Fun'], ['😐', 'Okay'], ['😕', 'Confusing'], ['😴', 'Boring']] as const;
const LIKED = ['The story', 'Inspector Kaal', 'SQL tasks', 'Case Notes', 'Puzzles', 'Sounds', 'The look'];

export function FeedbackCard({ session }: { session: number }) {
  const { auth } = useServices();
  const [user, setUser] = useState<string | null>(null);
  const [state, setState] = useState<'ask' | 'sent' | 'hidden'>('ask');
  const [rating, setRating] = useState(0);
  const [mood, setMood] = useState<string>();
  const [difficulty, setDifficulty] = useState<Feedback['difficulty']>();
  const [liked, setLiked] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  useEffect(() => { auth.currentUser().then((u) => { setUser(u.id); if (feedbackGiven(u.id, session)) setState('hidden'); }); }, [auth, session]);
  if (!user || state === 'hidden') return null;
  if (state === 'sent') return (
    <section className="feedback-card pop-in" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      <Kaal mood="happy" size={50} /><div><h3>Noted, partner. Thank you!</h3><p className="muted small" style={{ margin: 0 }}>Your feedback goes straight to the team that builds this case.</p></div>
    </section>
  );
  const submit = async () => {
    await sendFeedback({ user_id: user, session, rating, mood, difficulty, liked, comment: comment.trim().slice(0, 1000) || undefined, sound_on: soundOn(), client_ts: new Date().toISOString() });
    sfx('stamp'); setState('sent');
  };
  const toggle = (x: string) => setLiked((l) => l.includes(x) ? l.filter((y) => y !== x) : [...l, x]);
  return (
    <section className="feedback-card rise" aria-label="Episode feedback">
      <h3>How was this episode?</h3>
      <p className="muted small" style={{ margin: 0 }}>30 seconds. It helps us make the next case better.</p>
      <div className="stars" role="radiogroup" aria-label="Rating out of 5">
        {[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>⭐</button>)}
      </div>
      <span className="lbl">How did it feel?</span>
      <div className="opts">{MOODS.map(([e, l]) => <button key={l} className={mood === l ? 'on' : ''} aria-pressed={mood === l} onClick={() => setMood(l)}>{e} {l}</button>)}</div>
      <span className="lbl">The SQL was…</span>
      <div className="opts">{(['easy', 'right', 'hard'] as const).map((d) => <button key={d} className={difficulty === d ? 'on' : ''} aria-pressed={difficulty === d} onClick={() => setDifficulty(d)}>{d === 'easy' ? '🟢 Too easy' : d === 'right' ? '🟡 Just right' : '🔴 Too hard'}</button>)}</div>
      <span className="lbl">What did you like? (pick any)</span>
      <div className="opts">{LIKED.map((x) => <button key={x} className={liked.includes(x) ? 'on' : ''} aria-pressed={liked.includes(x)} onClick={() => toggle(x)}>{x}</button>)}</div>
      <span className="lbl">Anything else? (optional)</span>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="What confused you, what you loved, what to change…" />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={!rating} onClick={submit}>Send feedback</button>
        <button className="btn ghost small" onClick={() => setState('hidden')}>Skip</button>
        {!rating && <span className="muted small">Pick a star rating to send</span>}
      </div>
    </section>
  );
}
