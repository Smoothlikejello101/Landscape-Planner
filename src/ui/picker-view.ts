// Keeping the plan in view while choosing plants (Jason, Nov 2, from the bed review's S3: "Half-height picker on a
// phone, a side panel on a computer"). Choosing plants for a bed, the picker covered the plan: the bed being planted
// couldn't be seen.
//
// Narrower than 900 px (a phone, a tablet held upright; the width at which Warnings goes beside the plan:
// src/ui/warnings-sheet.ts), the picker opens at rest, 60% of the screen (half until Jason's notes of Nov 4), the top of
// the plan above it, not dimmed. Its handle, pressed or dragged, takes it to full height and back; swiped down from
// rest, it closes (Jason, Nov 4, note 3); while its search is typed in, it's full height for as long as the keyboard is
// up. 900 px and wider (a computer), it's a panel at the right, the plan's height, the plan beside it. Either way the
// plan pans and zooms, and nothing on it is picked, moved or placed (src/gestures.ts planLookOnly); a tap on it closes
// the picker, as a tap on the plan closes a panel everywhere else (Jason, Nov 4, note 3: "It breaks with the way panels
// work everywhere else otherwise"), and a drag still only pans ("I do very much like the ability to scroll around the
// plan with the picker open"). Opened with something selected (Swap, a bed), the plan pans to show it in the part left
// in sight, zooming out only if it doesn't fit there; closed, the view stays as it is.
//
// All of it by CSS classes and the plan's own redraw, never a render() but on closing: the search keeps its keyboard
// (CLAUDE.md). The rest or full choice is kept for the session only, never stored.

import { pickingBed, plantingFor } from '../bed-plant';
import type { Shape } from '../types';
import { el, hasKeyboard } from '../dom';
import { shapeBBox, unionBounds } from '../geometry';
import { keyboardInset } from '../keyboard';
import { restHeight } from '../app-height';
import { keyboardUp, sameView, settleSheet, sheetHeights, viewToShow, type Room, type SheetSize } from '../plan-in-view';
import { state } from '../state';
import { saveView } from '../storage';
import { wideNow } from './warnings-sheet';
import { rescaleShown } from './rescale-card';
import { render } from './render';

/**
 * The plan behind the plant picker: there to look at, panned and zoomed, nothing on it picked, moved or placed. So too
 * while a bed is picked on it for the picker (Plant this bed's Pick on the plan): a tap picks the bed, nothing else.
 * And while "Was your plan drawn over the photo?" shows it as Move would leave it (src/ui/rescale-card.ts).
 */
export const planLookOnly = (): boolean => state.panel === 'plants' || pickingBed() || rescaleShown();

/** At rest or full height on a phone, as last chosen with the handle (this session only). */
let chosen: SheetSize = 'rest';
/** The search focused on a touch screen: full height while its keyboard is up (`kbUp`, once it's been seen). */
let searching = false, sawKeyboard = false, kbUp = false;
/** The window's size when the search was focused, before its keyboard came up. */
let restH = 0, restW = 0;
/**
 * The search left for something in the picker (a row opened, Place, a filter) while it was full height: kept full, so
 * what was pressed stays where it was rather than dropping with the picker's top, until the handle says otherwise or the
 * picker closes. Left any other way (Enter, Back, the keyboard put away), it goes back to rest.
 */
let heldFull = false;
const full = (): boolean => chosen === 'full' || heldFull || (searching && (kbUp || !sawKeyboard));
const isSearch = (t: EventTarget | null): boolean => t instanceof HTMLInputElement && t.dataset.testid === 'plant-search';

/** The picker's sheet classes, as it's drawn. */
export const pickerSheetClass = (): string => 'sheet picker-sheet' + (full() ? ' full' : '');

/** The handle's words: what pressing it does. */
const handleSaid = (isFull: boolean) => (isFull ? 'Shorter: more of the plan in view' : 'Full height: more of the list in view');

/** The picker's height and its handle as they now should be, in place. */
function apply() {
  const f = full();
  for (const sheet of document.querySelectorAll<HTMLElement>('.picker-sheet')) {
    sheet.classList.toggle('full', f);
    const h = sheet.querySelector<HTMLElement>('[data-testid=picker-handle]');
    if (h) { h.setAttribute('aria-expanded', String(f)); h.setAttribute('aria-label', handleSaid(f)); h.title = handleSaid(f); }
  }
}
function choose(to: SheetSize) {
  chosen = to;
  heldFull = false;
  // (At rest while typing: the keyboard put away with the search left, or it would hold the picker at full height.)
  if (to === 'rest' && searching && isSearch(document.activeElement)) (document.activeElement as HTMLElement).blur();
  apply();
}

// ---------- The search and the keyboard ----------
/**
 * The search in use: full height until it's left. On a touch screen as it's focused, its keyboard about to come up over
 * the picker. With a keyboard and a mouse (a computer's window that narrow), once something's typed in it: the cursor
 * goes there as the picker opens, which leaves it at rest until then. Beside the plan, never: it's full height.
 */
function searchStarted(typed: boolean) {
  if (wideNow() || (typed ? !hasKeyboard() : hasKeyboard())) return;
  if (!searching) { restH = window.innerHeight; restW = window.innerWidth; sawKeyboard = false; kbUp = false; }
  searching = true;
  apply();
}
function searchLeft() {
  // (Drawn again while typed in, the picker's search is a new box, focused at once: still searching.)
  if (isSearch(document.activeElement)) return;
  searching = false; sawKeyboard = false; kbUp = false;
  apply();
}
/** The window changed size while the search has focus: the keyboard came up, or went. CSS only. */
function windowChanged() {
  if (!searching || hasKeyboard()) return; // (a computer's window made smaller is no keyboard)
  if (window.innerWidth !== restW) { restW = window.innerWidth; restH = window.innerHeight; return; } // (turned: begin again)
  kbUp = keyboardUp(restH, window.innerHeight, keyboardInset());
  if (kbUp) sawKeyboard = true;
  apply();
}
let installed = false;
function install() {
  if (installed) return;
  installed = true;
  document.addEventListener('focusin', (e) => { if (isSearch(e.target)) searchStarted(false); });
  document.addEventListener('input', (e) => { if (isSearch(e.target) && (e.target as HTMLInputElement).value) searchStarted(true); });
  document.addEventListener('focusout', (e) => {
    if (!isSearch(e.target)) return;
    const to = e.relatedTarget;
    if (searching && full() && to instanceof Element && !isSearch(to) && to.closest('.picker-sheet')) heldFull = true;
    setTimeout(searchLeft, 0);
  });
  window.addEventListener('resize', windowChanged);
  window.visualViewport?.addEventListener('resize', windowChanged);
}

/**
 * The picker closed (src/ui/render.ts): a height held by a press in it goes, and so does its search (closed while typed
 * in, Place pressed say, its box is gone without always saying it lost the focus); the height chosen with the handle
 * stays.
 */
export function pickerViewClosed() { heldFull = false; searching = false; sawKeyboard = false; kbUp = false; }

// ---------- Closing it ----------
/** Opened from a plant's sheet to swap it, or from a circle's to link it. */
export const pickerFromSheet = (): boolean => !!state.pickerLinkId && state.selectedIds.length > 0;
/**
 * The picker closed: by its ✕, swiped down by its handle, or a tap on the plan. Opened from a sheet: closed, back on that
 * sheet, as picking a plant brings you back there (the UI review, 2026-11-01: it closed the sheet too).
 */
export function closePicker() {
  const fromSheet = pickerFromSheet();
  state.panel = fromSheet ? 'props' : null; state.pickerLinkId = null; state.pickerLinkAlso = []; state.pickerLinkLocked = false; state.pickerForTree = false;
  render();
}
/**
 * A tap on the plan behind the picker (src/gestures.ts: a press let go where it was pressed, not a drag, which pans):
 * the picker closes, nothing on the plan picked or placed. True if it did (the picker was open).
 */
export function planTapped(): boolean {
  if (state.panel !== 'plants') return false;
  closePicker();
  return true;
}

// ---------- The handle ----------
/** Whether the picker was full height as the handle was pressed (the press itself can end a search). */
let pressedFull: boolean | null = null;
/** A drag just ended on the handle: its click isn't a press. */
let dragged = false;
/**
 * The grab handle at the picker's top (a phone's; none beside the plan): pressed, full height or back to rest; dragged,
 * wherever it's let go (settleSheet), swiped down from rest, closed. Closing also by the ✕, Back, Esc and a tap on the
 * plan.
 */
export function pickerHandle(): HTMLButtonElement {
  install();
  const f = full();
  const b = el('button', { type: 'button', className: 'picker-handle', 'data-testid': 'picker-handle', 'aria-expanded': String(f), 'aria-label': handleSaid(f), title: handleSaid(f) },
    el('span', { className: 'picker-grip', 'aria-hidden': 'true' }));
  b.addEventListener('pointerdown', (e) => holdPicker(e, b));
  b.addEventListener('click', () => {
    const was = pressedFull ?? full();
    pressedFull = null;
    if (dragged) { dragged = false; return; }
    choose(was ? 'rest' : 'full');
  });
  return b;
}
/**
 * The picker's header, past what's pressed or typed in it (its ✕, the search, the For row's chips, which scroll
 * sideways): a drag there moves it as the handle's does (more to take hold of).
 */
export function dragsPicker(header: HTMLElement) {
  header.addEventListener('pointerdown', (e) => { if (!(e.target as Element).closest('button, input, a, .for-chips')) holdPicker(e, header); });
}
/**
 * A press on the handle or header: followed as it's dragged, the picker's height with it, down past its height at rest
 * too; settled where it's let go, or closed.
 */
function holdPicker(e: PointerEvent, from: HTMLElement) {
  dragged = false;
  pressedFull = full();
  if (wideNow() || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const sheet = from.closest<HTMLElement>('.picker-sheet'), overlay = sheet?.parentElement;
  if (!sheet || !overlay) return;
  const { rest, full: fullH } = sheetHeights(overlay.getBoundingClientRect().height, keyboardInset(), restHeight());
  const startY = e.clientY, startH = sheet.getBoundingClientRect().height;
  let h = startH, moving = false;
  try { from.setPointerCapture(e.pointerId); } catch { /* followed while it's over the handle */ }
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    if (!moving && Math.abs(ev.clientY - startY) < 6) return;
    moving = true;
    h = Math.max(0, Math.min(fullH, startH - (ev.clientY - startY)));
    sheet.style.height = `${Math.round(h)}px`;
    ev.preventDefault();
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    from.removeEventListener('pointermove', move);
    from.removeEventListener('pointerup', up);
    from.removeEventListener('pointercancel', up);
    if (!moving) return;
    dragged = from.matches('[data-testid=picker-handle]'); // (its click, which follows, isn't a press)
    pressedFull = null;
    const to = settleSheet(startH, h, rest, fullH);
    // (Closed: drawn without it, the height it was dragged to going with it.)
    if (to === 'closed' && ev.type === 'pointerup') { dragged = false; closePicker(); return; }
    sheet.style.height = '';
    choose(to === 'closed' ? 'rest' : to);
  };
  from.addEventListener('pointermove', move);
  from.addEventListener('pointerup', up);
  from.addEventListener('pointercancel', up);
}

// ---------- Where it sits, and what it leaves in sight ----------
/**
 * The plan's top and foot on the picker's layer, as CSS (--plan-top, --plan-foot): beside the plan, the panel starts
 * under the top bar; above and below the plan (the top bar, a mode's strip, the bar at the foot), the rest of the app
 * waits, lightly dimmed. After each render and when the window changes size: CSS only.
 */
export function placePicker() {
  const overlay = document.querySelector<HTMLElement>('.picker-overlay');
  const wrap = document.getElementById('canvas-wrap');
  if (!overlay || !wrap) return;
  const o = overlay.getBoundingClientRect(), w = wrap.getBoundingClientRect();
  overlay.classList.toggle('beside', wideNow()); // (said for notices, to keep beside it: src/ui/toast.ts)
  overlay.style.setProperty('--plan-top', `${Math.max(0, Math.round(w.top - o.top))}px`);
  overlay.style.setProperty('--plan-foot', `${Math.max(0, Math.round(o.bottom - w.bottom))}px`);
}
/**
 * The part of the plan in sight beside or above the picker (px from the plan's top left): left of the panel on a
 * computer; above the picker at rest on a phone, whatever its height now (at rest is where it settles back).
 */
function planRoom(): Room | null {
  const wrap = document.getElementById('canvas-wrap');
  const overlay = document.querySelector<HTMLElement>('.picker-overlay');
  const sheet = overlay?.querySelector<HTMLElement>(':scope > .picker-sheet');
  if (!wrap || !overlay || !sheet) return null;
  const w = wrap.getBoundingClientRect();
  if (wideNow()) return { left: 0, top: 0, right: Math.min(w.width, sheet.getBoundingClientRect().left - w.left), bottom: w.height };
  const o = overlay.getBoundingClientRect();
  const top = o.bottom - sheetHeights(o.height, keyboardInset()).rest;
  return { left: 0, top: 0, right: w.width, bottom: Math.min(w.height, top - w.top) };
}
/**
 * The picker just opened with a bed or plants selected, or for what it swaps or links: the plan moved to show them in
 * the part left in sight. True when the view changed (the plan is then to be drawn again). Nothing is put back when it
 * closes. (Not for a house or a path selected: the picker isn't about them.)
 */
export function showChosen(): boolean {
  const linking = !!state.pickerLinkId;
  // (For a bed (Plant this bed): that bed, whatever's selected.)
  const bed = linking || state.pickerForTree ? null : plantingFor();
  return showShapes(bed ? [bed] : state.shapes.filter((s) => state.selectedIds.includes(s.id) && (linking || s.role === 'bed' || s.role === 'plant')));
}
/** The plan moved to show these in the part left in sight beside or above the picker (showChosen). */
export function showShapes(chosenShapes: Shape[]): boolean {
  const b = unionBounds(chosenShapes.map(shapeBBox));
  const room = b ? planRoom() : null;
  if (!b || !room) return false;
  const now = { offsetX: state.offsetX, offsetY: state.offsetY, zoom: state.zoom };
  const next = viewToShow(b, now, room);
  if (sameView(now, next)) return false;
  state.offsetX = next.offsetX;
  state.offsetY = next.offsetY;
  state.zoom = next.zoom;
  saveView(); // (where it's looked at from, as a pan by hand is kept: src/storage.ts)
  return true;
}
