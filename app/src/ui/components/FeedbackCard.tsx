// "How was this episode?" - one short card on the solved screen. REQUIRED: the solved screen's next buttons unlock only after it is sent
// (or if it was already given). Asked once per episode per student. onDone fires when it is sent / already given.
import { useEffect, useState } from 'react';
import { useServices } from '../services';
import { LADDER, feedbackGiven, sendFeedback, type Feedback } from '../feedback';
import { soundOn, sfx } from '../sound';
import { Icon, Face, type FaceMood } from '../design/Icon';
import { Kaal } from '../kaal/Kaal';
import { personalize } from '../../adapters/identity';

const MOODS: [FaceMood, string][] = [['love', 'Loved it'], ['happy', 'Fun'], ['ok', 'Okay'], ['confused', 'Confusing'], ['sleepy', 'Boring']];
const LIKED = ['The story', 'Inspector Kaal', 'SQL tasks', 'Case Notes', 'Puzzles', 'Sounds', 'The look'];
const LIKED_LABEL: Record<string, string> = { 'Inspector Kaal': 'Kaal', 'Case Notes': 'Learning notes' };   // what the student sees; the stored value stays the same for the dashboard
const DIFF = { easy: 'Too easy', right: 'Just right', hard: 'Too hard' } as const;

export function FeedbackCard({ session, onDone }: { session: number; onDone?(): void }) {
  const { auth } = useServices();
  const [user, setUser] = useState<string | null>(null);
  const [state, setState] = useState<'ask' | 'sent' | 'hidden'>('ask');
  const [rating, setRating] = useState(0);
  const [mood, setMood] = useState<string>();
  const [difficulty, setDifficulty] = useState<Feedback['difficulty']>();
  const [liked, setLiked] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  useEffect(() => { auth.currentUser().then((u) => { setUser(u.id); if (feedbackGiven(u.id, session)) { setState('hidden'); onDone?.(); } }); }, [auth, session, onDone]);
  if (!user || state === 'hidden') return null;
  if (state === 'sent') return (
    <section className="surface card feedback-card sent pop-in">
      <Kaal mood="happy" size={50} /><div><h3>{personalize('Noted, {you}. Thank you!')}</h3><p className="muted small">Your feedback goes straight to the team that builds this case.</p></div>
    </section>
  );
  const submit = async () => {
    await sendFeedback({ user_id: user, session, rating, scale: 11, mood, difficulty, liked, comment: comment.trim().slice(0, 1000) || undefined, sound_on: soundOn(), client_ts: new Date().toISOString() });
    sfx('stamp'); setState('sent'); onDone?.();
  };
  const ready = !!rating && !!mood && !!difficulty;
  const toggle = (x: string) => setLiked((l) => l.includes(x) ? l.filter((y) => y !== x) : [...l, x]);
  return (
    <section className="surface card feedback-card rise" aria-label="Episode feedback">
      <div><h2>How was this episode?</h2>
        <p className="muted small">Tell us in 30 seconds to unlock the next episode. Your answers shape the next case.</p></div>
      <div className="ladder-q"><span className="cap">How many stars out of 11?</span>
        <p className="muted small">5 means it worked as expected. Tap higher if it was better than that.</p>
        <div className="ladder" role="radiogroup" aria-label="Rating out of 11">
          {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => (
            <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} of 11: ${LADDER[n]}`} title={LADDER[n]}
              className={`${n <= rating ? 'on' : ''} ${n === 5 ? 'mid' : ''} ${n >= 8 ? 'far' : ''}`} onClick={() => setRating(n)}>
              <Icon name="star" /><small>{n}</small>
            </button>
          ))}
        </div>
        <p className="ladder-say" aria-live="polite">{rating ? <><b>{rating} of 11</b> · {LADDER[rating]}</> : <span className="muted">1 · I gave up &nbsp;…&nbsp; 5 · It worked &nbsp;…&nbsp; 11 · It changed how I see coding</span>}</p>
      </div>
      <div><span className="cap">How did it feel?</span>
        <div className="opts">{MOODS.map(([f, l]) => <button key={l} className={mood === l ? 'on' : ''} aria-pressed={mood === l} onClick={() => setMood(l)}><Face mood={f} /> {l}</button>)}</div></div>
      <div><span className="cap">The SQL was…</span>
        <div className="opts">{(['easy', 'right', 'hard'] as const).map((d) => <button key={d} className={difficulty === d ? 'on' : ''} aria-pressed={difficulty === d} onClick={() => setDifficulty(d)}><i className={`dot ${d}`} aria-hidden="true" />{DIFF[d]}</button>)}</div></div>
      <div><span className="cap">What did you like? (pick any)</span>
        <div className="opts">{LIKED.map((x) => <button key={x} className={liked.includes(x) ? 'on' : ''} aria-pressed={liked.includes(x)} onClick={() => toggle(x)}>{LIKED_LABEL[x] ?? x}</button>)}</div></div>
      <label className="field" htmlFor={`fb-comment-${session}`}><span className="cap">What would make it one star better? (optional)</span>
        <textarea id={`fb-comment-${session}`} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={3} placeholder="What confused you, what you would add, what you loved" />
        <small className="count">{comment.length} / 1000</small></label>
      <div className="row">
        <button className="btn pop" disabled={!ready} onClick={submit}>Send feedback and continue</button>
        {!ready && <span className="muted small">Pick your stars, how it felt and how the SQL was</span>}
      </div>
    </section>
  );
}
