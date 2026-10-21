import { bgCalibrationTap, bgCenterClient } from './background';
import { DOUBLE_TAP_MS, DRAG_THRESHOLD_PX, MAX_ZOOM, MIN_ZOOM, PX_PER_FOOT_BASE } from './constants';
import { canvasRect, lassoTouches, pxPerFoot, screenToFeet } from './geometry';
import { flushHistoryDebounce, pushHistory } from './history';
import { zoomBy } from './mutations';
import { attachedPlants } from './beds';
import { isLocked } from './roles';
import { shownWith } from './status';
import { clearSelection, isSelected, selectOnly, toggleSelect } from './selection';
import { gesture, state, tapTracker } from './state';
import { save } from './storage';
import type { Point, Shape } from './types';
import { previewView, redrawBackground, redrawHandles, redrawMarquee, redrawShapes } from './canvas';
import { drawTap, editedShape, insertVertex, moveVertex } from './draw';
import { placeTap } from './place';
import { render, updateStatusReadout } from './ui/render';
import { now, snap } from './util';

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
  gesture.current = {
    type: 'pinch',
    startDist: info.dist,
    startZoom: state.zoom,
    centerScreen: { x: info.cx, y: info.cy },
    centerFeetAtStart: screenToFeet(info.cx, info.cy)
  };
  state.marquee = null;
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

export function onCanvasPointerDown(e: PointerEvent) {
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

  if (state.selectMode && !state.draw && !state.editPoints && !state.placing) {
    const feet = screenToFeet(clientX, clientY);
    gesture.current = { type: 'marquee', startX: clientX, startY: clientY, startFeet: feet, currentFeet: feet, moved: false };
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
      }
      e.preventDefault();
      return;
    }
  }
}

/** Pan mode: tap selects, double-tap opens properties. Select mode: tap toggles. */
function handleShapeTap(shape: Shape) {
  if (state.selectMode) { toggleSelect(shape.id); return; }
  const t = now();
  if (tapTracker.id === shape.id && t - tapTracker.time < DOUBLE_TAP_MS) {
    selectOnly(shape.id);
    state.panel = 'props';
    tapTracker.id = null; tapTracker.time = 0;
  } else {
    selectOnly(shape.id);
    tapTracker.id = shape.id; tapTracker.time = t;
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
        save();
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
      else { save(); render(); }
      return;
    case 'drag-shape':
      if (g.moved) { flushHistoryDebounce(); pushHistory(); save(); }
      else {
        const shape = state.shapes.find((s) => s.id === g.id);
        if (shape) handleShapeTap(shape);
      }
      render();
      return;
    case 'drag-vertex':
      if (g.moved || g.inserted) { flushHistoryDebounce(); pushHistory(); save(); }
      if (state.editPoints) state.editPoints.vertex = g.index;
      render();
      return;
    case 'pan':
      if (g.moved) save();
      else if (state.draw) drawTap(g.startX, g.startY);
      else if (state.placing) placeTap(g.startX, g.startY);
      else if (state.editPoints) state.editPoints.vertex = null;
      else if (g.tapShapeId) { // tap on a locked shape: select it
        const shape = state.shapes.find((s) => s.id === g.tapShapeId);
        if (shape) handleShapeTap(shape);
      } else { // tap on empty canvas
        clearSelection();
        state.panel = null;
        tapTracker.id = null; tapTracker.time = 0;
      }
      render();
      return;
    case 'marquee':
      if (g.moved && state.marquee) {
        const m = state.marquee;
        const box = { minX: Math.min(m.x1, m.x2), maxX: Math.max(m.x1, m.x2), minY: Math.min(m.y1, m.y2), maxY: Math.max(m.y1, m.y2) };
        // What the box touches, not a shape it lies wholly inside (the property line around the plants).
        state.selectedIds = state.shapes.filter((s) => shownWith(s, state.viewFilter) && lassoTouches(s, box)).map((s) => s.id);
      } else if (g.tapShapeId) {
        toggleSelect(g.tapShapeId);
      } else {
        clearSelection();
      }
      state.marquee = null;
      render();
      return;
  }
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

  // Locked shapes are part of the ground: dragging on one pans (or lassos in
  // select mode), a tap still selects it.
  if (isLocked(shape) && !(isSelected(shape.id) && state.selectedIds.length > 1)) {
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

  const cur = screenToFeet(e.clientX, e.clientY);
  // Dragging a member of a multi-selection drags the whole selection.
  const selectedIds = isSelected(shape.id) && state.selectedIds.length > 1 ? state.selectedIds.slice() : [shape.id];
  // Beds that carry plants bring the plants inside them.
  const dragIds = [...new Set(selectedIds.flatMap((id) => {
    const s = state.shapes.find((sh) => sh.id === id);
    return s ? [id, ...attachedPlants(s, state.shapes).map((p) => p.id)] : [id];
  }))];
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

/** Forget all pointers (window lost focus or page hidden mid-gesture). */
export function cancelGestures() {
  activePointers.clear();
  if (gesture.current) {
    gesture.current = null;
    state.marquee = null;
    render();
  }
}

export function onWheel(e: WheelEvent) {
  e.preventDefault();
  zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  render();
}
