// @vitest-environment jsdom
// The start screen. With a server: accounts (sign up, log in, forgot password, forgot ID) - nobody gets in without the
// right password. Without a server: name + NxtWave ID + email, as before.
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
    forgot: vi.fn(async () => ({ sent: true as const, to: 'p*****@gmail.com' })),
    reset: vi.fn(async () => priya(true)),
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
  it('opens on Log in: NxtWave ID + password; the game stays shut until the server accepts them', async () => {
    const d = deps(), user = userEvent.setup();
    open(d);
    expect(screen.getByRole('tab', { name: 'Log in' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('the game')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText(/Please type your NxtWave ID/)).toBeTruthy();
    expect(screen.getByText(/Please type your password/)).toBeTruthy();
    expect(d.account!.login).not.toHaveBeenCalled();

    await type(user, 'NxtWave ID', 'nw1001');
    await type(user, 'Password', 'secret1');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(d.account!.login).toHaveBeenCalledWith({ id: 'NW1001', password: 'secret1' });
    expect(d.signedIn).toHaveBeenCalledWith(expect.objectContaining({ id: 'NW1001', token: TOKEN }));
    expect(d.restore).toHaveBeenCalledWith('NW1001');
    expect(loadIdentity()).toMatchObject({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: TOKEN });
    expect(screen.getByText(/Welcome back, Priya!/)).toBeTruthy();
  });

  it('a wrong password does not get in, and nothing is stored', async () => {
    const d = deps({ account: api({ login: vi.fn(async (): Promise<AccountResult> => ({ ok: false, error: 'wrong' })) }) }), user = userEvent.setup();
    open(d);
    await type(user, 'NxtWave ID', 'NW1001');
    await type(user, 'Password', 'guess123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Wrong NxtWave ID or password/);
    expect(screen.queryByText('the game')).toBeNull();
    expect(loadSavedIdentity()).toBeNull();
    expect(d.restore).not.toHaveBeenCalled();
  });

  it('an ID nobody signed up with points to Sign up; too many tries says to wait', async () => {
    const login = vi.fn<AccountApi['login']>().mockResolvedValueOnce({ ok: false, error: 'no-account' }).mockResolvedValueOnce({ ok: false, error: 'too-many' });
    const user = userEvent.setup();
    open(deps({ account: api({ login }) }));
    await type(user, 'NxtWave ID', 'NW9999');
    await type(user, 'Password', 'whatever');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/No account with this ID yet/);
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Too many tries/);
  });

  it('the password can be shown and hidden', async () => {
    const user = userEvent.setup();
    open(deps());
    const box = screen.getByLabelText('Password') as HTMLInputElement;
    expect(box.type).toBe('password');
    await user.click(screen.getByRole('button', { name: 'Show the password' }));
    expect(box.type).toBe('text');
    await user.click(screen.getByRole('button', { name: 'Hide the password' }));
    expect(box.type).toBe('password');
  });

  it("a temporary password from the teacher asks for the student's own password before going in", async () => {
    const login = vi.fn<AccountApi['login']>().mockResolvedValueOnce({ ok: false, error: 'new-password-needed' }).mockResolvedValueOnce(priya(true));
    const user = userEvent.setup();
    open(deps({ account: api({ login }) }));
    await type(user, 'NxtWave ID', 'NW1001');
    await type(user, 'Password', 'TEMP2345');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Choose your password' })).toBeTruthy();
    expect(screen.queryByText('the game')).toBeNull();
    await type(user, 'New password', 'TEMP2345');                 // the same as the temporary one: refused
    await type(user, 'Type the password again', 'TEMP2345');
    await user.click(screen.getByRole('button', { name: 'Save and log in' }));
    expect(screen.getByText(/different from the temporary one/)).toBeTruthy();
    await type(user, 'New password', 'my-own-pass');
    await type(user, 'Type the password again', 'my-own-pass');
    await user.click(screen.getByRole('button', { name: 'Save and log in' }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(login).toHaveBeenLastCalledWith({ id: 'NW1001', password: 'TEMP2345', newPassword: 'my-own-pass' });
  });
});

describe('sign up', () => {
  it('asks name, NxtWave ID, email and the password twice; every box is checked before the account is made', async () => {
    const d = deps(), user = userEvent.setup();
    open(d);
    await user.click(screen.getByRole('tab', { name: 'Sign up' }));
    expect(screen.getByText(/Email is required\./).closest('.gate-required')?.textContent)
      .toBe('Email is required. Use your personal email - it is how you get back in if you forget your password or your ID.');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    for (const msg of [/Please type your name/, /Please type your NxtWave ID/, /Please type your email/, /Use at least 6 letters or numbers/]) expect(screen.getByText(msg)).toBeTruthy();
    expect(d.account!.signup).not.toHaveBeenCalled();

    await type(user, 'Your name', 'Priya Sharma');
    await type(user, 'NxtWave ID', 'nw1001');
    await type(user, 'Personal email', 'Priya@Gmail.com');
    await type(user, 'Password', 'secret1');
    await type(user, 'Type the password again', 'secret2');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(screen.getByText('The two passwords are not the same.')).toBeTruthy();
    expect(d.account!.signup).not.toHaveBeenCalled();

    await type(user, 'Type the password again', 'secret1');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(d.account!.signup).toHaveBeenCalledWith({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', password: 'secret1' });
    expect(loadIdentity()).toMatchObject({ id: 'NW1001', token: TOKEN });
    expect(screen.queryByText(/Welcome back/)).toBeNull();          // a new student
  });

  it('an ID that already has an account cannot be signed up again: the student is sent to Log in', async () => {
    const user = userEvent.setup();
    open(deps({ account: api({ signup: vi.fn(async (): Promise<AccountResult> => ({ ok: false, error: 'taken' })) }) }));
    await user.click(screen.getByRole('tab', { name: 'Sign up' }));
    await type(user, 'Your name', 'Not Priya');
    await type(user, 'NxtWave ID', 'NW1001');
    await type(user, 'Personal email', 'someone@else.com');
    await type(user, 'Password', 'letmein1');
    await type(user, 'Type the password again', 'letmein1');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/already has an account/);
    expect(screen.queryByText('the game')).toBeNull();
    expect(loadSavedIdentity()).toBeNull();
    await user.click(alert.querySelector('button')!);
    expect(screen.getByRole('tab', { name: 'Log in' }).getAttribute('aria-selected')).toBe('true');
  });

  it('every input has an id and a label', async () => {
    const user = userEvent.setup();
    open(deps());
    await user.click(screen.getByRole('tab', { name: 'Sign up' }));
    for (const [label, id] of [['Your name', 'gate-name'], ['NxtWave ID', 'gate-id'], ['Personal email', 'gate-email'], ['Password', 'gate-password'], ['Type the password again', 'gate-password2']])
      expect(screen.getByLabelText(label).id).toBe(id);
  });
});

describe('already logged in on this device', () => {
  it('goes straight in with the stored token: history refreshed, no password asked', async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: TOKEN, at: '2026-11-18T00:00:00Z' }));
    const d = deps();
    open(d);
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(d.account!.login).not.toHaveBeenCalled();
    expect(d.restore).toHaveBeenCalledWith('NW1001');
  });

  it('when the server no longer accepts the token, the student has to log in again and the token is dropped', async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: TOKEN, at: '2026-11-18T00:00:00Z' }));
    open(deps({ restore: vi.fn(async () => ({ ok: false, events: 0, sittings: 0, name: null, unauthorized: true })) }));
    expect(await screen.findByText('Please log in again to continue.')).toBeTruthy();
    expect(screen.queryByText('the game')).toBeNull();
    expect((screen.getByLabelText('NxtWave ID') as HTMLInputElement).value).toBe('NW1001');
    expect(loadSavedIdentity()?.token).toBeUndefined();
  });

  it('a student who played here before accounts existed is asked to create a password for the same ID', async () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 'NW0007816', name: 'Rishu Kumar', email: 'rishu@example.com', at: '2026-11-10T00:00:00Z' }));
    const d = deps(), user = userEvent.setup();
    open(d);
    expect(screen.queryByText('the game')).toBeNull();
    expect(screen.getByText(/Accounts now have a password/)).toBeTruthy();
    const id = screen.getByLabelText('NxtWave ID') as HTMLInputElement;
    expect(id.value).toBe('NW0007816');
    expect(id.readOnly).toBe(true);
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Rishu Kumar');
    await type(user, 'Password', 'secret1');
    await type(user, 'Type the password again', 'secret1');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(d.account!.signup).toHaveBeenCalledWith({ id: 'NW0007816', name: 'Rishu Kumar', email: 'rishu@example.com', password: 'secret1' });
  });

  it('?user_id= fixes the ID, and there is no "Forgot your NxtWave ID?"', () => {
    open(deps({ urlId: 'nw5005' }));
    const id = screen.getByLabelText('NxtWave ID') as HTMLInputElement;
    expect(id.value).toBe('nw5005');
    expect(id.readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: /Forgot your NxtWave ID/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeTruthy();
  });
});

describe('forgot password', () => {
  it('emails a code; the code and a new password log the student in', async () => {
    const d = deps(), user = userEvent.setup();
    open(d);
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await type(user, 'NxtWave ID', 'nw1001');
    await user.click(screen.getByRole('button', { name: 'Send me a code' }));
    expect(await screen.findByText(/We emailed a 6-digit code to p\*+@gmail\.com/)).toBeTruthy();
    expect(d.account!.forgot).toHaveBeenCalledWith('NW1001');
    await type(user, '6-digit code', '12ab3456');                // letters are dropped, six digits kept
    expect((screen.getByLabelText('6-digit code') as HTMLInputElement).value).toBe('123456');
    await type(user, 'New password', 'brandnew1');
    await type(user, 'Type the password again', 'brandnew1');
    await user.click(screen.getByRole('button', { name: 'Save and log in' }));
    expect(await screen.findByText('the game')).toBeTruthy();
    expect(d.account!.reset).toHaveBeenCalledWith({ id: 'NW1001', code: '123456', password: 'brandnew1' });
  });

  it('a wrong code is refused', async () => {
    const user = userEvent.setup();
    open(deps({ account: api({ reset: vi.fn(async (): Promise<AccountResult> => ({ ok: false, error: 'bad-code' })) }) }));
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await type(user, 'NxtWave ID', 'NW1001');
    await user.click(screen.getByRole('button', { name: 'Send me a code' }));
    await screen.findByLabelText('6-digit code');
    await type(user, '6-digit code', '000000');
    await type(user, 'New password', 'brandnew1');
    await type(user, 'Type the password again', 'brandnew1');
    await user.click(screen.getByRole('button', { name: 'Save and log in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/code is wrong or too old/);
    expect(screen.queryByText('the game')).toBeNull();
  });

  it('when the server cannot send email, the student is told to ask their teacher', async () => {
    const user = userEvent.setup();
    open(deps({ account: api({ forgot: vi.fn(async () => ({ sent: false as const, reason: 'no-mail' as const })) }) }));
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await type(user, 'NxtWave ID', 'NW1001');
    await user.click(screen.getByRole('button', { name: 'Send me a code' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Ask your teacher to reset your password/);
  });
});

describe('forgot NxtWave ID', () => {
  it('shows the ID for the email; the student still has to log in with their password', async () => {
    const d = deps({ recover: vi.fn(async (): Promise<RecoverResult> => ({ k: 'found', id: 'NW1001', name: 'Priya Sharma' })) }), user = userEvent.setup();
    open(d);
    await user.click(screen.getByRole('button', { name: /Forgot your NxtWave ID/ }));
    await type(user, 'Personal email', 'Priya@Gmail.com');
    await user.click(screen.getByRole('button', { name: 'Find my ID' }));
    expect((await screen.findByText(/Your NxtWave ID is/)).textContent).toBe('Your NxtWave ID is NW1001 (Priya Sharma).');
    expect(d.recover).toHaveBeenCalledWith('priya@gmail.com');
    expect(screen.queryByText('the game')).toBeNull();           // knowing the ID is not enough
    await user.click(screen.getByRole('button', { name: 'Log in with this ID' }));
    expect((screen.getByLabelText('NxtWave ID') as HTMLInputElement).value).toBe('NW1001');
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(d.account!.login).not.toHaveBeenCalled();
  });

  it('says so clearly when no student has that email', async () => {
    const user = userEvent.setup();
    open(deps());
    await user.click(screen.getByRole('button', { name: /Forgot your NxtWave ID/ }));
    await type(user, 'Personal email', 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: 'Find my ID' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not find this email/);
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
