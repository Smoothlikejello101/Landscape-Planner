import { bedOf, isBed, isPlant } from './beds';
import { utilityLabel } from './utility-kinds';
import { hiddenIds, paintOrder, seeThroughIds } from './canvas';
import { escapeHtml } from './dom';
import { hiddenRimsSvg, shapeToSvgString, withSeeThrough } from './export';
import { rotatedBoxBounds, shapeBBox, unionBounds } from './geometry';
import type { Plant } from './plants';
import { ROLES, roleKey, roleLabel } from './roles';
import type { BgImage, Bounds, PaperSize, PrintSettings, RoleKey, Shape, ShapeFilter, SizeMode } from './types';
import { NO_FILTER } from './status';
import { fullRingRadius } from './my-plants';

// The printable plan: a to-scale drawing on a standard sheet, with a title
// block, scale bar, north arrow, legend and a plant list grouped by bed.
//
// Everything here except buildPlanPdf is pure (no DOM), so layout, scale and
// the plant list are unit-tested; buildPlanPdf rasterizes the drawing and
// writes the sheet with jsPDF (loaded only when a PDF is made).

/** Sheet sizes in inches, portrait. */
export const PAPER: Record<PaperSize, { w: number; h: number; label: string }> = {
  letter: { w: 8.5, h: 11, label: 'Letter (8.5 × 11 in)' },
  tabloid: { w: 11, h: 17, label: 'Tabloid (11 × 17 in)' },
  a4: { w: 8.27, h: 11.69, label: 'A4' },
  a3: { w: 11.69, h: 16.54, label: 'A3' },
};
const MARGIN = 0.4;
const GAP = 0.25;
/**
 * Scales a ruler can check: feet per inch. Includes the architect's
 * 1/4" = 1' (4), 1/8" = 1' (8), 1/16" = 1' (16) and the engineer's 10, 20, 30...
 */
export const NICE_SCALES = [1, 2, 4, 5, 8, 10, 16, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500];

export interface Box { x: number; y: number; w: number; h: number }
export interface PrintLayout {
  pageW: number; pageH: number;
  orientation: 'portrait' | 'landscape';
  /** Where the drawing goes on the sheet (inches). */
  plan: Box;
  /** The part of the yard it shows (feet). */
  window: Bounds;
  /** Feet per inch on paper. */
  ftPerIn: number;
  /** Title, scale, legend and plant list: a column on the right (landscape) or a band along the bottom (portrait). */
  side: Box;
  sideAt: 'right' | 'bottom';
}

function layoutFor(paper: PaperSize, orientation: 'portrait' | 'landscape', content: Bounds): PrintLayout {
  const p = PAPER[paper];
  const pageW = orientation === 'portrait' ? p.w : p.h;
  const pageH = orientation === 'portrait' ? p.h : p.w;
  let plan: Box, side: Box;
  if (orientation === 'landscape') {
    const sideW = Math.min(3.6, Math.max(2.9, pageW * 0.27));
    side = { x: pageW - MARGIN - sideW, y: MARGIN, w: sideW, h: pageH - 2 * MARGIN };
    plan = { x: MARGIN, y: MARGIN, w: pageW - 2 * MARGIN - sideW - GAP, h: pageH - 2 * MARGIN };
  } else {
    const sideH = Math.min(3.6, Math.max(2.6, pageH * 0.24));
    side = { x: MARGIN, y: pageH - MARGIN - sideH, w: pageW - 2 * MARGIN, h: sideH };
    plan = { x: MARGIN, y: MARGIN, w: pageW - 2 * MARGIN, h: pageH - 2 * MARGIN - sideH - GAP };
  }
  const cw = Math.max(1, content.maxX - content.minX), ch = Math.max(1, content.maxY - content.minY);
  const needed = Math.max(cw / plan.w, ch / plan.h);
  const ftPerIn = NICE_SCALES.find((s) => s >= needed - 1e-9) ?? Math.ceil(needed / 100) * 100;
  const cx = (content.minX + content.maxX) / 2, cy = (content.minY + content.maxY) / 2;
  const ww = plan.w * ftPerIn, wh = plan.h * ftPerIn;
  return {
    pageW, pageH, orientation, plan, ftPerIn, side, sideAt: orientation === 'landscape' ? 'right' : 'bottom',
    window: { minX: cx - ww / 2, maxX: cx + ww / 2, minY: cy - wh / 2, maxY: cy + wh / 2 },
  };
}
/** Fit `content` (feet) on the sheet at the largest standard scale. Auto picks the orientation that draws it bigger. */
export function planLayout(paper: PaperSize, orientation: PrintSettings['orientation'], content: Bounds): PrintLayout {
  if (orientation !== 'auto') return layoutFor(paper, orientation, content);
  const land = layoutFor(paper, 'landscape', content), port = layoutFor(paper, 'portrait', content);
  return port.ftPerIn < land.ftPerIn ? port : land;
}

/** A round scale-bar length (feet) about `targetIn` inches long at this scale. */
export function scaleBarFeet(ftPerIn: number, targetIn = 2): number {
  const want = ftPerIn * targetIn;
  const nice = [1, 2, 4, 5, 10, 20, 25, 40, 50, 100, 200, 250, 500, 1000, 2000];
  let best = nice[0];
  for (const n of nice) if (n <= want) best = n;
  return best;
}
export function scaleText(ftPerIn: number): string {
  const arch: Record<number, string> = { 2: '1/2 in = 1 ft', 4: '1/4 in = 1 ft', 8: '1/8 in = 1 ft', 16: '1/16 in = 1 ft' };
  return `1 in = ${ftPerIn} ft` + (arch[ftPerIn] ? ` (${arch[ftPerIn]})` : '');
}

/** What the sheet shows: visible shapes, plus the background image if wanted. */
export function printContent(shapes: Shape[], bg: BgImage | null, includeBackground: boolean, filter: ShapeFilter = NO_FILTER): { shapes: Shape[]; bounds: Bounds | null } {
  const visible = paintOrder(shapes, filter);
  const parts = visible.map(shapeBBox);
  if (includeBackground && bg && bg.visible) {
    parts.push(rotatedBoxBounds(bg.cx, bg.cy, bg.naturalWidth * bg.ftPerPx, bg.naturalHeight * bg.ftPerPx, bg.rotation || 0));
  }
  const b = unionBounds(parts);
  const pad = 2;
  return { shapes: visible, bounds: b && { minX: b.minX - pad, maxX: b.maxX + pad, minY: b.minY - pad, maxY: b.maxY + pad } };
}

// ---------- Plant list ----------
export interface ScheduleRow { label: string; botanical: string; count: number; key: number }
export interface ScheduleGroup { bed: string; rows: ScheduleRow[]; total: number }
/** Plants counted by name, grouped by the bed they sit in (beds by name, then plants in no bed). */
export function plantSchedule(shapes: Shape[], plantsById: Record<string, Plant | undefined>, order: Shape[] = shapes): ScheduleGroup[] {
  const plants = shapes.filter(isPlant);
  if (!plants.length) return [];
  // (Grouped by every bed on the plan, the ones hidden in Layers too: with Bed hidden, all 19 plants were listed as
  // "Not in a bed". Round 3, Jordan. `order` is the whole plan.)
  const all = order.length >= shapes.length ? order : shapes;
  const beds = all.filter(isBed);
  const bedName = new Map<Shape, string>();
  let unnamed = 0;
  for (const b of beds) bedName.set(b, b.label.trim() || `Unnamed bed ${++unnamed}`);
  const groups = new Map<string, Map<string, ScheduleRow>>();
  const NONE = 'Not in a bed';
  for (const p of plants) {
    const bed = bedOf(p, all);
    const g = bed ? bedName.get(bed)! : NONE;
    if (!groups.has(g)) groups.set(g, new Map());
    const label = p.label.trim() || 'Unlabeled plant';
    const rows = groups.get(g)!;
    const row = rows.get(label) ?? { label, botanical: (p.plantId && plantsById[p.plantId]?.botanical) || '', count: 0, key: 0 };
    row.count++;
    rows.set(label, row);
  }
  const names = [...groups.keys()].filter((n) => n !== NONE).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (groups.has(NONE)) names.push(NONE);
  const keys = plantKeys(plants, order);
  return names.map((bed) => {
    const rows = [...groups.get(bed)!.values()];
    for (const r of rows) r.key = keys.get(r.label)!;
    rows.sort((a, b) => a.key - b.key); // (in key order: a number is found where it's expected)
    return { bed, rows, total: rows.reduce((n, r) => n + r.count, 0) };
  });
}
/**
 * Key numbers for the plan: one per plant name, so the same plant has the same number in every bed, printed in each
 * circle instead of the full name, which doesn't fit in small circles. Numbered in the order the plan got them (the
 * plan's own order, `order`: the order shapes were added): a plant renamed, or a new one placed, leaves the others'
 * numbers as they were from one printout to the next (Grace, Oct 30: renaming her azalea renumbered the list).
 */
export function plantKeys(plants: Shape[], order: Shape[] = plants): Map<string, number> {
  const at = new Map(order.map((s, i) => [s.id, i]));
  const first = new Map<string, number>();
  for (const p of plants.filter(isPlant)) {
    const name = p.label.trim() || 'Unlabeled plant', i = at.get(p.id) ?? Infinity;
    if (!first.has(name) || i < first.get(name)!) first.set(name, i);
  }
  const names = [...first.keys()].sort((a, b) => first.get(a)! - first.get(b)! || a.localeCompare(b, undefined, { numeric: true }));
  return new Map(names.map((n, i) => [n, i + 1]));
}

// ---------- Legend ----------
/** `solid`: a line drawn unbroken in the legend (a power line), not dashed as a boundary's is. */
export interface LegendEntry { key: RoleKey; label: string; color: string; outline: boolean; solid?: boolean }
/** One entry per role on the plan, in the usual role order, colored like most of its shapes. */
export function legendEntries(shapes: Shape[], sizeMode: SizeMode = 'typical', rings = false): LegendEntry[] {
  const plantLabel = sizeMode === 'full' ? 'Plants (circles show full spread)'
    : rings ? 'Plants (circles: typical spread; dashed: full spread)' : 'Plants (circles show typical spread)';
  const out: LegendEntry[] = [];
  const keys: RoleKey[] = [...ROLES.map((r) => r.key), 'unassigned'];
  for (const k of keys) {
    const of = shapes.filter((s) => roleKey(s) === k && s.type !== 'text');
    if (!of.length) continue;
    const counts = new Map<string, number>();
    for (const s of of) counts.set(s.color.toLowerCase(), (counts.get(s.color.toLowerCase()) ?? 0) + 1);
    const color = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    if (k === 'utility') {
      // (Each kind its own line: a power line, a buried line dashed, a septic field.)
      for (const kind of [...new Set(of.map((s) => s.utility ?? ''))]) {
        const these = of.filter((s) => (s.utility ?? '') === kind);
        const line = these.every((s) => s.type === 'line');
        out.push({ key: k, label: utilityLabel(kind || undefined), color: these[0].color.toLowerCase(), outline: line, ...(line && kind !== 'buried' ? { solid: true } : {}) });
      }
      continue;
    }
    const label = k === 'plant' ? plantLabel : k === 'unassigned' ? 'Other shapes' : roleLabel(k);
    out.push({ key: k, label, color, outline: k === 'boundary' || of.every((s) => s.type === 'line' && !s.pathWidth) });
  }
  return out;
}

// ---------- The drawing ----------
/** Grid spacing (feet) so lines are at least ~0.1 in apart on paper. */
export function gridStep(ftPerIn: number): number {
  return [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => s / ftPerIn >= 0.1) ?? 1000;
}
/** SVG of the yard window at `pxPerIn` (shapes, optional grid and background). */
export function buildPlanSvg(layout: PrintLayout, shapes: Shape[], bg: BgImage | null, opts: Pick<PrintSettings, 'includeBackground' | 'includeGrid' | 'includePlantList'> & { includeFullRings?: boolean; order?: Shape[] }, pxPerIn: number): { svg: string; w: number; h: number } {
  const { window: win, ftPerIn } = layout;
  const pxPerFt = pxPerIn / ftPerIn;
  const w = Math.round(layout.plan.w * pxPerIn), h = Math.round(layout.plan.h * pxPerIn);
  const k = pxPerIn / 110; // screen labels are ~12 px at ~96-110 px/in; keep that physical size on paper
  let grid = '';
  if (opts.includeGrid) {
    const step = gridStep(ftPerIn);
    for (let fx = Math.ceil(win.minX / step) * step; fx <= win.maxX; fx += step) {
      const major = fx % (step * 10) === 0;
      const x = (fx - win.minX) * pxPerFt;
      grid += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${major ? '#cbd5e1' : '#e2e8f0'}" stroke-width="${(major ? 1.2 : 0.6) * k}"/>`;
    }
    for (let fy = Math.ceil(win.minY / step) * step; fy <= win.maxY; fy += step) {
      const major = fy % (step * 10) === 0;
      const y = (fy - win.minY) * pxPerFt;
      grid += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${major ? '#cbd5e1' : '#e2e8f0'}" stroke-width="${(major ? 1.2 : 0.6) * k}"/>`;
    }
  }
  let bgSvg = '';
  if (opts.includeBackground && bg && bg.visible && bg.dataUrl) {
    const wFt = bg.naturalWidth * bg.ftPerPx, hFt = bg.naturalHeight * bg.ftPerPx;
    const cx = (bg.cx - win.minX) * pxPerFt, cy = (bg.cy - win.minY) * pxPerFt;
    const rot = bg.rotation ? ` transform="rotate(${bg.rotation} ${cx} ${cy})"` : '';
    bgSvg = `<image x="${cx - (wFt * pxPerFt) / 2}" y="${cy - (hFt * pxPerFt) / 2}" width="${wFt * pxPerFt}" height="${hFt * pxPerFt}" opacity="${bg.opacity}" preserveAspectRatio="none" href="${escapeHtml(bg.dataUrl)}"${rot}/>`;
  }
  // Plants show their key number (see the plant list) rather than their name.
  const keys = opts.includePlantList ? plantKeys(shapes, opts.order) : null;
  const ring = (s: Shape) => {
    const r = opts.includeFullRings && s.type === 'circle' ? fullRingRadius(s) : null;
    return r ? `<circle cx="${(s.x - win.minX) * pxPerFt}" cy="${(s.y - win.minY) * pxPerFt}" r="${r * pxPerFt}" fill="none" stroke="${s.color}" stroke-width="${1.2 * k}" stroke-dasharray="${5 * k} ${4 * k}"/>` : '';
  };
  const thin = seeThroughIds(shapes, NO_FILTER);
  const body = withSeeThrough(thin, () => shapes.map((s) => ring(s) + (() => {
    if (!keys || !isPlant(s)) return shapeToSvgString(s, win.minX, win.minY, pxPerFt, k);
    const key = keys.get(s.label.trim() || 'Unlabeled plant');
    let out = shapeToSvgString({ ...s, label: '' }, win.minX, win.minY, pxPerFt, k);
    const b = shapeBBox(s);
    const cx = ((b.minX + b.maxX) / 2 - win.minX) * pxPerFt, cy = ((b.minY + b.maxY) / 2 - win.minY) * pxPerFt;
    const fs = 11 * k;
    out += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="#0f172a" font-family="sans-serif" stroke="#ffffff" stroke-width="${2.5 * k}" paint-order="stroke" stroke-linejoin="round">${key}</text>`;
    return out;
  })()).join(''));
  // Plants hidden under a solid one: a pin over it, as on the plan, and its number beside the pin (round 3, Hank: four
  // of six daffodils were white dots the list and legend didn't explain; their numbers were under the catmint).
  const hidden = hiddenIds(shapes, NO_FILTER, thin);
  const pins = hiddenRimsSvg(shapes, hidden, win.minX, win.minY, pxPerFt, k) + (keys ? shapes.filter((s) => hidden.has(s.id) && isPlant(s)).map((s) => {
    const key = keys.get(s.label.trim() || 'Unlabeled plant');
    const cx = (s.x - win.minX) * pxPerFt + 6 * k, cy = (s.y - win.minY) * pxPerFt;
    return `<text x="${cx}" y="${cy}" dominant-baseline="central" font-size="${9 * k}" font-weight="700" fill="#0f172a" font-family="sans-serif" stroke="#ffffff" stroke-width="${2.5 * k}" paint-order="stroke" stroke-linejoin="round">${key}</text>`;
  }).join('') : '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#ffffff"/>${grid}${bgSvg}${body}${pins}</svg>`;
  return { svg, w, h };
}

/** Only characters the PDF's built-in fonts can show (Latin-1), with smart punctuation made plain. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/•/g, '·')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E -ÿ\n]/g, '');
}
