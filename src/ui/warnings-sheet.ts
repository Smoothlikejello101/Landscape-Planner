// Warnings: a plan tool of its own (Jason approved the mock-ups, Nov 1, from the review of Settings → Warnings: filed
// under Settings, five steps from the plan, each kind scattered, with a different verb at every turn).
//
// Ways in: the Warnings button among the plan's side buttons, with its count; "Warnings (12)…" in ⋮; one row in
// Settings, "Warnings: what's checked →"; a notice's Settings, which opens it at its kind (openWarningsAt).
//
// The sheet, top to bottom: "12 to look at · 7 dismissed"; when Layers hides plants, that only those shown are
// checked, with Show all plants; one fold per kind, safety first (Poison, Utilities, Hardiness, Sun, Crowding, Fruit
// partners), each with its count and how many are dismissed, or why it can't run yet with a button to fix that; and
// what goes with the plan. No badge key (Jason: the icons beside the kinds say it). A kind opened: its switch and what
// it checks; its rows, name first, the problem as the plant's details say it, Dismiss or Show again at the right, a
// dismissed one saying who for; under a rule and a heading, "Dismiss all 3" and "Show all 2 again" (#187, from
// Settings); and "How this is worked out", its rule and sources.
//
// Working through it: on a computer it's a panel beside the plan that stays open while its rows select plants. On a
// phone a row closes the sheet, zooms to its plants and leaves a chip on the plan, "‹ Warnings · 3 of 12 ›": the
// one before, back to the list, the next, and Dismiss. The folds, the list's place and the walk are kept while the app
// runs (not stored).
//
// The button (Jason, Nov 1): amber with the count while there are some to look at; gray with a check mark when every
// check ran and found none ("leave the all-clear grey rather than green, so it's not drawing attention just to tell
// you that everything is fine"); gray with a check and a small gray count when none were found but some checks can't
// run yet.

import { BULB_PARTNER_MIN_HEIGHT } from '../crowding';
import { el } from '../dom';
import { shapeBBox, unionBounds, canvasRect } from '../geometry';
import { I } from '../icons';
import { MAX_ZOOM, MIN_ZOOM, PX_PER_FOOT_BASE } from '../constants';
import { setRoleView, setViewFilter } from '../mutations';
import { catalogReady, onCatalogLoaded, plantFilter } from '../plants';
import { roleHidden, roleKey } from '../roles';
import { state } from '../state';
import { NO_FILTER, passesFilter } from '../status';
import { save, saveView } from '../storage';
import { startKind } from '../draw';
import { BURIED_CLEAR, CLEAR_OF_LINE, MEDIUM_TREE, NEAR_LINE, SMALL_TREE, utilityOf } from '../utilities';
import { setCrowdWarnings, setFruitWarnings, setHardyWarnings, setPoisonWarnings, setShowCrowding } from '../view-settings';
import {
  acrossPlan, buttonSaid, cantRunSaid, KIND_WORDS, kindStates, planWarnings, setDismissed, WARNING_KINDS, warningsSummary,
  type CantRun, type KindState, type WarningKind, type WarningRow, type WarningsSummary,
} from '../warnings-list';
import { applyYard, household, saveYard, toggleYard, type Yard } from '../yard';
import { undoNotice } from './delete-selected';
import { remindNoMore } from './fruit-notice';
import { openLocation } from './location-panel';
import { render } from './render';
import { dismissAcross } from './role-sections';
import { toast } from './toast';

// ---------- Kept while the app runs (not stored: the plan's own warnings are) ----------
/** Kinds opened. */
const kindsOpen = new Set<WarningKind>();
/** Kinds whose "How this is worked out" is open. */
const howOpen = new Set<WarningKind>();
/** The computer's panel beside the plan, open. */
let sideOpen = false;
/** Where each was scrolled to. */
let sheetScroll = 0, sideScroll = 0;
/** A kind to bring into view and flash as it next shows (a notice's Settings). */
let flashKind: WarningKind | null = null;
/** A row to bring into view as it next shows (the walk's "back to the list"). */
let flashRow: string | null = null;
/**
 * The warning being looked at on the plan, a row at a time (the walk): its row, and the selection it made. Any other
 * selection ends it (a tap elsewhere, Esc, a plant picked), so the chip never outstays what it's about.
 */
let walk: { key: string; dismissed: boolean; name: string; said: string; at: number; selected: string } | null = null;

/** Wide enough for the panel beside the plan (a computer, a tablet held sideways): the plan keeps 540 px or more. */
const WIDE = '(min-width: 900px)';
export const wideNow = (): boolean => { try { return matchMedia(WIDE).matches; } catch { return false; } };

// ---------- The plan's warnings, worked out once a drawing ----------
let now: { rows: WarningRow[]; summary: WarningsSummary; states: KindState[] } | null = null;
let hooked = false;
/** Worked out afresh: at each render (src/ui/render.ts), before anything here is drawn. */
export function refreshWarnings() {
  now = null;
  if (!hooked) { hooked = true; onCatalogLoaded(() => queueMicrotask(catalogIn)); }
}
function current() {
  if (!now) {
    const rows = planWarnings();
    now = { rows, summary: warningsSummary(rows), states: kindStates() };
  }
  return now;
}
/**
 * The catalog in: the button, and Warnings if it's open, said afresh in place, without the whole app redrawn (a field
 * being typed in keeps its keyboard: CLAUDE.md).
 */
function catalogIn() {
  refreshWarnings();
  const btn = document.querySelector('[data-testid=warnings-btn]'), fresh = warningsButton();
  if (btn && fresh) btn.replaceWith(fresh);
  for (const old of document.querySelectorAll('.warnings-body')) old.replaceWith(body());
}
/** The rows to look at, in the sheet's order: what the walk steps through. */
const toLookAt = () => current().rows.filter((r) => !r.dismissed);
/** A row as it's found again after a change: its kind and its plant, or its plants. */
const keyOf = (r: WarningRow) => `${r.kind}:${r.plantId && acrossPlan(r.kind) ? r.plantId : r.ids.join(',')}`;
function findRow(key: string, dismissed: boolean): WarningRow | undefined {
  const all = current().rows.filter((r) => keyOf(r) === key);
  return all.find((r) => r.dismissed === dismissed) ?? all[0];
}
const plantsIn = () => state.shapes.some((s) => s.role === 'plant');

// ---------- Ways in ----------
/**
 * Open Warnings: beside the plan on a computer, a sheet on a phone; at a kind, opened and flashed (a notice's Settings),
 * when `at` is given.
 */
export function openWarnings(at?: WarningKind) {
  if (at) { kindsOpen.add(at); flashKind = at; }
  state.menu = null;
  if (wideNow()) { sideOpen = true; if (state.panel === 'warnings' || state.panel === 'settings') state.panel = null; }
  else state.panel = 'warnings';
  render();
}
/** A notice's Settings: Warnings, at its kind. */
export function openWarningsAt(kind: WarningKind) { openWarnings(kind); }
export const warningsSideOpen = () => sideOpen;
/** Close the panel beside the plan (its ×, Esc). */
export function closeWarningsSide() { sideOpen = false; }
function closeSheet() {
  if (state.panel === 'warnings') state.panel = null;
  sideOpen = false;
  render();
}

/** The Warnings button, first among the plan's side buttons (not on a plan with no plants: nothing to check). */
export function warningsButton(): HTMLElement | null {
  if (!plantsIn()) return null;
  // (The catalog still on its way: nothing can be checked yet, and saying "all clear" would be false.)
  if (!catalogReady()) {
    const wait = el('button', { className: 'zoombtn warnings-btn none', html: I.warn, 'aria-label': 'Warnings: checking the plan', title: 'Warnings: checking the plan', 'data-testid': 'warnings-btn', 'data-state': 'checking' });
    wait.addEventListener('click', () => openWarnings());
    return wait;
  }
  const w = current().summary;
  const amber = w.active > 0;
  const open = sideOpen && wideNow();
  const b = el('button', {
    className: 'zoombtn warnings-btn' + (amber ? ' some' : ' none') + (open ? ' open' : ''), html: amber ? I.warn : I.check,
    'aria-label': buttonSaid(w), title: buttonSaid(w), 'data-testid': 'warnings-btn', 'data-state': amber ? 'some' : w.cantRun ? 'cant-run' : w.hidden ? 'hidden' : 'clear',
    ...(open ? { 'aria-pressed': 'true' } : {}),
  });
  if (amber) b.appendChild(el('span', { className: 'warnings-count', 'aria-hidden': 'true', 'data-testid': 'warnings-count' }, w.active > 99 ? '99+' : String(w.active)));
  else if (w.cantRun) b.appendChild(el('span', { className: 'warnings-count gray', 'aria-hidden': 'true', 'data-testid': 'warnings-count' }, String(w.cantRun)));
  b.addEventListener('click', () => {
    if (open) { sideOpen = false; render(); return; }
    openWarnings();
  });
  return b;
}
/** What ⋮ says: "Warnings (12)…". */
export function warningsMenuLabel(): string {
  const n = current().summary.active;
  return n ? `Warnings (${n})…` : 'Warnings…';
}

// ---------- The sheet (a phone) and the panel (a computer) ----------
/** A phone: the sheet, over the plan. */
export function renderWarningsSheet(): HTMLElement {
  const close = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' });
  close.addEventListener('click', closeSheet);
  const header = el('div', { className: 'sheet-header' }, el('h2', { className: 'title warnings-title' }, 'Warnings'), close);
  const sheet = el('div', { className: 'sheet warnings-sheet', role: 'dialog', 'aria-label': 'Warnings' }, header, body());
  sheet.addEventListener('scroll', () => { sheetScroll = sheet.scrollTop; }, { passive: true });
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
  return overlay;
}
/** The sheet just put on the page (render): where it was, or the kind or row asked for. */
export function warningsSheetShown(overlay: HTMLElement, opened: boolean) {
  const sheet = overlay.querySelector<HTMLElement>('.sheet');
  if (!sheet) return;
  if (opened) sheet.scrollTop = sheetScroll;
  bringAsked(sheet);
}
/** A computer: the panel beside the plan, while it's open. */
export function renderWarningsSide(): HTMLElement | null {
  if (!sideOpen) return null;
  const close = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close Warnings', title: 'Close Warnings' });
  close.addEventListener('click', () => { sideOpen = false; render(); });
  const scroller = el('div', { className: 'warnings-side-body' }, body());
  scroller.addEventListener('scroll', () => { sideScroll = scroller.scrollTop; }, { passive: true });
  return el('aside', { className: 'warnings-side', 'aria-label': 'Warnings', 'data-testid': 'warnings-side' },
    el('div', { className: 'sheet-header' }, el('h2', { className: 'title warnings-title' }, 'Warnings'), close), scroller);
}
/** The panel just put on the page (render): kept where it was scrolled to. */
export function warningsSideShown(root: HTMLElement) {
  const scroller = root.querySelector<HTMLElement>('.warnings-side-body');
  if (!scroller) return;
  scroller.scrollTop = sideScroll;
  bringAsked(scroller);
}
/** A kind or a row asked for (a notice's Settings; the walk's "back to the list"): brought into view and flashed. */
function bringAsked(scroller: HTMLElement) {
  const at = flashRow ? scroller.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(flashRow)}"]`)
    : flashKind ? scroller.querySelector<HTMLElement>(`[data-testid=warnings-kind-${flashKind}]`) : null;
  flashRow = null; flashKind = null;
  if (!at) return;
  // (Its top in view, under the sheet's header: a kind opened goes on below.)
  const head = scroller.querySelector<HTMLElement>('.sheet-header')?.offsetHeight ?? 0;
  const top = at.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  scroller.scrollTop = Math.max(0, top - head - 8);
  at.classList.add('flash');
}

/** Both: the list itself. */
function body(): HTMLElement {
  const { rows, summary: w, states } = current();
  const wrap = el('div', { className: 'warnings-body', 'data-testid': 'warnings' });
  // "12 to look at · 7 dismissed": warnings, not switches (the review: "· all on" counted switches).
  const head = el('p', { className: 'warnings-head', 'data-testid': 'warnings-head' });
  const where = w.hidden ? ' in the plants shown' : '';
  if (!catalogReady()) head.append(el('strong', {}, 'Checking the plan\u2026'));
  else if (w.active) head.append(el('strong', { className: 'amber' }, `${w.active} to look at`));
  else head.append(el('strong', {}, w.cantRun ? `Nothing to look at yet${where}` : w.hidden ? `Nothing to look at${where}` : 'All clear'));
  if (w.dismissed) head.append(` · ${w.dismissed} dismissed`);
  if (!w.active && w.cantRun) head.append(` · ${cantRunSaid(w.cantRun)}`);
  wrap.appendChild(head);
  if (!w.active && w.cantRun) wrap.appendChild(el('p', { className: 'warnings-sub' }, w.cantRun === 1 ? 'It needs something from you first.' : 'Each needs something from you first.'));
  if (w.hidden) wrap.appendChild(hiddenNote(w.hidden));
  const list = el('div', { className: 'warnings-kinds' });
  for (const st of states) list.appendChild(kindFold(st, rows.filter((r) => r.kind === st.kind)));
  wrap.appendChild(list);
  // (Jason's words, Nov 1.)
  wrap.appendChild(el('p', { className: 'warnings-foot' }, 'What’s checked (and dismissed) goes with this plan, on all your devices.'));
  return wrap;
}

/** "Only the plants shown are checked (Layers: Planted). Show all plants" (the false all-clear: the review, Nov 1). */
function hiddenNote(h: NonNullable<WarningsSummary['hidden']>): HTMLElement {
  const show = el('button', { className: 'warn-fix', 'data-testid': 'warnings-show-all' }, h.plants ? 'Show all plants' : 'Show utilities');
  show.addEventListener('click', () => {
    if (h.plants) {
      setViewFilter({ ...NO_FILTER });
      if (state.shapes.some((s) => s.role === 'plant' && roleHidden(s))) setRoleView('plant', { hidden: false });
    }
    if (h.utilities) setRoleView('utility', { hidden: false });
    render();
  });
  return el('div', { className: 'warnings-hidden', 'data-testid': 'warnings-hidden' },
    el('span', {}, `Only the ${h.plants ? 'plants' : 'utilities'} shown are checked (${h.said}).`), show);
}

// ---------- A kind ----------
const NAMES = Object.fromEntries(WARNING_KINDS.map((k) => [k.kind, k.name])) as Record<WarningKind, string>;
/** Each kind's mark, as its badge on the plan is drawn: told apart by shape, not only color (Jason, Oct 31). */
const MARKS: Record<WarningKind, string> = {
  poison: '<svg viewBox="0 0 20 20" width="20" height="20"><rect x="1" y="1" width="18" height="18" rx="4" fill="#7c2d12"/><path d="M10 5v6" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="10" cy="14.6" r="1.5" fill="#fff"/></svg>',
  utility: '<svg viewBox="0 0 20 20" width="20" height="20"><path d="M10 1 19 10 10 19 1 10Z" fill="#ea580c"/></svg>',
  hardy: '<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="9.5" fill="#2563eb"/><path d="M10 4.5v11M5.2 7.25l9.6 5.5M5.2 12.75l9.6-5.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
  sun: '<svg viewBox="0 0 20 20" width="20" height="20"><path d="M10 1.5 19.5 18H.5Z" fill="#f59e0b"/></svg>',
  crowding: '<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="8" fill="none" stroke="#dc2626" stroke-width="3"/></svg>',
  // (A heart: Jason, "looking for love".)
  fruit: '<svg viewBox="0 0 24 22" width="20" height="18"><path d="M12 21s-9-5.6-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.4-9 12-9 12z" fill="#db2777"/></svg>',
};
/** Why a kind can't run, as its line says it, and the button that fixes it. */
const CANT: Record<CantRun, { said: string; fix?: string }> = {
  // (Not "Nobody in the yard": Jason, "I'm there, I just don't have poison warnings turned on".)
  yard: { said: 'Off until you choose kids or pets', fix: 'Choose' },
  zip: { said: 'Needs your ZIP', fix: 'Set location' },
  sun: { said: 'No sun areas yet', fix: 'Add a sun area' },
  utilities: { said: 'None drawn. Checked once you draw a line or a septic field' },
};
function fix(st: KindState) {
  if (st.cantRun === 'yard') { kindsOpen.add('poison'); flashKind = 'poison'; render(); }
  else if (st.cantRun === 'zip') {
    // (The ZIP's sheet goes back to Warnings on a phone; on a computer the panel stays open beside it.)
    openLocation(state.panel === 'warnings' ? 'warnings' : null);
  } else if (st.cantRun === 'sun') {
    // (Drawn on the plan: the sheet makes way, as Add's choices do.)
    if (state.panel === 'warnings') state.panel = null;
    startKind('sun');
    render();
  }
}

function kindFold(st: KindState, rows: WarningRow[]): HTMLElement {
  const kind = st.kind, name = NAMES[kind];
  const open = kindsOpen.has(kind);
  const on = rows.filter((r) => !r.dismissed), off = rows.filter((r) => r.dismissed);
  // Its line under the name: why it can't run; off; or on with none.
  const sub = !st.on ? 'Off' : st.cantRun ? CANT[st.cantRun].said : rows.length ? '' : 'On · none';
  const meta = el('span', { className: 'wk-meta' },
    on.length ? el('span', { className: 'wk-count', 'data-testid': 'kind-count' }, String(on.length)) : null,
    off.length ? el('span', { className: 'wk-off' }, `${on.length ? '· ' : ''}${off.length} dismissed`) : null);
  const said = [name, on.length ? `${on.length} to look at` : '', off.length ? `${off.length} dismissed` : '', sub].filter(Boolean).join(', ');
  const toggle = el('button', { className: 'warn-kind-toggle', 'aria-expanded': String(open), 'aria-label': said, 'data-testid': `warnings-kind-head-${kind}` },
    el('span', { className: 'wk-icon', 'aria-hidden': 'true', html: MARKS[kind] }),
    el('span', { className: 'wk-name' }, name),
    meta,
    sub ? el('span', { className: 'wk-sub', 'data-testid': 'kind-sub' }, sub) : null,
    el('span', { className: 'wk-chev', 'aria-hidden': 'true' }, open ? '▾' : '›'));
  toggle.addEventListener('click', () => { if (open) kindsOpen.delete(kind); else kindsOpen.add(kind); render(); });
  const head = el('div', { className: 'warn-kind-head' }, toggle);
  const fixSaid = st.cantRun ? CANT[st.cantRun].fix : undefined;
  if (st.cantRun && fixSaid) {
    const b = el('button', { className: 'warn-fix', 'data-testid': `warnings-fix-${kind}` }, fixSaid);
    b.addEventListener('click', () => fix(st));
    head.appendChild(b);
  }
  const wrap = el('section', { className: 'warn-kind' + (open ? ' open' : ''), 'data-testid': `warnings-kind-${kind}`, 'data-state': !st.on ? 'off' : st.cantRun ? 'cant-run' : rows.length ? 'found' : 'none' }, head);
  if (!open) return wrap;
  wrap.appendChild(switchCard(kind));
  if (rows.length) {
    const list = el('div', { className: 'warn-rows' });
    for (const r of [...on, ...off]) list.appendChild(warningRow(r));
    wrap.appendChild(list);
  }
  const all = kindButtons(kind, rows);
  // (Under a rule and a heading, "All 3 hardiness warnings", so they don't read as the last row's: Jason, Nov 1.)
  if (all) {
    wrap.appendChild(el('div', { className: 'warnings-all', 'data-testid': `warnings-all-${kind}`, role: 'group', 'aria-label': `All ${rows.length} ${KIND_WORDS[kind]} warnings` },
      el('span', { className: 'warnings-all-head', 'aria-hidden': 'true' }, `All ${rows.length} ${KIND_WORDS[kind]} warnings`), ...all));
  }
  const hOpen = howOpen.has(kind);
  const how = el('button', { className: 'warn-how', 'aria-expanded': String(hOpen), 'data-testid': `warnings-how-${kind}` }, 'How this is worked out ', el('span', { 'aria-hidden': 'true' }, hOpen ? '▾' : '▸'));
  how.addEventListener('click', () => { if (hOpen) howOpen.delete(kind); else howOpen.add(kind); render(); });
  wrap.appendChild(how);
  if (hOpen) wrap.appendChild(el('p', { className: 'warn-how-text', 'data-testid': `warnings-rule-${kind}` }, RULES[kind]()));
  return wrap;
}

/** A kind's rule, and where it comes from. */
const RULES: Record<WarningKind, () => string> = {
  poison: () => 'A plant is flagged when its sources rate it poisonous to people if eaten (NC State Extension: how severe, and which parts) and kids are in the yard, or list it as a problem for the dogs, cats or horses there (NC State Extension, the ASPCA). Its details give the sources, under Plant → Safety. Plants that can irritate skin are marked in the plant list for everyone instead: anyone can brush them.',
  utility: () => `Trees and shrubs, by how tall they typically grow and how far they stand from each utility. Within ${NEAR_LINE} ft of an overhead power line a tree should top out at ${SMALL_TREE} ft or less; ${NEAR_LINE} to ${CLEAR_OF_LINE} ft away, under ${MEDIUM_TREE} ft; taller trees ${CLEAR_OF_LINE} ft or more away (UF/IFAS Extension). Trees and shrubs stay ${BURIED_CLEAR} ft from a buried line (Entergy keeps that much clear of its underground lines); call 811 before you dig. A tree or shrub should stand at least as far from a septic field as it grows tall (UGA Extension). A tree drawn without a height isn't checked.`,
  hardy: () => 'Each plant’s hardiness zones, from its sources, against your ZIP’s zone on the 2023 USDA Plant Hardiness Zone Map (the PRISM Group, Oregon State University). Rated only for warmer zones: too cold. Rated only for colder zones: it may be too warm. Annuals, and plants already in the ground, aren’t checked.',
  sun: () => 'A plant inside a sun area you recorded is checked against the sun it wants: full sun is 6 hours or more of direct sun, part shade 3 to 6, shade under 3; filtered light counts as part shade at most. A plant that wants some shade is flagged too with 2 hours or more of sun between 1 and 6 pm. Plants outside your sun areas aren’t checked.',
  crowding: () => 'Usual spacing is half of each plant’s typical spread added together, less where one grows under a tree whose lower limbs can be taken up. Close is where their typical spreads touch; crowded, closer than three quarters of that. ' +
    `Spring bulbs under a deciduous plant ${BULB_PARTNER_MIN_HEIGHT} ft or taller don’t count, except right at its base.`,
  fruit: () => 'From each plant’s sources: some come as male and female plants, and a female needs a male of its kind nearby to fruit; others need, or do better with, a second variety. Every plant in the plan counts as a partner. As you place one, a notice offers partners to add.',
};

/** Who's in the yard, in words: "kids and dogs". */
function yardSaid(): string {
  const y = household();
  const who = [y.kids ? 'kids' : '', y.dogs ? 'dogs' : '', y.cats ? 'cats' : '', y.horses ? 'horses' : ''].filter(Boolean);
  return who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who.at(-1)}` : who[0] ?? '';
}

/** A kind's switch, with a line saying what it checks (the review: the switches didn't say what's actually checked). */
function switchCard(kind: WarningKind): HTMLElement {
  const card = el('div', { className: 'warn-switch', 'data-testid': `warnings-switch-${kind}` });
  const lines = el('div', { className: 'ws-lines' });
  card.appendChild(lines);
  const check = (testid: string, on: boolean, set: (v: boolean) => void, label: string, text?: string) => {
    const box = el('input', { type: 'checkbox', 'data-testid': testid, ...(text ? {} : { 'aria-label': label }) }) as HTMLInputElement;
    box.checked = on;
    box.addEventListener('change', () => { set(box.checked); render(); });
    return el('label', { className: 'ws-on' + (text ? ' ws-text' : '') }, box, el('span', {}, text ?? 'On'));
  };
  const link = (text: string, testid: string, run: () => void) => {
    const b = el('button', { className: 'ws-link', 'data-testid': testid }, text);
    b.addEventListener('click', run);
    return b;
  };
  if (kind === 'poison') {
    const who = yardSaid();
    lines.append(el('div', {}, who ? `Plants poisonous to the ${who} in the yard` : 'Plants poisonous to the kids or pets in the yard, once you choose them'));
    card.appendChild(check('poison-warnings', state.poisonWarnings, setPoisonWarnings, 'Check poison'));
    card.appendChild(yardChips());
  } else if (kind === 'utility') {
    const n = state.shapes.filter((s) => !!utilityOf(s) && s.status !== 'gone').length;
    lines.append(el('div', {}, 'Trees and shrubs too near a power line, a buried line or a septic field'),
      el('div', { className: 'ws-second' }, n ? `${n} drawn on this plan · always checked` : 'None drawn yet · always checked'));
  } else if (kind === 'hardy') {
    const loc = state.location;
    lines.append(el('div', {}, loc ? 'Plants too cold or too warm for ' : 'Plants too cold or too warm where the garden is', loc ? el('strong', {}, `zone ${loc.zone}`) : null),
      el('div', { className: 'ws-second' }, loc ? `ZIP ${loc.zip} · ` : 'No ZIP yet · ',
        link(loc ? 'Change' : 'Set location', 'warnings-zip', () => openLocation(state.panel === 'warnings' ? 'warnings' : null))));
    card.appendChild(check('hardy-warnings', state.hardyWarnings, setHardyWarnings, 'Check hardiness'));
  } else if (kind === 'sun') {
    const n = state.shapes.filter((s) => s.role === 'shade' && !!s.sun).length;
    lines.append(el('div', {}, 'Plants getting more or less sun than they want'),
      el('div', { className: 'ws-second' }, n ? `In the ${n === 1 ? 'sun area' : `${n} sun areas`} you recorded` : 'Once you record a sun area'));
    card.appendChild(check('sun-warnings', state.sunWarnings, (v) => { state.sunWarnings = v; save(); }, 'Check sun'));
  } else if (kind === 'crowding') {
    card.classList.add('ws-stack');
    card.append(check('show-crowding', state.showCrowding, setShowCrowding, '', 'Plants closer than their spread allows: rings on the plan, amber where close, red where crowded'),
      check('crowd-warnings', state.crowdWarnings, setCrowdWarnings, '', 'Tell me as I place a plant close to another'));
    card.removeChild(lines);
  } else {
    lines.append(el('div', {}, 'Plants that need a partner to fruit (male and female plants, or a second variety), until the plan has one'));
    card.appendChild(check('fruit-warnings', state.fruitWarnings, setFruitWarnings, 'Check fruit partners'));
  }
  return card;
}
/** Kids, Dogs, Cats, Horses: who's in the yard, set here as in the plant picker ("Anyone you need to protect?"). */
function yardChips(): HTMLElement {
  const y = household();
  const row = el('div', { className: 'ws-yard', role: 'group', 'aria-label': 'In the yard', 'data-testid': 'warnings-yard' }, el('span', { className: 'ws-yard-label' }, 'In the yard:'));
  for (const [k, label] of [['kids', 'Kids'], ['dogs', 'Dogs'], ['cats', 'Cats'], ['horses', 'Horses']] as [keyof Yard, string][]) {
    const on = k === 'dogs' ? y.dogs !== '' : !!y[k];
    const b = el('button', { className: 'color-chip protect-chip' + (on ? ' on' : ''), 'aria-pressed': String(on), 'data-testid': `warnings-yard-${k}` }, label);
    b.addEventListener('click', () => {
      const next = toggleYard({ kids: y.kids, dogs: y.dogs, cats: y.cats, horses: y.horses }, k);
      applyYard(plantFilter, next); // (the picker's filters follow, as its own chips do)
      saveYard(next);
      render();
    });
    row.appendChild(b);
  }
  return row;
}

/**
 * A kind's "Dismiss all 3", with more than one to look at, and "Show all 2 again", with more than one dismissed: one
 * step each, with a notice saying what it did and an Undo (Jason, Nov 1; #187). Null with neither: a kind's one warning
 * has its own Dismiss or Show again, and "Dismiss all 1" would say nothing more.
 */
function kindButtons(kind: WarningKind, these: WarningRow[]): HTMLElement[] | null {
  const on = these.filter((r) => !r.dismissed && r.dismiss), off = these.filter((r) => r.dismissed && r.again);
  const word = KIND_WORDS[kind];
  const out: HTMLElement[] = [];
  const button = (testid: string, text: string, rows: WarningRow[], dismissed: boolean) => {
    const b = el('button', { className: 'warn-all-btn' + (dismissed ? '' : ' again'), 'data-testid': testid }, text);
    b.addEventListener('click', () => {
      const { n, takeBack } = setDismissed(rows, dismissed);
      render();
      if (!n) return;
      const many = `${n} ${word} warning${n === 1 ? '' : 's'}`;
      undoNotice(!dismissed ? `Showing ${many} again`
        : kind === 'crowding' ? `Dismissed ${many}, for those pairs. Plants placed from now on are still flagged.`
        : `Dismissed ${many}${acrossPlan(kind) ? ', for those plants added later too' : ''}`, takeBack);
    });
    out.push(b);
  };
  if (on.length > 1) button('warnings-dismiss-all', `Dismiss all ${on.length}`, on, true);
  if (off.length > 1) button('warnings-again-all', `Show all ${off.length} again`, off, false);
  return out.length ? out : null;
}

/** Dismiss a row, as the plan's own dismissal for its kind does, with what that says. */
function dismissRow(r: WarningRow) {
  if (r.plantId && r.key && (r.kind === 'hardy' || r.kind === 'poison')) dismissAcross(r.kind, r.plantId, r.key);
  else if (r.plantId && r.key && r.kind === 'fruit') remindNoMore(r.plantId, r.key);
  else { setDismissed([r], true); render(); }
}
function showAgain(r: WarningRow) { setDismissed([r], false); render(); }

/** "dismissed for every Fig in this plan". */
const scopeSaid = (r: WarningRow) => `Dismissed${r.scope ? ' ' + r.scope : ''}`;

function warningRow(r: WarningRow): HTMLElement {
  const key = keyOf(r);
  const current = !wideNow() ? false : r.ids.length > 0 && [...r.ids].sort().join() === [...state.selectedIds].sort().join();
  // (Its words for a screen reader, ending in one period: the review heard two.)
  const label = `${r.name}: ${r.said}${r.dismissed ? ` (${scopeSaid(r).toLowerCase()})` : ''}. Show on the plan`;
  const main = el('button', { className: 'wr-main', 'data-testid': 'warning-select', 'aria-label': label },
    el('span', { className: 'wr-name' }, r.name),
    el('span', { className: 'wr-said' }, r.said, el('span', { className: 'wr-go', 'aria-hidden': 'true' }, ' ›')),
    r.dismissed ? el('span', { className: 'wr-scope', 'data-testid': 'warning-scope' }, scopeSaid(r)) : null);
  main.addEventListener('click', () => showRow(r));
  const row = el('div', { className: 'warn-row' + (r.dismissed ? ' dismissed' : '') + (current ? ' current' : ''), 'data-testid': 'warning-row', 'data-kind': r.kind, 'data-dismissed': String(r.dismissed), 'data-row-key': key }, main);
  if (r.dismissed && r.again) {
    const again = el('button', { className: 'wr-btn again', 'data-testid': 'warning-again', 'aria-label': `Show again: ${r.name}` }, 'Show again');
    again.addEventListener('click', () => showAgain(r));
    row.appendChild(again);
  }
  if (!r.dismissed && r.dismiss) {
    const dismiss = el('button', { className: 'wr-btn', 'data-testid': 'warning-dismiss', 'aria-label': `Dismiss: ${r.name}` }, 'Dismiss');
    dismiss.addEventListener('click', () => dismissRow(r));
    row.appendChild(dismiss);
  }
  return row;
}

// ---------- On the plan ----------
/**
 * A row's plants on the plan: shown if a layer or the plants shown hid them, selected, and zoomed to (the review: a row
 * centered them without zooming). On a phone the sheet makes way, and the chip takes over; on a computer the panel
 * stays open beside the plan.
 */
function showRow(r: WarningRow) {
  const shapes = r.ids.map((id) => state.shapes.find((s) => s.id === id)).filter((s) => !!s);
  if (!shapes.length) return;
  for (const s of shapes) {
    if (roleHidden(s)) setRoleView(roleKey(s), { hidden: false });
    if (!passesFilter(s, state.viewFilter)) setViewFilter({ status: '', phase: '', showGone: s.status === 'gone' });
  }
  state.selectedIds = shapes.map((s) => s.id);
  const list = toLookAt();
  walk = { key: keyOf(r), dismissed: r.dismissed, name: r.name, said: r.said, at: Math.max(0, list.findIndex((x) => keyOf(x) === keyOf(r))), selected: state.selectedIds.join() };
  if (state.panel === 'warnings') state.panel = null;
  zoomTo(r);
  render();
}
/** Zoom so a row's plants fill the plan, with room around them, clear of the side buttons and the chip. */
function zoomTo(r: WarningRow) {
  const shapes = r.ids.map((id) => state.shapes.find((s) => s.id === id)).filter((s) => !!s);
  const b = unionBounds(shapes.map(shapeBBox));
  if (!b) return;
  let rect: DOMRect;
  try { rect = canvasRect(); } catch { return; }
  const W = rect.width || state.canvasW, H = rect.height || state.canvasH;
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const pad = Math.max(2, r.pad ?? 0, 0.3 * Math.max(w, h));
  // (At least 10 ft across: a small plant alone is shown among its neighbors, not filling the screen.)
  const bw = Math.max(10, w + 2 * pad), bh = Math.max(10, h + 2 * pad);
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  // (Clear of the side buttons at the right; on a phone, of the chip at the foot.)
  const left = 12, right = 68, top = 12, bottom = wideNow() ? 16 : 96;
  const fit = Math.min((W - left - right) / (bw * PX_PER_FOOT_BASE), (H - top - bottom) / (bh * PX_PER_FOOT_BASE));
  state.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit));
  const ppf = PX_PER_FOOT_BASE * state.zoom;
  state.offsetX = cx - (left + (W - left - right) / 2) / ppf;
  state.offsetY = cy - (top + (H - top - bottom) / 2) / ppf;
  saveView();
}

/** Whether the walk's chip is up (it takes the place of the selected shape's chip and the bar for several). */
export function walkUp(): boolean {
  if (!walk) return false;
  if (state.selectedIds.join() !== walk.selected) { walk = null; return false; } // (another selection: the walk is over)
  return !wideNow() && !state.panel && !state.draw && !state.placing && !state.featurePlace && !state.editPoints;
}
/** The walk's chip on a phone: "‹ Warnings · 3 of 12 ›", with Dismiss (or Show again). */
export function walkChip(): HTMLElement | null {
  if (!walkUp() || !walk) return null;
  const list = toLookAt();
  const row = findRow(walk.key, walk.dismissed);
  const at = row && !row.dismissed ? list.findIndex((x) => keyOf(x) === walk!.key) : -1;
  if (at >= 0) walk.at = at;
  const n = list.length;
  const top = row?.dismissed ? 'Warnings · dismissed' : at >= 0 ? `Warnings · ${at + 1} of ${n}` : `Warnings · ${n} to look at`;
  const said = row ? `${row.name}: ${row.said.charAt(0).toLowerCase()}${row.said.slice(1)}` : `${walk.name}: no warning now`;
  const step = (by: number) => {
    if (!n) return;
    const from = at >= 0 ? at : by > 0 ? (row?.dismissed ? -1 : walk!.at - 1) : (row?.dismissed ? n : walk!.at);
    showRow(list[((from + by) % n + n) % n]);
  };
  const prev = el('button', { className: 'walk-step', 'aria-label': 'Previous warning', 'data-testid': 'walk-prev', html: '‹' });
  prev.addEventListener('click', () => step(-1));
  const next = el('button', { className: 'walk-step', 'aria-label': 'Next warning', 'data-testid': 'walk-next', html: '›' });
  next.addEventListener('click', () => step(1));
  prev.disabled = next.disabled = !n || (n === 1 && at === 0);
  const back = el('button', { className: 'walk-main', 'data-testid': 'walk-list', title: 'Back to the list' },
    el('span', { className: 'walk-top' }, top), el('span', { className: 'walk-said' }, said));
  back.setAttribute('aria-label', `${top}. ${said}. Back to the list`);
  back.addEventListener('click', () => {
    if (walk) { kindsOpen.add(walk.key.split(':')[0] as WarningKind); flashRow = walk.key; }
    state.panel = 'warnings';
    render();
  });
  const chip = el('div', { className: 'walk-chip', role: 'group', 'aria-label': 'Warnings on the plan', 'data-testid': 'walk-chip' }, prev, back);
  if (row && !row.dismissed && row.dismiss) {
    const d = el('button', { className: 'wr-btn', 'data-testid': 'walk-dismiss' }, 'Dismiss');
    d.addEventListener('click', () => {
      const was = walk!.at;
      dismissRow(row);
      // (On to the next, now in its place, as working through a list goes; none left: said so.)
      refreshWarnings();
      const left = toLookAt();
      if (left.length) showRow(left[Math.min(was, left.length - 1)]);
      else { walk = null; render(); toast('Nothing more to look at.'); }
    });
    chip.appendChild(d);
  } else if (row?.dismissed && row.again) {
    const a = el('button', { className: 'wr-btn again', 'data-testid': 'walk-again' }, 'Show again');
    a.addEventListener('click', () => { walk!.dismissed = false; showAgain(row); });
    chip.appendChild(a);
  }
  chip.appendChild(next);
  // (Too narrow for it all on one line, its count cut short (a small phone, large text): Dismiss goes under, the full
  // width, as the bar for several plants gives way: src/ui/render.ts.)
  requestAnimationFrame(() => {
    const t = chip.querySelector<HTMLElement>('.walk-top');
    if (chip.isConnected && t && t.scrollWidth > t.clientWidth + 1) chip.classList.add('stacked');
  });
  return chip;
}
