import { registerSW } from 'virtual:pwa-register';
import { resizeCanvas } from './canvas';
import { flushSave } from './storage';

// Offline support and updates. A new version never reloads the app on its
// own: the user gets an "Update" button, and pending edits are saved first.

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

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

function showUpdateBanner() {
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
    await flushSave();
    // If no new worker is actually waiting, nothing would happen: reload anyway.
    setTimeout(() => location.reload(), 10_000);
    await applyUpdate?.(true);
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
    onRegisteredSW: (_url, reg) => { if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000); },
  });
}
