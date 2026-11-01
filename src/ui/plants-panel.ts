import { crowdLevelsOf, crowdNoticeAfterSwap } from './crowd-notice';
import { el, sheetCloseButton, tapSaid, type Child } from '../dom';
import { applyYard, askAtTop, askDismissed, dismissAsked, household, saveHardy, saveYard, toggleYard, yardKeyOf, yardOf, type Yard } from '../yard';
import { toast } from './toast';
import { I } from '../icons';
import type { DogFilter, Plant, PlantFilter } from '../plants';
import { byMatch, hostMatchText, inNotes, matchPlant, nearShows, readQuery, unsearchable } from '../search';
import { byTypicalHeight, formsOf, matchedBy, reportedOnly, earlierFor, comesIn, bySeason, filterOn, SEASONS, reportedPhrase, rowFlags, rowLines, plantColor, PLANTS, PLANT_FILTER_DEFAULTS, PLANT_META, filteredPlants, linkFromPicker, plantFilter, plantIdsInPlan, plantMatches, countWord, bannedLeftOut, pickerCount, toxicToDogs, nonToxicToDogs, reportedMatch, cultivarsOf, foldHeadOf, headName, isGroupHead, plantsById, treeFiltersAside } from '../plants';
import { recentPlants, startPlacing, switchPlacingPlant } from '../place';
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
import { bannedHere, escapeHere, escapeShort, gardenStateName, lawShort, loadWild, regulatedHere } from '../wild';
import { plantDot } from '../plant-looks';

const dotColor = plantDot;

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
 * Whether "Anyone you need to protect?" is first among the filters while the picker is open: decided as it opens
 * (src/yard.ts askAtTop), so an answer given in it stays in view to see (Jason, Nov 1, from the UI review); a
 * dismissal moves it at once. Null with the picker closed.
 */
let askingAtTop: boolean | null = null;
/** The picker closed (src/ui/render.ts): asked again or not by what's kept, the next time it opens. */
export function pickerClosed() { askingAtTop = null; }
/** `fn` with these filters off, the filters as they were after. */
function withFiltersOff<T>(keys: (keyof PlantFilter)[], fn: () => T): T {
  const was = keys.map((k) => [k, plantFilter[k]] as const);
  for (const k of keys) Object.assign(plantFilter, { [k]: PLANT_FILTER_DEFAULTS[k] });
  try { return fn(); } finally { for (const [k, v] of was) Object.assign(plantFilter, { [k]: v }); }
}
/** Once the garden's wild records are in, show them in the list. */
function afterWild() { if (state.panel === 'plants') { addNativeHereOption(); refreshList?.(); } }
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

/** Opened from a plant's sheet to swap it, or from a circle's to link it. */
const pickerFromSheet = () => !!state.pickerLinkId && state.selectedIds.length > 0;
function closePicker() {
  // (Opened from a sheet: closed, back on that sheet, as picking a plant brings you back there. The UI review,
  // 2026-11-01: it closed the sheet too.)
  const fromSheet = pickerFromSheet();
  state.panel = fromSheet ? 'props' : null; state.pickerLinkId = null; state.pickerLinkAlso = []; state.pickerLinkLocked = false; state.pickerForTree = false; render();
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
    state.panel = 'props';
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

const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
/** The fewest cultivars a fold holds (Jason, 2026-10-26): fewer are rows of their own. */
const MIN_FOLD = 4;
const joined = (xs: string[], word: string) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1]}` : xs[0] ?? '');
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Blooming in June", "Blooming in spring". */
const bloomName = (v: string) => (/^\d+$/.test(v) ? MONTHS[Number(v)] : v);
const SUN_NAMES: Record<string, string> = { Full: 'Full sun', Part: 'Part shade', Shade: 'Shade' };
/** Water needs, in order (the catalog's words; "Wetland" said plainly). */
const WATER: [string, string, string][] = [['Low', 'Low (drought tolerant)', 'low'], ['Moderate', 'Moderate', 'moderate'], ['High', 'High', 'high'], ['Wetland', 'Wet soil or standing water', 'wet']];
const GROWTH: [string, string][] = [['slow', 'Slow'], ['medium', 'Medium'], ['fast', 'Fast']];
const SPREADS: Record<string, string> = { stays: 'Stays put', runs: 'Spreads by runners or underground', aggressive: 'Spreads aggressively by runners or underground', seed: 'Self-sows freely' };
/** The colors offered, most plants first (the catalog's words: src/catalog.ts). Leaf color includes green (Jason, 2026-10-25). */
const FLOWER_CHOICES = ['white', 'yellow', 'pink', 'purple', 'red', 'orange', 'blue', 'green', 'cream', 'brown', 'silver', 'black'];
const LEAF_CHOICES = ['green', 'silver', 'gold', 'blue', 'purple', 'red', 'white', 'variegated', 'copper', 'orange', 'pink', 'cream', 'black'];
/** Who a plant attracts, as NC State says it (its "specialized bees" count as bees: src/plants.ts). */
const ATTRACT_CHOICES: [string, string][] = [['butterflies', 'Butterflies'], ['bees', 'Bees'], ['hummingbirds', 'Hummingbirds'], ['songbirds', 'Songbirds'], ['moths', 'Moths'], ['pollinators', 'Pollinators']];
const SWATCHES: Record<string, string> = {
  white: '#ffffff', cream: '#fef3c7', yellow: '#eab308', gold: '#ca8a04', orange: '#f97316', copper: '#b45309', red: '#dc2626',
  pink: '#ec4899', purple: '#9333ea', blue: '#3b82f6', green: '#16a34a', brown: '#78350f', silver: '#a8a29e', black: '#1c1917',
  variegated: 'linear-gradient(135deg, #16a34a 50%, #fef3c7 50%)',
};
type ListKey = 'flowerColors' | 'leafColors' | 'attracts' | 'spread' | 'edibleParts';
/**
 * "Anyone you need to protect?"'s note: a plant that can irritate skin is marked on its row whoever's in the yard, since
 * anyone walking past can brush it; poison only matters to someone who'd put the plant in their mouth (Jason, Nov 1).
 */
const PROTECT_NOTE = "Skin irritants are marked for all: anyone can brush them. Poison if eaten goes by who's in the yard.";
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
  hardyHere: () => (state.location ? `Hardy in zone ${state.location.zone}` : 'Hardy in your zone'),
  noPoison: () => 'Not listed as poisonous to people', dogs: (f) => (f.dogs === 'hideToxic' ? 'No dog warnings' : 'Rated safe for dogs'),
  cats: () => 'No cat warnings', horses: () => 'No horse warnings',
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
  const browsing = !swapping && !linking && !forTree && !state.placing;
  const title = swapping ? 'Swap for another plant' : linking ? 'Link to a plant' : forTree ? 'Which tree?' : state.placing ? 'Switch plant' : 'Plant Picker';
  // (The plain picker's count, of the plants it offers: written with the count line, from the same numbers. The UI
  // review, 2026-11-01: drawn before the garden's state's law came in, it said 3,747 beside "of 3,745".)
  const titleNode = el('div', { className: 'title' }, title);
  const header = el('div', { className: 'sheet-header' },
    titleNode,
    sheetCloseButton(closePicker, pickerFromSheet() ? 'props' : null) // (← back to the plant's sheet: closePicker)
  );

  const body = el('div', { className: 'sheet-body' });
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
  // The plants placed most recently, one tap each.
  const recent = linking || forTree ? [] : recentPlants();
  if (recent.length) {
    const row = el('div', { className: 'recent-plants', 'data-testid': 'recent-plants' });
    for (const p of recent) {
      const chip = el('button', { className: 'recent-plant' },
        el('span', { className: 'sw-dot', style: { background: dotColor(p) } }), el('span', {}, p.common));
      chip.addEventListener('click', () => pick(p));
      row.appendChild(chip);
    }
    body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Recent'), row));
  }
  if (PLANTS.some((p) => p.unverified || p.partlyChecked)) {
    // (One line, so the list starts high on a phone; the link tells the rest.)
    const full = el('div', { id: 'unverified-more', hidden: true },
      'Plants are being checked against published references. Unverified: all its details are from an earlier list with no sources. Partly checked: some are sourced; open it to see which (the rest say "earlier list"). Treat unchecked details as a rough guide.');
    const more = el('button', { className: 'link-btn inline', 'aria-expanded': 'false', 'aria-controls': 'unverified-more', 'data-testid': 'unverified-more' }, 'What that means');
    more.addEventListener('click', () => { full.hidden = !full.hidden; more.setAttribute('aria-expanded', String(!full.hidden)); more.textContent = full.hidden ? 'What that means' : 'Less'; });
    body.appendChild(el('div', { className: 'hint checking-note', 'data-testid': 'unverified-note' }, 'Not every detail is checked yet. ', more, full));
  }
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
  /** In "In this plan", the plants the filters would hide, and which filters. */
  const hiddenInPlan = new Map<string, string[]>();
  /**
   * The group a plant in the last list is in: 0 what its sources say fits; 1 a species that comes in a color asked
   * for among others; 2 what fits by what other sources say; 3 what fits only by the earlier list's word.
   */
  const groupOf = (p: Plant) => (earlierFor.has(p.id) ? 3 : reportedOnly.has(p.id) ? 2 : comesIn.has(p.id) ? 1 : 0);
  /**
   * A plant's row: tap it to open its details, or Place (Link, Pick) to use it.
   * Opening and closing change only this row, so the search box keeps the keyboard.
   */
  function buildRow(p: Plant, shownIn = -1) {
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
    const info = el('div', { className: 'pinfo' },
      el('div', { className: 'pname' }, headName(p)),
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
    }
    const hidBy = hiddenInPlan.get(p.id);
    if (hidBy?.length) flags.push(el('span', { className: 'pflag warn', 'data-testid': 'filtered-in-plan' }, `Your filters would hide it: ${hidBy.join(', ')}`));
    if (flags.length) info.appendChild(el('div', { className: 'pflags' }, ...flags));
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
    // (Its flowers' color, as its picture draws them (Jason, Oct 30); a plant whose flowers don't show, its own color.)
    const dot = el('div', { 'data-testid': 'row-dot', style: {
      width: '14px', height: '14px', borderRadius: '50%', flex: 'none', boxSizing: 'border-box', border: '1px solid rgba(0, 0, 0, 0.18)',
      background: dotColor(p), marginRight: '10px'
    } });
    const flagged = reportedOnly.get(p.id);
    const chev = el('span', { className: 'row-open' + (flagged ? ' flagged' : '') },
      flagged ? el('span', { className: 'row-flag', 'data-testid': 'row-flag', title: 'Shown because of what other sources say' }, '!',
        el('span', { className: 'sr-only' }, ' (shown because of what other sources say)')) : null,
      el('span', { className: 'fold-chev', html: I.chevronDown }));
    // The plant itself is the button that opens its details (its name and summary are what a screen reader says);
    // Place and copy or edit sit beside it, not inside it.
    const toggle = el('button', { className: 'row-toggle', 'aria-expanded': 'false', 'data-testid': 'plant-row' }, dot, info, chev);
    const head = el('div', { className: 'proj-row', style: { alignItems: 'center' } }, toggle);
    const verb = swapping ? 'Swap' : linking ? 'Link' : forTree ? 'Pick' : state.placing ? 'Switch' : 'Place';
    // (A plant the law of the garden's state bans, found by name: the button says so, in red, as it's about to go on
    // the plan. No notice afterwards, nor any on the ones already there: Jason, Oct 31, from round 3: Kim swapped one
    // in unwarned. The law, not a national list: Jason, Oct 31.)
    const bad = bannedHere(p) && verb !== 'Link';
    const place = el('button', { className: 'btn place-btn' + (bad ? ' banned' : ''), 'data-testid': 'plant-place',
      'aria-label': `${verb === 'Link' ? 'Link to' : verb === 'Switch' ? 'Switch to' : verb === 'Swap' ? 'Swap for' : verb} ${p.common}${bad ? ' (banned here)' : ''}` },
      // (Short on the button, which shares the row with the name on a phone; the row's law line says where.)
      bad ? `${verb} (banned)` : verb);
    place.addEventListener('click', () => pick(p));
    head.appendChild(place);
    // Mine: edit. Catalog: copy as my own (a cultivar of it, say).
    const mine = isMine(p);
    const side = el('button', {
      className: 'iconbtn', html: mine ? I.edit : I.copy,
      title: mine ? 'Edit my plant' : 'Copy as my plant',
      'aria-label': (mine ? 'Edit ' : 'Copy as my plant: ') + p.common,
    });
    // (Edited or copied from here, back here: openForm.)
    side.addEventListener('click', () => openForm(mine ? { editId: p.id, place: false } : { copyFromId: p.id, place: false }));
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
      if (open) { opened.add(p.id); details ??= plantDetails(p, flagged); item.appendChild(details); }
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
  function addButton(): HTMLElement {
    const q = readQuery(plantFilter.q) ? plantFilter.q.trim() : ''; // ("'" alone isn't a name)
    const b = el('button', { className: 'btn secondary add-own', 'data-testid': 'add-own-plant' },
      q ? `+ Add \u201c${q}\u201d as my plant` : '+ Add your own plant');
    b.addEventListener('click', () => openForm({ name: q, place: true }));
    return b;
  }
  refreshList = () => { if (listWrap.isConnected) rebuildList(); };
  /**
   * Kids and pets, as set by their own controls: kept with the plan (src/yard.ts), as the guided introduction's step 6
   * does. Not "Clear filters" or "Show them": those are for the search at hand.
   */
  function keepYard(key: keyof PlantFilter) {
    const k = yardKeyOf(key);
    if (k) { saveYard(yardOf(plantFilter), k); syncYard(); }
  }
  function rebuildList() {
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
    if (browsing) titleNode.textContent = 'Plant Picker' + (PLANTS.length ? ` (${countWord(all)})` : '');
    // (Nothing matched as typed, only close spellings: said so, not counted as matches (Lena, Oct 30).)
    // ("In this plan": the plan's kinds, not a share of the catalog (Dana, Oct 30: "6 of 3,725 plants match").)
    const found = hits.length + mine.length;
    countLine.textContent = (near ? `Nothing matches as typed${found ? ` \u00b7 ${countWord(found)} close spelling${found === 1 ? '' : 's'}` : ''}`
      : plantFilter.inPlan ? (found ? `${countWord(found)} kind${found === 1 ? '' : 's'} of plant in this plan${q ? ` match \u201c${plantFilter.q.trim()}\u201d` : ''}` : q ? `No plant in this plan matches \u201c${plantFilter.q.trim()}\u201d` : 'No plants placed in this plan yet')
      : pickerCount(n, all, out.filter((p) => !forTree || isTree(p)).length, foundBanned, gardenStateName() ?? 'here')) +
      (swapping ? ' \u00b7 Pick the plant to swap in' : linking ? ' \u00b7 Link the plant this circle stands for' : forTree ? ' \u00b7 trees only' : tapSaid(' \u00b7 Place a plant, then tap the plan where it goes; tap a plant for its details'));
    if (mine.length) {
      // My plants fold away (remembered on this device); a search always shows its matches.
      const searching = !!q;
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
    const groups = [0, 1, 2, 3].map((g) => hits.filter((p) => groupOf(p) === g));
    const filtering = activeChips().length > 0 || plantFilter.inPlan || (plantFilter.hardyHere && !!state.location);
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
    const [sourced, species, others, earlier] = groups.map((g) => {
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
    const sole = sourced.length + species.length + others.length + earlier.length + shownMine === 1;
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
          el('div', { style: { width: '14px', height: '14px', borderRadius: '50%', flex: 'none', background: plantColor(kids[0]), marginRight: '10px' } }),
          el('div', { className: 'pinfo' }, el('div', { className: 'pname' }, p.common), el('div', { className: 'pmeta', 'data-testid': 'group-count' }, `${p.botanical} \u00b7 ${count}`)),
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
    if (others.length) {
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
    if (earlier.length) {
      const on = [...new Set(earlier.flatMap((p) => earlierFor.get(p.id) ?? []))];
      listWrap.appendChild(el('div', { className: 'list-divider earlier', 'data-testid': 'earlier-divider' },
        el('span', {}, `These match on ${on.length > 1 ? `${on.slice(0, -1).join(', ')} and ${on[on.length - 1]}` : on[0]} only by the earlier list (unverified). No source we've read says so yet.`)));
      rows(earlier, 3);
    }
    // Typically within "up to N ft", but able to grow past it: below the rest, said so (Jason, Oct 30). Height and
    // width alike (Oct 31).
    const ceiling = aside?.keys.includes('height') ? undefined : plantFilter.height.split('-')[1];
    const across = aside?.keys.includes('width') ? undefined : plantFilter.width.split('-')[1];
    if ((ceiling || across) && !plantFilter.inPlan) {
      const shown = new Set(hits.map((p) => p.id));
      const run = () => (aside ? withFiltersOff(aside.keys, () => filteredPlants(near)) : filteredPlants(near));
      const taller = byTypicalHeight(run).filter((p) => !shown.has(p.id) && (!forTree || isTree(p)) && !now?.has(p.id));
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
        `Showing what your filters hid for \u201c${plantFilter.q.trim()}\u201d (${aside.names.join(', ')}). They're still on for your next search. `, back), listWrap.firstChild);
    }
    if (why && more > 0) {
      const show = el('button', { className: 'link-btn', 'data-testid': 'show-hidden' }, 'Show them');
      show.addEventListener('click', () => { setAside = { q: searchKey(), keys: why.keys, names: why.names }; rebuildList(); });
      const note = el('div', { className: 'hint', style: { padding: '8px 0' }, 'data-testid': 'hidden-by' },
        `${hits.length ? `${countWord(more)} more` : countWord(more)} plant${more === 1 ? ' matches' : 's match'} \u201c${plantFilter.q.trim()}\u201d, hidden by your filters: ${why.names.join(', ')}. `, show);
      if (hits.length || mine.length) listWrap.insertBefore(note, listWrap.firstChild); else listWrap.appendChild(note);
    }
    if (hits.length === 0 && mine.length === 0) {
      // (In a plan with nothing placed, "In this plan" says so above: no "loosen a filter" with none on. Round 3, Sam.)
      if ((!why || more <= 0) && !(plantFilter.inPlan && !plantFilter.q.trim())) {
        listWrap.appendChild(el('div', { className: 'hint', style: { padding: '8px 0' } },
          'No matches. Add it as your own plant, or loosen a filter.'));
      }
    }
    // Always offer to add a plant; right under the search when nothing matched as typed (close spellings are guesses:
    // say so above them).
    // (Below the note that the filters hid some: that's the answer, not a plant of one's own (Ruth, Oct 30).)
    if (hits.length === 0 && mine.length === 0) { if (why && more > 0) listWrap.appendChild(addButton()); else listWrap.insertBefore(addButton(), listWrap.firstChild); }
    else if (near) {
      listWrap.insertBefore(el('div', { className: 'hint', style: { padding: '0 0 6px' }, 'data-testid': 'near-note' },
        `Nothing matches \u201c${plantFilter.q.trim()}\u201d as typed. Close spellings:`), listWrap.firstChild);
      listWrap.insertBefore(addButton(), listWrap.firstChild);
    } else listWrap.appendChild(addButton());
    syncActive();
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
      if (found.some((p) => reportedMatch(p, { ...base, [k]: plantFilter[k] }, inPlan) === null)) { names.push(name(plantFilter)); keys.push(k); }
    }
    return names.length ? { n: found.length, names: oneEdible(keys, names), keys } : null;
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
    return oneEdible(hiding, hiding.map((k) => FILTER_NAMES[k]!(plantFilter)));
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
  clearSearch.addEventListener('click', () => { search.value = ''; plantFilter.q = ''; clearSearch.hidden = true; rebuildList(); search.focus(); });
  search.addEventListener('input', () => { keptSearch = false; plantFilter.q = search.value; clearSearch.hidden = !search.value; rebuildList(); });
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
    return el('div', { className: 'field', style: { flex: '1', minWidth: '0' } }, sel);
  }
  function mkCheck(label: Child, key: BoolKey, testid?: string) {
    const cb = el('input', { type: 'checkbox', 'data-testid': testid });
    if (key === 'withReported') reportedCheck = cb;
    cb.checked = !!plantFilter[key];
    cb.addEventListener('change', () => { plantFilter[key] = cb.checked; keepYard(key); rebuildList(); });
    return el('label', { className: 'filter-check' }, cb, label);
  }
  /** One value of a list filter, ticked or not: a plant with any value ticked passes. */
  function listToggle(key: ListKey, value: string, label: Child, className: string) {
    const cb = el('input', { type: 'checkbox', value });
    cb.checked = plantFilter[key].includes(value);
    const box = el('label', { className: className + (cb.checked ? ' on' : '') }, cb, label);
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
    const source = el('div', { className: 'hint zone-source', hidden: !cb.checked }, `Zones: ${ZONE_SOURCE_SHORT}.`);
    cb.addEventListener('change', () => {
      if (!state.location) { cb.checked = false; openLocation('plants'); return; }
      plantFilter.hardyHere = cb.checked;
      saveHardy(cb.checked);
      source.hidden = !cb.checked;
      rebuildList();
    });
    return { box: el('label', { className: 'filter-check hardy-check' }, cb, loc ? `Hardy in zone ${loc.zone}` : 'Hardy in your zone',
      loc ? null : el('span', { className: 'hint' }, '(asks for your ZIP)')), source };
  })();
  const primary = el('div', { className: 'filter-main' },
    row(mkSelect('form', 'Any form', (enums.form || []).map((f): Opt => [f, f]), { name: 'Form' }),
        mkSelect('sun', 'Any sun', [['Full', 'Full sun'], ['Part', 'Part shade'], ['Shade', 'Shade']], { name: 'Sun' })),
    row(mkSelect('water', 'Water needs', WATER.filter(([v]) => !enums.water || enums.water.includes(v)).map(([v, t]): Opt => [v, t]),
          { name: 'Water needs', selected: (v) => `Water needs: ${WATER.find(([w]) => w === v)?.[2] ?? v}` }),
        mkSelect('bloomMonth', 'Blooming in…', [
          { group: 'Season', options: SEASONS.map((x): Opt => [x, cap(x)]) },
          { group: 'Month', options: MONTHS.slice(1).map((m, i): Opt => [String(i + 1), m]) },
        ], { name: 'Blooming in', selected: (v, t) => `Blooming in ${/^\d+$/.test(v) ? t : v}` })),
    colorChips('flowerColors', FLOWER_CHOICES, 'Flower color', 'flower-colors'));

  // ---- POISON & PETS ----
  const poison = (() => {
    const DOGS: [DogFilter, string][] = [
      ['', 'Any'],
      ['hideToxic', 'Hide plants toxic to dogs'],
      // Says unverified while it goes by the earlier list for any plant (until each has a sourced rating: docs/catalog-sources.md).
      ['nonToxic', PLANTS.some((p) => !p.tox?.dog) ? 'Only plants rated safe for dogs (unverified)' : 'Only plants rated safe for dogs'],
    ];
    // (What the choice does, in numbers: how many it hides, and how many aren't rated at all.)
    const nToxic = PLANTS.filter(toxicToDogs).length, nSafe = PLANTS.filter(nonToxicToDogs).length;
    const nUnrated = PLANTS.length - nToxic - nSafe;
    const note = el('div', { className: 'hint', 'data-testid': 'dogs-note' });
    const sayNote = () => {
      note.textContent = plantFilter.dogs === 'hideToxic' ? `Hides the ${countWord(nToxic)} plants with a warning for dogs; keeps the ${countWord(nUnrated)} not yet rated.`
        : plantFilter.dogs === 'nonToxic' ? `Only the ${countWord(nSafe)} plants rated non-toxic to dogs, by an earlier list with no sources; leaves out the ${countWord(nUnrated)} not yet rated.`
        : `Every plant, whatever it does to dogs. NC State or the earlier list warns for ${countWord(nToxic)}; ${countWord(nUnrated)} have no rating, which isn't the same as safe.`;
    };
    sayNote();
    const group = el('div', { role: 'radiogroup', 'aria-label': 'Dogs', className: 'animal-rows' });
    const radios: HTMLInputElement[] = [];
    for (const [value, text] of DOGS) {
      const r = el('input', { type: 'radio', name: 'dogs-filter', value, 'data-testid': `dogs-${value || 'any'}` });
      r.checked = plantFilter.dogs === value;
      r.addEventListener('change', () => { if (!r.checked) return; plantFilter.dogs = value; keepYard('dogs'); sayNote(); rebuildList(); });
      radios.push(r);
      group.appendChild(el('label', { className: 'check-row' }, r, el('span', {}, text)));
    }
    // (Only plants whose NC State page was read and lists no poison: one it doesn't rate isn't called safe.)
    const kids = mkCheck('Not listed as poisonous to people', 'noPoison');
    const cats = mkCheck('Hide plants that are a problem for cats', 'cats');
    const horses = mkCheck('Hide plants that are a problem for horses', 'horses');
    const head = groupHead('Poison & pets');
    const box = el('div', { id: 'poison-filters', 'data-testid': 'animal-toxicity' }, head,
      kids,
      el('div', { className: 'hint' }, "By NC State: a plant it doesn't rate is left out too."),
      el('div', { className: 'animal-name' }, 'Dogs'), group, note,
      el('div', { className: 'animal-name' }, 'Cats and horses'),
      cats,
      horses,
      el('div', { className: 'hint' }, "NC State's warnings. A plant it doesn't list stays, which isn't the same as safe."));
    const tick = (label: HTMLElement, on: boolean) => { label.querySelector('input')!.checked = on; };
    return {
      box,
      /** "Anyone you need to protect?" at the head of the group, once it's no longer first among the filters. */
      hold: (line: HTMLElement) => head.after(line),
      /** The controls as the filters now stand (set from the line's chips). */
      sync: () => {
        tick(kids, plantFilter.noPoison); tick(cats, plantFilter.cats); tick(horses, plantFilter.horses);
        for (const r of radios) r.checked = r.value === plantFilter.dogs;
        sayNote();
      },
    };
  })();

  // ---- "Anyone you need to protect?" (Jason, Nov 1, from the UI review) ----
  // Poison & pets' four as a chip each, kept in step with its controls and the plan's yard (src/yard.ts). First
  // among the filters, with a ×, until it's answered for the plan or dismissed on this device (askingAtTop); then at
  // the head of Poison & pets.
  // Skin irritants are marked on rows for everyone (src/plants.ts rowFlags): anyone walking past can brush one. Poison
  // when eaten is marked, and filtered, by who's in the yard.
  const YARD_CHIPS: [keyof Yard, string][] = [['kids', 'Kids'], ['dogs', 'Dogs'], ['cats', 'Cats'], ['horses', 'Horses']];
  let yardChips: [keyof Yard, HTMLButtonElement][] = [];
  const yardOn = (k: keyof Yard) => { const y = yardOf(plantFilter); return k === 'dogs' ? y.dogs !== '' : !!y[k]; };
  /** The line's chips and Poison & pets' controls as the filters now stand. */
  function syncYard() {
    for (const [k, b] of yardChips) { b.classList.toggle('on', yardOn(k)); b.setAttribute('aria-pressed', String(yardOn(k))); }
    poison.sync();
  }
  function protectLine(top: boolean): HTMLElement {
    yardChips = YARD_CHIPS.map(([k, label]) => {
      const b = el('button', { className: 'color-chip protect-chip' + (yardOn(k) ? ' on' : ''), 'aria-pressed': String(yardOn(k)), 'data-testid': `protect-${k}` }, label);
      b.addEventListener('click', () => {
        const y = toggleYard(yardOf(plantFilter), k);
        applyYard(plantFilter, y);
        saveYard(y, k);
        syncYard();
        rebuildList();
      });
      return [k, b];
    });
    const line = el('div', { className: 'protect-line' + (top ? ' at-top' : ''), role: 'group', 'aria-labelledby': 'protect-title', 'data-testid': 'protect-line' },
      el('div', { className: 'protect-title', id: 'protect-title' }, 'Anyone you need to protect?'),
      el('div', { className: 'protect-chips' }, yardChips.map(([, b]) => b)),
      el('div', { className: 'protect-note', 'data-testid': 'protect-note' }, PROTECT_NOTE));
    if (top) {
      const x = el('button', { className: 'protect-x', html: I.x, 'aria-label': 'Dismiss this question (it moves to Filters, Poison & pets)', title: 'Dismiss', 'data-testid': 'protect-dismiss' });
      x.addEventListener('click', () => {
        // (Moved at once, in place: the list and the search as they were. Said where it went.)
        const focused = document.activeElement === x;
        dismissAsked();
        askingAtTop = false;
        line.remove();
        poison.hold(protectLine(false));
        toast("It's under Filters → Poison & pets.", 5000);
        if (focused) filtersBtn.focus(); // (the × gone: keyboards and screen readers kept by what holds it now)
      });
      line.prepend(x);
    }
    return line;
  }
  // (Not while naming a tree already in the yard: its filters start cleared, the yard's with them: treeFiltersAside.)
  const askTop = !forTree && (askingAtTop ??= askAtTop({ dismissed: askDismissed(), household: household() }));
  const topLine = askTop ? protectLine(true) : null;
  if (!askTop && !forTree) poison.hold(protectLine(false));

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
  // (Mature height and width: the readout follows a handle as it moves; the list changes when it's let go.)
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
    checks(mkCheck('Fall color', 'fallColor'), mkCheck('Evergreen', 'evergreen'), mkCheck('Winter interest', 'winterInterest')),
    row(mkSelect('growth', 'Any growth rate', GROWTH, { name: 'Growth rate', selected: (_v, t) => `Growth rate: ${t}` })),
    el('div', { className: 'field', style: { marginTop: '8px' } },
      el('div', { className: 'hint', style: { display: 'flex', justifyContent: 'space-between' } }, el('span', {}, 'Mature height'), heightReadout),
      heightRange(plantFilter.height, (v) => { heightReadout.textContent = heightLabel(v); }, (v) => { plantFilter.height = v; heightReadout.textContent = heightLabel(v); rebuildList(); })),
    el('div', { className: 'field', style: { marginTop: '8px' } },
      el('div', { className: 'hint', style: { display: 'flex', justifyContent: 'space-between' } }, el('span', {}, 'Mature width'), widthReadout),
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
  const all = el('div', { className: 'filter-box', id: 'all-filters', hidden: !filtersOpen, 'data-testid': 'all-filters' }, primary, poison.box, adv);
  const filtersLabel = el('span', {});
  const filtersBtn = el('button', { className: 'btn ghost fold-btn', 'aria-expanded': String(filtersOpen), 'aria-controls': 'all-filters', 'data-testid': 'filters' },
    el('span', { className: 'fold-icon', html: I.filter }), filtersLabel, el('span', { className: 'fold-chev', html: I.chevronDown }));
  filtersBtn.addEventListener('click', () => { setFiltersOpen(!filtersOpen); filtersBtn.setAttribute('aria-expanded', String(filtersOpen)); all.hidden = !filtersOpen; });
  const foldRow = el('div', { className: 'fold-row' }, filtersBtn, hardy.box);

  // ---- What's on, above the list: a chip each, tap to take it off ----
  const activeRow = el('div', { className: 'active-filters', 'data-testid': 'active-filters' });
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
    // (Not Hardy: its own box beside the button says it's on.)
    const n = chips.filter((c) => c.key !== 'hardyHere').length;
    filtersLabel.textContent = 'Filters' + (n ? ` (${n} on)` : '');
  }

  // The search stays in view while the list scrolls (with the header, below); "In this plan" beside it.
  const planToggle = el('button', { className: 'plan-toggle', 'aria-pressed': String(plantFilter.inPlan), 'data-testid': 'in-plan', title: 'Only the plants placed in this plan' }, 'In this plan');
  planToggle.addEventListener('click', () => { plantFilter.inPlan = !plantFilter.inPlan; planToggle.setAttribute('aria-pressed', String(plantFilter.inPlan)); rebuildList(); });
  const searchBar = el('div', { className: 'picker-search field' }, el('div', { className: 'search-row' }, el('div', { className: 'search-wrap' }, search, clearSearch), planToggle));
  // (One block, so its spacing is its own: the sheet spaces its parts widely. "Anyone you need to protect?" first.)
  body.appendChild(el('div', { className: 'picker-filters' }, topLine, foldRow, hardy.source, all, activeRow));
  body.appendChild(countLine);
  body.appendChild(listWrap);
  rebuildList();

  // (Its full height whatever the list holds: a shorter list moved its top, and the search box and filters with it,
  // between a click and the next. Marcus, Diego, Tom, Oct 30.)
  const sheet = el('div', { className: 'sheet picker-sheet' }, el('div', { className: 'sheet-top' }, header, searchBar), body);
  // Typing far down the list: bring the start of the results back into view (scrolling only; the keyboard stays).
  search.addEventListener('input', () => {
    const top = sheet.querySelector<HTMLElement>('.sheet-top')!.offsetHeight;
    const y = countLine.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
    if (y < top) sheet.scrollTop += y - top - 4;
  });
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) closePicker(); });
  return overlay;
}
