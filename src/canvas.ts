import { renderBgHandles, renderBgImageInto } from './background';
import { AXIS_LABEL, BG_COLOR, GRID_MAJOR, GRID_MINOR, PX_PER_FOOT_BASE } from './constants';
import { svgEl, type Attrs } from './dom';
import { alongLabel, boxLabelAngle, boxSize, shapeBBox, shapeCenter, displayLabel, LINE_HEIGHT, pathLabelPoint, pxPerFoot, textLines, textSize, trianglePoints, unionBounds, worldPoints } from './geometry';
import { renderPathOverlay } from './draw';
import { fullRingRadius } from './my-plants';
import { bandOf, crowdLevels, type CrowdLevel } from './crowding';
import { crowdOptions } from './crowd-here';
import { renderPlaceOverlay } from './place';
import { renderShapeHandles } from './handles';
import { onFeaturePointerDown, onShapePointerDown } from './gestures';
import { featureHitPart, featureParts, knownFeatures } from './features';
import { catalogReady, hardinessWarning, plantsById } from './plants';
import { dismissedForPlan, poisonCovered, poisonSaid } from './dismissals';
import { plantLabelFit, LABEL_LINE_HEIGHT, textWidth1, type FittedLabel } from './labels';
import { labelScale } from './label-size';
import { canopyInnerRadius, canopyPoints, isTree, trunkParts, trunkReachPx } from './trees';
import { trunkHitPx } from './canopy';
import { isLocked, roleDef, roleHidden, roleKey, roleRank } from './roles';
import { shownWith } from './status';
import { checkPlantSun, formatHours, shadeOpacity, sunHours, sunWarningShown } from './sun';
import { prepareUtilities, utilityIssues, utilityWarningShown, type PreparedUtility } from './utilities';
import { isSelected } from './selection';
import { state } from './state';
import { isArbor, isTrellis, LATTICE_STEP, latticePath, SLAT_STEP, slatsPath } from './structures';
import type { CircleShape, Point, Shape, ShapeFilter, TextShape } from './types';
import { groundcoverRadius, supportOf, vineBand, VINE_BAND_WIDTH, VINE_DOT_RADIUS } from './vines';
import { pinRadius } from './pins';
import { placeAreaNames, type AreaName } from './area-names';
import { isBed, isPlant } from './beds';
import { inBed, plantingFor } from './bed-plant';
import { drawnOutline } from './geometry';
import { BADGE_HALF, BADGE_STEP, badgeBoxes, badgeCenters, placeBadges, type BadgeHolder, type BadgeKind, type BadgeSpot, type Box as BadgeBox, type Circle } from './badges';
import { lookFor, lookMarkup, lookMonthOf, lookShown, plannedEdge } from './plant-looks';
import { bandBlooms, bandLeaves, colorIn, coverBlooms, levelOf } from './looks';
import { sameSaid } from './names';
import { renderRescaleWas, rescalePreview } from './ui/rescale-card';

// Canvas drawing. Everything here writes only into the <svg>, never into
// panel DOM, so it is safe to call while an input has keyboard focus.
//
// The canvas is a stack of layers so gestures can update just what changed:
//   base     tan background rect (the pan/marquee hit target)
//   bg       background image
//   grid     grid lines and axis labels
//   shapes   one <g> per shape (shape + label), then the marquee
//   handles  background edit outline/handle, calibration markers, the selected shape's resize and rotate handles
// During a pan or pinch the bg/shapes/handles layers are moved with a
// transform and only the grid is redrawn; the full redraw happens on release.

type Layer = 'base' | 'bg' | 'grid' | 'shapes' | 'handles';
const LAYERS: Layer[] = ['base', 'bg', 'grid', 'shapes', 'handles'];
const SCENE_LAYERS: Layer[] = ['bg', 'shapes', 'handles'];

/** The view the scene layers were last drawn with (for gesture previews). */
let drawnView = { offsetX: 0, offsetY: 0, zoom: 1 };

function canvasSvg(): SVGSVGElement | null {
  return document.getElementById('canvas-svg') as SVGSVGElement | null;
}
function layer(svg: SVGSVGElement, name: Layer): SVGGElement {
  let g = svg.querySelector<SVGGElement>(`:scope > g[data-layer="${name}"]`);
  if (!g) {
    g = svgEl('g', { 'data-layer': name });
    svg.appendChild(g);
  }
  return g;
}
function ensureLayers(svg: SVGSVGElement) {
  const ok = svg.children.length === LAYERS.length &&
    LAYERS.every((name, i) => (svg.children[i] as SVGElement).dataset.layer === name);
  if (!ok) {
    svg.replaceChildren();
    for (const name of LAYERS) layer(svg, name);
  }
}

export function renderGrid(g: SVGElement) {
  const w = state.canvasW, h = state.canvasH;
  const ppf = pxPerFoot();
  const startFx = Math.floor(state.offsetX);
  const endFx = Math.ceil(state.offsetX + w / ppf);
  const startFy = Math.floor(state.offsetY);
  const endFy = Math.ceil(state.offsetY + h / ppf);
  const { minorEvery, majorEvery } = gridSteps(ppf);
  // Lines ignore pointers so a touch landing exactly on one still pans.
  for (let fx = Math.ceil(startFx / minorEvery) * minorEvery; fx <= endFx; fx += minorEvery) {
    const px = (fx - state.offsetX) * ppf;
    const isMajor = fx % majorEvery === 0;
    g.appendChild(svgEl('line', { x1: px, y1: 0, x2: px, y2: h, stroke: isMajor ? GRID_MAJOR : GRID_MINOR, 'stroke-width': isMajor ? 1 : 0.5, 'pointer-events': 'none' }));
  }
  for (let fy = Math.ceil(startFy / minorEvery) * minorEvery; fy <= endFy; fy += minorEvery) {
    const py = (fy - state.offsetY) * ppf;
    const isMajor = fy % majorEvery === 0;
    g.appendChild(svgEl('line', { x1: 0, y1: py, x2: w, y2: py, stroke: isMajor ? GRID_MAJOR : GRID_MINOR, 'stroke-width': isMajor ? 1 : 0.5, 'pointer-events': 'none' }));
  }
  for (let fx = Math.ceil(startFx / majorEvery) * majorEvery; fx <= endFx; fx += majorEvery) {
    const px = (fx - state.offsetX) * ppf;
    g.appendChild(svgEl('text', { x: px + 2, y: 10, 'font-size': 10, fill: AXIS_LABEL, 'pointer-events': 'none' }, fx + "'"));
  }
  for (let fy = Math.ceil(startFy / majorEvery) * majorEvery; fy <= endFy; fy += majorEvery) {
    const py = (fy - state.offsetY) * ppf;
    g.appendChild(svgEl('text', { x: 2, y: py + 10, 'font-size': 10, fill: AXIS_LABEL, 'pointer-events': 'none' }, fy + "'"));
  }
}
/** Pixels a foot below which the plan is zoomed out past 25% (the farthest out before 5% was). */
export const FAR_OUT_PPF = 6;
/**
 * The zoom below which plants' names (and runs' names) aren't drawn on the plan, but a selected plant's: Jason, Nov 4:
 * "Plant labels should probably stop showing up at some point when you zoom out enough. At 5% I've got a label twice the
 * size of the house over a series of green dots." 20%, where a whole yard 100 ft across fits a phone: its plants dots of
 * a few pixels, their names 11 px tall over them. The yard's areas keep their names (FAR_OUT_PPF).
 */
export const PLANT_NAMES_MIN_ZOOM = 0.2;
/** Whether plants' names are drawn at `ppf` px a foot: names on, and not zoomed out past PLANT_NAMES_MIN_ZOOM. */
export const plantNamesShown = (ppf: number): boolean => state.showNames && ppf >= PX_PER_FOOT_BASE * PLANT_NAMES_MIN_ZOOM - 1e-9;
/**
 * The band (px) a thin line takes taps in: 18 px, but no wider than 3 ft once zoomed out past 25% (at 5%,
 * 18 px is 15 ft of yard: a pan starting near a fence would drag the fence), and never under 6 px.
 */
export const hitBand = (ppf: number) => Math.max(6, Math.min(18, 3 * ppf));
/** Badges (sun warning, to move) at their size close in, shrinking with the plan once zoomed out past 25%. */
function badgeScale(ppf: number, x: number, y: number): string | null {
  if (ppf >= FAR_OUT_PPF) return null;
  const k = Math.max(0.4, ppf / FAR_OUT_PPF);
  return `translate(${x} ${y}) scale(${k}) translate(${-x} ${-y})`;
}
/**
 * The grid's spacing (feet) at this many pixels a foot: labeled lines at least 40 px apart (every 10 ft, as
 * always, until zoomed far out: then 50, 100, 500 ft), and fainter ones between, every foot close in.
 */
export function gridSteps(ppf: number): { minorEvery: number; majorEvery: number } {
  const majors: [number, number][] = [[10, ppf < 10 ? 5 : 1], [50, 10], [100, 20], [500, 100], [1000, 200]];
  const [majorEvery, minorEvery] = majors.find(([m]) => m * ppf >= 40) ?? majors[majors.length - 1];
  return { minorEvery, majorEvery };
}

let lookClips = 0;
/** A shape the guided start points to (src/ui/intro-card.ts): its edge pulses, through every redraw, till it's cleared. */
let pulsing: string | null = null;
export function pulseShape(id: string | null) { pulsing = id; }
/** A shape and its label, wrapped in a group so it can be redrawn alone. */
export function shapeGroup(s: Shape): SVGGElement {
  const ppf = pxPerFoot();
  const sel = isSelected(s.id);
  // Taps fall through to the background tools / drawing / point editing.
  const inert = state.bgEditMode || !!state.bgCalibrate || !!state.draw || !!state.editPoints || !!state.placing || !!state.featurePlace;
  // Boundaries and open lines: a stroke, no fill.
  const outline = s.type === 'line' || (s.role ? !!roleDef(s.role).outline : false);
  // (And a buried line: under the ground, as a plan shows it.)
  const dashed = (s.role ? !!roleDef(s.role).outline : false) || (s.role === 'utility' && s.utility === 'buried');
  const common: Attrs = {
    'data-shape-id': s.id,
    fill: outline ? 'none' : s.color,
    // Shade with recorded sun: darker for less sun.
    'fill-opacity': outline ? null : s.role === 'shade' && s.sun ? shadeOpacity(s.sun) : s.opacity ?? 0.65,
    stroke: outline ? s.color : sel ? '#0f172a' : 'rgba(0,0,0,0.3)',
    'stroke-width': outline ? (sel ? 3.5 : 2.5) : sel ? 2 : 1,
    style: `cursor:${isLocked(s) ? 'grab' : 'move'};touch-action:none;`,
    'stroke-dasharray': dashed ? '8 4' : s.locked ? '4 2' : null,
    'pointer-events': inert ? 'none' : null,
  };
  // Status: planned = lighter with a dashed edge; to remove = red edge; gone (when shown) = faint ghost.
  if (s.status === 'planned' && !outline) {
    common['fill-opacity'] = Number(common['fill-opacity'] ?? 0.65) * 0.5;
    common['stroke-dasharray'] = '6 4';
    common.stroke = sel ? '#0f172a' : s.color;
    common['stroke-width'] = sel ? 2.5 : 2;
  } else if (s.status === 'remove') {
    common.stroke = '#dc2626';
    common['stroke-width'] = sel ? 3 : 2;
  } else if (s.status === 'gone') {
    common.opacity = 0.35;
    common['stroke-dasharray'] = '2 3';
  }
  // An arbor or pergola: edged in its own color, as its slats are (src/structures.ts).
  if (isArbor(s) && s.status !== 'remove') { common.stroke = sel ? '#0f172a' : s.color; common['stroke-width'] = sel ? 2.5 : 2; }
  if (s.type === 'text') return textGroup(s, sel, inert, common);
  let shapeEl: SVGElement;
  let hitEl: SVGElement | null = null;
  let ring: SVGElement | null = null;
  const g0: SVGElement[] = [];
  let labelX: number, labelY: number, fs: number, rotTransform = '';
  // (Names at the label size chosen in Settings: src/label-size.ts. Medium is 1.)
  const lk = labelScale();
  let fitted: FittedLabel | null | undefined; // circles: the name fitted inside (null = doesn't fit)
  let overflow = false; // a plant's name written over its edge
  let vineDot: number | null = null; // a climbing vine: its planting spot's radius (px)
  let under: SVGElement | null = null; // a plant drawn as an illustration (src/looks.ts): under its rim

  const vine = s.type === 'circle' ? supportOf(s, state.shapes) : null;
  if (s.type === 'circle' && vine) {
    // A vine on what it climbs (src/vines.ts): its planting spot, and a band from it along the fence, wall or tree's
    // crown, as long as its spread. The spot and the band take taps; its name sits over the spot.
    const toPx = (p: Point) => `${(p.x - state.offsetX) * ppf},${(p.y - state.offsetY) * ppf}`;
    const { band, connector, cover } = vineBand(s, vine);
    // (What it climbs hidden with its layer (Garden structure, say): the band along it goes too, its spot and name
    // stay. Round 3, Kim: bands were left along fences that weren't there.)
    const bandHidden = roleHidden(vine.shape);
    const cx = (s.x - state.offsetX) * ppf, cy = (s.y - state.offsetY) * ppf;
    vineDot = Math.max(4, VINE_DOT_RADIUS * ppf);
    const bandW = Math.max(4, VINE_BAND_WIDTH * ppf);
    // (Drawn as a picture (src/looks.ts): in its leaves' color, nearly solid, its blooms along it.)
    const look = lookShown(s) ? lookFor(s) : null;
    // (Through the year: its band in the month's color, bare twigs in winter; its blooms only in its months.)
    const inMonth = look ? lookMonthOf(s) : undefined;
    // (As tall as a canopy, as most climbing vines are: see-through over what grows at its foot, as a canopy is.)
    const thin = vineSeeThrough(s) ? 0.55 : 1;
    const op = (look ? (s.status === 'planned' ? 0.75 : 0.9) : s.status === 'planned' ? 0.5 * (s.opacity ?? 0.65) : s.opacity ?? 0.65) * thin;
    const paint = { stroke: s.status === 'remove' ? '#dc2626' : look ? (inMonth ? colorIn(look, inMonth) : look.pal.base) : s.color, 'stroke-opacity': op, fill: 'none', 'pointer-events': 'none' };
    // (On an arbor, over its top, as far as its spread reaches: taps go through it to the arbor, the vine taking
    // them at its spot.)
    shapeEl = bandHidden ? svgEl('g', { 'data-role': 'vine-band-hidden' })
      : cover
      ? svgEl('polygon', { ...paint, 'data-role': 'vine-band', points: cover.map(toPx).join(' '), fill: paint.stroke, 'fill-opacity': paint['stroke-opacity'], 'stroke-width': 1.5, 'stroke-linejoin': 'round',
        opacity: s.status === 'gone' ? 0.35 : null })
      // (Square ends: it stops where its spread does, or the support ends, not a rounded half-width past them.)
      : svgEl('polyline', { ...paint, 'data-role': 'vine-band', points: band.map(toPx).join(' '), 'stroke-width': bandW, 'stroke-linecap': 'butt', 'stroke-linejoin': 'round',
        opacity: s.status === 'gone' ? 0.35 : null }); // (planned: lighter, as its stroke-opacity says; a dashed band reads as beads)
    if (!bandHidden) g0.push(svgEl('polyline', { ...paint, 'data-role': 'vine-reach', points: connector.map(toPx).join(' '), 'stroke-width': Math.max(1.5, bandW / 3), 'stroke-linecap': 'round', opacity: s.status === 'gone' ? 0.35 : null }));
    // (Its leaves and blooms as its plant's are drawn, by the band's width on the screen: close up, leaves and flowers
    // in their shape, as every plant's (Jason, Oct 30: "only color blobs while everything else gets flowers").)
    const drawAt = levelOf(bandW);
    const px = (l: Point[]) => l.map((p) => ({ x: (p.x - state.offsetX) * ppf, y: (p.y - state.offsetY) * ppf }));
    if (look && !cover && !bandHidden && s.status !== 'remove') {
      const leaves = svgEl('g', { 'data-role': 'vine-leaves', 'pointer-events': 'none', opacity: s.status === 'gone' ? 0.35 : (s.status === 'planned' ? 0.75 : 1) * thin < 1 ? Math.round((s.status === 'planned' ? 0.75 : 1) * thin * 100) / 100 : null,
        'data-see-through': thin < 1 ? 'true' : null });
      leaves.innerHTML = bandLeaves(px(band), bandW, look, drawAt, s.id, inMonth);
      g0.push(leaves);
    }
    if (look && inMonth?.bloom !== 'no' && !bandHidden) {
      const blooms = svgEl('g', { 'data-role': 'vine-blooms', 'pointer-events': 'none', opacity: s.status === 'gone' ? 0.35 : (inMonth?.bloom === 'around' ? 0.45 : 1) * thin < 1 ? Math.round((inMonth?.bloom === 'around' ? 0.45 : 1) * thin * 100) / 100 : null });
      blooms.innerHTML = cover ? coverBlooms(px(cover), look, Math.max(10, 1 * ppf), drawAt, s.id) : bandBlooms(px(band), bandW, look, Math.max(10, 1 * ppf), drawAt, s.id);
      g0.push(blooms);
    }
    g0.push(svgEl('circle', { 'data-role': 'vine-spot', cx, cy, r: vineDot, fill: look ? look.pal.dark : s.color, stroke: sel ? '#0f172a' : 'rgba(0,0,0,0.35)', 'stroke-width': sel ? 2 : 1, 'pointer-events': 'none', opacity: s.status === 'gone' ? 0.35 : null }));
    const level = crowded.get(s.id);
    if (level) g0.push(svgEl('circle', { 'data-role': level, cx, cy, r: vineDot + 4, fill: 'none', stroke: level === 'crowded' ? '#dc2626' : '#d97706', 'stroke-width': 2, 'stroke-dasharray': level === 'close' ? '6 4' : null, 'pointer-events': 'none' }));
    hitEl = svgEl('g', { 'data-shape-id': s.id, 'data-role': 'vine-hit', style: common.style, 'pointer-events': inert ? 'none' : null },
      bandHidden ? null : svgEl('polyline', { points: (cover ? connector : band).map(toPx).join(' '), fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(hitBand(ppf), cover ? 0 : bandW), 'stroke-linecap': 'round', 'pointer-events': inert ? 'none' : 'stroke' }),
      svgEl('circle', { cx, cy, r: Math.max(vineDot, 12), fill: 'transparent', 'pointer-events': inert ? 'none' : 'all' }));
    labelX = cx; labelY = cy - vineDot - 9 * lk;
    fs = 12 * lk;
    fitted = undefined; overflow = true; // (its name over its spot, with a halo, as a name too big for its circle)
  } else if (s.type === 'circle') {
    const cx = (s.x - state.offsetX) * ppf;
    const cy = (s.y - state.offsetY) * ppf;
    // (A vine grown as a groundcover: its patch by its spacing, a faint ring out to its spread: src/vines.ts.)
    const ground = groundcoverRadius(s);
    const r = (ground ?? s.radius) * ppf;
    if (ground != null && ground < s.radius - 0.05) g0.push(svgEl('circle', { 'data-role': 'vine-reach-ring', cx, cy, r: s.radius * ppf, fill: 'none', stroke: s.color, 'stroke-opacity': 0.45, 'stroke-width': 1.5, 'stroke-dasharray': '1 6', 'stroke-linecap': 'round', 'pointer-events': 'none' }));
    // A plant drawn as an illustration (src/looks.ts): the drawing, clipped to its outline, under its rim, which keeps
    // the taps. Off the screen (by half a screen), it's drawn at its simplest: a pan shows it in full on release.
    if (lookShown(s)) {
      const margin = Math.max(state.canvasW, state.canvasH) / 2;
      const seen = cx > -r - margin && cx < state.canvasW + r + margin && cy > -r - margin && cy < state.canvasH + r + margin;
      const clipId = `look-clip-${++lookClips}`; // (a fresh id each drawing: any shape id is safe)
      const outline = s.canopy
        ? svgEl('polygon', { points: s.canopy.map(([x, y]) => `${x * ppf},${y * ppf}`).join(' ') })
        : svgEl('circle', { cx: 0, cy: 0, r });
      const art = svgEl('g', { 'clip-path': `url(#${clipId})` });
      art.innerHTML = lookMarkup(s, r, seen ? levelOf(r) : 'yard');
      // (See-through over a plant growing under it: Jason, Oct 30.)
      const thin = seeThrough.has(s.id) ? 0.55 : 1;
      const base = s.status === 'gone' ? 0.35 : s.status === 'planned' || isTree(s) ? 0.85 : 1;
      under = svgEl('g', { 'data-role': 'plant-look', transform: `translate(${cx} ${cy})`, 'pointer-events': 'none',
        opacity: base * thin < 1 ? Math.round(base * thin * 100) / 100 : null, 'data-see-through': thin < 1 ? 'true' : null }, svgEl('clipPath', { id: clipId }, outline), art);
      common.fill = 'transparent';
      if (s.status === 'planned' && !sel) common.stroke = plannedEdge(s); // (in the picture's colors, not its shape's)
      // Through the year, a winter not known (no source says whether its leaves stay): a dotted ring says so.
      if (lookMonthOf(s)?.leaves === 'unknown') g0.push(svgEl('circle', { 'data-role': 'look-unknown', cx, cy, r: Math.max(2, r - 3), fill: 'none', stroke: '#57534e', 'stroke-width': 1.5, 'stroke-dasharray': '2 4', 'stroke-linecap': 'round', 'pointer-events': 'none' }));
    }
    // (Drawn plain, see-through over what's under it, as its picture would be.)
    if (!lookShown(s) && seeThrough.has(s.id)) { common['fill-opacity'] = Number(common['fill-opacity'] ?? 0.65) * 0.55; common['data-see-through'] = 'true'; }
    // A tree pruned into a shape: its outline instead of a circle.
    shapeEl = s.canopy
      ? svgEl('polygon', { ...common, points: canopyPoints(s, (x, y) => [(x - state.offsetX) * ppf, (y - state.offsetY) * ppf]), 'stroke-linejoin': 'round' })
      : svgEl('circle', { ...common, cx, cy, r });
    // Plants drawn below full size: a dashed ring at full size when selected (or for all, from Layers).
    // While placing more of a plant, its full spread shows so the next one can be spaced by eye.
    const showFull = fullShown(s);
    const full = showFull ? fullRingRadius(s) : null;
    // Crowding: red where it's crowded; amber where it's close to another (their typical spreads touch).
    const level = crowded.get(s.id);
    if (level === 'crowded') g0.push(svgEl('circle', { 'data-role': 'crowded', cx, cy, r: r + 4, fill: 'none', stroke: '#dc2626', 'stroke-width': 2.5, 'pointer-events': 'none' }));
    else if (level === 'close') g0.push(svgEl('circle', { 'data-role': 'close', cx, cy, r: r + 4, fill: 'none', stroke: '#d97706', 'stroke-width': 2, 'stroke-dasharray': '6 4', 'pointer-events': 'none' }));
    if (full) ring = svgEl('circle', { 'data-role': 'full-ring', cx, cy, r: full * ppf, fill: 'none', stroke: s.color, 'stroke-width': 1.5, 'stroke-dasharray': '5 4', 'pointer-events': 'none' });
    if (isTree(s)) {
      const trunk = trunkParts(s, cx, cy, ppf, showFull).map((p) => svgEl(p.tag, { ...p.attrs, 'pointer-events': 'none', opacity: s.status === 'gone' ? 0.35 : null }));
      g0.unshift(...trunk);
      // Taps go through the canopy to what's under it (src/canopy.ts); the trunk picks the tree.
      shapeEl.setAttribute('pointer-events', 'none');
      hitEl = svgEl('circle', {
        'data-trunk-of': s.id, 'data-role': 'trunk-hit', cx, cy, // (not data-shape-id: that's the tree as drawn)
        r: trunkHitPx(s, ppf), fill: 'transparent',
        style: common.style, 'pointer-events': inert ? 'none' : 'all',
      });
    }
    labelX = cx; labelY = cy;
    fs = Math.max(10, Math.min(14, r * 0.4)) * lk;
    fitted = circleLabel(s, ppf);
    // A plant name that won't fit inside still shows, over the edge, where it has the room; a run of the same plant's,
    // once for them all, at their middle (labelGroups).
    const run = fitted === null ? runLabels.get(s.id) : undefined;
    if (run) { fitted = undefined; overflow = true; labelX = (run.x - state.offsetX) * ppf; labelY = (run.y - state.offsetY) * ppf; }
    else if (fitted === null && overflowLabels.has(s.id)) { fitted = undefined; overflow = true; }
  } else if (s.type === 'poly' || s.type === 'line') {
    const pts = worldPoints(s).map((p) => `${(p.x - state.offsetX) * ppf},${(p.y - state.offsetY) * ppf}`).join(' ');
    if (s.type === 'poly') {
      shapeEl = svgEl('polygon', { ...common, points: pts, 'stroke-linejoin': 'round' });
    } else if (s.pathWidth) {
      // A path: a band at its real width, with a thin center line while selected.
      shapeEl = svgEl('polyline', {
        ...common, points: pts, fill: 'none', stroke: s.status === 'remove' ? '#dc2626' : s.color, 'stroke-opacity': s.status === 'planned' ? 0.5 * (s.opacity ?? 0.65) : s.opacity ?? 0.65,
        'stroke-width': Math.max(2, s.pathWidth * ppf), 'stroke-linejoin': 'round', 'stroke-linecap': 'butt', 'stroke-dasharray': null, 'pointer-events': 'none',
      });
      if (sel) g0.push(svgEl('polyline', { 'data-role': 'path-center', points: pts, fill: 'none', stroke: '#0f172a', 'stroke-width': 1.5, 'stroke-dasharray': '6 4', 'pointer-events': 'none' }));
      hitEl = svgEl('polyline', {
        'data-shape-id': s.id, 'data-role': 'line-hit', points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(hitBand(ppf), s.pathWidth * ppf),
        'stroke-linejoin': 'round', style: common.style, 'pointer-events': inert ? 'none' : 'stroke',
      });
    } else {
      // A thin line is hard to hit with a finger: a wide invisible stroke takes the taps.
      shapeEl = svgEl('polyline', { ...common, points: pts, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'pointer-events': 'none' });
      // A trellis: its lattice marked along it (src/structures.ts).
      if (isTrellis(s)) {
        const px = worldPoints(s).map((p) => ({ x: (p.x - state.offsetX) * ppf, y: (p.y - state.offsetY) * ppf }));
        g0.push(svgEl('path', { 'data-role': 'trellis-lattice', d: latticePath(px, LATTICE_STEP * ppf), fill: 'none', stroke: s.status === 'remove' ? '#dc2626' : s.color, 'stroke-width': 1.5, 'stroke-linecap': 'round', 'pointer-events': 'none', opacity: s.status === 'gone' ? 0.35 : null }));
      }
      hitEl = svgEl('polyline', {
        'data-shape-id': s.id, 'data-role': 'line-hit', points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': hitBand(ppf),
        'stroke-linecap': 'round', style: common.style, 'pointer-events': inert ? 'none' : 'stroke',
      });
    }
    const lp = pathLabelPoint(s);
    labelX = (lp.x - state.offsetX) * ppf; labelY = (lp.y - state.offsetY) * ppf;
    const { w, h } = boxSize(s);
    fs = (s.type === 'line' ? 12 : Math.max(10, Math.min(14, Math.min(w, h) * ppf * 0.2))) * lk;
    if (s.role === 'boundary') {
      // A property line or fence is named along itself, just beside the line, not in the middle of the yard.
      const al = alongLabel(s);
      labelX = (al.x - state.offsetX) * ppf; labelY = (al.y - state.offsetY) * ppf;
      if (al.angle) rotTransform = `rotate(${al.angle} ${labelX} ${labelY})`;
      labelY -= 9 * lk;
      fs = 12 * lk;
    } else if (s.type === 'line' && !s.pathWidth) labelY -= 10 * lk; // above a thin line, not on it (a path's label sits on it)
  } else {
    const px = (s.x - state.offsetX) * ppf;
    const py = (s.y - state.offsetY) * ppf;
    const w = s.width * ppf, h = s.height * ppf;
    const cx = px + w / 2, cy = py + h / 2;
    rotTransform = s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : '';
    if (rotTransform) common.transform = rotTransform;
    if (s.type === 'rect') {
      shapeEl = svgEl('rect', { ...common, x: px, y: py, width: w, height: h });
      // An arbor or pergola: the slats across its top (src/structures.ts), turned with it.
      if (isArbor(s)) g0.push(svgEl('path', { 'data-role': 'arbor-slats', d: slatsPath(px, py, w, h, SLAT_STEP * ppf), transform: rotTransform || null, fill: 'none', stroke: s.status === 'remove' ? '#dc2626' : s.color, 'stroke-width': 1.5, 'pointer-events': 'none', opacity: s.status === 'gone' ? 0.35 : null }));
    } else if (s.type === 'oval') {
      shapeEl = svgEl('ellipse', { ...common, cx, cy, rx: w / 2, ry: h / 2 });
    } else {
      const pts = trianglePoints(s).map((p) => `${(p[0] - state.offsetX) * ppf},${(p[1] - state.offsetY) * ppf}`).join(' ');
      shapeEl = svgEl('polygon', { ...common, points: pts });
    }
    labelX = cx; labelY = cy;
    fs = Math.max(10, Math.min(14, Math.min(w, h) * 0.2)) * lk;
    // Its name reads as upright as it can, not turned with the shape (a bed drawn tall and turned on its side).
    // (The shape has its transform already: from here on, rotTransform turns its labels.)
    const angle = boxLabelAngle(s.rotation || 0);
    rotTransform = angle ? `rotate(${angle} ${cx} ${cy})` : '';
  }
  // An outline (a property line drawn as a rectangle or an outline): only its thin, dashed edge is painted, so a
  // finger missed it every time (round 2 testing, Oct 30). A wide invisible edge takes the taps, as a line's does.
  if (outline && !hitEl && shapeEl && s.type !== 'line') {
    hitEl = shapeEl.cloneNode(false) as SVGElement;
    hitEl.removeAttribute('data-shape-id'); // (not data-shape-id: that's the line as drawn, as a tree's trunk)
    for (const [k, v] of Object.entries({ 'data-outline-of': s.id, 'data-role': 'outline-hit', stroke: 'transparent', 'stroke-width': String(hitBand(ppf)), 'pointer-events': inert ? 'none' : 'stroke' })) hitEl.setAttribute(k, v);
    hitEl.removeAttribute('stroke-dasharray');
    shapeEl.setAttribute('pointer-events', 'none');
  }
  const target = hitEl ?? shapeEl;
  target.addEventListener('pointerdown', (e) => onShapePointerDown(e as PointerEvent, s));
  const g = svgEl('g', { 'data-shape-group': s.id, class: s.id === pulsing ? 'shape-pulse' : null }, ...(under ? [under] : []), shapeEl);
  if (hitEl) g.appendChild(hitEl);
  if (ring) g.appendChild(ring);
  for (const x of g0) g.appendChild(x);
  // Doors, windows, gates and the like, on its edges (src/features.ts). Each takes taps as part of its shape; on the
  // selected shape, a drag moves it along the edges.
  if (s.type !== 'circle' && s.features?.length) {
    const toPx = (p: Point) => ({ x: (p.x - state.offsetX) * ppf, y: (p.y - state.offsetY) * ppf });
    for (const f of knownFeatures(s.features)) {
      const fg = svgEl('g', { 'data-role': 'sub-feature', 'data-feature': f.kind, 'data-feature-id': f.id, 'pointer-events': 'none', opacity: s.status === 'gone' ? 0.35 : null },
        ...featureParts(s, f, toPx, ppf).map((p) => svgEl(p.tag, p.attrs)));
      // (Its touch area no wider than a line's, zoomed far out: a pan beside a door moves the plan, not the house.)
      const hit = inert ? null : featureHitPart(s, f, toPx, ppf, hitBand(ppf));
      if (hit) {
        const h = svgEl(hit.tag, { ...hit.attrs, 'data-role': 'feature-hit', 'data-feature-of': s.id, style: `cursor:${sel || isLocked(s) ? 'grab' : 'move'};touch-action:none;`, 'pointer-events': hit.tag === 'line' ? 'stroke' : 'all' });
        h.addEventListener('pointerdown', (e) => onFeaturePointerDown(e as PointerEvent, s, f.id));
        fg.appendChild(h);
      }
      g.appendChild(fg);
    }
  }
  // Dimension lines get end ticks, like a drawing's dimension.
  if (s.type === 'line' && s.showLength) {
    const pts = worldPoints(s).map((p) => ({ x: (p.x - state.offsetX) * ppf, y: (p.y - state.offsetY) * ppf }));
    for (const [a, b] of [[pts[0], pts[1]], [pts.at(-1)!, pts.at(-2)!]]) {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = (-(b.y - a.y) / len) * 7, ny = ((b.x - a.x) / len) * 7;
      g.appendChild(svgEl('line', { 'data-role': 'dim-tick', x1: a.x - nx, y1: a.y - ny, x2: a.x + nx, y2: a.y + ny, stroke: s.color, 'stroke-width': 2, 'pointer-events': 'none' }));
    }
  }
  // Names hidden (beside the zoom buttons): no names, lengths, sun hours or badges, but a selected shape's own.
  // (Zoomed out past 20%, no plant's name, but a selected one's: plantNamesShown. Its badges as ever.)
  const named = (isPlantCircle(s) ? plantNamesShown(ppf) : state.showNames) || sel;
  const badged = state.showNames || sel;
  // Zoomed out past 25%, a name (or sun hours) wider than its shape is left off, unless the shape is selected:
  // a whole yard's names would pile up over beds a few pixels across.
  const room = (text: string) => {
    if (!named) return false;
    if (ppf >= FAR_OUT_PPF || sel || isPlantCircle(s)) return true;
    const b = shapeBBox(s);
    return textWidth1(text) * fs <= Math.max(b.maxX - b.minX, b.maxY - b.minY) * ppf;
  };
  const sunText = s.role === 'shade' && s.sun && room('☀ ' + formatHours(sunHours(s.sun))) ? '☀ ' + formatHours(sunHours(s.sun)) : '';
  const run = s.type === 'circle' && overflow ? runLabels.get(s.id) : undefined;
  const label = run && named ? run.text : room(displayLabel(s)) ? displayLabel(s) : '';
  // A bed's, a path's or a sun area's name (and its hours), with what's over it: in a group of its own, moved where the
  // last full redraw put it, clear of the plants, and drawn over them (liftAreaNames). Over a plant all the same, a halo.
  const area = isAreaNamed(s) ? areaShift.get(s.id) : undefined;
  const nameG = isAreaNamed(s) ? svgEl('g', { 'data-role': 'area-name', 'data-name-of': s.id,
    transform: area && (area.dx || area.dy) ? `translate(${Math.round(area.dx * 10) / 10} ${Math.round(area.dy * 10) / 10})` : null }) : null;
  const into = nameG ?? g;
  const areaHalo = area?.over ? { stroke: 'rgba(255,255,255,0.85)', 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round' } : {};
  if (fitted && named) {
    // Wrapped and sized to fit inside the circle (or below a tree's trunk).
    const lh = fitted.fontSize * LABEL_LINE_HEIGHT;
    const text = svgEl('text', {
      'data-role': 'plant-label', x: labelX, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': fitted.fontSize, fill: '#0f172a',
      stroke: under ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)', 'stroke-width': 2.5, 'paint-order': 'stroke', 'stroke-linejoin': 'round',
      'pointer-events': 'none', style: 'user-select:none;font-weight:500;',
    });
    fitted.lines.forEach((line, i) => {
      // A trailing space keeps the words apart in the text's content (screen readers, search); it isn't drawn.
      text.appendChild(svgEl('tspan', { x: labelX, y: labelY + fitted!.dy + (i - (fitted!.lines.length - 1) / 2) * lh }, line + (i < fitted!.lines.length - 1 ? ' ' : '')));
    });
    g.appendChild(text);
  } else if (label && (fitted === undefined || !isPlantCircle(s) || (sel && state.selectedIds.length === 1))) {
    // Not fitted (other shapes), or a plant's name over its edge (room for it, or selected): one line, with a halo.
    const halo = fitted === null || overflow;
    if (halo) fs = OVERFLOW_PX * lk;
    into.appendChild(svgEl('text', {
      x: labelX, y: sunText ? labelY - fs * 0.6 : labelY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': fs, fill: '#0f172a', 'pointer-events': 'none',
      style: 'user-select:none;font-weight:500;',
      transform: rotTransform || null, ...areaHalo,
      ...(halo ? { 'data-role': 'plant-label', stroke: 'rgba(255,255,255,0.85)', 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round' } : {}),
      // (A plant's name over its edge, or a run's: drawn over every plant, never under one drawn after it (liftPlantNames).
      // A hidden plant's goes over the one hiding it instead: liftHidden.)
      ...(halo && isPlantCircle(s) && !hidden.has(s.id) ? { 'data-name-of': s.id, ...(run ? { 'data-run': String(run.text) } : {}) } : {}),
    }, label));
  }
  if (sunText) {
    into.appendChild(svgEl('text', {
      x: labelX, y: label ? labelY + fs * 0.7 : labelY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': Math.max(10 * lk, fs * 0.85), fill: '#1e293b', 'pointer-events': 'none', 'data-role': 'sun-label',
      style: 'user-select:none;', transform: rotTransform || null, ...areaHalo,
    }, sunText));
  }
  if (nameG?.firstChild) g.appendChild(nameG);
  // To remove: a red cross over the shape. To move: a blue arrow badge (hidden with the names; the cross isn't a badge).
  if (s.status === 'remove' || (s.status === 'move' && badged)) {
    const b = shapeBBox(s);
    const x1 = (b.minX - state.offsetX) * ppf, x2 = (b.maxX - state.offsetX) * ppf;
    const y1 = (b.minY - state.offsetY) * ppf, y2 = (b.maxY - state.offsetY) * ppf;
    if (s.status === 'remove') {
      const k = s.type === 'circle' ? 0.146 : 0; // keep the cross inside a circle
      const ix = (x2 - x1) * k, iy = (y2 - y1) * k;
      g.appendChild(svgEl('path', {
        'data-role': 'status-remove', d: `M${x1 + ix},${y1 + iy}L${x2 - ix},${y2 - iy}M${x2 - ix},${y1 + iy}L${x1 + ix},${y2 - iy}`,
        stroke: '#dc2626', 'stroke-width': 2, 'stroke-linecap': 'round', 'pointer-events': 'none', opacity: 0.85,
      }));
    } else {
      const bx = x1 + 2, by = y1 + 2;
      g.appendChild(svgEl('g', { 'data-role': 'status-move', 'pointer-events': 'none', transform: badgeScale(ppf, bx, by) },
        svgEl('circle', { cx: bx, cy: by, r: 9, fill: '#2563eb', stroke: '#fff', 'stroke-width': 1.5 }),
        svgEl('path', { d: `M${bx - 4.5},${by}h9M${bx + 1.5},${by - 3}l3,3l-3,3M${bx - 1.5},${by - 3}l-3,3l3,3`, stroke: '#fff', 'stroke-width': 1.4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })));
    }
  }
  // Warnings: badges on the plant itself, stacked at a corner of its circle (src/badges.ts; Jason's notes after release
  // 3: they sat by its name, and for a run of plants named once, between plants). Drawn over every plant, unless it's
  // hidden under a solid one (liftBadges).
  const badges = plantBadges(s);
  if (badges.length) {
    const h = badgeHolder(s, ppf, badges.length);
    const known = badgeSpots.get(s.id);
    // (Where the last full redraw put them, kept while it's dragged: a full redraw follows on release.)
    const spot = known && known.n === badges.length ? known.spot : placeBadges(h);
    const at = badgeCenters(h, spot);
    g.appendChild(svgEl('g', { 'data-role': 'plant-badges', 'data-badges-of': s.id, 'data-corner': CORNER_NAMES[spot.corner], 'pointer-events': 'none' },
      ...badges.map((b, i) => badgeEl(b, at[i].x, at[i].y, ppf))));
  }
  return g;
}

/** A warning badge on a plant: its kind, and for hardiness, too cold (a snowflake) or maybe too warm (a sun). */
interface Badge { kind: BadgeKind; cold?: boolean }
const CORNER_NAMES = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const;
/** A badge's scale: as drawn close in, smaller with the plan once zoomed out past 25% (badgeScale). */
const badgeK = (ppf: number) => (ppf >= FAR_OUT_PPF ? 1 : Math.max(0.4, ppf / FAR_OUT_PPF));
/** Whether a plant's dashed full-size ring is shown: selected alone, all of them from Layers, or placing more of it. */
const fullShown = (s: Shape) => (isSelected(s.id) && state.selectedIds.length === 1) || state.showFullSize || (!!state.placing && s.plantId === state.placing.plantId);
/**
 * The warning badges a plant shows now, in the order they stack, safety first (src/badges.ts): poisonous to who's in the
 * yard, too near a utility, too cold or too warm, the wrong sun. None with names and badges hidden, unless it's selected.
 */
function plantBadges(s: Shape): Badge[] {
  if (s.role !== 'plant' || !(state.showNames || isSelected(s.id))) return [];
  const data = s.plantId ? plantsById[s.plantId] : undefined;
  // (Hardiness and poison: not a tree already there, nor one gone or coming out.)
  const living = s.status !== 'gone' && s.status !== 'remove' && !(s.type === 'circle' && s.tree);
  const out: Badge[] = [];
  // Poisonous to the people or pets in the yard (src/yard.ts). (Dismissed for this copy, or for the plant across the
  // plan: src/dismissals.ts, with fewer at risk than when it was too. Its details still say so.)
  const poison = data && living ? poisonSaid(data) : '';
  if (poison && !poisonCovered(s.poisonDismissed, poison) && !dismissedForPlan('poison', s.plantId, poison)) out.push({ kind: 'poison' });
  // Too near a power line, a buried line or a septic field for what it is (src/utilities.ts).
  if (s.type === 'circle' && shownUtilities.length && utilityWarningShown(s, utilityIssues(s, shownUtilities, plantsById))) out.push({ kind: 'utility' });
  // Too cold, or maybe too warm, where the garden is (Warnings, at Hardiness; Jason, Oct 30): not one already there.
  const hardy = data && living && s.status !== 'existing' && state.hardyWarnings ? hardinessWarning(data) : null;
  if (hardy && !sameSaid(s.hardyDismissed, hardy.line) && !dismissedForPlan('hardy', s.plantId, hardy.line)) out.push({ kind: 'hardy', cold: hardy.cold });
  // Its spot doesn't match the sun it wants.
  if (s.plantId && sunWarningShown(checkPlantSun(s, data, state.shapes), s, state.sunWarnings)) out.push({ kind: 'sun' });
  return out;
}
/**
 * What a plant's badges go on, in screen px (src/badges.ts): a climbing vine's spot; a tree's trunk, its crown being
 * over other plants (where its utility badge sat on theirs: the review, Nov 1); else its circle as drawn, with its
 * full-size ring if that's shown; or the middle of a plant drawn as some other shape.
 */
function badgeHolder(s: Shape, ppf: number, n: number): BadgeHolder {
  const k = badgeK(ppf);
  if (s.type === 'circle') {
    const x = (s.x - state.offsetX) * ppf, y = (s.y - state.offsetY) * ppf;
    if (supportOf(s, state.shapes)) return { x, y, r: Math.max(4, VINE_DOT_RADIUS * ppf), n, k, vine: true };
    const r = drawnRadius(s) * ppf, full = fullShown(s) ? fullRingRadius(s) : null;
    return { x, y, r: isTree(s, plantsById) ? Math.min(r, 22) : r, full: full ? full * ppf : null, n, k };
  }
  const c = shapeCenter(s), { w, h } = boxSize(s);
  return { x: (c.x - state.offsetX) * ppf, y: (c.y - state.offsetY) * ppf, r: (Math.min(w, h) * ppf) / 2, n, k };
}
/** One badge, each kind its own shape, told apart without color (Jason, Oct 31, from round 3: Alex, colorblind). */
function badgeEl(b: Badge, bx: number, by: number, ppf: number): SVGElement {
  const t = badgeScale(ppf, bx, by);
  const mark = (dy: number, size: number, text: string) => svgEl('text', { x: bx, y: by + dy, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': size, 'font-weight': 700, fill: '#fff' }, text);
  // Sun: a warning triangle, as Warnings calls it, ⚠.
  if (b.kind === 'sun') return svgEl('g', { 'data-role': 'sun-warning', transform: t },
    svgEl('path', { d: `M${bx},${by - 9.5}L${bx + 9.5},${by + 7}L${bx - 9.5},${by + 7}Z`, fill: '#d97706', stroke: '#fff', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }), mark(2, 10, '!'));
  // Hardiness: a circle, a snowflake on blue or a sun on red.
  if (b.kind === 'hardy') return svgEl('g', { 'data-role': 'hardy-warning', transform: t },
    svgEl('circle', { cx: bx, cy: by, r: 8, fill: b.cold ? '#2563eb' : '#dc2626', stroke: '#fff', 'stroke-width': 1.5 }), mark(0.5, 10, b.cold ? '\u2744' : '\u2600'));
  // Poison: a square.
  if (b.kind === 'poison') return svgEl('g', { 'data-role': 'poison-warning', transform: t },
    svgEl('rect', { x: bx - 7.5, y: by - 7.5, width: 15, height: 15, rx: 3, fill: '#7c2d12', stroke: '#fff', 'stroke-width': 1.5 }), mark(0.5, 11, '!'));
  // Utilities: a diamond, in the power line's orange.
  return svgEl('g', { 'data-role': 'utility-warning', transform: t },
    svgEl('path', { d: `M${bx},${by - 9.5}L${bx + 9.5},${by}L${bx},${by + 9.5}L${bx - 9.5},${by}Z`, fill: '#ea580c', stroke: '#fff', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }), mark(0.5, 11, '!'));
}
/** Each plant's badges' corner, worked out at the last full redraw (refreshBadgeLayout), with how many it had then. */
let badgeSpots = new Map<string, { spot: BadgeSpot; n: number }>();
/**
 * Where each plant's badges go (src/badges.ts placeBadges), plant by plant in the order they're drawn: clear of the
 * badges placed before, of its full-size ring, and of the plants around it, where it can be. Plants well off the screen,
 * and those hidden under a solid one (their badges are under it too), are left at their first corner.
 */
function refreshBadgeLayout() {
  badgeSpots = new Map();
  const ppf = pxPerFoot(), k = badgeK(ppf);
  const order = paintOrder(state.shapes);
  // (The plants a badge would sit on: not those drawn see-through, as a canopy is, nor gone ones. By x, to search.)
  const circles = order.filter((s): s is CircleShape => drawnBySize(s) && !seeThrough.has(s.id) && s.status !== 'gone')
    .map((s) => ({ id: s.id, x: (s.x - state.offsetX) * ppf, y: (s.y - state.offsetY) * ppf, r: drawnRadius(s) * ppf }))
    .sort((a, b) => a.x - b.x);
  const maxR = circles.reduce((m, c) => Math.max(m, c.r), 0);
  const margin = Math.max(state.canvasW, state.canvasH) / 2;
  const placed: BadgeBox[] = [];
  for (const s of order) {
    if (s.role !== 'plant' || hidden.has(s.id)) continue;
    const badges = plantBadges(s);
    if (!badges.length) continue;
    const h = badgeHolder(s, ppf, badges.length);
    if (h.x < -margin || h.y < -margin || h.x > state.canvasW + margin || h.y > state.canvasH + margin) continue;
    // Its neighbors within reach: not it, nor a plant under it, nor one it's under.
    const own = s.type === 'circle' ? drawnRadius(s) * ppf : h.r;
    const reach = Math.max(own, h.full ?? 0) + (badges.length * BADGE_STEP + 3 * BADGE_HALF) * k;
    let lo = 0, hi = circles.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (circles[m].x < h.x - reach - maxR) lo = m + 1; else hi = m; }
    const near: Circle[] = [];
    for (let i = lo; i < circles.length && circles[i].x <= h.x + reach + maxR; i++) {
      const c = circles[i], d = Math.hypot(c.x - h.x, c.y - h.y);
      if (c.id !== s.id && d >= own && d >= c.r && d - c.r <= reach) near.push(c);
    }
    // (And clear of its own "to move" badge, at its top left.)
    const mine: BadgeBox[] = [];
    if (s.status === 'move') {
      const b = shapeBBox(s), mx = (b.minX - state.offsetX) * ppf + 2, my = (b.minY - state.offsetY) * ppf + 2, e = BADGE_HALF * k;
      mine.push({ x0: mx - e, y0: my - e, x1: mx + e, y1: my + e });
    }
    const spot = placeBadges(h, [...placed, ...mine], near);
    badgeSpots.set(s.id, { spot, n: badges.length });
    placed.push(...badgeBoxes(h, spot));
  }
}
/**
 * The plants' badges over every plant, so a taller neighbor drawn later never covers them: moved, not copied, from each
 * plant's group into one group over the plants. Not a plant's hidden under a solid one: its badges would sit on the plant
 * over it, and read as that one's.
 */
function liftBadges(shapes: Element) {
  let top = shapes.querySelector(':scope > g[data-role=badges-over]');
  if (!top) top = svgEl('g', { 'data-role': 'badges-over', 'pointer-events': 'none' });
  for (const b of shapes.querySelectorAll<SVGElement>(':scope > g[data-shape-group] > [data-role=plant-badges]')) {
    if (!hidden.has(b.dataset.badgesOf!)) top.appendChild(b);
  }
  shapes.appendChild(top); // (last, then the hidden plants' marks and the trunks after it)
}

/** A text note: the text itself (with a light halo so it reads over anything) and an invisible box to tap. */
function textGroup(s: TextShape, sel: boolean, inert: boolean, common: Attrs): SVGGElement {
  const ppf = pxPerFoot();
  const { w, h } = textSize(s);
  const px = (s.x - state.offsetX) * ppf, py = (s.y - state.offsetY) * ppf;
  const fs = s.fontSize * ppf;
  const rot = s.rotation ? `rotate(${s.rotation} ${px + (w * ppf) / 2} ${py + (h * ppf) / 2})` : null;
  const box = svgEl('rect', {
    'data-shape-id': s.id, x: px, y: py, width: w * ppf, height: h * ppf, fill: 'transparent',
    stroke: sel ? '#0f172a' : 'none', 'stroke-width': 1, 'stroke-dasharray': '4 3',
    style: common.style, 'pointer-events': inert ? 'none' : 'all', transform: rot,
  });
  box.addEventListener('pointerdown', (e) => onShapePointerDown(e as PointerEvent, s));
  const text = svgEl('text', {
    'data-role': 'text-note', x: px, y: py, 'font-size': fs, fill: s.color, 'font-family': 'sans-serif', 'font-weight': 500,
    stroke: 'rgba(255,255,255,0.85)', 'stroke-width': Math.max(Math.min(1.5, fs * 0.3), fs * 0.12), 'paint-order': 'stroke', 'stroke-linejoin': 'round', // (thin with tiny text, far out)
    'pointer-events': 'none', style: 'user-select:none;', transform: rot,
  });
  textLines(s.label).forEach((line, i) => {
    text.appendChild(svgEl('tspan', { x: px, y: py + (i * LINE_HEIGHT + 1) * fs }, line || ' '));
  });
  if (!s.label) text.setAttribute('fill-opacity', '0.4'); // placeholder until text is typed
  return svgEl('g', { 'data-shape-group': s.id }, text, box);
}

/** Drawing tier: by role (ground first, plants on top), then locked before unlocked. */
export function tierOf(s: Shape): number {
  return roleRank(s) * 2 + (s.locked ? 0 : 1);
}
/** Visible shapes in paint order (stable within a tier: list order). */
export function paintOrder(shapes: Shape[], filter: ShapeFilter = state.viewFilter): Shape[] {
  // (A vine on what it climbs, over it: a vine up a tree shows on its crown.)
  const k = (s: Shape) => tierOf(s) + (s.type === 'circle' && s.climbsOn ? 0.5 : 0);
  const out = shapes.filter((s) => shownWith(s, filter)).sort((a, b) => k(a) - k(b));
  // Plants, shortest first, in the places plants hold: the tallest on top, as it is in the yard; a canopy drawn
  // see-through (seeThroughIds), and what's hidden under a solid one outlined over it (hiddenIds). Jason, Oct 30 afternoon: biggest first, that morning's order, put
  // the groundcover he'd planted under his shrubs on top of them. Equal heights: the bigger first; equal both, the
  // plan's order; everything else stays where it was.
  const slots = out.flatMap((s, i) => (drawnBySize(s) ? [i] : []));
  const sized = slots.map((i) => out[i] as CircleShape).map((s) => ({ s, h: drawnHeight(s), r: drawnRadius(s) }))
    .sort((a, b) => a.h - b.h || b.r - a.r).map((x) => x.s);
  slots.forEach((i, j) => { out[i] = sized[j]; });
  return out;
}
/**
 * A plant's height for the drawing order: its typical height (a tree's as set on the plan; src/crowding.ts bandOf);
 * with none known, its spread, a stand-in (a tree is about as tall as it's wide; a plant of my own without one).
 */
export function drawnHeight(s: CircleShape): number {
  return bandOf(s, plantsById).band?.[1] ?? drawnRadius(s) * 2;
}
/**
 * From this height (feet), a plant is drawn see-through, a canopy over what's planted under it, always: every copy alike
 * (Jason, Oct 30, choosing "a canopy rule, by plant", at 5 ft, from 6: until then a plant was see-through where a shorter
 * one's middle was within it, so of three mountain mints one was pale and two solid). Shorter plants are drawn solid,
 * and one whose middle a solid plant covers has its outline and name drawn over it (hiddenIds).
 */
export const CANOPY_FT = 5;
/** The plants drawn see-through: those CANOPY_FT or taller (by drawnHeight), and not gone. */
export function seeThroughIds(shapes: Shape[], filter: ShapeFilter = state.viewFilter): Set<string> {
  return new Set(shapes.filter((s) => shownWith(s, filter) && drawnBySize(s) && s.status !== 'gone' && drawnHeight(s) >= CANOPY_FT).map((s) => s.id));
}
/** Whether a climbing vine's band is drawn see-through: as tall as a canopy (src/vines.ts; most vines are). */
export const vineSeeThrough = (s: CircleShape): boolean => s.status !== 'gone' && (bandOf(s, plantsById).band?.[1] ?? 0) >= CANOPY_FT;
/**
 * The plants hidden under a solid one, each with the plants hiding it: drawn before a plant shorter than a canopy, of
 * another kind, whose circle holds their middle (a groundcover under a perennial). Marked over the plants (liftHidden),
 * so nothing planted is lost from sight. Not under more of its own kind: a mass planting hides nothing worth marking
 * (Jason, Oct 30, the anise hyssop bed). Gone plants count for nothing.
 */
export function hiddenCovers(shapes: Shape[], filter: ShapeFilter = state.viewFilter, thin: Set<string> = seeThroughIds(shapes, filter)): Map<string, string[]> {
  const order = paintOrder(shapes, filter).filter(drawnBySize).filter((s) => s.status !== 'gone');
  const rank = new Map(order.map((s, i) => [s.id, i]));
  const byX = [...order].sort((a, b) => a.x - b.x);
  const kind = (s: Shape) => s.plantId || s.label.trim();
  const out = new Map<string, string[]>();
  for (const u of order) {
    if (thin.has(u.id)) continue;
    const r = drawnRadius(u), at = rank.get(u.id)!;
    // (The plants within its reach sideways, by a binary search on x: big plans stay quick.)
    let lo = 0, hi = byX.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (byX[m].x < u.x - r) lo = m + 1; else hi = m; }
    for (let k = lo; k < byX.length && byX[k].x <= u.x + r; k++) {
      const l = byX[k];
      if (rank.get(l.id)! < at && Math.hypot(l.x - u.x, l.y - u.y) < r && !(kind(l) && kind(l) === kind(u))) out.set(l.id, [...(out.get(l.id) ?? []), u.id]);
    }
  }
  return out;
}
/** The plants hidden under a solid one (hiddenCovers). */
export const hiddenIds = (shapes: Shape[], filter: ShapeFilter = state.viewFilter, thin?: Set<string>): Set<string> =>
  new Set(hiddenCovers(shapes, filter, thin ?? seeThroughIds(shapes, filter)).keys());
/** A plant (or a circle among them), drawn by its size rather than the plan's order; Arrange leaves it be. */
export function drawnBySize(s: Shape): s is CircleShape {
  return s.type === 'circle' && !s.climbsOn && ['plant', 'other', 'unassigned'].includes(roleKey(s));
}
/** Its size as drawn: a groundcover vine's patch, else its circle. */
const drawnRadius = (s: Shape) => (s.type === 'circle' ? groundcoverRadius(s) ?? s.radius : 0);

function marqueeRect(): SVGRectElement | null {
  const m = state.marquee;
  if (!m) return null;
  const ppf = pxPerFoot();
  return svgEl('rect', {
    'data-role': 'marquee',
    x: (Math.min(m.x1, m.x2) - state.offsetX) * ppf,
    y: (Math.min(m.y1, m.y2) - state.offsetY) * ppf,
    width: Math.abs(m.x2 - m.x1) * ppf, height: Math.abs(m.y2 - m.y1) * ppf,
    fill: 'rgba(5,150,105,0.1)', stroke: '#059669', 'stroke-width': 1.5,
    'stroke-dasharray': '5 3', 'pointer-events': 'none'
  });
}

const isPlantCircle = (s: Shape): s is CircleShape => s.type === 'circle' && s.role === 'plant';
/** One-line names drawn over a plant's edge: the size used, for placing them. */
const OVERFLOW_PX = 11;
/**
 * Plants whose name doesn't fit inside their circle but can be written over
 * its edge without landing on another plant's name. Names that fit inside
 * claim their room first; then the rest, biggest plants first, each where it
 * doesn't collide with one already placed. A row of small plants named alike
 * gets every other name, rather than a pile of overlapping text.
 */
let overflowLabels = new Set<string>();
/** Plants hidden under a solid one whose name isn't clear of the names in sight: their outline alone (liftHidden). */
let hiddenUnnamed = new Set<string>();
/** Hidden plants' names moved down or up (px) to be clear of the names in sight (liftHidden). */
let hiddenShift = new Map<string, number>();
/** A run of one plant written once ("Creeping liriope ×12"), on the plant nearest its middle: its words and middle (feet). */
let runLabels = new Map<string, { text: string; x: number; y: number }>();
/** Plants in a run of their kind need this many to be named once (two side by side get one name already). */
const RUN_MIN = 3;
/** Plants of a kind this close (centers within this share of their two radii) count as one run. */
const RUN_GAP = 1.25;
/**
 * Plants whose names are written beside them (too small for their name), grouped into runs of the same plant: named
 * alike, each within a little more than touching distance of the next (Jason, Oct 30: twelve liriope 1.5 ft apart
 * made a column of ten "Creeping liriope"). Runs of RUN_MIN or more; the rest alone.
 */
export function labelRuns(plants: CircleShape[]): CircleShape[][] {
  const byName = new Map<string, CircleShape[]>();
  for (const s of plants) { const n = displayLabel(s); (byName.get(n) ?? byName.set(n, []).get(n)!).push(s); }
  const out: CircleShape[][] = [];
  for (const list of byName.values()) {
    if (list.length < RUN_MIN) continue;
    const parent = list.map((_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    const order = list.map((s, i) => ({ s, i })).sort((a, b) => a.s.x - b.s.x);
    const reach = Math.max(...list.map((s) => s.radius)) * 2 * RUN_GAP;
    for (let a = 0; a < order.length; a++) {
      for (let b = a + 1; b < order.length && order[b].s.x - order[a].s.x <= reach; b++) {
        const p = order[a].s, q = order[b].s;
        if (Math.hypot(p.x - q.x, p.y - q.y) <= (p.radius + q.radius) * RUN_GAP) parent[root(order[a].i)] = root(order[b].i);
      }
    }
    const groups = new Map<number, CircleShape[]>();
    list.forEach((s, i) => { const r = root(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(s); });
    for (const g of groups.values()) if (g.length >= RUN_MIN) out.push(g);
  }
  return out;
}
/** A name's room on the screen (px). */
export interface LabelBox { x0: number; x1: number; y0: number; y1: number }
const overlaps = (a: LabelBox, b: LabelBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const boxAt = (p: Point, w: number, h: number, ppf: number): LabelBox => ({ x0: p.x * ppf - w / 2, x1: p.x * ppf + w / 2, y0: p.y * ppf - h / 2, y1: p.y * ppf + h / 2 });
/**
 * Where a run's name goes (feet), a name `w` × `h` px at `ppf`: the first spot clear of the names already placed, and of
 * `plants` (other plants' circles, feet: those drawn over the run, Jason, Nov 4). Its middle; then on each of its plants,
 * the nearest the middle first; then beside the plant at its middle, across the run first (a column's name to its left or
 * right, a row's above or below). Null: nowhere clear. (Jason, Oct 30: a
 * 1.5 ft bed's name, at the middle of the column of liriope planted along it, left all twelve unnamed.)
 */
export function runLabelSpot(run: CircleShape[], w: number, h: number, ppf: number, placed: LabelBox[], plants: { x: number; y: number; r: number }[] = []): Point | null {
  const mid = { x: run.reduce((n, s) => n + s.x, 0) / run.length, y: run.reduce((n, s) => n + s.y, 0) / run.length };
  const near = [...run].sort((a, b) => Math.hypot(a.x - mid.x, a.y - mid.y) - Math.hypot(b.x - mid.x, b.y - mid.y));
  const c = near[0];
  const xs = run.map((s) => s.x), ys = run.map((s) => s.y);
  const column = Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs);
  const dx = c.radius + (w / 2 + 4) / ppf, dy = c.radius + (h / 2 + 2) / ppf;
  const sides = [{ x: c.x - dx, y: c.y }, { x: c.x + dx, y: c.y }], ends = [{ x: c.x, y: c.y - dy }, { x: c.x, y: c.y + dy }];
  const spots = [mid, ...near.map((s) => ({ x: s.x, y: s.y })), ...(column ? [...sides, ...ends] : [...ends, ...sides])];
  // (Clear of other plants too, not over one or under it: Jason, Nov 4. A rim grazed is fine.)
  const onPlant = (b: LabelBox) => plants.some((c) => {
    const cx = c.x * ppf, cy = c.y * ppf, r = c.r * ppf * RUN_CLEAR;
    const nx = Math.max(b.x0, Math.min(b.x1, cx)), ny = Math.max(b.y0, Math.min(b.y1, cy));
    return Math.hypot(nx - cx, ny - cy) < r;
  });
  return spots.find((p) => { const b = boxAt(p, w, h, ppf); return !placed.some((q) => overlaps(q, b)) && !onPlant(b); }) ?? null;
}
/** How much of another plant's circle a run's name keeps off: all but its outer tenth. */
const RUN_CLEAR = 0.9;
/**
 * A shape whose name is one of the yard's areas' (a bed, a lawn, a path, a building, a sun area: any but a circle, a text
 * note, or a boundary named along its line), placed clear of the plants as a printout places it (src/area-names.ts).
 */
const isAreaNamed = (s: Shape): boolean => s.type !== 'circle' && s.type !== 'text' && !(s.role === 'boundary' && (s.type === 'poly' || s.type === 'line'));
/**
 * An area's name and sun hours as shapeGroup draws them, on the screen (px): the middle of the two lines, their size, its
 * turn; null when neither shows (names hidden; or, zoomed far out, wider than the shape).
 */
function areaNameAt(s: Shape, ppf: number, lk: number) {
  const sel = isSelected(s.id);
  if (!state.showNames && !sel) return null;
  let x: number, y: number, fs: number, angle = 0;
  if (s.type === 'poly' || s.type === 'line') {
    const lp = pathLabelPoint(s), { w, h } = boxSize(s);
    x = (lp.x - state.offsetX) * ppf; y = (lp.y - state.offsetY) * ppf;
    fs = (s.type === 'line' ? 12 : Math.max(10, Math.min(14, Math.min(w, h) * ppf * 0.2))) * lk;
    if (s.type === 'line' && !s.pathWidth) y -= 10 * lk; // (above a thin line)
  } else if (s.type === 'rect' || s.type === 'oval' || s.type === 'triangle') {
    const w = s.width * ppf, h = s.height * ppf;
    x = (s.x - state.offsetX) * ppf + w / 2; y = (s.y - state.offsetY) * ppf + h / 2;
    fs = Math.max(10, Math.min(14, Math.min(w, h) * 0.2)) * lk;
    angle = boxLabelAngle(s.rotation || 0);
  } else return null;
  const b = shapeBBox(s);
  const room = (text: string) => ppf >= FAR_OUT_PPF || sel || textWidth1(text) * fs <= Math.max(b.maxX - b.minX, b.maxY - b.minY) * ppf;
  const hours = s.role === 'shade' && s.sun ? '\u2600 ' + formatHours(sunHours(s.sun)) : '';
  const sun = hours && room(hours) ? hours : '', label = displayLabel(s) && room(displayLabel(s)) ? displayLabel(s) : '';
  if (!label && !sun) return null;
  const sfs = Math.max(10 * lk, fs * 0.85);
  const top = label ? y - fs * (sun ? 1.2 : 0.6) : y - sfs * 0.6, bottom = sun ? (label ? y + fs * 0.7 : y) + sfs * 0.6 : y + fs * 0.6;
  return { x, y: (top + bottom) / 2, w: Math.max(label ? textWidth1(label) * fs : 0, sun ? textWidth1(sun) * sfs : 0), h: bottom - top, fs, angle, label, sun };
}
/** Each area's name moved (px) from where its shape puts it, and whether it's over a plant there (refreshLabelLayout). */
let areaShift = new Map<string, { dx: number; dy: number; over: boolean }>();
/**
 * The areas' names over every plant (a bed's under its plants was hidden: the general bug hunt, Nov 1), moved, not
 * copied, from each shape's group into one group after them all.
 */
/**
 * Plants' names written over their edges, and runs' names ("Echinacea 'White Angel' ×5"), over every plant: in their
 * plant's group, a taller plant drawn after it covered them (Jason, Nov 4, with a screenshot: a run's name under the
 * plants beside it). Moved, not copied, into one group after the plants, under the areas' names.
 */
function liftPlantNames(shapes: Element) {
  let top = shapes.querySelector(':scope > g[data-role=plant-names]');
  if (!top) top = svgEl('g', { 'data-role': 'plant-names', 'pointer-events': 'none' });
  for (const n of shapes.querySelectorAll(':scope > g[data-shape-group] > text[data-name-of]')) top.appendChild(n);
  shapes.appendChild(top);
}
function liftAreaNames(shapes: Element) {
  let top = shapes.querySelector(':scope > g[data-role=area-names]');
  if (!top) top = svgEl('g', { 'data-role': 'area-names', 'pointer-events': 'none' });
  for (const n of shapes.querySelectorAll(':scope > g[data-shape-group] > [data-role=area-name]')) top.appendChild(n);
  shapes.appendChild(top);
}
function refreshLabelLayout() {
  const ppf = pxPerFoot(), lk = labelScale();
  overflowLabels = new Set();
  runLabels = new Map();
  type Box = LabelBox;
  const placed: Box[] = [];
  hiddenUnnamed = new Set();
  hiddenShift = new Map();
  const hiddenFits: { s: CircleShape; box: Box }[] = [];
  const waiting: { s: CircleShape; box: Box }[] = [];
  const areas: { s: Shape; at: NonNullable<ReturnType<typeof areaNameAt>> }[] = [];
  const shown = paintOrder(state.shapes);
  const plantNames = plantNamesShown(ppf);
  for (const s of shown) {
    // Names hidden: a name that isn't drawn keeps no room (a selected plant's shows beside it). Plants' too, zoomed out
    // past 20% (plantNamesShown).
    if (!(isPlantCircle(s) ? plantNames : state.showNames) && !state.selectedIds.includes(s.id)) continue;
    if (!isPlantCircle(s)) {
      // A bed's, a path's or a sun area's name: placed clear of the plants, below, before the plants' names.
      if (isAreaNamed(s)) {
        const at = areaNameAt(s, ppf, lk);
        if (at) areas.push({ s, at });
        continue;
      }
      // Other shapes' names (a round one's) are there first: plant names stay off them.
      const label = s.type === 'text' ? '' : displayLabel(s);
      if (!label) continue;
      const w = textWidth1(label) * 12 * lk, h = 14 * lk;
      if (s.role === 'boundary' && (s.type === 'poly' || s.type === 'line')) {
        // Along the line: 9 px off it, turned with it (the box that holds the turned label).
        const al = alongLabel(s), rad = (al.angle * Math.PI) / 180;
        const cx = al.x * ppf + 9 * lk * Math.sin(rad), cy = al.y * ppf - 9 * lk * Math.cos(rad);
        const bw = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)), bh = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
        placed.push({ x0: cx - bw / 2, x1: cx + bw / 2, y0: cy - bh / 2, y1: cy + bh / 2 });
        continue;
      }
      const at = s.type === 'poly' || s.type === 'line' ? pathLabelPoint(s) : shapeCenter(s);
      placed.push({ x0: at.x * ppf - w / 2, x1: at.x * ppf + w / 2, y0: at.y * ppf - h / 2, y1: at.y * ppf + h / 2 });
      continue;
    }
    const fit = circleLabel(s, ppf);
    const cx = s.x * ppf, cy = s.y * ppf;
    if (fit) {
      const w = Math.max(...fit.lines.map((l) => textWidth1(l))) * fit.fontSize;
      const h = fit.lines.length * fit.fontSize * LABEL_LINE_HEIGHT;
      const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy + fit.dy - h / 2, y1: cy + fit.dy + h / 2 };
      // (A plant hidden under a solid one: its name drawn over that plant, after the names in sight, where it's clear.)
      if (hidden.has(s.id)) hiddenFits.push({ s, box }); else placed.push(box);
    } else if (fit === null) {
      const w = textWidth1(displayLabel(s)) * OVERFLOW_PX * lk, h = OVERFLOW_PX * lk * LABEL_LINE_HEIGHT;
      waiting.push({ s, box: { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 } });
    }
  }
  // The areas' names: where their shapes put them, or, with a plant there, the first spot clear of the plants and of
  // each other just above the shape, below it, to its right or to its left, as a printout places them (src/area-names.ts;
  // the general bug hunt, Nov 1: plants hid "Bed" and all but an "n" of "Morning sun"). Kept, where none is clear: the
  // screen can be zoomed in. On the screen, in px; the plant names' room is in px from the plan's origin.
  areaShift = new Map();
  if (areas.length) {
    const ox = state.offsetX * ppf, oy = state.offsetY * ppf;
    const plants = shown.filter((s): s is CircleShape => s.type === 'circle' && isPlant(s))
      .map((s) => ({ x: s.x * ppf - ox, y: s.y * ppf - oy, r: drawnRadius(s) * ppf }));
    const names: AreaName[] = areas.map(({ s, at }) => {
      const b = shapeBBox(s);
      return { label: at.label || at.sun, x: at.x, y: at.y, w: at.w, h: at.h, fs: at.fs, angle: at.angle, bed: isBed(s), size: (b.maxX - b.minX) * (b.maxY - b.minY),
        fixed: !!at.angle || s.type === 'line', gone: s.status === 'gone', around: { x0: b.minX * ppf - ox, y0: b.minY * ppf - oy, x1: b.maxX * ppf - ox, y1: b.maxY * ppf - oy } };
    });
    // (A name moved stays within the plan, 2 ft round it as a picture has, not the screen: where it goes doesn't change
    // as the plan is panned.)
    const all = unionBounds(shown.map(shapeBBox))!;
    const within = { x0: (all.minX - 2) * ppf - ox, y0: (all.minY - 2) * ppf - oy, x1: (all.maxX + 2) * ppf - ox, y1: (all.maxY + 2) * ppf - oy };
    placeAreaNames(names, plants, within, 1, true).forEach((p, i) => {
      if (!p) return;
      areaShift.set(areas[i].s.id, { dx: p.x - names[i].x, dy: p.y - names[i].y, over: p.overPlant });
      placed.push({ x0: p.box.x0 + ox, x1: p.box.x1 + ox, y0: p.box.y0 + oy, y1: p.box.y1 + oy });
    });
  }
  // Hidden plants' names, drawn over the plant hiding them (liftHidden), where they're clear of the names in sight: at
  // their middle, or just below their outline, or above it; in a crowd, the outline alone.
  const tryHidden = (s: CircleShape, box: Box): boolean => {
    const rpx = drawnRadius(s) * ppf, cy = s.y * ppf, h = box.y1 - box.y0, mid = (box.y0 + box.y1) / 2;
    for (const dy of [0, cy + rpx + h / 2 + 2 - mid, cy - rpx - h / 2 - 2 - mid]) {
      const b = { ...box, y0: box.y0 + dy, y1: box.y1 + dy };
      if (placed.some((p) => overlaps(p, b))) continue;
      placed.push(b);
      if (dy) hiddenShift.set(s.id, dy);
      return true;
    }
    return false;
  };
  for (const { s, box } of hiddenFits) if (!tryHidden(s, box)) hiddenUnnamed.add(s.id);
  // Runs of the same plant: one name each, first (a run is named where a lone plant might not be): at its middle, or
  // the nearest spot clear of other names (runLabelSpot). Nowhere clear, its plants are named as lone ones are.
  const inRun = new Set<string>();
  // (A run's name keeps off the plants drawn over its own, not under them: Jason, Nov 4. Not a canopy drawn see-through
  // over the run's middle, which the run is under and its name can't keep off; nor a plant hidden under a solid one.)
  const drawnAt = new Map(shown.map((s, i) => [s.id, i]));
  const plantCircles = shown.filter((s): s is CircleShape => isPlantCircle(s) && !hidden.has(s.id));
  for (const run of labelRuns(waiting.map((w) => w.s))) {
    const text = `${displayLabel(run[0])} \u00d7${run.length}`;
    const w = textWidth1(text) * OVERFLOW_PX * lk, h = OVERFLOW_PX * lk * LABEL_LINE_HEIGHT;
    const mine = new Set(run.map((s) => s.id)), from = Math.min(...run.map((s) => drawnAt.get(s.id) ?? Infinity));
    const mx = run.reduce((t, s) => t + s.x, 0) / run.length, my = run.reduce((t, s) => t + s.y, 0) / run.length;
    const over = plantCircles.filter((o) => !mine.has(o.id) && (drawnAt.get(o.id) ?? -1) > from
      && !(seeThrough.has(o.id) && Math.hypot(o.x - mx, o.y - my) < drawnRadius(o))).map((o) => ({ x: o.x, y: o.y, r: drawnRadius(o) }));
    const at = runLabelSpot(run, w, h, ppf, placed, over);
    if (!at) continue;
    for (const s of run) inRun.add(s.id);
    placed.push(boxAt(at, w, h, ppf));
    // (Drawn with the plant nearest its spot, which every redraw of the run's plants keeps in step.)
    const anchor = run.reduce((best, s) => (Math.hypot(s.x - at.x, s.y - at.y) < Math.hypot(best.x - at.x, best.y - at.y) ? s : best));
    runLabels.set(anchor.id, { text, x: at.x, y: at.y });
  }
  waiting.sort((a, b) => b.s.radius - a.s.radius);
  for (const { s, box } of waiting) {
    if (inRun.has(s.id)) continue;
    if (hidden.has(s.id)) { if (tryHidden(s, box)) overflowLabels.add(s.id); continue; }
    if (placed.some((p) => p.x0 < box.x1 && box.x0 < p.x1 && p.y0 < box.y1 && box.y0 < p.y1)) continue;
    placed.push(box);
    overflowLabels.add(s.id);
  }
}
/**
 * A circle's name, fitted inside it: wrapped, shrunk, or shortened. For a
 * plant, null when no form of the name fits (it shows when selected); other
 * circles fall back to a plain one-line label (undefined).
 */
function circleLabel(s: CircleShape, ppf: number): FittedLabel | null | undefined {
  const label = displayLabel(s);
  if (!label || (s.role === 'shade' && s.sun)) return undefined; // sun hours share the space; keep the plain label
  const plant = s.plantId ? plantsById[s.plantId] : undefined;
  const fit = plantLabelFit(label, canopyInnerRadius(s) * ppf, isTree(s) ? { below: trunkReachPx(s, ppf) + 1 } : {}, isPlantCircle(s) ? plant : undefined, labelScale());
  return fit ?? (isPlantCircle(s) ? null : undefined);
}

/** Plants ringed as close or crowded (Layers switch, and always while placing); refreshed on each redraw. */
let crowded = new Map<string, CrowdLevel>();
/** Plants as tall as a canopy, drawn see-through (seeThroughIds); refreshed on each redraw. */
let seeThrough = new Set<string>();
/** Whether a plant is drawn see-through now (a canopy over what's under it). */
export const isSeeThrough = (id: string) => seeThrough.has(id);
/** Plants hidden under a solid one, their mark and name drawn over it (hiddenCovers); refreshed on each redraw. */
let hidden = new Set<string>();
/** Each hidden plant's plants over it (hiddenCovers): selected, it's outlined, not pinned. */
let hiddenBy = new Map<string, string[]>();
const refreshHidden = () => { hiddenBy = hiddenCovers(state.shapes, state.viewFilter, seeThrough); hidden = new Set(hiddenBy.keys()); };
/** Whether a plant is hidden under a solid one now (its outline and name drawn over it). */
export const isHidden = (id: string) => hidden.has(id);
function refreshCrowding() {
  // (Not until the catalog is in: without plants' heights, plants that grow over and under each other look crowded.)
  crowded = (state.showCrowding || state.placing) && catalogReady() ? crowdLevels(state.shapes.filter((s) => shownWith(s, state.viewFilter)), plantsById, crowdOptions()) : new Map();
}
/** The utilities shown, measured once a redraw for every plant's check (src/utilities.ts); none on most plans. */
let shownUtilities: PreparedUtility[] = [];
function refreshUtilities() {
  shownUtilities = prepareUtilities(state.shapes.filter((s) => s.role === 'utility' && shownWith(s, state.viewFilter)));
}

/**
 * Drawn as Move would leave the plan, while "Was your plan drawn over the photo?" is up (src/ui/rescale-card.ts): the
 * shapes drawn are those, for as long as the drawing takes, and the plan's own are back before anything else runs.
 * Nothing saves or records a step while drawing, and nothing on the plan can be picked or moved meanwhile (it only
 * pans and zooms), so the plan itself is never the preview.
 */
function asPreviewed(draw: () => void) {
  const shown = rescalePreview();
  if (!shown) { draw(); return; }
  const real = state.shapes;
  state.shapes = shown;
  try { draw(); } finally { state.shapes = real; }
}
/** Clear and redraw the whole canvas. Never touches panel DOM. */
export function redrawCanvas() { asPreviewed(drawCanvas); }
function drawCanvas() {
  refreshCrowding();
  seeThrough = seeThroughIds(state.shapes);
  refreshHidden();
  refreshUtilities();
  refreshLabelLayout();
  refreshBadgeLayout();
  const svg = canvasSvg();
  if (!svg) return;
  ensureLayers(svg);
  // (The view it's drawn at, the plan's top left in feet and the zoom, for the tests: e2e/helpers.ts planPoint.)
  svg.setAttribute('data-view', `${state.offsetX} ${state.offsetY} ${state.zoom}`);
  const w = state.canvasW, h = state.canvasH;
  layer(svg, 'base').replaceChildren(svgEl('rect', { 'data-role': 'grid', x: 0, y: 0, width: w, height: h, fill: BG_COLOR }));
  for (const name of SCENE_LAYERS) {
    const g = layer(svg, name);
    g.removeAttribute('transform');
    g.replaceChildren();
  }
  renderBgImageInto(layer(svg, 'bg'));
  const grid = layer(svg, 'grid');
  grid.replaceChildren();
  renderGrid(grid);
  const shapes = layer(svg, 'shapes');
  for (const s of paintOrder(state.shapes)) shapes.appendChild(shapeGroup(s));
  liftPlantNames(shapes);
  liftAreaNames(shapes);
  liftBadges(shapes);
  liftHidden(shapes);
  liftTrunks(shapes);
  const mq = marqueeRect();
  if (mq) shapes.appendChild(mq);
  renderHandles(layer(svg, 'handles'));
  drawnView = { offsetX: state.offsetX, offsetY: state.offsetY, zoom: state.zoom };
}

/**
 * Show the current pan/zoom by transforming the already-drawn scene and
 * redrawing only the grid. Cheap enough to run on every pointer move.
 */
export function previewView() {
  const svg = canvasSvg();
  if (!svg || svg.children.length !== LAYERS.length) { redrawCanvas(); return; }
  const k = state.zoom / drawnView.zoom;
  const ppf = PX_PER_FOOT_BASE * state.zoom;
  const tx = (drawnView.offsetX - state.offsetX) * ppf;
  const ty = (drawnView.offsetY - state.offsetY) * ppf;
  const transform = `translate(${tx} ${ty}) scale(${k})`;
  for (const name of SCENE_LAYERS) layer(svg, name).setAttribute('transform', transform);
  const grid = layer(svg, 'grid');
  grid.replaceChildren();
  renderGrid(grid);
}

/** Redraw only the given shapes (e.g. while dragging them). */
export function redrawShapes(ids: string[]) { asPreviewed(() => drawShapes(ids)); }
function drawShapes(ids: string[]) {
  const svg = canvasSvg();
  if (!svg || svg.children.length !== LAYERS.length || drawnView.zoom !== state.zoom ||
      drawnView.offsetX !== state.offsetX || drawnView.offsetY !== state.offsetY) { redrawCanvas(); return; }
  const shapes = layer(svg, 'shapes');
  // (A utility dragged: its own outline measured again; the plants' badges catch up on release, with the full render.)
  if (ids.some((id) => state.shapes.find((sh) => sh.id === id)?.role === 'utility')) refreshUtilities();
  if (state.showCrowding || state.placing) {
    // Moving one plant can change which others are close or crowded: redraw all plants whose ring changes.
    const before = crowded;
    refreshCrowding();
    const changed = [...new Set([...before.keys(), ...crowded.keys()])].filter((id) => before.get(id) !== crowded.get(id));
    ids = [...new Set([...ids, ...changed])];
  }
  // (A plant moved over or off another: those whose see-through or hiding changes are drawn again too.)
  const wasThin = seeThrough, wasHidden = hidden;
  seeThrough = seeThroughIds(state.shapes);
  refreshHidden();
  const flipped = (a: Set<string>, b: Set<string>) => [...new Set([...a, ...b])].filter((id) => a.has(id) !== b.has(id));
  ids = [...new Set([...ids, ...flipped(wasThin, seeThrough), ...flipped(wasHidden, hidden)])];
  // (A support dragged: the vines on it follow along.)
  const moving = new Set(ids);
  ids = [...ids, ...state.shapes.filter((v) => v.type === 'circle' && v.climbsOn && moving.has(v.climbsOn)).map((v) => v.id)];
  for (const id of new Set(ids)) {
    const s = state.shapes.find((sh) => sh.id === id);
    const old = shapes.querySelector(`:scope > g[data-shape-group="${CSS.escape(id)}"]`);
    if (s && old) {
      shapes.querySelector(`:scope > g[data-role=trunks] > [data-trunk-of="${CSS.escape(id)}"]`)?.remove();
      shapes.querySelector(`:scope > g[data-role=hidden-over] > [data-label-of="${CSS.escape(id)}"]`)?.remove();
      shapes.querySelector(`:scope > g[data-role=badges-over] > [data-badges-of="${CSS.escape(id)}"]`)?.remove();
      shapes.querySelector(`:scope > g[data-role=area-names] > [data-name-of="${CSS.escape(id)}"]`)?.remove();
      shapes.querySelector(`:scope > g[data-role=plant-names] > [data-name-of="${CSS.escape(id)}"]`)?.remove();
      old.replaceWith(shapeGroup(s));
    }
  }
  liftPlantNames(shapes);
  liftAreaNames(shapes);
  liftBadges(shapes);
  liftHidden(shapes);
  liftTrunks(shapes);
}
/**
 * The plants hidden under a solid one (hiddenCovers), over every plant (Jason, Oct 30, option C: nothing planted is lost
 * from sight under a solid plant; his pick of the marks, G): a pin at its middle, and its name moved up from its own
 * group where it's clear; the plant over it selected (or it), its dotted outline instead, to see what's under and how far
 * it reaches. Marks drawn afresh each time; a name stays up here until its plant is drawn again.
 */
function liftHidden(shapes: Element) {
  let top = shapes.querySelector(':scope > g[data-role=hidden-over]');
  if (!top) top = shapes.appendChild(svgEl('g', { 'data-role': 'hidden-over', 'pointer-events': 'none' }));
  for (const r of top.querySelectorAll(':scope > [data-role=hidden-rim]')) r.remove();
  for (const t of top.querySelectorAll(':scope > [data-label-of]')) if (!hidden.has((t as SVGElement).dataset.labelOf!)) t.remove();
  const ppf = pxPerFoot();
  const rims: SVGElement[] = [];
  for (const id of hidden) {
    const s = state.shapes.find((x) => x.id === id);
    if (!s || s.type !== 'circle') continue;
    const cx = (s.x - state.offsetX) * ppf, cy = (s.y - state.offsetY) * ppf, r = Math.max(2, drawnRadius(s) * ppf - 1);
    const outlined = state.selectedIds.includes(id) || (hiddenBy.get(id) ?? []).some((c) => state.selectedIds.includes(c));
    // (Its pin sized by the plant as drawn and the zoom; none where it's a speck, below 85%, or with names hidden:
    // src/pins.ts.)
    const pin = outlined ? null : pinRadius(r, state.zoom, state.showNames);
    if (outlined) rims.push(svgEl('g', { 'data-role': 'hidden-rim', 'data-rim-of': id, 'data-mark': 'outline' },
      svgEl('circle', { cx, cy, r, fill: 'none', stroke: 'rgba(255,255,255,0.75)', 'stroke-width': 3 }),
      svgEl('circle', { cx, cy, r, fill: 'none', stroke: '#292524', 'stroke-width': 1.5, 'stroke-dasharray': '2 3', 'stroke-linecap': 'round', opacity: 0.8 })));
    else if (pin) rims.push(svgEl('g', { 'data-role': 'hidden-rim', 'data-rim-of': id, 'data-mark': 'pin' },
      svgEl('circle', { cx, cy, r: pin, fill: '#fff', opacity: 0.9 }), svgEl('circle', { cx, cy, r: Math.round(pin * 0.58 * 10) / 10, fill: '#292524' })));
    // (Its pin, a finger wide, and its lifted name pick it: round 3, Hank couldn't pick a daffodil under a catmint.
    // A tap there finds it in the stack too, for "tap again": src/gestures.ts shapesAt. No pin, no target: zoomed in,
    // it's back.)
    if (pin) {
      const pinHit = svgEl('circle', { 'data-pin-of': id, 'data-role': 'pin-hit', cx, cy, r: 12, fill: 'transparent', 'pointer-events': 'all' });
      pinHit.addEventListener('pointerdown', (e) => onShapePointerDown(e as PointerEvent, s));
      rims.push(pinHit);
    }
    const label = shapes.querySelector(`:scope > g[data-shape-group="${CSS.escape(id)}"] > [data-role=plant-label]`);
    // (Selected, its name shows whatever's around it.)
    if (label && hiddenUnnamed.has(id) && !state.selectedIds.includes(id)) label.remove();
    else if (label) {
      (label as SVGElement).dataset.labelOf = id;
      if (!label.hasAttribute('data-tap')) {
        label.setAttribute('data-tap', '');
        label.setAttribute('pointer-events', 'all');
        label.addEventListener('pointerdown', (e) => onShapePointerDown(e as PointerEvent, s));
      }
      const dy = hiddenShift.get(id);
      if (dy) label.setAttribute('transform', `translate(0 ${Math.round(dy * 10) / 10})`);
      top.appendChild(label);
    }
  }
  top.prepend(...rims); // (under the names)
  shapes.appendChild(top);
}
/**
 * A tree's trunk, its tap target, over every shape (Jason, Oct 29: a tree dragged into a patch of groundcover
 * jessamine couldn't be picked): a trunk is above whatever grows around it, so tapping one always picks its tree.
 * Moved, not copied, from each tree's group into one group last in the layer.
 */
function liftTrunks(shapes: Element) {
  let top = shapes.querySelector(':scope > g[data-role=trunks]');
  if (!top) top = shapes.appendChild(svgEl('g', { 'data-role': 'trunks' }));
  for (const t of shapes.querySelectorAll(':scope > g[data-shape-group] > [data-role=trunk-hit]')) top.appendChild(t);
  shapes.appendChild(top); // (last: after any group drawn since)
}

/** Redraw only the marquee rectangle. */
export function redrawMarquee() {
  const svg = canvasSvg();
  if (!svg || svg.children.length !== LAYERS.length) { redrawCanvas(); return; }
  const shapes = layer(svg, 'shapes');
  shapes.querySelector(':scope > [data-role="marquee"]')?.remove();
  const mq = marqueeRect();
  if (mq) shapes.appendChild(mq);
}

/** Redraw only the background image and its handles. */
export function redrawBackground() { asPreviewed(drawBackground); }
function drawBackground() {
  const svg = canvasSvg();
  if (!svg || svg.children.length !== LAYERS.length) { redrawCanvas(); return; }
  const bg = layer(svg, 'bg'), handles = layer(svg, 'handles');
  bg.replaceChildren(); handles.replaceChildren();
  renderBgImageInto(bg);
  renderHandles(handles);
}
function renderHandles(g: SVGGElement) {
  renderRescaleWas(g); // (where things are now, while the plan is drawn as Move would leave it)
  renderBgHandles(g);
  renderPathOverlay(g);
  renderBedFocus(g);
  renderPlaceOverlay(g);
  renderShapeHandles(g);
}
/**
 * Plant this bed (Jason, Nov 2, answer C/8): placing For a bed, the bed outlined and the rest of the plan washed faint
 * red, and each plant placed outside it this go ringed red (placed all the same, never blocked; Undo on the banner:
 * src/ui/render.ts). The picker open For a bed: the outline alone, to see which it is.
 */
function renderBedFocus(g: SVGGElement) {
  const bed = plantingFor();
  if (!bed || !(state.placing || state.panel === 'plants')) return;
  const o = drawnOutline(bed);
  if (!o) return;
  const ppf = pxPerFoot();
  const px = (p: Point) => `${Math.round((p.x - state.offsetX) * ppf * 10) / 10},${Math.round((p.y - state.offsetY) * ppf * 10) / 10}`;
  const pts = o.pts.map(px);
  if (state.placing) {
    // (Past the plan's edges by its size each way, so a pan's preview never shows where the wash ends.)
    const w = state.canvasW, h = state.canvasH;
    g.appendChild(svgEl('path', { 'data-role': 'bed-wash', d: `M${-w},${-h}H${2 * w}V${2 * h}H${-w}Z M${pts.join(' L')}Z`, 'fill-rule': 'evenodd',
      fill: '#dc2626', 'fill-opacity': 0.1, 'pointer-events': 'none' }));
  }
  g.appendChild(svgEl('polygon', { points: pts.join(' '), fill: 'none', stroke: '#0f766e', 'stroke-opacity': 0.3, 'stroke-width': 9, 'stroke-linejoin': 'round', 'pointer-events': 'none' }));
  g.appendChild(svgEl('polygon', { 'data-role': 'bed-outline', 'data-bed': bed.id, points: pts.join(' '), fill: 'none', stroke: '#0f766e', 'stroke-width': 3, 'stroke-linejoin': 'round', 'pointer-events': 'none' }));
  if (!state.placing) return;
  for (const { id } of state.placing.placed) {
    const s = state.shapes.find((x) => x.id === id);
    if (!s || s.type !== 'circle' || inBed(bed, shapeCenter(s))) continue;
    g.appendChild(svgEl('circle', { 'data-role': 'outside-bed', 'data-outside': s.id, cx: (s.x - state.offsetX) * ppf, cy: (s.y - state.offsetY) * ppf,
      r: Math.max(6, drawnRadius(s) * ppf) + 5, fill: 'none', stroke: '#dc2626', 'stroke-width': 3, 'pointer-events': 'none' }));
  }
}
/** Redraw only the handles layer (drawing in progress, point handles). */
export function redrawHandles() { asPreviewed(drawHandles); }
function drawHandles() {
  const svg = canvasSvg();
  if (!svg || svg.children.length !== LAYERS.length || drawnView.zoom !== state.zoom ||
      drawnView.offsetX !== state.offsetX || drawnView.offsetY !== state.offsetY) { redrawCanvas(); return; }
  const handles = layer(svg, 'handles');
  handles.replaceChildren();
  renderHandles(handles);
}

/**
 * Size the canvas to its container and redraw. Window resizes call this, never
 * the full render(): Android fires a resize when the keyboard opens, and a
 * full render would destroy the input being typed into.
 */
/** The plan's width when last measured (none yet: the first measure moves nothing). */
let measuredW: number | null = null;
/** Where the plan's top edge was when last measured (page px; none yet: the first measure moves nothing). */
let measuredTop: number | null = null;
/**
 * What's to be kept in view when the plan's width changes (a phone turned), set by what's showing it: the walk through
 * Warnings keeps the plants it's on (src/ui/warnings-sheet.ts). Run once the plan has its new size, before it's drawn.
 */
let keepOnTurn: (() => void) | null = null;
export function keepInViewOnTurn(fn: (() => void) | null) { keepOnTurn = fn; }
/** When the width last changed: a phone turned may settle its height a moment later, which is the same turn. */
let turnedAt = -Infinity;
export function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const svg = canvasSvg();
  if (!wrap || !svg) return;
  const rect = wrap.getBoundingClientRect();
  const w = Math.max(100, Math.round(rect.width));
  // A window made narrower or wider (a phone turned, a window resized) keeps what was in the middle in the middle,
  // across: the plan stayed pinned at its left edge, and the bed selected went off screen (Diego, Oct 30). Not
  // up and down: the keyboard opening shortens it, and the plan stays put for that.
  const turned = measuredW != null && w !== measuredW;
  if (turned) state.offsetX -= (w - measuredW!) / 2 / pxPerFoot();
  measuredW = w;
  // The plan's top edge moved (the strip saying what a mode asks for came or went above it, src/ui/render.ts; an
  // update's banner): what's on it stays where it was on the screen, rather than jumping by the strip's height as a
  // drawing starts.
  const top = rect.top;
  // (By a whole 4096th of a foot, a step that adds and takes away exactly: the strip coming and going leaves the view
  // as it was, not a hair off.)
  if (measuredTop != null && Math.abs(top - measuredTop) > 0.01 && !turned) {
    const shift = (top - measuredTop) / pxPerFoot();
    state.offsetY += Math.sign(shift) * Math.round(Math.abs(shift) * 4096) / 4096;
  }
  measuredTop = top;
  const h = Math.max(100, Math.round(rect.height));
  const settled = !turned && h !== state.canvasH && performance.now() - turnedAt < 1500;
  state.canvasW = w;
  state.canvasH = h;
  if (!typingNow()) restingH = state.canvasH;
  svg.setAttribute('width', String(state.canvasW));
  svg.setAttribute('height', String(state.canvasH));
  // (Turned, and its height settling just after: what's kept in view is put back in view, the walk's plants clear of
  // its chip. The warnings bug hunt, Nov 1: turned mid-walk, the chip covered the maple. Not the keyboard: it changes
  // only the height.)
  if (turned) turnedAt = performance.now();
  if ((turned || settled) && keepOnTurn) keepOnTurn();
  redrawCanvas();
}
/** The plan's height when last measured with nothing being typed in: on a phone, as it is with its keyboard away. */
let restingH = 0;
const typingNow = () => {
  const a = document.activeElement;
  return a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'submit', 'color', 'file'].includes(a.type));
};
/**
 * The plan's height (px) once the phone's keyboard is put away: a small phone's keyboard can leave a sliver of plan
 * above it, whose middle is no guide to where the plan's middle is (src/draw.ts finishTypedRect).
 */
export function restingCanvasH(): number { return Math.max(state.canvasH, restingH); }
