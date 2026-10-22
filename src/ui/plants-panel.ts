import { el, type Child } from '../dom';
import { I } from '../icons';
import type { Plant, PlantFilter } from '../plants';
import { MONTH_NAMES, matchedBy, reportedOnly, plantColor, PLANTS, PLANT_FILTER_DEFAULTS, PLANT_META, filteredPlants, linkFromPicker, plantFilter, plantIdsInPlan, plantMetaLine, plantTakesSun } from '../plants';
import { recentPlants, startPlacing, switchPlacingPlant } from '../place';
import { startTreeDraw } from '../draw';
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
const isTree = (p: Plant) => !!p.form?.startsWith('Tree'); // (its first form: what it's drawn as)
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
  const title = linking ? 'Link to a plant' : forTree ? 'Which tree?' : state.placing ? 'Switch plant' : 'Plant Picker' + (PLANTS.length ? ' (' + (PLANTS.length + myPlants.length) + ')' : '');
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, title),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', closePicker); return b; })()
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
  const countLine = el('div', { className: 'hint', style: { padding: '0 0 6px' } });
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
      flagged ? el('span', { className: 'row-flag', 'data-testid': 'row-flag', title: 'Shown because of what nurseries report' }, '!',
        el('span', { className: 'sr-only' }, ' (shown because of what nurseries report)')) : null,
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
  /** "My plants" matching the search and sun filter (their other fields are whatever the user entered). */
  function myHits(): Plant[] {
    const q = plantFilter.q.trim().toLowerCase();
    const inPlan = plantFilter.inPlan ? plantIdsInPlan() : null;
    return myPlants.filter((p) =>
      (!inPlan || inPlan.has(p.id)) &&
      (!q || (p.common + ' ' + (p.botanical || '') + ' ' + (p.notes || '')).toLowerCase().includes(q)) &&
      (!plantFilter.sun || !p.sun_most || plantTakesSun(p, plantFilter.sun)));
  }
  function addButton(): HTMLElement {
    const q = plantFilter.q.trim();
    const b = el('button', { className: 'btn secondary add-own', 'data-testid': 'add-own-plant' },
      q ? `+ Add \u201c${q}\u201d as my plant` : '+ Add your own plant');
    b.addEventListener('click', () => openForm({ name: q, place: true }));
    return b;
  }
  refreshList = () => { if (listWrap.isConnected) rebuildList(); };
  function rebuildList() {
    while (listWrap.firstChild) listWrap.removeChild(listWrap.firstChild);
    const mine = myHits().filter((p) => !forTree || isTree(p) || !p.form);
    const hits = filteredPlants().filter((p) => !forTree || isTree(p));
    const n = hits.length + mine.length, all = PLANTS.length + myPlants.length;
    countLine.textContent = (n === all ? `All ${all} plants` : `${n} of ${all} plants match`) +
      (linking ? ' \u00b7 Link the plant this circle stands for' : forTree ? ' \u00b7 trees only' : ' \u00b7 Place a plant, then tap the plan where it goes; tap a plant for its details');
    if (mine.length) {
      // My plants fold away (remembered on this device); a search always shows its matches.
      const searching = !!plantFilter.q.trim();
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
    // Always offer to add a plant; right under the search when nothing matched.
    if (hits.length === 0 && mine.length === 0) listWrap.insertBefore(addButton(), listWrap.firstChild);
    else listWrap.appendChild(addButton());
  }

  // --- Filter controls (all update the list in place; no full render) ---
  const search = el('input', { type: 'text', value: plantFilter.q, placeholder: 'Search name, host, notes\u2026', 'data-testid': 'plant-search' });
  search.addEventListener('input', () => { plantFilter.q = search.value; rebuildList(); });

  const enums = (PLANT_META && PLANT_META.enums) || {};
  type StringKey = { [K in keyof PlantFilter]: PlantFilter[K] extends string ? K : never }[keyof PlantFilter];
  type BoolKey = { [K in keyof PlantFilter]: PlantFilter[K] extends boolean ? K : never }[keyof PlantFilter];
  function mkSelect<T extends string | number>(label: string, key: StringKey, options: readonly T[], display?: (o: T) => string) {
    const sel = el('select', {});
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
    // Says unverified while it goes by the older list for any plant (until each has a sourced rating: docs/catalog-sources.md).
    mkCheck(PLANTS.some((p) => !p.tox?.dog) ? 'Non-toxic to dogs (unverified)' : 'Non-toxic to dogs', 'dogSafeOnly'),
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
  adv.appendChild(row(
    mkSelect('Any height', 'maxHeight', [1, 2, 3, 4, 6, 10, 20, 40], v => 'Under ' + v + " ft"),
    mkSelect('Any maintenance', 'maintenance', enums.maintenance || [])
  ));
  adv.appendChild(row(
    mkSelect('Any self-seeding', 'selfSeed', enums.self_seed || [])
  ));
  adv.appendChild(el('div', { className: 'hint', style: { padding: '10px 0 0' } }, 'Traits'));
  adv.appendChild(el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px 16px', margin: '4px 0 8px' } },
    mkCheck('Fall color', 'fallColor'),
    mkCheck('Winter interest', 'winterInterest'),
    mkCheck('Clay OK', 'clayOk'),
    mkCheck('Edible', 'edible'),
    mkCheck('Transplantable', 'noTaproot'),
    mkCheck('Already in this plan', 'inPlan')
  ));
  adv.appendChild(el('div', { className: 'hint', style: { padding: '10px 0 0' } }, 'Sources'));
  adv.appendChild(el('div', { style: { margin: '4px 0 8px' } },
    mkCheck('Include what nurseries report', 'withReported'),
    el('div', { className: 'hint', style: { fontSize: '11px' } }, 'Where nurseries differ from the published references (extension services, botanical gardens), let their values count too. A plant shown only because of them is marked !.')));

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
    const wasAdvanced = plantFilter.advanced;
    Object.assign(plantFilter, PLANT_FILTER_DEFAULTS);
    plantFilter.advanced = wasAdvanced;
    render(); // full rebuild so every control shows its cleared value
  });
  const btnRow = el('div', { style: { display: 'flex', gap: '8px', margin: '8px 0 4px' } }, toggle, resetBtn);

  // The search stays in view while the list scrolls (with the header, below).
  const searchBar = el('div', { className: 'picker-search field' }, search);
  body.appendChild(primary);
  body.appendChild(primaryChecks);
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
