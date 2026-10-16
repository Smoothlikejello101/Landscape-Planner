import { el, type Child } from '../dom';
import { I } from '../icons';
import type { Plant, PlantFilter } from '../plants';
import { FORM_COLORS, MONTH_NAMES, PLANTS, PLANT_FILTER_DEFAULTS, PLANT_META, addPlantShape, filteredPlants, linkShapeToPlant, plantFilter, plantMetaLine, plantTakesSun } from '../plants';
import { isMine, myPlants } from '../my-plants';
import type { PlantFormArgs } from '../types';
import { state } from '../state';
import { render } from './render';

function closePicker() { state.panel = null; state.pickerLinkId = null; render(); }
/** Tap on a plant: place it, or (opened from a circle's properties) make that circle this plant. */
function pick(p: Plant) {
  if (state.pickerLinkId) {
    const id = state.pickerLinkId;
    linkShapeToPlant(id, p);
    state.pickerLinkId = null;
    state.selectedIds = [id];
    state.panel = 'props';
  } else {
    addPlantShape(p);
    state.panel = null;
  }
  render();
}
function openForm(args: PlantFormArgs) { state.plantForm = args; state.panel = 'plantForm'; render(); }

export function renderPlantsPanel() {
  const linking = !!state.pickerLinkId;
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, linking ? 'Link to a plant' : 'Plant Picker' + (PLANTS.length ? ' (' + (PLANTS.length + myPlants.length) + ')' : '')),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', closePicker); return b; })()
  );

  const body = el('div', { className: 'sheet-body' });
  if (linking) body.appendChild(el('div', { className: 'banner' }, 'Pick the plant this circle stands for. It keeps its place and takes the plant\'s name and size.'));
  if (!PLANTS.length) {
    body.appendChild(el('div', { className: 'hint' }, 'The plant catalog is still loading (or could not load). Your own plants work either way.'));
  }

  // --- Results list (rebuilt in place so typing never destroys input focus) ---
  const countLine = el('div', { className: 'hint', style: { padding: '0 0 6px' } });
  const listWrap = el('div', {});
  function buildRow(p: Plant) {
    const info = el('div', { className: 'pinfo' },
      el('div', { className: 'pname' }, p.common),
      el('div', { className: 'pmeta' }, (p.botanical ? p.botanical + ' \u2014 ' : '') + plantMetaLine(p))
    );
    const dot = el('div', { style: {
      width: '14px', height: '14px', borderRadius: '50%', flex: 'none',
      background: (p.form && FORM_COLORS[p.form]) || '#16a34a', marginRight: '10px'
    } });
    const row = el('div', { className: 'proj-row', style: { alignItems: 'center' } }, dot, info);
    row.addEventListener('click', () => pick(p));
    // Mine: edit. Catalog: copy as my own (a cultivar of it, say).
    const mine = isMine(p);
    const side = el('button', {
      className: 'iconbtn', html: mine ? I.edit : I.copy,
      title: mine ? 'Edit my plant' : 'Copy as my plant',
      'aria-label': (mine ? 'Edit ' : 'Copy as my plant: ') + p.common,
    });
    side.addEventListener('click', (e) => {
      e.stopPropagation();
      openForm(mine ? { editId: p.id, place: false } : { copyFromId: p.id, place: false });
    });
    row.appendChild(side);
    if (mine) info.firstChild!.appendChild(el('span', { className: 'mine-badge' }, 'Mine'));
    return row;
  }
  /** "My plants" matching the search and sun filter (their other fields are whatever the user entered). */
  function myHits(): Plant[] {
    const q = plantFilter.q.trim().toLowerCase();
    return myPlants.filter((p) =>
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
  function rebuildList() {
    while (listWrap.firstChild) listWrap.removeChild(listWrap.firstChild);
    const mine = myHits();
    const hits = filteredPlants();
    const n = hits.length + mine.length, all = PLANTS.length + myPlants.length;
    countLine.textContent = (n === all ? `All ${all} plants` : `${n} of ${all} plants match`) +
      (linking ? ' \u00b7 tap the plant this circle stands for' : ' \u00b7 tap a plant to place it');
    if (mine.length) {
      listWrap.appendChild(el('div', { className: 'list-heading' }, 'My plants'));
      for (const p of mine) listWrap.appendChild(buildRow(p));
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
    mkCheck('Dog-safe only', 'dogSafeOnly'),
    mkCheck('Dry shade', 'dryShade'),
    mkCheck('Wet feet', 'wetFeet'),
    mkCheck('Host plant', 'hostOnly')
  );

  // ---- ADVANCED FILTERS (collapsible) ----
  const adv = el('div', { style: { display: plantFilter.advanced ? 'block' : 'none',
    borderTop: '1px solid #e7e5e4', marginTop: '8px', paddingTop: '4px' } });
  adv.appendChild(el('div', { className: 'hint', style: { padding: '4px 0 0' } }, 'Ecology'));
  adv.appendChild(row(
    mkSelect('Any nectar', 'nectar', ['Med', 'High'], v => v === 'High' ? 'Nectar: High' : 'Nectar: Med+'),
    mkSelect('Any bird value', 'bird', ['Med', 'High'], v => v === 'High' ? 'Birds: High' : 'Birds: Med+')
  ));
  adv.appendChild(row(
    mkSelect('Any native status', 'native', enums.native || []),
    mkSelect('Any deer rating', 'deer', enums.deer || [])
  ));
  adv.appendChild(el('div', { className: 'hint', style: { padding: '10px 0 0' } }, 'Size & care'));
  adv.appendChild(row(
    mkSelect('Any height', 'maxHeight', [1, 2, 3, 4, 6, 10, 20, 40], v => 'Under ' + v + " ft"),
    mkSelect('Any maintenance', 'maintenance', enums.maintenance || [])
  ));
  adv.appendChild(row(
    mkSelect('Any self-seeding', 'selfSeed', enums.self_seed || []),
    mkSelect('Any status', 'status', enums.status || [])
  ));
  adv.appendChild(row(
    mkSelect('Any nursery', 'source', ['Prairie Moon', 'Izel', 'Prairie Nursery', 'Pine Ridge', 'Local'])
  ));
  adv.appendChild(el('div', { className: 'hint', style: { padding: '10px 0 0' } }, 'Traits'));
  adv.appendChild(el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px 16px', margin: '4px 0 8px' } },
    mkCheck('Fall color', 'fallColor'),
    mkCheck('Winter interest', 'winterInterest'),
    mkCheck('Clay OK', 'clayOk'),
    mkCheck('Edible', 'edible'),
    mkCheck('AR-proven', 'arProven'),
    mkCheck('Transplantable', 'noTaproot'),
    mkCheck('In my plan only', 'inPlan'),
    mkCheck('Show archived', 'showArchived')
  ));

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

  body.appendChild(el('div', { className: 'field' }, search));
  body.appendChild(primary);
  body.appendChild(primaryChecks);
  body.appendChild(btnRow);
  body.appendChild(adv);
  body.appendChild(countLine);
  body.appendChild(listWrap);
  rebuildList();

  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) closePicker(); });
  return overlay;
}
