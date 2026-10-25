import { flushSave, hasUnsavedChanges, saveIsFailing, storageIsDurable } from '../storage';

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

/**
 * Whether the plan is saved, in a word, beside the shape count: "Saved" (on this device), "Saving…" for the
 * moment between an edit and its write, "Not saved" when writes fail or the browser won't keep anything.
 */
export function saveStateWord(): { word: string; title: string; bad: boolean } {
  if (!storageIsDurable() || saveIsFailing()) return { word: 'Not saved', title: 'Changes aren\u2019t being saved on this device', bad: true };
  if (hasUnsavedChanges()) return { word: 'Saving\u2026', title: 'Saving on this device', bad: false };
  return { word: 'Saved', title: 'Saved on this device', bad: false };
}
/** Refresh the word in place (no render: a field being typed in keeps its keyboard). */
export function updateSaveState() {
  const node = document.querySelector<HTMLElement>('.project-btn .save-state');
  if (!node) return;
  const s = saveStateWord();
  node.textContent = s.word;
  node.title = s.title;
  node.classList.toggle('bad', s.bad);
}
