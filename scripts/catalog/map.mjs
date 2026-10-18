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

/** Minnesota Wildflowers' habitat ("part shade, sun; moist, …") → { most, least } sun. */
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
/** USDA growth habits → forms in the same terms. */
export function usdaForms(habits, durations) {
  const annual = (durations ?? []).includes('Annual') && !(durations ?? []).includes('Perennial');
  const map = { Tree: 'Tree', Shrub: 'Shrub', Subshrub: 'Shrub', Vine: 'Vine', Graminoid: 'Grass/Sedge', 'Forb/herb': annual ? 'Annual' : 'Perennial' };
  return [...new Set((habits ?? []).map((h) => map[h]).filter(Boolean))];
}
/** form, by the doc's rule; a tree's kind only from NC State's Design Feature. */
export function decideForm(ncsu, usda) {
  const n = ncsuForms(ncsu['Plant Type']);
  const u = usdaForms(usda?.['Growth habit'], usda?.Duration);
  let form = null, src = [], check = 'single', note = '';
  // (USDA has no habit for ferns or bulbs: its Forb/herb neither confirms nor disputes them.)
  const uCounts = u.length && !(n.length === 1 && (n[0] === 'Fern' || n[0] === 'Bulb') && u.every((f) => f === 'Perennial'));
  if (n.length === 1) { form = n[0]; src = ['ncsu']; if (uCounts) { check = u.includes(form) ? 'agree' : 'disputed'; src.push('usda'); } }
  else if (n.length > 1) {
    const one = u.filter((f) => n.includes(f));
    if (u.length === 1 && one.length === 1) { form = one[0]; src = ['usda', 'ncsu']; check = 'agree'; }
    else { check = 'disputed'; note = `NC State lists ${n.join(', ')}${u.length ? `; USDA ${u.join(', ')}` : ''}`; }
  } else if (u.length === 1) { form = u[0]; src = ['usda']; }
  if (form === 'Tree') {
    const df = ncsu['Design Feature'] ?? [];
    const under = df.includes('Understory Tree'), shade = df.includes('Shade Tree');
    form = under && !shade ? 'Tree (understory)' : shade && !under ? 'Tree (canopy)' : null;
    if (!form) note = 'a tree, but NC State doesn\'t say understory or shade tree';
  }
  return { v: form, src, check: form ? check : (note ? 'disputed' : 'single'), note };
}

// ---------- Water (PROPOSED: the doc leaves it to the sample) ----------

/** PROPOSED: NC State drainage and drought tolerance → Low / Moderate / High / Wetland. */
export function ncsuWater(f) {
  const d = new Set(f['Soil Drainage'] ?? []), r = new Set(f['Resistance To Challenges'] ?? []);
  if (!d.size) return null;
  if (d.has('Frequent Standing Water')) return 'Wetland';
  if (d.has('Occasionally Wet') && !d.has('Occasionally Dry')) return 'High';
  if (d.has('Occasionally Dry') && r.has('Drought')) return 'Low';
  return 'Moderate';
}
/** PROPOSED: USDA moisture use → the same scale. */
export function usdaWater(u) {
  const m = (u?.['Moisture Use'] ?? [])[0];
  return m === 'Low' ? 'Low' : m === 'Medium' ? 'Moderate' : m === 'High' ? 'High' : null;
}

// ---------- The rest ----------

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
  const sun = ncsuSun(ncsu.Light);
  const uLeast = usdaLeastSun(usda['Shade Tolerance']?.[0]);
  out.sun_most = sun ? { v: sun.most, src: ['ncsu'], check: 'single' } : null;
  const mnSun = mnwild?.Habitat ? mnLight(mnwild.Habitat[0]) : null;
  // (The checks: USDA's shade tolerance, and Minnesota Wildflowers' habitat where it has the plant.)
  const checks = [['usda', uLeast], ['mnwild', mnSun?.least]].filter(([, v]) => v);
  // (src names the sources that agree; the note gives every check's own answer.)
  const decideLeast = (v, by, others) => {
    const agreeing = others.filter(([, x]) => x === v).map(([s2]) => s2);
    return { v, src: [by, ...agreeing], check: !others.length ? 'single' : agreeing.length ? 'agree' : 'disputed', note: others.map(([s2, x]) => `${s2}: ${x}`).join('; ') };
  };
  out.sun_least = sun ? decideLeast(sun.least, 'ncsu', checks)
    : mnSun ? decideLeast(mnSun.least, 'mnwild', checks.filter(([s2]) => s2 !== 'mnwild'))
    : uLeast ? { v: uLeast, src: ['usda'], check: 'single' } : null;
  const nw = ncsuWater(ncsu), uw = usdaWater(usda);
  out.water = nw ? { v: nw, src: uw ? ['ncsu', 'usda'] : ['ncsu'], check: uw ? (uw === nw ? 'agree' : 'disputed') : 'single', proposed: true }
    : uw ? { v: uw, src: ['usda'], check: 'single', proposed: true } : null;
  const seasons = (ncsu['Flower Bloom Time'] ?? []).map((s) => s.toLowerCase());
  out.bloom_season = seasons.length ? { v: seasons, src: ['ncsu'], check: 'single', note: usda['Bloom Period'] ? `USDA: ${usda['Bloom Period'][0]}` : '' } : usda['Bloom Period'] ? { v: [usda['Bloom Period'][0].toLowerCase()], src: ['usda'], check: 'single' } : null;
  out.bloom_months_mn = mnwild?.['Bloom season'] ? { v: mnwild['Bloom season'][0], src: ['mnwild'], at: 'MN' } : null;
  out.flower_color = ncsu['Flower Color'] ? { v: ncsu['Flower Color'], src: ['ncsu'], check: 'single' } : null;
  if (arkatlas) out.native_ar = { v: arkatlas.codes.includes(1) ? 'introduced' : 'native', src: ['arkatlas'], check: 'single', at: 'AR', note: arkatlas.codes.includes(3) ? 'non-native invasive in Arkansas' : arkatlas.codes.includes(4) ? 'of special conservation concern in Arkansas' : '' };
  const l48 = (usda['Native status'] ?? []).find((s) => s.startsWith('L48'));
  if (l48) out.native_us = { v: l48.replace('L48: ', '').toLowerCase(), src: ['usda'], check: 'single' };
  const sev = ncsu['Poison Severity']?.[0];
  const derm = ncsu['Causes Contact Dermatitis']?.[0] === 'Yes';
  out.tox_people = sev || derm ? { v: [sev === 'High' || sev === 'Medium' ? 'major' : sev === 'Low' ? 'minor' : null, derm ? 'dermatitis' : null].filter(Boolean), src: ['ncsu'], check: 'single' } : null;
  out.tox_pets = null; // (no usable source: docs/catalog-sources.md)
  out.deer = (ncsu['Resistance To Challenges'] ?? []).includes('Deer') ? { v: 'Resistant', src: ['ncsu'], check: 'single' } : null;
  out.host = ncsu['Larval host for'] ? { v: ncsu['Larval host for'][0], src: ['ncsu'], check: 'single' } : null;
  out.edible = (ncsu['Plant Type'] ?? []).includes('Edible') ? { v: true, src: ['ncsu'], check: 'single' } : null;
  out.fall_color = ncsu['Deciduous Leaf Fall Color'] ? { v: true, src: ['ncsu'], check: 'single', note: ncsu['Deciduous Leaf Fall Color'].join(', ') } : null;
  const clay = (ncsu['Soil Texture'] ?? []).includes('Clay');
  const uFine = usda['Adapted to Fine Textured Soils']?.[0];
  out.clay_ok = clay ? { v: true, src: uFine ? ['ncsu', 'usda'] : ['ncsu'], check: uFine ? (uFine === 'Yes' ? 'agree' : 'disputed') : 'single' } : null;
  const wet = ['Occasionally Wet', 'Frequent Standing Water'].some((d) => (ncsu['Soil Drainage'] ?? []).includes(d));
  out.wet_feet = wet ? { v: true, src: ['ncsu'], check: 'single' } : null;
  return out;
}
