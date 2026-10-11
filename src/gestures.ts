import { bgCalibrationTap, bgCenterScreen } from './background';
import { DOUBLE_TAP_MS, DRAG_THRESHOLD_PX, MAX_ZOOM, MIN_ZOOM, PX_PER_FOOT_BASE } from './constants';
import { pxPerFoot, rectsIntersect, screenToFeet, shapeBBox } from './geometry';
import { flushHistoryDebounce, pushHistory } from './history';
import { zoomBy } from './mutations';
import { clearSelection, isSelected, selectOnly, toggleSelect } from './selection';
import { gesture, state, tapTracker } from './state';
import { save } from './storage';
import { render } from './ui/render';
import { now, snap } from './util';

// ============================================================
// GESTURES
// ============================================================
// Track every active pointer (finger / mouse) by pointerId. Required for
// pinch — pointer events don't have an e.touches list like touch events do;
// each finger fires its own pointerdown/move/up with a unique pointerId, so
// we have to assemble multi-touch state ourselves.
export const activePointers = new Map();

export function getPinchInfo() {
  if (activePointers.size !== 2) return null;
  const pts = Array.from(activePointers.values());
  return {
    cx: (pts[0].clientX + pts[1].clientX) / 2,
    cy: (pts[0].clientY + pts[1].clientY) / 2,
    dist: Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY)
  };
}
export function startPinchGesture() {
  const info = getPinchInfo();
  if (!info) return;
  // Clear any in-flight single-finger gesture (pan/marquee/drag-shape) so
  // it doesn't keep applying a delta as the second finger arrives.
  gesture.current = {
    type: 'pinch',
    startDist: info.dist,
    startZoom: state.zoom,
    centerScreen: { x: info.cx, y: info.cy },
    centerFeetAtStart: screenToFeet(info.cx, info.cy)
  };
  state.marquee = null;
}

export function onCanvasPointerDown(e) {
  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

  // Second finger lands → pinch, regardless of where the first one is
  if (activePointers.size === 2) {
    startPinchGesture();
    return;
  }
  // Ignore 3+ pointers (palm rejection)
  if (activePointers.size > 2) return;

  // Only the SVG root and the grid backdrop start canvas gestures.
  // (Shape taps go through onShapePointerDown, buttons handle their own events.)
  // In bg edit mode: taps on the bg image body ('bg-body') or rotation handle
  // ('bg-rot') start bg gestures; other elements route as normal.
  const role = e.target.dataset ? e.target.dataset.role : null;
  const isCanvas = e.target.id === 'canvas-svg' || role === 'grid';
  const isBgBody = role === 'bg-body';
  const isBgRot = role === 'bg-rot';
  if (!isCanvas && !isBgBody && !isBgRot) return;

  const clientX = e.clientX, clientY = e.clientY;

  // Background rotation handle drag
  if (isBgRot && state.bgImage && state.bgEditMode) {
    const ctr = bgCenterScreen(state.bgImage);
    // Angle from center to pointer, in degrees, 0° = up
    const angleAt = (x, y) => Math.atan2(y - ctr.y, x - ctr.x) * 180 / Math.PI + 90;
    gesture.current = {
      type: 'bg-rot',
      startAngle: angleAt(clientX, clientY),
      startRotation: state.bgImage.rotation || 0,
      angleAt
    };
    return;
  }
  // Background image body drag (move)
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

  // Calibration tap on canvas — record the point, don't start a normal
  // gesture. Handled on pointerup so accidental tiny drags still count.
  // During calibration ANY tap in the canvas area counts (whether it lands
  // on grid, shape, or bg image body), so a landmark obscured by a shape or
  // sitting on the image can still be picked.
  if (state.bgCalibrate && (state.bgCalibrate.step === 'point1' || state.bgCalibrate.step === 'point2')) {
    gesture.current = {
      type: 'bg-calibrate-tap',
      startX: clientX, startY: clientY,
      moved: false
    };
    return;
  }

  if (!isCanvas) return;

  if (state.selectMode) {
    const feet = screenToFeet(clientX, clientY);
    gesture.current = {
      type: 'marquee',
      startX: clientX, startY: clientY,
      startFeet: feet,
      currentFeet: feet,
      moved: false
    };
    state.marquee = { x1: feet.x, y1: feet.y, x2: feet.x, y2: feet.y };
  } else {
    gesture.current = {
      type: 'pan',
      startX: clientX, startY: clientY,
      startOffset: { x: state.offsetX, y: state.offsetY },
      moved: false
    };
  }
}

export function onCanvasPointerMove(e) {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  }
  const g = gesture.current;
  if (!g) return;

  if (g.type === 'pinch') {
    const info = getPinchInfo();
    if (!info) return; // one finger lifted; we'll deal with that on pointerup
    const ratio = info.dist / g.startDist;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, g.startZoom * ratio));
    const newPxPerFoot = PX_PER_FOOT_BASE * newZoom;
    const rect = document.getElementById('canvas-svg').getBoundingClientRect();
    state.offsetX = g.centerFeetAtStart.x - (g.centerScreen.x - rect.left) / newPxPerFoot;
    state.offsetY = g.centerFeetAtStart.y - (g.centerScreen.y - rect.top) / newPxPerFoot;
    state.zoom = newZoom;
    e.preventDefault();
    render();
    return;
  }

  const clientX = e.clientX, clientY = e.clientY;
  if (g.type === 'bg-drag') {
    if (!state.bgImage) { gesture.current = null; return; }
    const dxPx = clientX - g.startX;
    const dyPx = clientY - g.startY;
    if (Math.hypot(dxPx, dyPx) > DRAG_THRESHOLD_PX) g.moved = true;
    if (g.moved) {
      const cur = screenToFeet(clientX, clientY);
      state.bgImage.cx = cur.x - g.grabOffset.x;
      state.bgImage.cy = cur.y - g.grabOffset.y;
      render();
    }
    e.preventDefault();
    return;
  }
  if (g.type === 'bg-rot') {
    if (!state.bgImage) { gesture.current = null; return; }
    const a = g.angleAt(clientX, clientY);
    let newRot = g.startRotation + (a - g.startAngle);
    // Normalize to [-180, 180)
    while (newRot >= 180) newRot -= 360;
    while (newRot < -180) newRot += 360;
    state.bgImage.rotation = newRot;
    render();
    e.preventDefault();
    return;
  }
  if (g.type === 'bg-calibrate-tap') {
    const dxPx = clientX - g.startX;
    const dyPx = clientY - g.startY;
    if (Math.hypot(dxPx, dyPx) > DRAG_THRESHOLD_PX) g.moved = true;
    // No visual change during move — the tap is finalized on pointerup
    return;
  }
  if (g.type === 'pan') {
    const dxPx = clientX - g.startX;
    const dyPx = clientY - g.startY;
    if (Math.hypot(dxPx, dyPx) > DRAG_THRESHOLD_PX) g.moved = true;
    state.offsetX = g.startOffset.x - dxPx / pxPerFoot();
    state.offsetY = g.startOffset.y - dyPx / pxPerFoot();
    render();
  } else if (g.type === 'marquee') {
    const dxPx = clientX - g.startX;
    const dyPx = clientY - g.startY;
    if (Math.hypot(dxPx, dyPx) > DRAG_THRESHOLD_PX) g.moved = true;
    const feet = screenToFeet(clientX, clientY);
    g.currentFeet = feet;
    state.marquee = {
      x1: g.startFeet.x, y1: g.startFeet.y,
      x2: feet.x, y2: feet.y
    };
    render();
    e.preventDefault();
  } else if (g.type === 'drag-shape') {
    const dxPx = clientX - g.startX;
    const dyPx = clientY - g.startY;
    if (Math.hypot(dxPx, dyPx) > DRAG_THRESHOLD_PX) g.moved = true;
    if (g.moved) {
      const cur = screenToFeet(clientX, clientY);
      const dxFt = snap(cur.x - g.grabOffset.x) - g.primaryStart.x;
      const dyFt = snap(cur.y - g.grabOffset.y) - g.primaryStart.y;
      for (const item of g.shapeStarts) {
        const shape = state.shapes.find(s => s.id === item.id);
        if (!shape || shape.locked) continue;
        shape.x = snap(item.startX + dxFt);
        shape.y = snap(item.startY + dyFt);
      }
      render();
    }
    e.preventDefault();
  }
}

export function handleShapeTap(shape) {
  if (state.selectMode) {
    toggleSelect(shape.id);
    return;
  }
  // Pan mode: single-select on tap, double-tap opens props
  const now_ = now();
  if (tapTracker.id === shape.id && now_ - tapTracker.time < DOUBLE_TAP_MS) {
    selectOnly(shape.id);
    state.panel = 'props';
    tapTracker.id = null; tapTracker.time = 0;
  } else {
    selectOnly(shape.id);
    tapTracker.id = shape.id; tapTracker.time = now_;
  }
}

export function onCanvasPointerUp(e) {
  if (e && e.pointerId !== undefined) {
    activePointers.delete(e.pointerId);
  }
  const g = gesture.current;
  if (!g) return;

  if (g.type === 'pinch') {
    // Pinch is only "live" while two fingers are down. When one lifts, end
    // pinch. If a finger remains, smoothly transition into a pan from that
    // finger's position (otherwise the still-down finger would do nothing
    // until lifted-and-re-tapped, which feels broken).
    if (activePointers.size < 2) {
      gesture.current = null;
      if (activePointers.size === 1) {
        const p = Array.from(activePointers.values())[0];
        gesture.current = {
          type: 'pan',
          startX: p.clientX, startY: p.clientY,
          startOffset: { x: state.offsetX, y: state.offsetY },
          moved: true  // skip "tap on empty" path on release
        };
      } else {
        save();
      }
    }
    return;
  }

  gesture.current = null;

  if (g.type === 'bg-drag') {
    if (g.moved) {
      flushHistoryDebounce();
      pushHistory();
      save();
    }
    // Non-move tap on the bg body in edit mode: do nothing (no accidental
    // action). If we wanted a "tap to open panel" affordance we'd add it here.
    render();
    return;
  }
  if (g.type === 'bg-rot') {
    flushHistoryDebounce();
    pushHistory();
    save();
    render();
    return;
  }
  if (g.type === 'bg-calibrate-tap') {
    if (!g.moved) {
      // Genuine tap — record the calibration point
      bgCalibrationTap(g.startX, g.startY);
    } else {
      // Drifted too much; ignore. render() to be safe.
      render();
    }
    return;
  }

  if (g.type === 'drag-shape') {
    if (g.moved) {
      flushHistoryDebounce();
      pushHistory();
      save();
    } else {
      const shape = state.shapes.find(s => s.id === g.id);
      if (shape) handleShapeTap(shape);
    }
    render();
  } else if (g.type === 'pan') {
    if (g.moved) save();
    else {
      clearSelection();
      state.panel = null;
      tapTracker.id = null; tapTracker.time = 0;
    }
    render();
  } else if (g.type === 'marquee') {
    if (g.moved && state.marquee) {
      const m = state.marquee;
      const rect = {
        minX: Math.min(m.x1, m.x2), maxX: Math.max(m.x1, m.x2),
        minY: Math.min(m.y1, m.y2), maxY: Math.max(m.y1, m.y2)
      };
      const hits = [];
      for (const s of state.shapes) {
        const b = shapeBBox(s);
        if (rectsIntersect(b, rect)) hits.push(s.id);
      }
      state.selectedIds = hits;
    } else {
      clearSelection();
    }
    state.marquee = null;
    render();
  }
}

export function onShapePointerDown(e, shape) {
  // In bg edit mode or during calibration, shapes are inert — the tap should
  // pass through to canvas gestures (bg drag/rotate handles, calibration
  // point placement, or pan).
  if (state.bgEditMode || state.bgCalibrate) {
    onCanvasPointerDown(e);
    return;
  }
  e.stopPropagation();
  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

  // If this is the second finger landing (first one might be elsewhere on
  // the canvas, or even on another shape), switch to pinch.
  if (activePointers.size === 2) {
    startPinchGesture();
    return;
  }
  if (activePointers.size > 2) return;

  const clientX = e.clientX, clientY = e.clientY;
  const cur = screenToFeet(clientX, clientY);

  let dragIds;
  if (isSelected(shape.id) && state.selectedIds.length > 1) {
    dragIds = state.selectedIds.slice();
  } else {
    dragIds = [shape.id];
  }
  const shapeStarts = dragIds.map(id => {
    const s = state.shapes.find(sh => sh.id === id);
    return s ? { id, startX: s.x, startY: s.y } : null;
  }).filter(Boolean);

  gesture.current = {
    type: 'drag-shape',
    id: shape.id,
    ids: dragIds,
    grabOffset: { x: cur.x - shape.x, y: cur.y - shape.y },
    primaryStart: { x: shape.x, y: shape.y },
    shapeStarts,
    startX: clientX, startY: clientY,
    moved: false
  };
}

export function onWheel(e) {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0015);
  zoomBy(factor, e.clientX, e.clientY);
  render();
}
