// Student feedback, stored on the analytics server (same server and database as the progress events, so the dashboard
// shows it per student):
//   * the episode card on the solved screen (stars, mood, difficulty, what they liked, a suggestion) → POST /api/feedback
//   * a quick check-in after every chapter (one tap + an optional suggestion)                         → POST /api/checkpoint
// Both go through the retrying mailbox (adapters/serverSync.ts), so feedback typed offline is sent later instead of lost.
// Always posted to the embedding page too ('feedback' / 'checkpoint' messages), and remembered on this device (and restored
// from the server for a returning student) so each is asked only once.
import { postToParent } from './embed';
import { checkpointKey, feedbackKey, mailbox } from '../adapters/serverSync';

export interface Feedback {
  user_id: string; session: number; rating: number; mood?: string; difficulty?: 'easy' | 'right' | 'hard';
  liked?: string[]; comment?: string; sound_on?: boolean; client_ts: string;
}
export interface Checkpoint { user_id: string; session: number; chapter: number; rating: 1 | 2 | 3 | 4; comment?: string; client_ts: string }

const seen = (k: string) => { try { return !!localStorage.getItem(k); } catch { return false; } };
const mark = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* fine */ } };

export const feedbackGiven = (user: string, session: number) => seen(feedbackKey(user, session));
export const checkpointGiven = (user: string, session: number, chapter: number) => seen(checkpointKey(user, session, chapter));

export async function sendFeedback(f: Feedback): Promise<void> {
  mark(feedbackKey(f.user_id, f.session), f.client_ts);
  postToParent('feedback', f as unknown as Record<string, unknown>);
  const m = mailbox();
  if (m) { m.push('/api/feedback', f); await m.flush({ keepalive: true }); }
}

export async function sendCheckpoint(c: Checkpoint): Promise<void> {
  mark(checkpointKey(c.user_id, c.session, c.chapter), c.client_ts);
  postToParent('checkpoint', c as unknown as Record<string, unknown>);
  const m = mailbox();
  if (m) { m.push('/api/checkpoint', c); await m.flush({ keepalive: true }); }
}

// "Skip" on a chapter check-in: don't ask again for that chapter, send nothing
export const skipCheckpoint = (user: string, session: number, chapter: number) => mark(checkpointKey(user, session, chapter), 'skipped');
