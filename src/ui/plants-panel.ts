import { el, type Child } from '../dom';
import { I } from '../icons';
import type { DogFilter, Plant, PlantFilter } from '../plants';
import { byMatch, inNotes, matchPlant, nearShows, readQuery } from '../search';
import { MONTH_NAMES, formsOf, matchedBy, reportedOnly, plantColor, PLANTS, PLANT_FILTER_DEFAULTS, PLANT_META, filteredPlants, linkFromPicker, plantFilter, plantIdsInPlan, plantMetaLine, plantTakesSun, countWord, invasivesLeftOut, pickerCount, toxicToDogs, nonToxicToDogs } from '../plants';
import { recentPlants, startPlacing, switchPlacingPlant } from '../place';
import { startTreeDraw } from '../draw';
import { spreadsAs } from '../spread';
import { heightLabel, heightRange } from './height-range';
import { isMine, myPlants } from '../my-plants';
import type { PlantFormArgs } from '../types';
import { state } from '../state';
import { ZONE_SOURCE_SHORT } from '../climate';
import { dismissZipPrompt, openLocation, zipPromptDismissed } from './location-panel';
import { render } from './render';
import { plantDetails } from './plant-details';
import { escapeHere, escapeShort, gardenStateName, lawShort, loadWild, regulatedHere } from '../wild';

/** The open picker's list rebuild (in place: the search keeps the keyboard, opened rows stay open). */
let refreshList: (() => void) | null = null;
/** Once the garden's wild records are in, show them in the list. */
function afterWild() { if (state.panel === 'plants') { addNativeHereOption(); refreshList?.(); } }
/**
 * "Native to <state>" in the native-status filter, once the garden's state (with native status) is known: put in
 * place when the records arrive after the panel is drawn, without redrawing it (the search box may have focus).
 */
function addNativeHereOption() {
  const sel = document.querySelector<HTMLSelectElement>('[data-testid=native-filter]'), here = gardenStateName();
  if (!sel || !here || sel.querySelector('option[value="@here"]')) return;
  const o = el('option', { value: '@here' }, `Native to ${here}`) as HTMLOptionElement;
  o.selected = plantFilter.native === '@here';
  sel.insertBefore(o, sel.options[1] ?? null);
}

function closePicker() { state.panel = null; state.pickerLinkId = null; state.pickerLinkAlso = []; state.pickerLinkLocked = false; state.pickerForTree = false; render(); }
// (A tree among its forms: a shrub that grows into a tree, mimosa or wax myrtle, can be the tree in the yard.)
const isTree = (p: Plant) => formsOf(p).includes('Tree');
// My plants folded away in the picker: kept here, and remembered on this device when storage allows.
const FOLD_KEY = 'lp-my-plants-folded';
let myPlantsFolded = (() => { try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } })();
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
    linkFromPicker(p);
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
function openForm(args: PlantFormArgs) { state.plantForm = args; state.panel = 'plantForm'; render(); }

export function renderPlantsPanel() {
  void loadWild(afterWild);
  const linking = !!state.pickerLinkId;
  const forTree = !linking && state.pickerForTree;
  const title = linking ? 'Link to a plant' : forTree ? 'Which tree?' : state.placing ? 'Switch plant' : 'Plant Picker' + (PLANTS.length ? ' (' + countWord(PLANTS.filter((p) => !p.invasive).length + myPlants.length) + ')' : '');
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, title),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' }); b.addEventListener('click', closePicker); return b; })()
  );

  const body = el('div', { className: 'sheet-body' });
  const linkCount = 1 + state.pickerLinkAlso.length;
  if (linking) body.appendChild(el('div', { className: 'banner' }, linkCount > 1
    ? `Pick the plant these ${linkCount} circles stand for. They keep their places and take the plant's name and size.`
    : 'Pick the plant this circle stands for. It keeps its place and takes the plant\'s name and size.'));
  if (forTree) {
    // A tree already in the yard: name it if it's in the list, then draw its canopy as it is.
    body.appendChild(el('div', { className: 'banner' }, 'Pick the tree, then tap its trunk and the edge of its canopy.'));
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
        el('span', { className: 'sw-dot', style: { background: plantColor(p) } }), el('span', {}, p.common));
      chip.addEventListener('click', () => pick(p));
      row.appendChild(chip);
    }
    body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Recent'), row));
  }
  if (PLANTS.some((p) => p.unverified || p.partlyChecked)) {
    body.appendChild(el('div', { className: 'hint', 'data-testid': 'unverified-note' },
      'Plants are being checked against published references. Unverified: all its details are from an older list with no sources. Partly checked: some are sourced; open it to see which (the rest say "older list"). Treat unchecked details as a rough guide.'));
  }
  if (!PLANTS.length) {
    body.appendChild(el('div', { className: 'hint' }, 'The plant catalog is still loading (or could not load). Your own plants work either way.'));
  }

  // --- Results list (rebuilt in place so typing never destroys input focus) ---
  const countLine = el('div', { className: 'hint', 'data-testid': 'picker-count', style: { padding: '0 0 6px' } });
  const listWrap = el('div', {});
  // Rows opened to show their details (kept while the list is rebuilt by typing or filtering).
  const opened = new Set<string>();
  /**
   * A plant's row: tap it to open its details, or Place (Link, Pick) to use it.
   * Opening and closing change only this row, so the search box keeps the keyboard.
   */
  function buildRow(p: Plant) {
    const info = el('div', { className: 'pinfo' },
      el('div', { className: 'pname' }, p.common),
      el('div', { className: 'pmeta' }, (p.botanical ? p.botanical + ' \u2014 ' : '') + plantMetaLine(p))
    );
    // Found by what it hosts, not its name: say so, or the match looks like a mistake.
    if (!isMine(p) && matchedBy(p, plantFilter.q) === 'host') {
      info.appendChild(el('div', { className: 'pmatch', 'data-testid': 'host-match' }, 'Host for: ' + p.host));
    }
    // What the law says of it here, in short ("Prohibited in Arkansas"): seen without opening it.
    // (Red for a ban; amber where every line only lists it.)
    const law = regulatedHere(p);
    if (law.length) info.appendChild(el('div', { className: `plaw${law.every((r) => r.tier === 'listed') ? ' listed' : ''}`, 'data-testid': 'row-law' }, lawShort(law)));
    // Not native here, and recorded growing wild here all the same: seen without opening it too.
    const escape = escapeHere(p);
    if (escape) info.appendChild(el('div', { className: 'pescape', 'data-testid': 'row-escape' }, escapeShort(escape)));
    const dot = el('div', { style: {
      width: '14px', height: '14px', borderRadius: '50%', flex: 'none',
      background: plantColor(p), marginRight: '10px'
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
    const verb = linking ? 'Link' : forTree ? 'Pick' : state.placing ? 'Switch' : 'Place';
    const place = el('button', { className: 'btn place-btn', 'data-testid': 'plant-place', 'aria-label': `${verb === 'Link' ? 'Link to' : verb === 'Switch' ? 'Switch to' : verb} ${p.common}` }, verb);
    place.addEventListener('click', () => pick(p));
    head.appendChild(place);
    // Mine: edit. Catalog: copy as my own (a cultivar of it, say).
    const mine = isMine(p);
    const side = el('button', {
      className: 'iconbtn', html: mine ? I.edit : I.copy,
      title: mine ? 'Edit my plant' : 'Copy as my plant',
      'aria-label': (mine ? 'Edit ' : 'Copy as my plant: ') + p.common,
    });
    side.addEventListener('click', () => openForm(mine ? { editId: p.id, place: false } : { copyFromId: p.id, place: false }));
    head.appendChild(side);
    if (mine) info.firstChild!.appendChild(el('span', { className: 'mine-badge' }, 'Mine'));
    // Details not yet checked against sources say so, plainly, on every row (first in the details, where it can't be cut off).
    else if (p.unverified) (info.childNodes[1] as HTMLElement).prepend(el('span', { className: 'unverified-badge', title: "From an older list with no sources; it's being checked" }, 'Unverified'), ' ');
    else if (p.partlyChecked) (info.childNodes[1] as HTMLElement).prepend(el('span', { className: 'unverified-badge', 'data-testid': 'partly-badge', title: 'Some details are checked against sources; those marked "older list" in its details are not yet' }, 'Partly checked'), ' ');
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
   * "My plants" matching the search and sun filter (their other fields are whatever the user entered): by name, as
   * the catalog is searched, or with every word starting a word of their notes. `near` as for the catalog.
   */
  function myHits(near: boolean): Plant[] {
    const q = readQuery(plantFilter.q);
    const inPlan = plantFilter.inPlan ? plantIdsInPlan() : null;
    const shown = myPlants.filter((p) => (!inPlan || inPlan.has(p.id)) && (!plantFilter.sun || !p.sun_most || plantTakesSun(p, plantFilter.sun)));
    if (!q) return shown;
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
  function rebuildList() {
    while (listWrap.firstChild) listWrap.removeChild(listWrap.firstChild);
    // Near spellings only when nothing searched matches closer, before any filter (search.ts); a plant of mine
    // found by its notes counts as a match.
    const q = readQuery(plantFilter.q);
    const near = nearShows(q, PLANTS, myPlants);
    const mine = myHits(near).filter((p) => !forTree || isTree(p) || !p.form);
    const hits = filteredPlants(near).filter((p) => !forTree || isTree(p));
    // (While browsing, the invasives aren't offered: not counted, and said so; a search counts them.)
    const out = invasivesLeftOut(plantFilter) ? PLANTS.filter((p) => p.invasive) : [];
    const n = hits.length + mine.length, all = PLANTS.length + myPlants.length - out.length;
    countLine.textContent = pickerCount(n, all, out.filter((p) => !forTree || isTree(p)).length) +
      (linking ? ' \u00b7 Link the plant this circle stands for' : forTree ? ' \u00b7 trees only' : ' \u00b7 Place a plant, then tap the plan where it goes; tap a plant for its details');
    if (mine.length) {
      // My plants fold away (remembered on this device); a search always shows its matches.
      const searching = !!q;
      const open = searching || !myPlantsFolded;
      const head = el('button', { className: 'list-heading fold', 'aria-expanded': String(open), 'data-testid': 'my-plants-fold' },
        el('span', {}, `My plants (${mine.length})`), el('span', { className: 'fold-chev', html: I.chevronDown }));
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
    for (const p of hits.slice(0, 60)) listWrap.appendChild(buildRow(p));
    if (hits.length > 60) {
      listWrap.appendChild(el('div', { className: 'hint', style: { padding: '8px 0' } },
        '+ ' + (hits.length - 60) + ' more \u2014 narrow the filters to see them'));
    }
    if (hits.length === 0 && mine.length === 0) {
      listWrap.appendChild(el('div', { className: 'hint', style: { padding: '8px 0' } },
        'No matches. Add it as your own plant, or loosen a filter.'));
    }
    // Always offer to add a plant; right under the search when nothing matched as typed (close spellings are guesses:
    // say so above them).
    if (hits.length === 0 && mine.length === 0) listWrap.insertBefore(addButton(), listWrap.firstChild);
    else if (near) {
      listWrap.insertBefore(el('div', { className: 'hint', style: { padding: '0 0 6px' }, 'data-testid': 'near-note' },
        `Nothing matches \u201c${plantFilter.q.trim()}\u201d as typed. Close spellings:`), listWrap.firstChild);
      listWrap.insertBefore(addButton(), listWrap.firstChild);
    } else listWrap.appendChild(addButton());
  }

  // --- Filter controls (all update the list in place; no full render) ---
  const search = el('input', { type: 'text', value: plantFilter.q, placeholder: 'Search name, host, notes\u2026', 'data-testid': 'plant-search' });
  search.addEventListener('input', () => { plantFilter.q = search.value; rebuildList(); });

  const enums = (PLANT_META && PLANT_META.enums) || {};
  type StringKey = { [K in keyof PlantFilter]: PlantFilter[K] extends string ? (string extends PlantFilter[K] ? K : never) : never }[keyof PlantFilter];
  type BoolKey = { [K in keyof PlantFilter]: PlantFilter[K] extends boolean ? K : never }[keyof PlantFilter];
  /** What each dropdown filters, for screen readers (its first option, "Any form", says what it's set to). */
  const SELECT_NAMES: Partial<Record<StringKey, string>> = { form: 'Form', sun: 'Sun', water: 'Water', bloomMonth: 'Blooming in', nectar: 'Nectar', bird: 'Value to birds', native: 'Native status', deer: 'Deer resistance', maintenance: 'Maintenance', spread: 'How it spreads' };
  function mkSelect<T extends string | number>(label: string, key: StringKey, options: readonly T[], display?: (o: T) => string) {
    const sel = el('select', { 'aria-label': SELECT_NAMES[key] ?? label });
    sel.appendChild(el('option', { value: '' }, label));
    for (const o of options) {
      const opt = el('option', { value: String(o) }, display ? display(o) : String(o));
      if (String(plantFilter[key]) === String(o)) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => { plantFilter[key] = sel.value; rebuildList(); });
    return el('div', { className: 'field', style: { flex: '1', minWidth: '0' } }, sel);
  }
  const withTestId = (field: HTMLElement, id: string) => { field.querySelector('select')?.setAttribute('data-testid', id); return field; };
  function mkCheck(label: string, key: BoolKey) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = !!plantFilter[key];
    cb.addEventListener('change', () => { plantFilter[key] = cb.checked; rebuildList(); });
    return el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '4px 0' } }, cb, label);
  }
  function row(...kids: Child[]) {
    return el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } }, ...kids);
  }

  // ---- PRIMARY FILTERS (always visible) ----
  const primary = el('div', {},
    row(mkSelect('Any form', 'form', enums.form || []),
        mkSelect('Any sun', 'sun', ['Full', 'Part', 'Shade'])),
    row(mkSelect('Any water', 'water', enums.water || []),
        mkSelect('Blooming in\u2026', 'bloomMonth', [1,2,3,4,5,6,7,8,9,10,11,12], m => MONTH_NAMES[m]))
  );
  const primaryChecks = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px 16px', margin: '8px 0 4px' } },
    // (Only plants whose NC State page was read and lists no poison: one it doesn't rate isn't called safe.)
    mkCheck('No poison to people listed (NC State)', 'noPoison'),
    state.location ? mkCheck(`Hardy in zone ${state.location.zone}`, 'hardyHere') : null,
    mkCheck('Dry shade', 'dryShade'),
    mkCheck('Wet feet', 'wetFeet'),
    mkCheck('Host plant', 'hostOnly')
  );
  if (state.location) primaryChecks.appendChild(el('div', { className: 'hint', style: { flexBasis: '100%', fontSize: '11px' } }, `Zones: ${ZONE_SOURCE_SHORT}.`));
  // No location yet: offer it once, where it pays off (dismissed for good on this device).
  const zipPrompt = !state.location && !zipPromptDismissed() ? (() => {
    const go = el('button', { className: 'zip-prompt-go', 'data-testid': 'zip-prompt' }, el('span', { html: I.pin }), 'Add your ZIP code to see which plants are hardy where you are');
    go.addEventListener('click', () => openLocation('plants'));
    const no = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Don’t show this again' });
    no.addEventListener('click', () => { dismissZipPrompt(); zipRow.remove(); search.focus(); }); // (focus stays in the picker)
    const zipRow = el('div', { className: 'zip-prompt' }, go, no);
    return zipRow;
  })() : null;

  // ---- ANIMAL TOXICITY (folds; a line per animal: dogs now, cats and horses when a source rates them) ----
  const animals = (() => {
    const DOGS: [DogFilter, string][] = [
      ['', 'Include toxic plants'],
      ['hideToxic', 'Hide toxic plants, include unknown'],
      // Says unverified while it goes by the older list for any plant (until each has a sourced rating: docs/catalog-sources.md).
      ['nonToxic', PLANTS.some((p) => !p.tox?.dog) ? 'Include only non-toxic (unverified)' : 'Include only non-toxic'],
    ];
    const summary = () => (plantFilter.dogs === 'hideToxic' ? ' \u00b7 dogs: hiding toxic' : plantFilter.dogs === 'nonToxic' ? ' \u00b7 dogs: non-toxic only' : '');
    const label = el('span', {}, 'Animal toxicity' + summary());
    const head = el('button', { className: 'filter-fold', 'aria-expanded': String(plantFilter.animals), 'data-testid': 'animal-fold' },
      label, el('span', { className: 'fold-chev', html: I.chevronDown }));
    // (What the choice does, in numbers: how many it hides, and how many aren't rated at all.)
    const nToxic = PLANTS.filter(toxicToDogs).length, nSafe = PLANTS.filter(nonToxicToDogs).length;
    const nUnrated = PLANTS.length - nToxic - nSafe;
    const note = el('div', { className: 'hint', 'data-testid': 'dogs-note' });
    const sayNote = () => {
      note.textContent = plantFilter.dogs === 'hideToxic' ? `Hides the ${countWord(nToxic)} plants with a warning for dogs; keeps the ${countWord(nUnrated)} not yet rated.`
        : plantFilter.dogs === 'nonToxic' ? `Only the ${countWord(nSafe)} plants rated non-toxic to dogs, by an older list with no sources; leaves out the ${countWord(nUnrated)} not yet rated.`
        : `Every plant, whatever it does to dogs. ${countWord(nUnrated)} aren't rated yet: no source we can use rates plants for pets.`;
    };
    sayNote();
    const group = el('div', { role: 'radiogroup', 'aria-label': 'Dogs', className: 'animal-rows' });
    for (const [value, text] of DOGS) {
      const r = el('input', { type: 'radio', name: 'dogs-filter', value, 'data-testid': `dogs-${value || 'any'}` }) as HTMLInputElement;
      r.checked = plantFilter.dogs === value;
      r.addEventListener('change', () => { if (!r.checked) return; plantFilter.dogs = value; label.textContent = 'Animal toxicity' + summary(); sayNote(); rebuildList(); });
      group.appendChild(el('label', { className: 'check-row' }, r, el('span', {}, text)));
    }
    const box = el('div', { className: 'animal-box', style: { display: plantFilter.animals ? 'block' : 'none' } },
      el('div', { className: 'animal-name' }, 'Dogs'), group, note);
    head.addEventListener('click', () => {
      plantFilter.animals = !plantFilter.animals;
      head.setAttribute('aria-expanded', String(plantFilter.animals));
      box.style.display = plantFilter.animals ? 'block' : 'none';
    });
    return el('div', { 'data-testid': 'animal-toxicity' }, head, box);
  })();

  // ---- ADVANCED FILTERS (collapsible) ----
  const adv = el('div', { style: { display: plantFilter.advanced ? 'block' : 'none',
    borderTop: '1px solid #e7e5e4', marginTop: '8px', paddingTop: '4px' } });
  adv.appendChild(el('div', { className: 'hint', style: { padding: '4px 0 0' } }, 'Ecology'));
  adv.appendChild(row(
    mkSelect('Any nectar', 'nectar', ['Med', 'High'], v => v === 'High' ? 'Nectar: High' : 'Nectar: Med+'),
    mkSelect('Any bird value', 'bird', ['Med', 'High'], v => v === 'High' ? 'Birds: High' : 'Birds: Med+')
  ));
  adv.appendChild(row(
    // (Native to the garden's own state, once its ZIP is known: Kew's checklist.)
    withTestId(mkSelect('Any native status', 'native', [...(gardenStateName() ? ['@here'] : []), ...(enums.native || [])], (v) => (v === '@here' ? `Native to ${gardenStateName()}` : v)), 'native-filter'),
    mkSelect('Any deer rating', 'deer', enums.deer || [])
  ));
  adv.appendChild(el('div', { className: 'hint', style: { padding: '10px 0 0' } }, 'Size & care'));
  // (Mature height: the readout follows a handle as it moves; the list changes when it's let go.)
  const heightReadout = el('span', { 'data-testid': 'height-readout' }, heightLabel(plantFilter.height));
  adv.appendChild(el('div', { className: 'field', style: { marginTop: '8px' } },
    el('div', { className: 'hint', style: { display: 'flex', justifyContent: 'space-between' } }, el('span', {}, 'Mature height'), heightReadout),
    heightRange(plantFilter.height, (v) => { heightReadout.textContent = heightLabel(v); }, (v) => { plantFilter.height = v; heightReadout.textContent = heightLabel(v); rebuildList(); })));
  adv.appendChild(row(
    mkSelect('Any maintenance', 'maintenance', enums.maintenance || [])
  ));
  adv.appendChild(row(
    // (Says unverified while any plant it lets through goes by the older list for either fact, as the dog filter does.)
    withTestId(mkSelect('Any spreading', 'spread', ['stays', 'seed', 'runs', 'aggressive'], (v) => ({
      stays: PLANTS.some((p) => spreadsAs(p, 'stays') && [p.prov?.self_seed, p.prov?.habit].some((pv) => !pv || pv.src.every((s) => PLANT_META?.sources?.[s]?.trust === 'unverified'))) ? 'Stays put (unverified)' : 'Stays put',
      seed: 'Self-sows freely', runs: 'Spreads underground or by runners', aggressive: 'Spreads aggressively underground or by runners',
    } as Record<string, string>)[v] ?? v), 'spread-filter')
  ));
  adv.appendChild(el('div', { className: 'hint', style: { padding: '10px 0 0' } }, 'Traits'));
  adv.appendChild(el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px 16px', margin: '4px 0 8px' } },
    mkCheck('Fall color', 'fallColor'),
    mkCheck('Evergreen', 'evergreen'),
    mkCheck('Winter interest', 'winterInterest'),
    mkCheck('Clay OK', 'clayOk'),
    mkCheck('Edible', 'edible'),
    mkCheck('Transplantable', 'noTaproot'),
    mkCheck('Already in this plan', 'inPlan')
  ));
  adv.appendChild(el('div', { className: 'hint', style: { padding: '10px 0 0' } }, 'Sources'));
  adv.appendChild(el('div', { style: { margin: '4px 0 8px' } },
    mkCheck('Include where sources differ', 'withReported'),
    el('div', { className: 'hint', style: { fontSize: '11px' } }, 'Where sources disagree, a plant shows the value more of them give (on a tie, the cautious one), with the other beside it. Let the other count too. A plant shown only because of it is marked !.')));

  // ---- Toggle + reset ----
  const toggle = el('button', { className: 'btn ghost', style: { flex: '1', fontSize: '13px', padding: '6px' } });
  function syncToggleLabel() {
    toggle.textContent = (plantFilter.advanced ? '\u2212 Fewer filters' : '+ More filters');
  }
  syncToggleLabel();
  toggle.addEventListener('click', () => {
    plantFilter.advanced = !plantFilter.advanced;
    adv.style.display = plantFilter.advanced ? 'block' : 'none';
    syncToggleLabel();
  });
  const resetBtn = el('button', { className: 'btn ghost', style: { flex: '1', fontSize: '13px', padding: '6px' } }, 'Reset filters');
  resetBtn.addEventListener('click', () => {
    // (Filters only: the search stays, and so do the sections that were open.)
    const { advanced, animals: animalsOpen, q } = plantFilter;
    Object.assign(plantFilter, PLANT_FILTER_DEFAULTS, { advanced, animals: animalsOpen, q });
    render(); // full rebuild so every control shows its cleared value
  });
  const btnRow = el('div', { style: { display: 'flex', gap: '8px', margin: '8px 0 4px' } }, toggle, resetBtn);

  // The search stays in view while the list scrolls (with the header, below).
  const searchBar = el('div', { className: 'picker-search field' }, search);
  body.appendChild(primary);
  body.appendChild(primaryChecks);
  body.appendChild(animals);
  if (zipPrompt) body.insertBefore(zipPrompt, primary);
  body.appendChild(btnRow);
  body.appendChild(adv);
  body.appendChild(countLine);
  body.appendChild(listWrap);
  rebuildList();

  const sheet = el('div', { className: 'sheet' }, el('div', { className: 'sheet-top' }, header, searchBar), body);
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
