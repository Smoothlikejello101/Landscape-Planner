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
  node.classList.add('show');
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => node!.classList.remove('show'), ms);
}

/**
 * A notice with buttons ("Snapped to the house. Undo"), kept up long enough to reach: tapping a button runs
 * it and closes the notice. A new notice replaces it.
 */
export function toastAction(message: string, actions: { label: string; run: () => void }[], ms = 8000) {
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
    b.addEventListener('click', () => { node.remove(); a.run(); });
    node.appendChild(b);
  }
  document.body.appendChild(node);
  setTimeout(() => node.remove(), ms);
}
/** Close a notice with buttons, if one is up (the next drawing starts, say). */
export function dismissToastAction() { document.getElementById('toast-action')?.remove(); }
