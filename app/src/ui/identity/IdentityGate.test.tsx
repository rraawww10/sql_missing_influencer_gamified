// @vitest-environment jsdom
// The start screen. With a server: sign up once (name + any personal email; the ID is made from it), then log in with the email (no password, no OTP). Without a server: name + NxtWave ID + email, as before.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdentityGate, type GateDeps } from './IdentityGate';
import { loadIdentity, loadSavedIdentity, setCurrentIdentity } from '../../adapters/identity';
import type { RecoverResult } from '../../adapters/serverSync';
import type { AccountApi, AccountResult } from '../../adapters/account';

const KEY = 'tmi.identity.v1';
const TOKEN = 'a'.repeat(64);
const restored = (events = 0) => ({ ok: true, events, sittings: 0, name: null });
const priya = (returning = false): AccountResult => ({ ok: true, account: { id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: TOKEN, returning } });
function api(over: Partial<AccountApi> = {}): AccountApi {
  return {
    signup: vi.fn(async () => priya()),
    login: vi.fn(async () => priya(true)),
    logout: vi.fn(async () => {}),
    ...over,
  };
}
function deps(over: Partial<GateDeps> = {}): GateDeps {
  return {
    urlId: null,
    account: api(),
    signedIn: vi.fn(),
    restore: vi.fn(async () => restored()),
    recover: vi.fn(async (): Promise<RecoverResult> => ({ k: 'none' })),
    ...over,
  };
}
const open = (d: GateDeps) => render(<IdentityGate deps={d}><p>the game</p></IdentityGate>);
const type = async (user: ReturnType<typeof userEvent.setup>, label: string, text: string) => { await user.clear(screen.getByLabelText(label)); await user.type(screen.getByLabelText(label), text); };

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); setCurrentIdentity(null); });

describe('log in', () => {
  it('opens on Log in: just the email, no password, no OTP, no NxtWave ID; the game stays shut until the server knows the student', async () => {
    const d = deps(), user = userEvent.setup();
    open(d);
    expect(screen.getByRole('tab', { name: 'Log in' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('the game')).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByLabelText(/NxtWave ID/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText(/Please type your email, like/)).toBeTruthy();
    expect(d.account!.login).not.toHaveBeenCalled();
    await type(user, 'Email', 'priya@');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText(/Please type your email, like/)).toBeTruthy();
    expect(d.account!.login).not.toHaveBeenCalled();

    await type(user, 'Email', 'Priya@Gmail.com');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(d.account!.login).toHaveBeenCalledWith('Priya@Gmail.com');
    expect(d.signedIn).toHaveBeenCalledWith(expect.objectContaining({ id: 'NW1001', token: TOKEN }));
    expect(d.restore).toHaveBeenCalledWith('NW1001');
    expect(loadIdentity()).toMatchObject({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: TOKEN });
    expect(screen.getByText(/Welcome back, Priya!/)).toBeTruthy();
  });

  it('a student who signed up with a NxtWave ID before can still type it in the same box', async () => {
    const d = deps(), user = userEvent.setup();
    open(d);
    await type(user, 'Email', 'nw1001');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(d.account!.login).toHaveBeenCalledWith('nw1001');
  });

  it('an unknown email goes to Sign up with the email filled in; an unknown old ID just says it is not found', async () => {
    const d = deps({ account: api({ login: vi.fn(async (): Promise<AccountResult> => ({ ok: false, error: 'no-account' })) }) }), user = userEvent.setup();
    open(d);
    await type(user, 'Email', 'NW4040');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not find this email/);
    expect(screen.getByRole('tab', { name: 'Log in' }).getAttribute('aria-selected')).toBe('true');
    await type(user, 'Email', 'new.student@yahoo.in');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(/We don't know new.student@yahoo.in yet/)).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Sign up' }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByLabelText('Personal email') as HTMLInputElement).value).toBe('new.student@yahoo.in');
    expect(screen.queryByText('the game')).toBeNull();
  });

  it('too many tries and no connection are explained', async () => {
    const user = userEvent.setup();
    open(deps({ account: api({ login: vi.fn(async (): Promise<AccountResult> => ({ ok: false, error: 'offline' })) }) }));
    await type(user, 'Email', 'priya@gmail.com');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach the server/);
  });
});

describe('sign up', () => {
  it('asks only name and any personal email (no NxtWave ID, no password, no OTP); the ID is made from the email', async () => {
    const d = deps(), user = userEvent.setup();
    open(d);
    await user.click(screen.getByRole('tab', { name: 'Sign up' }));
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByLabelText(/NxtWave ID/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Start playing' }));
    expect(screen.getByText(/Please type your name/)).toBeTruthy();
    expect(screen.getByText(/Please type your email/)).toBeTruthy();
    expect(d.account!.signup).not.toHaveBeenCalled();
    await type(user, 'Your name', 'Priya Sharma');
    await type(user, 'Personal email', 'Priya.Sharma+db@Gmail.com');
    await user.click(screen.getByRole('button', { name: 'Start playing' }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(d.account!.signup).toHaveBeenCalledWith({ id: 'PRIYA.SHARMA_DB@GMAIL.COM', name: 'Priya Sharma', email: 'priya.sharma+db@gmail.com' });
  });

  it('an email typed as a NxtWave ID in the old sign up blocks its first-choice ID: sign up retries with the second-choice ID', async () => {
    const signup = vi.fn(async (a: { id: string }): Promise<AccountResult> => (a.id.includes('@') ? { ok: false, error: 'no-account' } : priya()));
    const d = deps({ account: api({ signup }) }), user = userEvent.setup();
    open(d);
    await user.click(screen.getByRole('tab', { name: 'Sign up' }));
    await type(user, 'Your name', 'Rishu Raj');
    await type(user, 'Personal email', 'rishuraj.singh@nxtwave.co.in');
    await user.click(screen.getByRole('button', { name: 'Start playing' }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(signup.mock.calls.map((c) => c[0].id)).toEqual(['RISHURAJ.SINGH@NXTWAVE.CO.IN', 'RISHURAJ.SINGH.AT.NXTWAVE.CO.IN']);
  });

  it('every input has an id and a label', async () => {
    const user = userEvent.setup();
    open(deps());
    expect(screen.getByLabelText('Email').id).toBe('gate-who');
    await user.click(screen.getByRole('tab', { name: 'Sign up' }));
    for (const [label, id] of [['Your name', 'gate-name'], ['Personal email', 'gate-email']])
      expect(screen.getByLabelText(label).id).toBe(id);
  });
});

describe('already logged in on this device', () => {
  it('a student logged in without an email also goes straight in', async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 'NW1001', name: 'Priya Sharma', email: '', token: TOKEN, at: '2026-11-19T00:00:00Z' }));
    open(deps());
    expect(await screen.findByText('the game')).toBeTruthy();
  });

  it('goes straight in with the stored token: history refreshed, nothing asked', async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: TOKEN, at: '2026-11-18T00:00:00Z' }));
    const d = deps();
    open(d);
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(d.account!.login).not.toHaveBeenCalled();
    expect(d.restore).toHaveBeenCalledWith('NW1001');
  });

  it('when the server no longer accepts the token, the student logs in again (email filled in) and the token is dropped', async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: TOKEN, at: '2026-11-18T00:00:00Z' }));
    open(deps({ restore: vi.fn(async () => ({ ok: false, events: 0, sittings: 0, name: null, unauthorized: true })) }));
    expect(await screen.findByText('Please log in again to continue.')).toBeTruthy();
    expect(screen.queryByText('the game')).toBeNull();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('priya@gmail.com');
    expect(loadSavedIdentity()?.token).toBeUndefined();
  });

  it('a student who played here before (no token) is welcomed back with the email filled in: one tap', async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 'NW0007816', name: 'Rishu Kumar', email: 'rishu@example.com', at: '2026-11-10T00:00:00Z' }));
    const d = deps(), user = userEvent.setup();
    open(d);
    expect(screen.getByText(/Welcome back, Rishu/)).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('rishu@example.com');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(d.account!.login).toHaveBeenCalledWith('rishu@example.com');
  });

  it('?user_id= fixes the ID: the platform names the student, and sign up uses that ID', async () => {
    const d = deps(), user = userEvent.setup();
    open({ ...d, urlId: 'nw5005' });
    const who = screen.getByLabelText('NxtWave ID') as HTMLInputElement;
    expect(who.value).toBe('nw5005');
    expect(who.readOnly).toBe(true);
    await user.click(screen.getByRole('tab', { name: 'Sign up' }));
    await type(user, 'Your name', 'Priya Sharma');
    await type(user, 'Personal email', 'priya@gmail.com');
    await user.click(screen.getByRole('button', { name: 'Start playing' }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(d.account!.signup).toHaveBeenCalledWith({ id: 'NW5005', name: 'Priya Sharma', email: 'priya@gmail.com' });
  });
});

describe('a build without a server (no accounts)', () => {
  const local = (over: Partial<GateDeps> = {}) => deps({ account: null, recover: null, restore: vi.fn(async () => null), ...over });

  it('asks name, NxtWave ID and email, with no password and no log-in tabs', async () => {
    const d = local(), user = userEvent.setup();
    open(d);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Open the case file/ }));
    for (const msg of [/Please type your name/, /Please type your NxtWave ID/, /Please type your email/]) expect(screen.getByText(msg)).toBeTruthy();
    await type(user, 'Your name', 'Priya Sharma');
    await type(user, 'NxtWave ID', 'nw1001');
    await type(user, 'Personal email', 'Priya@Gmail.com');
    await user.click(screen.getByRole('button', { name: /Open the case file/ }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(loadIdentity()).toMatchObject({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com' });
    expect(loadIdentity()?.token).toBeUndefined();
  });

  it('an identity stored before the email was asked sees "Add your email", or can switch student', async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 'NW1001', name: 'Priya Sharma', at: '2026-11-10T00:00:00Z' }));
    const user = userEvent.setup();
    open(local());
    expect(screen.getByRole('heading', { name: 'Add your email' })).toBeTruthy();
    await type(user, 'Personal email', 'priya@gmail.com');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(loadIdentity()).toMatchObject({ id: 'NW1001', email: 'priya@gmail.com' });
  });
});
