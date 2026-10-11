import { flushSave, saveIsFailing } from '../storage';

// "Not saved" warning. Added and removed directly (outside #root) rather than
// through render(), because saves fail while the user may be typing and a
// full render would close the Android keyboard.

export function updateSaveWarning() {
  const existing = document.getElementById('save-warning');
  if (!saveIsFailing()) { existing?.remove(); return; }
  if (existing) return;
  const bar = document.createElement('div');
  bar.id = 'save-warning';
  bar.setAttribute('role', 'alert');
  bar.append("Your latest changes haven't been saved. ");
  const retry = document.createElement('button');
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => { void flushSave(); });
  bar.appendChild(retry);
  document.body.appendChild(bar);
}
