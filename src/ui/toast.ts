// Brief, non-blocking status messages ("Backup saved").

let timer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string, ms = 3000) {
  let node = document.getElementById('toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'toast';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    document.body.appendChild(node);
  }
  node.textContent = message;
  placeToast(node);
  // (Again once this frame's drawing is done: a notice raised as a shape is selected comes before its chip.)
  const n = node;
  requestAnimationFrame(() => placeToast(n));
  node.classList.add('show');
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => node!.classList.remove('show'), ms);
}

/**
 * Where a notice goes: above whatever sits at the foot of the plan (the selected shape's chip with Edit and More,
 * the bar for several shapes), so it never covers their buttons; with a sheet open, at the top, clear of the
 * sheet's own buttons below. (It lets taps through all the same.)
 */
export function placeToast(node: HTMLElement) {
  node.style.top = '';
  node.style.bottom = '';
  if (document.querySelector('.sheet')) {
    node.style.top = 'calc(60px + env(safe-area-inset-top))';
    node.style.bottom = 'auto';
    return;
  }
  let top = Infinity;
  for (const e of document.querySelectorAll('.sel-pill, .multi-bar')) {
    const r = e.getBoundingClientRect();
    if (r.height > 0) top = Math.min(top, r.top);
  }
  if (top < Infinity) node.style.bottom = `${Math.max(80, Math.round(window.innerHeight - top + 8))}px`;
}

/**
 * A notice with buttons ("Squared the corners. Undo"), kept up long enough to reach: tapping a button runs it
 * and closes the notice (unless it's `keep`: turning a setting off leaves the Undo there). A new notice
 * replaces it.
 */
export function toastAction(message: string, actions: { label: string; run: () => void; keep?: boolean }[], ms = 10000) {
  toast('', 1); // (clears a plain toast)
  document.getElementById('toast-action')?.remove();
  const node = document.createElement('div');
  node.id = 'toast-action';
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  const text = document.createElement('span');
  text.textContent = message;
  node.appendChild(text);
  for (const a of actions) {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.addEventListener('click', () => { if (a.keep) b.remove(); else node.remove(); a.run(); });
    node.appendChild(b);
  }
  document.body.appendChild(node);
  setTimeout(() => node.remove(), ms);
}
/** Close a notice with buttons, if one is up (the next drawing starts, say). */
export function dismissToastAction() { document.getElementById('toast-action')?.remove(); }
