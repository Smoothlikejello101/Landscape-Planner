// From each source's fields to catalog facts, by the rules in
// docs/catalog-sources.md ("Deciding each fact", "Zones"). Rules the doc
// leaves to the 20-plant sample are marked PROPOSED: they're shown for
// review and not yet settled.
import { feetRange } from './extract.mjs';

// ---------- Zones ----------

/** The coldest whole zone lying entirely at or above a minimum temperature (°F). */
export function zoneFromTemp(t) {
  return Math.min(13, Math.max(1, Math.ceil((t + 60) / 10) + 1));
}
/** NC State's "4a, 4b, … 9b" → its coldest half-zone's bottom (°F), zone_min, zone_max. */
export function ncsuZones(text) {
  const list = String(text).split(/\s*,\s*/).map((z) => /^(\d{1,2})([ab])$/.exec(z.trim())).filter(Boolean)
    .map((m) => ({ n: Number(m[1]), half: m[2] }));
  if (!list.length) return null;
  const order = (z) => z.n * 2 + (z.half === 'b' ? 1 : 0);
  list.sort((a, b) => order(a) - order(b));
  const cold = list[0], warm = list[list.length - 1];
  const bottom = -60 + 10 * (cold.n - 1) + (cold.half === 'b' ? 5 : 0);
  return { bottom, zone_min: zoneFromTemp(bottom), zone_max: warm.n, label: `${cold.n}${cold.half}–${warm.n}${warm.half}` };
}
/** zone_min from NC State and USDA, compared as the doc says. */
export function decideZoneMin(ncsu, usdaTemp) {
  const n = ncsu ? ncsuZones(ncsu) : null;
  const t = usdaTemp != null && Number.isFinite(Number(usdaTemp)) ? Number(usdaTemp) : null;
  if (n && t != null) {
    if (Math.abs(n.bottom - t) <= 5) return { v: n.zone_min, src: ['ncsu', 'usda'], check: 'agree' };
    const warmer = n.bottom >= t ? { z: n.zone_min, s: 'ncsu', o: 'usda' } : { z: zoneFromTemp(t), s: 'usda', o: 'ncsu' };
    return { v: warmer.z, src: [warmer.s, warmer.o], check: 'disputed' };
  }
  if (n) return { v: n.zone_min, src: ['ncsu'], check: 'single' };
  if (t != null) return { v: zoneFromTemp(t), src: ['usda'], check: 'single' };
  return null;
}

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
/** USDA shade tolerance → the least sun it takes. PROPOSED: values to be listed from the sample first. */
export function usdaLeastSun(value) {
  const v = String(value ?? '').toLowerCase();
  if (/^(low|intolerant|none)$/.test(v)) return 'Full';
  if (/^(intermediate|medium|moderate)$/.test(v)) return 'Part';
  if (/^(high|tolerant)$/.test(v)) return 'Shade';
  return null;
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
/** PROPOSED: USDA growth habits → forms in the same terms. */
export function usdaForms(habits, durations) {
  const annual = (durations ?? []).includes('Annual') && !(durations ?? []).includes('Perennial');
  const map = { Tree: 'Tree', Shrub: 'Shrub', Subshrub: 'Shrub', Vine: 'Vine', Graminoid: 'Grass/Sedge', 'Forb/herb': annual ? 'Annual' : 'Perennial' };
  return [...new Set((habits ?? []).map((h) => map[h]).filter(Boolean))];
}
/**
 * form, by the doc's rule; a tree's kind only from NC State's Design Feature.
 * PROPOSED: how USDA's habits map (usdaForms), and that USDA's Forb/herb
 * neither confirms nor disputes a fern or a bulb (it has no habit for them).
 */
export function decideForm(ncsu, usda) {
  const n = ncsuForms(ncsu['Plant Type']);
  const u = usdaForms(usda?.['Growth habit'], usda?.Duration);
  const usdaSilent = n.length === 1 && (n[0] === 'Fern' || n[0] === 'Bulb') && u.every((f) => f === 'Perennial');
  let out;
  if (n.length === 1) {
    out = !u.length || usdaSilent ? { v: n[0], src: ['ncsu'], check: 'single' }
      : u.includes(n[0]) ? { v: n[0], src: ['ncsu', 'usda'], check: 'agree' }
      : { v: n[0], src: ['ncsu', 'usda'], check: 'disputed', note: `USDA: ${u.join(', ')}` };
  } else if (n.length > 1) {
    // USDA decides when exactly one of NC State's forms is among its habits.
    const shared = u.filter((f) => n.includes(f));
    out = shared.length === 1 ? { v: shared[0], src: ['usda', 'ncsu'], check: 'agree' }
      : { v: null, src: u.length ? ['ncsu', 'usda'] : ['ncsu'], check: 'disputed', note: `NC State lists ${n.join(', ')}${u.length ? `; USDA ${u.join(', ')}` : ''}` };
  } else if (u.length === 1) out = { v: u[0], src: ['usda'], check: 'single' };
  else if (u.length > 1) out = { v: null, src: ['usda'], check: 'disputed', note: `USDA lists ${u.join(', ')}` };
  else return null;
  if (u.length) out.proposed = true;
  if (out.v === 'Tree') {
    const df = ncsu['Design Feature'] ?? [];
    const under = df.includes('Understory Tree'), shade = df.includes('Shade Tree');
    const kind = under && !shade ? 'Tree (understory)' : shade && !under ? 'Tree (canopy)' : null;
    if (kind) out.v = kind;
    else { out.v = null; out.check = 'disputed'; out.note = [out.note, "a tree, but NC State doesn't say understory or shade tree"].filter(Boolean).join('; '); }
  }
  return out;
}

// ---------- Water (PROPOSED: the doc leaves it to the sample) ----------

/**
 * PROPOSED: NC State drainage and drought tolerance → Low / Moderate / High.
 * (Wetland comes only from USDA's National Wetland Plant List, as the doc
 * says, and that isn't read yet.)
 */
export function ncsuWater(f) {
  const d = new Set(f['Soil Drainage'] ?? []), r = new Set(f['Resistance To Challenges'] ?? []);
  if (!d.size) return null;
  if (d.has('Frequent Standing Water')) return 'High';
  if (d.has('Occasionally Wet') && !d.has('Occasionally Dry')) return 'High';
  if (d.has('Occasionally Dry') && r.has('Drought')) return 'Low';
  return 'Moderate';
}
/** PROPOSED: USDA moisture use → the same scale. (It measures how much water a plant uses, not what it needs.) */
export function usdaWater(u) {
  const m = (u?.['Moisture Use'] ?? [])[0];
  return m === 'Low' ? 'Low' : m === 'Medium' ? 'Moderate' : m === 'High' ? 'High' : null;
}

// ---------- The rest ----------

/** A decided fact: `by` decides, every other source checks; any disagreement disputes. */
function decide(said, extra = {}) {
  const have = said.filter(([, v]) => v != null);
  if (!have.length) return null;
  const [by, v] = have[0];
  const others = have.slice(1);
  const agreeing = others.filter(([, x]) => x === v);
  return { v, src: [by, ...others.map(([s]) => s)], check: !others.length ? 'single' : agreeing.length === others.length ? 'agree' : 'disputed', ...(others.length ? { note: others.map(([s, x]) => `${s}: ${x}`).join('; ') } : {}), ...extra };
}

/** Every fact the sample compares, from one plant's fields per source. */
export function mapPlant({ ncsu = {}, usda = {}, mnwild = null, arkatlas = null }) {
  const out = {};
  out.form = decideForm(ncsu, usda);
  const h = ncsu.Height ? feetRange(ncsu.Height[0]) : null;
  const w = ncsu.Width ? feetRange(ncsu.Width[0]) : null;
  const mid = (r) => r && { ...r, med: Math.round(((r.min + r.max) / 2) * 100) / 100 };
  out.height = h ? { v: mid(h), src: ['ncsu'], check: 'single' } : null;
  out.width = w ? { v: mid(w), src: ['ncsu'], check: 'single' } : null;
  out.zone_min = decideZoneMin(ncsu['USDA Plant Hardiness Zone']?.[0], usda['Temperature, Minimum (°F)']?.[0]);
  const nz = ncsu['USDA Plant Hardiness Zone'] ? ncsuZones(ncsu['USDA Plant Hardiness Zone'][0]) : null;
  out.zone_max = nz ? { v: nz.zone_max, src: ['ncsu'], check: 'single' } : null;

  // Sun: NC State decides; USDA stands in, then a regional source; every other source checks.
  const sun = ncsuSun(ncsu.Light);
  const uLeast = usdaLeastSun(usda['Shade Tolerance']?.[0]);
  const mnSun = mnwild?.['Habitat light'] ? mnLight(mnwild['Habitat light'][0]) : null;
  out.sun_most = decide([['ncsu', sun?.most], ['mnwild', mnSun?.most]]);
  out.sun_least = decide([['ncsu', sun?.least], ['usda', uLeast], ['mnwild', mnSun?.least]], uLeast ? { proposed: true } : {});

  const nw = ncsuWater(ncsu), uw = usdaWater(usda);
  out.water = decide([['ncsu', nw], ['usda', uw]], { proposed: true });
  const seasons = (ncsu['Flower Bloom Time'] ?? []).map((s) => s.toLowerCase());
  out.bloom_season = seasons.length ? { v: seasons, src: ['ncsu'], check: 'single', note: usda['Bloom Period'] ? `USDA: ${usda['Bloom Period'][0]}` : '' } : usda['Bloom Period'] ? { v: [usda['Bloom Period'][0].toLowerCase()], src: ['usda'], check: 'single' } : null;
  out.bloom_months_mn = mnwild?.['Bloom season'] ? { v: mnwild['Bloom season'][0], src: ['mnwild'], at: 'MN' } : null;
  out.flower_color = ncsu['Flower Color'] ? { v: ncsu['Flower Color'], src: ['ncsu'], check: 'single' } : null;

  if (arkatlas && !arkatlas.uncertain) {
    const c = arkatlas.codes;
    const labels = [c.includes(2) && 'endemic to Arkansas', c.includes(3) && 'non-native invasive in Arkansas', c.includes(4) && 'of special conservation concern in Arkansas'].filter(Boolean);
    const infra = arkatlas.infraOnly ? `in Arkansas only as ${arkatlas.rows.map((r) => r.infra).join(', ')}` : '';
    out.native_ar = { v: c.includes(1) ? 'introduced' : 'native', src: ['arkatlas'], check: 'single', at: 'AR',
      note: infra && labels.length ? `${infra}, which is ${labels.join(' and ')}` : [...labels, infra].filter(Boolean).join('; ') };
  } else out.native_ar = null; // (not listed, or its maps disagree: left for the review)
  const l48 = (usda['Native status'] ?? []).find((s) => s.startsWith('L48'));
  out.native_us = l48 ? { v: l48.replace('L48: ', '').toLowerCase(), src: ['usda'], check: 'single' } : null;

  const sev = ncsu['Poison Severity']?.[0];
  const derm = ncsu['Causes Contact Dermatitis']?.[0] === 'Yes';
  out.tox_people = sev || derm ? { v: [sev === 'High' || sev === 'Medium' ? 'major' : sev === 'Low' ? 'minor' : null, derm ? 'dermatitis' : null].filter(Boolean), src: ['ncsu'], check: 'single' } : null;
  out.tox_pets = null; // (no usable source: docs/catalog-sources.md)
  out.deer = (ncsu['Resistance To Challenges'] ?? []).includes('Deer') ? { v: 'Resistant', src: ['ncsu'], check: 'single' } : null;
  out.host = ncsu['Larval host for'] ? { v: ncsu['Larval host for'][0], src: ['ncsu'], check: 'single' } : null;
  const uEat = usda['Palatable Human']?.[0];
  out.edible = (ncsu['Plant Type'] ?? []).includes('Edible') ? decide([['ncsu', true], ['usda', uEat ? uEat === 'Yes' : null]]) : null;
  out.nectar = null; out.bird = null; out.maintenance = null; // (no source gives a level: docs/catalog-sources.md)
  out.fall_color = ncsu['Deciduous Leaf Fall Color'] ? { v: true, src: ['ncsu'], check: 'single', note: ncsu['Deciduous Leaf Fall Color'].join(', ') } : null;

  // clay_ok: NC State's Clay decides; USDA's fine-textured soils checks, and stands in (its Yes or No is stated).
  const uFine = usda['Adapted to Fine Textured Soils']?.[0];
  out.clay_ok = decide([['ncsu', (ncsu['Soil Texture'] ?? []).includes('Clay') ? true : null], ['usda', uFine === 'Yes' ? true : uFine === 'No' ? false : null]]);
  // wet_feet, PROPOSED: NC State's wet drainage, occasional flooding or wet-soil resistance; USDA's anaerobic tolerance (None: no) checks and stands in.
  const nd = new Set(ncsu['Soil Drainage'] ?? []);
  const wet = ['Occasionally Wet', 'Frequent Standing Water', 'Occasional Flooding'].some((d) => nd.has(d)) || (ncsu['Resistance To Challenges'] ?? []).includes('Wet Soil');
  const anaer = usda['Anaerobic Tolerance']?.[0];
  // (USDA's Low is weak evidence either way: unknown until the sample settles it.)
  out.wet_feet = decide([['ncsu', wet ? true : null], ['usda', anaer === 'None' ? false : anaer === 'Medium' || anaer === 'High' ? true : null]], { proposed: true });
  return out;
}
