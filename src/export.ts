import { AXIS_LABEL, BG_COLOR, GRID_MAJOR, GRID_MINOR, PX_PER_FOOT_BASE } from './constants';
import { escapeHtml } from './dom';
import { errMsg } from './util';
import { featureParts, featurePartsSvg } from './features';
import { alongLabel, boxLabelAngle, boxSize, displayLabel, LINE_HEIGHT, pathLabelPoint, textLines, textSize, rotatedBoxBounds, shapeBBox, trianglePoints, unionBounds, worldPoints } from './geometry';
import { state } from './state';
import { isArbor, isTrellis, LATTICE_STEP, latticePath, SLAT_STEP, slatsPath } from './structures';
import { currentProject } from './storage';
import type { Bounds, CircleShape, Shape, ShapeFilter } from './types';
import { render } from './ui/render';
import { hiddenIds, labelRuns, paintOrder, seeThroughIds } from './canvas';
import { roleDef, roleKey, roleLabel, ROLES } from './roles';
import { filterText } from './status';
import { formatHours, shadeOpacity, sunHours } from './sun';
import { plantsById } from './plants';
import { LABEL_LINE_HEIGHT, plantLabelFit } from './labels';
import { canopyInnerRadius, canopyPoints, isTree, partsToSvg, trunkParts, trunkReachPx } from './trees';
import { groundcoverRadius, supportOf, vineBand, VINE_BAND_WIDTH, VINE_DOT_RADIUS } from './vines';
import { bandBlooms, bandLeaves, colorIn, coverBlooms, levelOf } from './looks';
import { lookFor, lookMarkup, lookMonthOf, lookShown, plannedEdge } from './plant-looks';
import { tell } from './ui/ask';
import { toast } from './ui/toast';

let lookClips = 0;

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
export function shapeToSvgString(shape: Shape, originX: number, originY: number, scale: number, k = 1): string {
  // (Names hidden, as on the screen: no names or lengths; a note's text is what it is, and stays.)
  const s: Shape = exportNames || shape.type === 'text' ? shape : ({ ...shape, label: '', ...(shape.type === 'line' ? { showLength: false } : {}) } as Shape);
  // (Its doors, windows, gates and the like, as on the plan: src/features.ts.)
  const subs = s.type !== 'circle' && s.type !== 'text' && s.features?.length
    ? s.features.map((f) => featurePartsSvg(featureParts(s, f, (p) => ({ x: (p.x - originX) * scale, y: (p.y - originY) * scale }), scale, k))).join('')
    : '';
  // (No padlock on a locked shape: a lock is how it's edited, not part of the yard, and it puzzled whoever read the
  // paper. Jason, Oct 31, from round 3: Dana, Priya, Jordan.)
  const body = shapeBodySvg(s, originX, originY, scale, k) + subs;
  if (!s.status || s.status === 'planted' || s.status === 'planned') return body;
  if (s.status === 'gone') return `<g opacity="0.35">${body}</g>`;
  // To remove: a red cross; to move: a blue arrow badge (as on screen).
  const b = shapeBBox(s);
  const x1 = (b.minX - originX) * scale, x2 = (b.maxX - originX) * scale, y1 = (b.minY - originY) * scale, y2 = (b.maxY - originY) * scale;
  if (s.status === 'remove') {
    const f = s.type === 'circle' ? 0.146 : 0, ix = (x2 - x1) * f, iy = (y2 - y1) * f;
    return body + `<path d="M${x1 + ix},${y1 + iy}L${x2 - ix},${y2 - iy}M${x2 - ix},${y1 + iy}L${x1 + ix},${y2 - iy}" stroke="#dc2626" stroke-width="${2 * k}" stroke-linecap="round" opacity="0.85"/>`;
  }
  const bx = x1 + 2 * k, by = y1 + 2 * k, u = k;
  return body + `<circle cx="${bx}" cy="${by}" r="${9 * u}" fill="#2563eb" stroke="#fff" stroke-width="${1.5 * u}"/>` +
    `<path d="M${bx - 4.5 * u},${by}h${9 * u}M${bx + 1.5 * u},${by - 3 * u}l${3 * u},${3 * u}l${-3 * u},${3 * u}M${bx - 1.5 * u},${by - 3 * u}l${-3 * u},${3 * u}l${3 * u},${3 * u}" stroke="#fff" stroke-width="${1.4 * u}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}
/**
 * A sun area's name with its hours, as the plan shows them ("Front of house · ☀ 6 h"): exported and printed, the sun
 * areas could otherwise be told apart only by how dark they're shaded (Marcus, Oct 30).
 */
function withSunHours(s: Shape, label: string): string {
  if (!exportNames || s.role !== 'shade' || !s.sun) return label;
  const hours = '\u2600 ' + formatHours(sunHours(s.sun));
  return label ? `${label} \u00b7 ${hours}` : hours;
}
/**
 * Names, lengths and sun hours drawn: the screen's "Hide names and badges" off, none (Jason, Oct 31: what's printed
 * and exported starts from what the screen shows). Set while a picture or a printout is made.
 */
let exportNames = true;
/** `fn` with names drawn or not. */
export function withNames<T>(on: boolean, fn: () => T): T {
  const was = exportNames;
  exportNames = on;
  try { return fn(); } finally { exportNames = was; }
}
/**
 * Runs of one plant too small for its name, named once at their middle ("Big blue lilyturf ×10"), as the plan does
 * (src/canvas.ts labelRuns): each plant's id, with the run's name and middle (feet) on one, null on the others.
 */
let exportRuns: Map<string, { text: string; x: number; y: number } | null> | null = null;
function runsOf(shapes: Shape[], scale: number): Map<string, { text: string; x: number; y: number } | null> {
  if (!exportNames) return new Map();
  const unfit = shapes.filter((s): s is CircleShape => s.type === 'circle' && s.role === 'plant').filter((s) => {
    const plant = s.plantId ? plantsById[s.plantId] : undefined;
    return !isTree(s) && !!displayLabel(s) && !plantLabelFit(displayLabel(s), canopyInnerRadius(s) * scale, {}, plant);
  });
  const out = new Map<string, { text: string; x: number; y: number } | null>();
  for (const run of labelRuns(unfit)) {
    const x = run.reduce((n, s) => n + s.x, 0) / run.length, y = run.reduce((n, s) => n + s.y, 0) / run.length;
    const anchor = run.reduce((best, s) => (Math.hypot(s.x - x, s.y - y) < Math.hypot(best.x - x, best.y - y) ? s : best));
    for (const s of run) out.set(s.id, s === anchor ? { text: `${displayLabel(s)} \u00d7${run.length}`, x, y } : null);
  }
  return out;
}
/**
 * Plants hidden under a solid one (src/canvas.ts hiddenIds): a pin at its middle over the plants, as on the plan, in
 * the page's units (`scale` px a foot, `k` for strokes).
 */
export function hiddenRimsSvg(shapes: Shape[], ids: Set<string>, originX: number, originY: number, scale: number, k = 1): string {
  return shapes.filter((s): s is CircleShape => s.type === 'circle' && ids.has(s.id)).map((s) => {
    const cx = (s.x - originX) * scale, cy = (s.y - originY) * scale;
    return `<circle cx="${cx}" cy="${cy}" r="${4.5 * k}" fill="#ffffff" opacity="0.9"/><circle cx="${cx}" cy="${cy}" r="${2.6 * k}" fill="#292524"/>`;
  }).join('');
}
/** Plants drawn see-through in what's being exported (as on the plan: src/canvas.ts seeThroughIds). */
let exportThin = new Set<string>();
/** `fn` with these plants drawn see-through (an export or a printout of `shapes` as they're shown). */
export function withSeeThrough<T>(ids: Set<string>, fn: () => T): T {
  const was = exportThin;
  exportThin = ids;
  try { return fn(); } finally { exportThin = was; }
}
function shapeBodySvg(s: Shape, originX: number, originY: number, scale: number, k: number): string {
  // (A buried line dashed, as on the plan.)
  const dashed = (s.role ? !!roleDef(s.role).outline : false) || (s.role === 'utility' && s.utility === 'buried');
  const outline = dashed || s.type === 'line';
  const planned = s.status === 'planned' && !outline;
  const baseOpacity = outline ? 0 : s.role === 'shade' && s.sun ? shadeOpacity(s.sun) : s.opacity ?? 0.65;
  const opacity = planned ? baseOpacity * 0.5 : baseOpacity;
  // (Locked: a padlock badge, not a dashed edge, which read as planned or selected: Lena, Oct 30. shapeToSvgString.)
  const dash = dashed ? ` stroke-dasharray="${8 * k} ${4 * k}"` : planned ? ` stroke-dasharray="${6 * k} ${4 * k}"` : '';
  // (An arbor or pergola edged in its own color, as on the plan.)
  const arbor = isArbor(s);
  const stroke = s.status === 'remove' && !outline ? '#dc2626' : outline || planned || arbor ? s.color : 'rgba(0,0,0,0.3)';
  const strokeWidth = (outline ? 2.5 : planned || arbor || s.status === 'remove' ? 2 : 1) * k;
  const text = (x: number, y: number, fs: number, label: string, extra = '') =>
    `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${fs * k}" fill="#0f172a" font-family="sans-serif" stroke="rgba(255,255,255,0.7)" stroke-width="${2 * k}" paint-order="stroke" stroke-linejoin="round"${extra}>${escapeHtml(label)}</text>`;
  const vine = s.type === 'circle' ? supportOf(s, state.shapes) : null;
  if (s.type === 'circle' && vine) {
    // A vine on what it climbs, as on the plan (src/vines.ts): its spot, and a band along its support.
    const { band, connector, cover } = vineBand(s, vine);
    const pts = (l: { x: number; y: number }[]) => l.map((p) => `${(p.x - originX) * scale},${(p.y - originY) * scale}`).join(' ');
    const cx = (s.x - originX) * scale, cy = (s.y - originY) * scale, w = Math.max(4 * k, VINE_BAND_WIDTH * scale);
    // (Drawn as a picture: its leaves' color, its blooms along it, as on the plan.)
    const look = lookShown(s) ? lookFor(s) : null;
    const inMonth = look ? lookMonthOf(s) : undefined; // (through the year: as on the plan)
    const color = s.status === 'remove' ? '#dc2626' : look ? (inMonth ? colorIn(look, inMonth) : look.pal.base) : s.color;
    const op = look ? (planned ? 0.75 : 0.9) : planned ? (s.opacity ?? 0.65) * 0.5 : s.opacity ?? 0.65;
    const name = displayLabel(s);
    const px = (l: { x: number; y: number }[]) => l.map((p) => ({ x: (p.x - originX) * scale, y: (p.y - originY) * scale }));
    // (Its leaves and blooms drawn as on the screen, at the size they'd be there: in the page's px over k, scaled up.)
    const sp = (l: { x: number; y: number }[]) => px(l).map((p) => ({ x: p.x / k, y: p.y / k }));
    const at = levelOf(w / k), up = (m: string) => (m ? `<g transform="scale(${k})">${m}</g>` : '');
    const leaves = !look || cover || s.status === 'remove' ? '' : up(bandLeaves(sp(band), w / k, look, at, s.id, inMonth));
    const blooms = !look || inMonth?.bloom === 'no' ? '' : up(cover ? coverBlooms(sp(cover), look, Math.max(10, scale / k), at, s.id) : bandBlooms(sp(band), w / k, look, Math.max(10, scale / k), at, s.id));
    // (On an arbor, over its top.)
    return (cover ? `<polygon points="${pts(cover)}" fill="${color}" fill-opacity="${op}" stroke="${color}" stroke-opacity="${op}" stroke-width="${1.5 * k}" stroke-linejoin="round"/>`
      : `<polyline points="${pts(band)}" fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="${w}" stroke-linecap="butt" stroke-linejoin="round"/>`)
      + `<polyline points="${pts(connector)}" fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="${Math.max(1.5 * k, w / 3)}" stroke-linecap="round"/>`
      + leaves + (blooms && inMonth?.bloom === 'around' ? `<g opacity="0.45">${blooms}</g>` : blooms)
      + `<circle cx="${cx}" cy="${cy}" r="${Math.max(4 * k, VINE_DOT_RADIUS * scale)}" fill="${look ? look.pal.dark : s.color}" stroke="rgba(0,0,0,0.35)" stroke-width="${k}"/>`
      + (name ? text(cx, cy - Math.max(4 * k, VINE_DOT_RADIUS * scale) - 9 * k, 11, name) : '');
  }
  if (s.type === 'circle') {
    // (A vine grown as a groundcover: its patch by its spacing, a faint ring out to its spread, as on the plan.)
    const ground = groundcoverRadius(s);
    const cx = (s.x - originX) * scale, cy = (s.y - originY) * scale, r = (ground ?? s.radius) * scale;
    // A plant drawn as an illustration, as on the plan (src/looks.ts): drawn at its size on the screen (r / k), scaled.
    const look = lookShown(s);
    const edge = look && planned ? plannedEdge(s) : stroke; // (planned: in the picture's colors, as on the plan)
    const thin = exportThin.has(s.id) ? 0.55 : 1;
    const paint = `fill="${look ? 'none' : s.color}" fill-opacity="${Math.round(opacity * thin * 100) / 100}" stroke="${edge}" stroke-width="${strokeWidth}"${dash}`;
    let out = '';
    if (look) {
      const rr = r / k, id = `export-look-${++lookClips}`;
      const clip = s.canopy ? `<polygon points="${s.canopy.map(([x, y]) => `${(x * scale) / k},${(y * scale) / k}`).join(' ')}"/>` : `<circle r="${rr}"/>`;
      const lookOpacity = (planned || isTree(s) ? 0.85 : 1) * thin;
      out += `<g transform="translate(${cx} ${cy}) scale(${k})"${lookOpacity < 1 ? ` opacity="${Math.round(lookOpacity * 100) / 100}"` : ''}><clipPath id="${id}">${clip}</clipPath><g clip-path="url(#${id})">${lookMarkup(s, rr, levelOf(rr))}</g></g>`;
    }
    out += s.canopy
      ? `<polygon points="${canopyPoints(s, (x, y) => [(x - originX) * scale, (y - originY) * scale])}" ${paint} stroke-linejoin="round"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${r}" ${paint}/>`;
    if (ground != null && ground < s.radius - 0.05) out += `<circle cx="${cx}" cy="${cy}" r="${s.radius * scale}" fill="none" stroke="${s.color}" stroke-opacity="0.45" stroke-width="${1.5 * k}" stroke-dasharray="${k} ${6 * k}" stroke-linecap="round"/>`;
    const tree = isTree(s);
    if (tree) out += partsToSvg(trunkParts(s, cx, cy, scale, false, k));
    // (A round sun area's name with its hours, as a drawn one's: its circle printed "East lawn" without them. Round 3, Tom.)
    const name = withSunHours(s, displayLabel(s));
    // (A run of one plant, named once, as on the plan: a picture wrote "Big blue lilyturf" ten times over itself.
    // Round 3, Jordan. exportRuns, set while a picture is made.)
    const run = exportRuns?.get(s.id);
    if (run !== undefined) {
      if (run) out += text((run.x - originX) * scale, (run.y - originY) * scale, Math.max(10, Math.min(14, (r / k) * 0.4)), run.text);
    } else if (name) {
      // Plants: the name fitted inside, as on screen (sizes in screen px, scaled by k for print).
      const plant = s.role === 'plant' && s.plantId ? plantsById[s.plantId] : undefined;
      const fit = plantLabelFit(name, (canopyInnerRadius(s) * scale) / k, tree ? { below: trunkReachPx(s, scale / k) + 1 } : {}, plant);
      if (fit) {
        const lh = fit.fontSize * LABEL_LINE_HEIGHT * k;
        out += fit.lines.map((line, i) => text(cx, cy + fit.dy * k + (i - (fit.lines.length - 1) / 2) * lh, fit.fontSize, line)).join('');
      } else out += text(cx, cy, Math.max(10, Math.min(14, (r / k) * 0.4)), name); // over the edge, as before
    }
    return out;
  }
  if (s.type === 'poly' || s.type === 'line') {
    const wp = worldPoints(s).map((p) => ({ x: (p.x - originX) * scale, y: (p.y - originY) * scale }));
    const pts = wp.map((p) => `${p.x},${p.y}`).join(' ');
    const band = s.type === 'line' && s.pathWidth ? s.pathWidth : 0;
    let out = s.type === 'poly'
      ? `<polygon points="${pts}" fill="${s.color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"${dash}/>`
      : band // a path: a band at its real width
        ? `<polyline points="${pts}" fill="none" stroke="${s.status === 'remove' ? '#dc2626' : s.color}" stroke-opacity="${(s.status === 'planned' ? 0.5 : 1) * (s.opacity ?? 0.65)}" stroke-width="${band * scale}" stroke-linejoin="round" stroke-linecap="butt"/>`
        : `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${2.5 * k}" stroke-linejoin="round" stroke-linecap="round"${dash}/>`;
    // A trellis: its lattice along it, as on the plan.
    if (isTrellis(s)) out += `<path d="${latticePath(wp, LATTICE_STEP * scale, 4 * k)}" fill="none" stroke="${s.status === 'remove' ? '#dc2626' : s.color}" stroke-width="${1.5 * k}" stroke-linecap="round"/>`;
    if (s.type === 'line' && s.showLength) {
      for (const [a, b] of [[wp[0], wp[1]], [wp.at(-1)!, wp.at(-2)!]]) {
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = (-(b.y - a.y) / len) * 7 * k, ny = ((b.x - a.x) / len) * 7 * k;
        out += `<line x1="${a.x - nx}" y1="${a.y - ny}" x2="${a.x + nx}" y2="${a.y + ny}" stroke="${s.color}" stroke-width="${2 * k}"/>`;
      }
    }
    const label = withSunHours(s, displayLabel(s));
    if (label && s.role === 'boundary') {
      // Along the line, as on screen.
      const al = alongLabel(s);
      const lx = (al.x - originX) * scale, ly = (al.y - originY) * scale;
      out += text(lx, ly - 9 * k, 12, label, al.angle ? ` transform="rotate(${al.angle} ${lx} ${ly})"` : '');
    } else if (label) {
      const lp = pathLabelPoint(s);
      const { w, h } = boxSize(s);
      const fs = s.type === 'line' ? 12 : Math.max(10, Math.min(14, (Math.min(w, h) * scale * 0.2) / k));
      const ly = (lp.y - originY) * scale - (s.type === 'line' && !band ? 10 * k : 0);
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
    // An arbor or pergola: its slats, as on the plan.
    if (arbor) out += `<path d="${slatsPath(px, py, w, h, SLAT_STEP * scale)}" fill="none" stroke="${s.status === 'remove' ? '#dc2626' : s.color}" stroke-width="${1.5 * k}"${rotAttr}/>`;
  } else if (s.type === 'oval') {
    out = `<ellipse cx="${cx}" cy="${cy}" rx="${w/2}" ry="${h/2}" fill="${s.color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}${rotAttr}/>`;
  } else {
    const pts = trianglePoints(s).map(p => `${(p[0] - originX) * scale},${(p[1] - originY) * scale}`).join(' ');
    out = `<polygon points="${pts}" fill="${s.color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}${rotAttr}/>`;
  }
  const boxLabel = withSunHours(s, s.label);
  if (boxLabel) {
    // Its name reads as upright as it can, as on the plan (geometry.ts, boxLabelAngle).
    const angle = boxLabelAngle(s.rotation || 0);
    out += text(cx, cy, Math.max(10, Math.min(14, (Math.min(w, h) / k) * 0.2)), boxLabel, angle ? ` transform="rotate(${angle} ${cx} ${cy})"` : '');
  }
  return out;
}
/**
 * What the picture leaves out because of Layers, in words ("Showing planned plants in Spring 2027 · Hidden: sun
 * areas"); '' when it shows everything.
 */
export function exportCaption(): string {
  return shownCaption(state.viewFilter, state.month);
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/**
 * What a picture or printout of the plan leaves out, or shows as it isn't always: only some plants, roles hidden in
 * Layers, a month (Through the year). Said on it, so it doesn't pass for the whole plan as it stands.
 */
export function shownCaption(filter: Pick<ShapeFilter, 'status' | 'phase'>, month: number | null): string {
  const shown = filterText(filter);
  const hidden = ROLES.filter((r) => state.roleViews[r.key]?.hidden && state.shapes.some((s) => roleKey(s) === r.key)).map((r) => roleLabel(r.key));
  const parts = [shown ? `Showing ${shown.charAt(0).toLowerCase()}${shown.slice(1)} only` : '', hidden.length ? `Hidden in Layers: ${hidden.join(', ')}` : '',
    month != null ? `As in ${MONTH_NAMES[month - 1]}` : ''];
  return parts.filter(Boolean).join(' \u00b7 ');
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
  const thin = seeThroughIds(state.shapes);
  // (Names as the screen has them: Jordan hid them for a client's picture, and it printed every one. Round 3.)
  withNames(state.showNames, () => {
    exportRuns = runsOf(sorted, scale);
    try { withSeeThrough(thin, () => { for (const s of sorted) shapesSvg += shapeToSvgString(s, minX, minY, scale); }); }
    finally { exportRuns = null; }
  });
  shapesSvg += hiddenRimsSvg(state.shapes, hiddenIds(state.shapes, state.viewFilter, thin), minX, minY, scale);
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
  // What Layers is leaving out, said on the picture: a picture of planned plants only shouldn't pass for the whole plan
  // (Priya, Oct 30).
  const caption = exportCaption();
  const capSvg = caption
    ? `<g data-role="export-caption"><rect x="6" y="${heightPx - 30}" width="${Math.min(widthPx - 12, caption.length * 7 + 20)}" height="24" rx="4" fill="#ffffff" fill-opacity="0.92" stroke="#a8a29e"/>`
      + `<text x="16" y="${heightPx - 14}" font-size="12" fill="#292524" font-family="sans-serif">${escapeHtml(caption)}</text></g>`
    : '';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
<rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="${BG_COLOR}"/>
${grid}${bgSvg}${labels}${shapesSvg}${capSvg}
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
  const safeName = (proj && proj.name ? proj.name : 'fullgrown').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
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
    void tell('Export failed: ' + errMsg(e));
  }
}
export async function copySvg() {
  if (!state.exportPreview || !state.exportPreview.svgText) return;
  try {
    await navigator.clipboard.writeText(state.exportPreview.svgText);
    toast('SVG copied to the clipboard');
  } catch (e) {
    void tell('Copying failed. Use the "show SVG text" box below to select it and copy it yourself.');
  }
}
