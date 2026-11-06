// Keeping the plan in view while choosing plants (Jason, Nov 2, from the bed review's S3: "Half-height picker on a
// phone, a side panel on a computer"; 60% since his notes of Nov 4). The parts that are only arithmetic, kept apart for
// the tests: the view that brings what's selected into the part of the plan the picker leaves showing, where a dragged
// handle leaves the picker, and whether a phone's keyboard is up. The page itself: src/ui/picker-view.ts.

import { MAX_ZOOM, MIN_ZOOM, PX_PER_FOOT_BASE } from './constants';
import type { Bounds } from './types';

/**
 * A phone's picker at rest, as it opens: the share of the layer it's on that it takes. Half until Jason's notes of Nov 4
 * (1: "We could bump it to 60% of the screen, rather than half. The plan is just there as a reference and quick
 * zoom-in-and-check tool").
 */
export const REST = 0.6;
/** And at full height: as the picker always was, its top 15% of the window down (styles.css, with or without a keyboard). */
export const FULL = 0.85;

/** Where the plan is looked at from: its top left (feet) and its zoom. */
export interface View { offsetX: number; offsetY: number; zoom: number }
/** The part of the plan in sight beside or above the picker, in px from the plan's top left corner. */
export interface Room { left: number; top: number; right: number; bottom: number }

/**
 * The view that shows `b` (feet) in `room`, `margin` px clear of its edges. Left as it is when `b` is in it already;
 * otherwise moved only: each way it's out, to the middle of the room that way, the other way left be (a bed below the
 * picker comes up, and stays where it was across). Zoomed out only where it doesn't fit at this zoom, never in, and
 * then to the room's middle both ways. A room too small to hold anything leaves the view as it is.
 */
export function viewToShow(b: Bounds, view: View, room: Room, margin = 16): View {
  const roomW = room.right - room.left - 2 * margin, roomH = room.bottom - room.top - 2 * margin;
  if (roomW <= 0 || roomH <= 0) return view;
  const wFt = Math.max(0, b.maxX - b.minX), hFt = Math.max(0, b.maxY - b.minY);
  const midX = (b.minX + b.maxX) / 2, midY = (b.minY + b.maxY) / 2;
  const roomMidX = (room.left + room.right) / 2, roomMidY = (room.top + room.bottom) / 2;
  let ppf = PX_PER_FOOT_BASE * view.zoom;
  if (wFt * ppf > roomW || hFt * ppf > roomH) {
    // (Too big for the room at this zoom: out as far as it takes, and in the middle.)
    const fit = Math.min(wFt ? roomW / (wFt * PX_PER_FOOT_BASE) : Infinity, hFt ? roomH / (hFt * PX_PER_FOOT_BASE) : Infinity);
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom, fit));
    ppf = PX_PER_FOOT_BASE * zoom;
    return { zoom, offsetX: midX - roomMidX / ppf, offsetY: midY - roomMidY / ppf };
  }
  const x0 = (b.minX - view.offsetX) * ppf, x1 = (b.maxX - view.offsetX) * ppf;
  const y0 = (b.minY - view.offsetY) * ppf, y1 = (b.maxY - view.offsetY) * ppf;
  const outX = x0 < room.left + margin || x1 > room.right - margin;
  const outY = y0 < room.top + margin || y1 > room.bottom - margin;
  return {
    zoom: view.zoom,
    offsetX: outX ? midX - roomMidX / ppf : view.offsetX,
    offsetY: outY ? midY - roomMidY / ppf : view.offsetY,
  };
}

/** Whether two views are the same, to a hair (no redraw, no save, for a view left as it was). */
export function sameView(a: View, b: View): boolean {
  return Math.abs(a.zoom - b.zoom) < 1e-9 && Math.abs(a.offsetX - b.offsetX) < 1e-9 && Math.abs(a.offsetY - b.offsetY) < 1e-9;
}

/** A phone's picker at rest (60%) or full height. */
export type SheetSize = 'rest' | 'full';
/** How far (px) a drag of the handle goes before it counts as one way or the other, wherever it's let go. */
export const SETTLE_PX = 40;
/** Swiped down from full height, how far below its height at rest it's taken to close it: this share of that height. */
export const FROM_FULL_CATCH = 1 / 3;
/**
 * Where a phone's picker settles when its handle is let go, dragged from `startH` px tall to `endH`: below its height
 * at rest by SETTLE_PX or more, closed (Jason, Nov 4, note 3: "Since there's a handle there, I should be able to swipe
 * the half-height picker panel down to close it"); otherwise up by SETTLE_PX or more, full height; down as far, at
 * rest; less than that, whichever it's nearer. Swiped down from full height, it stops at rest unless taken a third of
 * its height at rest below that (FROM_FULL_CATCH): a swipe from the top went on past rest and closed it (Jason, Nov 6:
 * "we just need to make the 'catch' for halfway a little bigger").
 */
export function settleSheet(startH: number, endH: number, restH: number, fullH: number): SheetSize | 'closed' {
  const fromFull = startH > restH + SETTLE_PX;
  if (endH <= restH - (fromFull ? Math.max(SETTLE_PX, Math.round(restH * FROM_FULL_CATCH)) : SETTLE_PX)) return 'closed';
  const dy = endH - startH;
  if (dy >= SETTLE_PX) return 'full';
  if (dy <= -SETTLE_PX) return 'rest';
  return endH > (restH + fullH) / 2 ? 'full' : 'rest';
}

/**
 * The heights (px) of a phone's picker at rest and full, in an overlay `overlayH` px tall over a keyboard `kb` px tall,
 * in a window `restH` px tall with no keyboard up (src/app-height.ts restHeight): full, its top stays 15% of that below
 * the window's top, whether the keyboard shortens the window (Android) or is measured over the page (iOS), as
 * styles.css draws it (Jason, Nov 5: it moved with every keyboard change).
 */
export function sheetHeights(overlayH: number, kb: number, restH = overlayH + kb): { rest: number; full: number } {
  const rest = Math.round(overlayH * REST);
  return { rest, full: Math.max(rest, Math.round(overlayH - (1 - FULL) * restH)) };
}

/** How much shorter (px) the window gets before it's taken for a phone's keyboard, not a toolbar coming and going. */
export const KEYBOARD_PX = 100;
/**
 * Whether a phone's keyboard is up, with a field focused: the window shorter than it was when the field was focused
 * (`restH`; Android Chrome shrinks the page for it), or the keyboard's own height measured (`inset`, where a browser
 * only shrinks what's visible: src/keyboard.ts).
 */
export function keyboardUp(restH: number, h: number, inset: number): boolean {
  return inset > 0 || h < restH - KEYBOARD_PX;
}
