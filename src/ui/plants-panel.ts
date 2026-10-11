import { el } from '../dom';
import { I } from '../icons';
import { FORM_COLORS, MONTH_NAMES, PLANTS, PLANT_FILTER_DEFAULTS, PLANT_META, addPlantShape, filteredPlants, plantFilter, plantMetaLine } from '../plants';
import { state } from '../state';
import { render } from './render';

export function renderPlantsPanel() {
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Plant Picker' + (PLANTS.length ? ' (' + PLANTS.length + ')' : '')),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
  );

  const body = el('div', { className: 'sheet-body' });

  if (!PLANTS.length) {
    body.appendChild(el('div', { className: 'hint' }, 'Plant index not loaded yet. If this persists, check that plants.json is deployed and the service worker cache version was bumped.'));
    const sheet0 = el('div', { className: 'sheet' }, header, body);
    const overlay0 = el('div', { className: 'overlay' }, sheet0);
    overlay0.addEventListener('click', e => { if (e.target === overlay0) { state.panel = null; render(); } });
    return overlay0;
  }

  // --- Results list (rebuilt in place so typing never destroys input focus) ---
  const countLine = el('div', { className: 'hint', style: { padding: '0 0 6px' } });
  const listWrap = el('div', {});
  function buildRow(p) {
    const info = el('div', { className: 'pinfo' },
      el('div', { className: 'pname' }, p.common),
      el('div', { className: 'pmeta' }, (p.botanical ? p.botanical + ' \u2014 ' : '') + plantMetaLine(p))
    );
    const dot = el('div', { style: {
      width: '14px', height: '14px', borderRadius: '50%', flex: 'none',
      background: FORM_COLORS[p.form] || '#16a34a', marginRight: '10px'
    } });
    const row = el('div', { className: 'proj-row', style: { alignItems: 'center' } }, dot, info);
    row.addEventListener('click', () => {
      addPlantShape(p);
      state.panel = null;
      render();
    });
    return row;
  }
  function rebuildList() {
    while (listWrap.firstChild) listWrap.removeChild(listWrap.firstChild);
    const hits = filteredPlants();
    countLine.textContent = hits.length + ' match' + (hits.length === 1 ? '' : 'es') + ' \u00b7 tap a plant to place it';
    for (const p of hits.slice(0, 60)) listWrap.appendChild(buildRow(p));
    if (hits.length > 60) {
      listWrap.appendChild(el('div', { className: 'hint', style: { padding: '8px 0' } },
        '+ ' + (hits.length - 60) + ' more \u2014 narrow the filters to see them'));
    }
    if (hits.length === 0) {
      listWrap.appendChild(el('div', { className: 'hint', style: { padding: '8px 0' } },
        'No matches. Loosen a filter \u2014 or check \u201cShow archived\u201d if you are hunting a rejected/zone-fail plant.'));
    }
  }

  // --- Filter controls (all update the list in place; no full render) ---
  const search = el('input', { type: 'text', value: plantFilter.q, placeholder: 'Search name, host, notes\u2026' });
  search.addEventListener('input', () => { plantFilter.q = search.value; rebuildList(); });

  const enums = (PLANT_META && PLANT_META.enums) || {};
  function mkSelect(label, key, options, display) {
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
  function mkCheck(label, key) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = !!plantFilter[key];
    cb.addEventListener('change', () => { plantFilter[key] = cb.checked; rebuildList(); });
    return el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '4px 0' } }, cb, label);
  }
  function row(...kids) {
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
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}
