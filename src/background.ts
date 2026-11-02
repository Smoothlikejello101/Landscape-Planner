import { redrawCanvas } from './canvas';
import { BG_HANDLE_RADIUS_PX, BG_JPEG_QUALITY, BG_MAX_IMAGE_DIM, BG_ROT_HANDLE_OFFSET_PX } from './constants';
import { svgEl, type Attrs } from './dom';
import { canvasRect, pxPerFoot, rotate, screenToFeet, viewCenterFeet } from './geometry';
import { flushHistoryDebounce, pushHistory, pushHistoryDebounced } from './history';
import { state } from './state';
import { save } from './storage';
import type { BgImage, Point } from './types';
import { calibrationSeen, render } from './ui/render';
import { uid } from './util';
import { ask, tell } from './ui/ask';
import { zoomToBounds } from './mutations';

// Background image (satellite photo or survey) to trace over.
// Stored per project as a downscaled JPEG data URL. Position is the image
// CENTER in world feet so rotation about the center is a simple transform.
// ftPerPx (world feet per image pixel) is set by two-point calibration.

export function bgSizeFt(bg: BgImage) {
  return { w: bg.naturalWidth * bg.ftPerPx, h: bg.naturalHeight * bg.ftPerPx };
}
/** Image-pixel coords → world feet (applies position and rotation). */
export function imagePxToWorld(bg: BgImage, p: Point): Point {
  const { w, h } = bgSizeFt(bg);
  const r = rotate(p.x * bg.ftPerPx - w / 2, p.y * bg.ftPerPx - h / 2, bg.rotation);
  return { x: bg.cx + r.x, y: bg.cy + r.y };
}
/** World feet → image-pixel coords (undoes position and rotation). */
export function worldToImagePx(bg: BgImage, world: Point): Point {
  const { w, h } = bgSizeFt(bg);
  const r = rotate(world.x - bg.cx, world.y - bg.cy, -bg.rotation);
  return { x: (r.x + w / 2) / bg.ftPerPx, y: (r.y + h / 2) / bg.ftPerPx };
}
/**
 * Where on the image (in its own pixels) a screen point falls. Calibration
 * points are kept in image pixels so later moves/rotations don't invalidate them.
 */
export function screenToImagePx(clientX: number, clientY: number, bg: BgImage): Point {
  return worldToImagePx(bg, screenToFeet(clientX, clientY));
}
function worldToCanvas(p: Point): Point {
  const ppf = pxPerFoot();
  return { x: (p.x - state.offsetX) * ppf, y: (p.y - state.offsetY) * ppf };
}
/** Rotation handle position (canvas px): above the image's top edge, along its rotated axis. */
export function bgRotHandleCanvas(bg: BgImage): Point {
  const { h } = bgSizeFt(bg);
  const r = rotate(0, -(h / 2 + BG_ROT_HANDLE_OFFSET_PX / pxPerFoot()), bg.rotation);
  return worldToCanvas({ x: bg.cx + r.x, y: bg.cy + r.y });
}
/** Image center in canvas px. */
export function bgCenterCanvas(bg: BgImage): Point {
  return worldToCanvas({ x: bg.cx, y: bg.cy });
}
/** Image center in client (page) px — what pointer events report. */
export function bgCenterClient(bg: BgImage): Point {
  const c = bgCenterCanvas(bg), rect = canvasRect();
  return { x: c.x + rect.left, y: c.y + rect.top };
}

// ---------- File upload + downscale ----------
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('File read failed'));
    r.readAsDataURL(file);
  });
}
export function loadImageEl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed — try a different file'));
    img.src = dataUrl;
  });
}
export function downscaleImage(img: HTMLImageElement, maxDim: number, quality: number) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), w: outW, h: outH };
}
export async function handleBgImageFile(file: File): Promise<boolean> {
  const name = (file.name || '').toLowerCase();
  const t = (file.type || '').toLowerCase();
  if (t === 'image/heic' || t === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif')) {
    void tell("iPhone HEIC/HEIF photos aren't supported by browsers. On iPhone: Settings → Camera → Formats → Most Compatible, then re-take the photo. Or convert this image to JPEG first.");
    return false;
  }
  if (!t.startsWith('image/')) {
    void tell('Please pick an image file (JPEG or PNG).');
    return false;
  }
  try {
    const img = await loadImageEl(await fileToDataUrl(file));
    const { dataUrl, w, h } = downscaleImage(img, BG_MAX_IMAGE_DIM, BG_JPEG_QUALITY);
    const estBytes = Math.round(dataUrl.length * 0.75); // base64 is ~4/3 of raw
    if (estBytes > 4_000_000) {
      const ok = await ask(`The photo is about ${(estBytes / 1024 / 1024).toFixed(1)} MB after compression. It might not fit in this browser's storage alongside your other projects. Use it anyway?`, { ok: 'Use it' });
      if (!ok) return false;
    }
    // Arbitrary initial scale (1 px = 0.1 ft), said to be a guess until calibrated; calibration follows immediately.
    const c = viewCenterFeet();
    flushHistoryDebounce();
    state.bgImage = {
      dataUrl, imageId: uid(), // id now, so undo snapshots share one stored image
      naturalWidth: w, naturalHeight: h, ftPerPx: 0.1,
      cx: c.x, cy: c.y, rotation: 0, opacity: 0.6, visible: true, uncalibrated: true,
    };
    state.photoElsewhere = null; // this photo replaces one kept on another device
    pushHistory();
    // (The whole photo in view, to find the two points on: Dana and Grace saw only a blur of green and gray.)
    zoomToBounds({ minX: c.x - (w * 0.1) / 2, maxX: c.x + (w * 0.1) / 2, minY: c.y - (h * 0.1) / 2, maxY: c.y + (h * 0.1) / 2 }, 12);
    calibrationSeen(); // (just added: no reminder this session; the calibration banner asks)
    save();
    return true;
  } catch (e) {
    void tell('Could not load image: ' + (e instanceof Error ? e.message : String(e)));
    return false;
  }
}
export function removeBgImage() {
  if (!state.bgImage) return;
  flushHistoryDebounce();
  state.bgImage = null;
  state.photoElsewhere = null;
  state.bgEditMode = false;
  state.bgCalibrate = null;
  pushHistory();
  save();
}
/** Patch the image and re-render everything (buttons, toggles). */
export function updateBgImage(patch: Partial<BgImage>) {
  if (!state.bgImage) return;
  Object.assign(state.bgImage, patch);
  save();
  pushHistoryDebounced();
  render();
}
/**
 * "Keep this photo on this device only": a setting of the photo, not an
 * undoable edit, so it's set on every undo step showing the same photo too
 * (undo or redo can't turn it off and send the photo).
 */
export function setPhotoDeviceOnly(on: boolean) {
  const bg = state.bgImage;
  if (!bg) return;
  for (const b of [bg, ...state.history.map((s) => s.bgImage)]) {
    if (!b || b.dataUrl !== bg.dataUrl) continue;
    if (on) b.deviceOnly = true; else delete b.deviceOnly;
  }
  save();
}
/** Patch the image and redraw only the canvas (inputs keep keyboard focus). */
export function updateBgImageSilent(patch: Partial<BgImage>) {
  if (!state.bgImage) return;
  Object.assign(state.bgImage, patch);
  save();
  pushHistoryDebounced();
  redrawCanvas();
}

// ---------- Calibration flow ----------
export function startBgCalibration() {
  if (!state.bgImage) return;
  state.bgCalibrate = { step: 'point1', p1: null, p2: null };
  state.panel = null;
  state.bgEditMode = false; // calibration taps must not be read as drags
  render();
}
export function cancelBgCalibration() {
  state.bgCalibrate = null;
  render();
}
export function bgCalibrationTap(clientX: number, clientY: number) {
  if (!state.bgImage || !state.bgCalibrate) return;
  const pt = screenToImagePx(clientX, clientY, state.bgImage);
  if (state.bgCalibrate.step === 'point1') {
    state.bgCalibrate.p1 = pt;
    state.bgCalibrate.step = 'point2';
  } else if (state.bgCalibrate.step === 'point2') {
    state.bgCalibrate.p2 = pt;
    state.bgCalibrate.step = 'distance';
    state.panel = 'bgDistance';
  }
  render();
}
/** Feet per image pixel from two image-pixel points a known distance apart. */
export function calibrationScale(p1: Point, p2: Point, distanceFt: number): number | string {
  const dPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (dPx < 2) return 'The two points are too close together. Try again with points further apart.';
  if (!(distanceFt > 0) || !isFinite(distanceFt)) return 'Please enter a positive distance in feet.';
  return distanceFt / dPx;
}
export function finishBgCalibration(distanceFt: number) {
  const cal = state.bgCalibrate;
  if (!state.bgImage || !cal || !cal.p1 || !cal.p2) return;
  const result = calibrationScale(cal.p1, cal.p2, distanceFt);
  if (typeof result === 'string') { void tell(result); return; }
  flushHistoryDebounce();
  state.bgImage.ftPerPx = result;
  delete state.bgImage.uncalibrated; // (to scale now)
  pushHistory();
  save();
  state.bgCalibrate = null;
  state.panel = 'bg';
  render();
}

// ---------- Rendering ----------
function imageFrame(bg: BgImage) {
  const ppf = pxPerFoot();
  const { w, h } = bgSizeFt(bg);
  const c = bgCenterCanvas(bg);
  return {
    x: c.x - (w * ppf) / 2, y: c.y - (h * ppf) / 2, w: w * ppf, h: h * ppf,
    transform: bg.rotation ? `rotate(${bg.rotation} ${c.x} ${c.y})` : null
  };
}
/** Drawn by renderGrid between the tan base and the grid lines. */
export function renderBgImageInto(svg: SVGElement) {
  const bg = state.bgImage;
  if (!bg || !bg.visible) return;
  const f = imageFrame(bg);
  const img = svgEl('image', {
    href: bg.dataUrl,
    x: f.x, y: f.y, width: f.w, height: f.h,
    opacity: bg.opacity,
    preserveAspectRatio: 'none', // aspect is already exact (same ftPerPx both axes)
    'pointer-events': state.bgEditMode ? 'auto' : 'none',
    style: state.bgEditMode ? 'cursor:move;touch-action:none;' : '',
    transform: f.transform,
    'data-role': state.bgEditMode ? 'bg-body' : null,
  });
  img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', bg.dataUrl); // older SVG stacks
  svg.appendChild(img);
}
function calibrationMarker(svg: SVGElement, bg: BgImage, p: Point, letter: string) {
  const s = worldToCanvas(imagePxToWorld(bg, p));
  svg.appendChild(svgEl('circle', { cx: s.x, cy: s.y, r: 10, fill: 'rgba(220,38,38,0.2)', stroke: '#dc2626', 'stroke-width': 2, 'pointer-events': 'none' }));
  svg.appendChild(svgEl('circle', { cx: s.x, cy: s.y, r: 3, fill: '#dc2626', 'pointer-events': 'none' }));
  svg.appendChild(svgEl('text', { x: s.x + 12, y: s.y - 8, 'font-size': 12, fill: '#dc2626', 'font-weight': 700, 'pointer-events': 'none', style: 'user-select:none;' }, letter));
  return s;
}
/** Edit-mode outline + rotation handle, and calibration markers. Drawn above shapes. */
export function renderBgHandles(svg: SVGElement) {
  const bg = state.bgImage;
  if (!bg) return;
  if (state.bgEditMode) {
    const f = imageFrame(bg);
    const outline: Attrs = {
      x: f.x, y: f.y, width: f.w, height: f.h,
      fill: 'none', stroke: '#7c3aed', 'stroke-width': 2,
      'stroke-dasharray': '6 4', 'pointer-events': 'none', transform: f.transform
    };
    svg.appendChild(svgEl('rect', outline));
    const rot = bgRotHandleCanvas(bg);
    const ctr = bgCenterCanvas(bg);
    svg.appendChild(svgEl('line', {
      x1: ctr.x, y1: ctr.y, x2: rot.x, y2: rot.y,
      stroke: '#7c3aed', 'stroke-width': 1.5, 'stroke-dasharray': '3 3', 'pointer-events': 'none'
    }));
    svg.appendChild(svgEl('circle', {
      cx: rot.x, cy: rot.y, r: BG_HANDLE_RADIUS_PX,
      fill: '#fff', stroke: '#7c3aed', 'stroke-width': 2,
      'data-role': 'bg-rot', style: 'cursor:grab;touch-action:none;'
    }));
    svg.appendChild(svgEl('text', {
      x: rot.x, y: rot.y + 4, 'text-anchor': 'middle', 'font-size': 14,
      fill: '#7c3aed', 'pointer-events': 'none', style: 'user-select:none;font-family:sans-serif;'
    }, '⟳'));
  }
  if (state.bgCalibrate) {
    const { p1, p2 } = state.bgCalibrate;
    const a = p1 ? calibrationMarker(svg, bg, p1, 'A') : null;
    const b = p2 ? calibrationMarker(svg, bg, p2, 'B') : null;
    if (a && b) {
      svg.appendChild(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#dc2626', 'stroke-width': 2, 'stroke-dasharray': '4 2', 'pointer-events': 'none' }));
    }
  }
}
