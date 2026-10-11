import { viewCenterFeet } from './geometry';
import { flushHistoryDebounce, pushHistory } from './history';
import { state } from './state';
import { save } from './storage';
import { render } from './ui/render';
import { snap, uid } from './util';

// ============================================================
// PLANT INDEX DATA (Caddo Valley Plant Index -> plants.json)
// ============================================================
export let PLANTS = [];
export let PLANT_META = null;
export const plantsById = {};
// Picker filter state lives outside `state` so it isn't saved with projects.
export const PLANT_FILTER_DEFAULTS = {
  q: '', form: '', water: '', bloomMonth: '', sun: '',
  native: '', deer: '', nectar: '', bird: '', maintenance: '',
  selfSeed: '', status: '', source: '', maxHeight: '',
  dogSafeOnly: true, dryShade: false, wetFeet: false, clayOk: false,
  hostOnly: false, fallColor: false, winterInterest: false,
  edible: false, arProven: false, noTaproot: false, inPlan: false,
  showArchived: false, // rejected rows, zone-fails, hard-no dog plants
  advanced: false      // UI: is the "More filters" section expanded
};
export const plantFilter = Object.assign({}, PLANT_FILTER_DEFAULTS);
// Sun tolerance is stored as a range: sun_most = most sun tolerated,
// sun_least = least. A plant suits a level if the level falls in that span.
export const SUN_RANK = { 'Full': 0, 'Part': 1, 'Shade': 2 };
export function plantTakesSun(p, level) {
  if (!level) return true;
  const want = SUN_RANK[level];
  const most = SUN_RANK[p.sun_most], least = SUN_RANK[p.sun_least];
  if (most == null || least == null) return false;
  return most <= want && want <= least;
}

fetch('plants.json')
  .then(r => r.json())
  .then(d => {
    PLANTS = d.plants || [];
    PLANT_META = d.meta || null;
    for (const p of PLANTS) plantsById[p.id] = p;
    if (state.panel === 'plants') render(); // refresh picker if already open
  })
  .catch(err => console.error('plants.json load failed', err));
// ============================================================
// PLANT PICKER
// ============================================================
export function plantMatches(p, f) {
  if (f.dogSafeOnly && p.dog !== 'Safe') return false;
  if (!f.showArchived) {
    if (p.status === 'Rejected') return false;
    if (p.dog === 'HARD NO') return false;
    if (p.notes && p.notes.indexOf('FAILS ZONE FILTER') !== -1) return false;
  }
  if (f.form && p.form !== f.form) return false;
  if (f.water && p.water !== f.water) return false;
  if (f.sun && !plantTakesSun(p, f.sun)) return false;
  if (f.native && p.native !== f.native) return false;
  if (f.deer && p.deer !== f.deer) return false;
  if (f.maintenance && p.maintenance !== f.maintenance) return false;
  if (f.selfSeed && p.self_seed !== f.selfSeed) return false;
  if (f.status && p.status !== f.status) return false;
  if (f.source && (!p.source || p.source.indexOf(f.source) === -1)) return false;
  if (f.nectar) {
    // 'High' = high only; 'Med' = med or better
    if (f.nectar === 'High' && p.nectar !== 'High') return false;
    if (f.nectar === 'Med' && !(p.nectar === 'High' || p.nectar === 'Med')) return false;
  }
  if (f.bird) {
    if (f.bird === 'High' && p.bird !== 'High') return false;
    if (f.bird === 'Med' && !(p.bird === 'High' || p.bird === 'Med')) return false;
  }
  if (f.maxHeight) {
    const h = p.height && p.height.med;
    if (h == null || h > Number(f.maxHeight)) return false;
  }
  if (f.dryShade && !p.dry_shade) return false;
  if (f.wetFeet && !p.wet_feet) return false;
  if (f.clayOk && !p.clay_ok) return false;
  if (f.hostOnly && !p.host) return false;
  if (f.fallColor && !p.fall_color) return false;
  if (f.winterInterest && !p.winter_interest) return false;
  if (f.edible && !p.edible) return false;
  if (f.arProven && !p.ar_proven) return false;
  if (f.noTaproot && p.taproot) return false;
  if (f.inPlan && p.status === 'Compendium') return false;
  if (f.bloomMonth) {
    const m = Number(f.bloomMonth);
    if (!p.bloom || p.bloom.start == null || p.bloom.end == null) return false;
    if (!(p.bloom.start <= m && m <= p.bloom.end)) return false;
  }
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = (p.common + ' ' + (p.botanical || '') + ' ' + (p.host || '') + ' ' + (p.bed || '') + ' ' + (p.notes || '')).toLowerCase();
    if (hay.indexOf(q) === -1) return false;
  }
  return true;
}
export function filteredPlants() {
  const out = PLANTS.filter(p => plantMatches(p, plantFilter));
  out.sort((a, b) => a.common.localeCompare(b.common));
  return out;
}
// Canvas color by growth form, drawn from the existing swatch palette
export const FORM_COLORS = {
  'Tree (canopy)': '#78350f', 'Tree (understory)': '#57534e', 'Shrub': '#16a34a',
  'Perennial': '#a855f7', 'Grass/Sedge': '#f59e0b', 'Vine': '#14b8a6',
  'Bulb': '#ec4899', 'Fern': '#65a30d', 'Annual': '#fbbf24',
  'Aquatic/Emergent': '#0ea5e9', 'Cactus': '#84cc16'
};
export function addPlantShape(p) {
  flushHistoryDebounce();
  const c = viewCenterFeet();
  const id = uid();
  const spread = (p.width && p.width.med) || (p.height && p.height.med) || 2;
  const radius = Math.max(0.5, snap(spread / 2));
  const shape = {
    id, type: 'circle',
    x: snap(c.x), y: snap(c.y),
    radius,
    color: FORM_COLORS[p.form] || '#16a34a',
    label: p.common,
    opacity: 0.65, locked: false,
    plantId: p.id // permanent link back to the plant index row
  };
  state.shapes.push(shape);
  state.selectedIds = [id];
  pushHistory();
  save();
}
export const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function plantMetaLine(p) {
  const bits = [];
  if (p.form) bits.push(p.form);
  const spread = p.width && p.width.med;
  const ht = p.height && p.height.med;
  if (ht || spread) bits.push((ht ? ht + "'" : '?') + ' x ' + (spread ? spread + "'" : '?'));
  if (p.bloom && p.bloom.start) {
    bits.push('blooms ' + MONTH_NAMES[p.bloom.start] + (p.bloom.end && p.bloom.end !== p.bloom.start ? '-' + MONTH_NAMES[p.bloom.end] : ''));
  }
  if (p.dog && p.dog !== 'Safe') bits.push('dog: ' + p.dog);
  if (p.sun_most) bits.push(p.sun_most === p.sun_least ? p.sun_most + ' sun' : p.sun_most + '-' + p.sun_least);
  const tags = [];
  if (p.dry_shade) tags.push('dry shade');
  if (p.wet_feet) tags.push('wet ok');
  if (p.nectar === 'High') tags.push('high nectar');
  if (p.host) tags.push('host plant');
  if (tags.length) bits.push(tags.join(', '));
  return bits.join(' \u00b7 ');
}
