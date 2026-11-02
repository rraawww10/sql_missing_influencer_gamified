// Student feedback after an episode: stars, mood, difficulty, a comment. Sent to the analytics server
// (POST /api/feedback, same server as the progress events) when the build sets VITE_ANALYTICS_URL; always posted
// to the embedding page too ('feedback' message), and remembered on this device so we ask only once per episode.
import { postToParent } from './embed';

export interface Feedback {
  user_id: string; session: number; rating: number; mood?: string; difficulty?: 'easy' | 'right' | 'hard';
  liked?: string[]; comment?: string; sound_on?: boolean; client_ts: string;
}
const URL_BASE = (import.meta.env.VITE_ANALYTICS_URL as string | undefined)?.replace(/\/+$/, '');
const key = (user: string, s: number) => `tmi.feedback.v1.${user}.s${s}`;

export function feedbackGiven(user: string, session: number): boolean {
  try { return !!localStorage.getItem(key(user, session)); } catch { return false; }
}

export async function sendFeedback(f: Feedback): Promise<void> {
  try { localStorage.setItem(key(f.user_id, f.session), f.client_ts); } catch { /* fine */ }
  postToParent('feedback', f as unknown as Record<string, unknown>);
  if (!URL_BASE) return;
  try {
    await fetch(`${URL_BASE}/api/feedback`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(f), keepalive: true });
  } catch { /* offline: the parent page still got it */ }
}
