import { account, deleteAccount, planText, sendSignInLink, signInWithGoogle, signOut } from '../account';
import { backupAll } from '../backup';
import { el } from '../dom';
import { I } from '../icons';
import { errMsg } from '../util';
import { toast } from './toast';

// The Account section of the Projects panel. It's refreshed in place when the
// account changes (signing in finishes, a plan loads), never by a full render,
// and an email being typed keeps its text and focus across a refresh.

/** "Delete my account" asked: the confirmation is showing. */
let confirmingDelete = false;

export function accountSection(): HTMLElement {
  const section = el('div', { className: 'account-section', 'data-testid': 'account' }, el('div', { className: 'section-title' }, 'Account'));
  fill(section);
  return section;
}
/** The email typed so far (kept when the section is rebuilt, e.g. to show an error). */
let typedEmail = '';

/** Rebuild the Account section where it stands, if it's showing (kept typing-safe). */
export function refreshAccountSection() {
  const old = document.querySelector<HTMLElement>('[data-testid=account]');
  if (!old) return;
  const typing = document.activeElement instanceof HTMLInputElement && old.contains(document.activeElement) ? document.activeElement : null;
  const typed = typing?.value, caret = typing?.selectionStart ?? null;
  const fresh = el('div', { className: 'account-section', 'data-testid': 'account' }, el('div', { className: 'section-title' }, 'Account'));
  fill(fresh);
  old.replaceWith(fresh);
  if (typing) {
    const again = fresh.querySelector<HTMLInputElement>('[data-testid=signin-email]');
    if (again) { again.value = typed ?? ''; again.focus(); if (caret != null) again.setSelectionRange(caret, caret); }
  }
}

function fill(section: HTMLElement) {
  if (account.error) section.appendChild(el('div', { className: 'status warn', role: 'alert', 'data-testid': 'account-error' }, account.error));
  if (account.status === 'unknown') {
    section.appendChild(el('div', { className: 'status' }, 'Checking your account…'));
    return;
  }
  if (account.status === 'signedIn') {
    section.appendChild(el('div', { className: 'status', 'data-testid': 'signed-in' }, 'Signed in as ', el('b', {}, account.email ?? '')));
    const plan = planText(account.plan);
    if (plan) section.appendChild(el('div', { className: 'status', 'data-testid': 'plan' }, plan));
    section.appendChild(el('div', { className: 'hint' }, 'Syncing your plans between devices comes in the next update. Your plans stay on this device as always.'));
    if (confirmingDelete) { section.appendChild(deleteConfirmation()); return; }
    const out = el('button', { className: 'btn ghost', 'data-testid': 'sign-out' }, 'Sign out');
    out.disabled = !!account.busy;
    out.addEventListener('click', () => { void signOut(); });
    const del = el('button', { className: 'link-btn danger-link', 'data-testid': 'delete-account' }, 'Delete my account…');
    del.addEventListener('click', () => { confirmingDelete = true; refreshAccountSection(); });
    section.append(el('div', { className: 'account-actions' }, out, del));
    return;
  }
  // Signed out.
  section.appendChild(el('div', { className: 'hint' }, 'An account will keep your plans on all your devices: syncing comes in the next update. Everything works without one, too.'));
  // Plain text for now; Google's official button artwork goes in before launch (their branding rules ask for it).
  const google = el('button', { className: 'btn google-btn', 'data-testid': 'signin-google' }, 'Continue with Google');
  google.disabled = !!account.busy;
  google.addEventListener('click', () => { void signInWithGoogle(); });
  section.appendChild(google);
  if (account.linkSentTo) {
    section.appendChild(el('div', { className: 'status', 'data-testid': 'link-sent' },
      'We emailed a sign-in link to ', el('b', {}, account.linkSentTo), '. Open it on this device to finish signing in.'));
    const again = el('button', { className: 'link-btn' }, 'Use a different email');
    again.addEventListener('click', () => { account.linkSentTo = undefined; refreshAccountSection(); });
    section.appendChild(again);
    return;
  }
  const email = el('input', { type: 'email', inputMode: 'email', autocomplete: 'email', placeholder: 'you@example.com', 'aria-label': 'Email address', 'data-testid': 'signin-email' }) as HTMLInputElement;
  email.value = typedEmail;
  email.addEventListener('input', () => { typedEmail = email.value; });
  const send = el('button', { className: 'btn ghost', 'data-testid': 'signin-send' }, 'Email me a sign-in link');
  send.disabled = !!account.busy;
  const go = () => { void sendSignInLink(email.value); };
  send.addEventListener('click', go);
  email.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  section.append(el('div', { className: 'or-line' }, 'or'), el('div', { className: 'email-row' }, email, send));
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
