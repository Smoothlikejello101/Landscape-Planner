// Rescale with the photo (Jason's answers to the design, Nov 2): the question after a photo's scale is set again, and
// after it's dragged or turned. The rules are src/rescale.ts; this is the asking, and the move.
//
// - After Set scale, whenever something on the plan sits over the photo and would move more than 3 inches (answer 2:
//   every time, a rough scale or not): a card at the foot of the plan, "Was your plan drawn over the photo?", the plan
//   above it drawn as Move would leave it, with dashed outlines where things are now ("As it was": the plan unmoved
//   over the new photo). Move it with the photo, or Leave the plan (its ✕ too). Under its buttons, folded, the things
//   already there, each ticked to follow the photo; one with sides typed as numbers unticked, kept as measured
//   (answer 3). On a photo's first scale it comes before "Now trace" (src/ui/trace-card.ts), which follows it.
// - Moved: one ordinary step (saved and synced like any other), the plan fitted on screen, a notice with Undo. One Undo
//   puts the plan back, the photo left at its new scale; a second takes the scale back too.
// - The photo dragged or turned (answer 6, "Ask, but don't make a change unless they say to"): a small notice when the
//   drag or turn ends, with something over the photo: "Move the plan with the photo?". Move it moves and turns
//   everything over it by just what the photo did, as one step; Leave it, its ✕ or letting it go changes nothing.
// Nothing here is stored: the question lasts while the plan is as it was asked about (no step since, the same photo
// where it was put), and goes at anything else. While the card is up, the plan only pans and zooms
// (src/ui/picker-view.ts planLookOnly), and its ticks and the "As it was" switch redraw only the plan (CLAUDE.md).

import { redrawCanvas } from '../canvas';
import { el, svgEl } from '../dom';
import { fmtFeet, pxPerFoot, shapeBBox, unionBounds } from '../geometry';
import { flushHistoryDebounce, pushHistory, undo } from '../history';
import { I } from '../icons';
import { kindDef, kindOfShape } from '../kinds';
import { zoomToBounds, zoomToFit } from '../mutations';
import { isDataSized } from '../my-plants';
import { labelShown } from '../names';
import {
  ASK_FT, farthestMove, listedThere, movedIds, movedWithPhoto, outline, placementOf, rescalePlan, samePlacement,
  type Listed, type Placed, type Placement, type RescaleOptions,
} from '../rescale';
import { clearSelection } from '../selection';
import { state } from '../state';
import { save } from '../storage';
import { isTree } from '../trees';
import type { HistorySnapshot, Shape } from '../types';
import { deepClone } from '../util';
import { introActive } from './intro-card';
import { render } from './render';
import { dismissToastAction, noticeUp, toastAction } from './toast';

/** The question after Set scale, while it stands. Never stored. */
interface Asking {
  plan: string; photo: string; from: Placement; to: Placement;
  /** The step Set scale made: any other step since (an Undo, an edit, a sync) and the question goes. */
  snap: HistorySnapshot;
  /** The plan as it was asked about (a copy). */
  before: Shape[];
  listed: Listed[];
  /** Ticked: follows the photo. */
  ticks: Map<string, boolean>;
  asWas: boolean;
  open: boolean;
  result: Map<string, Placed>;
  /** The plan as Move would leave it, to draw. */
  shown: Shape[];
  moved: Set<string>;
}
let asking: Asking | null = null;

const OPTIONS: RescaleOptions = { catalogSized: isDataSized, treeOf: (s) => isTree(s) };
function work(a: Pick<Asking, 'before' | 'from' | 'to' | 'ticks'>) {
  const kept = new Set([...a.ticks].filter(([, on]) => !on).map(([id]) => id));
  const result = rescalePlan(a.before, a.from, a.to, { ...OPTIONS, kept });
  return { result, shown: a.before.map((s) => result.get(s.id)?.shape ?? s), moved: movedIds(a.before, result) };
}

/**
 * The photo's scale was just set (src/background.ts finishBgCalibration, its step pushed), from `from`: the question,
 * if anything over the photo would move more than 3 inches. Whether it's asked (then the plan, not the background
 * sheet, is shown, to see the card and what Move would do).
 */
export function askAfterScale(from: Placement): boolean {
  asking = null;
  const bg = state.bgImage, plan = state.currentProjectId, snap = state.history[state.historyIndex];
  if (!bg || !plan || !snap) return false;
  const to = placementOf(bg);
  if (samePlacement(from, to)) return false;
  const before = deepClone(state.shapes), listed = listedThere(before, from, OPTIONS);
  const ticks = new Map(listed.map((l) => [l.id, !l.typed.length]));
  const w = work({ before, from, to, ticks });
  if (farthestMove(before, w.result) <= ASK_FT) return false;
  asking = { plan, photo: bg.dataUrl, from, to, snap, before, listed, ticks, asWas: false, open: false, ...w };
  clearSelection();
  return true;
}
/** The question, if it still stands: the same plan, the same photo where it was put, no step since. */
function live(): Asking | null {
  const a = asking, bg = state.bgImage;
  if (!a) return null;
  if (state.currentProjectId !== a.plan || !bg || bg.dataUrl !== a.photo || state.history[state.historyIndex] !== a.snap || !samePlacement(placementOf(bg), a.to)) {
    asking = null;
    return null;
  }
  return a;
}
/**
 * Where the photo was when the plan was drawn over it, while the question stands: set again before it's answered (a
 * tap off, say), the question is about the whole change since, not the step between.
 */
export const rescaleFrom = (): Placement | null => live()?.from ?? null;
/** Waiting on an answer (the "Now trace" card waits for it too). */
export const rescaleAsking = (): boolean => !!live();
/** The card is up: not while drawing, placing, setting the scale, with a sheet open, through the year or the tour. */
export function rescaleShown(): boolean {
  return !!live() && !state.draw && !state.placing && !state.featurePlace && !state.editPoints && !state.bgCalibrate && !state.bgEditMode
    && !state.selectMode && !state.panel && state.month == null && !introActive();
}
/** The plan to draw while the card is up, as Move would leave it (null: the plan as it is). */
export function rescalePreview(): Shape[] | null {
  const a = live();
  return a && !a.asWas && rescaleShown() ? a.shown : null;
}
/** Dashed outlines where things are now, under the plan as Move would leave it (src/canvas.ts, its handles layer). */
export function renderRescaleWas(g: SVGGElement): void {
  const a = live();
  if (!a || a.asWas || !rescaleShown()) return;
  const ppf = pxPerFoot(), r1 = (v: number) => Math.round(v * 10) / 10;
  const px = (p: { x: number; y: number }) => `${r1((p.x - state.offsetX) * ppf)},${r1((p.y - state.offsetY) * ppf)}`;
  const was = svgEl('g', { 'data-role': 'rescale-was', 'pointer-events': 'none' });
  for (const s of a.before) {
    if (!a.moved.has(s.id)) continue;
    const o = outline(s), tag = o.closed ? 'polygon' : 'polyline', points = o.pts.map(px).join(' ');
    was.appendChild(svgEl(tag, { points, fill: 'none', stroke: '#fff', 'stroke-width': 3, 'stroke-opacity': 0.75, 'stroke-linejoin': 'round' }));
    was.appendChild(svgEl(tag, { points, fill: 'none', stroke: '#1c1917', 'stroke-width': 1.5, 'stroke-dasharray': '5 4', 'stroke-linejoin': 'round', 'data-was': s.id }));
  }
  g.appendChild(was);
}

/** How much larger or smaller the photo came out ("8% larger"). */
function sizeSaid(a: Asking): string {
  const k = a.to.ftPerPx / a.from.ftPerPx, pct = Math.round(Math.abs(k - 1) * 100);
  if (pct < 1) return 'The photo’s size changed a little at its new scale.';
  return `The photo is ${pct}% ${k > 1 ? 'larger' : 'smaller'} at its new scale.`;
}
const viewSaid = (a: Asking) => (a.asWas ? 'Shown as it is now, not moved.' : 'Shown moved with it. Dashed lines: where things are now.');
/** "6 things already there · 1 kept as measured". */
function listSaid(a: Asking): string {
  const n = a.listed.length, kept = [...a.ticks.values()].filter((on) => !on).length;
  return `${n} ${n === 1 ? 'thing' : 'things'} already there · ${kept ? `${kept} kept as measured` : 'all follow the photo'}`;
}
/** What the list calls it: its name, or what it is. */
function nameOf(s: Shape): string {
  const name = labelShown(s).trim();
  if (name) return name;
  const k = kindOfShape(s);
  return k ? kindDef(k).label : 'Tree';
}
/** "typed as 100 ft", "typed as 100 ft and 84 ft". */
const typedSaid = (ft: number[]) => 'typed as ' + ft.map((v) => `${fmtFeet(v)} ft`).join(' and ');

/** The card, at the foot of the plan. */
export function rescaleCard(): HTMLElement {
  const a = live()!;
  const close = el('button', { className: 'trace-hide', html: I.x, 'aria-label': 'Leave the plan', title: 'Leave the plan', 'data-testid': 'rescale-close' });
  close.addEventListener('click', leave);
  const view = el('div', { className: 'rescale-view', 'data-testid': 'rescale-view' }, viewSaid(a));
  // Moved, or As it was: the plan drawn again, nothing else.
  const shows = (asWas: boolean, label: string, testid: string) => {
    const b = el('button', { className: 'rescale-seg', 'aria-pressed': String(a.asWas === asWas), 'data-testid': testid }, label);
    b.addEventListener('click', () => {
      const now = live();
      if (!now) { render(); return; }
      now.asWas = asWas;
      for (const x of seg.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
      view.textContent = viewSaid(now);
      redrawCanvas();
    });
    return b;
  };
  const seg = el('div', { className: 'rescale-segs', role: 'group', 'aria-label': 'Show the plan' },
    shows(false, 'Moved', 'rescale-show-moved'), shows(true, 'As it was', 'rescale-as-was'));
  const move = el('button', { className: 'btn primary', 'data-testid': 'rescale-move' }, 'Move it with the photo');
  move.addEventListener('click', moveIt);
  const stay = el('button', { className: 'btn ghost', 'data-testid': 'rescale-leave' }, 'Leave the plan');
  stay.addEventListener('click', leave);
  const card = el('div', { className: 'trace-card rescale-card', 'data-testid': 'rescale-card', role: 'region', 'aria-label': 'Move the plan with the photo?' },
    close,
    el('div', { className: 'trace-head' }, 'Was your plan drawn over the photo?'),
    el('div', { className: 'rescale-text' }, sizeSaid(a), ' If you traced it over the photo, it can move with it.'),
    el('div', { className: 'rescale-row' }, seg, view),
    el('div', { className: 'rescale-buttons' }, move, stay));
  if (a.listed.length) card.appendChild(tickList(a));
  return card;
}
/** The things already there, folded under the buttons: ticked, each follows the photo; unticked, kept as measured. */
function tickList(a: Asking): HTMLElement {
  const summary = el('span', { 'data-testid': 'rescale-list-said' }, listSaid(a));
  const fold = el('button', { className: 'rescale-fold', 'aria-expanded': String(a.open), 'data-testid': 'rescale-list-open' },
    el('span', { className: 'rescale-chev', html: I.chevronDown, 'aria-hidden': 'true' }), summary);
  const rows = el('div', { className: 'rescale-list', 'data-testid': 'rescale-list' },
    el('div', { className: 'hint' }, 'Ticked: follows the photo. Unticked: keeps its size, as measured.'));
  rows.hidden = !a.open;
  for (const l of a.listed) {
    const s = a.before.find((x) => x.id === l.id);
    if (!s) continue;
    const box = el('input', { type: 'checkbox', 'data-testid': 'rescale-tick' }) as HTMLInputElement;
    box.checked = a.ticks.get(l.id) !== false;
    box.addEventListener('change', () => {
      const now = live();
      if (!now) { render(); return; }
      now.ticks.set(l.id, box.checked);
      Object.assign(now, work(now));
      summary.textContent = listSaid(now);
      redrawCanvas(); // (the plan alone: the list, and anything typed, as they are)
    });
    rows.appendChild(el('label', { className: 'check-row rescale-tick-row', 'data-tick-of': l.id }, box,
      el('span', {}, nameOf(s), ...(l.typed.length ? [el('span', { className: 'rescale-typed' }, ' · ' + typedSaid(l.typed))] : []))));
  }
  fold.addEventListener('click', () => {
    a.open = rows.hidden;
    rows.hidden = !a.open;
    fold.setAttribute('aria-expanded', String(a.open));
  });
  return el('div', { className: 'rescale-ticks' }, fold, rows);
}

/**
 * The card just came up: the plan fitted to show what moves, as it is and as it would be, above the card. Run after
 * the render that put the card up.
 */
export function fitRescale(): void {
  const a = live(), card = document.querySelector('.rescale-card')?.getBoundingClientRect(), wrap = document.getElementById('canvas-wrap')?.getBoundingClientRect();
  if (!a || !card || !wrap) return;
  const boxes = a.before.filter((s) => a.moved.has(s.id)).flatMap((s) => [shapeBBox(s), shapeBBox(a.result.get(s.id)!.shape)]);
  const b = unionBounds(boxes);
  if (!b) return;
  zoomToBounds(b, 20, { bottom: Math.max(0, wrap.bottom - card.top + 8) });
  redrawCanvas();
}

/** Leave the plan (or its ✕): nothing changes. */
function leave() {
  asking = null;
  render();
}
/** Move it with the photo: one step. */
function moveIt() {
  const a = live();
  asking = null;
  // (Only the plan the question was about: anything changed since, and nothing is moved.)
  if (!a || JSON.stringify(state.shapes) !== JSON.stringify(a.before)) { render(); return; }
  flushHistoryDebounce();
  state.shapes = state.shapes.map((s) => (a.moved.has(s.id) ? deepClone(a.result.get(s.id)!.shape) : s));
  pushHistory('move the plan with the photo');
  save();
  zoomToFit();
  render();
  movedNotice();
}
/** "Moved the plan with the photo." with Undo: the plan back, the photo as it is now. */
function movedNotice() {
  toastAction('Moved the plan with the photo.', [{ label: 'Undo', run: () => { undo(); render(); } }], 10000, 'plan-moved');
}

// ---------- The photo dragged or turned ----------
const PHOTO_ASK = 'photo-moved';
/** The photo's move being asked about: from where (the first move while the question is up), for which plan and photo. */
let photoAsk: { plan: string; photo: string; from: Placement } | null = null;
/**
 * The photo was just dragged or turned (on the plan, or in its sheet), from `before`: asked, when something sits over
 * it, whether to move the plan too. Moved again while it's asked, it's asked about the whole move since the first.
 * Nothing changes until Move it. Only the notice is put up (no redraw: a field in the sheet keeps its keyboard).
 */
export function askAfterPhotoMoved(before: Placement): void {
  const bg = state.bgImage, plan = state.currentProjectId;
  if (!bg || !plan) return;
  const up = !!photoAsk && noticeUp()?.testid === PHOTO_ASK && photoAsk.plan === plan && photoAsk.photo === bg.dataUrl;
  const from = up ? photoAsk!.from : before, to = placementOf(bg);
  photoAsk = null;
  if (samePlacement(from, to) || !movedWithPhoto(state.shapes, from, to).size) { if (up) dismissToastAction(); return; }
  photoAsk = { plan, photo: bg.dataUrl, from };
  toastAction('Move the plan with the photo?', [
    { label: 'Move it', run: moveWithPhoto },
    { label: 'Leave it', run: () => { photoAsk = null; } },
  ], 15000, PHOTO_ASK);
}
/** Move it: everything over the photo moved and turned by what it was, one step. */
function moveWithPhoto() {
  const ask = photoAsk, bg = state.bgImage;
  photoAsk = null;
  if (!ask || !bg || state.currentProjectId !== ask.plan || bg.dataUrl !== ask.photo) return;
  flushHistoryDebounce(); // (the photo's own move, from a field or a button in its sheet, a step of its own first)
  const moved = movedWithPhoto(state.shapes, ask.from, placementOf(bg));
  if (!moved.size) return;
  state.shapes = state.shapes.map((s) => moved.get(s.id) ?? s);
  pushHistory('move the plan with the photo');
  save();
  render();
  movedNotice();
}
