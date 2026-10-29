import { isVine, supportOf, supportsNear } from '../vines';
import { supportName } from './vine-offers';
import { SWATCH_NAMES } from './a11y';
import { SWATCHES } from '../constants';
import { el, escapeHtml, ts } from '../dom';
import { I } from '../icons';
import { defaultLook, isLocked, roleKey, roleLabel, roleLocked } from '../roles';
import { convertToOutline, startEditPoints, startKind, startTreeDraw } from '../draw';
import { kindDef, kindOfShape } from '../kinds';
import { boxSize, fmtFeet, resizedPoints, shapeArea, shapePerimeter } from '../geometry';

const round1 = (v: number) => Math.round(v * 10) / 10;
import { roleChips } from './role-picker';
import { bedSection, crowdingNote, measureText, plantSunBanner, shadeSunSection, sunListText, utilityBanner, utilitySection } from './role-sections';
import { isUtilityKind, utilityLabel, utilityLook } from '../utility-kinds';
import { setRoleForIds, bringForward, bringToFront, copySelected, duplicateSelected, findNextSameTier, sendBackward, sendToBack, setLockedForIds, updateSelected, updateSelectedSilent } from '../mutations';
import { getSelected, singleSelected } from '../selection';
import { state } from '../state';
import { render } from './render';
import type { CircleShape, Corner, RoleKey, Shape } from '../types';
import { formatSize, fullRingRadius, isMine, plantRadius, plantSpread, type Range } from '../my-plants';
import { canLinkToPlant, linkShapesToPlant, plantColor, plantFilter, plantsById, unlinkedWithLabel, type Plant } from '../plants';
import { toast } from './toast';
import { deleteSelectedAsking } from './delete-selected';
import { zoneFit, zoneRange } from '../climate';
import { isTree, trunkDiameter } from '../trees';
import { treeBranches } from '../crowding';
import { MAX_TREE_HEIGHT, MAX_TRUNK, MIN_TRUNK } from '../constants';
import { statusSection, statusSummary } from './status-section';
import { hasStatus } from '../status';
import { plantsInBed } from '../beds';
import { startPlacing } from '../place';
import { bedBloomSection } from './bloom-view';
import { featuresSection, featuresSummary, featuresTitle, hasFeaturesSection } from './feature-section';
import { snapRot, sqFt, typeName } from '../util';

// ============================================================
// PANELS
// ============================================================

/** Selection whose kind list is open ("Change" was tapped), as a key of its ids. */
let changingKindOf: string | null = null;
/** Close the kind list (whenever properties aren't showing). */
export function resetKindChange() { changingKindOf = null; }
/**
 * What a shape is ("Bed"), with a Change button that opens the full list.
 * The list is rarely needed, so it stays out of the way until asked for.
 */
function whatItIs(ids: string[], current: RoleKey | null, multi: boolean): HTMLElement {
  const key = ids.join(',');
  const wrap = el('div', { className: 'what-it-is', 'data-testid': 'what-it-is' });
  const title = el('span', { className: 'prop-title' }, multi ? 'What they are' : 'What it is');
  if (changingKindOf === key) {
    wrap.append(el('div', { className: 'kind-row' }, title),
      // (A circle or a note isn't a utility: a utility is a line or an area.)
      roleChips(current, (role) => { changingKindOf = null; setRoleForIds(ids, role); render(); },
        ids.some((id) => { const t = state.shapes.find((s) => s.id === id)?.type; return t === 'circle' || t === 'text'; }) ? ['utility'] : []));
    return wrap;
  }
  const change = el('button', { className: 'link-btn', 'data-testid': 'change-kind', 'aria-label': multi ? 'Change what they are' : 'Change what it is' }, 'Change');
  change.addEventListener('click', () => { changingKindOf = key; render(); });
  wrap.appendChild(el('div', { className: 'kind-row' }, title, el('span', { className: 'kind-name' }, current ? roleLabel(current) : 'Mixed'), change));
  return wrap;
}

// ---------- Sections: one row each, showing where things stand; tap to open ----------
/** Sections opened or closed by hand (kept while moving between shapes). */
const sectionOpen = new Map<string, boolean>();
/**
 * A collapsible group of properties. The header shows the current state
 * (`summary`, which callers may update in place while typing); the content is
 * always built, only hidden, so in-place updates never need a re-render.
 */
function section(key: string, title: string, summary: Node, content: Node[], openByDefault = false): HTMLElement {
  // A group that opens by default stays open from then on (recording the sun mustn't fold it away).
  if (openByDefault && !sectionOpen.has(key)) sectionOpen.set(key, true);
  const open = sectionOpen.get(key) ?? false;
  const head = el('button', { className: 'prop-head', 'aria-expanded': String(open), 'data-section': key },
    el('span', { className: 'prop-title' }, title), el('span', { className: 'prop-summary' }, summary),
    el('span', { className: 'prop-chev', html: I.chevronDown }));
  head.addEventListener('click', () => { sectionOpen.set(key, !open); render(); });
  const body = el('div', { className: 'prop-body' }, ...content);
  return el('div', { className: 'prop-section' + (open ? ' open' : ''), 'data-testid': 'section-' + key }, head, body);
}
const fmt1 = (n: number) => String(Math.round(n * 10) / 10);
/** Plants and trees are sized by spread (what a nursery tag says); other circles by diameter. */
const bySpread = (s: CircleShape) => s.role === 'plant';
/** "10 × 4 ft · 40 sq ft", "4 ft spread", "8 ft across · 50 sq ft", "16 ft long · 3 ft wide". */
function sizeSummary(s: Shape): string {
  if (s.type === 'text') return `${fmt1(s.fontSize)} ft text`;
  if (s.type === 'circle') return bySpread(s) ? `${fmt1(s.radius * 2)} ft spread` : `${fmt1(s.radius * 2)} ft across · ${sqFt(shapeArea(s))} sq ft`;
  if (s.type === 'line') return `${fmt1(shapePerimeter(s))} ft long` + (s.pathWidth ? ` · ${fmt1(s.pathWidth)} ft wide` : '');
  const { w, h } = boxSize(s);
  const area = s.role === 'boundary' ? '' : ` · ${sqFt(shapeArea(s))} sq ft`;
  return (s.type === 'poly' ? `${s.points.length} points · ` : '') + `${fmt1(w)} × ${fmt1(h)} ft` + area;
}
function positionSummary(s: Shape): string {
  const rot = s.type !== 'circle' && s.rotation ? ` · ${fmt1(s.rotation)}°` : '';
  return `x ${fmt1(s.x)}, y ${fmt1(s.y)}` + rot;
}
/** A color picked here: for a circle, one chosen by hand, which a plant's picture draws its leaves in (src/looks.ts). */
const colorPatch = (s: Shape, color: string) => (s.type === 'circle' ? { color, colorSet: true as const } : { color });
/** The color a shape starts with: a plant's from its catalog record (src/plants.ts plantColor), else its role's. */
export function defaultColorOf(s: Shape): string {
  if (s.type === 'circle' && s.role === 'plant' && s.plantId && plantsById[s.plantId]) return plantColor(plantsById[s.plantId]);
  if (s.role === 'utility' && isUtilityKind(s.utility)) return utilityLook(s.utility).color;
  return defaultLook(roleKey(s), s.type).color;
}
function lookSummary(s: Shape): HTMLElement {
  const outline = s.role === 'boundary' || (s.type === 'line' && !s.pathWidth) || s.type === 'text';
  return el('span', { className: 'look-sum' }, el('span', { className: 'sw-dot', style: { background: s.color } }),
    outline ? '' : ` ${Math.round((s.opacity ?? 0.65) * 100)}%`);
}

/**
 * What a vine climbs (src/vines.ts; Jason, 2026-10-29): nothing (grown as a groundcover), or what's within its spread,
 * nearest first, each with how far. A shrub can be picked here, though it's never offered.
 */
function climbingField(s: CircleShape): HTMLElement {
  const near = supportsNear(s, state.shapes), now = supportOf(s, state.shapes);
  const list = now && !near.some((n) => n.shape === now.shape) ? [now, ...near] : near;
  const select = el('select', { 'data-testid': 'climbs-on' }) as HTMLSelectElement;
  select.appendChild(el('option', { value: '' }, 'Nothing: grown as a groundcover'));
  for (const n of list) {
    const what = n.kind === 'shrub' ? ' (a shrub)' : '';
    select.appendChild(el('option', { value: n.shape.id }, `${cap1(supportName(n).replace(/^the /, ''))}${what}, ${fmtFeet(n.dist)} ft away`));
  }
  select.value = now ? now.shape.id : '';
  select.addEventListener('change', () => updateSelected({ climbsOn: select.value }));
  const hint = now ? (now.kind === 'arbor' ? 'Drawn over the arbor, as far as its spread reaches.' : 'Drawn along what it climbs, as long as its spread.')
    : list.length ? 'Drawn as a patch on the ground. Pick what it climbs to draw it along that instead.'
      : 'Nothing to climb within its spread: a fence, a wall, a trellis, an arbor or a tree near it can be picked here.';
  return el('div', { className: 'field' }, el('label', {}, 'Climbing on'), select, el('div', { className: 'hint' }, hint));
}
const cap1 = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
export function renderPropsPanelSingle(s: Shape) {
  const body = el('div', { className: 'sheet-body props-compact' });
  // Always in view: warnings, the name, and what it is.
  if (s.locked) {
    body.appendChild(el('div', { className: 'banner' },
      "This shape is locked: it can't be dragged, and dragging on it pans the plan. Tap Unlock above to move it."));
  } else if (roleLocked(s)) {
    body.appendChild(el('div', { className: 'banner' },
      `All ${roleLabel(roleKey(s)).toLowerCase()} shapes are locked. Unlock them in the Layers panel to move this one.`));
  }
  const sunCheck = plantSunBanner(s);
  if (sunCheck) body.appendChild(sunCheck);
  // Crowding: refreshed in place as the position is typed (no re-render).
  const crowdBox = el('div', {});
  // (A plant too near a power line, a buried line or a septic field too: src/utilities.ts.)
  const refreshCrowd = () => { crowdBox.replaceChildren(...[utilityBanner(s), crowdingNote(s)].filter((x): x is HTMLElement => !!x)); };
  refreshCrowd();
  body.appendChild(crowdBox);
  // The label (for a text note, the text itself; it can run to several lines)
  if (s.type === 'text') {
    const ta = el('textarea', { rows: 3, placeholder: 'e.g. Rain barrel goes here' }) as HTMLTextAreaElement;
    ta.value = s.label || '';
    ta.addEventListener('input', () => updateSelectedSilent({ label: ta.value }));
    body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Text'), ta));
  } else {
    const labelInput = el('input', { type: 'text', value: s.label || '', placeholder: s.role === 'plant' ? "e.g. Hydrangea 'Limelight'" : s.role === 'bed' ? 'e.g. Front bed' : s.role === 'path' ? 'e.g. Stepping-stone path' : 'Name it' });
    labelInput.addEventListener('input', e => updateSelectedSilent({ label: (e.target as HTMLInputElement).value }));
    body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Label'), labelInput));
  }
  if (s.type !== 'text') body.appendChild(whatItIs([s.id], roleKey(s), false));

  // ----- What the role adds: sun record, bed contents, the plant, status -----
  if (s.role === 'shade') {
    // Recording the sun is the point of a sun exposure area: open until there's a record.
    body.appendChild(section('sun', 'Sun record', document.createTextNode(s.sun ? sunListText(s.sun) : 'Not recorded'), [shadeSunSection(s)], !s.sun));
  }
  if (s.role === 'utility' && s.type !== 'circle' && s.type !== 'text') {
    body.appendChild(section('utility', 'Utility', document.createTextNode(s.utility ? utilityLabel(s.utility) : 'Which is it?'), [utilitySection(s)], true));
  }
  if (s.role === 'bed') {
    const n = plantsInBed(s, state.shapes).filter((p) => p.status !== 'gone').length;
    body.appendChild(section('bed', 'Plants in this bed', document.createTextNode(n ? `${n} plant${n === 1 ? '' : 's'}` : 'None yet'), [bedSection(s), bedBloomSection(s)]));
  }
  if (s.type === 'circle' && (s.plantId || !s.role || s.role === 'plant' || s.role === 'other')) {
    const p = s.plantId ? plantsById[s.plantId] : undefined;
    body.appendChild(section('plant', 'Plant', document.createTextNode(p ? p.common + (isMine(p) ? ' (mine)' : '') : s.plantId ? 'Details not on this device' : 'Not linked'), [plantLinkSection(s)]));
  }
  if (hasStatus(s)) body.appendChild(section('status', 'Status', document.createTextNode(statusSummary([s])), [statusSection([s])]));
  // What sits on its edges: a building's doors and windows, a fence's gates, a deck's steps.
  if (hasFeaturesSection(s)) body.appendChild(section('features', featuresTitle(s), document.createTextNode(featuresSummary(s)), [featuresSection(s)]));

  // ----- Size (with area or length, refreshed as you type) -----
  const sizeSum = document.createTextNode(sizeSummary(s));
  const measure = el('div', { className: 'measure', 'data-testid': 'measure' }, measureText(s));
  const refreshMeasure = () => { measure.textContent = measureText(s); sizeSum.textContent = sizeSummary(s); };
  const sizeParts: Node[] = [];
  if (s.type === 'text') {
    const sizeInput = el('input', { type: 'number', step: '0.25', min: '0.25', value: s.fontSize });
    sizeInput.addEventListener('input', e => { updateSelectedSilent({ fontSize: Math.min(50, Math.max(0.25, parseFloat((e.target as HTMLInputElement).value) || 0)) }); refreshMeasure(); });
    sizeParts.push(el('div', { className: 'field' }, el('label', {}, 'Text height (ft)'), sizeInput,
      el('div', { className: 'hint' }, 'Sized in feet so it stays in proportion to the plan when zoomed or printed.')));
  } else if (s.type === 'circle') {
    // Sized by width across, as tags and tape measures give it; the radius is only stored.
    const dInput = el('input', { type: 'number', step: '0.5', min: '0.2', inputMode: 'decimal', value: round1(s.radius * 2), 'data-testid': 'circle-size' }) as HTMLInputElement;
    dInput.addEventListener('input', () => {
      const d = parseFloat(dInput.value.replace(',', '.'));
      if (!(d >= 0.2)) return; // a passing "0" or empty field mustn't shrink it to nothing
      // A plant resized by hand keeps its size when the plan's size mode changes.
      updateSelectedSilent(s.plantId ? { radius: d / 2, sizeFrom: 'manual' } : { radius: d / 2 });
      refreshMeasure();
    });
    dInput.addEventListener('change', () => { if (!(parseFloat(dInput.value.replace(',', '.')) >= 0.2)) dInput.value = String(round1(s.radius * 2)); });
    const what = bySpread(s) ? (s.canopy ? 'Spread, widest (ft)' : 'Spread (ft)') : 'Diameter (ft)';
    sizeParts.push(el('div', { className: 'field' }, el('label', {}, what), dInput,
      bySpread(s) ? el('div', { className: 'hint' }, 'How wide it\'s drawn, across. Plant tags call this its spread.') : '', bySpread(s) ? '' : measure));
    // Trees drawn before trunks existed (or a plant of my own that's a tree): say so here.
    const formTree = !!s.plantId && !!plantsById[s.plantId]?.form?.startsWith('Tree');
    if (s.role === 'plant' && !formTree) {
      const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
      cb.checked = !!s.tree;
      cb.addEventListener('change', () => updateSelected({ tree: cb.checked || undefined }));
      sizeParts.push(el('label', { className: 'check-row', 'data-testid': 'is-tree' }, cb, el('span', {}, 'A tree (show its trunk)')));
    }
    if (isTree(s)) sizeParts.push(...trunkFields(s));
    if (s.canopy) sizeParts.push(makeRoundField(s));
    if (isVine(s)) sizeParts.push(climbingField(s));
  } else {
    const isPath = s.type === 'poly' || s.type === 'line';
    // Reshaping point by point is the likelier edit for an outline or path, so it comes first.
    if (isPath) {
      const editBtn = el('button', { className: 'btn ghost', 'data-testid': 'edit-points' }, 'Edit points…');
      editBtn.disabled = isLocked(s);
      editBtn.addEventListener('click', () => { startEditPoints(s.id); render(); });
      sizeParts.push(el('div', { className: 'field' }, editBtn,
        el('div', { className: 'hint' }, isLocked(s) ? 'Unlock this shape to edit its points.' : 'Drag points to reshape, add or remove corners.')));
    }
    const size = boxSize(s);
    // Outlines and lines stretch their points to the new size.
    const resize = (w: number, h: number) => {
      if (s.type === 'poly' || s.type === 'line') updateSelectedSilent({ points: resizedPoints(s.points, w, h) });
      else updateSelectedSilent({ width: w, height: h });
    };
    const wInput = el('input', { type: 'number', step: '0.5', min: '0.1', value: round1(size.w) });
    wInput.addEventListener('input', e => { resize(Math.max(0.1, parseFloat((e.target as HTMLInputElement).value) || 0), boxSize(s).h); refreshMeasure(); });
    const hInput = el('input', { type: 'number', step: '0.5', min: '0.1', value: round1(size.h) });
    hInput.addEventListener('input', e => { resize(boxSize(s).w, Math.max(0.1, parseFloat((e.target as HTMLInputElement).value) || 0)); refreshMeasure(); });
    // A perfectly straight line has no height (or width) to stretch.
    if (isPath && size.w === 0) wInput.disabled = true;
    if (isPath && size.h === 0) hInput.disabled = true;
    // A path's box isn't its size (that's its width and length), so it has no box fields.
    if (!(s.type === 'line' && s.pathWidth)) {
      sizeParts.push(el('div', { className: 'row-2' },
        el('div', { className: 'field' }, el('label', {}, 'Width (ft)'), wInput),
        el('div', { className: 'field' }, el('label', {}, 'Length (ft)'), hInput)));
    }
    sizeParts.push(measure);
    if (s.type === 'line') {
      // A path's width; empty = a thin line (fences). Typed without re-rendering (keyboard safety).
      const w = el('input', { type: 'number', min: '0.25', max: '50', step: '0.5', inputMode: 'decimal', placeholder: 'Thin line', value: s.pathWidth ?? '', 'data-testid': 'path-width' }) as HTMLInputElement;
      const widthValue = () => { const v = parseFloat(w.value.replace(',', '.')); return Number.isFinite(v) && v >= 0.25 && v <= 50 ? v : null; };
      // While typing, only a usable width applies (a passing "0" mustn't turn the path into a line).
      w.addEventListener('input', () => { const v = widthValue(); if (v != null) { updateSelectedSilent({ pathWidth: v }); refreshMeasure(); } });
      // On leaving the field: empty means a thin line; anything else unusable goes back to the width in use.
      w.addEventListener('change', () => {
        if (!w.value.trim()) { updateSelectedSilent({ pathWidth: undefined }); refreshMeasure(); }
        else if (widthValue() == null) w.value = String(s.type === 'line' ? s.pathWidth ?? '' : '');
      });
      sizeParts.push(el('div', { className: 'field', style: { marginTop: '8px' } }, el('label', {}, 'Path width (ft)'), w,
        el('div', { className: 'hint' }, 'Paths draw at their real width. Leave it empty for a thin line, like a fence.')));
      const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
      cb.checked = !!s.showLength;
      cb.addEventListener('change', () => updateSelected({ showLength: cb.checked }));
      sizeParts.push(el('label', { className: 'check-row', 'data-testid': 'show-length' }, cb, el('span', {}, 'Show length on the plan')));
    }
    if (!isPath) {
      const convBtn = el('button', { className: 'btn ghost', 'data-testid': 'convert-outline' }, 'Convert to outline');
      convBtn.disabled = isLocked(s);
      convBtn.addEventListener('click', () => { convertToOutline(s.id); render(); });
      sizeParts.push(el('div', { className: 'field' }, convBtn,
        el('div', { className: 'hint' }, 'Turns this into a freeform outline you can reshape point by point.')));
    }
    // Triangle (older plans): which corner holds the right angle
    if (s.type === 'triangle') {
      const corners: { v: Corner; label: string }[] = [
        { v: 'bl', label: 'Bottom-left' }, { v: 'br', label: 'Bottom-right' }, { v: 'tl', label: 'Top-left' }, { v: 'tr', label: 'Top-right' },
      ];
      const grid = el('div', { className: 'tri-corners' });
      for (const c of corners) {
        const btn = el('button', { className: 'tri-corner-btn' + ((s.rightAngle || 'bl') === c.v ? ' sel' : '') }, c.label);
        btn.addEventListener('click', () => updateSelected({ rightAngle: c.v }));
        grid.appendChild(btn);
      }
      sizeParts.push(el('div', { className: 'field' }, el('label', {}, 'Right angle corner'), grid));
    }
  }
  body.appendChild(section('size', 'Size', sizeSum, sizeParts));

  // ----- Position and rotation -----
  const posSum = document.createTextNode(positionSummary(s));
  const refreshPos = () => { posSum.textContent = positionSummary(s); };
  const xInput = el('input', { type: 'number', step: '0.5', value: s.x });
  xInput.addEventListener('input', e => { updateSelectedSilent({ x: parseFloat((e.target as HTMLInputElement).value) || 0 }); refreshCrowd(); refreshPos(); });
  const yInput = el('input', { type: 'number', step: '0.5', value: s.y });
  yInput.addEventListener('input', e => { updateSelectedSilent({ y: parseFloat((e.target as HTMLInputElement).value) || 0 }); refreshCrowd(); refreshPos(); });
  const posParts: Node[] = [el('div', { className: 'row-2' },
    el('div', { className: 'field' }, el('label', {}, 'X position (ft)'), xInput),
    el('div', { className: 'field' }, el('label', {}, 'Y position (ft)'), yInput))];
  if (s.type !== 'circle') {
    const rotVal = s.rotation || 0;
    const rotInput = el('input', { type: 'number', step: '5', value: rotVal });
    const rotPct = el('span', { style: { fontSize: ts(12), color: '#78716c' } }, rotVal + '°');
    const setRot = (v: number) => { updateSelectedSilent({ rotation: v }); rotPct.textContent = v + '°'; refreshPos(); };
    rotInput.addEventListener('input', e => setRot(parseFloat((e.target as HTMLInputElement).value) || 0));
    const quickBtns = el('div', { className: 'rot-quick' });
    [-90, -15, 15, 90].forEach(delta => {
      const b = el('button', {}, (delta > 0 ? '+' : '') + delta + '°');
      b.addEventListener('click', () => {
        let newRot = snapRot((s.rotation || 0) + delta);
        if (newRot >= 360) newRot -= 360;
        if (newRot < 0) newRot += 360;
        rotInput.value = String(newRot);
        setRot(newRot);
      });
      quickBtns.appendChild(b);
    });
    const resetBtn = el('button', { className: 'link-reset' }, 'Reset rotation');
    resetBtn.addEventListener('click', () => { rotInput.value = '0'; setRot(0); });
    posParts.push(el('div', { className: 'field' },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
        el('label', {}, 'Rotation (degrees, around center)'), rotPct),
      rotInput, quickBtns, el('div', { style: { marginTop: '6px' } }, resetBtn)));
  }
  body.appendChild(section('position', 'Position', posSum, posParts));

  // ----- Look: color, and opacity for filled shapes -----
  const lookSum = lookSummary(s);
  const swatches = el('div', { className: 'swatches' });
  for (const c of SWATCHES) {
    const btn = el('button', { className: 'swatch' + (s.color === c ? ' sel' : ''), style: { background: c }, 'aria-label': SWATCH_NAMES[c] ?? c, 'aria-pressed': String(s.color === c) });
    btn.addEventListener('click', () => updateSelected(colorPatch(s, c)));
    swatches.appendChild(btn);
  }
  const colorInput = el('input', { type: 'color', value: s.color });
  colorInput.addEventListener('input', e => {
    updateSelectedSilent(colorPatch(s, (e.target as HTMLInputElement).value));
    (lookSum.firstChild as HTMLElement).style.background = s.color;
  });
  // Back to the color it started with (Jason, Oct 29): for a catalog plant, its picture's own colors again.
  const def = defaultColorOf(s);
  const isDefault = s.color.toLowerCase() === def.toLowerCase() && !(s.type === 'circle' && s.colorSet);
  const resetColor = el('button', { className: 'link-btn', 'data-testid': 'default-color' }, 'Default color');
  resetColor.addEventListener('click', () => updateSelected({ color: def, ...(s.type === 'circle' ? { colorSet: undefined } : {}) }));
  const pictured = s.type === 'circle' && s.role === 'plant' && !!s.plantId && !!plantsById[s.plantId] && !isMine(plantsById[s.plantId]);
  const lookParts: Node[] = [el('div', { className: 'field' }, el('label', {}, 'Color'), swatches,
    el('div', { style: { marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' } },
      el('label', { style: { fontSize: ts(12), color: '#57534e' } }, 'Custom:'), colorInput, isDefault ? '' : resetColor),
    pictured && state.plantLooks ? el('div', { className: 'hint' }, s.colorSet
      ? 'Its picture\'s leaves are drawn in this color. Default color brings back its own colors.'
      : 'Its picture is drawn in its own colors. A color you pick here draws its leaves.') : '')];
  // Opacity (not for outlines; sun exposure with a record is shaded by its sun hours)
  if (!(s.role === 'boundary' || (s.type === 'line' && !s.pathWidth) || s.type === 'text' || (s.role === 'shade' && s.sun))) {
    const opacityVal = s.opacity !== undefined ? s.opacity : 0.65;
    const rangeInput = el('input', { type: 'range', min: '0.05', max: '1', step: '0.05', value: opacityVal });
    const opacityPct = el('span', { style: { fontSize: ts(12), color: '#78716c' } }, Math.round(opacityVal * 100) + '%');
    rangeInput.addEventListener('input', e => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      updateSelectedSilent({ opacity: v });
      opacityPct.textContent = Math.round(v * 100) + '%';
      lookSum.lastChild!.textContent = ` ${Math.round(v * 100)}%`;
    });
    lookParts.push(el('div', { className: 'field' },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } }, el('label', {}, 'Opacity'), opacityPct),
      rangeInput,
      el('div', { className: 'hint' }, 'Lower opacity is useful for background features like tree shade.')));
  }
  body.appendChild(section('look', 'Look', lookSum, lookParts));

  body.appendChild(actionRow(true));
  return body;
}

/** Arrange · Duplicate · Delete, in one row. */
/** Arrange · Duplicate (Place more, for a plant) · Delete, in one row. */
function actionRow(single: boolean): HTMLElement {
  const row = el('div', { className: 'action-row' });
  if (single) {
    const arrangeBtn = el('button', { className: 'btn ghost', html: I.layers + '<span>Arrange</span>', title: 'Arrange layer order' });
    arrangeBtn.addEventListener('click', () => { state.panel = 'arrange'; render(); });
    row.appendChild(arrangeBtn);
  }
  // More of the same plant is placed tap by tap (a tree drawn), which beats copying and dragging.
  const more = moreOfSame(getSelected(), false);
  if (more) {
    const b = el('button', { className: 'btn secondary', 'data-testid': 'place-more', html: I.plus + `<span>${more.tree ? 'Draw another' : 'Place more'}</span>`, title: more.title });
    b.addEventListener('click', () => { more.start(); render(); });
    row.appendChild(b);
  } else {
    const dupBtn = el('button', { className: 'btn ghost', html: I.copy + '<span>Duplicate</span>' });
    dupBtn.addEventListener('click', () => { duplicateSelected(); render(); });
    row.appendChild(dupBtn);
  }
  const delBtn = el('button', { className: 'btn danger', html: I.trash + '<span>Delete</span>' });
  delBtn.addEventListener('click', () => { deleteSelectedAsking(); render(); });
  row.appendChild(delBtn);
  return row;
}
/** The plant to place more of: when everything selected is the same known plant (else null). */
export function placeMorePlant(selected: Shape[]): Plant | null {
  const ids = new Set(selected.map((s) => (s.type === 'circle' && s.role === 'plant' ? s.plantId ?? '' : '')));
  if (ids.size !== 1) return null;
  const id = [...ids][0];
  return (id && plantsById[id]) || null;
}
/** `short`: the button's own words ("Place another", "Another bed"), saying what a tap starts. */
export interface MoreOfSame { title: string; short: string; start: () => void; tree: boolean }
/**
 * Adding more of what's selected, the way it was added: a plant is placed
 * tap by tap; a tree already in the yard is drawn (trunk, then canopy) as the
 * same tree; with `drawn`, anything else drawn (a bed, a fence) starts
 * drawing another of its kind. Null when there's no one thing to add more of.
 */
export function moreOfSame(selected: Shape[], drawn: boolean): MoreOfSame | null {
  if (!selected.length) return null;
  // Existing trees: all the same tree (or all unknown trees).
  if (selected.every((s) => s.type === 'circle' && s.role === 'plant' && s.tree)) {
    const ids = new Set(selected.map((s) => s.plantId ?? ''));
    if (ids.size !== 1) return null;
    const id = [...ids][0];
    const p = id ? plantsById[id] : undefined;
    if (id && !p) return null; // its details aren't on this device
    return { title: `Draw another ${p ? p.common : 'tree'}`, short: 'Draw another', start: () => startTreeDraw(p?.id), tree: true };
  }
  const p = placeMorePlant(selected);
  if (p) return { title: `Place more ${p.common}`, short: selected.length === 1 ? 'Place another' : 'Place more', start: () => startPlacing(p), tree: false };
  if (!drawn || selected.length !== 1) return null;
  const kind = kindOfShape(selected[0]);
  const what = kind === 'plain' ? typeName(selected[0].type) : kind ? kindDef(kind).label.toLowerCase() : '';
  return kind ? { title: `Add another: ${kindDef(kind).label}`, short: `Another ${what}`, start: () => startKind(kind), tree: false } : null;
}
/** A tree's trunk: in proportion to the canopy unless set by hand; a shaped canopy can be made round again. */
function trunkFields(s: CircleShape): Node[] {
  const t = el('input', { type: 'number', step: '0.25', min: String(MIN_TRUNK), max: String(MAX_TRUNK), inputMode: 'decimal', placeholder: String(trunkDiameter({ ...s, trunk: undefined })), value: s.trunk ?? '', 'data-testid': 'trunk-size' }) as HTMLInputElement;
  const value = () => { const v = parseFloat(t.value.replace(',', '.')); return v >= MIN_TRUNK && v <= MAX_TRUNK ? v : null; };
  t.addEventListener('input', () => { const v = value(); if (v != null) updateSelectedSilent({ trunk: v }); });
  t.addEventListener('change', () => {
    if (!t.value.trim()) updateSelectedSilent({ trunk: undefined }); // back to in proportion
    else if (value() == null) t.value = String(s.trunk ?? '');
  });
  const out: Node[] = [el('div', { className: 'field', style: { marginTop: '8px' } }, el('label', {}, 'Trunk (ft across)'), t,
    el('div', { className: 'hint' }, 'Leave empty to keep it in proportion to the canopy.')), ...branchFields(s)];
  return out;
}
/**
 * A tree's height and how high its lowest branches are: what can grow under it (src/crowding.ts). Empty, each
 * says what's taken instead, and from where.
 */
function branchFields(s: CircleShape): Node[] {
  const p = s.plantId ? plantsById[s.plantId] : undefined;
  const r = p ? plantSpread(p, 'typical') / 2 : s.radius;
  const auto = treeBranches({ ...s, treeHeight: undefined, lowestBranch: undefined }, p, r);
  // What the tree's lowest branches are taken as, empty: from its height as set by hand, if it is.
  const lowestFor = (treeHeight: number | undefined) => treeBranches({ ...s, treeHeight, lowestBranch: undefined }, p, r).lowest;
  const show = (v: number | undefined) => (v != null ? String(round1(v)) : '');
  const heightNow = () => { const v = parseFloat(height.value.replace(',', '.')); return v >= 1 && v <= MAX_TREE_HEIGHT ? v : auto.height; };
  const field = (key: 'treeHeight' | 'lowestBranch', placeholder: string, testid: string, ok: (v: number) => boolean, onValue?: (v: number | undefined) => void) => {
    const input = el('input', { type: 'number', step: '1', min: '0', max: String(MAX_TREE_HEIGHT), inputMode: 'decimal', placeholder, value: s[key] ?? '', 'data-testid': testid }) as HTMLInputElement;
    const value = () => { const v = parseFloat(input.value.replace(',', '.')); return ok(v) ? v : null; };
    input.addEventListener('input', () => { const v = value(); if (v != null) { updateSelectedSilent({ [key]: v }); onValue?.(v); } });
    input.addEventListener('change', () => {
      if (!input.value.trim()) { updateSelectedSilent({ [key]: undefined }); onValue?.(undefined); } // back to what's worked out
      else if (value() == null) input.value = String(s[key] ?? '');
    });
    return input;
  };
  // (Placeholders only change as the height is typed: nothing re-renders, so the keyboard stays.)
  const height: HTMLInputElement = field('treeHeight', show(auto.height), 'tree-height', (v) => v >= 1 && v <= MAX_TREE_HEIGHT,
    (v) => { lowest.placeholder = show(lowestFor(v)); });
  const lowest: HTMLInputElement = field('lowestBranch', show(lowestFor(s.treeHeight)), 'lowest-branch', (v) => v >= 0 && v < (heightNow() ?? MAX_TREE_HEIGHT));
  const heightHint = auto.heightFrom === 'plant' ? 'Leave empty for its typical height, from the plant; set it to the tree you have.'
    : p ? 'Not known: taken as about as tall as the plant is wide. Set it for a truer picture of what grows under it.'
    : 'Not known: taken as about as tall as it\'s drawn wide. Set it for a truer picture of what grows under it.';
  const lowestHint = auto.lowestFrom === 'screen'
    ? 'Leave empty: an evergreen screen keeps its branches to the ground, so nothing grows under it (NC State lists it as an evergreen hedge or screen).'
    : 'Leave empty for a third of its height, the most its lower limbs can be taken up (live branches kept on the upper two thirds). 0: branches to the ground. Below its height.';
  return [
    el('div', { className: 'field' }, el('label', {}, 'Height (ft)'), height, el('div', { className: 'hint' }, heightHint)),
    el('div', { className: 'field' }, el('label', {}, 'Lowest branches (ft up)'), lowest, el('div', { className: 'hint' }, lowestHint)),
  ];
}
/** A shaped canopy back to a circle (also offered if it stopped being a tree). */
function makeRoundField(s: CircleShape): HTMLElement {
  const round = el('button', { className: 'btn ghost', 'data-testid': 'make-round' }, 'Make the canopy round');
  round.disabled = isLocked(s);
  round.addEventListener('click', () => updateSelected({ canopy: undefined }));
  return el('div', { className: 'field' }, round, el('div', { className: 'hint' }, 'Drops the drawn outline, keeping the widest spread.'));
}

/** For circles: which plant this is (size range, reset, edit), or a way to make it one. */
function plantLinkSection(s: CircleShape): HTMLElement {
  const wrap = el('div', { className: 'field', 'data-testid': 'plant-link' });
  const p = s.plantId ? plantsById[s.plantId] : undefined;
  if (!p && s.role && s.role !== 'plant' && s.role !== 'other') return wrap; // a pond or a tree trunk isn't a plant to link
  if (!p) {
    const link = el('button', { className: 'btn ghost' }, s.plantId ? 'Link to a plant again…' : 'Link to a plant…');
    // (The search starts at the circle's label: a plan drawn before the catalog usually names its plants.)
    link.addEventListener('click', () => { state.pickerLinkId = s.id; state.pickerLinkAlso = []; state.pickerLinkLocked = false; plantFilter.q = s.label?.trim() ?? ''; state.panel = 'plants'; render(); });
    wrap.appendChild(link);
    wrap.appendChild(el('div', { className: 'hint' }, s.plantId
      ? "This plant's details aren't on this device (removed from My plants, or the plan came from someone else). Its size and name are kept."
      : 'Pick the plant this circle stands for: it takes the plant\'s size and sun needs, and shows in the plant list.'));
    return wrap;
  }
  // Just linked: other circles that had the same label, offered for the same plant in one tap; locked ones
  // are asked about separately (left as they are unless you say so).
  const offer = state.linkOffer;
  if (offer && offer.fromId === s.id && offer.plantId === p.id && state.selectedIds.length === 1 && state.selectedIds[0] === s.id) {
    // (Checked again now, and when tapped: each still unlinked, on view and labeled the same.)
    const current = () => {
      const open = new Set(unlinkedWithLabel(offer.label, [s.id])), shut = new Set(unlinkedWithLabel(offer.label, [s.id], { locked: true }));
      return { open: [...offer.ids, ...offer.locked].filter((id) => open.has(id)), shut: [...offer.ids, ...offer.locked].filter((id) => shut.has(id)) };
    };
    const { open, shut } = current();
    if (open.length || shut.length) {
      const n = open.length + shut.length;
      const what = `${n} other circle${n === 1 ? ' is' : 's are'} labeled \u201c${offer.label}\u201d` + (shut.length ? (open.length ? ` (${shut.length} of them locked).` : (shut.length === 1 ? ', and it\u2019s locked.' : ', all locked.')) : '.');
      const box = el('div', { className: 'banner link-offer', role: 'status', 'data-testid': 'link-offer' }, el('div', {}, what));
      const go = (withLocked: boolean) => {
        const now = current();
        const k = linkShapesToPlant(withLocked ? [...now.open, ...now.shut] : now.open, p);
        state.linkOffer = null;
        toast(`${k} more circle${k === 1 ? '' : 's'} linked to ${p.common}.`);
        render();
      };
      const row = el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' } });
      if (open.length) {
        const yes = el('button', { className: 'btn secondary', 'data-testid': 'link-offer-yes' }, shut.length ? `Link the ${open.length} unlocked to ${p.common}` : `Link ${open.length === 1 ? 'it' : `all ${open.length}`} to ${p.common}`);
        yes.addEventListener('click', () => go(false));
        row.appendChild(yes);
      }
      if (shut.length) {
        const all = el('button', { className: 'btn ' + (open.length ? 'ghost' : 'secondary'), 'data-testid': 'link-offer-locked' }, open.length ? `Link all ${n}, locked too` : `Link ${shut.length === 1 ? 'it' : 'them'} anyway`);
        all.addEventListener('click', () => go(true));
        row.appendChild(all);
      }
      const no = el('button', { className: 'btn ghost', 'data-testid': 'link-offer-no' }, 'No thanks');
      no.addEventListener('click', () => { state.linkOffer = null; render(); });
      row.appendChild(no);
      box.appendChild(row);
      wrap.appendChild(box);
    }
  }
  const sizes = `Spread ${formatSize(p.width as Range | undefined) || 'unknown'}. ` + (s.sizeFrom === 'manual'
    ? 'Drawn at the size it was given' + (s.tree ? ' (a tree as it is now)' : '') + (fullRingRadius(s) ? '; the dashed ring, when it\u2019s selected, is its full size.' : '.')
    : `Drawn at ${state.sizeMode === 'full' ? 'full' : 'typical'} size (change in Layers).`);
  wrap.appendChild(el('div', { className: 'hint' }, sizes));
  const zones = zoneRange(p);
  if (zones) {
    const fit = zoneFit(p, state.location);
    const z = state.location?.zone;
    wrap.appendChild(el('div', { className: 'hint' + (fit && fit !== 'fits' ? ' zone-warn' : ''), 'data-testid': 'plant-zones' },
      `Hardy in ${zones}.` + (!state.location ? ' (Set the garden’s ZIP in ⋮ → Garden location to check.)'
        : fit === 'fits' ? ` Fine for zone ${z}.`
        : fit === 'edge-cold' ? ` Zone ${z} is at the cold edge of its range: give it a sheltered spot and mulch its roots for winter.`
        : fit === 'edge-warm' ? ` Zone ${z} is at the warm edge of its range: give it afternoon shade${p.water === 'Low' ? '' : ' and steady water'} in summer.`
        : fit === 'cold' ? ` Zone ${z} winters are colder than it’s rated for.`
        : ` Zone ${z} is warmer than it’s rated for: it may lack the winter chill or cool summers it needs.`)));
  }
  if (p.unverified) wrap.appendChild(el('div', { className: 'hint', 'data-testid': 'plant-unverified' }, "Unverified: this plant's details come from an earlier list with no sources, and haven't been checked yet."));
  const row = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' } });
  const target = plantRadius(p, state.sizeMode);
  if (s.radius !== target) {
    const reset = el('button', { className: 'btn ghost', style: { flex: '1' } }, `Reset to plant size (${fmt1(target * 2)} ft spread)`);
    reset.addEventListener('click', () => updateSelected({ radius: target, sizeFrom: 'plant' }));
    row.appendChild(reset);
  }
  if (isMine(p)) {
    const edit = el('button', { className: 'btn ghost', style: { flex: '1' } }, `Edit "${p.common}" in My plants`);
    edit.addEventListener('click', () => { state.plantForm = { editId: p.id, place: false }; state.panel = 'plantForm'; render(); });
    row.appendChild(edit);
  }
  if (row.childNodes.length) wrap.appendChild(row);
  return wrap;
}

export function renderPropsPanelMulti(selected: Shape[]) {
  const body = el('div', { className: 'sheet-body' });
  body.appendChild(el('div', { className: 'banner' },
    selected.length + ' shapes selected. Use the buttons below to act on all of them. Edit individual properties one at a time.'));

  const roles = new Set(selected.map(roleKey));
  body.appendChild(whatItIs(state.selectedIds.slice(), roles.size === 1 ? [...roles][0] : null, true));
  const withStatus = selected.filter(hasStatus);
  if (withStatus.length) body.appendChild(section('status', 'Status', document.createTextNode(statusSummary(withStatus)), [statusSection(withStatus)]));

  // Circles that could all be one plant: link them at once (a plan drawn before the catalog). Locked circles
  // are left as they are unless chosen too; it's offered where some aren't plants yet.
  const unlocked = selected.filter((s) => !isLocked(s));
  if (selected.length > 1 && selected.every(canLinkToPlant) && selected.some((s) => s.type === 'circle' && !s.plantId)) {
    const open = (shapes: Shape[], withLocked: boolean) => {
      const labels = new Set(shapes.map((s) => (s.label ?? '').trim().toLowerCase()));
      state.pickerLinkId = shapes[0].id;
      state.pickerLinkAlso = shapes.slice(1).map((s) => s.id);
      state.pickerLinkLocked = withLocked;
      plantFilter.q = labels.size === 1 ? (shapes[0].label ?? '').trim() : '';
      state.panel = 'plants';
      render();
    };
    const locked = selected.length - unlocked.length;
    if (unlocked.some((s) => s.type === 'circle' && !s.plantId) && (unlocked.length > 1 || !locked)) {
      const link = el('button', { className: 'btn secondary', 'data-testid': 'link-all' }, locked ? `Link the ${unlocked.length} unlocked to a plant\u2026` : `Link all ${unlocked.length} to a plant\u2026`);
      link.addEventListener('click', () => open(unlocked, false));
      body.appendChild(link);
    }
    if (locked) {
      const all = el('button', { className: 'btn ghost', 'data-testid': 'link-all-locked' }, `Link all ${selected.length}, locked too\u2026`);
      all.addEventListener('click', () => open(selected, true));
      body.appendChild(all);
    }
    const relinked = selected.filter((s) => s.type === 'circle' && s.plantId).length;
    if (relinked) body.appendChild(el('div', { className: 'hint', 'data-testid': 'link-all-note' }, `${relinked} of them ${relinked === 1 ? 'is' : 'are'} linked to a plant already and will change too.`));
  }

  // More of the same plant, then duplicate, copy, delete
  const more = moreOfSame(selected, false);
  if (more) {
    const b = el('button', { className: 'btn secondary', 'data-testid': 'place-more', html: I.plus + `<span style="margin-left:6px">${escapeHtml(more.title)}</span>` });
    b.addEventListener('click', () => { more.start(); render(); });
    body.appendChild(b);
  }
  const dupBtn = el('button', { className: 'btn ghost', html: I.copy + '<span style="margin-left:6px">Duplicate</span>' });
  dupBtn.addEventListener('click', () => { duplicateSelected(); render(); });
  const copyBtn = el('button', { className: 'btn ghost', html: I.copy + '<span style="margin-left:6px">Copy to clipboard</span>' });
  copyBtn.addEventListener('click', () => { copySelected(); alert(selected.length + ' shapes copied. Use Paste in any project to bring them in.'); });
  const delBtn = el('button', { className: 'btn danger', html: I.trash + '<span style="margin-left:6px">Delete all</span>' });
  delBtn.addEventListener('click', () => { deleteSelectedAsking(); render(); });
  body.appendChild(dupBtn);
  body.appendChild(copyBtn);
  body.appendChild(delBtn);

  return body;
}

/**
 * The sheet's title names the thing, as people call it: its label ("House", "Chinquapin oak"), else what it is
 * ("Bed", "Path", "Note"), else its shape ("Rectangle"), never "Rectangle properties".
 */
export function sheetTitle(s: Shape): string {
  if (s.type === 'text') return 'Note';
  if (s.label.trim()) return s.label.trim();
  if (s.type === 'line' && s.pathWidth) return 'Path';
  const k = kindOfShape(s);
  if (k && k !== 'plain') return kindDef(k).label;
  if (s.role === 'plant') return 'Plant';
  const t = typeName(s.type);
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function renderPropsPanel() {
  const selected = getSelected();
  if (selected.length === 0) return null;
  const single = selected.length === 1 ? selected[0] : null;
  const title = single ? sheetTitle(single) : selected.length + ' shapes selected';

  // Header
  const header = el('div', { className: 'sheet-header' });
  header.appendChild(el('div', { className: 'title' }, title));
  const headerRight = el('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } });
  if (single) {
    const lockBtn = el('button', {
      className: 'lockbtn ' + (single.locked ? 'on' : 'off'),
      html: (single.locked ? I.lock : I.unlock) + '<span style="margin-left:6px">' + (single.locked ? 'Locked' : 'Unlocked') + '</span>'
    });
    lockBtn.addEventListener('click', () => updateSelected({ locked: !single.locked }));
    headerRight.appendChild(lockBtn);
  } else {
    // Several: the same toggle, in the same place (Jason, 2026-10-25). All locked reads Locked and unlocks them; none,
    // Unlocked; some, how many, and locks the rest.
    const n = selected.filter((s) => s.locked).length, all = n === selected.length;
    const says = all ? 'Locked' : n ? `${n} of ${selected.length} locked` : 'Unlocked';
    const does = all ? 'Unlock all' : n ? `Lock all (${says})` : 'Lock all';
    const lockBtn = el('button', {
      className: 'lockbtn ' + (all ? 'on' : n ? 'some' : 'off'), 'data-testid': 'lock-all', title: does, 'aria-label': does,
      html: (all ? I.lock : I.unlock) + '<span style="margin-left:6px">' + says + '</span>',
    });
    lockBtn.addEventListener('click', () => { setLockedForIds(state.selectedIds, !all); render(); });
    headerRight.appendChild(lockBtn);
  }
  const closeBtn = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' });
  closeBtn.addEventListener('click', () => { state.panel = null; render(); });
  headerRight.appendChild(closeBtn);
  header.appendChild(headerRight);

  const body = single ? renderPropsPanelSingle(single) : renderPropsPanelMulti(selected);
  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

export function renderArrangePanel() {
  const s = singleSelected();
  if (!s) return null;
  const i = state.shapes.findIndex(sh => sh.id === s.id);
  const canFwd = findNextSameTier(state.shapes, i, 1) !== -1;
  const canBack = findNextSameTier(state.shapes, i, -1) !== -1;
  const grid = el('div', { className: 'arrange-grid' });
  const front = el('button', { html: I.arrangeFront + '<span>Bring to front</span>' });
  front.disabled = !canFwd;
  front.addEventListener('click', () => { bringToFront(s.id); state.panel = 'props'; render(); });
  const fwd = el('button', { html: I.arrangeForward + '<span>Bring forward</span>' });
  fwd.disabled = !canFwd;
  fwd.addEventListener('click', () => { bringForward(s.id); state.panel = 'props'; render(); });
  const back = el('button', { html: I.arrangeBackward + '<span>Send backward</span>' });
  back.disabled = !canBack;
  back.addEventListener('click', () => { sendBackward(s.id); state.panel = 'props'; render(); });
  const toBack = el('button', { html: I.arrangeBack + '<span>Send to back</span>' });
  toBack.disabled = !canBack;
  toBack.addEventListener('click', () => { sendToBack(s.id); state.panel = 'props'; render(); });
  grid.appendChild(front);
  grid.appendChild(fwd);
  grid.appendChild(back);
  grid.appendChild(toBack);
  const backBtn = el('button', { className: 'btn ghost' }, '← Back to properties');
  backBtn.addEventListener('click', () => { state.panel = 'props'; render(); });
  const body = el('div', { className: 'sheet-body' },
    el('div', { className: 'hint', style: { fontSize: ts(13), color: '#57534e' } },
      s.locked ? 'Reorders within the locked (background) layer. Locked shapes always render behind unlocked ones.' :
      'Reorders within the unlocked layer. Locked shapes always render behind these.'),
    grid,
    backBtn
  );
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Arrange layer order'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
  );
  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = 'props'; render(); } });
  return overlay;
}
