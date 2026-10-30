// Keyboard focus through the app's redraws (Alex and Tom, Oct 30, from round 2: a sheet opened and Tab went to "My
// Garden" behind it; every choice in a sheet dropped focus to the page, eleven Shift+Tabs from where it was).
//
// render() rebuilds the app, so the element that had focus is gone after each one. With a keyboard in use (the last
// thing pressed was a key, not a finger or the mouse), this puts focus back on the same control in the new drawing;
// moves it into a sheet that just opened; brings it back to what opened a sheet that just closed; and keeps Tab
// inside an open sheet. Never a field that holds typing: on a phone that would open its keyboard (CLAUDE.md), and the
// app's text fields redraw without a full render anyway. With a finger or a mouse, focus is left as the browser has it.

/** What can take focus, for Tab. */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

let viaKeys = false;
/** Whether the keyboard is what's being used now (the last press was a key). */
export const usingKeys = () => viaKeys;

/** A field that holds typing (text, a number, a choice being made), not a button, box or slider. */
export function holdsTyping(t: Element | null): boolean {
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  return t instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'submit', 'color', 'file'].includes(t.type);
}

/** A control as it can be found again in a new drawing: by what it is, then without its words (a summary that changed). */
const strong = (e: Element) => [e.tagName, e.getAttribute('data-testid') ?? '', e.getAttribute('aria-label') ?? '', e.id, (e as HTMLInputElement).type ?? '', (e.textContent ?? '').trim().slice(0, 80)].join('|');
const weak = (e: Element) => {
  const section = e.closest('[data-section], [data-testid]');
  return [e.tagName, e.getAttribute('data-testid') ?? '', (e as HTMLInputElement).type ?? '', section && section !== e ? section.getAttribute('data-section') ?? section.getAttribute('data-testid') : ''].join('|');
};
interface Found { s: string; w: string; i: number; wi: number; inSheet: boolean }
function find(e: Element, root: ParentNode): Found {
  const all = [...root.querySelectorAll(FOCUSABLE)];
  const s = strong(e), w = weak(e);
  return { s, w, i: all.filter((x) => strong(x) === s).indexOf(e), wi: all.filter((x) => weak(x) === w).indexOf(e), inSheet: !!e.closest('.overlay') };
}
function again(f: Found, root: ParentNode): HTMLElement | null {
  const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => !!x.closest('.overlay') === f.inSheet);
  const byText = all.filter((x) => strong(x) === f.s);
  if (byText.length) return byText[Math.min(f.i, byText.length - 1)] ?? null;
  const byPlace = all.filter((x) => weak(x) === f.w);
  return byPlace.length ? byPlace[Math.min(Math.max(f.wi, 0), byPlace.length - 1)] ?? null : null;
}

let before: Found | null = null;
let hadSheet = false;
/** What opened the sheet that's open: focus goes back there when it closes. */
let opener: Found | null = null;

/** Before a redraw: what has focus, to find it again. */
export function focusBeforeRender(root: HTMLElement) {
  const a = document.activeElement;
  before = viaKeys && a && a !== document.body && root.contains(a) && !holdsTyping(a) ? find(a, root) : null;
  hadSheet = !!root.querySelector('.overlay');
}

/** After a redraw: focus back where it was, into a sheet that opened, or back to what opened one that closed. */
export function focusAfterRender(root: HTMLElement) {
  const sheet = root.querySelector<HTMLElement>('.overlay');
  const lost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;
  if (!viaKeys) { if (sheet && !hadSheet) opener = null; before = null; return; }
  if (sheet && !hadSheet) {
    // A sheet opened: what opened it is remembered; focus goes to its first control (not its close button), unless
    // the sheet put it somewhere itself (the picker's search).
    opener = before;
    if (!sheet.contains(document.activeElement)) firstIn(sheet)?.focus({ preventScroll: true });
  } else if (!sheet && hadSheet) {
    // It closed: back to what opened it, else to where focus was.
    const back = (opener && again(opener, root)) || (before && again(before, root));
    opener = null;
    if (back && lost) back.focus({ preventScroll: true });
  } else if (before && lost) {
    // The same view drawn again: the same control.
    const same = again(before, root);
    if (same) same.focus({ preventScroll: true });
    else if (sheet) firstIn(sheet)?.focus({ preventScroll: true });
    else tourButton()?.focus({ preventScroll: true }); // (a step of the tour that replaced it: its main button)
  }
  before = null;
}

/** The guided introduction's main button for the step showing, if it's under way (Alex: each step dropped focus). */
function tourButton(): HTMLElement | null {
  for (const id of ['intro-done', 'intro-go', 'intro-skip']) {
    const b = document.querySelector<HTMLElement>(`[data-testid=intro-card] [data-testid=${id}]`);
    if (b) return b;
  }
  return null;
}
/** A sheet's first control, past its header's close button. */
function firstIn(sheet: HTMLElement): HTMLElement | null {
  const all = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
  return all.find((x) => !x.closest('.sheet-header')) ?? all[0] ?? null;
}

/** Tab inside an open sheet wraps around it, rather than walking the plan behind it. */
function trapTab(e: KeyboardEvent) {
  if (e.key !== 'Tab' || e.defaultPrevented) return;
  if (document.querySelector('.ask-overlay')) return; // (a question keeps its own: src/ui/ask.ts)
  const sheet = document.querySelector<HTMLElement>('#root .overlay');
  if (!sheet) return;
  const all = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
  if (!all.length) return;
  const at = all.indexOf(document.activeElement as HTMLElement);
  if (at === -1) { e.preventDefault(); all[0].focus(); return; }
  if (!e.shiftKey && at === all.length - 1) { e.preventDefault(); all[0].focus(); }
  else if (e.shiftKey && at === 0) { e.preventDefault(); all[all.length - 1].focus(); }
}

let installed = false;
/** Watch which is in use, keys or pointer, and keep Tab inside sheets. Once, at start-up. */
export function installFocusKeeping() {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    // (A key typed into a field is typing, not moving about; a phone's keyboard sends "Unidentified".)
    if (e.key === 'Unidentified' || e.key === 'Process' || (holdsTyping(e.target as Element) && e.key !== 'Tab' && e.key !== 'Escape')) return;
    viaKeys = true;
  }, true);
  window.addEventListener('pointerdown', () => { viaKeys = false; }, true);
  window.addEventListener('keydown', trapTab, true);
}
