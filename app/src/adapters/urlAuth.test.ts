import { describe, expect, it } from 'vitest';
import { UrlAuth } from './urlAuth';
import type { AuthProvider } from '../ports/auth';

const guest: AuthProvider = { currentUser: async () => ({ id: 'g-1', displayName: 'Intern', provider: 'guest', lmsUserId: null }) };

describe('UrlAuth', () => {
  it('uses ?user_id from the embedding platform, so every unit site sees the same learner', async () => {
    const u = await new UrlAuth(guest, '?unit=11&user_id=stu-42&parent_origin=https://lms').currentUser();
    expect(u).toMatchObject({ id: 'lms:stu-42', provider: 'lms', lmsUserId: 'stu-42' });
    expect((await new UrlAuth(guest, '?user_id=stu-42').currentUser()).id).toBe(u.id);
  });
  it('falls back to the device guest without the parameter (or with a junk one)', async () => {
    expect((await new UrlAuth(guest, '').currentUser()).id).toBe('g-1');
    expect((await new UrlAuth(guest, '?user_id=').currentUser()).id).toBe('g-1');
    expect((await new UrlAuth(guest, `?user_id=${'x'.repeat(300)}`).currentUser()).id).toBe('g-1');
  });
});
