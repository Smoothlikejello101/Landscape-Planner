import { crowdLevelsOf, crowdNoticeAfterSwap } from './crowd-notice';
import { swapFix, swapFixClosed, swapFixOn, type SwapFix } from './fix-problem';
import { smallerForms, type SmallerForm } from '../fix-problem';
import { el, hasKeyboard, sheetCloseButton, tapSaid, type Child } from '../dom';
import { needNames as needNamesOf, readNeeds, type NameIndex, type NeedSet } from '../search-needs';
import { FLOWER_CHOICES } from '../flower-colors';
import { applyYard, askAtTop, askDismissed, dismissAsked, household, saveHardy, saveYard, toggleYard, YARD_CHIPS, yardHas, yardKeyOf, yardOf, type Yard } from '../yard';
import { toast } from './toast';
import { I } from '../icons';
import type { Plant, PlantFilter, ToxicTo } from '../plants';
import { byMatch, hostMatchText, inNotes, matchPlant, nearShows, readQuery, unsearchable } from '../search';
import { seasonMonths, byTypicalHeight, formsOf, matchedBy, reportedOnly, earlierFor, comesIn, bySeason, noSoilRating, sunFit, sunRangeSaid, filterOn, SEASONS, reportedPhrase, rowFlags, rowLines, planCounts, plantColor, PLANTS, PLANT_FILTER_DEFAULTS, PLANT_META, filteredPlants, linkFromPicker, plantFilter, plantIdsInPlan, plantMatches, countWord, bannedLeftOut, pickerCount, toxicNote, reportedMatch, cultivarsOf, foldHeadOf, headName, isGroupHead, plantsById, swapFiltersOn, treeFiltersAside } from '../plants';
import { startPlacing, switchPlacingPlant } from '../place';
import { startTreeDraw } from '../draw';
import { SPREAD_WAYS, spreadWays } from '../spread';
import { heightLabel, heightRange, sizeLabel } from './height-range';
import { activeMyPlants, catalogMatchFor, isMine } from '../my-plants';
import { openSwitch } from './switch-plant';
import type { PlantFormArgs } from '../types';
import { state } from '../state';
import { ZONE_SOURCE_SHORT } from '../climate';
import { openLocation } from './location-panel';
import { render } from './render';
import { plantDetails } from './plant-details';
import { addCompareToggle, compareBar, compareMark, compareOver, pickerBeneath, refreshCompare, syncCompareMarks, type CompareHost } from './compare-sheet';
import { bannedHere, escapeHere, escapeShort, gardenStateName, lawShort, loadWild, regulatedHere } from '../wild';
import { plantSpot } from '../plant-looks';
import { closePicker, dragsPicker, pickerFromSheet, pickerHandle, pickerSheetClass, showShapes } from './picker-view';
import { bedBox, forRow } from './plant-for';
import { sourceButton } from './source-pane';
import { bedLayer, partName, PART_OF, setPartOff, SET_BY_BED, withFilters, type BedLayer, type BedPart } from '../bed-plant';
import { redrawCanvas } from '../canvas';
import { noteView } from './render';
import type { Shape } from '../types';

/** The small flower before a row's bloom months, in the text's own color. */
const FLOWER_GLYPH = '<svg viewBox="0 0 20 20" width="1em" height="1em" fill="currentColor"><circle cx="10" cy="5.6" r="3.4"/><circle cx="14.2" cy="8.6" r="3.4"/><circle cx="12.6" cy="13.6" r="3.4"/><circle cx="7.4" cy="13.6" r="3.4"/><circle cx="5.8" cy="8.6" r="3.4"/><circle cx="10" cy="10" r="2.2" fill="#fff"/></svg>';

/** A Swap's smaller forms, worked out once while it's open (the list is rebuilt at each filter changed). */
let smallMemo: { fix: SwapFix; plants: Plant[]; list: SmallerForm[] } | null = null;
function smallerOf(fix: SwapFix): SmallerForm[] {
  const p = fix.smaller ? plantsById[fix.smaller.plantId] : undefined;
  if (!p || !fix.smaller) return [];
  if (smallMemo?.fix !== fix || smallMemo.plants !== PLANTS) smallMemo = { fix, plants: PLANTS, list: smallerForms(p, PLANTS, fix.smaller.room) };
  return smallMemo.list;
}
/** The open picker's list rebuild (in place: the search keeps the keyboard, opened rows stay open). */
let refreshList: (() => void) | null = null;
/**
 * "Show them": the filters that hid a search's plants, set aside while that is the search, and back on for the next
 * (Diego, Priya, Ruth, Oct 30: taken off for good, they dropped the household's safety filters from every search after,
 * with nothing said). Never changes the filters themselves.
 */
let setAside: { q: string; keys: (keyof PlantFilter)[]; names: string[] } | null = null;
const searchKey = () => plantFilter.q.trim().toLowerCase();
/** The picker just opened with last time's search in it (its first focus selects it). */
let keptSearch = false;
/** The picker just opened (src/ui/render.ts). */
export function pickerOpened() { keptSearch = !!plantFilter.q; }
/**
 * Whether "Hide plants rated toxic to:" is first among the filters while the picker is open: decided as it opens
 * (src/yard.ts askAtTop), so an answer given in it stays in view to see (Jason, Nov 1, from the UI review); a
 * dismissal moves it at once. Null with the picker closed.
 */
let askingAtTop: boolean | null = null;
/**
 * "Hide plants rated toxic to:", first among the filters, folded away while a search is typed, as the filters fold, so its
 * results are what's in view (the picker bug hunt, Nov 1: on a 360 × 640 phone it and Recent, since gone, left one
 * result row in sight, at Extra large none); back once the search is cleared, or the picker closes. Kept across a
 * redraw while typing.
 */
let typingFold = false;
/** The picker closed (src/ui/render.ts): asked again or not by what's kept, the next time it opens. */
export function pickerClosed() { askingAtTop = null; typingFold = false; swapFixClosed(); }
/** `fn` with these filters off, the filters as they were after. */
function withFiltersOff<T>(keys: (keyof PlantFilter)[], fn: () => T): T {
  const was = keys.map((k) => [k, plantFilter[k]] as const);
  for (const k of keys) Object.assign(plantFilter, { [k]: PLANT_FILTER_DEFAULTS[k] });
  try { return fn(); } finally { for (const [k, v] of was) Object.assign(plantFilter, { [k]: v }); }
}
/**
 * The plants' names, as words of need see them (src/search-needs.ts needNames): the catalog's common names and My
 * plants', not their other names. Made the first time it's wanted, and again for another catalog or a change in My
 * plants.
 */
let needNames: { plants: Plant[]; mine: string; ix: NameIndex } | null = null;
function namesForNeeds(): NameIndex {
  const mine = activeMyPlants();
  const said = mine.map((p) => p.common).join('\n');
  if (needNames?.plants !== PLANTS || needNames.mine !== said) {
    needNames = { plants: PLANTS, mine: said, ix: needNamesOf([...PLANTS, ...mine]) };
  }
  return needNames.ix;
}
/** Once the garden's wild records are in, show them in the list. */
function afterWild() { if (state.panel === 'plants') { addNativeHereOption(); refreshList?.(); refreshCompare(); } }
/**
 * "Native to <state>" in the native-status filter, once the garden's state (with native status) is known: put in
 * place when the records arrive after the panel is drawn, without redrawing it (the search box may have focus).
 */
function addNativeHereOption() {
  const sel = document.querySelector<HTMLSelectElement>('[data-testid=native-filter]'), here = gardenStateName();
  if (!sel || !here || sel.querySelector('option[value="@here"]')) return;
  const o = el('option', { value: '@here' }, `Native to ${here}`);
  o.dataset.text = o.textContent!;
  o.selected = plantFilter.native === '@here';
  sel.insertBefore(o, sel.options[1] ?? null);
}

// (A tree among its forms: a shrub that grows into a tree, mimosa or wax myrtle, can be the tree in the yard.)
const isTree = (p: Plant) => formsOf(p).includes('Tree');
// My plants folded away in the picker: kept here, and remembered on this device when storage allows. Folded until
// opened (Jason, 2026-10-27: the catalog is what's browsed; a search shows your matches anyway).
const FOLD_KEY = 'lp-my-plants-folded';
let myPlantsFolded = (() => { try { return localStorage.getItem(FOLD_KEY) !== '0'; } catch { return true; } })();
function setMyPlantsFolded(v: boolean) {
  myPlantsFolded = v;
  try { localStorage.setItem(FOLD_KEY, v ? '1' : '0'); } catch { /* folded for now, not remembered */ }
}
/**
 * Tap on a plant. Usually: pick it up to place by tapping (or switch to it, if
 * already placing). Opened from a circle's properties: make that circle this
 * plant. Opened from Add, Existing tree: draw that tree's canopy.
 */
function pick(p: Plant) {
  if (state.pickerLinkId) {
    // (Placed plants swapped for another: closer to a neighbor now, said, as placing says it. Jason, Oct 31.)
    const ids = [state.pickerLinkId, ...state.pickerLinkAlso];
    const swapping = ids.every((id) => { const s = state.shapes.find((x) => x.id === id); return !!s?.plantId && !!plantsById[s.plantId]; });
    const before = swapping ? crowdLevelsOf(ids) : null;
    linkFromPicker(p);
    if (before) crowdNoticeAfterSwap(ids, before);
    // (Swapped: the sheet closes, the plant swapped in selected, its toast or crowding notice saying so. Jason, Nov 5:
    // "I would expect it to close upon successful selection". Linked: back on its sheet, which may offer to link the
    // other circles labeled the same.)
    state.panel = swapping ? null : 'props';
  } else if (state.pickerForTree) {
    startTreeDraw(p.id);
  } else if (state.placing) {
    switchPlacingPlant(p);
  } else {
    startPlacing(p);
  }
  render();
}
// (Its ×, Cancel or a tap beside it: back here, the search as it was. Round 3, Owen, for Edit; the UI review,
// 2026-11-01, for Add and Copy: their × closed the whole picker, and the search with it.)
function openForm(args: PlantFormArgs) { state.plantForm = { ...args, back: 'plants' }; state.panel = 'plantForm'; render(); }
/**
 * Help's "Add my own plant" (src/ui/help-sheet.ts): the picker's Add your own plant, as if from its foot: the form, its
 * ← back to the picker, where My plants are; saved, placed on the plan.
 */
export function openOwnPlantForm() {
  state.pickerLinkId = null; state.pickerLinkAlso = []; state.pickerLinkLocked = false; state.pickerForTree = false;
  openForm({ place: true });
}

const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
/** Where in a bed a plant that takes only some of its sun fits (src/plants.ts sunFit). */
const SUN_END: Record<'sunny' | 'shady' | 'middle', string> = { sunny: 'Sunny end only', shady: 'Shady end only', middle: 'Part-shade middle only' };
/** Feet as a row says them: 2.5, 3. */
const fmtFt = (v: number) => (Math.round(v * 10) / 10).toString();
/**
 * A plant's name with a place to wrap after each slash: "Bradford/" then "Callery pear" on the next line, not
 * "Bradford/Call" and "ery pear" beside a wide "Place (banned)" (the picker bug hunt, Nov 1, B11). Its words are as
 * they were; a browser doesn't wrap after a slash on its own.
 */
const slashBreaks = (name: string): Child[] => name.split('/').flatMap((part, i) => (i ? ['/', el('wbr'), part] : [part]));
/** The fewest cultivars a fold holds (Jason, 2026-10-26): fewer are rows of their own. */
const MIN_FOLD = 4;
/**
 * Sure matches enough to fill the picker's pane: past it, the less-sure groups (what fits by what other sources say,
 * and only by the earlier list's word) fold into one line that opens them (Jason, Nov 4).
 */
export const SURE_ENOUGH = 10;
const joined = (xs: string[], word: string) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1]}` : xs[0] ?? '');
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Blooming in June", "Blooming in spring". */
const bloomName = (v: string) => (/^\d+$/.test(v) ? MONTHS[Number(v)] : v);
const SUN_NAMES: Record<string, string> = { Full: 'Full sun', Part: 'Part shade', Shade: 'Shade' };
/** Water needs, in order (the catalog's words; "Wetland" said plainly). */
const WATER: [string, string, string][] = [['Low', 'Low (drought tolerant)', 'low'], ['Moderate', 'Moderate', 'moderate'], ['Low,Moderate', 'Low or moderate', 'low or moderate'], ['High', 'High', 'high'], ['Wetland', 'Wet soil or standing water', 'wet']];
const GROWTH: [string, string][] = [['slow', 'Slow'], ['medium', 'Medium'], ['fast', 'Fast']];
const SPREADS: Record<string, string> = { stays: 'Stays put', runs: 'Spreads by runners or underground', aggressive: 'Spreads aggressively by runners or underground', seed: 'Self-sows freely' };
/** The leaf colors offered (flower colors: src/flower-colors.ts). Leaf color includes green (Jason, 2026-10-25). */
const LEAF_CHOICES = ['green', 'silver', 'gold', 'blue', 'purple', 'red', 'white', 'variegated', 'copper', 'orange', 'pink', 'cream', 'black'];
/** Who a plant attracts, as NC State says it (its "specialized bees" count as bees: src/plants.ts). */
const ATTRACT_CHOICES: [string, string][] = [['butterflies', 'Butterflies'], ['bees', 'Bees'], ['hummingbirds', 'Hummingbirds'], ['songbirds', 'Songbirds'], ['moths', 'Moths'], ['pollinators', 'Pollinators']];
const SWATCHES: Record<string, string> = {
  white: '#ffffff', cream: '#fef3c7', yellow: '#eab308', gold: '#ca8a04', orange: '#f97316', copper: '#b45309', red: '#dc2626',
  pink: '#ec4899', purple: '#9333ea', blue: '#3b82f6', green: '#16a34a', brown: '#78350f', silver: '#a8a29e', black: '#1c1917',
  variegated: 'linear-gradient(135deg, #16a34a 50%, #fef3c7 50%)',
};
type ListKey = 'flowerColors' | 'leafColors' | 'attracts' | 'spread' | 'edibleParts';
/** The parts a plant can be edible for, as chips under Edible (Jason, Oct 30). */
const EDIBLE_PART_CHOICES: [string, string][] = [['fruit', 'Fruit'], ['leaves', 'Leaves'], ['flowers', 'Flowers']];
/** One value of a list filter, as its chip says it ("Red flowers", "Attracts bees"). */
const LIST_ONE: Record<ListKey, (v: string) => string> = {
  flowerColors: (v) => `${cap(v)} flowers`, leafColors: (v) => `${cap(v)} leaves`, attracts: (v) => `Attracts ${v}`,
  spread: (v) => `Spreading OK: ${SPREADS[v]?.toLowerCase() ?? v}`, edibleParts: (v) => `Edible ${v}`,
};
/**
 * Each filter by name, as its chip and "hidden by" say it, with its setting. Not the search, the folds, or whether
 * other sources' values count.
 */
const FILTER_NAMES: Partial<Record<keyof PlantFilter, (f: PlantFilter) => string>> = {
  form: (f) => f.form, sun: (f) => SUN_NAMES[f.sun] ?? f.sun, water: (f) => `Water needs: ${WATER.find(([v]) => v === f.water)?.[2] ?? f.water}`,
  bloomMonth: (f) => `Blooming in ${bloomName(f.bloomMonth)}`, flowerColors: (f) => `${cap(joined(f.flowerColors, 'or'))} flowers`,
  flowers: () => 'Has flowers',
  hardyHere: () => (state.location ? `Hardy in zone ${state.location.zone}` : 'Hardy in your zone'),
  // (One way for all four, as their line says it: Jason, Nov 4, "I'm partial to 'hide plants toxic to …'"; "rated", Nov
  // 5, so what's left doesn't read as safe. Dogs kept as 'nonToxic', from before Nov 5, is the same: src/yard.ts.)
  noPoison: () => 'No plants rated toxic to people', dogs: () => 'No plants rated toxic to dogs',
  cats: () => 'No plants rated toxic to cats', horses: () => 'No plants rated toxic to horses',
  attracts: (f) => `Attracts ${joined(f.attracts, 'or')}`, hostOnly: () => 'Feeds caterpillars',
  native: (f) => (f.native === '@here' ? `Native to ${gardenStateName() ?? 'your state'}` : 'Native to North America'),
  leafColors: (f) => `${cap(joined(f.leafColors, 'or'))} leaves`, fallColor: () => 'Fall color', evergreen: () => 'Evergreen', winterInterest: () => 'Winter interest',
  growth: (f) => `Growth rate: ${f.growth}`, height: (f) => `Height: ${heightLabel(f.height).replace(/^Up/, 'up')}`,
  width: (f) => `Width: ${sizeLabel(f.width, 'width').replace(/^Up/, 'up')}`,
  lowMaintenance: () => 'Low maintenance', drought: () => 'Drought tolerant', wetFeet: () => 'Takes wet soil', clayOk: () => 'Clay OK',
  deerResistant: () => 'Deer resistant', noThorns: () => 'No thorns listed', spread: (f) => `Spreading OK: ${joined(f.spread.map((v) => SPREADS[v]?.toLowerCase() ?? v), 'or')}`, edible: () => 'Edible',
  edibleParts: (f) => `Edible ${joined(f.edibleParts, 'or')}`,
  inPlan: () => 'In this plan',
  partnersOf: (f) => `Partners for ${plantsById[f.partnersOf]?.common ?? 'a plant'}`,
  // (Set only by a Swap from a sun warning, beside the spot's sun: src/ui/fix-problem.ts.)
  afternoonSun: () => 'Takes hot afternoon sun',
  // (Set only by a bed the picker plants for: src/bed-plant.ts. Named by the bed where they hide a search's plants.)
  sunRange: (f) => `Takes ${sunRangeSaid(f.sunRange)}`, clayBed: () => 'Clay OK', soilBed: (f) => (f.soilBed === 'sand' ? 'Sandy soil OK' : 'Loam OK'),
};
/**
 * Whether the filters are open: one fold for them all, folded to start and left as the gardener left it (Jason,
 * 2026-10-27: they took most of a phone's screen before the first plant). "Hardy in zone 8a" stays beside it.
 */
const FILTERS_KEY = 'lp-filters-open';
let filtersOpen = (() => { try { return localStorage.getItem(FILTERS_KEY) === '1'; } catch { return false; } })();
function setFiltersOpen(v: boolean) {
  filtersOpen = v;
  try { localStorage.setItem(FILTERS_KEY, v ? '1' : '0'); } catch { /* open for now, not remembered */ }
}
export function renderPlantsPanel() {
  void loadWild(afterWild);
  const linking = !!state.pickerLinkId;
  // (Placed plants to swap for another: Jason, Oct 30.)
  const swapping = linking && [state.pickerLinkId!, ...state.pickerLinkAlso].every((id) => { const s = state.shapes.find((x) => x.id === id); return !!s?.plantId && !!plantsById[s.plantId]; });
  const forTree = !linking && state.pickerForTree;
  if (forTree) treeFiltersAside(); // (naming a tree in the yard: no shopping filters, src/plants.ts)
  // Plant this bed (Jason, Nov 2): which bed it's For, a row of its own at the top; not in Swap, Link or Which tree.
  const showsFor = !swapping && !linking && !forTree;
  /**
   * A task of its own keeps a title saying what it is: Swap, Link, Which tree. The picker itself (and Switch plant, the
   * same picker while placing, its rows' buttons saying Switch) has none: the For row, or the search where there's no bed
   * to choose, takes its row, beside the ✕ (Jason, Nov 4, note 1: "I wonder if it needs the 'Plant Picker (xxxx)'
   * header? It seems like mostly wasted space"). How many plants it offers: its count line, over the list.
   */
  const title = swapping ? 'Swap for another plant' : linking ? 'Link to a plant' : forTree ? 'Which tree?' : null;

  const body = el('div', { className: 'sheet-body' });
  // ---- For: Anywhere, a bed, or Pick on the plan (src/ui/plant-for.ts), in view while the list scrolls, once the plan
  // has a bed to choose (Jason, Nov 4, note 1: '"for: anywhere" probably doesn't need to be there if they don't have a
  // bed'). Chosen in place: the search keeps its keyboard.
  const forBar = showsFor ? forRow((bed) => forChanged(bed)) : null;
  /**
   * The bed planted for, as a layer over the filters (src/bed-plant.ts): its conditions filter the list, the person's
   * own Sun, Water needs, Drought tolerant, Takes wet soil and Clay OK set aside meanwhile, untouched. Null: anywhere.
   */
  let layer: BedLayer | null = showsFor ? bedLayer() : null;
  /** Under it, at the list's top, For a bed: the bed's box. (For anywhere, nothing: Jason, Nov 4, dropped "Planting a bed? …".) */
  const forTop = el('div', { className: 'for-top', 'data-testid': 'for-top' });
  if (showsFor) body.appendChild(forTop);
  function forChanged(bed: Shape | null) {
    syncFor();
    rebuildList();
    // (The bed in view beside or above the picker, and drawn outlined; the plan alone drawn again.)
    if (bed) showShapes([bed]);
    redrawCanvas(); noteView();
  }
  /** What's under the For row, and the filters the bed sets, as the bed now planted for has them. */
  function syncFor() {
    if (!showsFor) return;
    layer = bedLayer();
    forTop.replaceChildren(...(layer ? [bedBox(layer, partToggled, editConditions)] : []));
    syncSetBy();
  }
  /** A part of the bed's conditions taken off with its ×, or put back: for now, never on the bed. */
  function partToggled(part: BedPart, off: boolean) {
    setPartOff(part, off);
    syncFor();
    rebuildList();
    forTop.querySelector<HTMLElement>(off ? '[data-testid=bed-cond-off]' : '[data-testid=bed-cond]')?.focus({ preventScroll: true });
  }
  /** The box's Edit: the bed's conditions, then back here For it. */
  function editConditions() { state.panel = 'bedConditions'; render(); }
  /** The soil the bed planted for lists the unrated below a divider for: its loam or sand, else clay. */
  const soilOn = (): 'clay' | 'loam' | 'sand' => layer?.keys.soilBed || 'clay';
  /** Whether the bed planted for sets this filter now (shown "Set by Front bed", the person's own set aside). */
  const setByBed = (k: keyof PlantFilter): boolean => !!layer && SET_BY_BED.includes(k);
  /** The controls of the filters a bed sets, as For now has them. */
  const setBySyncers: (() => void)[] = [];
  function syncSetBy() { for (const f of setBySyncers) f(); }
  const linkCount = 1 + state.pickerLinkAlso.length;
  if (swapping) body.appendChild(el('div', { className: 'banner', 'data-testid': 'swap-banner' }, linkCount > 1
    ? `Pick the plant to swap these ${linkCount} for. They keep their places, status and notes, and take its name, size and color.`
    : 'Pick the plant to swap it for. It keeps its place, status and notes, and takes the plant\'s name, size and color.'));
  else if (linking) body.appendChild(el('div', { className: 'banner' }, linkCount > 1
    ? `Pick the plant these ${linkCount} circles stand for. They keep their places and take the plant's name and size.`
    : 'Pick the plant this circle stands for. It keeps its place and takes the plant\'s name and size.'));
  if (forTree) {
    // A tree already in the yard: name it if it's in the list, then draw its canopy as it is.
    body.appendChild(el('div', { className: 'banner' }, tapSaid('Pick the tree, then tap its trunk and the edge of its canopy.')));
    const unknown = el('button', { className: 'btn secondary', 'data-testid': 'unknown-tree', style: { width: '100%', marginBottom: '10px' } }, "Unknown tree (I'll just draw it)");
    unknown.addEventListener('click', () => { startTreeDraw(); render(); });
    body.appendChild(unknown);
  }
  // (No Recent, the plants placed last, one tap each (Jason, Nov 4, note 1: "'In this plan' gives much of the same 'find
  // that plant I put down a little bit ago' functionality"); nor "Not every detail is checked yet", the details mark the
  // facts that aren't instead (src/ui/plant-details.ts markUnverified). The rows' Unverified and Partly checked say
  // what they mean when pointed at.)
  if (!PLANTS.length) {
    body.appendChild(el('div', { className: 'hint' }, 'The plant catalog is still loading (or could not load). Your own plants work either way.'));
  }

  // --- Results list (rebuilt in place so typing never destroys input focus) ---
  const countLine = el('div', { className: 'hint', 'data-testid': 'picker-count', style: { padding: '0 0 6px' } });
  const listWrap = el('div', {});
  /** The Sources section's "Where sources disagree, count both values" (the divider's Hide sets it too). */
  let reportedCheck: HTMLInputElement | null = null;
  // Rows opened to show their details (kept while the list is rebuilt by typing or filtering).
  const opened = new Set<string>();
  // Species whose cultivars were opened or closed by hand (kept likewise; otherwise a fold opens when filters keep
  // only some of its cultivars).
  const foldOpen = new Map<string, boolean>();
  // The by-season fold of "Blooming in" a month, opened or closed by hand (kept likewise, by month).
  const seasonOpen = new Map<string, boolean>();
  /** The less-sure groups, folded into a line with enough sure matches, opened by hand (kept while the picker's open). */
  let lessSureOpen = false;
  /** In "In this plan", the plants the filters would hide, and which filters. */
  const hiddenInPlan = new Map<string, string[]>();
  /**
   * The group a plant in the last list is in: 0 what its sources say fits; 1 a species that comes in a color asked
   * for among others; 2 what fits by what other sources say; 3 what fits only by the earlier list's word; 4, for a
   * clay bed, what no source rates for clay (Jason, Nov 2, answer D: below a divider); for a loam or sandy bed, what no
   * source rates for soil texture (Jason, Nov 4).
   */
  const groupOf = (p: Plant) => (noSoilRating.has(p.id) ? 4 : earlierFor.has(p.id) ? 3 : reportedOnly.has(p.id) ? 2 : comesIn.has(p.id) ? 1 : 0);
  const verb = swapping ? 'Swap' : linking ? 'Link' : forTree ? 'Pick' : state.placing ? 'Switch' : 'Place';
  /** A plant's Place (Swap, Link, Switch, Pick) button: on its row, and on its column in the comparison. */
  function useButton(p: Plant): HTMLButtonElement {
    // (A plant the law of the garden's state bans, found by name: the button says so, in red, as it's about to go on
    // the plan. No notice afterwards, nor any on the ones already there: Jason, Oct 31, from round 3: Kim swapped one
    // in unwarned. The law, not a national list: Jason, Oct 31.)
    const bad = bannedHere(p) && verb !== 'Link';
    const place = el('button', { className: 'btn place-btn' + (bad ? ' banned' : ''), 'data-testid': 'plant-place',
      'aria-label': `${verb === 'Link' ? 'Link to' : verb === 'Switch' ? 'Switch to' : verb === 'Swap' ? 'Swap for' : verb} ${p.common}${bad ? ' (banned here)' : ''}` },
      // (Short on the button, which shares the row with the name on a phone; the row's law line says where.)
      bad ? `${verb} (banned)` : verb);
    place.addEventListener('click', () => pick(p));
    return place;
  }
  // Two or three plants to compare (src/ui/compare-sheet.ts): chosen in their details, held while browsing, compared
  // over the picker. Changed in place, so the search keeps the keyboard.
  const compareHost: CompareHost = {
    get root() { return overlay; },
    useButton,
    changed: () => { syncCompareMarks(listWrap); compare.sync(); },
  };
  /**
   * A plant's row: tap it to open its details, or Place (Link, Pick) to use it.
   * Opening and closing change only this row, so the search box keeps the keyboard.
   */
  function buildRow(p: Plant, shownIn = -1, form?: SmallerForm) {
    // Its names and forms; then size, sun and hardiness (a hardiness that doesn't fit here in amber); then its marks.
    const lines = rowLines(p);
    const facts = el('div', { className: 'pmeta', 'data-testid': 'row-facts' }, [lines.size, lines.sun].filter(Boolean).join(' \u00b7 '));
    if (lines.hardy) {
      if (lines.size || lines.sun) facts.append(' \u00b7 ');
      // (Listed under "Other sources say these are hardy here too": its row says both, not just "Too cold here".
      // Round 3, Diego.)
      const others = !lines.hardy.ok && reportedOnly.get(p.id)?.includes('hardiness zones');
      facts.appendChild(el('span', { className: lines.hardy.ok ? '' : 'hardy-no', 'data-testid': 'row-hardy' }, others ? `${lines.hardy.text}, by its main sources; others say hardy` : lines.hardy.text));
    }
    // Its bloom months, short, behind a small flower (Jason, Nov 1, from the UI review); "Blooms" for screen readers.
    if (lines.bloom) {
      if (facts.childNodes.length) facts.append(' \u00b7 ');
      facts.appendChild(el('span', { className: 'row-bloom', 'data-testid': 'row-bloom' },
        el('span', { className: 'row-bloom-icon', 'aria-hidden': 'true', html: FLOWER_GLYPH }), el('span', { className: 'sr-only' }, 'Blooms '), lines.bloom));
    }
    // ("In this plan": how many of it, "× 4" (the UI review, 2026-11-01, decided "Build next").)
    const inPlanN = plantFilter.inPlan ? planCounts().get(p.id) ?? 0 : 0;
    const info = el('div', { className: 'pinfo' },
      el('div', { className: 'pname' }, slashBreaks(headName(p)), inPlanN ? el('span', { className: 'in-plan-n', 'data-testid': 'in-plan-count' }, ` \u00d7\u00a0${inPlanN}`) : null),
      lines.names ? el('div', { className: 'pmeta', 'data-testid': 'row-names' }, lines.names) : null,
      facts.childNodes.length ? facts : null,
    );
    const flags = rowFlags(p).map((f) => el('span', { className: `pflag ${f.kind}${f.kind === 'check' ? ' unverified-badge' : ''}`, 'data-testid': f.testid, ...(f.title ? { title: f.title } : {}) }, f.text));
    // Blooming in a month, by its season: our reading of the season, not a source's months (src/plants.ts bloomMatch).
    if (bySeason.has(p.id) && p.bloom_season?.length) {
      const why = `Blooms in ${joined(p.bloom_season, 'and')}: counted for ${bloomName(plantFilter.bloomMonth)} by its season`;
      flags.push(el('span', { className: 'pflag check season-badge', 'data-testid': 'by-season', title: why }, 'By season', el('span', { className: 'sr-only' }, ` (${why})`)));
    }
    // Shown above the divider that would say why it fits (a species heading its cultivars' fold): said on its row.
    const own = groupOf(p);
    if (shownIn >= 0 && own > shownIn) {
      if (own === 1) flags.push(el('span', { className: 'pflag check note-badge', 'data-testid': 'comes-in-flag' }, `Comes in ${joined(comesIn.get(p.id) ?? [], 'or')} among others`));
      if (own === 3) {
        const why = `Matches on ${joined(earlierFor.get(p.id) ?? [], 'and')} only by the earlier list (unverified)`;
        flags.push(el('span', { className: 'pflag check unverified-badge', 'data-testid': 'earlier-flag', title: why }, 'Earlier list only', el('span', { className: 'sr-only' }, ` (${why})`)));
      }
      if (own === 4) flags.push(el('span', { className: 'pflag check', 'data-testid': `no-${soilOn()}-flag` }, `No ${soilOn()} rating`));
    }
    // For a bed whose sun varies, a plant that takes only part of it says where (Jason, Nov 2, answer A: "some"); the
    // sun badge on the plan still catches one placed at the wrong end.
    const end = layer?.keys.sunRange ? sunFit(p, layer.keys.sunRange) : null;
    if (end && end !== 'all') flags.push(el('span', { className: 'pflag warn sun-end', 'data-testid': 'sun-end' }, SUN_END[end]));
    // (A smaller form of the plant being swapped: how wide it typically grows, and whether that fits where it's planted.)
    if (form) {
      const room = swapFix()?.smaller?.room;
      flags.push(el('span', { className: `pflag ${form.fits ? 'fit' : 'warn'}`, 'data-testid': 'smaller-fit' },
        form.fits ? `Typically ${fmtFt(form.width)} ft wide${room != null ? ': fits' : ''}` : `Typically ${fmtFt(form.width)} ft wide: wider than the ${fmtFt(room!)} ft there`));
    }
    const hidBy = hiddenInPlan.get(p.id);
    if (hidBy?.length) flags.push(el('span', { className: 'pflag warn', 'data-testid': 'filtered-in-plan' }, `Your filters would hide it: ${hidBy.join(', ')}`));
    if (flags.length) info.appendChild(el('div', { className: 'pflags' }, ...flags));
    // (Chosen to compare: said on its row while browsing.)
    info.appendChild(compareMark(p));
    // Why it matched, where its name doesn't say: what it hosts, another name it goes by, my notes.
    const q = readQuery(plantFilter.q);
    if (q) {
      const hit = matchPlant(p, q, true);
      if (!isMine(p) && matchedBy(p, plantFilter.q) === 'host') {
        const why = hostMatchText(p, q);
        if (why) info.appendChild(el('div', { className: 'pmatch', 'data-testid': 'host-match' }, why));
      } else if (hit?.also) info.appendChild(el('div', { className: 'pmatch', 'data-testid': 'match-also' }, `Also called ${hit.also}`));
      else if (hit?.was) info.appendChild(el('div', { className: 'pmatch', 'data-testid': 'match-was' }, `Formerly ${hit.was} (an older botanical name)`));
      else if (!hit && isMine(p) && inNotes(p, q)) info.appendChild(el('div', { className: 'pmatch', 'data-testid': 'match-notes' }, 'Found in your notes'));
    }
    // What the law says of it here, in short ("Prohibited in Arkansas"): seen without opening it.
    // (Red for a ban; amber where every line only lists it.)
    const law = regulatedHere(p);
    if (law.length) info.appendChild(el('div', { className: `plaw${law.every((r) => r.tier === 'listed') ? ' listed' : ''}`, 'data-testid': 'row-law' }, lawShort(law)));
    // Not native here, and recorded growing wild here all the same: seen without opening it too.
    const escape = escapeHere(p);
    if (escape) info.appendChild(el('div', { className: 'pescape', 'data-testid': 'row-escape' }, escapeShort(escape)));
    // (A small flower in its flowers' color, as its picture draws them (Jason, Oct 30), in a circle of its leaves'; a
    // plant whose flowers don't show, the circle alone (Jason, Nov 1, from the UI review). After its name and facts,
    // for a screen reader, though it's drawn first.)
    const spot = plantSpot(p);
    const dot = el('span', { className: 'row-spot', role: 'img', 'aria-label': spot.said, 'data-testid': 'row-dot', html: spot.svg });
    const flagged = reportedOnly.get(p.id);
    const chev = el('span', { className: 'row-open' + (flagged ? ' flagged' : '') },
      flagged ? el('span', { className: 'row-flag', 'data-testid': 'row-flag', title: 'Shown because of what other sources say' }, '!',
        el('span', { className: 'sr-only' }, ' (shown because of what other sources say)')) : null,
      el('span', { className: 'fold-chev', html: I.chevronDown }));
    // The plant itself is the button that opens its details (its name and summary are what a screen reader says);
    // Place and copy or edit sit beside it, not inside it.
    const toggle = el('button', { className: 'row-toggle', 'aria-expanded': 'false', 'data-testid': 'plant-row' }, info, dot, chev);
    const head = el('div', { className: 'proj-row', style: { alignItems: 'center' } }, toggle);
    const place = useButton(p);
    head.appendChild(place);
    if (place.classList.contains('banned')) head.classList.add('banned-row'); // (on a phone, copy under the wide button: src/styles.css)
    // Mine: edit. Catalog: copy as my own (a cultivar of it, say).
    const mine = isMine(p);
    const side = el('button', {
      className: 'iconbtn', html: mine ? I.edit : I.copy,
      title: mine ? 'Edit my plant' : 'Copy as my plant',
      'aria-label': (mine ? 'Edit ' : 'Copy as my plant: ') + p.common,
    });
    // (Edited or copied from here, back here: openForm. A copy, once saved, goes where the picker was going, as a plant
    // added here does: in hand to place, the plant switched to while placing, or linked. Jason, Nov 1, on his own plan:
    // a copy made in Switch plant came back to a search it wasn't even in.)
    side.addEventListener('click', () => openForm(mine ? { editId: p.id, place: false } : { copyFromId: p.id, place: true }));
    head.appendChild(side);
    if (mine) info.firstChild!.appendChild(el('span', { className: 'mine-badge' }, 'Mine'));
    // Now in the catalog too: offer its sourced facts (the person decides: src/ui/switch-plant.ts).
    const match = mine ? catalogMatchFor(p) : null;
    if (match) {
      const go = el('button', { className: 'link-btn', 'data-testid': 'switch-offer' }, 'Compare and switch\u2026');
      go.addEventListener('click', () => openSwitch(p.id, match.id));
      info.appendChild(el('div', { className: 'pmatch', 'data-testid': 'now-in-catalog' }, `Now in the catalog as ${match.common}. `, go));
    }
    const item = el('div', { className: 'plant-item' }, head);
    let details: HTMLElement | null = null;
    const setOpen = (open: boolean) => {
      toggle.setAttribute('aria-expanded', String(open));
      item.classList.toggle('open', open);
      if (open) { opened.add(p.id); details ??= plantDetails(p, flagged); addCompareToggle(details, p, compareHost); item.appendChild(details); }
      else { opened.delete(p.id); details?.remove(); }
    };
    toggle.addEventListener('click', () => setOpen(!opened.has(p.id)));
    if (opened.has(p.id)) setOpen(true);
    return item;
  }
  /**
   * "My plants" matching the search and the filters, as the catalog's plants are (Jason, 2026-10-27): one without
   * what a filter asks about (no deer rating, say) is left out while that filter is on, as a catalog plant is. Found
   * by name, as the catalog is searched, or with every word starting a word of their notes. `near` as for the catalog.
   */
  function myHits(near: boolean): Plant[] {
    const q = readQuery(plantFilter.q);
    const inPlan = plantFilter.inPlan ? plantIdsInPlan() : undefined;
    const shown = activeMyPlants().filter((p) => plantMatches(p, { ...plantFilter, q: '' }, inPlan));
    if (!q) return unsearchable(plantFilter.q) ? [] : shown;
    const hits = shown.flatMap((plant) => { const hit = matchPlant(plant, q, near) ?? (inNotes(plant, q) ? { rank: 3, order: 4 } : null); return hit ? [{ plant, hit }] : []; });
    return hits.sort(byMatch).map((x) => x.plant);
  }
  /** A plain link, below the results (Jason, Nov 1, from the UI review: as a button among them it read as a result). */
  function addLink(): HTMLElement {
    const q = readQuery(plantFilter.q) ? plantFilter.q.trim() : ''; // ("'" alone isn't a name)
    const b = el('button', { className: 'link-btn', 'data-testid': 'add-own-plant' },
      q ? `Add \u201c${q}\u201d as my plant` : 'Add your own plant');
    b.addEventListener('click', () => openForm({ name: q, place: true }));
    return el('div', { className: 'add-own' }, b);
  }
  refreshList = () => { if (listWrap.isConnected) rebuildList(); };
  /**
   * People and pets, as set by their own chips (or a filter chip's ×): kept with the plan (src/yard.ts), as the guided
   * introduction's step 6 does. Not "Clear filters" or "Show them": those are for the search at hand.
   */
  function keepYard(key: keyof PlantFilter) {
    // (A Swap opened from a warning: its filters are its own, put back as they were when it closes; taking one off
    // shows more plants to swap in, and says nothing of who's in the yard. Jason's UI review, Nov 2.)
    if (swapFiltersOn()) return;
    const k = yardKeyOf(key);
    if (k) { saveYard(yardOf(plantFilter), k); syncYard(); }
  }
  /** The list drawn again, with the bed's layer over the filters while one is planted for (src/bed-plant.ts). */
  function rebuildList() {
    if (layer) withFilters(layer.keys, buildList); else buildList();
    syncActive();
  }
  function buildList() {
    while (listWrap.firstChild) listWrap.removeChild(listWrap.firstChild);
    // Near spellings only when nothing searched matches closer, before any filter (search.ts); a plant of mine
    // found by its notes counts as a match.
    const q = readQuery(plantFilter.q);
    const near = nearShows(q, PLANTS, activeMyPlants());
    const mine = myHits(near).filter((p) => !forTree || isTree(p) || !p.form);
    if (setAside && setAside.q !== searchKey()) setAside = null;
    const aside = setAside;
    // "In this plan": every plant in the plan, whatever the filters; one they'd hide says so on its row (Ruth, Dana,
    // Oct 30: with the Kids filter on, the list left out the one plant in her bed that's poisonous, and said nothing).
    hiddenInPlan.clear();
    let hits: Plant[];
    if (plantFilter.inPlan) {
      const keys = (Object.keys(FILTER_NAMES) as (keyof PlantFilter)[]).filter((k) => k !== 'inPlan' && filterOn(plantFilter, k));
      const kept = new Set(filteredPlants(near).map((p) => p.id));
      hits = withFiltersOff(keys, () => filteredPlants(near));
      for (const p of hits) if (!kept.has(p.id)) hiddenInPlan.set(p.id, filtersHiding(p, keys));
    } else hits = aside ? withFiltersOff(aside.keys, () => filteredPlants(near)) : filteredPlants(near);
    // (Swapping: not the plant it is now. Priya, Oct 30: "Arkansas bluestar [Swap]" offered for itself.)
    const now = swapping ? new Set([state.pickerLinkId!, ...state.pickerLinkAlso].map((id) => state.shapes.find((x) => x.id === id)?.plantId)) : null;
    hits = hits.filter((p) => (!forTree || isTree(p)) && !now?.has(p.id));
    // (While browsing, what the state's law bans isn't offered: not counted, and said so; a search counts them.)
    const banned = PLANTS.filter(bannedHere);
    const out = bannedLeftOut(plantFilter) ? banned : [];
    const foundBanned = hits.filter(bannedHere).length;
    const n = hits.length + mine.length - foundBanned, all = PLANTS.length + activeMyPlants().length - banned.length;
    // (For a bed: those no source rates for clay aren't counted as fitting it; their divider says how many.)
    const unratedN = hits.filter((p) => noSoilRating.has(p.id)).length;
    // (Nothing matched as typed, only close spellings: said so, not counted as matches (Lena, Oct 30).)
    // ("In this plan": the plan's kinds, not a share of the catalog (Dana, Oct 30: "6 of 3,725 plants match").)
    const found = hits.length + mine.length;
    // ("In this plan": how many plants, and of how many kinds: "16 plants, 7 kinds in this plan". The UI review.)
    const counts = plantFilter.inPlan ? planCounts() : null;
    const inPlanPlants = counts ? [...hits, ...mine].reduce((n, p) => n + (counts.get(p.id) ?? 0), 0) : 0;
    countLine.textContent = (near ? `Nothing matches as typed${found ? ` \u00b7 ${countWord(found)} close spelling${found === 1 ? '' : 's'}` : ''}`
      : plantFilter.inPlan ? (found ? `${countWord(inPlanPlants)} plant${inPlanPlants === 1 ? '' : 's'}, ${countWord(found)} kind${found === 1 ? '' : 's'} in this plan${q ? ` match \u201c${plantFilter.q.trim()}\u201d` : ''}` : q ? `No plant in this plan matches \u201c${plantFilter.q.trim()}\u201d` : 'No plants placed in this plan yet')
      : pickerCount(n - unratedN, all, out.filter((p) => !forTree || isTree(p)).length, foundBanned, gardenStateName() ?? 'here', layer?.filtering ? layer.name : undefined)) +
      // (Not how to place one: Jason, Nov 4, note 1, "we can probably lose 'place a plant ...', leaving just how many
      // match, which saves us a line on my phone".)
      (swapping ? ' \u00b7 Pick the plant to swap in' : linking ? ' \u00b7 Link the plant this circle stands for' : forTree ? ' \u00b7 trees only' : '');
    // Too big for its spot (a Swap from crowding, or from a plant wider than its bed): the smaller forms of the same
    // plant first, smallest first, by their sources' sizes, each saying how wide it grows and whether that fits; then the
    // usual list, without them (Jason's UI review, Nov 2: "Blue Jean Baby for Russian sage"; never "plants like this").
    // Not while searching, or looking at "In this plan". The other filters count (who's in the yard), but not size.
    const fix = swapping ? swapFix() : null;
    const swappedOut = fix?.smaller ? plantsById[fix.smaller.plantId] : undefined;
    const small = swappedOut && !q && !plantFilter.inPlan
      ? smallerOf(fix!).filter((x) => !now?.has(x.plant.id) && plantMatches(x.plant, { ...plantFilter, width: '', height: '', q: '' }))
      : [];
    const smallIds = new Set(small.map((x) => x.plant.id));
    if (smallIds.size) hits = hits.filter((p) => !smallIds.has(p.id));
    if (swappedOut && small.length) {
      listWrap.appendChild(el('div', { className: 'list-heading', 'data-testid': 'smaller-forms' }, `Smaller forms of ${swappedOut.common}`));
      for (const x of small) listWrap.appendChild(buildRow(x.plant, -1, x));
      if (!mine.length && hits.length) listWrap.appendChild(el('div', { className: 'list-heading', 'data-testid': 'other-plants' }, 'Other plants'));
    }
    if (mine.length) {
      // My plants fold away (remembered on this device); a search always shows its matches, and "In this plan" its
      // plants (the bug hunt, Nov 1: with only plants of one's own placed, it said "2 plants, 2 kinds" over a folded
      // heading and nothing else).
      const searching = !!q || plantFilter.inPlan;
      const open = searching || !myPlantsFolded;
      const nowInCatalog = mine.filter((p) => catalogMatchFor(p)).length;
      const head = el('button', { className: 'list-heading fold', 'aria-expanded': String(open), 'data-testid': 'my-plants-fold' },
        el('span', {}, `My plants (${mine.length})` + (nowInCatalog ? ` \u00b7 ${nowInCatalog} now in the catalog` : '')), el('span', { className: 'fold-chev', html: I.chevronDown }));
      head.disabled = searching;
      head.addEventListener('click', () => {
        setMyPlantsFolded(open);
        rebuildList();
        listWrap.querySelector<HTMLElement>('[data-testid=my-plants-fold]')?.focus(); // keep the place (keyboards, screen readers)
      });
      listWrap.appendChild(head);
      if (open) for (const p of mine) listWrap.appendChild(buildRow(p));
      if (hits.length) listWrap.appendChild(el('div', { className: 'list-heading' }, 'Catalog'));
    }
    // In groups (decided with Jason, 2026-10-25): what its sources say fits; a species that comes in a color asked for
    // among others, below a divider; what fits by what other sources say, below another, with a way to hide them; what
    // fits only by the earlier list's word, below its own.
    // Cultivars fold under their species (decided with Jason, 2026-10-26: a cultivar has a record of its own, and a
    // list isn't a wall of them): the species' row, then "13 cultivars" to open. A search folds a cultivar only where
    // its species (or heading) answers the search too: "pecan" finds Pecan, its cultivars under it; "kanza", or "rise"
    // in 'Sunrise', finds the cultivar, on a row of its own. Filters look inside a fold, and one that keeps only some
    // of a species' cultivars opens it to them ("2 of 14 cultivars match your filters"), the species shown even where
    // it doesn't match itself. A species shows once, in the first group it or a cultivar of it is in. A fold that's
    // the only thing found opens (Jason, 2026-10-26).
    // Blooming in a month: the plants with months for it, in those groups, first; the ones it counts only by their
    // season after them all, in a fold that says why (Jason, Nov 1, from the UI review). Their rows say what their group
    // would have (buildRow), as a species shown above its divider does.
    const groups = [0, 1, 2, 3, 4].map((g) => hits.filter((p) => groupOf(p) === g && !bySeason.has(p.id)));
    const bySeasonOnly = hits.filter((p) => bySeason.has(p.id));
    const filtering = activeChips().length > 0 || plantFilter.inPlan || (plantFilter.hardyHere && !!state.location) || !!layer?.filtering;
    const hitIds = new Set(hits.map((p) => p.id));
    const at = new Map(hits.map((p, i) => [p.id, i]));
    const folded = new Map<string, Plant[]>(); // (a fold's head, a species or a group: its cultivars the list has, in its order)
    const alone = new Set<string>(); // (cultivars the search found but not their species: on rows of their own)
    const answers = new Map<string, boolean>(); // (whether a head answers the search itself, filters aside)
    const headAnswers = (head: Plant) => {
      if (!answers.has(head.id)) answers.set(head.id, !q || matchPlant(head, q, near) !== null);
      return answers.get(head.id)!;
    };
    for (const p of hits) {
      const head = foldHeadOf(p);
      if (!head || (forTree && !isGroupHead(head) && !isTree(head))) continue;
      if (!headAnswers(head)) { alone.add(p.id); continue; }
      folded.set(head.id, [...(folded.get(head.id) ?? []), p]);
    }
    /**
     * What a head's fold holds, or null for none. Matching (or a group, which no search finds itself): the cultivars
     * the list has. Browsing or a search alone: a species' every cultivar (the search found the species; its
     * cultivars are what it comes as). Never one the list leaves out whatever the search (not a tree while picking
     * one, one the state's law bans while browsing), nor one on a row of its own. Fewer than MIN_FOLD isn't a fold: they're rows
     * of their own (Jason, 2026-10-26: "Roses (2) should have just been in the list").
     */
    const foldMemo = new Map<string, { all: Plant[]; kids: Plant[] } | null>();
    const foldFor = (head: Plant) => {
      if (!foldMemo.has(head.id)) {
        const all = cultivarsOf(head).filter((c) => !alone.has(c.id) && (!forTree || isTree(c)) && !(bannedLeftOut(plantFilter) && bannedHere(c)));
        // (In the list's order: best matches, else by name; any the search didn't find after them.)
        const kids = filtering || isGroupHead(head) ? folded.get(head.id) ?? []
          : [...all].sort((a, b) => (at.get(a.id) ?? Infinity) - (at.get(b.id) ?? Infinity) || a.common.localeCompare(b.common));
        foldMemo.set(head.id, kids.length >= MIN_FOLD && (!forTree || isGroupHead(head) || isTree(head)) ? { all, kids } : null);
      }
      return foldMemo.get(head.id)!;
    };
    const placed = new Set<string>();
    const [sourced, species, others, earlier, unrated, seasonal] = [...groups, bySeasonOnly].map((g) => {
      const out = g.flatMap((p) => {
        const head = foldHeadOf(p);
        const row = head && !alone.has(p.id) && foldFor(head)?.kids.includes(p) ? head : p;
        if (placed.has(row.id)) return [];
        placed.add(row.id);
        return [row];
      });
      // (Browsing, by name: a heading at its own name, not its first cultivar's: Roses under R, not Climbing rose's C.)
      return q ? out : out.sort((a, b) => a.common.localeCompare(b.common));
    });
    // (The only thing found, a fold: open, unless it was closed by hand.)
    const shownMine = mine.length && (!!q || !myPlantsFolded) ? mine.length : 0;
    const above = sourced.length + species.length + others.length + earlier.length + unrated.length + shownMine;
    const sole = above + seasonal.length === 1;
    /** The fold's line, and its cultivars under it when open. `say`: what the line says; `toggle`: the button. */
    const foldBlock = (head: Plant, g: number, kids: Plant[], toggle: HTMLElement, open: boolean) => {
      const list = el('div', { className: 'cultivar-list', 'data-testid': 'cultivar-list' });
      const show = (o: boolean) => {
        toggle.setAttribute('aria-expanded', String(o));
        list.replaceChildren(...(o ? kids.map((c) => buildRow(c, g)) : []));
      };
      toggle.addEventListener('click', () => { const o = toggle.getAttribute('aria-expanded') !== 'true'; foldOpen.set(head.id, o); show(o); });
      show(foldOpen.get(head.id) ?? open);
      return list;
    };
    /** A row, with a species' fold of its cultivars under it; or a group's heading, which is its fold. */
    const rowWithFold = (p: Plant, g: number) => {
      const fold = foldFor(p);
      if (isGroupHead(p)) {
        if (!fold) return;
        const { all, kids } = fold;
        const narrowed = kids.length < all.length;
        const count = narrowed ? `${countWord(kids.length)} of ${countWord(all.length)} cultivars match${filtering ? ' your filters' : ''}` : `${countWord(kids.length)} cultivars`;
        // (Not a plant: nothing to place. The whole heading opens and closes it.)
        const toggle = el('button', { className: 'row-toggle group-head', 'aria-expanded': 'false', 'data-testid': 'group-head' },
          // (Its dot in the middle of where a plant's spot is, so the column lines up: 20 px and its space.)
          el('div', { style: { width: '14px', height: '14px', borderRadius: '50%', flex: 'none', background: plantColor(kids[0]), margin: '0 7px 0 3px' } }),
          el('div', { className: 'pinfo' }, el('div', { className: 'pname' }, slashBreaks(p.common)), el('div', { className: 'pmeta', 'data-testid': 'group-count' }, `${p.botanical} \u00b7 ${count}`)),
          el('span', { className: 'row-open' }, el('span', { className: 'fold-chev', html: I.chevronDown })));
        const item = el('div', { className: 'plant-item group-item' }, el('div', { className: 'proj-row', style: { alignItems: 'center' } }, toggle));
        listWrap.append(el('div', { className: 'cultivars group', 'data-testid': 'cultivar-group' }, item, foldBlock(p, g, kids, toggle, (filtering && narrowed) || sole)));
        return;
      }
      listWrap.appendChild(buildRow(p, g));
      if (!fold) return;
      const { all, kids } = fold;
      const narrowed = filtering && (kids.length < all.length || !hitIds.has(p.id));
      const say = narrowed ? `${countWord(kids.length)} of ${countWord(all.length)} cultivars match your filters${hitIds.has(p.id) ? '' : '; the species itself doesn\u2019t'}`
        : `${countWord(kids.length)} cultivars`;
      const toggle = el('button', { className: 'cultivar-fold', 'data-testid': 'cultivar-fold', 'aria-expanded': 'false' }, el('span', { className: 'fold-chev', html: I.chevronDown }), el('span', {}, say));
      listWrap.append(el('div', { className: 'cultivars', 'data-testid': 'cultivars' }, toggle, foldBlock(p, g, kids, toggle, narrowed || sole)));
    };
    // (Each group up to 60 rows, so a long first group never hides the others.)
    const rows = (ps: Plant[], g: number) => {
      for (const p of ps.slice(0, 60)) rowWithFold(p, g);
      if (ps.length > 60) listWrap.appendChild(el('div', { className: 'hint', style: { padding: '8px 0' } }, `+ ${countWord(ps.length - 60)} more \u2014 narrow the filters to see them`));
    };
    rows(sourced, 0);
    if (species.length) {
      const colors = plantFilter.flowerColors.filter((c) => species.some((p) => comesIn.get(p.id)?.includes(c)));
      listWrap.appendChild(el('div', { className: 'list-divider', 'data-testid': 'comes-in-divider' },
        el('span', {}, `Also comes in ${joined(colors, 'or')}, depending on the plant you buy`)));
      rows(species, 1);
    }
    // The less-sure groups only when the sure ones are too few to fill the pane; past that, one line says how many
    // more might fit, and opens them (Jason, Nov 4: "It feels odd to show some plants that fit the filters, then cut
    // them off, only to show some more plants we're less sure match the filters they've already used"). Not while
    // searching by name, which finds every plant as before, nor in "In this plan".
    const lessSure = others.length + earlier.length;
    const lessSureFolded = lessSure > 0 && !q && !plantFilter.inPlan && !lessSureOpen && sourced.length + species.length >= SURE_ENOUGH;
    if (lessSureFolded) {
      const say = others.length && earlier.length ? 'other sources or the earlier list say fit' : others.length ? 'other sources say fit' : 'only the earlier list (unverified) says fit';
      const open = el('button', { className: 'list-divider season-fold less-sure-fold', 'aria-expanded': 'false', 'data-testid': 'less-sure' },
        el('span', { className: 'fold-chev', html: I.chevronDown }), el('span', {}, `Show ${countWord(lessSure)} more that ${say}`));
      open.addEventListener('click', () => {
        lessSureOpen = true;
        rebuildList();
        // (The place kept, for a keyboard or a screen reader: the first group opened.)
        listWrap.querySelector<HTMLElement>('[data-testid=hide-others], [data-testid=earlier-divider] + .plant-item [data-testid=plant-row]')?.focus({ preventScroll: true });
      });
      listWrap.appendChild(open);
    }
    if (others.length && !lessSureFolded) {
      const hide = el('button', { className: 'link-btn', 'data-testid': 'hide-others' }, 'Hide these');
      hide.addEventListener('click', () => { plantFilter.withReported = false; if (reportedCheck) reportedCheck.checked = false; rebuildList(); });
      listWrap.appendChild(el('div', { className: 'list-divider', 'data-testid': 'others-divider' },
        el('span', {}, `Other sources say these ${reportedPhrase(others.flatMap((p) => reportedOnly.get(p.id) ?? []), plantFilter)} too`), hide));
      rows(others, 2);
    }
    // Hidden: say how many, and offer them back.
    const hiddenOthers = !plantFilter.withReported && hits.length + mine.length > 0 ? othersHidden() : 0;
    if (hiddenOthers) {
      const show = el('button', { className: 'link-btn', 'data-testid': 'show-others' }, 'Show them');
      show.addEventListener('click', () => { plantFilter.withReported = true; if (reportedCheck) reportedCheck.checked = true; rebuildList(); });
      listWrap.appendChild(el('div', { className: 'hint list-note', 'data-testid': 'others-hidden' },
        `${countWord(hiddenOthers)} more fit by what other sources say. `, show));
    }
    if (earlier.length && !lessSureFolded) {
      const on = [...new Set(earlier.flatMap((p) => earlierFor.get(p.id) ?? []))];
      listWrap.appendChild(el('div', { className: 'list-divider earlier', 'data-testid': 'earlier-divider' },
        el('span', {}, `These match on ${on.length > 1 ? `${on.slice(0, -1).join(', ')} and ${on[on.length - 1]}` : on[0]} only by the earlier list (unverified). No source we've read says so yet.`)));
      rows(earlier, 3);
    }
    // For a clay bed, what no source rates for clay, below a divider (Jason, Nov 2, answer D): listed, not hidden. For a
    // loam or sandy bed, what no source rates for soil texture, the same way (Jason, Nov 4).
    if (unrated.length) {
      const soil = soilOn();
      listWrap.appendChild(el('div', { className: 'list-divider earlier', 'data-testid': `no-${soil}-divider` },
        el('span', {}, `No source we've read says how these do in ${soil === 'sand' ? 'sandy soil' : soil} (${countWord(unratedN)})`)));
      rows(unrated, 4);
    }
    if (seasonal.length) {
      // (Folded, unless nothing is above it, or it was opened by hand for this month.)
      const month = plantFilter.bloomMonth, m = bloomName(month), season = SEASONS.find((s) => seasonMonths(s).includes(Number(month))) ?? '';
      const n = bySeasonOnly.length;
      const toggle = el('button', { className: 'list-divider season-fold', 'aria-expanded': 'false', 'data-testid': 'season-fold' },
        el('span', { className: 'fold-chev', html: I.chevronDown }), el('span', {}, `By season only: ${countWord(n)} more`));
      const why = el('div', { className: 'hint list-note', 'data-testid': 'season-why' },
        `Their sources give a season, not months, and we count ${m} as ${season}. ` + (state.location
          ? 'There aren’t enough flowering records near the garden to give their months.'
          : 'Your ZIP adds months from flowering records near the garden, where there are enough.'));
      const list = el('div', { 'data-testid': 'season-list' });
      const show = (o: boolean) => {
        toggle.setAttribute('aria-expanded', String(o));
        list.replaceChildren();
        if (!o) return;
        const from = listWrap.childNodes.length;
        rows(seasonal, 0);
        list.append(...[...listWrap.childNodes].slice(from));
      };
      toggle.addEventListener('click', () => { const o = toggle.getAttribute('aria-expanded') !== 'true'; seasonOpen.set(month, o); show(o); });
      listWrap.append(toggle, why, list);
      show(seasonOpen.get(month) ?? above === 0);
    }
    // Typically within "up to N ft", but able to grow past it: below the rest, said so (Jason, Oct 30). Height and
    // width alike (Oct 31).
    const ceiling = aside?.keys.includes('height') ? undefined : plantFilter.height.split('-')[1];
    const across = aside?.keys.includes('width') ? undefined : plantFilter.width.split('-')[1];
    if ((ceiling || across) && !plantFilter.inPlan) {
      const shown = new Set(hits.map((p) => p.id));
      const run = () => (aside ? withFiltersOff(aside.keys, () => filteredPlants(near)) : filteredPlants(near));
      const taller = byTypicalHeight(run).filter((p) => !shown.has(p.id) && (!forTree || isTree(p)) && !now?.has(p.id) && !smallIds.has(p.id));
      if (taller.length) {
        listWrap.appendChild(el('div', { className: 'list-divider', 'data-testid': 'taller-divider' },
          el('span', {}, ceiling && across ? `Typically up to ${ceiling} ft tall and ${across} ft wide, but they can grow larger`
            : ceiling ? `Typically ${ceiling} ft or less, but they can grow taller` : `Typically ${across} ft wide or less, but they can grow wider`)));
        for (const p of taller.slice(0, 60)) listWrap.appendChild(buildRow(p, 0));
      }
      run(); // (the list above's notes, as they were)
    }
    // A search the filters emptied, or thinned: which ones, and a way to see the plants anyway, taking off only those
    // filters (Marcus, Oct 30: "Show them" cleared every filter, though it named one). With some found, said above them
    // (Ruth searched "milkweed" with "Not poisonous" on, from the tour's Kids, and found none she knew).
    const why = q && !aside ? hiddenByFilters() : null;
    const more = why ? why.n - hits.length : 0;
    if (aside) {
      const back = el('button', { className: 'link-btn', 'data-testid': 'filters-back' }, 'Filter them again');
      back.addEventListener('click', () => { setAside = null; rebuildList(); });
      listWrap.insertBefore(el('div', { className: 'hint', style: { padding: '8px 0' }, 'data-testid': 'set-aside' },
        layer && aside.keys.every(setByBed)
          ? `Showing what ${layer.name}'s conditions hid for \u201c${plantFilter.q.trim()}\u201d (${hidSaid(aside.keys, aside.names).replace(/^[^:]*: /, '')}). They're still on for your next search. `
          : `Showing what your filters hid for \u201c${plantFilter.q.trim()}\u201d (${aside.names.join(', ')}). They're still on for your next search. `, back), listWrap.firstChild);
    }
    if (why && more > 0) {
      const show = el('button', { className: 'link-btn', 'data-testid': 'show-hidden' }, 'Show them');
      show.addEventListener('click', () => { setAside = { q: searchKey(), keys: why.keys, names: why.names }; rebuildList(); });
      const note = el('div', { className: 'hint', style: { padding: '8px 0' }, 'data-testid': 'hidden-by' },
        `${hits.length ? `${countWord(more)} more` : countWord(more)} plant${more === 1 ? ' matches' : 's match'} \u201c${plantFilter.q.trim()}\u201d, hidden by ${hidSaid(why.keys, why.names)}. `, show);
      if (hits.length || mine.length) listWrap.insertBefore(note, listWrap.firstChild); else listWrap.appendChild(note);
    }
    if (hits.length === 0 && mine.length === 0) {
      // (In a plan with nothing placed, "In this plan" says so above: no "loosen a filter" with none on. Round 3, Sam.)
      if ((!why || more <= 0) && !(plantFilter.inPlan && !plantFilter.q.trim())) {
        // ("…or loosen a filter" only with one on: the bug hunt, Nov 1, "sweet shade" with none.)
        listWrap.appendChild(el('div', { className: 'hint', style: { padding: '8px 0' }, 'data-testid': 'no-matches' },
          `No matches. Add it as your own plant${filtering ? ', or loosen a filter' : ''}.`));
      }
    }
    // Always offer to add a plant, below the results; right under the search when nothing matched as typed (close
    // spellings are guesses: say so above them).
    // (Below the note that the filters hid some: that's the answer, not a plant of one's own (Ruth, Oct 30).)
    if (near && hits.length + mine.length) {
      listWrap.insertBefore(el('div', { className: 'hint', style: { padding: '0 0 6px' }, 'data-testid': 'near-note' },
        `Nothing matches \u201c${plantFilter.q.trim()}\u201d as typed. Close spellings:`), listWrap.firstChild);
      listWrap.insertBefore(addLink(), listWrap.firstChild);
    } else listWrap.appendChild(addLink());
  }

  /**
   * The filters that hide what a search finds, by name ("Sun: Shade", "Host plant"), and how many plants they hide.
   * Null when the search finds nothing even without them.
   */
  function hiddenByFilters(): { n: number; names: string[]; keys: (keyof PlantFilter)[] } | null {
    const inPlan = plantIdsInPlan();
    const keep = { q: plantFilter.q, withReported: plantFilter.withReported };
    const base: PlantFilter = { ...PLANT_FILTER_DEFAULTS, ...keep };
    const found = PLANTS.filter((p) => (!forTree || isTree(p)) && reportedMatch(p, base, inPlan) !== null);
    if (!found.length) return null;
    const names: string[] = [], keys: (keyof PlantFilter)[] = [];
    for (const [k, name] of Object.entries(FILTER_NAMES) as [keyof PlantFilter, (f: PlantFilter) => string][]) {
      if (!filterOn(plantFilter, k)) continue;
      if (found.some((p) => reportedMatch(p, { ...base, [k]: plantFilter[k] }, inPlan) === null)) { names.push(nameOf(k, name)); keys.push(k); }
    }
    return names.length ? { n: found.length, names: oneEdible(keys, names), keys } : null;
  }
  /** A filter by name, as "hidden by" says it: one the bed planted for sets, by the bed and its part ("Front bed: Clay"). */
  function nameOf(k: keyof PlantFilter, name: (f: PlantFilter) => string): string {
    return layer && setByBed(k) ? `${layer.name}: ${partName(PART_OF[k]!, layer.rules)}` : name(plantFilter);
  }
  /** Who hid them: "your filters: Sun: Shade", or, the bed's alone, "Front bed: Clay" (Jason, Nov 2: nothing hidden silently). */
  function hidSaid(keys: (keyof PlantFilter)[], names: string[]): string {
    if (layer && keys.length && keys.every(setByBed)) return `${layer.name}: ${[...new Set(keys.map((k) => partName(PART_OF[k]!, layer!.rules)))].join(', ')}`;
    return `your filters: ${names.join(', ')}`;
  }
  /** "Edible fruit" says Edible already: one name for the two (round 3: "…, Edible, Edible fruit"). */
  function oneEdible(keys: (keyof PlantFilter)[], names: string[]): string[] {
    const e = keys.indexOf('edible');
    if (e < 0 || !plantFilter.edibleParts.length) return names;
    const out = [...names];
    if (keys.includes('edibleParts')) out.splice(e, 1); else out[e] = FILTER_NAMES.edibleParts!(plantFilter);
    return out;
  }
  /** The filters on that would hide this plant, by name. */
  function filtersHiding(p: Plant, keys: (keyof PlantFilter)[]): string[] {
    const inPlan = plantIdsInPlan();
    const base: PlantFilter = { ...PLANT_FILTER_DEFAULTS, q: plantFilter.q, withReported: plantFilter.withReported };
    const hiding = keys.filter((k) => reportedMatch(p, { ...base, [k]: plantFilter[k] }, inPlan) === null);
    return oneEdible(hiding, hiding.map((k) => nameOf(k, FILTER_NAMES[k]!)));
  }
  /** How many more plants the list would show with what other sources say counted (while it's hidden). */
  function othersHidden(): number {
    const was = plantFilter.withReported;
    plantFilter.withReported = true;
    try { return filteredPlants(nearShows(readQuery(plantFilter.q), PLANTS, activeMyPlants())).filter((p) => !forTree || isTree(p)).filter((p) => reportedOnly.has(p.id)).length; }
    finally { plantFilter.withReported = was; filteredPlants(nearShows(readQuery(plantFilter.q), PLANTS, activeMyPlants())); }
  }
  /**
   * Clear the filters; the search stays, and so does the fold, open or not. "In this plan" (beside the search)
   * stays too, unless `all` (a search the filters emptied: "Show them").
   */
  function resetFilters(all = false) {
    const { q, inPlan, hardyHere } = plantFilter;
    // (Hardy in the garden's zone sits beside the filters, not among them: it stays.)
    Object.assign(plantFilter, PLANT_FILTER_DEFAULTS, { q, inPlan: !all && inPlan, hardyHere });
    render(); // full rebuild so every control shows its cleared value
  }
  /**
   * The filters that are on, a chip each (a list filter, a chip a value), with how to take it off. Not "In this plan",
   * shown beside the search; not a filter that does nothing yet (hardy or native here with no ZIP).
   */
  function activeChips(): { key: keyof PlantFilter; text: string; clear: () => void }[] {
    const out: { key: keyof PlantFilter; text: string; clear: () => void }[] = [];
    for (const [k, name] of Object.entries(FILTER_NAMES) as [keyof PlantFilter, (f: PlantFilter) => string][]) {
      // (Not "In this plan", beside the search, nor "Hardy in zone N", beside Filters: each shows as its own box.)
      if (k === 'inPlan' || k === 'hardyHere' || !filterOn(plantFilter, k)) continue;
      // (Nor a filter the bed planted for sets: its box shows those, the person's own set aside meanwhile.)
      if (setByBed(k) || k === 'sunRange' || k === 'clayBed' || k === 'soilBed') continue;
      if (k === 'native' && plantFilter.native === '@here' && !gardenStateName()) continue;
      // ("Edible fruit" says Edible already.)
      if (k === 'edible' && plantFilter.edibleParts.length) continue;
      const v = plantFilter[k];
      if (Array.isArray(v)) {
        const lk = k as ListKey;
        for (const x of v) out.push({ key: k, text: LIST_ONE[lk](x), clear: () => { plantFilter[lk] = plantFilter[lk].filter((y) => y !== x); } });
      } else out.push({ key: k, text: name(plantFilter), clear: () => { Object.assign(plantFilter, { [k]: PLANT_FILTER_DEFAULTS[k] }); } });
    }
    return out;
  }

  // --- Filter controls (all update the list in place; no full render) ---
  const search = el('input', { type: 'text', value: plantFilter.q, placeholder: 'Search plants or butterflies\u2026', 'data-testid': 'plant-search', 'aria-label': 'Search plants, or a butterfly whose caterpillars eat them' });
  // Clear (×): the search emptied in one tap, the keyboard kept (the list redraws, nothing else).
  const clearSearch = el('button', { className: 'search-clear', html: I.x, 'aria-label': 'Clear the search', 'data-testid': 'clear-search' });
  clearSearch.hidden = !plantFilter.q;
  clearSearch.addEventListener('click', () => { search.value = ''; plantFilter.q = ''; clearSearch.hidden = true; foldTops(false); rebuildList(); search.focus(); });
  search.addEventListener('input', (e) => {
    keptSearch = false;
    const typed = !!search.value.trim();
    // (Not while a phone's keyboard is still composing the word: what it's composing is left as it is.)
    if (!(e as InputEvent).isComposing) takeNeeds(false);
    plantFilter.q = search.value; clearSearch.hidden = !search.value;
    if (typed) foldForSearch();
    // (Words typed fold the question away; the search emptied by hand brings it back. Words of need made filters empty
    // it too, while typing: those leave it folded.)
    foldTops(typed);
    rebuildList();
  });
  // (A word finished by picking it from a phone keyboard's suggestions.)
  search.addEventListener('compositionend', () => { if (takeNeeds(false)) { plantFilter.q = search.value; rebuildList(); } });
  // Enter: the search is done, its last word too. On a phone the keyboard goes, for the results.
  search.enterKeyHint = 'search';
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (takeNeeds(true)) { plantFilter.q = search.value; clearSearch.hidden = !search.value; rebuildList(); }
    if (!hasKeyboard()) search.blur();
  });
  /**
   * Words of need in the search, made filters (src/search-needs.ts: Jason, Nov 1, from the UI review): "shade flowers"
   * is Part shade and Has flowers, their chips with the other filters', and the words gone from the search. The field
   * keeps the keyboard: its text and its filters' controls change in place. `final`: Enter, so its last word counts as
   * finished.
   */
  function takeNeeds(final: boolean): boolean {
    const forms = (PLANT_META?.enums?.form ?? []) as string[];
    const r = readNeeds(search.value, namesForNeeds(), {
      caret: search.selectionStart ?? undefined, final,
      can: (s) => s.key !== 'form' || forms.includes(s.value), // (a form the catalog has)
      on: needOn, // ("soil" after "wet ", its filter set: gone too)
    });
    if (!r) return false;
    for (const s of r.sets) setNeed(s);
    const focused = document.activeElement === search;
    search.value = r.text;
    if (focused) search.setSelectionRange(r.caret, r.caret);
    clearSearch.hidden = !search.value;
    syncControls();
    return true;
  }
  /** Whether a need's filter is set as it would set it. */
  function needOn(s: NeedSet): boolean {
    if (s.key === 'flowerColors') return plantFilter.flowerColors.includes(s.add);
    if (s.key === 'native') return plantFilter.native !== '';
    return plantFilter[s.key] === s.value;
  }
  function setNeed(s: NeedSet) {
    if (s.key === 'flowerColors') { if (!plantFilter.flowerColors.includes(s.add)) plantFilter.flowerColors = [...plantFilter.flowerColors, s.add]; }
    // (Native to the garden's state where its ZIP is known: Kew's checklist. Without, the earlier list's North America.)
    else if (s.key === 'native') plantFilter.native = gardenStateName() ? '@here' : '@na';
    else Object.assign(plantFilter, { [s.key]: s.value });
  }
  /** "Hide plants rated toxic to:", first among the filters, folded away, or back (typingFold). */
  function foldTops(on: boolean) {
    typingFold = on;
    if (topLine) topLine.hidden = on;
  }
  /**
   * Typing a search: open filters fold, so its results are what's in view (Jason, Nov 1, from the UI review: on a
   * phone they took the screen while the list changed out of sight). Kept folded, as a fold closed by hand is; the
   * filters' chips stay above the list.
   */
  function foldForSearch() {
    if (!filtersOpen) return;
    setFiltersOpen(false);
    filtersBtn.setAttribute('aria-expanded', 'false');
    all.hidden = true;
  }
  // (A search kept from the last time: the first tap in it selects it, so typing starts a new one rather than adding
  // to it: round 3, "coneflowerbee balm". After the tap, so the tap's own caret doesn't undo it.)
  search.addEventListener('focus', () => {
    if (!keptSearch) return;
    keptSearch = false;
    setTimeout(() => { if (document.activeElement === search) search.select(); }, 0);
  });

  const enums = (PLANT_META && PLANT_META.enums) || {};
  type StringKey = { [K in keyof PlantFilter]: PlantFilter[K] extends string ? (string extends PlantFilter[K] ? K : never) : never }[keyof PlantFilter];
  type BoolKey = { [K in keyof PlantFilter]: PlantFilter[K] extends boolean ? K : never }[keyof PlantFilter];
  type Opt = [value: string, text: string];
  /** Each control, set again from the filters as they now are: a word of need in the search set one (takeNeeds). */
  const syncers: (() => void)[] = [];
  const syncControls = () => { for (const f of syncers) f(); syncSetBy(); };
  /**
   * A dropdown, its first option the unset one ("Any form"). `name` says what it filters, for screen readers; set, it
   * names itself where its value alone wouldn't ("Water needs: low"): `selected` words the chosen option.
   */
  function mkSelect(key: StringKey, first: string, options: (Opt | { group: string; options: Opt[] })[], o: { name: string; selected?: (value: string, text: string) => string; testid?: string }) {
    const sel = el('select', { 'aria-label': o.name, 'data-testid': o.testid });
    const all: HTMLOptionElement[] = [];
    const option = ([value, text]: Opt) => {
      const opt = el('option', { value }, text);
      opt.dataset.text = text;
      opt.selected = String(plantFilter[key]) === value;
      all.push(opt);
      return opt;
    };
    sel.appendChild(option(['', first]));
    for (const x of options) sel.appendChild(Array.isArray(x) ? option(x) : el('optgroup', { label: x.group }, x.options.map(option)));
    const relabel = () => { for (const opt of all) opt.textContent = opt.selected && opt.value && o.selected ? o.selected(opt.value, opt.dataset.text!) : opt.dataset.text!; };
    relabel();
    sel.addEventListener('change', () => { plantFilter[key] = sel.value; relabel(); rebuildList(); });
    syncers.push(() => { sel.value = String(plantFilter[key]); relabel(); });
    // (Set by the bed planted for: "Set by Front bed", the person's own kept as it was, for Anywhere again.)
    if (SET_BY_BED.includes(key)) {
      const by = el('option', { value: '@bed', 'data-testid': 'set-by' });
      by.hidden = true;
      sel.appendChild(by);
      setBySyncers.push(() => {
        const on = setByBed(key);
        sel.disabled = on; by.hidden = !on;
        sel.title = on ? `${o.name}: set by ${layer!.name}` : '';
        if (on) { by.textContent = `Set by ${layer!.name}`; sel.value = '@bed'; } else { sel.value = String(plantFilter[key]); relabel(); }
      });
    }
    return el('div', { className: 'field', style: { flex: '1', minWidth: '0' } }, sel);
  }
  function mkCheck(label: Child, key: BoolKey, testid?: string) {
    const cb = el('input', { type: 'checkbox', 'data-testid': testid });
    if (key === 'withReported') reportedCheck = cb;
    cb.checked = !!plantFilter[key];
    syncers.push(() => { cb.checked = !!plantFilter[key]; });
    cb.addEventListener('change', () => { plantFilter[key] = cb.checked; keepYard(key); rebuildList(); });
    // (Set by the bed planted for: ticked as the bed has it, "Set by Front bed", the person's own kept as it was.)
    const by = el('span', { className: 'hint set-by', 'data-testid': 'set-by', hidden: true });
    if (SET_BY_BED.includes(key)) {
      setBySyncers.push(() => {
        const on = setByBed(key);
        cb.disabled = on; by.hidden = !on;
        by.textContent = on ? `Set by ${layer!.name}` : '';
        cb.checked = on ? !!(layer!.keys[key] || (key === 'clayOk' && layer!.keys.clayBed)) : !!plantFilter[key];
      });
    }
    return el('label', { className: 'filter-check' + (SET_BY_BED.includes(key) ? ' bed-set' : '') }, cb, label, by);
  }
  /** One value of a list filter, ticked or not: a plant with any value ticked passes. */
  function listToggle(key: ListKey, value: string, label: Child, className: string) {
    const cb = el('input', { type: 'checkbox', value });
    cb.checked = plantFilter[key].includes(value);
    const box = el('label', { className: className + (cb.checked ? ' on' : '') }, cb, label);
    syncers.push(() => { cb.checked = plantFilter[key].includes(value); box.classList.toggle('on', cb.checked); });
    cb.addEventListener('change', () => {
      plantFilter[key] = cb.checked ? [...plantFilter[key], value] : plantFilter[key].filter((v) => v !== value);
      box.classList.toggle('on', cb.checked);
      rebuildList();
    });
    return box;
  }
  /** Colors to tick, in a row that scrolls sideways (a chip each, with its swatch). */
  const colorChips = (key: 'flowerColors' | 'leafColors', colors: string[], name: string, testid: string) =>
    el('div', { className: 'color-chips', role: 'group', 'aria-label': name, 'data-testid': testid },
      el('span', { className: 'chips-label' }, name),
      colors.map((c) => listToggle(key, c, [el('span', { className: 'swatch', style: { background: SWATCHES[c] ?? '#d6d3d1' } }), cap(c)], 'color-chip')));
  function row(...kids: Child[]) {
    return el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } }, ...kids);
  }
  const checks = (...kids: Child[]) => el('div', { className: 'filter-checks' }, ...kids);
  /** A set of ticks that work together (any one will do), boxed and named apart from the ticks that each narrow the list. */
  const anyOf = (legend: string, testid: string, ticks: Child[], ...after: Child[]) =>
    el('fieldset', { className: 'filter-set', 'data-testid': testid }, el('legend', {}, legend), el('div', { className: 'filter-checks' }, ticks), ...after);
  const spreadUnverified = PLANTS.some((p) => spreadWays(p) && [p.prov?.self_seed, p.prov?.habit].some((pv) => !pv || pv.src.every((s) => PLANT_META?.sources?.[s]?.trust === 'unverified')));
  const groupHead = (text: string) => el('div', { className: 'filter-group' }, text);

  // ---- ALWAYS IN VIEW: the filters that judge nearly every plant (decided with Jason, 2026-10-25) ----
  // Hardy in your zone, always offered: with no ZIP yet, ticking it asks for one, then comes back here with the search
  // and filters as they were, showing only plants hardy there (src/ui/location-panel.ts).
  const hardy = (() => {
    const loc = state.location;
    const cb = el('input', { type: 'checkbox', 'data-testid': 'hardy-here' });
    cb.checked = !!loc && plantFilter.hardyHere;
    // (Its source a small "Source" beside it, the citation in a little pane: Jason, Nov 4, note 1, "The 2-line citation
    // on hardiness needs to be minimized somehow".)
    const source = sourceButton(() => `Zones: ${ZONE_SOURCE_SHORT}.`, { name: 'the hardiness zones', testid: 'zone-source' });
    source.hidden = !cb.checked;
    cb.addEventListener('change', () => {
      if (!state.location) { cb.checked = false; openLocation('plants'); return; }
      plantFilter.hardyHere = cb.checked;
      if (!swapFiltersOn()) saveHardy(cb.checked); // (a Swap's own, from a warning: not kept for the picker)
      source.hidden = !cb.checked;
      rebuildList();
    });
    return { box: el('label', { className: 'filter-check hardy-check' }, cb, loc ? `Hardy in zone ${loc.zone}` : 'Hardy in your zone',
      loc ? null : el('span', { className: 'hint' }, '(asks for your ZIP)')), source };
  })();
  // (For a bed: what its Sun and Water needs say, and that the person's own come back with Anywhere.)
  const setByNote = el('div', { className: 'hint set-by-note', 'data-testid': 'set-by-note', hidden: true });
  setBySyncers.push(() => {
    setByNote.hidden = !layer;
    setByNote.textContent = layer ? `Sun, Water needs, Drought tolerant, Takes wet soil and Clay OK are set by ${layer.name} while you plant it. Yours are kept for Anywhere.` : '';
  });
  const primary = el('div', { className: 'filter-main' },
    row(mkSelect('form', 'Any form', (enums.form || []).map((f): Opt => [f, f]), { name: 'Form' }),
        mkSelect('sun', 'Any sun', [['Full', 'Full sun'], ['Part', 'Part shade'], ['Shade', 'Shade']], { name: 'Sun' })),
    // (Low or moderate, "any of": a bed's Average, Jason's answer 7, and the person's own to choose.)
    row(mkSelect('water', 'Water needs', WATER.filter(([v]) => !enums.water || v.split(',').every((w) => enums.water.includes(w))).map(([v, t]): Opt => [v, t]),
          { name: 'Water needs', selected: (v) => `Water needs: ${WATER.find(([w]) => w === v)?.[2] ?? v}` }),
        mkSelect('bloomMonth', 'Blooming in…', [
          { group: 'Season', options: SEASONS.map((x): Opt => [x, cap(x)]) },
          { group: 'Month', options: MONTHS.slice(1).map((m, i): Opt => [String(i + 1), m]) },
        ], { name: 'Blooming in', selected: (v, t) => `Blooming in ${/^\d+$/.test(v) ? t : v}` })),
    setByNote,
    colorChips('flowerColors', FLOWER_CHOICES, 'Flower color', 'flower-colors'));

  // ---- "Hide plants rated toxic to:" ----
  // (Jason, Nov 5: "the whole poison filter could be reduced to 'hide plants toxic to …' with chips. Maybe replace
  // 'kids' with 'people.'"; then "rated", so what's left doesn't read as safe.)
  // One line in place of "Anyone you need to protect?" and the Poison & pets group: People, Dogs, Cats and Horses, a chip
  // each, kept with the plan's yard (src/yard.ts). Each hides the plants rated toxic to them and nothing else
  // (src/plants.ts toxicTo): a plant not rated still shows, and there's no "rated safe" filter, the only safe ratings
  // being the earlier list's, unverified. Its note says whose word it takes and how many plants aren't rated yet.
  // First among the filters, with a ×, until it's answered for the plan or dismissed on this device (askingAtTop); then
  // in Filters where Poison & pets was, with no heading of its own: its title names it. (While naming a tree already
  // in the yard, only there: its filters start cleared, the yard's with them, treeFiltersAside.)
  // Skin irritants are marked on rows for everyone (src/plants.ts rowFlags): anyone walking past can brush one. Poison
  // when eaten is marked by who's chosen; People hides any rating for people, the skin's too, as it did before.
  const toxicBox = el('div', { className: 'toxic-filters', id: 'poison-filters', 'data-testid': 'toxic-filters', hidden: true });
  let yardChips: [keyof Yard, HTMLButtonElement][] = [];
  let yardNote: HTMLElement | null = null;
  const yardOn = (k: keyof Yard) => yardHas(yardOf(plantFilter), k);
  /** Who's chosen, as the note counts them (the yard's `kids` is People). */
  const chosen = (): ToxicTo[] => YARD_CHIPS.filter(([k]) => yardOn(k)).map(([k]) => (k === 'kids' ? 'people' : k));
  /** The line's chips, and its note's count, as the filters now stand. */
  function syncYard() {
    for (const [k, b] of yardChips) { b.classList.toggle('on', yardOn(k)); b.setAttribute('aria-pressed', String(yardOn(k))); }
    if (yardNote) yardNote.textContent = toxicNote(chosen());
  }
  function protectLine(top: boolean): HTMLElement {
    yardChips = YARD_CHIPS.map(([k, label]) => {
      const b = el('button', { className: 'color-chip protect-chip' + (yardOn(k) ? ' on' : ''), 'aria-pressed': String(yardOn(k)), 'data-testid': `protect-${k}` }, label);
      b.addEventListener('click', () => {
        const y = toggleYard(yardOf(plantFilter), k);
        applyYard(plantFilter, y);
        // (Kept with the plan, but not from a Swap opened from a warning, whose filters are its own: keepYard.)
        if (!swapFiltersOn()) saveYard(y, k);
        syncYard();
        rebuildList();
      });
      return [k, b];
    });
    yardNote = el('div', { className: 'protect-note', 'data-testid': 'protect-note' }, toxicNote(chosen()));
    const line = el('div', { className: 'protect-line' + (top ? ' at-top' : ''), role: 'group', 'aria-labelledby': 'protect-title', 'data-testid': 'protect-line' },
      el('div', { className: 'protect-title', id: 'protect-title' }, 'Hide plants rated toxic to:'),
      el('div', { className: 'protect-chips' }, yardChips.map(([, b]) => b)),
      yardNote);
    if (top) {
      const x = el('button', { className: 'protect-x', html: I.x, 'aria-label': 'Dismiss (it moves into Filters)', title: 'Dismiss', 'data-testid': 'protect-dismiss' });
      x.addEventListener('click', () => {
        // (Moved at once, in place: the list and the search as they were. Said where it went.)
        const focused = document.activeElement === x;
        dismissAsked();
        askingAtTop = false;
        line.remove();
        holdLine();
        toast("It's under Filters.", 5000);
        if (focused) filtersBtn.focus(); // (the × gone: keyboards and screen readers kept by what holds it now)
      });
      line.prepend(x);
    }
    return line;
  }
  /** The line in Filters, once it's no longer first among them. */
  function holdLine() { toxicBox.replaceChildren(protectLine(false)); toxicBox.hidden = false; }
  const askTop = !forTree && (askingAtTop ??= askAtTop({ dismissed: askDismissed(), household: household() }));
  const topLine = askTop ? protectLine(true) : null;
  if (topLine) topLine.hidden = typingFold;
  else holdLine();

  // ---- Edible, and which part ----
  // (The part chips show once Edible is ticked; unticking it takes them off too.)
  const edibleCheck = mkCheck('Edible', 'edible', 'edible-filter');
  const edibleParts = el('div', { className: 'color-chips edible-parts', role: 'group', 'aria-label': 'Edible part', 'data-testid': 'edible-parts', hidden: !plantFilter.edible },
    el('span', { className: 'chips-label' }, 'Which part'),
    EDIBLE_PART_CHOICES.map(([v, t]) => listToggle('edibleParts', v, t, 'color-chip')));
  edibleCheck.querySelector('input')!.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    edibleParts.hidden = !on;
    if (!on && plantFilter.edibleParts.length) {
      plantFilter.edibleParts = PLANT_FILTER_DEFAULTS.edibleParts;
      for (const cb of edibleParts.querySelectorAll('input')) { cb.checked = false; cb.parentElement?.classList.remove('on'); }
      rebuildList();
    }
  });

  // ---- THE REST ----
  // (Height and width when grown ("mature": Kayla, Nov 4, "What is mature spread?"): the readout follows a handle as it
  // moves; the list changes when it's let go.)
  const heightReadout = el('span', { 'data-testid': 'height-readout' }, heightLabel(plantFilter.height));
  const widthReadout = el('span', { 'data-testid': 'width-readout' }, sizeLabel(plantFilter.width, 'width'));
  const here = gardenStateName();
  const adv = el('div', { id: 'more-filters' },
    groupHead('Wildlife'),
    // (A set of ticks where any one will do sits in its own box, so it doesn't read as more ticks that each narrow the list.)
    anyOf('Attracts any of these', 'attracts-set', ATTRACT_CHOICES.map(([v, t]) => listToggle('attracts', v, t, 'filter-check'))),
    checks(mkCheck('Feeds caterpillars (host plant)', 'hostOnly')),
    // (Native to the garden's own state, once its ZIP is known: Kew's checklist. To North America: the earlier list.)
    row(mkSelect('native', 'Any native status', [...(here ? [['@here', `Native to ${here}`] as Opt] : []), ['@na', 'Native to North America (unverified)']],
      { name: 'Native status', testid: 'native-filter' })),
    groupHead('Looks'),
    colorChips('leafColors', LEAF_CHOICES, 'Leaf color', 'leaf-colors'),
    // (Has flowers: showy ones on record. A search's "shade flowers" sets it: Jason, Nov 1, from the UI review.)
    checks(mkCheck('Has flowers', 'flowers'), mkCheck('Fall color', 'fallColor'), mkCheck('Evergreen', 'evergreen'), mkCheck('Winter interest', 'winterInterest')),
    row(mkSelect('growth', 'Any growth rate', GROWTH, { name: 'Growth rate', selected: (_v, t) => `Growth rate: ${t}` })),
    el('div', { className: 'field', style: { marginTop: '8px' } },
      el('div', { className: 'hint', style: { display: 'flex', justifyContent: 'space-between' } }, el('span', {}, 'Height when grown'), heightReadout),
      heightRange(plantFilter.height, (v) => { heightReadout.textContent = heightLabel(v); }, (v) => { plantFilter.height = v; heightReadout.textContent = heightLabel(v); rebuildList(); })),
    el('div', { className: 'field', style: { marginTop: '8px' } },
      el('div', { className: 'hint', style: { display: 'flex', justifyContent: 'space-between' } }, el('span', {}, 'Width when grown'), widthReadout),
      heightRange(plantFilter.width, (v) => { widthReadout.textContent = sizeLabel(v, 'width'); }, (v) => { plantFilter.width = v; widthReadout.textContent = sizeLabel(v, 'width'); rebuildList(); }, 'width')),
    groupHead('Site & care'),
    checks(mkCheck('Low maintenance', 'lowMaintenance'), mkCheck('Drought tolerant', 'drought'), mkCheck('Takes wet soil', 'wetFeet'),
      mkCheck('Clay OK', 'clayOk'), mkCheck('Deer resistant', 'deerResistant'), mkCheck('Hide plants with thorns', 'noThorns'), edibleCheck),
    // (Which part, as chips under Edible, shown once it's ticked: any one will do. Jason, Oct 30.)
    edibleParts,
    el('div', { className: 'hint' }, 'For dry shade: Drought tolerant, with Shade under Sun.'),
    // (Says unverified while any plant it judges goes by the earlier list for either fact, as the dog filter does.)
    anyOf(spreadUnverified ? 'Spreading you\u2019re OK with (unverified)' : 'Spreading you\u2019re OK with', 'spread-filter',
      SPREAD_WAYS.map((v) => listToggle('spread', v, SPREADS[v], 'filter-check')),
      el('div', { className: 'hint' }, 'A plant shows only if every way it spreads is ticked: a runner that also self-sows freely needs both.')),
    groupHead('Sources'),
    mkCheck('Where sources disagree, count both values', 'withReported'),
    el('div', { className: 'hint' }, 'A plant shows the value more sources give (on a tie, the cautious one), with the other beside it. One shown only because of the other is marked !.'));

  // ---- One fold for them all, its button saying how many are on; "Hardy in zone 8a" beside it ----
  const all = el('div', { className: 'filter-box', id: 'all-filters', hidden: !filtersOpen, 'data-testid': 'all-filters' }, primary, toxicBox, adv);
  const filtersLabel = el('span', {});
  const filtersBtn = el('button', { className: 'btn ghost fold-btn', 'aria-expanded': String(filtersOpen), 'aria-controls': 'all-filters', 'data-testid': 'filters' },
    el('span', { className: 'fold-icon', html: I.filter }), filtersLabel, el('span', { className: 'fold-chev', html: I.chevronDown }));
  filtersBtn.addEventListener('click', () => { setFiltersOpen(!filtersOpen); filtersBtn.setAttribute('aria-expanded', String(filtersOpen)); all.hidden = !filtersOpen; });
  const foldRow = el('div', { className: 'fold-row' }, filtersBtn, hardy.box, hardy.source);

  // ---- What's on, above the list: a chip each, tap to take it off ----
  const activeRow = el('div', { className: 'active-filters', 'data-testid': 'active-filters' });
  // (A Swap from a warning: why it's filtered, above its chips, while any of them is on. Jason's UI review, Nov 2.)
  const swapWhy = swapping ? swapFix() : null;
  const whyLine = swapWhy?.line ? el('div', { className: 'swap-why', 'data-testid': 'swap-why' }, swapWhy.line) : null;
  /** The chips, and the fold buttons' counts, as the filters now stand (with each list rebuild). */
  function syncActive() {
    const chips = activeChips();
    activeRow.replaceChildren(...chips.map((c) => {
      const b = el('button', { className: 'active-chip', 'aria-label': `Remove filter: ${c.text}`, 'data-testid': 'active-chip' }, c.text, el('span', { className: 'chip-x', html: I.x }));
      b.addEventListener('click', () => { c.clear(); keepYard(c.key); render(); }); // (a full rebuild, so its control shows it off)
      return b;
    }));
    if (chips.length) {
      const all = el('button', { className: 'link-btn', 'data-testid': 'reset-filters' }, 'Clear filters');
      all.addEventListener('click', () => resetFilters());
      activeRow.appendChild(all);
    }
    activeRow.hidden = !chips.length;
    if (whyLine && swapWhy) whyLine.hidden = Object.keys(swapWhy.set).length > 0 && !swapFixOn(swapWhy);
    // (Not Hardy: its own box beside the button says it's on.)
    const n = chips.filter((c) => c.key !== 'hardyHere').length;
    filtersLabel.textContent = 'Filters' + (n ? ` (${n} on)` : '');
  }

  // The search stays in view while the list scrolls (with the header, below); "In this plan" beside it.
  const planToggle = el('button', { className: 'plan-toggle', 'aria-pressed': String(plantFilter.inPlan), 'data-testid': 'in-plan', title: 'Only the plants placed in this plan' }, 'In this plan');
  planToggle.addEventListener('click', () => { plantFilter.inPlan = !plantFilter.inPlan; planToggle.setAttribute('aria-pressed', String(plantFilter.inPlan)); rebuildList(); });
  const searchBar = el('div', { className: 'picker-search field' }, el('div', { className: 'search-row' }, el('div', { className: 'search-wrap' }, search, clearSearch), planToggle));
  // (One block, so its spacing is its own: the sheet spaces its parts widely. "Hide plants rated toxic to:" first, till answered.)
  body.appendChild(el('div', { className: 'picker-filters' }, topLine, foldRow, all, whyLine, activeRow));
  body.appendChild(countLine);
  body.appendChild(listWrap);
  syncFor();
  rebuildList();

  // (Its full height whatever the list holds: a shorter list moved its top, and the search box and filters with it,
  // between a click and the next. Marcus, Diego, Tom, Oct 30.)
  // (The plants chosen to compare, in a bar at its foot.)
  const compare = compareBar(compareHost);
  // (At rest on a phone, 60% of the screen, its handle at the top; a panel beside the plan on a computer:
  // src/ui/picker-view.ts.) Its top row: a task's title, or the For row, or the search; then the search, if it isn't
  // there; the ✕ (← back to the plant's sheet) at the top row's end.
  const close = sheetCloseButton(closePicker, pickerFromSheet() ? 'props' : null);
  const first = title ? el('div', { className: 'title' }, title) : forBar ?? searchBar;
  const header = el('div', { className: 'sheet-header' + (title ? '' : ' picker-head') },
    title ? null : el('h2', { className: 'sr-only' }, 'Plant Picker'), first, close);
  dragsPicker(header);
  const sheet = el('div', { className: pickerSheetClass() }, el('div', { className: 'sheet-top' }, pickerHandle(), header, first === searchBar ? null : searchBar), body, compare.el);
  // Typing: the start of the results in view, under the search (scrolling only; the keyboard stays). Back up to it from
  // far down the list; or down to it, past what's above it, where the first result is out of sight below (Jason, Nov
  // 1, from the UI review). The filters' chips, a word of need's among them, stay in view above it.
  search.addEventListener('input', () => {
    const top = sheet.querySelector<HTMLElement>('.sheet-top')!.offsetHeight;
    const lead = activeRow.hidden ? countLine : activeRow;
    const y = lead.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
    const first = listWrap.firstElementChild?.getBoundingClientRect();
    if (y < top || (first && first.top + 32 > sheet.getBoundingClientRect().bottom)) sheet.scrollTop += y - top - 4;
  });
  const over = compareOver(compareHost);
  // (Over the plan without dimming it, and without taking its touches: the plan pans and zooms beside or above it, and
  // a tap there closes nothing, so a stray one never loses the search. Its ✕, Back and Esc close it. Jason, Nov 2, from
  // the bed review: src/ui/picker-view.ts.)
  const overlay = el('div', { className: 'overlay picker-overlay', 'data-testid': 'picker' }, sheet, over);
  if (over) pickerBeneath(overlay, true); // (beneath the comparison, out of reach)
  return overlay;
}
