import { renderGrid, renderShapes } from './canvas';
import { BG_HANDLE_RADIUS_PX, BG_JPEG_QUALITY, BG_MAX_IMAGE_DIM, BG_ROT_HANDLE_OFFSET_PX } from './constants';
import { svgEl } from './dom';
import { pxPerFoot, screenToFeet, viewCenterFeet } from './geometry';
import { flushHistoryDebounce, pushHistory, pushHistoryDebounced } from './history';
import { state } from './state';
import { save } from './storage';
import { render } from './ui/render';

// ============================================================
// BACKGROUND IMAGE (satellite / survey to trace over)
// ============================================================
//
// A bg image is stored per-project as a JPEG data URL (downscaled on upload
// to <= BG_MAX_IMAGE_DIM px on the longer edge to stay within localStorage
// budget). The image has:
//   - naturalWidth/Height: pixel dimensions of the stored image
//   - ftPerPx: world feet per image pixel (set via calibration)
//   - cx/cy:   center position in world feet
//   - rotation: degrees around the center
//   - opacity: 0..1 (tracing translucency)
//   - visible: bool
// Position is CENTER (not top-left) so that rotation-around-center is a
// straightforward transform.

export function bgImageBBoxWorld(bg) {
  // Axis-aligned bbox of the (unrotated) image in world feet.
  const w = bg.naturalWidth * bg.ftPerPx;
  const h = bg.naturalHeight * bg.ftPerPx;
  return {
    x: bg.cx - w / 2, y: bg.cy - h / 2,
    w, h
  };
}
// Convert a screen tap to image-pixel coords, undoing the image's current
// position and rotation. Used by calibration taps: we need where on the image
// the user touched, in the image's own pixel space, so subsequent
// position/rotation changes don't invalidate the calibration.
export function screenToImagePx(clientX, clientY, bg) {
  const world = screenToFeet(clientX, clientY);
  // Translate so image center is origin
  const dx = world.x - bg.cx;
  const dy = world.y - bg.cy;
  // Un-rotate (rotate by -rotation)
  const rad = -bg.rotation * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const localXft = dx * cos - dy * sin;
  const localYft = dx * sin + dy * cos;
  // Convert feet-from-center to pixel-from-top-left
  const halfWft = bg.naturalWidth * bg.ftPerPx / 2;
  const halfHft = bg.naturalHeight * bg.ftPerPx / 2;
  return {
    x: (localXft + halfWft) / bg.ftPerPx,
    y: (localYft + halfHft) / bg.ftPerPx
  };
}
// Position of the rotation handle in screen coords. Sits above the (rotated)
// image, along the rotated Y axis.
export function bgRotHandleScreen(bg) {
  const ppf = pxPerFoot();
  // In image-local space, the rotation handle is directly above the top edge
  // (local (0, -halfH - handleOffset))
  const halfHft = bg.naturalHeight * bg.ftPerPx / 2;
  const offsetFt = BG_ROT_HANDLE_OFFSET_PX / ppf;
  const localX = 0;
  const localY = -(halfHft + offsetFt);
  // Rotate by bg.rotation
  const rad = bg.rotation * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const worldX = bg.cx + localX * cos - localY * sin;
  const worldY = bg.cy + localX * sin + localY * cos;
  // World feet → screen px (relative to canvas top-left)
  return {
    x: (worldX - state.offsetX) * ppf,
    y: (worldY - state.offsetY) * ppf
  };
}
// Screen point of image center (used for the rotation-handle connector line
// and for computing the rotation delta during a rotate gesture).
export function bgCenterScreen(bg) {
  const ppf = pxPerFoot();
  return {
    x: (bg.cx - state.offsetX) * ppf,
    y: (bg.cy - state.offsetY) * ppf
  };
}

// ---------- File upload + downscale ----------
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('File read failed'));
    r.readAsDataURL(file);
  });
}
export function loadImageEl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed — try a different file'));
    img.src = dataUrl;
  });
}
export function downscaleImage(img, maxDim, quality) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), w: outW, h: outH };
}
export async function handleBgImageFile(file) {
  const name = (file.name || '').toLowerCase();
  const t = (file.type || '').toLowerCase();
  if (t === 'image/heic' || t === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif')) {
    alert("iPhone HEIC/HEIF photos aren't supported by browsers. On iPhone: Settings → Camera → Formats → Most Compatible, then re-take the photo. Or convert this image to JPEG first.");
    return false;
  }
  if (!t.startsWith('image/')) {
    alert('Please pick an image file (JPEG or PNG).');
    return false;
  }
  try {
    const origUrl = await fileToDataUrl(file);
    const img = await loadImageEl(origUrl);
    const { dataUrl, w, h } = downscaleImage(img, BG_MAX_IMAGE_DIM, BG_JPEG_QUALITY);
    // Estimate size: base64 is ~4/3 of raw bytes
    const estBytes = Math.round(dataUrl.length * 0.75);
    if (estBytes > 4_000_000) {
      // 4MB is a soft warning — localStorage limits vary
      const ok = confirm(`Image is ~${(estBytes/1024/1024).toFixed(1)}MB after compression. This might not fit in browser storage alongside your other projects. Continue?`);
      if (!ok) return false;
    }
    // Place image centered on current view, at an arbitrary initial scale —
    // the user will calibrate right after.
    const c = viewCenterFeet();
    const initialFtPerPx = 0.1; // 1 pixel = 0.1 ft ≈ 1.2 in — arbitrary, gets overridden
    flushHistoryDebounce();
    state.bgImage = {
      dataUrl, naturalWidth: w, naturalHeight: h,
      ftPerPx: initialFtPerPx,
      cx: c.x, cy: c.y,
      rotation: 0, opacity: 0.6, visible: true
    };
    pushHistory();
    save();
    return true;
  } catch (e) {
    alert('Could not load image: ' + (e.message || e));
    return false;
  }
}
export function removeBgImage() {
  if (!state.bgImage) return;
  flushHistoryDebounce();
  state.bgImage = null;
  state.bgEditMode = false;
  state.bgCalibrate = null;
  pushHistory();
  save();
}
// Patch fields on the bg image with history (used by numeric inputs, opacity slider, etc.)
export function updateBgImage(patch) {
  if (!state.bgImage) return;
  Object.assign(state.bgImage, patch);
  save();
  pushHistoryDebounced();
  render();
}
// Silent variant for range/text inputs so the panel DOM (and thus the
// on-screen keyboard) isn't torn down mid-edit.
export function updateBgImageSilent(patch) {
  if (!state.bgImage) return;
  Object.assign(state.bgImage, patch);
  save();
  pushHistoryDebounced();
  const svg = document.getElementById('canvas-svg');
  if (svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    renderGrid(svg);
    renderShapes(svg);
    renderBgHandles(svg);
  }
}

// ---------- Calibration flow ----------
export function startBgCalibration() {
  if (!state.bgImage) return;
  state.bgCalibrate = { step: 'point1', p1: null, p2: null };
  state.panel = null;
  // Force edit mode off — calibration taps must not be confused with drag
  state.bgEditMode = false;
  render();
}
export function cancelBgCalibration() {
  state.bgCalibrate = null;
  render();
}
export function bgCalibrationTap(clientX, clientY) {
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
export function finishBgCalibration(distanceFt) {
  if (!state.bgImage || !state.bgCalibrate || !state.bgCalibrate.p1 || !state.bgCalibrate.p2) return;
  const p1 = state.bgCalibrate.p1, p2 = state.bgCalibrate.p2;
  const dPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (dPx < 2) {
    alert('The two points are too close together. Try again with points further apart.');
    return;
  }
  if (!(distanceFt > 0) || !isFinite(distanceFt)) {
    alert('Please enter a positive distance in feet.');
    return;
  }
  const newFtPerPx = distanceFt / dPx;
  flushHistoryDebounce();
  state.bgImage.ftPerPx = newFtPerPx;
  pushHistory();
  save();
  state.bgCalibrate = null;
  state.panel = 'bg'; // back to bg panel
  render();
}

// ---------- Rendering ----------
// Called from renderGrid, between the base tan rect and the grid lines, so
// grid lines stay visible on top of the image (subtle scale reference).
export function renderBgImageInto(svg) {
  const bg = state.bgImage;
  if (!bg || !bg.visible) return;
  const ppf = pxPerFoot();
  const wFt = bg.naturalWidth * bg.ftPerPx;
  const hFt = bg.naturalHeight * bg.ftPerPx;
  const xPx = (bg.cx - wFt / 2 - state.offsetX) * ppf;
  const yPx = (bg.cy - hFt / 2 - state.offsetY) * ppf;
  const wPx = wFt * ppf;
  const hPx = hFt * ppf;
  const cxPx = (bg.cx - state.offsetX) * ppf;
  const cyPx = (bg.cy - state.offsetY) * ppf;
  const transform = bg.rotation ? `rotate(${bg.rotation} ${cxPx} ${cyPx})` : '';
  const imageAttrs = {
    href: bg.dataUrl,
    x: xPx, y: yPx, width: wPx, height: hPx,
    opacity: bg.opacity,
    // preserveAspectRatio "none" would let the image squash to the box; we
    // want strict aspect (which it already has since wFt/hFt come from
    // naturalWidth/Height * same ftPerPx).
    preserveAspectRatio: 'none',
    'pointer-events': state.bgEditMode ? 'auto' : 'none',
    style: state.bgEditMode ? 'cursor:move;touch-action:none;' : ''
  };
  if (transform) imageAttrs.transform = transform;
  if (state.bgEditMode) imageAttrs['data-role'] = 'bg-body';
  const img = svgEl('image', imageAttrs);
  // xlink:href for older SVG stacks (belt and suspenders)
  img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', bg.dataUrl);
  svg.appendChild(img);
}
// Called from render() after shapes, only when bg edit mode is on OR
// calibration is running. Draws the bg's bounding-box outline plus rotation
// handle (edit mode) or calibration markers (calibration mode).
export function renderBgHandles(svg) {
  const bg = state.bgImage;
  if (!bg) return;
  const ppf = pxPerFoot();
  const wFt = bg.naturalWidth * bg.ftPerPx;
  const hFt = bg.naturalHeight * bg.ftPerPx;
  const xPx = (bg.cx - wFt / 2 - state.offsetX) * ppf;
  const yPx = (bg.cy - hFt / 2 - state.offsetY) * ppf;
  const wPx = wFt * ppf;
  const hPx = hFt * ppf;
  const cxPx = (bg.cx - state.offsetX) * ppf;
  const cyPx = (bg.cy - state.offsetY) * ppf;
  const transform = bg.rotation ? `rotate(${bg.rotation} ${cxPx} ${cyPx})` : '';

  if (state.bgEditMode) {
    // Bounding box outline (rotates with image)
    const bboxAttrs = {
      x: xPx, y: yPx, width: wPx, height: hPx,
      fill: 'none', stroke: '#7c3aed', 'stroke-width': 2,
      'stroke-dasharray': '6 4', 'pointer-events': 'none'
    };
    if (transform) bboxAttrs.transform = transform;
    svg.appendChild(svgEl('rect', bboxAttrs));
    // Rotation handle
    const rot = bgRotHandleScreen(bg);
    const ctr = bgCenterScreen(bg);
    // Connector line from image top edge (via rotated frame) to handle
    // Simplest: draw a straight line from ctr to rot; approximates the "arm"
    svg.appendChild(svgEl('line', {
      x1: ctr.x, y1: ctr.y, x2: rot.x, y2: rot.y,
      stroke: '#7c3aed', 'stroke-width': 1.5, 'stroke-dasharray': '3 3',
      'pointer-events': 'none'
    }));
    const handle = svgEl('circle', {
      cx: rot.x, cy: rot.y, r: BG_HANDLE_RADIUS_PX,
      fill: '#fff', stroke: '#7c3aed', 'stroke-width': 2,
      'data-role': 'bg-rot',
      style: 'cursor:grab;touch-action:none;'
    });
    svg.appendChild(handle);
    // Small rotate glyph inside the handle
    svg.appendChild(svgEl('text', {
      x: rot.x, y: rot.y + 4,
      'text-anchor': 'middle', 'font-size': 14,
      fill: '#7c3aed', 'pointer-events': 'none',
      style: 'user-select:none;font-family:sans-serif;'
    }, '⟳'));
  }

  // Calibration markers
  if (state.bgCalibrate) {
    const { p1, p2 } = state.bgCalibrate;
    const markerAt = (px, color) => {
      // Convert image-pixel coords to screen coords
      const halfWft = bg.naturalWidth * bg.ftPerPx / 2;
      const halfHft = bg.naturalHeight * bg.ftPerPx / 2;
      const localXft = px.x * bg.ftPerPx - halfWft;
      const localYft = px.y * bg.ftPerPx - halfHft;
      const rad = bg.rotation * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const worldX = bg.cx + localXft * cos - localYft * sin;
      const worldY = bg.cy + localXft * sin + localYft * cos;
      return {
        x: (worldX - state.offsetX) * ppf,
        y: (worldY - state.offsetY) * ppf
      };
    };
    if (p1) {
      const s1 = markerAt(p1, '#dc2626');
      svg.appendChild(svgEl('circle', { cx: s1.x, cy: s1.y, r: 10, fill: 'rgba(220,38,38,0.2)', stroke: '#dc2626', 'stroke-width': 2, 'pointer-events': 'none' }));
      svg.appendChild(svgEl('circle', { cx: s1.x, cy: s1.y, r: 3, fill: '#dc2626', 'pointer-events': 'none' }));
      svg.appendChild(svgEl('text', { x: s1.x + 12, y: s1.y - 8, 'font-size': 12, fill: '#dc2626', 'font-weight': 700, 'pointer-events': 'none', style: 'user-select:none;' }, 'A'));
    }
    if (p2) {
      const s2 = markerAt(p2, '#dc2626');
      svg.appendChild(svgEl('circle', { cx: s2.x, cy: s2.y, r: 10, fill: 'rgba(220,38,38,0.2)', stroke: '#dc2626', 'stroke-width': 2, 'pointer-events': 'none' }));
      svg.appendChild(svgEl('circle', { cx: s2.x, cy: s2.y, r: 3, fill: '#dc2626', 'pointer-events': 'none' }));
      svg.appendChild(svgEl('text', { x: s2.x + 12, y: s2.y - 8, 'font-size': 12, fill: '#dc2626', 'font-weight': 700, 'pointer-events': 'none', style: 'user-select:none;' }, 'B'));
      if (p1) {
        const s1 = markerAt(p1, '#dc2626');
        svg.appendChild(svgEl('line', { x1: s1.x, y1: s1.y, x2: s2.x, y2: s2.y, stroke: '#dc2626', 'stroke-width': 2, 'stroke-dasharray': '4 2', 'pointer-events': 'none' }));
      }
    }
  }
}
