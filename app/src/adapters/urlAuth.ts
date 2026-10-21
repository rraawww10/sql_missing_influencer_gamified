// UrlAuth: the embedding platform names the learner with ?user_id=… on the iframe URL (any opaque id).
// Every unit site that gets the same id shares that learner's progress on this device; without the
// parameter the inner provider (GuestAuth: one anonymous id per device) is used.
// The id is never sent anywhere — it only keys local storage and is reported back inside progress events
// (user_id) so the platform can match them.
import type { AuthProvider, GameUser } from '../ports/auth';

export class UrlAuth implements AuthProvider {
  constructor(private readonly fallback: AuthProvider,
              private readonly search: string = typeof location !== 'undefined' ? location.search : '',
              private readonly param = 'user_id') {}

  async currentUser(): Promise<GameUser> {
    const id = new URLSearchParams(this.search).get(this.param)?.trim();
    if (!id || id.length > 200) return this.fallback.currentUser();
    return { id: `lms:${id}`, displayName: 'Intern', provider: 'lms', lmsUserId: id };
  }
}
