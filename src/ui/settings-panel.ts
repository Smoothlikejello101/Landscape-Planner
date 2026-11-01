// Settings: every setting of this device in one sheet, from ⋮ (Jason, Oct 31, from round 3: Bea found them
// scattered, zoom buttons and drawing in Layers, text size at the foot of ⋮). Text size and the plan's label size;
// drawing (snap, square, zoom buttons); warnings, with every warning in the plan now. Layers keeps the plan's own
// view: background, layers shown and locked, plant size, which plants show, the shapes.
//
// A notice's "Settings" opens here, at Warnings, its switch in view (openWarningsAt).

import { crowdOptions } from '../crowd-here';
import { BULB_PARTNER_MIN_HEIGHT, crowdLevels } from '../crowding';
import { el, ts } from '../dom';
import { I } from '../icons';
import { LABEL_SIZES, labelSize, setLabelSize } from '../label-size';
import { centerOnShape, setRoleView, setViewFilter } from '../mutations';
import { plantsById } from '../plants';
import { roleHidden, roleKey } from '../roles';
import { state } from '../state';
import { passesFilter, shownWith } from '../status';
import { save } from '../storage';
import { setSnapOn, setSquareOn, snapOn, squareOn } from '../tidy';
import { setTextSize, textSize, TEXT_SIZES } from '../text-size';
import { setCrowdWarnings, setFruitWarnings, setHardyWarnings, setPoisonWarnings, setShowCrowding, setZoomButtons } from '../view-settings';
import { acrossPlan, countSaid, KIND_WORDS, planWarnings, setDismissed, WARNING_KINDS, type WarningKind, type WarningRow } from '../warnings-list';
import { household } from '../yard';
import { undoNotice } from './delete-selected';
import { remindNoMore } from './fruit-notice';
import { render } from './render';
import { dismissAcross } from './role-sections';

/** Folds kept open while the app is: Warnings (a notice's Settings opens it), its list, and each kind in the list. */
let warningsOpen = false;
let listOpen = false;
const kindsOpen = new Set<string>();
/** More than this many warnings: folded by kind (Jason: "more than a handful"). */
const HANDFUL = 5;

/** Settings, at Warnings, open, with one of its settings in view and flashed (`testid`): a notice's Settings. */
export function openWarningsAt(testid: string) {
  warningsOpen = true;
  state.panel = 'settings';
  render();
  requestAnimationFrame(() => {
    const n = document.querySelector(`[data-testid=${testid}]`);
    n?.scrollIntoView({ block: 'center' });
    n?.classList.add('flash');
  });
}

export function renderSettingsPanel() {
  const close = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' });
  close.addEventListener('click', () => { state.panel = null; render(); });
  const header = el('div', { className: 'sheet-header' }, el('div', { className: 'title' }, 'Settings'), close);
  const body = el('div', { 'data-testid': 'settings' }, textSection(), drawingSection(), warningsSection(),
    el('div', { className: 'hint', style: { padding: '10px 16px 16px' } },
      'Settings of this device: a phone and a computer can differ. Sun warnings, and the warnings left or dismissed, are kept with the plan.'));
  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

/** A label size's mark: a plant's green circle with an A in it, at that size (Jason's idea). */
function labelMark(scale: number): string {
  const r = Math.round(11 * scale), size = 2 * r + 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="#bbf7d0" stroke="#15803d" stroke-width="1.5"/>` +
    `<text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(13 * scale)}" font-weight="700" fill="#14532d">A</text></svg>`;
}

/** Text size (the app's) and label size (the plan's names), two settings (Jason, Oct 31). */
function textSection(): HTMLElement {
  const wrap = el('div', { className: 'role-rows', 'data-testid': 'text-settings' }, el('div', { className: 'section-label' }, 'Text'));
  // Text size: four A's, each at its size. A change shows at once.
  const seg = el('div', { className: 'seg', role: 'group', 'aria-label': 'Text size' });
  for (const s of TEXT_SIZES) {
    const b = el('button', { 'aria-pressed': String(textSize() === s.key), 'aria-label': s.name, title: s.name, 'data-testid': `text-size-${s.key}`, style: { fontSize: `${14 * s.scale}px` } }, 'A');
    b.addEventListener('click', () => { setTextSize(s.key); render(); });
    seg.appendChild(b);
  }
  wrap.appendChild(el('div', { className: 'text-size-row', 'data-testid': 'text-size' }, el('span', {}, 'Text size'), seg));
  // The plan's names: three green circles, each with its A at that size.
  const labels = el('div', { className: 'seg label-seg', role: 'group', 'aria-label': 'Label size on the plan' });
  for (const s of LABEL_SIZES) {
    const b = el('button', { 'aria-pressed': String(labelSize() === s.key), 'aria-label': `${s.name} labels`, title: `${s.name} labels`, 'data-testid': `label-size-${s.key}`, html: labelMark(s.scale) });
    b.addEventListener('click', () => { setLabelSize(s.key); render(); });
    labels.appendChild(b);
  }
  wrap.appendChild(el('div', { className: 'text-size-row', 'data-testid': 'label-size' }, el('span', {}, 'Names on the plan'), labels));
  wrap.appendChild(el('div', { className: 'hint' },
    'Text size is the app’s menus and sheets. Names on the plan are sized apart: bigger names fit inside fewer plants, so more show only when selected or zoomed in.'));
  return wrap;
}

/** Drawing: tidying what's drawn (src/tidy.ts), and the zoom buttons. */
function drawingSection(): HTMLElement {
  const wrap = el('div', { className: 'role-rows', 'data-testid': 'drawing-settings' }, el('div', { className: 'section-label' }, 'Drawing'));
  const check = (testid: string, on: boolean, set: (v: boolean) => void, text: string) => {
    const box = el('input', { type: 'checkbox', 'data-testid': testid }) as HTMLInputElement;
    box.checked = on;
    box.addEventListener('change', () => set(box.checked));
    wrap.appendChild(el('label', { className: 'check-row' }, box, el('span', {}, text)));
  };
  check('snap-drawing', snapOn(), setSnapOn, 'Snap to nearby edges and corners');
  check('square-drawing', squareOn(), setSquareOn, 'Square nearly-square outlines');
  // The + and − buttons: off on a phone to start (a pinch zooms), for zooming with one finger (src/view-settings.ts).
  check('zoom-buttons', state.zoomButtons, (v) => { setZoomButtons(v); render(); }, 'Zoom buttons (+ and −), to zoom with one finger');
  wrap.appendChild(el('div', { className: 'hint' },
    'A snapped point lights up the edge it\'s on, with an Unsnap; squaring says so after, with an Undo.'));
  return wrap;
}

/**
 * Crowding (decided with Jason, 2026-10-25): rings on the plan, amber where plants are close (their typical spreads
 * touch) and red where they're crowded; a notice as one is placed too close (the pairs flagged, and those left close on
 * purpose, are in "In this plan now"). A crowding notice's "Crowding settings…" opens here.
 */
function crowdingSettings(): HTMLElement {
  const wrap = el('div', { 'data-testid': 'crowding-settings', className: 'crowding-settings' });
  const levels = [...crowdLevels(state.shapes.filter((x) => shownWith(x, state.viewFilter)), plantsById, crowdOptions()).values()];
  // (Plants counted, said so: beside a count of pairs, "Leave all flagged now (2 pairs)" then, "3 close" read as a count
  // of the same thing. Round 3: Alex, Dana, Bea.)
  const nClose = levels.filter((l) => l === 'close').length, nCrowded = levels.filter((l) => l === 'crowded').length;
  const show = el('input', { type: 'checkbox', 'data-testid': 'show-crowding' }) as HTMLInputElement;
  show.checked = state.showCrowding;
  show.addEventListener('change', () => { setShowCrowding(show.checked); render(); });
  wrap.appendChild(el('label', { className: 'check-row', style: { marginTop: '6px' } }, show,
    el('span', {}, `Show crowding on the plan: amber rings where plants are close, red where they're crowded (${nClose + nCrowded ? `plants now: ${nClose} close, ${nCrowded} crowded` : 'none now'})`)));
  const warn = el('input', { type: 'checkbox', 'data-testid': 'crowd-warnings' }) as HTMLInputElement;
  warn.checked = state.crowdWarnings;
  warn.addEventListener('change', () => { setCrowdWarnings(warn.checked); render(); });
  wrap.appendChild(el('label', { className: 'check-row', style: { marginTop: '6px' } }, warn,
    el('span', {}, 'Warn me as I place a plant close to another')));
  // (Everything flagged now, left close at once (a plan drawn before the warnings: Jason, 2026-10-27), and the pairs left
  // close flagged again: since Nov 1, the Crowding warnings' Dismiss all and Show all again in "In this plan now",
  // above, one pair of buttons rather than two (the review of Settings → Warnings).)
  wrap.appendChild(el('div', { className: 'hint' },
    'Usual spacing is half of each plant\'s typical spread added together, less where one grows under a tree whose lower limbs can be taken up. ' +
    `Close is where their typical spreads touch; crowded, closer than three quarters of that. Spring bulbs under a deciduous plant ${BULB_PARTNER_MIN_HEIGHT} ft or taller don't count, except right at its base.`));
  return wrap;
}

/** A fold that stays as it was left (`open`, and `set` when it changes). */
function fold(className: string, testid: string, open: boolean, set: (v: boolean) => void, summaryClass: string, ...summary: (Node | string)[]): HTMLDetailsElement {
  const d = el('details', { className, 'data-testid': testid }) as HTMLDetailsElement;
  d.open = open;
  d.addEventListener('toggle', () => set(d.open));
  d.appendChild(el('summary', { className: summaryClass }, ...summary));
  return d;
}

/**
 * Every kind of warning in one place, folded (Jason, Oct 30: "a 'warning settings' panel/collapsed section to house
 * everything to do with warnings", a switch for each): crowding, sun, hardiness, poison to who's in the yard, fruit
 * partners. Then every warning in the plan now (warningList).
 */
function warningsSection(): HTMLElement {
  const kinds = [state.showCrowding || state.crowdWarnings, state.sunWarnings, state.hardyWarnings, state.poisonWarnings, state.fruitWarnings];
  const on = kinds.filter(Boolean).length;
  const d = fold('role-rows warnings-fold', 'warnings', warningsOpen, (v) => { warningsOpen = v; }, 'section-label', 'Warnings',
    el('span', { className: 'count' }, on === kinds.length ? ' · all on' : ` · ${on} of ${kinds.length} kinds on`));
  if (state.shapes.some((s) => s.role === 'plant')) d.appendChild(warningList());
  d.appendChild(crowdingSettings());
  const row = (testid: string, checked: boolean, set: (on: boolean) => void, text: string) => {
    const cb = el('input', { type: 'checkbox', 'data-testid': testid }) as HTMLInputElement;
    cb.checked = checked;
    cb.addEventListener('change', () => { set(cb.checked); render(); });
    return el('label', { className: 'check-row', style: { marginTop: '8px' } }, cb, el('span', {}, text));
  };
  d.appendChild(row('sun-warnings', state.sunWarnings, (v) => { state.sunWarnings = v; save(); },
    'Sun: a ⚠ triangle badge where a plant gets more or less sun than it wants (in a sun area you recorded; this plan)'));
  d.appendChild(row('hardy-warnings', state.hardyWarnings, setHardyWarnings,
    state.location ? `Hardiness: a warning as I place a plant too cold or too warm for zone ${state.location.zone}, and a round ❄ or ☀ badge on it`
      : 'Hardiness: a warning as I place a plant too cold or too warm where the garden is, and a badge on it (once a ZIP is set)'));
  const y = household();
  const who = [y.kids ? 'kids' : '', y.dogs ? 'dogs' : '', y.cats ? 'cats' : '', y.horses ? 'horses' : ''].filter(Boolean);
  d.appendChild(row('poison-warnings', state.poisonWarnings, setPoisonWarnings,
    who.length ? `Poison: a square badge on plants that are a problem for the ${who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who.at(-1)}` : who[0]} in the yard, in lists and on the plan`
      : "Poison: badges on plants that are a problem for who's in the yard (set in the plant picker's Filters, Poison & pets)"));
  d.appendChild(row('fruit-warnings', state.fruitWarnings, setFruitWarnings,
    'Fruit partners: a notice as I place a plant that needs a partner to fruit (male and female plants, or a second variety), until the plan has one'));
  return d;
}

/**
 * Every warning in the plan now (src/warnings-list.ts), folded with its count (Jason, Oct 31: "x active, y
 * dismissed"); more than a handful, folded again by kind. Active above dismissed. A tap on one selects its plants on
 * the plan; an active one can be dismissed, a dismissed one shown again, and a kind all at once (Jason, Nov 1).
 *
 * A kind's "Dismiss all 3" and "Show all 2 again" go under its rows (the review of Settings → Warnings, Nov 1): folded
 * by kind, at the foot of its fold. In a handful, one list as Jason had it (not grouped by kind), with a line under it
 * for each kind that has them. Either way, only where they'd do more than one row's own button does: a kind's one
 * warning has its Dismiss or Show again right there, and "Dismiss all 1" would say nothing more.
 */
function warningList(): HTMLElement {
  const rows = planWarnings();
  const d = fold('warnings-now', 'warnings-now', listOpen, (v) => { listOpen = v; }, '', 'In this plan now', el('span', { className: 'count' }, ` · ${countSaid(rows)}`));
  if (!rows.length) {
    d.appendChild(el('div', { className: 'hint' }, 'No warnings in the plan now, of the kinds switched on below.'));
    return d;
  }
  const activeFirst = (r: WarningRow[]) => [...r.filter((x) => !x.dismissed), ...r.filter((x) => x.dismissed)];
  if (rows.length <= HANDFUL) {
    for (const r of activeFirst(rows)) d.appendChild(warningRow(r));
    // (Set apart from the rows by a rule, so they don't read as the last row's: Jason, Nov 1, on the mock-ups.)
    const block = el('div', { className: 'warnings-all-block' });
    for (const { kind, name } of WARNING_KINDS) {
      const all = kindButtons(kind, rows.filter((r) => r.kind === kind));
      if (all) block.appendChild(el('div', { className: 'warnings-all', 'data-testid': `warnings-all-${kind}` }, el('span', { className: 'warnings-all-name' }, `${name}:`), ...all));
    }
    if (block.firstChild) d.appendChild(block);
    return d;
  }
  for (const { kind, name } of WARNING_KINDS) {
    const these = rows.filter((r) => r.kind === kind);
    if (!these.length) continue;
    const k = fold('warnings-kind', `warnings-kind-${kind}`, kindsOpen.has(kind), (v) => { if (v) kindsOpen.add(kind); else kindsOpen.delete(kind); }, '', name, el('span', { className: 'count' }, ` · ${countSaid(these)}`));
    for (const r of activeFirst(these)) k.appendChild(warningRow(r));
    const all = kindButtons(kind, these);
    // (Under a rule and a heading, "All 3 hardiness warnings", so they don't read as the last row's: Jason, Nov 1, on
    // the mock-ups.)
    if (all) {
      k.appendChild(el('div', { className: 'warnings-all under', 'data-testid': `warnings-all-${kind}`, role: 'group', 'aria-label': `All ${KIND_WORDS[kind]} warnings` },
        el('span', { className: 'warnings-all-head', 'aria-hidden': 'true' }, `All ${these.length} ${KIND_WORDS[kind]} warnings`), ...all));
    }
    d.appendChild(k);
  }
  return d;
}

/**
 * A kind's "Dismiss all 3", with more than one active, and "Show all 2 again", with more than one dismissed: one step
 * each, with a notice saying what it did and an Undo (Jason, Nov 1). Null with neither.
 */
function kindButtons(kind: WarningKind, these: WarningRow[]): HTMLElement[] | null {
  const on = these.filter((r) => !r.dismissed && r.dismiss), off = these.filter((r) => r.dismissed && r.again);
  const word = KIND_WORDS[kind];
  const out: HTMLElement[] = [];
  const button = (testid: string, text: string, rows: WarningRow[], dismissed: boolean) => {
    const b = el('button', { className: 'link-btn', 'data-testid': testid }, text);
    b.addEventListener('click', () => {
      const { n, takeBack } = setDismissed(rows, dismissed);
      render();
      if (!n) return;
      const many = `${n} ${word} warning${n === 1 ? '' : 's'}`;
      // (What each kind's dismissal says: crowding, as Leave all flagged now did, that new plants are still flagged;
      // across the plan, that the plants' copies added later are quiet too, as the pane says.)
      undoNotice(!dismissed ? `Showing ${many} again`
        : kind === 'crowding' ? `Dismissed ${many}, the pairs left close on purpose. Plants placed from now on are still flagged.`
        : `Dismissed ${many}${acrossPlan(kind) ? ', for those plants added later too' : ''}`, takeBack);
    });
    out.push(b);
  };
  // (One vocabulary, Dismiss and Show again, so not Jason's "Reactivate all": the review of Settings → Warnings, Nov 1.)
  if (on.length > 1) button('warnings-dismiss-all', `Dismiss all ${on.length}`, on, true);
  if (off.length > 1) button('warnings-again-all', `Show all ${off.length} again`, off, false);
  return out.length ? out : null;
}

/** Its plants selected and in view, shown if hidden or filtered out (as a Layers row does). */
/**
 * Select these shapes on the plan and bring the first into view, showing any a layer or the plants shown hid; the
 * sheet closes (a warning's row; a row of what's in bloom, src/ui/year-bar.ts, where the month stays).
 */
export function showOnPlan(ids: string[]) {
  const shapes = ids.map((id) => state.shapes.find((s) => s.id === id)).filter((s) => !!s);
  if (!shapes.length) return;
  for (const s of shapes) {
    if (roleHidden(s)) setRoleView(roleKey(s), { hidden: false });
    if (!passesFilter(s, state.viewFilter)) setViewFilter({ status: '', phase: '', showGone: s.status === 'gone' });
  }
  state.selectedIds = shapes.map((s) => s.id);
  centerOnShape(shapes[0].id);
  state.panel = null;
  render();
}

function warningRow(r: WarningRow): HTMLElement {
  // (A dismissed one says who for: this one, this pair, or every one of the plant in the plan. The review, Nov 1.)
  const scope = r.dismissed ? `dismissed${r.scope ? ' ' + r.scope : ''}` : '';
  const words = el('div', { className: 'warning-words', role: 'button', tabIndex: 0, 'data-testid': 'warning-select',
    'aria-label': `${r.name ? r.name + ': ' : ''}${r.said}${scope ? ` (${scope})` : ''}. Select on the plan` },
    ...(r.name ? [el('span', { className: 'warning-name' }, r.name + ':'), ' '] : []), el('span', { className: 'warning-said' }, r.said),
    ...(scope ? [el('span', { className: 'warning-scope', 'data-testid': 'warning-scope' }, scope.charAt(0).toUpperCase() + scope.slice(1))] : []));
  words.addEventListener('click', () => showOnPlan(r.ids));
  words.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showOnPlan(r.ids); } });
  const row = el('div', { className: 'warning-row' + (r.dismissed ? ' dismissed' : ''), 'data-testid': 'warning-row', 'data-kind': r.kind, 'data-dismissed': String(r.dismissed) }, words);
  if (r.dismissed && r.again) {
    const again = el('button', { className: 'link-btn', 'data-testid': 'warning-again' }, 'Show again');
    again.addEventListener('click', () => { setDismissed([r], false); render(); });
    row.appendChild(again);
  }
  // Dismiss, where a dismissed one has Show again (Jason, Nov 1): as the plan's own dismissal for its kind, with what
  // that says. Hardiness and poison, from the plant's pane; fruit partners, the notice's Don't remind me.
  if (!r.dismissed && r.dismiss) {
    const dismiss = el('button', { className: 'link-btn', 'data-testid': 'warning-dismiss' }, 'Dismiss');
    dismiss.addEventListener('click', () => {
      if (r.plantId && (r.kind === 'hardy' || r.kind === 'poison')) dismissAcross(r.kind, r.plantId, r.said);
      else if (r.plantId && r.kind === 'fruit') remindNoMore(r.plantId, r.said);
      else { setDismissed([r], true); render(); }
    });
    row.appendChild(dismiss);
  }
  return row;
}

/** A line in Layers where these used to be: to Settings. */
export function settingsLink(): HTMLElement {
  const b = el('button', { className: 'link-btn', 'data-testid': 'layers-settings', style: { fontSize: ts(14) } }, 'Text size, drawing and warnings: Settings…');
  b.addEventListener('click', () => { state.panel = 'settings'; render(); });
  return el('div', { className: 'role-rows' }, b);
}
