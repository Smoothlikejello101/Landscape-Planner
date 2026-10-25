import type { SupabaseClient } from '@supabase/supabase-js';
import { flushSave } from './storage';
import { toast } from './ui/toast';

// Accounts (sync step 1): sign in with Google or an emailed link, sign out,
// delete the account. No account is needed to use the app; an account
// carries the subscription (a 30-day trial to start) and, next, sync.
//
// The Supabase library is loaded only when it's needed: when someone opens
// the Account section, comes back from signing in, or is already signed in.
// The app works fully without it, offline included.

/**
 * The project's address and public key. Public by design: they can do nothing beyond the database's access rules.
 * The address is FullGrown's own (Supabase's custom domain, since 2026-10-24); the project's first one,
 * https://erepgvypesysctxezwkm.supabase.co, still answers. A sign-in is kept under the app's own name
 * (`AUTH_STORAGE_KEY`), not one derived from the address, so changing it signs no one out.
 */
export const SUPABASE_URL = 'https://api.fullgrown.garden';
export const SUPABASE_KEY = 'sb_publishable_R6aLme10zqxx2yceOFQGEA__ayLzqPV';
/**
 * Email sign-in needs the app's own email service: Supabase's built-in sender
 * reaches only the project's team, two emails an hour, and its emails can't
 * be changed to carry the code. Off until that service is set up; tests (and
 * a trial run) turn it on with localStorage 'lp-email-signin' = '1'.
 */
export const EMAIL_SIGNIN_READY = false;
export function emailSignInOn(): boolean {
  if (EMAIL_SIGNIN_READY) return true;
  try { return localStorage.getItem('lp-email-signin') === '1'; } catch { return false; }
}
/** Where the sign-in session is kept on this device. */
export const AUTH_STORAGE_KEY = 'lp-auth';

export type PlanName = 'trial' | 'active' | 'lapsed' | 'beta';
export interface PlanInfo { plan: PlanName; trialEnds: string | null; paidUntil: string | null; trialStarted?: string | null }
export interface AccountState {
  /** 'unknown' until the session has been checked (only when there might be one). */
  status: 'unknown' | 'signedOut' | 'signedIn';
  email?: string;
  userId?: string;
  plan?: PlanInfo | null;
  /** An emailed link was sent to this address (and not yet used). */
  linkSentTo?: string;
  busy?: boolean;
  error?: string;
}
export const account: AccountState = { status: 'signedOut' };

// ---------- The client (loaded on demand; replaceable in tests) ----------
type ClientFactory = () => Promise<SupabaseClient>;
let factory: ClientFactory = async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
  });
};
let clientPromise: Promise<SupabaseClient> | null = null;
export function _setClientFactoryForTests(f: ClientFactory) { factory = f; clientPromise = null; listening = false; }
/** The client, listening for sign-in changes from the moment it exists, however signing in happens. */
/** The Supabase client (sync uses the same one, and so the same sign-in). */
export function supabaseClient(): Promise<SupabaseClient> { return client(); }
function client(): Promise<SupabaseClient> {
  clientPromise ??= factory().then((c) => { listen(c); return c; });
  return clientPromise;
}

// ---------- Telling the page ----------
let onChange: () => void = () => {};
/** Called whenever the account state changes (the page refreshes just the Account section). */
export function setAccountListener(f: () => void) { onChange = f; }
function set(patch: Partial<AccountState>) {
  Object.assign(account, patch);
  onChange();
}

/** This page's address, without a query or fragment: where sign-in comes back to. */
export function appUrl(): string { return location.origin + location.pathname; }

/** Whether this page load is the return from signing in (or a sign-in link). */
function returningFromSignIn(): boolean {
  const q = new URLSearchParams(location.search);
  return q.has('code') || q.has('error_description') || /(^|[#&])(access_token|error_description)=/.test(location.hash);
}
function storedSession(): boolean {
  try { return !!localStorage.getItem(AUTH_STORAGE_KEY); } catch { return false; }
}
/** Forget the session on this device, whatever the server says (signing out offline must still sign out). */
function clearLocalSession() {
  for (const k of [AUTH_STORAGE_KEY, AUTH_STORAGE_KEY + '-code-verifier', AUTH_STORAGE_KEY + '-user']) {
    try { localStorage.removeItem(k); } catch { /* nothing stored */ }
  }
}
// Signed in or out in another copy of the app (the browser tab an emailed link opened): catch up.
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === AUTH_STORAGE_KEY) void initAccount(true); });
// Back from the Google screen with the Back button: the page may be restored as it was, mid-"busy".
if (typeof window !== 'undefined') window.addEventListener('pageshow', (e) => { if (e.persisted && account.busy) set({ busy: false }); });
/** Take sign-in details out of the address bar, so a reload or a bookmark doesn't replay them. */
function cleanAddress() {
  if (location.search || location.hash) history.replaceState(history.state, '', appUrl());
}

let listening = false;
/** Follow the session: a refresh, a sign-out elsewhere, an account deleted on another device. */
function listen(c: SupabaseClient) {
  if (listening) return;
  listening = true;
  c.auth.onAuthStateChange((event, session) => {
    // Supabase asks that no other Supabase call be awaited inside this callback.
    setTimeout(() => {
      if (session?.user) {
        if (account.status !== 'signedIn' || account.email !== session.user.email) {
          set({ status: 'signedIn', email: session.user.email ?? '', userId: session.user.id, linkSentTo: undefined, error: undefined });
          rememberCodeSent(null);
          void loadPlan();
        }
      } else if (event === 'SIGNED_OUT') set({ status: 'signedOut', email: undefined, userId: undefined, plan: undefined });
    }, 0);
  });
}
/**
 * Check the session: at startup when there may be one (a stored session, or
 * the return from signing in); `force` checks anyway (Try again).
 */
export async function initAccount(force = false) {
  if (!force && !returningFromSignIn() && !storedSession()) { set({ status: 'signedOut' }); return; }
  set({ status: account.status === 'signedIn' ? 'signedIn' : 'unknown' });
  try {
    const c = await client();
    // Finishing a sign-in (the code in the address) reports its failure only here:
    // an expired or reused link, or a link opened on a different device.
    const wasReturn = returningFromSignIn();
    const failed = new URLSearchParams(location.search).get('error_description');
    const init = await c.auth.initialize();
    const { data, error } = await c.auth.getSession();
    if (wasReturn) cleanAddress();
    if (error) throw error;
    if (data.session?.user) {
      set({ status: 'signedIn', email: data.session.user.email ?? '', userId: data.session.user.id, error: undefined });
      // An emailed link opens in the browser, not the installed app: a second copy of the app,
      // and editing in both at once could lose changes. The installed app is signed in too.
      if (wasReturn && !window.matchMedia?.('(display-mode: standalone)').matches) {
        toast('You’re signed in. If you use the installed app, go back to it and close this tab.', 10000);
      }
      await loadPlan();
    } else {
      const why = failed ? 'Signing in didn’t finish: ' + failed
        : wasReturn && init.error ? 'Signing in didn’t finish: ' + init.error.message + '. Please try again.'
        : null;
      set({ status: 'signedOut', ...(why ? { error: why } : {}) });
      if (why) toast(why, 10000); // shown wherever the page opened, not only in the Account section
    }
  } catch (e) {
    set({ status: storedSession() ? 'unknown' : 'signedOut', error: friendly(e) });
  }
}
/** Read the account's plan again (after the trial starts, say). */
export async function loadPlan() {
  try {
    const c = await client();
    const { data, error } = await c.from('plans').select('plan, trial_ends, paid_until, trial_started').maybeSingle();
    if (error) throw error;
    set({ plan: data ? { plan: data.plan as PlanName, trialEnds: data.trial_ends ?? null, paidUntil: data.paid_until ?? null, trialStarted: data.trial_started ?? null } : null });
  } catch {
    set({ plan: undefined }); // shown as unknown; the account still works
  }
}

// ---------- Signing in and out ----------
export async function signInWithGoogle() {
  set({ busy: true, error: undefined });
  try {
    // The page leaves for Google: nothing may be left unsaved.
    if (!(await flushSave())) {
      set({ busy: false, error: 'Couldn’t save your plan first, so signing in waited. Check your device has free space, then try again.' });
      return;
    }
    const c = await client();
    const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } });
    if (error) throw error;
    // The browser is now on its way to Google.
  } catch (e) {
    set({ busy: false, error: friendly(e) });
  }
}
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function sendSignInLink(email: string) {
  if (account.busy) return; // one request at a time (Enter in the field, then the button)
  const address = email.trim();
  if (!EMAIL_PATTERN.test(address)) { set({ error: 'That doesn’t look like an email address.' }); return; }
  set({ busy: true, error: undefined });
  try {
    const c = await client();
    const { error } = await c.auth.signInWithOtp({ email: address, options: { emailRedirectTo: appUrl(), shouldCreateUser: true } });
    if (error) throw error;
    set({ busy: false, linkSentTo: address });
    rememberCodeSent(address);
  } catch (e) {
    set({ busy: false, error: friendly(e) });
  }
}
/**
 * Finish signing in with the code from the email, typed into the app. Unlike
 * the link, this works whatever opens the email: the link can land in a
 * browser tab (or a mail app's own browser) that isn't the installed app.
 */
export async function verifyEmailCode(code: string) {
  if (account.busy) return; // one check at a time: a used code fails the second
  const email = account.linkSentTo;
  const token = code.replace(/\s+/g, '');
  if (!email) return;
  if (!/^\d{6,10}$/.test(token)) { set({ error: 'Enter the code from the email: just the digits.' }); return; }
  set({ busy: true, error: undefined });
  try {
    const c = await client();
    const { data, error } = await c.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    const user = data.session?.user ?? data.user;
    set({ busy: false, status: 'signedIn', email: user?.email ?? email, userId: user?.id, linkSentTo: undefined });
    rememberCodeSent(null);
    toast('You’re signed in.');
    void loadPlan();
  } catch (e) {
    const msg = friendly(e);
    set({ busy: false, error: /expired|invalid/i.test(msg) ? 'That code didn’t work: it may have expired, or a newer email replaced it. Check the latest email, or send a new one.'
      : /too many|rate limit/i.test(String((e as { message?: unknown })?.message ?? '')) ? 'Too many tries for now. Wait a few minutes, then try again.' : msg });
  }
}
/** What a beta code that didn't work means, in plain words (supabase/06-beta.sql's answers). */
const BETA_CODE_WORDS: Record<string, string> = {
  invalid: 'That code didn’t work. Check it against the email it came in: 8 letters and numbers, like K7PQ-M3XD.',
  'used-up': 'That code has been used as many times as it allows. Ask for a new one.',
  'too-many': 'Too many codes that didn’t work. Wait an hour, then try again.',
  paid: 'You already have a paid plan, so you don’t need a code.',
};
/**
 * Use a beta code: the account becomes a beta account (everything free during the beta). True when it is
 * one now (or already was).
 */
export async function redeemBetaCode(code: string): Promise<boolean> {
  if (account.busy) return false;
  if (code.replace(/[^A-Za-z0-9]/g, '').length !== 8) {
    set({ error: 'A beta code has 8 letters and numbers, like K7PQ-M3XD.' });
    return false;
  }
  set({ busy: true, error: undefined });
  try {
    const c = await client();
    const { data, error } = await c.rpc('redeem_beta_code', { p_code: code });
    if (error) throw error;
    if (data === 'ok' || data === 'already') {
      set({ busy: false });
      await loadPlan();
      return true;
    }
    set({ busy: false, error: BETA_CODE_WORDS[String(data)] ?? 'That code didn’t work.' });
    return false;
  } catch (e) {
    set({ busy: false, error: friendly(e) });
    return false;
  }
}

export async function signOut() {
  set({ busy: true, error: undefined });
  try {
    const c = await client();
    // Signs out on this device even if the server can't be reached; the plans on this device stay.
    const { error } = await c.auth.signOut({ scope: 'local' });
    if (error) clearLocalSession();
    set({ busy: false, status: 'signedOut', email: undefined, userId: undefined, plan: undefined });
  } catch (e) {
    set({ busy: false, error: friendly(e) });
  }
}
/**
 * Delete the account and everything stored with it on the server. Plans on
 * this device stay. (The caller has already confirmed, and offered a backup.)
 */
export async function deleteAccount(): Promise<boolean> {
  set({ busy: true, error: undefined });
  try {
    const c = await client();
    // Photo files first: the storage service, not the database, removes them.
    if (account.userId) await removeAllPhotos(c, account.userId);
    const { error } = await c.rpc('delete_my_account');
    if (error) throw error;
    const out = await c.auth.signOut({ scope: 'local' });
    if (out.error) clearLocalSession();
    set({ busy: false, status: 'signedOut', email: undefined, userId: undefined, plan: undefined });
    return true;
  } catch (e) {
    set({ busy: false, error: friendly(e) });
    return false;
  }
}

/** Every background photo file the account has stored. */
async function removeAllPhotos(c: SupabaseClient, uid: string) {
  const bucket = c.storage.from('photos');
  for (let round = 0; round < 50; round++) {
    const { data, error } = await bucket.list(uid, { limit: 1000 });
    if (error) throw error;
    if (!data?.length) return;
    const { error: rmErr } = await bucket.remove(data.map((f) => `${uid}/${f.name}`));
    if (rmErr) throw rmErr;
  }
}

// ---------- A code on its way (survives the app being closed while reading the email) ----------
const CODE_SENT_KEY = 'lp-code-sent';
const CODE_SENT_FOR_MS = 60 * 60 * 1000;
function rememberCodeSent(email: string | null) {
  try {
    if (email) localStorage.setItem(CODE_SENT_KEY, JSON.stringify({ email, at: Date.now() }));
    else localStorage.removeItem(CODE_SENT_KEY);
  } catch { /* not remembered */ }
}
export function forgetCodeSent() { rememberCodeSent(null); }
/** At startup: a code sent within the hour is still waiting to be typed in. */
export function restoreCodeSent() {
  try {
    const v = JSON.parse(localStorage.getItem(CODE_SENT_KEY) || 'null') as { email?: unknown; at?: unknown } | null;
    if (v && typeof v.email === 'string' && typeof v.at === 'number' && Date.now() - v.at < CODE_SENT_FOR_MS) account.linkSentTo = v.email;
    else localStorage.removeItem(CODE_SENT_KEY);
  } catch { /* nothing waiting */ }
}

// ---------- Words ----------
/** Days left in a trial, rounding up (a trial ending later today has 1 day left); 0 once it's over. */
export function trialDaysLeft(trialEnds: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(trialEnds).getTime() - now) / 86_400_000));
}
/** "Free trial: 30 days left", "Beta: free during the beta". */
export function planText(p: PlanInfo | null | undefined, now = Date.now()): string {
  if (!p) return '';
  switch (p.plan) {
    case 'trial': {
      if (!p.trialEnds) return 'Free trial: 30 days, starting when you turn on sync';
      const d = trialDaysLeft(p.trialEnds, now);
      return d ? `Free trial: ${d} day${d === 1 ? '' : 's'} left` : 'Free trial ended';
    }
    case 'beta': return 'Beta tester: everything free during the beta';
    case 'active': return 'Subscribed' + (p.paidUntil ? ` through ${new Date(p.paidUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : '');
    case 'lapsed': return 'Subscription ended';
  }
}
/** A failure in plain words. */
export function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (!navigator.onLine || /fetch|network|load failed|failed to fetch/i.test(msg)) return 'Couldn’t reach the server. Check your connection and try again.';
  if (/rate limit|too many/i.test(msg)) return 'Too many sign-in emails for now. Wait a while (up to an hour), then try again, or use Google.';
  return 'Something went wrong: ' + msg;
}
