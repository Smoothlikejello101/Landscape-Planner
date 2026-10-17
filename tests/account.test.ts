// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { _setClientFactoryForTests, account, AUTH_STORAGE_KEY, deleteAccount, friendly, initAccount, planText, sendSignInLink, signInWithGoogle, signOut, trialDaysLeft, verifyEmailCode } from '../src/account';

const saved = { ok: true };
vi.mock('../src/storage', () => ({ flushSave: vi.fn(async () => saved.ok) }));

/** A stand-in for the Supabase client: just the calls the account code makes. */
function fakeClient(opts: { session?: { user: { email: string; id?: string } } | null; plan?: object | null; fail?: string; offline?: boolean; initError?: string; photos?: string[] } = {}) {
  const calls: string[] = [];
  let session = opts.session ?? null;
  const c = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      initialize: async () => ({ error: opts.initError ? { message: opts.initError } : null }),
      getSession: async () => ({ data: { session }, error: null }),
      signInWithOAuth: async (o: { provider: string; options: { redirectTo: string } }) => { calls.push(`oauth ${o.provider} ${o.options.redirectTo}`); return { error: null }; },
      signInWithOtp: async (o: { email: string; options: { emailRedirectTo: string } }) => {
        calls.push(`otp ${o.email} ${o.options.emailRedirectTo}`);
        return { error: opts.fail ? { message: opts.fail } : null };
      },
      verifyOtp: async (o: { email: string; token: string; type: string }) => {
        calls.push(`verify ${o.email} ${o.token} ${o.type}`);
        return o.token === '12345678' ? { data: { session: { user: { email: o.email, id: 'u-9' } }, user: null }, error: null } : { data: {}, error: { message: 'Token has expired or is invalid' } };
      },
      signOut: async (o: { scope: string }) => {
        calls.push(`signOut ${o.scope}`);
        if (opts.offline) return { error: { message: 'Failed to fetch' } }; // as auth-js does with an expired token and no signal
        session = null; return { error: null };
      },
    },
    from: (t: string) => ({ select: () => ({ maybeSingle: async () => { calls.push(`select ${t}`); return { data: opts.plan ?? null, error: null }; } }) }),
    rpc: async (fn: string) => { calls.push(`rpc ${fn}`); return { error: null }; },
    storage: { from: (b: string) => ({
      list: async (dir: string) => ({ data: (opts.photos ?? []).splice(0).map((name) => ({ name })), error: null, ...(calls.push(`list ${b}/${dir}`) && {}) }),
      remove: async (paths: string[]) => { calls.push(`remove ${paths.join(',')}`); return { error: null }; },
    }) },
  };
  return { client: c as unknown as SupabaseClient, calls };
}

beforeEach(() => {
  localStorage.clear();
  Object.assign(account, { status: 'signedOut', email: undefined, plan: undefined, linkSentTo: undefined, busy: false, error: undefined });
  history.replaceState(null, '', '/Landscape-Planner/');
  saved.ok = true;
});

describe('accounts', () => {
  it("don't load anything at startup for someone who has never signed in", async () => {
    const factory = vi.fn();
    _setClientFactoryForTests(factory);
    await initAccount();
    expect(factory).not.toHaveBeenCalled(); // the app works without the sign-in library
    expect(account.status).toBe('signedOut');
  });
  it('pick up a stored session, with the trial', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, '{}');
    const f = fakeClient({ session: { user: { email: 'jason@example.com' } }, plan: { plan: 'trial', trial_ends: new Date(Date.now() + 30 * 86_400_000 - 1000).toISOString(), paid_until: null } });
    _setClientFactoryForTests(async () => f.client);
    await initAccount();
    expect(account).toMatchObject({ status: 'signedIn', email: 'jason@example.com', plan: { plan: 'trial' } });
    expect(planText(account.plan)).toBe('Free trial: 30 days left');
  });
  it('finish signing in on the return from Google, and tidy the address bar', async () => {
    history.replaceState(null, '', '/Landscape-Planner/?code=abc123');
    const f = fakeClient({ session: { user: { email: 'jason@example.com' } } });
    _setClientFactoryForTests(async () => f.client);
    await initAccount();
    expect(account.status).toBe('signedIn');
    expect(location.search).toBe('');
  });
  it('say so when signing in was refused', async () => {
    history.replaceState(null, '', '/Landscape-Planner/?error=access_denied&error_description=The+user+cancelled');
    _setClientFactoryForTests(async () => fakeClient().client);
    await initAccount();
    expect(account).toMatchObject({ status: 'signedOut', error: 'Signing in didn’t finish: The user cancelled' });
  });
  it('send Google and the emailed link back to this page', async () => {
    const f = fakeClient();
    _setClientFactoryForTests(async () => f.client);
    await signInWithGoogle();
    account.busy = false; // the page would have left for Google; here it stays
    await sendSignInLink(' jason@example.com ');
    expect(f.calls).toEqual([`oauth google ${location.origin}/Landscape-Planner/`, `otp jason@example.com ${location.origin}/Landscape-Planner/`]);
    expect(account.linkSentTo).toBe('jason@example.com');
    await sendSignInLink('not an email');
    expect(account.error).toMatch(/doesn.t look like an email/);
  });
  it('sign in with the code from the email, typed into the app', async () => {
    const f = fakeClient();
    _setClientFactoryForTests(async () => f.client);
    await sendSignInLink('jason@example.com');
    await verifyEmailCode('abc');
    expect(account.error).toMatch(/just the digits/);
    await verifyEmailCode('000000');
    expect(account.error).toMatch(/That code didn.t work/);
    expect(account.linkSentTo).toBe('jason@example.com'); // can try again
    await verifyEmailCode(' 1234 5678 ');
    expect(account).toMatchObject({ status: 'signedIn', email: 'jason@example.com', userId: 'u-9', linkSentTo: undefined });
    expect(f.calls).toContain('verify jason@example.com 12345678 email');
  });
  it('explain failures plainly', async () => {
    _setClientFactoryForTests(async () => fakeClient({ fail: 'Email rate limit exceeded' }).client);
    await sendSignInLink('jason@example.com');
    expect(account.error).toBe('Too many sign-in emails for now. Wait a while (up to an hour), then try again, or use Google.');
    expect(friendly(new TypeError('Failed to fetch'))).toMatch(/Couldn.t reach the server/);
  });
  it('say why when finishing a sign-in failed (a used or expired link)', async () => {
    history.replaceState(null, '', '/Landscape-Planner/?code=used');
    _setClientFactoryForTests(async () => fakeClient({ initError: 'invalid flow state, no valid flow state found' }).client);
    await initAccount();
    expect(account.error).toBe('Signing in didn’t finish: invalid flow state, no valid flow state found. Please try again.');
  });
  it("don't leave for Google with an unsaved plan", async () => {
    const f = fakeClient();
    _setClientFactoryForTests(async () => f.client);
    saved.ok = false;
    await signInWithGoogle();
    expect(f.calls).toEqual([]);
    expect(account).toMatchObject({ busy: false, error: expect.stringMatching(/Couldn.t save your plan first/) });
  });
  it('sign out offline for real: nothing stored brings the session back', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, '{"access_token":"x"}');
    localStorage.setItem(AUTH_STORAGE_KEY + '-code-verifier', 'v');
    _setClientFactoryForTests(async () => fakeClient({ session: { user: { email: 'jason@example.com' } }, offline: true }).client);
    await initAccount();
    await signOut();
    expect(account.status).toBe('signedOut');
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBe(null);
    expect(localStorage.getItem(AUTH_STORAGE_KEY + '-code-verifier')).toBe(null);
  });
  it('remove the photo files before deleting the account', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, '{}');
    const f = fakeClient({ session: { user: { email: 'jason@example.com', id: 'u-1' } }, photos: ['a.jpg', 'b.jpg'] });
    _setClientFactoryForTests(async () => f.client);
    await initAccount();
    expect(await deleteAccount()).toBe(true);
    expect(f.calls.filter((c) => !c.startsWith('select'))).toEqual(['list photos/u-1', 'remove u-1/a.jpg,u-1/b.jpg', 'list photos/u-1', 'rpc delete_my_account', 'signOut local']);
  });
  it('sign out and delete the account, leaving the device alone', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, '{}');
    const f = fakeClient({ session: { user: { email: 'jason@example.com' } } });
    _setClientFactoryForTests(async () => f.client);
    await initAccount();
    await signOut();
    expect(account.status).toBe('signedOut');
    expect(f.calls).toContain('signOut local');
    expect(await deleteAccount()).toBe(true);
    expect(f.calls).toContain('rpc delete_my_account');
  });
});

describe('plan words', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  it('count trial days up, and name each plan', () => {
    expect(trialDaysLeft('2026-10-17T18:00:00Z', now)).toBe(1); // later today: 1 day left
    expect(trialDaysLeft('2026-10-16T18:00:00Z', now)).toBe(0);
    expect(planText({ plan: 'trial', trialEnds: '2026-10-18T13:00:00Z', paidUntil: null }, now)).toBe('Free trial: 2 days left');
    expect(planText({ plan: 'trial', trialEnds: '2026-10-01T00:00:00Z', paidUntil: null }, now)).toBe('Free trial ended');
    expect(planText({ plan: 'beta', trialEnds: null, paidUntil: null })).toMatch(/^Beta tester/);
    expect(planText({ plan: 'lapsed', trialEnds: null, paidUntil: null })).toBe('Subscription ended');
  });
});
