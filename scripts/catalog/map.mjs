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

const NCSU_FORM = { Tree: 'Tree', Shrub: 'Shrub', Vine: 'Vine', Fern: 'Fern', Bulb: 'Bulb', 'Cactus/Succulent': 'Cactus', 'Ornamental Grasses and Sedges': 'Grass/Sedge', Annual: 'Annual', 'Herbaceous Perennial': 'Perennial', Aquatic: 'Aquatic/Emergent', 'Water Plant': 'Aquatic/Emergent' };
/**
 * Forms from NC State's Plant Type tags (Tree not yet split into canopy or understory). For an herb (no
 * woody or other form among the tags), whether it's an annual or a perennial is its Life Cycle: the tags
 * can say "Annual" for a perennial grown as one (garden sage) or "Herbaceous Perennial" for a biennial
 * (rosepink), and many wildflowers (baptisia) carry only a plain "Perennial" tag, which says just that the
 * plant lives for years (oakleaf hydrangea has it beside Shrub). A biennial dies after it flowers: closer
 * to an annual in a garden.
 */
export function ncsuForms(types, life) {
  const forms = [...new Set((types ?? []).map((t) => NCSU_FORM[t]).filter(Boolean))];
  if (!forms.every((f) => f === 'Annual' || f === 'Perennial')) return forms;
  const cycle = [(life ?? []).includes('Perennial') ? 'Perennial' : null, (life ?? []).some((x) => x === 'Annual' || x === 'Biennial') ? 'Annual' : null].filter(Boolean);
  if (cycle.length) return cycle;
  if (!forms.length && (types ?? []).includes('Perennial')) return ['Perennial'];
  return forms;
}
