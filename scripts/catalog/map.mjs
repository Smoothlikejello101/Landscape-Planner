// Reading each source's own terms: NC State's light levels and plant types,
// Minnesota Wildflowers' habitat light. How facts are decided is in
// claims.mjs (docs/catalog-sources.md).

// ---------- Sun ----------

const LIGHT = [['Full sun', 'Full'], ['Partial Shade', 'Part'], ['Deep shade', 'Shade'], ['Dappled', 'Part']];
const SUN_ORDER = ['Full', 'Part', 'Shade'];
/** NC State's Light list → { most, least }. */
export function ncsuSun(values) {
  const got = new Set();
  for (const v of values ?? []) for (const [k, s] of LIGHT) if (v.toLowerCase().startsWith(k.toLowerCase())) got.add(s);
  const list = SUN_ORDER.filter((s) => got.has(s));
  return list.length ? { most: list[0], least: list[list.length - 1] } : null;
}
/** Minnesota Wildflowers' habitat light ("part shade, sun") → { most, least } sun. */
export function mnLight(habitat) {
  const first = String(habitat).split(';')[0].toLowerCase();
  const got = new Set();
  for (const part of first.split(/\s*,\s*/)) {
    if (/^(full )?sun$/.test(part)) got.add('Full');
    else if (/^part (shade|sun)$/.test(part)) got.add('Part');
    else if (/^(full |deep )?shade$/.test(part)) got.add('Shade');
  }
  const list = SUN_ORDER.filter((s) => got.has(s));
  return list.length ? { most: list[0], least: list[list.length - 1] } : null;
}

// ---------- Form ----------

const NCSU_FORM = { Tree: 'Tree', Shrub: 'Shrub', Vine: 'Vine', Fern: 'Fern', Bulb: 'Bulb', 'Cactus/Succulent': 'Cactus', 'Ornamental Grasses and Sedges': 'Grass/Sedge', Annual: 'Annual', 'Herbaceous Perennial': 'Perennial', Aquatic: 'Aquatic/Emergent' };
/** Forms from NC State's Plant Type tags (Tree not yet split into canopy or understory). */
export function ncsuForms(types) {
  return [...new Set((types ?? []).map((t) => NCSU_FORM[t]).filter(Boolean))];
}
