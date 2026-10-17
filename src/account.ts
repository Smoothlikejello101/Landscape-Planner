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

/** The project's address and public key. Public by design: they can do nothing beyond the database's access rules. */
export const SUPABASE_URL = 'https://erepgvypesysctxezwkm.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_R6aLme10zqxx2yceOFQGEA__ayLzqPV';
/** Where the sign-in session is kept on this device. */
export const AUTH_STORAGE_KEY = 'lp-auth';

export type PlanName = 'trial' | 'active' | 'lapsed' | 'beta';
export interface PlanInfo { plan: PlanName; trialEnds: string | null; paidUntil: string | null }
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
function client(): Promise<SupabaseClient> {
  clientPromise ??= factory();
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
/**
 * Check the session: at startup when there may be one (a stored session, or
 * the return from signing in); `force` checks anyway (Try again).
 */
export async function initAccount(force = false) {
  if (!force && !returningFromSignIn() && !storedSession()) { set({ status: 'signedOut' }); return; }
  set({ status: account.status === 'signedIn' ? 'signedIn' : 'unknown' });
  try {
    const c = await client();
    if (!listening) {
      listening = true;
      c.auth.onAuthStateChange((event, session) => {
        // Supabase asks that no other Supabase call be awaited inside this callback.
        setTimeout(() => {
          if (session?.user) {
            if (account.status !== 'signedIn' || account.email !== session.user.email) {
              set({ status: 'signedIn', email: session.user.email ?? '', userId: session.user.id, linkSentTo: undefined, error: undefined });
              void loadPlan();
            }
          } else if (event === 'SIGNED_OUT') set({ status: 'signedOut', email: undefined, userId: undefined, plan: undefined });
        }, 0);
      });
    }
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
        : wasReturn && init.error ? 'Signing in didn’t finish: ' + init.error.message + '. Try again; an emailed link works only once, on the device that asked for it.'
        : null;
      set({ status: 'signedOut', ...(why ? { error: why } : {}) });
      if (why) toast(why, 10000); // shown wherever the page opened, not only in the Account section
    }
  } catch (e) {
    set({ status: storedSession() ? 'unknown' : 'signedOut', error: friendly(e) });
  }
}
async function loadPlan() {
  try {
    const c = await client();
    const { data, error } = await c.from('plans').select('plan, trial_ends, paid_until').maybeSingle();
    if (error) throw error;
    set({ plan: data ? { plan: data.plan as PlanName, trialEnds: data.trial_ends ?? null, paidUntil: data.paid_until ?? null } : null });
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
  const address = email.trim();
  if (!EMAIL_PATTERN.test(address)) { set({ error: 'That doesn’t look like an email address.' }); return; }
  set({ busy: true, error: undefined });
  try {
    const c = await client();
    const { error } = await c.auth.signInWithOtp({ email: address, options: { emailRedirectTo: appUrl(), shouldCreateUser: true } });
    if (error) throw error;
    set({ busy: false, linkSentTo: address });
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
    toast('You’re signed in.');
    void loadPlan();
  } catch (e) {
    const msg = friendly(e);
    set({ busy: false, error: /expired|invalid/i.test(msg) ? 'That code didn’t work: it may have expired, or a newer email replaced it. Check the latest email, or send a new one.' : msg });
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
      const d = p.trialEnds ? trialDaysLeft(p.trialEnds, now) : 0;
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
