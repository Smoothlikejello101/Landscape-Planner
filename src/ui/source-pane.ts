// Where a fact came from, out of the way until it's asked for (Jason, Nov 4, note 1, on the picker's two-line
// hardiness citation: "A clickable 'source' that opens up a little pane with the info? We might be able to use that same
// design note all around"). A small "Source" (or a citation cut to its line) opens a little pane under it with the
// citation in full; a press anywhere outside it, Escape, or the same button again closes it. One open at a time.
//
// For a keyboard and a screen reader: the trigger is a button (a real one, or role=button with Enter and Space) that says
// whether its pane is open (aria-expanded) and which it is (aria-controls); the pane follows it in the page, so a screen
// reader reads it next and Tab reaches a link in it. Escape closes it from anywhere with the focus back on its trigger,
// before Escape closes the sheet it's in (src/main.ts). Opening and closing it changes only it, never a render(): a
// search in the picker keeps its keyboard (CLAUDE.md).

import { el, type Child } from '../dom';

/** The pane open now: its trigger, and the pane (holding what it says only while it's open). */
let open: { trigger: HTMLElement; pane: HTMLElement } | null = null;
let ids = 0;

/** The pane open now closed. `refocus`: the focus back on its trigger (Escape). True if one was open. */
export function closeSourcePane(refocus = false): boolean {
  const o = open;
  open = null;
  if (!o) return false;
  o.pane.hidden = true;
  o.pane.replaceChildren();
  o.trigger.setAttribute('aria-expanded', 'false');
  o.trigger.closest('.src-pop')?.classList.remove('open');
  document.removeEventListener('pointerdown', outside, true);
  if (refocus && o.trigger.isConnected) o.trigger.focus({ preventScroll: true });
  return o.pane.isConnected; // (one drawn away since is closed already: Escape goes on to the sheet)
}
/** Whether a pane is open (and still on the page). */
export const sourcePaneOpen = (): boolean => !!open?.pane.isConnected;

/** A press outside the open pane and its trigger: it closes (the press goes on to whatever it was on). */
function outside(e: Event) {
  const t = e.target as Node | null;
  if (!open || (t && (open.pane.contains(t) || open.trigger.contains(t)))) return;
  closeSourcePane();
}

/** Kept inside the screen (and the sheet it's in) sideways, once it's shown and can be measured. */
function keepInView(pane: HTMLElement) {
  pane.style.left = '';
  const box = pane.closest('.sheet, .overlay')?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth };
  const r = pane.getBoundingClientRect(), margin = 8;
  const right = Math.min(box.right, window.innerWidth) - margin, left = Math.max(box.left, 0) + margin;
  let shift = 0;
  if (r.right > right) shift = right - r.right;
  if (r.left + shift < left) shift = left - r.left;
  if (shift) pane.style.left = `${shift}px`;
  pane.scrollIntoView?.({ block: 'nearest' });
}

function toggle(trigger: HTMLElement, pane: HTMLElement, content: () => Child) {
  const wasOpen = open?.pane === pane;
  closeSourcePane();
  if (wasOpen) return;
  pane.replaceChildren(el('span', {}, content()));
  pane.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  trigger.closest('.src-pop')?.classList.add('open');
  open = { trigger, pane };
  document.addEventListener('pointerdown', outside, true);
  keepInView(pane);
}

/**
 * A pane with `content` (the citation in full: text, links; made as it opens, and gone as it closes, so a page's text
 * holds it once), opened by `trigger`, which is placed in a wrapper with the pane after it. A trigger that isn't a
 * button is made one (role, focus, Enter and Space). Returns the wrapper.
 */
export function withSourcePane(trigger: HTMLElement, content: () => Child, o: { testid?: string; wrap?: HTMLElement } = {}): HTMLElement {
  const id = `src-pane-${++ids}`;
  const pane = el('div', { className: 'src-pane', id, role: 'note', hidden: true, 'data-testid': o.testid ?? 'source-pane' });
  // (A click in the pane, on a link say, isn't a click on what holds it: a row that opens, a label.)
  pane.addEventListener('click', (e) => e.stopPropagation());
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', id);
  if (!(trigger instanceof HTMLButtonElement)) {
    trigger.setAttribute('role', 'button');
    trigger.tabIndex = 0;
    trigger.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      toggle(trigger, pane, content);
    });
  }
  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(trigger, pane, content);
  });
  const wrap = o.wrap ?? el('span', {});
  wrap.classList.add('src-pop');
  wrap.append(trigger, pane);
  return wrap;
}

/**
 * The small "Source" button, its pane holding `content`. `name`: what it's the source of, for a screen reader ("Source
 * of the hardiness zones").
 */
export function sourceButton(content: () => Child, o: { name?: string; testid?: string } = {}): HTMLElement {
  const b = el('button', { type: 'button', className: 'src-btn', 'data-testid': o.testid ?? 'source-btn', ...(o.name ? { 'aria-label': `Source of ${o.name}` } : {}) }, 'Source');
  return withSourcePane(b, content, { testid: o.testid ? `${o.testid}-pane` : undefined });
}
