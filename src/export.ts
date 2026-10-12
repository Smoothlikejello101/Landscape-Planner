import { AXIS_LABEL, BG_COLOR, GRID_MAJOR, GRID_MINOR, PX_PER_FOOT_BASE } from './constants';
import { escapeHtml } from './dom';
import { errMsg } from './util';
import { boxSize, displayLabel, LINE_HEIGHT, pathLabelPoint, textLines, textSize, rotatedBoxBounds, shapeBBox, trianglePoints, unionBounds, worldPoints } from './geometry';
import { state } from './state';
import { currentProject } from './storage';
import type { Bounds, Shape } from './types';
import { render } from './ui/render';
import { paintOrder } from './canvas';
import { roleDef } from './roles';
import { shadeOpacity } from './sun';

// ============================================================
// EXPORT
// ============================================================
/** Bounds of everything exported: all shapes plus the visible background image. */
export function computeAllBBox(): Bounds | null {
  const parts = paintOrder(state.shapes).map(shapeBBox); // hidden roles aren't exported
  const bg = state.bgImage;
  if (bg && bg.visible) {
    parts.push(rotatedBoxBounds(bg.cx, bg.cy, bg.naturalWidth * bg.ftPerPx, bg.naturalHeight * bg.ftPerPx, bg.rotation || 0));
  }
  return unionBounds(parts);
}
/**
 * One shape as SVG markup. `scale` is pixels per foot; `k` scales strokes and
 * label text (labels and lines are sized for the screen, so a high-resolution
 * print needs them bigger to read at the same physical size).
 */
export function shapeToSvgString(s: Shape, originX: number, originY: number, scale: number, k = 1): string {
  const dashed = s.role ? !!roleDef(s.role).outline : false;
  const outline = dashed || s.type === 'line';
  const opacity = outline ? 0 : s.role === 'shade' && s.sun ? shadeOpacity(s.sun) : s.opacity ?? 0.65;
  const dash = dashed ? ` stroke-dasharray="${8 * k} ${4 * k}"` : s.locked ? ` stroke-dasharray="${4 * k} ${2 * k}"` : '';
  const stroke = outline ? s.color : 'rgba(0,0,0,0.3)';
  const strokeWidth = (outline ? 2.5 : 1) * k;
  const text = (x: number, y: number, fs: number, label: string, extra = '') =>
    `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${fs * k}" fill="#0f172a" font-family="sans-serif" stroke="rgba(255,255,255,0.7)" stroke-width="${2 * k}" paint-order="stroke" stroke-linejoin="round"${extra}>${escapeHtml(label)}</text>`;
  if (s.type === 'circle') {
    const cx = (s.x - originX) * scale, cy = (s.y - originY) * scale, r = s.radius * scale;
    let out = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/>`;
    if (s.label) out += text(cx, cy, Math.max(10, Math.min(14, (r / k) * 0.4)), s.label);
    return out;
  }
  if (s.type === 'poly' || s.type === 'line') {
    const wp = worldPoints(s).map((p) => ({ x: (p.x - originX) * scale, y: (p.y - originY) * scale }));
    const pts = wp.map((p) => `${p.x},${p.y}`).join(' ');
    let out = s.type === 'poly'
      ? `<polygon points="${pts}" fill="${s.color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"${dash}/>`
      : `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${2.5 * k}" stroke-linejoin="round" stroke-linecap="round"${dash}/>`;
    if (s.type === 'line' && s.showLength) {
      for (const [a, b] of [[wp[0], wp[1]], [wp.at(-1)!, wp.at(-2)!]]) {
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = (-(b.y - a.y) / len) * 7 * k, ny = ((b.x - a.x) / len) * 7 * k;
        out += `<line x1="${a.x - nx}" y1="${a.y - ny}" x2="${a.x + nx}" y2="${a.y + ny}" stroke="${s.color}" stroke-width="${2 * k}"/>`;
      }
    }
    const label = displayLabel(s);
    if (label) {
      const lp = pathLabelPoint(s);
      const { w, h } = boxSize(s);
      const fs = s.type === 'line' ? 12 : Math.max(10, Math.min(14, (Math.min(w, h) * scale * 0.2) / k));
      const ly = (lp.y - originY) * scale - (s.type === 'line' ? 10 * k : 0);
      out += text((lp.x - originX) * scale, ly, fs, label);
    }
    return out;
  }
  if (s.type === 'text') {
    const { w, h } = textSize(s);
    const px = (s.x - originX) * scale, py = (s.y - originY) * scale, fs = s.fontSize * scale;
    const rot = s.rotation ? ` transform="rotate(${s.rotation} ${px + (w * scale) / 2} ${py + (h * scale) / 2})"` : '';
    const spans = textLines(s.label).map((line, i) => `<tspan x="${px}" y="${py + (i * LINE_HEIGHT + 1) * fs}">${escapeHtml(line) || ' '}</tspan>`).join('');
    return `<text font-size="${fs}" fill="${s.color}" font-family="sans-serif" font-weight="500" stroke="rgba(255,255,255,0.85)" stroke-width="${Math.max(1.5, fs * 0.12)}" paint-order="stroke" stroke-linejoin="round"${rot}>${spans}</text>`;
  }
  const px = (s.x - originX) * scale, py = (s.y - originY) * scale;
  const w = s.width * scale, h = s.height * scale;
  const cx = px + w / 2, cy = py + h / 2;
  const rotAttr = s.rotation ? ` transform="rotate(${s.rotation} ${cx} ${cy})"` : '';
  let out = '';
  if (s.type === 'rect') {
    out = `<rect x="${px}" y="${py}" width="${w}" height="${h}" fill="${s.color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}${rotAttr}/>`;
  } else if (s.type === 'oval') {
    out = `<ellipse cx="${cx}" cy="${cy}" rx="${w/2}" ry="${h/2}" fill="${s.color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}${rotAttr}/>`;
  } else {
    const pts = trianglePoints(s).map(p => `${(p[0] - originX) * scale},${(p[1] - originY) * scale}`).join(' ');
    out = `<polygon points="${pts}" fill="${s.color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}${rotAttr}/>`;
  }
  if (s.label) out += text(cx, cy, Math.max(10, Math.min(14, (Math.min(w, h) / k) * 0.2)), s.label, rotAttr);
  return out;
}
export function buildExportSVG(): { svg: string; widthPx: number; heightPx: number } | null {
  const bbox = computeAllBBox();
  if (!bbox) return null;
  const pad = 2;
  const minX = Math.floor(bbox.minX - pad);
  const minY = Math.floor(bbox.minY - pad);
  const maxX = Math.ceil(bbox.maxX + pad);
  const maxY = Math.ceil(bbox.maxY + pad);
  const scale = PX_PER_FOOT_BASE;
  const widthFt = maxX - minX;
  const heightFt = maxY - minY;
  const widthPx = widthFt * scale;
  const heightPx = heightFt * scale;
  let grid = '';
  for (let fx = minX; fx <= maxX; fx++) {
    const px = (fx - minX) * scale;
    const isMajor = fx % 10 === 0;
    grid += `<line x1="${px}" y1="0" x2="${px}" y2="${heightPx}" stroke="${isMajor?GRID_MAJOR:GRID_MINOR}" stroke-width="${isMajor?1:0.5}"/>`;
  }
  for (let fy = minY; fy <= maxY; fy++) {
    const py = (fy - minY) * scale;
    const isMajor = fy % 10 === 0;
    grid += `<line x1="0" y1="${py}" x2="${widthPx}" y2="${py}" stroke="${isMajor?GRID_MAJOR:GRID_MINOR}" stroke-width="${isMajor?1:0.5}"/>`;
  }
  let labels = '';
  for (let fx = minX; fx <= maxX; fx++) {
    if (fx % 10 !== 0) continue;
    const px = (fx - minX) * scale;
    labels += `<text x="${px+3}" y="12" font-size="10" fill="${AXIS_LABEL}" font-family="sans-serif">${fx}ft</text>`;
  }
  for (let fy = minY; fy <= maxY; fy++) {
    if (fy % 10 !== 0) continue;
    const py = (fy - minY) * scale;
    labels += `<text x="3" y="${py+12}" font-size="10" fill="${AXIS_LABEL}" font-family="sans-serif">${fy}ft</text>`;
  }
  const sorted = paintOrder(state.shapes);
  let shapesSvg = '';
  for (const s of sorted) shapesSvg += shapeToSvgString(s, minX, minY, scale);
  // Optional bg image, sits above grid, below shapes (matches on-screen order)
  let bgSvg = '';
  const bg = state.bgImage;
  if (bg && bg.visible) {
    const wFt = bg.naturalWidth * bg.ftPerPx;
    const hFt = bg.naturalHeight * bg.ftPerPx;
    const xPx = (bg.cx - wFt / 2 - minX) * scale;
    const yPx = (bg.cy - hFt / 2 - minY) * scale;
    const cxPx = (bg.cx - minX) * scale;
    const cyPx = (bg.cy - minY) * scale;
    const rot = bg.rotation ? ` transform="rotate(${bg.rotation} ${cxPx} ${cyPx})"` : '';
    bgSvg = `<image x="${xPx}" y="${yPx}" width="${wFt*scale}" height="${hFt*scale}" opacity="${bg.opacity}" preserveAspectRatio="none" href="${bg.dataUrl}" xlink:href="${bg.dataUrl}"${rot}/>`;
  }
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
<rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="${BG_COLOR}"/>
${grid}${bgSvg}${labels}${shapesSvg}
</svg>`;
  return { svg, widthPx, heightPx };
}
export async function svgToPngDataUrl(svgString: string, widthPx: number, heightPx: number, scale: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let svgDataUrl: string;
    try {
      const utf8 = unescape(encodeURIComponent(svgString));
      svgDataUrl = 'data:image/svg+xml;base64,' + btoa(utf8);
    } catch (e) { reject(new Error('SVG encode failed: ' + errMsg(e))); return; }
    const img = new Image();
    const timeout = setTimeout(() => reject(new Error('SVG load timeout')), 10000);
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(widthPx * scale));
        canvas.height = Math.max(1, Math.round(heightPx * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas not available');
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) { reject(new Error('Canvas render failed: ' + errMsg(e))); }
    };
    img.onerror = () => { clearTimeout(timeout); reject(new Error('Image load blocked')); };
    img.src = svgDataUrl;
  });
}
export async function doExport(format: 'png' | 'svg') {
  const result = buildExportSVG();
  if (!result) return;
  const { svg, widthPx, heightPx } = result;
  const proj = currentProject();
  const safeName = (proj && proj.name ? proj.name : 'landscape').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    let dataUrl: string;
    if (format === 'svg') {
      dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } else {
      dataUrl = await svgToPngDataUrl(svg, widthPx, heightPx, 2);
    }
    state.exportPreview = { format, dataUrl, svgText: svg, filename: `${safeName}-${stamp}.${format}` };
    state.panel = 'preview';
    render();
  } catch (e) {
    alert('Export failed: ' + errMsg(e));
  }
}
export async function copySvg() {
  if (!state.exportPreview || !state.exportPreview.svgText) return;
  try {
    await navigator.clipboard.writeText(state.exportPreview.svgText);
    alert('SVG copied to clipboard');
  } catch (e) {
    alert('Copy failed — use the "show SVG text" box below to select and copy manually');
  }
}
