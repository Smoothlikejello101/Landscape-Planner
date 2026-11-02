import { bgCalibrationTap, bgCenterClient } from './background';
import { DOUBLE_TAP_MS, DRAG_THRESHOLD_PX, MAX_ZOOM, MIN_ZOOM, PX_PER_FOOT_BASE } from './constants';
import { canvasRect, lassoTouches, pxPerFoot, screenToFeet } from './geometry';
import { flushHistoryDebounce, pushHistory, stepNamed } from './history';
import { zoomBy } from './mutations';
import { movedWith } from './beds';
import { isLocked } from './roles';
import { shownWith } from './status';
import { clearSelection, isSelected, selectOnly, toggleSelect } from './selection';
import { gesture, state, tapTracker } from './state';
import { save, saveView } from './storage';
import type { Gesture, Point, Shape } from './types';
import { drawnBySize, isHidden, isSeeThrough, previewView, redrawBackground, redrawHandles, redrawMarquee, redrawShapes } from './canvas';
import { drawTap, editedShape, forgetLastTap, insertVertex, moveVertex, notePointer } from './draw';
import { notJustPlaced, placeTap, selectionJustPlaced } from './place';
import { afterMove, freeStrandedVines, saidFreed } from './ui/vine-offers';
import { render, updateStatusReadout } from './ui/render';
import { now, snap } from './util';
import { canopyHint } from './canopy';
import { hintDue, hintShown } from './hints';
import { kindDef, kindOfShape } from './kinds';
import { plantsById } from './plants';
import { hideToastSaying, toast } from './ui/toast';
import { walkKeepsPress } from './ui/warnings-sheet';
import { applyHandleDrag, handleDragChanged, handleDragLive, startHandleDrag } from './handles';
import { featureSpot, nearestOnEdge } from './features';
import { featureTap } from './feature-edit';
import { deepClone } from './util';
import type { HandleKind } from './handle-math';
import { isTree } from './trees';

// Pointer gestures on the canvas: pan, pinch-zoom, marquee selection, shape
// drag, background move/rotate, calibration taps.
//
// Pointer events report each finger separately (no e.touches list), so every
// active pointer is tracked by pointerId to detect a second finger (pinch).
export const activePointers = new Map<number, { clientX: number; clientY: number }>();

function pinchInfo() {
  if (activePointers.size !== 2) return null;
  const [a, b] = Array.from(activePointers.values());
  return {
    cx: (a.clientX + b.clientX) / 2,
    cy: (a.clientY + b.clientY) / 2,
    dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  };
}
/** Second finger down: replace any one-finger gesture with a pinch. */
function startPinchGesture() {
  const info = pinchInfo();
  if (!info) return;
  const g = gesture.current;
  if (g?.type === 'drag-vertex' && (g.moved || g.inserted)) { flushHistoryDebounce(); pushHistory(); save(); } // keep the edit undoable
  if (g?.type === 'drag-feature' && featureDragChanged(g)) { flushHistoryDebounce(); pushHistory(); save(); } // (likewise a sub-feature's)
  const handleDrag = g?.type === 'shape-resize' || g?.type === 'shape-rotate';
  if (handleDrag && g.moved && handleDragChanged(g, state.shapes)) { flushHistoryDebounce(); pushHistory(); save(); }
  forgetLastTap(); // (the plan moves: the same spot on screen will be another place)
  gesture.current = {
    type: 'pinch',
    startDist: info.dist,
    startZoom: state.zoom,
    centerScreen: { x: info.cx, y: info.cy },
    centerFeetAtStart: screenToFeet(info.cx, info.cy)
  };
  state.marquee = null;
  if (handleDrag) redrawHandles(); // (the size it was dragged to, no longer read out)
}
function movedPastThreshold(g: { startX: number; startY: number; moved: boolean }, e: PointerEvent) {
  if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > DRAG_THRESHOLD_PX) g.moved = true;
}
/** Angle in degrees from `center` to (x, y), with 0° pointing up. */
export function angleFrom(center: Point, x: number, y: number): number {
  return Math.atan2(y - center.y, x - center.x) * 180 / Math.PI + 90;
}
/** Normalize degrees into [-180, 180). */
export function normalizeDeg(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

/** Shift, Ctrl or Cmd held: add to the selection or take from it, as in most desktop apps. */
const adding = (e: PointerEvent) => e.shiftKey || e.ctrlKey || e.metaKey;

export function onCanvasPointerDown(e: PointerEvent) {
  notePointer(e.pointerType);
  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  if (activePointers.size === 2) { startPinchGesture(); return; }
  if (activePointers.size > 2) return; // palm rejection

  // Shapes handle their own pointerdown; here only the canvas background,
  // the grid, and (in edit mode) the background image body/rotation handle.
  const target = e.target as Element;
  const role = (target as HTMLElement | SVGElement).dataset?.role ?? null;
  const isCanvas = target.id === 'canvas-svg' || role === 'grid';
  const isBgBody = role === 'bg-body';
  const isBgRot = role === 'bg-rot';
  const handle = target.closest?.('[data-role="vertex"],[data-role="midpoint"]') as SVGElement | null;
  // A handle on the selected shape: resize it, or turn it.
  const shapeHandle = target.closest?.('[data-role="shape-resize"],[data-role="shape-rotate"]') as SVGElement | null;
  if (shapeHandle) {
    const g = startHandleDrag(shapeHandle.dataset.handle as HandleKind, screenToFeet(e.clientX, e.clientY), e.clientX, e.clientY, state.shapes);
    if (g) { flushHistoryDebounce(); gesture.current = g; }
    return;
  }
  if (!isCanvas && !isBgBody && !isBgRot && !handle) return;
  const clientX = e.clientX, clientY = e.clientY;

  // Editing an outline's points: drag a point, or press a + to add one there.
  const edited = editedShape();
  if (handle && edited && state.editPoints) {
    let index = Number(handle.dataset.index);
    let inserted = false;
    if (handle.dataset.role === 'midpoint') {
      flushHistoryDebounce();
      index = insertVertex(edited, index, screenToFeet(clientX, clientY));
      if (index < 0) return;
      inserted = true;
      state.editPoints.vertex = index;
      redrawShapes([edited.id]);
      redrawHandles();
    }
    delete state.editPoints.snap; // (a new drag: the last one's Unsnap goes)
    gesture.current = { type: 'drag-vertex', id: edited.id, index, startX: clientX, startY: clientY, moved: false, inserted };
    return;
  }
  if (handle) return;

  if (isBgRot && state.bgImage && state.bgEditMode) {
    const center = bgCenterClient(state.bgImage); // client coords, same as the pointer
    gesture.current = {
      type: 'bg-rot',
      startAngle: angleFrom(center, clientX, clientY),
      startRotation: state.bgImage.rotation || 0,
      angleAt: (x, y) => angleFrom(center, x, y)
    };
    return;
  }
  if (isBgBody && state.bgImage && state.bgEditMode) {
    const cur = screenToFeet(clientX, clientY);
    gesture.current = {
      type: 'bg-drag',
      startX: clientX, startY: clientY,
      grabOffset: { x: cur.x - state.bgImage.cx, y: cur.y - state.bgImage.cy },
      startCenter: { x: state.bgImage.cx, y: state.bgImage.cy },
      moved: false
    };
    return;
  }
  // During calibration a tap records a point (finalized on pointerup so a
  // slight finger wobble still counts); a drag pans, to find the next point.
  if (state.bgCalibrate && (state.bgCalibrate.step === 'point1' || state.bgCalibrate.step === 'point2')) {
    gesture.current = { type: 'bg-calibrate-tap', startX: clientX, startY: clientY, startOffset: { x: state.offsetX, y: state.offsetY }, moved: false };
    return;
  }
  if (!isCanvas) return;

  const add = adding(e);
  if ((state.selectMode || add) && !state.draw && !state.editPoints && !state.placing && !state.featurePlace) {
    const feet = screenToFeet(clientX, clientY);
    gesture.current = { type: 'marquee', startX: clientX, startY: clientY, startFeet: feet, currentFeet: feet, moved: false, add };
    state.marquee = { x1: feet.x, y1: feet.y, x2: feet.x, y2: feet.y };
  } else {
    gesture.current = {
      type: 'pan', startX: clientX, startY: clientY,
      startOffset: { x: state.offsetX, y: state.offsetY }, moved: false
    };
  }
}

export function onCanvasPointerMove(e: PointerEvent) {
  // Only fingers that went down on the canvas drive gestures (not, say, a
  // second finger resting on the toolbar).
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  const g = gesture.current;
  if (!g) return;
  const clientX = e.clientX, clientY = e.clientY;

  switch (g.type) {
    case 'pinch': {
      const info = pinchInfo();
      if (!info) return; // a finger lifted; pointerup handles it
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, g.startZoom * (info.dist / g.startDist)));
      const newPxPerFoot = PX_PER_FOOT_BASE * newZoom;
      const rect = canvasRect();
      state.offsetX = g.centerFeetAtStart.x - (g.centerScreen.x - rect.left) / newPxPerFoot;
      state.offsetY = g.centerFeetAtStart.y - (g.centerScreen.y - rect.top) / newPxPerFoot;
      state.zoom = newZoom;
      e.preventDefault();
      previewView();
      updateStatusReadout();
      return;
    }
    case 'bg-drag': {
      if (!state.bgImage) { gesture.current = null; return; }
      movedPastThreshold(g, e);
      if (g.moved) {
        const cur = screenToFeet(clientX, clientY);
        state.bgImage.cx = cur.x - g.grabOffset.x;
        state.bgImage.cy = cur.y - g.grabOffset.y;
        redrawBackground();
      }
      e.preventDefault();
      return;
    }
    case 'bg-rot': {
      if (!state.bgImage) { gesture.current = null; return; }
      state.bgImage.rotation = normalizeDeg(g.startRotation + (g.angleAt(clientX, clientY) - g.startAngle));
      redrawBackground();
      e.preventDefault();
      return;
    }
    case 'bg-calibrate-tap':
      movedPastThreshold(g, e);
      if (g.moved) {
        state.offsetX = g.startOffset.x - (clientX - g.startX) / pxPerFoot();
        state.offsetY = g.startOffset.y - (clientY - g.startY) / pxPerFoot();
        previewView();
      }
      return;
    case 'pan':
      movedPastThreshold(g, e);
      state.offsetX = g.startOffset.x - (clientX - g.startX) / pxPerFoot();
      state.offsetY = g.startOffset.y - (clientY - g.startY) / pxPerFoot();
      previewView();
      return;
    case 'marquee': {
      movedPastThreshold(g, e);
      const feet = screenToFeet(clientX, clientY);
      g.currentFeet = feet;
      state.marquee = { x1: g.startFeet.x, y1: g.startFeet.y, x2: feet.x, y2: feet.y };
      redrawMarquee();
      e.preventDefault();
      return;
    }
    case 'drag-vertex': {
      movedPastThreshold(g, e);
      const s = editedShape();
      if (!s) { gesture.current = null; return; }
      if (g.moved || g.inserted) {
        moveVertex(s, g.index, screenToFeet(clientX, clientY));
        redrawShapes([s.id]);
        redrawHandles();
      }
      e.preventDefault();
      return;
    }
    case 'shape-resize':
    case 'shape-rotate': {
      // (Undone, deleted or deselected mid-drag, by a second finger: the drag stops, and keeps what it did so far.)
      if (!handleDragLive(g, state.shapes)) { gesture.current = null; render(); return; }
      movedPastThreshold(g, e);
      if (g.moved) {
        redrawShapes(applyHandleDrag(g, screenToFeet(clientX, clientY), e.shiftKey, state.shapes));
        redrawHandles();
      }
      e.preventDefault();
      return;
    }
    case 'drag-feature': {
      movedPastThreshold(g, e);
      const s = state.shapes.find((sh) => sh.id === g.id);
      // (Ended by an Undo mid-drag, or its shape gone: what's on screen is what history has.)
      if (!s || s.type === 'circle' || s.type === 'text' || state.historyIndex !== g.historyAt) { gesture.current = null; render(); return; }
      if (g.moved) {
        // Along whichever edge the finger is nearest, in half-foot steps (onto another wall too), held where it was
        // pressed on it rather than jumping to the finger.
        const f = s.features?.find((x) => x.id === g.featureId);
        const p = screenToFeet(clientX, clientY);
        const near = f && nearestOnEdge(s, { x: p.x - g.grab.x, y: p.y - g.grab.y }, f.width ?? 0);
        if (f && near) { f.edge = near.edge; f.at = near.at; redrawShapes([s.id]); redrawHandles(); }
      }
      e.preventDefault();
      return;
    }
    case 'drag-shape': {
      movedPastThreshold(g, e);
      if (g.moved) {
        const cur = screenToFeet(clientX, clientY);
        const dxFt = snap(cur.x - g.grabOffset.x) - g.primaryStart.x;
        const dyFt = snap(cur.y - g.grabOffset.y) - g.primaryStart.y;
        for (const item of g.shapeStarts) {
          const shape = state.shapes.find((s) => s.id === item.id);
          if (!shape || isLocked(shape)) continue;
          shape.x = snap(item.startX + dxFt);
          shape.y = snap(item.startY + dyFt);
        }
        redrawShapes(g.ids);
        redrawHandles(); // (the shape's handles go with it)
      }
      e.preventDefault();
      return;
    }
  }
}

/** Pan mode: tap selects, double-tap opens properties. Select mode: tap toggles. */
/** The shapes under a point on the screen (client px), top first, each once: what a tap there could pick. */
export function shapesAt(clientX: number, clientY: number): Shape[] {
  const ids: string[] = [];
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (el.closest('[data-layer="handles"]')) continue;
    const owner = el.closest('[data-shape-id],[data-trunk-of],[data-feature-of],[data-outline-of],[data-pin-of],[data-label-of]') as SVGElement | HTMLElement | null;
    const id = owner?.dataset.shapeId ?? owner?.dataset.trunkOf ?? owner?.dataset.featureOf ?? owner?.dataset.outlineOf ?? owner?.dataset.pinOf ?? owner?.dataset.labelOf;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.map((id) => state.shapes.find((s) => s.id === id)).filter((s): s is Shape => !!s);
}
/** A shape as a notice names it: "the fence", "the front bed", "the carolina jessamine". */
function theName(s: Shape): string {
  const kind = kindOfShape(s);
  const name = (s.type === 'circle' && s.plantId && plantsById[s.plantId]?.common) || s.label.trim() || (kind ? kindDef(kind).label : 'shape');
  return `the ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}
const STACK_HINT = 'lp-hint-tap-under';
const DRAG_HINT = 'lp-hint-drag-pans';
/**
 * A tap's stack with its sun areas after the plants and the unlocked ground under them (a bed, a lawn, a path), though
 * they're drawn over the ground: a sun area records the light on a bed, it isn't a thing in it (the UI review,
 * 2026-11-01: a tap on a plant, then one on the bed's name, picked the sun area over them). Locked shapes stay the
 * ground under it all, after it (Jason, Oct 29).
 */
function sunAreasLast(stack: Shape[]): Shape[] {
  const sun = stack.filter((s) => s.role === 'shade' && !isLocked(s));
  if (!sun.length) return stack;
  const rest = stack.filter((s) => !sun.includes(s));
  const after = rest.findLastIndex((s) => s.role === 'plant' || !isLocked(s));
  return [...rest.slice(0, after + 1), ...sun, ...rest.slice(after + 1)];
}
/** What the last tap moved down the stack from, if it did: a quick second tap (a double tap) opens that one's pane. */
let cycledFrom: string | null = null;
/**
 * A tap on a shape. `at` (client px): where, for what's stacked there. A quick second tap opens the pane of what the
 * first picked; a separate tap where one of the stack is selected picks the next one under it, round the stack
 * (Jason, Oct 29: a vine over its fence, a tree in a patch of groundcover, a bed under the house).
 */
function handleShapeTap(shape: Shape, at?: { x: number; y: number }) {
  if (state.selectMode) { toggleSelect(shape.id); return; }
  const t = now();
  // (The one the press went to first, then the other plants there, then the ground: a bed or a sun area. From a plant
  // picked under another, the next tap went on down to the bed before the plant over it: round 3, Dana, Grace, Hank.)
  const under = at ? shapesAt(at.x, at.y).filter((s) => s.id !== shape.id && shownWith(s, state.viewFilter)) : [];
  const stack = sunAreasLast([shape, ...under.filter((s) => s.role === 'plant'), ...under.filter((s) => s.role !== 'plant')]);
  if (tapTracker.id && stack.some((s) => s.id === tapTracker.id) && t - tapTracker.time < DOUBLE_TAP_MS) {
    // (A double tap on the one selected: its pane, though its first tap went on down the stack.)
    selectOnly(cycledFrom ?? tapTracker.id);
    state.panel = 'props';
    tapTracker.id = null; tapTracker.time = 0; cycledFrom = null;
    return;
  }
  // (Plants Done just left selected weren't picked by a tap: a tap on one picks it, not what's under it. The UI review,
  // 2026-11-01: the first tap on a plant just placed picked the sun area under it.)
  const placedNow = selectionJustPlaced();
  if (placedNow) notJustPlaced();
  // (Nor were the plants a Warnings row chose: the first press on one keeps them, and the walk through the warnings goes
  // on. The warnings bug hunt, Nov 1: it picked the bed or the sun area under the plant, and ended the walk.)
  const walked = walkKeepsPress(shape.id);
  const sel = state.selectedIds.length === 1 && !placedNow && !walked ? stack.findIndex((s) => s.id === state.selectedIds[0]) : -1;
  const pick = sel >= 0 ? stack[(sel + 1) % stack.length] : stack[0];
  // (Gone down the stack: "Tap again for … under it" is done with. Round 3, Grace: it stayed over what it named.)
  if (sel >= 0) hideToastSaying(/^(Tap|Click) again for /);
  cycledFrom = sel >= 0 && pick.id !== state.selectedIds[0] ? state.selectedIds[0] : null;
  if (!walked) selectOnly(pick.id);
  tapTracker.id = pick.id; tapTracker.time = t;
  // (The first few times a tap lands on a stack, on this device: say so.)
  if (sel < 0 && stack.length > 1 && hintDue(STACK_HINT, 3)) {
    const next = stack[(stack.indexOf(pick) + 1) % stack.length];
    toast(`Tap again for ${theName(next)} under it.`, 4000);
    hintShown(STACK_HINT);
  }
}

export function onCanvasPointerUp(e: PointerEvent) {
  if (!activePointers.delete(e.pointerId)) return; // not a canvas pointer
  const g = gesture.current;
  if (!g) return;

  if (g.type === 'pinch') {
    // Pinch lives while two fingers are down. If one remains, continue as a
    // pan from that finger so it doesn't go dead until re-tapped.
    if (activePointers.size < 2) {
      gesture.current = null;
      if (activePointers.size === 1) {
        const p = Array.from(activePointers.values())[0];
        gesture.current = {
          type: 'pan', startX: p.clientX, startY: p.clientY,
          startOffset: { x: state.offsetX, y: state.offsetY },
          moved: true // never treat the end of a pinch as a tap
        };
      } else {
        saveView(); // (where it's looked at from, not a change to the plan: src/storage.ts)
        render(); // full redraw replaces the gesture preview
      }
    }
    return;
  }

  gesture.current = null;
  switch (g.type) {
    case 'bg-drag':
      if (g.moved) { flushHistoryDebounce(); pushHistory(); save(); }
      render();
      return;
    case 'bg-rot':
      flushHistoryDebounce(); pushHistory(); save();
      render();
      return;
    case 'bg-calibrate-tap':
      if (!g.moved) bgCalibrationTap(g.startX, g.startY);
      else { saveView(); render(); }
      return;
    case 'drag-shape':
      if (g.moved) {
        // (A vine whose support moved out of its reach is a groundcover again, in the same step: src/vines.ts.)
        const freed = freeStrandedVines();
        const moved = state.selectedIds.length > 1 && state.selectedIds.includes(g.id) ? state.selectedIds : [g.id];
        flushHistoryDebounce(); pushHistory('move ' + stepNamed(state.shapes.filter((s) => moved.includes(s.id)))); save();
        if (freed.length) saidFreed(freed); else afterMove(g.ids);
      }
      else {
        const shape = state.shapes.find((s) => s.id === g.id);
        if (shape) handleShapeTap(shape, { x: g.startX, y: g.startY });
        // (Under a tree's canopy, the tap went through to this: say how to pick the tree, the first few times.)
        canopyHint(screenToFeet(g.startX, g.startY), state.shapes, pxPerFoot(), g.id);
      }
      render();
      return;
    case 'shape-resize':
    case 'shape-rotate':
      if (g.moved) { if (handleDragChanged(g, state.shapes)) { flushHistoryDebounce(); pushHistory(); save(); } } // (one undo step for the drag)
      else tapThroughHandle(g.startX, g.startY); // (a tap on a handle is a tap on what's under it)
      render();
      return;
    case 'drag-feature': {
      if (g.moved) { if (featureDragChanged(g)) { flushHistoryDebounce(); pushHistory(); save(); } }
      else { selectOnly(g.id); state.panel = 'props'; } // (a tap on one: its shape's properties, where it's listed)
      render();
      return;
    }
    case 'drag-vertex':
      if (g.moved || g.inserted) { flushHistoryDebounce(); pushHistory(); save(); }
      if (state.editPoints) state.editPoints.vertex = g.index;
      render();
      return;
    case 'pan':
      if (g.moved) {
        saveView(); forgetLastTap(); // (the plan moved: the same spot on screen is another place)
        // (The first few times a drag over a shape pans, on this device: how to move it.)
        if (g.overShape && hintDue(DRAG_HINT, 3)) { toast('That moved the plan. To move a shape, tap it first, then drag it.', 4000); hintShown(DRAG_HINT); }
      }
      else if (state.draw) drawTap(g.startX, g.startY);
      else if (state.featurePlace) featureTap(g.startX, g.startY);
      else if (state.placing) placeTap(g.startX, g.startY);
      else if (state.editPoints) state.editPoints.vertex = null;
      else if (g.tapShapeId) { // tap on a locked shape: select it
        const shape = state.shapes.find((s) => s.id === g.tapShapeId);
        if (shape) handleShapeTap(shape, { x: g.startX, y: g.startY });
        canopyHint(screenToFeet(g.startX, g.startY), state.shapes, pxPerFoot(), g.tapShapeId);
      } else { // tap on empty canvas
        clearSelection();
        state.panel = null;
        tapTracker.id = null; tapTracker.time = 0;
        canopyHint(screenToFeet(g.startX, g.startY), state.shapes, pxPerFoot());
      }
      render();
      return;
    case 'marquee':
      if (g.moved && state.marquee) {
        const m = state.marquee;
        const box = { minX: Math.min(m.x1, m.x2), maxX: Math.max(m.x1, m.x2), minY: Math.min(m.y1, m.y2), maxY: Math.max(m.y1, m.y2) };
        // What the box touches, not a shape it lies wholly inside (the property line around the plants).
        const touched = state.shapes.filter((s) => shownWith(s, state.viewFilter) && lassoTouches(s, box)).map((s) => s.id);
        state.selectedIds = g.add ? [...new Set([...state.selectedIds, ...touched])] : touched;
      } else if (g.tapShapeId) {
        toggleSelect(g.tapShapeId);
      } else if (!g.add) {
        clearSelection(); // (a modifier click that missed keeps what's selected)
      }
      state.marquee = null;
      render();
      return;
  }
}

/**
 * A tap on a handle that didn't move: what's under it gets the tap (a plant on a bed's corner, the shape beside its
 * knob), or, with nothing under it, the empty plan (which clears the selection).
 */
function tapThroughHandle(clientX: number, clientY: number) {
  const under = document.elementsFromPoint(clientX, clientY).find((el) => !el.closest('[data-layer="handles"]')) as SVGElement | HTMLElement | undefined;
  const id = under?.dataset?.shapeId ?? under?.dataset?.trunkOf ?? under?.dataset?.featureOf ?? under?.dataset?.outlineOf ?? under?.dataset?.pinOf ?? under?.dataset?.labelOf;
  const shape = id ? state.shapes.find((s) => s.id === id) : undefined;
  if (shape) handleShapeTap(shape, { x: clientX, y: clientY });
  else { clearSelection(); state.panel = null; tapTracker.id = null; tapTracker.time = 0; }
  canopyHint(screenToFeet(clientX, clientY), state.shapes, pxPerFoot(), shape?.id);
}

export function onShapePointerDown(e: PointerEvent, shape: Shape) {
  // In background edit/calibration modes shapes are inert: route the tap to
  // the canvas gesture logic (and stop it bubbling so it isn't handled twice).
  if (state.bgEditMode || state.bgCalibrate) {
    e.stopPropagation();
    onCanvasPointerDown(e);
    return;
  }
  e.stopPropagation();
  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  if (activePointers.size === 2) { startPinchGesture(); return; }
  if (activePointers.size > 2) return;

  // Shift, Ctrl or Cmd held: a click adds this shape to the selection or takes it out, locked or not; a drag draws a
  // box that adds what it touches.
  if (adding(e) && !state.draw && !state.editPoints && !state.placing && !state.featurePlace) {
    const feet = screenToFeet(e.clientX, e.clientY);
    gesture.current = { type: 'marquee', startX: e.clientX, startY: e.clientY, startFeet: feet, currentFeet: feet, moved: false, tapShapeId: shape.id, add: true };
    state.marquee = { x1: feet.x, y1: feet.y, x2: feet.x, y2: feet.y };
    return;
  }

  // A vine's band over the support it climbs, the support selected: a press there is on the support, so a drag moves
  // it, not the vine (round 3, Kim: dragging her trellis tore its hydrangea off instead).
  if (shape.type === 'circle' && shape.climbsOn && state.selectedIds.length === 1 && state.selectedIds[0] === shape.climbsOn
    && !state.selectMode && !state.draw && !state.editPoints && !state.placing && !state.featurePlace) {
    const support = shapesAt(e.clientX, e.clientY).find((s) => s.id === shape.climbsOn);
    if (support) { activePointers.delete(e.pointerId); onShapePointerDown(e, support); return; }
  }
  // A plant over a shorter one (Jason, Oct 30: tallest on top): a press goes to the one under it, so what's planted
  // under a shrub can still be picked. Under a canopy (drawn see-through), anywhere within it; under a solid plant
  // (its outline and name drawn over it), near its middle, where its name is, so the plant over it can be picked
  // elsewhere. Once the one on top is selected, it keeps the press. (Not a tree: its canopy lets presses through
  // already, and one that reaches it is on its trunk.)
  const plantLike: boolean = drawnBySize(shape) && !isTree(shape as Shape); // (not narrowed: a circle that isn't a tree is still a circle)
  if (plantLike && !isSelected(shape.id) && !state.selectMode && !state.draw && !state.editPoints && !state.placing && !state.featurePlace) {
    const here = shapesAt(e.clientX, e.clientY), at = here.findIndex((s) => s.id === shape.id);
    const p = screenToFeet(e.clientX, e.clientY);
    const nearMiddle = (s: Shape) => s.type === 'circle' && Math.hypot(p.x - s.x, p.y - s.y) <= s.radius * 0.5;
    const under = here.slice(at + 1).find((s) => drawnBySize(s) && s.status !== 'gone' && !isLocked(s) && shownWith(s, state.viewFilter)
      && (isSeeThrough(shape.id) || (isHidden(s.id) && nearMiddle(s))));
    if (under) { activePointers.delete(e.pointerId); onShapePointerDown(e, under); return; }
  }
  // A sun area over a bed (or a lawn, a path): a press there is on the bed, unless the sun area is selected, so a tap
  // picks the bed and a drag moves it, its plants with it; the sun area is the next tap (sunAreasLast). The UI review,
  // 2026-11-01. (One that's locked is ground itself: below, a press on it goes to what's on it.)
  if (shape.role === 'shade' && !isLocked(shape) && !isSelected(shape.id) && !state.selectMode && !state.draw && !state.editPoints && !state.placing && !state.featurePlace) {
    const ground = shapesAt(e.clientX, e.clientY).find((s) => s.id !== shape.id && s.role !== 'shade' && !isLocked(s) && shownWith(s, state.viewFilter));
    if (ground) { activePointers.delete(e.pointerId); onShapePointerDown(e, ground); return; }
  }
  // Locked shapes are part of the ground: a press on one goes to what's on it, unlocked, under the finger (Jason,
  // Oct 29: a bed drawn under a locked house); with nothing there, dragging pans (or lassos in select mode), and a
  // tap still selects it.
  if (isLocked(shape) && !(isSelected(shape.id) && state.selectedIds.length > 1)) {
    const busy = state.selectMode || !!state.draw || !!state.editPoints || !!state.placing || !!state.featurePlace;
    const onIt = !busy && shapesAt(e.clientX, e.clientY).find((s) => s.id !== shape.id && !isLocked(s) && shownWith(s, state.viewFilter));
    if (onIt) { activePointers.delete(e.pointerId); onShapePointerDown(e, onIt); return; }
    if (state.selectMode) {
      const feet = screenToFeet(e.clientX, e.clientY);
      gesture.current = { type: 'marquee', startX: e.clientX, startY: e.clientY, startFeet: feet, currentFeet: feet, moved: false, tapShapeId: shape.id };
      state.marquee = { x1: feet.x, y1: feet.y, x2: feet.x, y2: feet.y };
    } else {
      gesture.current = {
        type: 'pan', startX: e.clientX, startY: e.clientY,
        startOffset: { x: state.offsetX, y: state.offsetY }, moved: false, tapShapeId: shape.id,
      };
    }
    return;
  }

  // Select mode, on a shape not picked: a drag lassos, as the banner says, and a tap picks it (Priya, Oct 30: a drag
  // there moved the patio, then a bed with plants the phase filter hid). A drag on what's picked moves the picks.
  if (state.selectMode && !isSelected(shape.id) && !state.draw && !state.editPoints && !state.placing && !state.featurePlace) {
    const feet = screenToFeet(e.clientX, e.clientY);
    gesture.current = { type: 'marquee', startX: e.clientX, startY: e.clientY, startFeet: feet, currentFeet: feet, moved: false, tapShapeId: shape.id };
    state.marquee = { x1: feet.x, y1: feet.y, x2: feet.x, y2: feet.y };
    return;
  }
  // By touch, a shape that isn't selected is ground under the finger: a drag pans the plan, a tap selects it (Jason,
  // Oct 30, from round 2: sun areas, lawns and beds cover most of a phone's plan, and a drag meant to look around moved
  // them). To move one: tap it, then drag. A mouse (or a pen) drags it at once, as before.
  if (e.pointerType === 'touch' && !isSelected(shape.id) && !state.draw && !state.editPoints && !state.placing && !state.featurePlace) {
    gesture.current = { type: 'pan', startX: e.clientX, startY: e.clientY, startOffset: { x: state.offsetX, y: state.offsetY }, moved: false, tapShapeId: shape.id, overShape: true };
    return;
  }
  const cur = screenToFeet(e.clientX, e.clientY);
  // Dragging a member of a multi-selection drags the whole selection.
  const selectedIds = isSelected(shape.id) && state.selectedIds.length > 1 ? state.selectedIds.slice() : [shape.id];
  // Beds that carry plants bring the plants inside them, unless plants are among what's selected (src/beds.ts).
  const dragIds = movedWith(selectedIds.map((id) => state.shapes.find((sh) => sh.id === id)).filter((s): s is Shape => !!s), state.shapes);
  const shapeStarts = dragIds
    .map((id) => state.shapes.find((sh) => sh.id === id))
    .filter((s): s is Shape => !!s)
    .map((s) => ({ id: s.id, startX: s.x, startY: s.y }));

  gesture.current = {
    type: 'drag-shape',
    id: shape.id,
    ids: dragIds,
    grabOffset: { x: cur.x - shape.x, y: cur.y - shape.y },
    primaryStart: { x: shape.x, y: shape.y },
    shapeStarts,
    startX: e.clientX, startY: e.clientY,
    moved: false
  };
}

/**
 * A press on a sub-feature (src/features.ts). On the one selected, unlocked shape it drags the sub-feature along the
 * edges; anywhere else it's a press on its shape (selecting, dragging, adding to the selection), as before.
 */
export function onFeaturePointerDown(e: PointerEvent, shape: Shape, featureId: string) {
  const own = state.selectedIds.length === 1 && state.selectedIds[0] === shape.id && !isLocked(shape) && !adding(e) && !state.selectMode && !state.bgEditMode && !state.bgCalibrate;
  const f = shape.type !== 'circle' && shape.type !== 'text' ? shape.features?.find((x) => x.id === featureId) : undefined;
  const spot = f && featureSpot(shape, f);
  if (!own || !spot || shape.type === 'circle' || shape.type === 'text') { onShapePointerDown(e, shape); return; }
  e.stopPropagation();
  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  if (activePointers.size === 2) { startPinchGesture(); return; }
  if (activePointers.size > 2) return;
  flushHistoryDebounce();
  const p = screenToFeet(e.clientX, e.clientY);
  gesture.current = {
    type: 'drag-feature', id: shape.id, featureId, start: deepClone(shape.features ?? []), grab: { x: p.x - spot.mid.x, y: p.y - spot.mid.y },
    historyAt: state.historyIndex, startX: e.clientX, startY: e.clientY, moved: false,
  };
}
/** Whether a sub-feature's drag moved anything (one undo step if so, none if it came back where it was). */
function featureDragChanged(g: Extract<Gesture, { type: 'drag-feature' }>): boolean {
  if (!g.moved || state.historyIndex !== g.historyAt) return false;
  const s = state.shapes.find((sh) => sh.id === g.id);
  const now = s && s.type !== 'circle' && s.type !== 'text' ? s.features : undefined;
  return JSON.stringify(now ?? []) !== JSON.stringify(g.start);
}

/** Forget all pointers (window lost focus or page hidden mid-gesture). */
export function cancelGestures() {
  activePointers.clear();
  const g = gesture.current;
  // (A handle's drag cut short keeps what it did so far, undoably.)
  if ((g?.type === 'shape-resize' || g?.type === 'shape-rotate') && g.moved && handleDragChanged(g, state.shapes)) { flushHistoryDebounce(); pushHistory(); save(); }
  if (g?.type === 'drag-feature' && featureDragChanged(g)) { flushHistoryDebounce(); pushHistory(); save(); }
  if (gesture.current) {
    gesture.current = null;
    state.marquee = null;
    render();
  }
}

/** When the last wheel event that looked like a trackpad's came (ms): a scroll's later, bigger steps are the same scroll. */
let lastTrackpadWheel = -Infinity;
/** The full redraw after a run of wheel events (each one moves only the view: previewView). */
let wheelSettle: ReturnType<typeof setTimeout> | null = null;
/**
 * Whether a wheel event is a mouse wheel's notch rather than a trackpad's scroll. A mouse wheel turns in whole lines
 * (Firefox, read before its pixels), or in whole steps of 120 (Chrome, Safari: wheelDelta); a trackpad sends pixels,
 * sideways too, often in fractions. A big whole step inside a trackpad's scroll is its flick, not a wheel.
 */
function fromMouseWheel(e: WheelEvent): boolean {
  if (e.deltaMode !== 0) return true;
  const t = performance.now();
  const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
  // (Chrome on Linux turns a notch into 53.33 pixels: its wheelDelta, a whole 120, says what it was.)
  const notch = e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && (legacy ? legacy % 120 === 0 : Number.isInteger(e.deltaY));
  if (notch && t - lastTrackpadWheel > 300) return true;
  lastTrackpadWheel = t;
  return false;
}
/**
 * The wheel over the plan (Jason, 2026-10-25): a trackpad's two-finger scroll pans; its pinch (which browsers send as
 * a wheel with Ctrl held) zooms, as does Ctrl or Cmd with any wheel, and a mouse wheel's notches.
 */
export function onWheel(e: WheelEvent) {
  e.preventDefault();
  const line = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? state.canvasH : 1; // (in pixels)
  if (e.ctrlKey || e.metaKey || fromMouseWheel(e)) {
    // (A pinch sends small steps, a wheel big ones: each step counts for more in a pinch, a wheel's capped.)
    const dy = e.deltaY * line;
    zoomBy(Math.exp(e.ctrlKey && Math.abs(dy) < 50 ? -dy * 0.01 : -Math.max(-120, Math.min(120, dy)) * 0.0015), e.clientX, e.clientY);
    updateStatusReadout();
  } else {
    const ppf = pxPerFoot();
    // (Shift turns a mouse wheel's scroll sideways on most systems; a trackpad's sideways scroll comes as deltaX.)
    const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * line, dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY * line;
    state.offsetX += dx / ppf;
    state.offsetY += dy / ppf;
    saveView();
  }
  previewView();
  if (wheelSettle) clearTimeout(wheelSettle);
  wheelSettle = setTimeout(() => { wheelSettle = null; render(); }, 150);
}
