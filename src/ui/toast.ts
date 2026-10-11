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
