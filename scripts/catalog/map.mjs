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
 * woody or other form among the tags), annual or perennial is read from the tags and its Life Cycle
 * together: what both say, and where they share nothing, the Life Cycle. The tags can say "Annual" for a
 * perennial grown as one (garden sage: Annual and Perennial tags, a perennial life cycle) or "Herbaceous
 * Perennial" for a biennial (rosepink); the Life Cycle can add a stray "Annual" (wild geranium). A plain
 * "Perennial" tag says only that the plant lives for years (oakleaf hydrangea has it beside Shrub): for an
 * herb, a perennial (baptisia, and many wildflowers, carry it and nothing else). A biennial dies after it
 * flowers: closer to an annual in a garden.
 */
export function ncsuForms(types, life) {
  const forms = [...new Set((types ?? []).map((t) => NCSU_FORM[t]).filter(Boolean))];
  if (!forms.every((f) => f === 'Annual' || f === 'Perennial')) return forms;
  const tags = [...new Set([...forms, ...((types ?? []).includes('Perennial') ? ['Perennial'] : [])])];
  const cycle = [(life ?? []).includes('Perennial') ? 'Perennial' : null, (life ?? []).some((x) => x === 'Annual' || x === 'Biennial') ? 'Annual' : null].filter(Boolean);
  // (A woody life cycle with no woody form among the tags: a plant that lives for years, but not which form.)
  if (!cycle.length) return (life ?? []).includes('Woody') ? forms : tags;
  const both = cycle.filter((f) => tags.includes(f));
  return both.length ? both : cycle;
}
