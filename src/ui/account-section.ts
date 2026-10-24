import { account, deleteAccount, emailSignInOn, forgetCodeSent, initAccount, planText, redeemBetaCode, sendSignInLink, signInWithGoogle, signOut, verifyEmailCode } from '../account';
import { PRIVACY_URL, TERMS_URL } from '../feedback';
import { backupAll } from '../backup';
import { restoreFromTrash, runSync, setSyncOnThisDevice, startSyncing, sync, syncOnThisDevice } from '../sync/sync';
import { el } from '../dom';
import { I } from '../icons';
import { errMsg } from '../util';
import { toast } from './toast';

// The Account section of the Projects panel. It's refreshed in place when the
// account changes (signing in finishes, a plan loads), never by a full render,
// and an email being typed keeps its text and focus across a refresh.

/** "Delete my account" asked: the confirmation is showing. */
let confirmingDelete = false;
/** "Have a beta code?" asked: the field is showing. */
let enteringBetaCode = false;
/** Move to the beta code field once it appears. */
let focusBetaCodeNext = false;

export function accountSection(): HTMLElement {
  const section = el('div', { className: 'account-section', 'data-testid': 'account' }, el('div', { className: 'section-title' }, 'Account'));
  fill(section);
  return section;
}
/** Move to the code field once it appears (after asking for a code from this section). */
let focusCodeNext = false;
/** The email typed so far (kept when the section is rebuilt, e.g. to show an error). */
let typedEmail = '';

/** Rebuild the Account section where it stands, if it's showing (kept typing-safe). */
export function refreshAccountSection() {
  const old = document.querySelector<HTMLElement>('[data-testid=account]');
  if (!old) return;
  // Whatever is typed (the code, say, while an error appears) stays, and so does the focus.
  const values = new Map([...old.querySelectorAll<HTMLInputElement>('input[data-testid]')].map((i) => [i.dataset.testid!, i.value]));
  const typing = document.activeElement instanceof HTMLInputElement && old.contains(document.activeElement) ? document.activeElement : null;
  const caret = typing?.selectionStart ?? null;
  const fresh = el('div', { className: 'account-section', 'data-testid': 'account' }, el('div', { className: 'section-title' }, 'Account'));
  fill(fresh);
  old.replaceWith(fresh);
  for (const i of fresh.querySelectorAll<HTMLInputElement>('input[data-testid]')) {
    const v = values.get(i.dataset.testid!);
    if (v != null && !i.value) i.value = v;
  }
  if (typing?.dataset.testid) {
    const again = fresh.querySelector<HTMLInputElement>(`input[data-testid="${typing.dataset.testid}"]`);
    if (again) { again.focus(); if (caret != null) again.setSelectionRange(caret, caret); }
  }
}

function fill(section: HTMLElement) {
  if (account.error) section.appendChild(el('div', { className: 'status warn', role: 'alert', 'data-testid': 'account-error' }, account.error));
  if (account.status === 'unknown') {
    if (!account.error) { section.appendChild(el('div', { className: 'status' }, 'Checking your account…')); return; }
    // Couldn't check (offline, say): a way to retry, and a way out.
    const retry = el('button', { className: 'btn ghost', 'data-testid': 'account-retry' }, 'Try again');
    retry.addEventListener('click', () => { void initAccount(true); });
    const out = el('button', { className: 'link-btn', 'data-testid': 'sign-out' }, 'Sign out on this device');
    out.addEventListener('click', () => { void signOut(); });
    section.append(el('div', { className: 'account-actions' }, retry, out));
    return;
  }
  if (account.status === 'signedIn') {
    section.appendChild(el('div', { className: 'status', 'data-testid': 'signed-in' }, 'Signed in as ', el('b', {}, account.email ?? '')));
    const plan = planText(account.plan);
    if (plan) section.appendChild(el('div', { className: 'status', 'data-testid': 'plan' }, plan));
    section.appendChild(syncBlock());
    if (confirmingDelete) { section.appendChild(deleteConfirmation()); return; }
    const beta = betaCodeBlock();
    if (beta) section.appendChild(beta);
    const out = el('button', { className: 'btn ghost', 'data-testid': 'sign-out' }, 'Sign out');
    out.disabled = !!account.busy;
    out.addEventListener('click', () => { void signOut(); });
    const del = el('button', { className: 'link-btn danger-link', 'data-testid': 'delete-account' }, 'Delete my account…');
    del.addEventListener('click', () => { confirmingDelete = true; refreshAccountSection(); });
    section.append(el('div', { className: 'account-actions' }, out, del), policyLinks());
    return;
  }
  // Signed out.
  section.appendChild(el('div', { className: 'hint' }, 'Sign in to keep your plans the same on all your devices. Everything works without an account, too.'));
  // Plain text for now; Google's official button artwork goes in before launch (their branding rules ask for it).
  const google = el('button', { className: 'btn google-btn', 'data-testid': 'signin-google' }, 'Continue with Google');
  google.disabled = !!account.busy;
  google.addEventListener('click', () => { void signInWithGoogle(); });
  section.append(google, el('div', { className: 'hint', 'data-testid': 'signin-agree' },
    'By signing in, you agree to the ', policyLink(TERMS_URL, 'terms'), ' and the ', policyLink(PRIVACY_URL, 'privacy policy'), '.'));
  if (!emailSignInOn()) {
    section.appendChild(el('div', { className: 'hint', 'data-testid': 'email-later' }, 'Signing in by email arrives with the app’s own email address.'));
    return;
  }
  if (account.linkSentTo) {
    // The code is typed here, so signing in finishes in this copy of the app whatever opens the email.
    section.appendChild(el('div', { className: 'status', 'data-testid': 'link-sent' },
      'We emailed a sign-in code to ', el('b', {}, account.linkSentTo), '. Enter it here. (It can take a minute or two to arrive.)'));
    const code = el('input', { type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 12, placeholder: 'Code', 'aria-label': 'Code from the email', 'data-testid': 'signin-code' }) as HTMLInputElement;
    const verify = el('button', { className: 'btn primary', 'data-testid': 'signin-verify' }, 'Sign in');
    verify.disabled = !!account.busy;
    const go = () => { void verifyEmailCode(code.value); };
    verify.addEventListener('click', go);
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    section.appendChild(el('div', { className: 'email-row' }, code, verify));
    // Straight on to the code (the keyboard stays up), when the code was just asked for here.
    // (Looked up when it runs: the section may have been rebuilt meanwhile.)
    if (focusCodeNext) { focusCodeNext = false; setTimeout(() => document.querySelector<HTMLInputElement>('[data-testid=signin-code]')?.focus(), 0); }
    const again = el('button', { className: 'link-btn' }, 'Use a different email, or send a new code');
    again.addEventListener('click', () => { account.linkSentTo = undefined; account.error = undefined; forgetCodeSent(); refreshAccountSection(); });
    section.appendChild(again);
    return;
  }
  const email = el('input', { type: 'email', inputMode: 'email', autocomplete: 'email', placeholder: 'you@example.com', 'aria-label': 'Email address', 'data-testid': 'signin-email' }) as HTMLInputElement;
  email.value = typedEmail;
  email.addEventListener('input', () => { typedEmail = email.value; });
  const send = el('button', { className: 'btn ghost', 'data-testid': 'signin-send' }, 'Email me a sign-in code');
  send.disabled = !!account.busy;
  const go = () => { focusCodeNext = true; void sendSignInLink(email.value); };
  send.addEventListener('click', go);
  email.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  section.append(el('div', { className: 'or-line' }, 'or'), el('div', { className: 'email-row' }, email, send));
}

/** A link to the privacy policy or the terms, on the website (a new tab, or the browser from the installed app). */
function policyLink(href: string, words: string): HTMLElement {
  return el('a', { href, target: '_blank', rel: 'noopener' }, words);
}
function policyLinks(): HTMLElement {
  return el('div', { className: 'hint policy-links', 'data-testid': 'policy-links' }, policyLink(PRIVACY_URL, 'Privacy policy'), ' · ', policyLink(TERMS_URL, 'Terms'));
}

/**
 * "Have a beta code?": for an account on a trial (started or not) or whose plan ended. A code from the beta
 * invitation makes it a beta account, everything free (supabase/06-beta.sql).
 */
function betaCodeBlock(): HTMLElement | null {
  const p = account.plan?.plan;
  if (p !== 'trial' && p !== 'lapsed') { enteringBetaCode = false; return null; }
  if (!enteringBetaCode) {
    const ask = el('button', { className: 'link-btn', 'data-testid': 'beta-code-open' }, 'Have a beta code?');
    ask.addEventListener('click', () => { enteringBetaCode = true; focusBetaCodeNext = true; account.error = undefined; refreshAccountSection(); });
    return ask;
  }
  const code = el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxLength: 16, placeholder: 'K7PQ-M3XD', 'aria-label': 'Beta code', 'data-testid': 'beta-code' }) as HTMLInputElement;
  const use = el('button', { className: 'btn primary', 'data-testid': 'beta-code-use' }, 'Use code');
  use.disabled = !!account.busy;
  const go = async () => {
    if (!(await redeemBetaCode(code.value))) return;
    enteringBetaCode = false;
    toast('You’re on the beta: everything is free, and your plans sync between your devices.', 6000);
    refreshAccountSection();
  };
  use.addEventListener('click', () => { void go(); });
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') void go(); });
  const cancel = el('button', { className: 'link-btn' }, 'Cancel');
  cancel.addEventListener('click', () => { enteringBetaCode = false; account.error = undefined; refreshAccountSection(); });
  // (Looked up when it runs: the section may have been rebuilt meanwhile.)
  if (focusBetaCodeNext) { focusBetaCodeNext = false; setTimeout(() => document.querySelector<HTMLInputElement>('[data-testid=beta-code]')?.focus(), 0); }
  return el('div', { className: 'beta-code', 'data-testid': 'beta-code-box' },
    el('div', { className: 'hint' }, 'The code from your beta invitation:'),
    el('div', { className: 'email-row' }, code, use), cancel);
}

/** "Synced 2 minutes ago" */
function ago(t: number, now = Date.now()): string {
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
/** Sync: where it stands in plain words, Sync now, the switch for this device, and the trash. */
function syncBlock(): HTMLElement {
  const box = el('div', { className: 'sync-block', 'data-testid': 'sync' });
  if (sync.phase === 'needsStart') {
    const start = el('button', { className: 'btn primary', 'data-testid': 'sync-start' }, 'Turn on sync');
    start.addEventListener('click', () => { void startSyncing(); });
    box.append(start, el('div', { className: 'hint' }, 'Keeps your plans the same on every device you sign in on, and starts your free 30-day trial. The plans on this device are uploaded and plans from your other devices come down; nothing is deleted.'));
    return box;
  }
  const words: Record<string, string> = {
    signedOut: '', syncing: 'Syncing…', offline: 'Will sync when online', off: 'Sync is off on this device',
    paused: `Sync paused: ${sync.message ?? 'your plan doesn’t include it'}`,
    synced: sync.lastAt ? `Synced ${ago(sync.lastAt)}` : 'Synced', error: `Couldn’t sync: ${sync.message ?? 'it will try again'}`,
  };
  const line = el('div', { className: 'status' + (sync.phase === 'error' ? ' warn' : ''), 'data-testid': 'sync-status' }, words[sync.phase] ?? '');
  const now = el('button', { className: 'btn ghost', 'data-testid': 'sync-now' }, 'Sync now');
  now.disabled = sync.phase === 'syncing' || sync.phase === 'off' || sync.phase === 'paused';
  now.addEventListener('click', () => { void runSync(); });
  box.append(el('div', { className: 'account-actions' }, line, now));
  if (sync.phase === 'synced' && sync.message) box.appendChild(el('div', { className: 'status warn' }, sync.message));
  const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
  cb.checked = syncOnThisDevice();
  cb.addEventListener('change', () => setSyncOnThisDevice(cb.checked));
  box.appendChild(el('label', { className: 'check-row', 'data-testid': 'sync-device' }, cb, el('span', {}, 'Sync on this device')));
  if (sync.trash.length) {
    const list = el('div', { className: 'trash-list', 'data-testid': 'trash' }, el('div', { className: 'hint' }, 'Recently deleted (kept 30 days):'));
    for (const t of sync.trash) {
      const restore = el('button', { className: 'link-btn' }, 'Restore');
      restore.addEventListener('click', () => { void restoreFromTrash(t.id); });
      list.appendChild(el('div', { className: 'trash-row' }, el('span', {}, t.name), restore));
    }
    box.appendChild(list);
  }
  return box;
}

/** Delete the account: say exactly what goes and what stays, offer a backup, then ask once more. */
function deleteConfirmation(): HTMLElement {
  const box = el('div', { className: 'confirm-box', 'data-testid': 'delete-confirm' },
    el('div', {}, el('b', {}, 'Delete your account?')),
    el('div', { className: 'hint' }, 'This removes your account and anything stored with it on our server. The plans on this device stay here, and the app keeps working without an account.'));
  const backup = el('button', { className: 'btn ghost', html: I.download + '<span>Save a backup first</span>' });
  backup.addEventListener('click', async () => {
    try { const n = await backupAll('download'); if (n) toast('Backup saved'); } catch (e) { alert('Backup failed: ' + errMsg(e)); }
  });
  const yes = el('button', { className: 'btn danger', 'data-testid': 'delete-account-confirm' }, 'Delete my account');
  yes.disabled = !!account.busy;
  yes.addEventListener('click', async () => {
    if (await deleteAccount()) { confirmingDelete = false; toast('Your account was deleted. Your plans are still on this device.'); }
    refreshAccountSection();
  });
  const no = el('button', { className: 'btn ghost' }, 'Cancel');
  no.addEventListener('click', () => { confirmingDelete = false; refreshAccountSection(); });
  box.append(backup, el('div', { className: 'account-actions' }, no, yes));
  return box;
}
