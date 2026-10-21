// AuthProvider port. Now: GuestAuth. Pilot: PilotAuth. Later: LmsAuth (LMS SSO).
export interface GameUser {
  id: string;                  // game_user_id (uuid)
  displayName: string;
  provider: 'guest' | 'pilot' | 'lms';
  lmsUserId: string | null;    // filled when the account is linked to the LMS
}

export interface AuthProvider {
  currentUser(): Promise<GameUser>;
}
