import { registerSW } from 'virtual:pwa-register';
import { flushSave } from './storage';

// Offline support and updates. A new version never reloads the app on its
// own: the user gets an "Update" button, and pending edits are saved first.

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
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
    setTimeout(() => location.reload(), 5000);
    await applyUpdate?.(true);
  });
  const later = document.createElement('button');
  later.className = 'later';
  later.textContent = 'Later';
  later.addEventListener('click', () => bar.remove());
  bar.append(text, btn, later);
  document.body.appendChild(bar);
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
