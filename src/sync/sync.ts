import { account, loadPlan, supabaseClient, type PlanInfo } from '../account';
import { flushSave, installId, resetSyncState, setSyncHooks } from '../storage';
import { syncOnce, type SyncReport, type ServerProject } from './engine';
import { storageLocal } from './local';
import { supabaseRemote } from './remote';

// When sync runs, and what it says. Sync is on for a signed-in account whose
// plan includes it (a started trial, a subscription, the beta), unless it's
// switched off on this device. It runs by itself:
//   up:   about 5 seconds after edits settle, and as soon as the app is put away;
//   down: when the app opens or comes back to the screen, and every 2 minutes;
//   and when asked (Sync now).
// Everything is saved on the device first; sync only copies.

export type SyncPhase = 'signedOut' | 'needsStart' | 'off' | 'syncing' | 'synced' | 'offline' | 'paused' | 'error';
export interface SyncStatus { phase: SyncPhase; lastAt?: number; message?: string; trash: ServerProject[] }
export const sync: SyncStatus = { phase: 'signedOut', trash: [] };

const DEVICE_SWITCH_KEY = 'lp-sync-device';
const LAST_USER_KEY = 'lp-sync-user';
const UP_DELAY_MS = 5000;
const DOWN_EVERY_MS = 2 * 60 * 1000;

let onStatus: () => void = () => {};
let onChanged: (report: SyncReport) => void = () => {};
let screenBusy: () => boolean = () => false;
let showOpen: () => Promise<void> | void = () => {};
/** The page's part: how to show status and results, when the open plan mustn't be replaced, how to show it after. */
export function setSyncUi(ui: { status: () => void; changed: (r: SyncReport) => void; busy: () => boolean; showOpen: () => Promise<void> | void }) {
  onStatus = ui.status; onChanged = ui.changed; screenBusy = ui.busy; showOpen = ui.showOpen;
}
function setStatus(patch: Partial<SyncStatus>) { Object.assign(sync, patch); onStatus(); }

// ---------- On or off ----------
export function syncOnThisDevice(): boolean {
  try { return localStorage.getItem(DEVICE_SWITCH_KEY) !== 'off'; } catch { return true; }
}
export function setSyncOnThisDevice(on: boolean) {
  try { localStorage.setItem(DEVICE_SWITCH_KEY, on ? 'on' : 'off'); } catch { /* not remembered */ }
  refreshPhase();
  if (on) void runSync();
}
/** Whether the plan includes sync right now. */
export function planAllowsSync(p: PlanInfo | null | undefined, now = Date.now()): boolean {
  if (!p) return false;
  if (p.plan === 'beta') return true;
  if (p.plan === 'active') return !p.paidUntil || Date.parse(p.paidUntil) > now;
  if (p.plan === 'trial') return !!p.trialEnds && Date.parse(p.trialEnds) > now;
  return false;
}
/** A trial that hasn't started: sync waits to be turned on (which starts it). */
export function trialNotStarted(p: PlanInfo | null | undefined): boolean {
  return !!p && p.plan === 'trial' && !p.trialEnds;
}
function refreshPhase() {
  if (account.status !== 'signedIn') return setStatus({ phase: 'signedOut', message: undefined });
  if (trialNotStarted(account.plan)) return setStatus({ phase: 'needsStart' });
  if (!syncOnThisDevice()) return setStatus({ phase: 'off' });
  if (account.plan && !planAllowsSync(account.plan)) return setStatus({ phase: 'paused', message: pausedWhy(account.plan) });
  if (sync.phase === 'signedOut' || sync.phase === 'needsStart' || sync.phase === 'off' || sync.phase === 'paused') setStatus({ phase: sync.lastAt ? 'synced' : 'syncing' });
}
function pausedWhy(p: PlanInfo | null | undefined): string {
  return p?.plan === 'trial' ? 'your free trial has ended' : 'your subscription has ended';
}

/** Turn sync on for the first time: starts the free trial (once per email and per install). */
export async function startSyncing() {
  try {
    setStatus({ phase: 'syncing', message: undefined });
    const c = await supabaseClient();
    const { error } = await c.rpc('start_trial', { p_install: await installId() });
    if (error) throw new Error(error.message);
    await loadPlan();
    setSyncOnThisDevice(true);
  } catch (e) {
    setStatus({ phase: 'error', message: messageFor(e) });
  }
}

// ---------- Running ----------
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Sync soon (edits settle first). */
export function scheduleSync(delay = UP_DELAY_MS) {
  if (!canRun()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void runSync(); }, delay);
}
function canRun(): boolean {
  return account.status === 'signedIn' && !!account.plan && planAllowsSync(account.plan) && syncOnThisDevice();
}
/** Sync now (one pass at a time; a request during a pass runs another after it). */
export function runSync(): Promise<void> {
  refreshPhase();
  if (!canRun()) return Promise.resolve();
  if (timer) { clearTimeout(timer); timer = null; }
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      await onePass();
    } while (again && canRun());
  })().finally(() => { running = null; });
  return running;
}
async function onePass() {
  if (!navigator.onLine) { setStatus({ phase: 'offline', message: undefined }); return; }
  setStatus({ phase: 'syncing', message: undefined });
  try {
    if (!(await flushSave())) throw new Error('This device couldn’t save the latest changes, so they weren’t synced');
    const c = await supabaseClient();
    await forgetOtherAccount();
    const remote = supabaseRemote(c, deviceName());
    const report = await syncOnce(storageLocal(screenBusy, showOpen), remote, deviceName());
    const listed = await remote.list();
    const trash = listed.filter((s) => s.deleted_at);
    if (report.paused) { await loadPlan(); setStatus({ phase: 'paused', message: pausedWhy(account.plan), trash }); }
    else setStatus({ phase: 'synced', lastAt: Date.now(), message: report.full ? 'Your account has reached its limit of 500 projects; new ones stay on this device.' : undefined, trash });
    if (report.uploaded || report.downloaded || report.conflicts.length || report.removed.length || report.restored.length) onChanged(report);
  } catch (e) {
    setStatus({ phase: navigator.onLine ? 'error' : 'offline', message: messageFor(e) });
  }
}
/** What this device last synced was another account's: start fresh (nothing on the device changes). */
async function forgetOtherAccount() {
  const me = account.userId;
  if (!me) return;
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_USER_KEY); } catch { /* unknown */ }
  if (last !== me) {
    await resetSyncState();
    try { localStorage.setItem(LAST_USER_KEY, me); } catch { /* not remembered */ }
  }
}
function messageFor(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/fetch|network|load failed/i.test(m)) return 'Couldn’t reach the server. It will try again.';
  return m;
}

/** Bring a project back from the server's trash (it comes down at once). */
export async function restoreFromTrash(id: string) {
  try {
    const c = await supabaseClient();
    const { error } = await c.rpc('restore_project', { p_id: id, p_device: deviceName() });
    if (error) throw new Error(error.message);
    sync.trash = sync.trash.filter((t) => t.id !== id);
    await runSync();
  } catch (e) {
    setStatus({ phase: 'error', message: messageFor(e) });
  }
}

// ---------- This device, as other devices will see it named ----------
export function deviceName(ua = navigator.userAgent): string {
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/CrOS/i.test(ua)) return 'Chromebook';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Linux/i.test(ua)) return 'Linux computer';
  return 'another device';
}

// ---------- Starting ----------
let started = false;
/** Hook sync to saves, project changes, the app being put away or brought back, and the clock. */
export function startSyncTriggers() {
  if (started) return;
  started = true;
  setSyncHooks(() => scheduleSync(), () => scheduleSync(2000));
  document.addEventListener('visibilitychange', () => {
    // Put away: send what's waiting now (phones close apps in the background). Back: fetch.
    void runSync();
  });
  window.addEventListener('online', () => { void runSync(); });
  setInterval(() => { if (document.visibilityState === 'visible') void runSync(); }, DOWN_EVERY_MS);
}
/** The account changed (signed in, plan loaded, signed out). */
export function onAccountChange() {
  const before = sync.phase;
  refreshPhase();
  if (canRun() && (before === 'signedOut' || before === 'needsStart' || before === 'off' || before === 'paused' || !sync.lastAt)) void runSync();
}
export function _resetSyncForTests() { started = false; running = null; again = false; sync.phase = 'signedOut'; sync.lastAt = undefined; sync.trash = []; }
