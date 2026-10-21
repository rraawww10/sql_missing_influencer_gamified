// GuestAuth: an anonymous id kept on this device. Used for development, demos and the first playtests.
import type { AuthProvider, GameUser } from '../ports/auth';

const KEY = 'tmi.guest.v1';

export class GuestAuth implements AuthProvider {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
              private readonly uuid: () => string = () => crypto.randomUUID()) {}

  async currentUser(): Promise<GameUser> {
    let raw: string | null = null;
    try { raw = this.storage.getItem(KEY); } catch { /* storage blocked: fall through to a session-only guest */ }
    if (raw) return JSON.parse(raw) as GameUser;
    const user: GameUser = { id: this.uuid(), displayName: 'Intern', provider: 'guest', lmsUserId: null };
    try { this.storage.setItem(KEY, JSON.stringify(user)); } catch { /* ignore */ }
    return user;
  }
}
