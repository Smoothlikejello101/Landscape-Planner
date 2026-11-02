import { registerSW } from 'virtual:pwa-register';
import { resizeCanvas } from './canvas';
import { flushSave } from './storage';

// Offline support and updates. A new version never reloads the app on its
// own: the user gets an "Update" button, and pending edits are saved first.

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
/** The app's service worker, once registered (none in a browser that doesn't run them, or where they're blocked). */
let registration: ServiceWorkerRegistration | null = null;
/** Whether a new version has installed and waits for the person's Update. */
let waiting = false;
const listeners = new Set<() => void>();
/** Told when a new version comes to wait (⋮'s version line, if it's open: src/ui/menu.ts). */
export function onUpdateWaiting(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export const updateWaiting = () => waiting;

/**
 * The banner, while an update waits: a bar under the top bar, in the page's flow, so the plan is shortened by it rather
 * than covered (the UI review, 2026-11-01: floating over the plan, it covered the Fit and Through-the-year buttons).
 * Each redraw puts it back under the top bar (src/ui/render.ts).
 */
let banner: HTMLElement | null = null;
/** The banner put under the top bar now, or taken away, and the plan sized to what's left. */
function placeBanner() {
  const topbar = document.querySelector('.app > .topbar');
  // (No app drawn yet: kept on the page for the first drawing to find and put in its place.)
  if (banner && banner.previousElementSibling !== topbar) { if (topbar) topbar.after(banner); else document.body.appendChild(banner); }
  resizeCanvas();
}

/**
 * The new version, now, as the person asked (the banner's Update, ⋮'s Update now): pending edits saved first, then the
 * new version takes over and the app reloads into it. Only ever on their tap (CLAUDE.md).
 */
export async function updateNow() {
  await flushSave();
  // If no new worker is actually waiting, nothing would happen: reload anyway.
  setTimeout(() => location.reload(), 10_000);
  await applyUpdate?.(true);
}

function showUpdateBanner() {
  waiting = true;
  for (const fn of listeners) fn();
  if (banner) return;
  const bar = document.createElement('div');
  bar.id = 'update-banner';
  bar.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = 'A new version of the app is ready.';
  const btn = document.createElement('button');
  btn.textContent = 'Update';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Updating…';
    await updateNow();
  });
  const later = document.createElement('button');
  later.className = 'later';
  later.textContent = 'Later';
  later.addEventListener('click', () => { bar.remove(); banner = null; placeBanner(); });
  bar.append(text, btn, later);
  banner = bar;
  placeBanner();
}

export function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  applyUpdate = registerSW({
    onNeedRefresh: showUpdateBanner,
    onRegisterError: (e) => console.warn('Service worker registration failed', e),
    // Check for a new version hourly while the app stays open.
    onRegisteredSW: (_url, reg) => { if (reg) { registration = reg; setInterval(() => void reg.update(), 60 * 60 * 1000); } },
  });
}

/**
 * Look for a new version now (⋮'s "Check for updates": Jason, from the UI review, 2026-11-01): 'ready' when one has
 * installed and waits for the person's Update (it's never put in without it); 'none' when this is the newest;
 * 'failed' when the check couldn't be made (offline, say); 'unavailable' where the app runs without its service
 * worker, so each opening is the newest anyway.
 */
export async function checkForUpdate(): Promise<'ready' | 'none' | 'failed' | 'unavailable'> {
  if (waiting) return 'ready';
  const reg = registration ?? (await navigator.serviceWorker?.getRegistration?.().catch(() => undefined)) ?? null;
  if (!reg) return 'unavailable';
  try { await reg.update(); } catch { return 'failed'; }
  // (A new version found is fetched and installed before it can wait: up to a minute, on a slow connection.)
  const installing = reg.installing;
  if (installing) {
    await new Promise<void>((done) => {
      const t = setTimeout(done, 60_000);
      installing.addEventListener('statechange', () => { if (installing.state !== 'installing') { clearTimeout(t); done(); } });
    });
  }
  return waiting || reg.waiting ? 'ready' : 'none';
}
