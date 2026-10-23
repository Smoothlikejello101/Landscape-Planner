// What each source says about a plant ("claims"), and how they combine into
// catalog facts, by the tiers in docs/catalog-sources.md:
//   safety (toxicity, invasiveness, native status): authorities only;
//   survival (zones, sun, water, soil, size, deer): authorities, a breeder
//     (for its own cultivars) and retail nurseries; for zones, sun, size,
//     water and deer the side more of them back leads, an authority's on an
//     even split ("Where sources disagree"); soil: an authority decides,
//     without one nurseries agreeing with each other, at lower confidence;
//   description (form, bloom, colors, wildlife, edibility): any source.
// A claim: { fact, v, src, kind, at?, group? }. kind: 'authority' (extension
// services, botanical gardens, state floras), 'breeder', 'nursery', 'blog'.
// `group` marks copies: claims sharing a group (the same text) count once,
// and so do claims from one site (src). USDA's garden
// figures are flags only: shown for review, never deciding or checking.
import { feetRange } from './extract.mjs';
import { mnLight, ncsuForms, ncsuSun } from './map.mjs';

export const TIER = {
  tox_people: 'safety', tox_pets: 'safety', invasive: 'safety', native_ar: 'safety', native_us: 'safety',
  zone_min: 'survival', zone_max: 'survival', sun_most: 'survival', sun_least: 'survival', water: 'survival',
  height: 'survival', width: 'survival', clay_ok: 'survival', wet_feet: 'survival', deer: 'survival',
  form: 'description', bloom_season: 'description', bloom_months: 'description', flower_color: 'description',
  fall_color: 'description', host: 'description', host_genus: 'description', edible: 'description',
};
const RANK = { authority: 3, breeder: 2, nursery: 1, blog: 0 };
/** Facts decided by sides (`bySides`), the other side kept beside the value (`alt`; never safety facts). */
export const REPORTABLE = new Set(['height', 'width', 'zone_min', 'zone_max', 'sun_most', 'sun_least', 'water', 'deer']);
/** Facts a cultivar is bred to change: only a page for the cultivar itself speaks to them. */
export const CULTIVAR_OWN = new Set(['height', 'width', 'flower_color', 'form']);

// ---------- Values ----------

/** NC State's "4a, 4b, … 9b" → { zone_min, zone_max } on the half-zone scale (7a = 7, 7b = 7.5). */
export function halfZones(text) {
  const list = String(text).split(/\s*,\s*/).map((z) => /^(\d{1,2})([ab])$/.exec(z.trim())).filter(Boolean)
    .map((m) => Number(m[1]) + (m[2] === 'b' ? 0.5 : 0)).sort((a, b) => a - b);
  return list.length ? { zone_min: list[0], zone_max: list[list.length - 1] } : null;
}
/** A whole-zone range ("zones 5–9", "USDA 5 to 9a") → half-zone bounds: 5 is all of zone 5 (5), 9 is through 9b (9.5). */
export function zoneSpan(lo, hi) {
  const one = (t, top) => {
    const m = /^(\d{1,2})\s*([ab])?$/i.exec(String(t).trim());
    if (!m) return null;
    const n = Number(m[1]);
    if (n < 1 || n > 13) return null;
    return m[2] ? n + (m[2].toLowerCase() === 'b' ? 0.5 : 0) : top ? n + 0.5 : n;
  };
  const a = one(lo, false), b = one(hi, true);
  return a != null && b != null && a <= b ? { zone_min: a, zone_max: b } : null;
}
/** USDA's minimum temperature → the coldest half-zone entirely at or above it (−28 °F → 4.5: 4a reaches −30 °F). */
export const halfZoneOfTemp = (t) => Math.min(13.5, Math.max(1, Math.ceil((t + 60) / 5) / 2 + 1));

/**
 * Water need from NC State's soil fields, which say what a plant tolerates:
 * High only where it grows wet (standing water, or wet without good
 * drainage); Low where it takes real dry (very dry, or drought-tolerant and
 * occasionally dry without needing moist soil); Moderate otherwise. Wetland
 * waits for USDA's wetland list.
 */
/**
 * Water need from NC State's tags (it has no water field; docs/catalog-sources.md).
 * High: standing water, or wet without good drainage. Low: NC State calls it
 * drought tolerant (Drought Tolerant Garden theme, Very Dry drainage, or Drought
 * resistance with Occasionally Dry drainage) and lists no wet conditions; a
 * plant it rates for both wet and dry is adaptable, so Moderate.
 */
export function waterNeed(f) {
  const d = new Set(f['Soil Drainage'] ?? []), r = new Set(f['Resistance To Challenges'] ?? []);
  const theme = new Set(f['Landscape Theme'] ?? []), loc = new Set(f['Landscape Location'] ?? []);
  if (!d.size) return null;
  if (d.has('Frequent Standing Water')) return 'High';
  if (d.has('Occasionally Wet') && !d.has('Good Drainage')) return 'High';
  const wet = ['Occasionally Wet', 'Occasional Flooding'].some((x) => d.has(x)) || r.has('Wet Soil')
    || theme.has('Rain Garden') || theme.has('Water Garden') || loc.has('Pond') || loc.has('Riparian');
  const dry = theme.has('Drought Tolerant Garden') || d.has('Very Dry') || (r.has('Drought') && d.has('Occasionally Dry'));
  return dry && !wet ? 'Low' : 'Moderate';
}

/**
 * Caterpillar hosts named in NC State's wildlife notes: the butterflies and
 * moths it names in sentences about larvae or host plants, as names only (never
 * the sentence). "Members of the genus …" statements count: the plant is in
 * that genus.
 */
export function hostNames(text) { // (with the binomial where the source gives one, so the caller can check it's a caterpillar)
  const names = new Set();
  for (const sentence of String(text ?? '').split(/(?<=[.!?])\s+/)) {
    if (!/larva|caterpillar|host plant|food plant/i.test(sentence)) continue;
    // "Eastern Tiger Swallowtail (Papilio glaucus)"
    for (const m of sentence.matchAll(/((?:[A-Z][\w'’-]+\s){0,3}[A-Z][\w'’-]+)\s+\(([A-Z][a-z]+ [a-z]+)\)/g)) {
      const name = m[1].replace(/^(?:(?:This|The|It|Members|Host|You|Larval|Adult|Like|Such|As|Including|And|Or|Both|Also|Many|Several)\s+)+/, '').trim();
      if (name && !/^(Andrena|Members)\b/.test(name)) names.add(`${name} (${m[2]})`);
    }
    // "host plant for the Pearl Crescent butterfly", "host plant for fritillary butterflies"
    // "Host plant for the Pearl Crescent butterfly", "a host plant for the Baltimore checkerspot butterfly", "supports Fritillary butterfly larvae"
    for (const m of sentence.matchAll(/(?:[Hh]ost plant (?:for|to)|supports) (?:the )?([A-Z][\w'’-]+(?:\s[\w'’-]+){0,3}?)\s(?:butterfl\w*|moths?|skippers?)\b/g)) names.add(m[1].trim());
  }
  return [...names];
}

/**
 * Only names that are butterflies or moths: where a name carries its
 * binomial, its genus must be one the Tallamy dataset lists as Lepidoptera
 * (so "Cedar Waxwing (Bombycilla cedrorum)" in a sentence about larvae is
 * dropped).
 */
export function onlyCaterpillars(names, lepGenera) {
  // Without the list, a name with a binomial can't be checked, so it's left out. ("Host plant for the X
  // butterfly" names, with no binomial, say what they are.)
  return names.filter((n) => { const g = /\(([A-Z][a-z]+) [a-z]+\)$/.exec(n)?.[1]; return !g || !!lepGenera?.has(g); });
}
/** The same caterpillar however a source writes it: by binomial where given, else by name. */
const hostKey = (n) => (/\(([A-Z][a-z]+ [a-z]+)\)$/.exec(n)?.[1] ?? String(n)).toLowerCase().replace(/^the\s+/, '').trim();

// ---------- Claims from each source ----------

/** Forms that are herbaceous perennials of a kind of their own: with one of these, "Perennial" adds nothing. */
const HERB_FORMS = new Set(['Fern', 'Bulb', 'Grass/Sedge', 'Cactus']); // (not aquatic: a perennial that grows in water, cardinal flower too, is still a perennial)
/** NC State Plant Toolbox fields → claims (an authority). */
export function ncsuClaims(f) {
  const c = [], add = (fact, v) => { if (v != null && !(Array.isArray(v) && !v.length)) c.push({ fact, v, src: 'ncsu', kind: 'authority' }); };
  // Forms, as a list: NC State tags some plants with more than one (redbud: Shrub and Tree). A tree is a
  // tree: how it layers with what grows under it comes from its height, in the app (src/crowding.ts).
  const h = f.Height ? feetRange(f.Height[0]) : null, w = f.Width ? feetRange(f.Width[0]) : null;
  add('form', ncsuForms(f['Plant Type'], f['Life Cycle']));
  add('height', h); add('width', w);
  const z = f['USDA Plant Hardiness Zone'] ? halfZones(f['USDA Plant Hardiness Zone'][0]) : null;
  if (z) { add('zone_min', z.zone_min); add('zone_max', z.zone_max); }
  const sun = ncsuSun(f.Light);
  if (sun) { add('sun_most', sun.most); add('sun_least', sun.least); }
  add('water', waterNeed(f));
  add('bloom_season', (f['Flower Bloom Time'] ?? []).map((s) => s.toLowerCase()));
  add('flower_color', f['Flower Color'] ?? null);
  const sev = f['Poison Severity']?.[0], derm = f['Causes Contact Dermatitis']?.[0] === 'Yes';
  if (sev || derm) add('tox_people', [sev === 'High' || sev === 'Medium' ? 'major' : sev === 'Low' ? 'minor' : null, derm ? 'dermatitis' : null].filter(Boolean));
  if ((f['Resistance To Challenges'] ?? []).includes('Deer')) add('deer', 'Resistant');
  if ((f['Plant Type'] ?? []).includes('Edible')) add('edible', true);
  if (f['Deciduous Leaf Fall Color']) add('fall_color', true);
  if ((f['Soil Texture'] ?? []).includes('Clay')) add('clay_ok', true);
  const nd = new Set(f['Soil Drainage'] ?? []);
  if (['Occasionally Wet', 'Frequent Standing Water', 'Occasional Flooding'].some((d) => nd.has(d)) || (f['Resistance To Challenges'] ?? []).includes('Wet Soil')) add('wet_feet', true);
  const hosts = f['Larval hosts'] ?? [];
  if (hosts.length) add('host', hosts);
  return c;
}
/** Minnesota Wildflowers fields → claims (an authority for wild Minnesota plants; bloom months are Minnesota's). */
export function mnwildClaims(f) {
  const c = [];
  const sun = f?.['Habitat light'] ? mnLight(f['Habitat light'][0]) : null;
  if (sun) { c.push({ fact: 'sun_most', v: sun.most, src: 'mnwild', kind: 'authority' }, { fact: 'sun_least', v: sun.least, src: 'mnwild', kind: 'authority' }); }
  if (f?.['Bloom season']) c.push({ fact: 'bloom_months', v: f['Bloom season'][0], src: 'mnwild', kind: 'authority', at: 'MN' });
  return c;
}
/** Arkansas atlas status → a claim on Arkansas native status. */
export function arkatlasClaims(ar) {
  if (!ar || ar.uncertain) return [];
  const labels = [ar.codes.includes(2) && 'endemic to Arkansas', ar.codes.includes(3) && 'non-native invasive in Arkansas', ar.codes.includes(4) && 'of special conservation concern in Arkansas'].filter(Boolean);
  const infra = ar.infraOnly ? `in Arkansas only as ${ar.rows.map((r) => r.infra).join(', ')}` : '';
  return [{ fact: 'native_ar', v: ar.codes.includes(1) ? 'introduced' : 'native', src: 'arkatlas', kind: 'authority', at: 'AR',
    note: infra && labels.length ? `${infra}, which is ${labels.join(' and ')}` : [...labels, infra].filter(Boolean).join('; ') }];
}
/**
 * Shropshire & Tallamy's caterpillar records for a plant's genus: how many
 * native species use it, how many of those live in Arkansas, and the
 * Arkansas butterflies by name. Genus-level, so it's its own fact, beside
 * the species-level `host`.
 */
export function tallamyClaims(index, botanical) {
  const genus = String(botanical ?? '').trim().split(/\s+/)[0]?.replace(/^×/, '');
  const g = genus && index?.genera?.[genus];
  if (!g) return [];
  return [{ fact: 'host_genus', v: { genus, species: g.species, ar: g.ar, ar_butterflies: g.ar_butterflies }, src: 'tallamy', kind: 'authority' }];
}
/**
 * USDA PLANTS: native status in the lower 48 is a claim (it's the national
 * authority on that); its garden figures are flags only.
 */
export function usdaClaims(u) {
  const c = [];
  const l48 = (u?.['Native status'] ?? []).find((s) => s.startsWith('L48'));
  if (l48) c.push({ fact: 'native_us', v: l48.replace('L48: ', '').toLowerCase(), src: 'usda', kind: 'authority' });
  const flag = (fact, text) => c.push({ fact, flag: text, src: 'usda' });
  // Growth habit and lifespan say what the plant is (not how it grows in a garden): a form where no
  // garden source gives one. (A fern is "Forb/herb" to USDA, so it never overrides a garden source;
// its "Tree" says tree, not which kind, so it supports either kind a garden source names.)
  const habit = u?.['Growth habit'] ?? [], life = u?.Duration ?? [];
  const uf = [];
  // (A vine that is also a shrub to USDA is both: lantana, prairie rose.)
  if (habit.includes('Graminoid')) uf.push('Grass/Sedge');
  else if (habit.includes('Vine')) uf.push('Vine');
  // (A biennial dies after it flowers: closer to an annual in a garden. Some live either way: both.)
  else if (habit.includes('Forb/herb') && habit.length === 1) uf.push(life.includes('Perennial') ? 'Perennial' : null, life.includes('Annual') || life.includes('Biennial') ? 'Annual' : null);
  if (habit.includes('Shrub')) uf.push('Shrub');
  if (habit.includes('Tree')) uf.push('Tree');
  if (uf.filter(Boolean).length) c.push({ fact: 'form', v: uf.filter(Boolean), src: 'usda', kind: 'authority', fallback: true });
  const t = u?.['Temperature, Minimum (°F)']?.[0];
  if (t != null && Number.isFinite(Number(t))) flag('zone_min', { temp: Number(t), text: `USDA: lowest ${t} °F` });
  const shade = u?.['Shade Tolerance']?.[0];
  if (shade) flag('sun_least', { text: `USDA: shade tolerance ${shade.toLowerCase()}` });
  const moist = u?.['Moisture Use']?.[0];
  if (moist) flag('water', { text: `USDA: moisture use ${moist.toLowerCase()}` });
  return c;
}

// ---------- Combining ----------

/** Whether two values for a fact agree. */
export function agrees(fact, a, b) {
  if (fact === 'zone_min' || fact === 'zone_max') return Math.abs(a - b) <= 1; // (within one whole zone, 10 °F)
  if (TIER[fact] === 'safety') return JSON.stringify([a].flat().map(String).sort()) === JSON.stringify([b].flat().map(String).sort()); // (exactly: major is not minor)
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b) && !('min' in a)) return JSON.stringify(a) === JSON.stringify(b);
  if (fact === 'height' || fact === 'width') return a.min <= b.max * 1.25 && b.min <= a.max * 1.25; // (ranges overlap, with a little give)
  if (Array.isArray(a) && Array.isArray(b)) {
    // (Words, not phrasings: "Purple/Lavender" and "Purple" share a color; "early spring" and "spring" a season.)
    const words = (l) => new Set(l.flatMap((x) => String(x).toLowerCase().split(/[\/,]| and /)).map((x) => x.replace(/^(early|mid|late)[ -]?/, '').trim()).filter(Boolean));
    const wb = words(b);
    return [...words(a)].some((x) => wb.has(x));
  }
  return a === b;
}

/**
 * Combine one plant's claims into facts. Each fact: { v, src, check, kind,
 * note?, flags? }. check: 'confirmed' (an authority, and another independent
 * source agrees), 'single' (one authority), 'likely' (no authority; two or
 * more independent lower-tier sources agree), 'reported' (one lower-tier
 * source), 'disputed' (sources of the deciding rank disagree, or a safety fact
 * has none). The garden facts a plant is filtered by (zones, sun, size, water, deer) are decided by sides
 * instead (`bySides`), and forms by `combineForm`. Facts with no claims are null.
 */
export function combine(claims, { cultivar = false, prefer = null } = {}) {
  const out = {};
  const kept = {}; // (each fact's claims as weighed: copies counted once)
  const facts = new Set([...Object.keys(TIER), ...claims.map((c) => c.fact)]);
  for (const fact of facts) {
    const all = claims.filter((c) => c.fact === fact);
    const flagClaims = all.filter((c) => c.flag);
    let usable = all.filter((c) => !c.flag && c.v != null);
    if (TIER[fact] === 'safety') usable = usable.filter((c) => c.kind === 'authority');
    if (TIER[fact] === 'survival') usable = usable.filter((c) => c.kind !== 'blog'); // (authority, breeder, nursery: no blogs)
    // A cultivar's own size and color come only from pages for it. Its form too, except a perennial,
    // grass, fern, bulb, vine or annual stays one whatever the cultivar (a dwarf tree can be a shrub).
    // (From a species page, a cultivar keeps the forms that aren't trees, and is unsettled where that leaves
    // out a tree: a dwarf can be a shrub, a cultivar of a shrub-or-tree either. An authority's or the
    // breeder's page for the cultivar decides, and species pages only back it, trees included.)
    if (cultivar && CULTIVAR_OWN.has(fact)) {
      if (fact === 'form') {
        if (!usable.some(ownPage)) {
          const species = usable.filter((c) => !c.cultivarPage);
          // (Only the source that would decide: NC State's, else USDA's; another's tree is just a note.)
          const decider = [species.filter((c) => c.kind === 'authority' && !c.fallback), species.filter((c) => c.fallback), species].find((l) => l.length) ?? [];
          if (decider.some((c) => [c.v].flat().some((x) => /Tree/.test(x)))) {
            out[fact] = { v: null, src: [...new Set(species.map((c) => c.src))], check: 'disputed', kind: species[0].kind, note: 'its species is listed as a tree; a cultivar may be a tree or a shrub' };
            continue;
          }
        }
      } else usable = usable.filter((c) => c.cultivarPage || c.kind === 'breeder');
    }
    // Copies count once: the same text on two sites, or two pages of one site. The highest kind keeps it
    // (a shop that copies an extension's sheet doesn't stand in for the extension).
    usable = usable.map((c, i) => ({ c, i })).sort((x, y) => (RANK[y.c.kind] ?? 0) - (RANK[x.c.kind] ?? 0) || x.i - y.i).map((x) => x.c);
    const seenGroups = new Set(), seenSites = new Set();
    usable = usable.filter((c) => {
      if (seenSites.has(c.src) || (c.group && seenGroups.has(c.group))) return false;
      seenSites.add(c.src); if (c.group) seenGroups.add(c.group);
      return true;
    });
    // A breeder speaks first only for its own cultivars; on a species it's one more nursery.
    if (!cultivar) usable = usable.map((c) => (c.kind === 'breeder' ? { ...c, kind: 'nursery' } : c));
    kept[fact] = usable;
    if (fact === 'form') { out[fact] = combineForm(usable, prefer); continue; }
    if (fact === 'host') { // (a list: every source's names, together)
      const byKey = new Map();
      for (const n of usable.flatMap((c) => c.v)) { const k = hostKey(n); if (!byKey.has(k) || /\(/.test(n)) byKey.set(k, n); }
      const names = [...byKey.values()];
      const top = Math.max(-1, ...usable.map((c) => RANK[c.kind] ?? 0));
      const kind = Object.keys(RANK).find((k) => RANK[k] === top);
      // Confirmed only where two sources name the same caterpillar.
      const named = (n) => usable.filter((c) => c.v.some((x) => hostKey(x) === hostKey(n))).length;
      const check = names.some((n) => named(n) > 1) ? 'confirmed' : kind === 'authority' ? 'single' : 'reported';
      out[fact] = names.length ? { v: names, src: [...new Set(usable.map((c) => c.src))], check, kind } : null;
      continue;
    }
    if (!usable.length) {
      // Nothing decides, but USDA's figures still go to the review.
      const flags = flagClaims.map((c) => c.flag.text);
      out[fact] = flags.length ? { v: null, src: [], check: null, flags } : null;
      continue;
    }
    if (REPORTABLE.has(fact)) { out[fact] = bySides(fact, usable, flagClaims); continue; }
    const top = Math.max(...usable.map((c) => RANK[c.kind] ?? 0));
    const deciders = usable.filter((c) => (RANK[c.kind] ?? 0) === top);
    // The value most deciders share (the first, on a tie).
    const best = deciders.map((d) => ({ d, n: deciders.filter((o) => agrees(fact, d.v, o.v)).length })).sort((x, y) => y.n - x.n)[0].d;
    const others = usable.filter((c) => c !== best);
    const agreeing = others.filter((c) => agrees(fact, best.v, c.v));
    // (Facts that depend on place, with `at`, differ by region without anyone being wrong: never against each other.)
    const samePlace = (c) => (c.at ?? null) === (best.at ?? null);
    const peersAgainst = deciders.filter((c) => c !== best && samePlace(c) && !agrees(fact, best.v, c.v));
    const lowerAgainst = others.filter((c) => (RANK[c.kind] ?? 0) < top && samePlace(c) && !agrees(fact, best.v, c.v));
    const peersFor = deciders.filter((c) => c !== best && agrees(fact, best.v, c.v));
    let check;
    // Authorities that disagree are a dispute. Below them, the majority is the likely answer.
    if (peersAgainst.length && (best.kind === 'authority' || peersFor.length + 1 <= peersAgainst.length)) check = 'disputed';
    else if (best.kind === 'authority') check = agreeing.length ? 'confirmed' : 'single';
    else check = agreeing.length ? 'likely' : 'reported';
    const r = { v: best.v, src: [best.src, ...agreeing.map((c) => c.src)], check, kind: best.kind };
    if (best.at) r.at = best.at;
    const notes = [best.note, ...peersAgainst.map((c) => `${c.src}: ${fmtV(c.v)}`), ...lowerAgainst.filter((c) => !peersAgainst.includes(c)).map((c) => `${c.src} says ${fmtV(c.v)}`)].filter(Boolean);
    if (notes.length) r.note = notes.join('; ');
    // USDA's figures show only where they differ: for zones, by more than a whole zone.
    const flags = flagClaims.filter((c) => c.flag.temp == null || typeof best.v !== 'number' || Math.abs(halfZoneOfTemp(c.flag.temp) - best.v) > 1).map((c) => c.flag.text);
    if (flags.length) r.flags = flags;
    out[fact] = r;
  }
  for (const pair of PAIRS) pairAlt(out, kept, pair);
  return out;
}

const rankOf = (c) => RANK[c.kind] ?? 0;
const SUN_ORDER = ['Shade', 'Part', 'Full'], WATER_ORDER = ['Low', 'Moderate', 'High', 'Wetland'], DEER_ORDER = ['Candy', 'Occasional', 'Resistant'];
/**
 * How cautious a value is to plan by (higher: more): the narrower range of zones and of sun (the warmer cold
 * limit, the colder warm limit; the less sun it's said to take at most, the more it's said to need at least);
 * the larger plant (for spacing); water nearer Moderate; the lower deer resistance (no promise the deer pass it by).
 */
export function cautionOf(fact, v) {
  const key = {
    zone_min: (x) => x, zone_max: (x) => -x,
    sun_most: (x) => -SUN_ORDER.indexOf(x), sun_least: (x) => SUN_ORDER.indexOf(x),
    height: (x) => x.max * 1000 + x.min, width: (x) => x.max * 1000 + x.min,
    water: (x) => -Math.abs(WATER_ORDER.indexOf(x) - 1), deer: (x) => -DEER_ORDER.indexOf(x),
  }[fact];
  return key ? key(v) : 0;
}
/** Whether side `y` leads side `x`: more sources; then an authority among them; then the more cautious value. */
const leads = (fact, y, x) => y.members.length - x.members.length || Number(y.authority) - Number(x.authority) || cautionOf(fact, y.v) - cautionOf(fact, x.v);
/** The same sources: one side, whichever of its values heads it. */
const sameSources = (x, y) => x.members.length === y.members.length && x.members.every((m) => y.members.includes(m));
/** Last, a fixed order of sources, so that which side is kept never depends on which was read first: NC State, then by name. */
const byName = (x, y) => { const k = (c) => (c.src === 'ncsu' ? '' : String(c.src)); return k(x) < k(y) ? -1 : k(x) > k(y) ? 1 : 0; };
/**
 * The sides of a fact the sources take, the leading one first: each a value and the sources that agree with it
 * (copies already counted once). A side's value is its highest kind's, and every source on it agrees with that
 * value. Agreement isn't transitive (zones 9b and 11b both agree with 10b, not with each other), so each value
 * that could head a side is tried and the one that leads (`leads`) is kept; then the same among the sources left.
 * Which claim comes first never changes which sources lead. (Two values of the highest kind that agree with the
 * same sources are one side, and it shows the first: NC State's, read first, as before.)
 */
function sidesOf(fact, usable) {
  const sides = [];
  let rest = [...usable];
  while (rest.length) {
    const tries = rest.map((head) => ({ v: head.v, head, members: rest.filter((o) => agrees(fact, head.v, o.v)) }))
      .filter((t) => t.members.every((m) => rankOf(m) <= rankOf(t.head)))
      .map((t) => ({ ...t, authority: t.members.some((m) => m.kind === 'authority') }));
    // (One side headed two ways, its sources being the same: NC State's value, else the first read. Two sides as
    // strong: by name, so the next side, the one kept beside it, never depends on which was read first.)
    const best = tries.reduce((x, y) => {
      if (sameSources(x, y)) return y.head.src === 'ncsu' && x.head.src !== 'ncsu' ? y : x;
      const d = leads(fact, y, x);
      return d > 0 || (!d && byName(y.head, x.head) < 0) ? y : x;
    });
    sides.push(best);
    rest = rest.filter((o) => !best.members.includes(o));
  }
  return sides;
}
const checkOf = (side) => (side.authority ? (side.members.length > 1 ? 'confirmed' : 'single') : side.members.length > 1 ? 'likely' : 'reported');
/**
 * A garden fact where sources may disagree (zones, sun, size, water, deer): the side more independent sources
 * back leads; where the largest sides are even, one with an authority leads (an authority outranks a lower kind,
 * but not two that agree against it); where they're still even, the cautious value (`cautionOf`), and where
 * that's even too (water: Low against High, as far from Moderate), nothing is taken: it's left for the review.
 * Another side is kept beside it (`alt`), shown and filterable, labelled with who says it: the largest, or, where
 * the value shown has no authority behind it and an authority's was outvoted, the authority's (the app never
 * hides that a reference says otherwise). Agreed 2026-10-22 (docs/catalog-sources.md, "Where sources disagree").
 */
function bySides(fact, usable, flagClaims) {
  const [leader, ...others] = sidesOf(fact, usable);
  // USDA's figures show only where they differ: for zones, by more than a whole zone.
  const flagsBy = (v) => flagClaims.filter((c) => c.flag.temp == null || typeof v !== 'number' || Math.abs(halfZoneOfTemp(c.flag.temp) - v) > 1).map((c) => c.flag.text);
  const says = (s) => s.members.map((c) => `${c.src} says ${fmtV(c.v)}`);
  if (others.some((s) => !leads(fact, s, leader))) {
    const flags = flagsBy(null);
    return { v: null, src: [...new Set([leader, ...others].flatMap((s) => s.members.map((c) => c.src)))], check: 'disputed', kind: leader.head.kind,
      note: [...[leader, ...others].flatMap(says), 'as many sources, as cautious, either way'].join('; '), ...(flags.length ? { flags } : {}) };
  }
  const kind = leader.authority ? 'authority' : leader.head.kind;
  const r = { v: leader.v, src: [leader.head.src, ...leader.members.filter((c) => c !== leader.head).map((c) => c.src)], check: checkOf(leader), kind };
  const notes = [leader.head.note, ...others.flatMap(says)].filter(Boolean);
  if (notes.length) r.note = notes.join('; ');
  const next = (!leader.authority && others.find((s) => s.authority)) || others[0];
  if (next) r.alt = { v: next.v, src: next.members.map((c) => c.src), check: checkOf(next) };
  const flags = flagsBy(r.v);
  if (flags.length) r.flags = flags;
  return r;
}
/** Facts that make one range together: a nursery's report for one is read with its report for the other. */
const PAIRS = [['zone_min', 'zone_max'], ['sun_most', 'sun_least']];
/** Whether a pair's halves make a range: the cold limit no warmer than the warm one; the most sun no less than the least. */
const inOrder = (a, va, vb) => (a === 'zone_min' ? va <= vb : SUN_ORDER.indexOf(va) >= SUN_ORDER.indexOf(vb));
/**
 * A pair's `alt` comes from sources that give both halves: the pair most of them share where it differs from
 * the one shown (either half), on each half where it differs; an authority's group first on a tie, or where the
 * pair shown has no authority behind it. Built from each half alone,
 * one source's cold limit could be shown with another's warm one, as a range nobody gave. Halves that, decided
 * apart, don't make a range (the cold limit warmer than the warm one) are both left for the review.
 */
function pairAlt(out, kept, [a, b]) {
  const ra = out[a], rb = out[b];
  if (ra) delete ra.alt;
  if (rb) delete rb.alt;
  if (!ra || !rb || ra.v == null || rb.v == null) return;
  if (!inOrder(a, ra.v, rb.v)) {
    const word = { zone_min: 'coldest zone', zone_max: 'warmest zone', sun_most: 'most sun', sun_least: 'least sun' };
    const note = `each decided on its own, ${word[a]} ${fmtV(ra.v)} and ${word[b]} ${fmtV(rb.v)} make no range`;
    out[a] = { v: null, src: ra.src, check: 'disputed', kind: ra.kind, note: [ra.note, note].filter(Boolean).join('; '), ...(ra.flags ? { flags: ra.flags } : {}) };
    out[b] = { v: null, src: rb.src, check: 'disputed', kind: rb.kind, note: [rb.note, note].filter(Boolean).join('; '), ...(rb.flags ? { flags: rb.flags } : {}) };
    return;
  }
  const bOf = new Map((kept[b] ?? []).map((c) => [c.src, c]));
  const both = (kept[a] ?? []).filter((c) => bOf.has(c.src)).map((c) => ({ src: c.src, kind: c.kind, va: c.v, vb: bOf.get(c.src).v }));
  const differ = both.filter((n) => !agrees(a, ra.v, n.va) || !agrees(b, rb.v, n.vb));
  const same = (x, y) => agrees(a, x.va, y.va) && agrees(b, x.vb, y.vb);
  // Groups as sides are (`sidesOf`): each range its highest kind gives, with every source agreeing with it. The
  // largest is kept; where the range shown has no authority behind it and an authority's differs, the authority's.
  const shownByAuthority = ra.kind === 'authority' && rb.kind === 'authority';
  const groups = differ.map((head) => ({ head, members: differ.filter((o) => same(head, o)) }))
    .filter((g) => g.members.every((m) => rankOf(m) <= rankOf(g.head)))
    .map((g) => ({ ...g, authority: g.members.some((m) => m.kind === 'authority') }));
  const score = (g) => [!shownByAuthority && g.authority ? 1 : 0, g.members.length, Number(g.authority), cautionOf(a, g.head.va) + cautionOf(b, g.head.vb)];
  // (One group headed two ways keeps the first read; two as strong go by name, never by which was read first.)
  const better = (y, x) => {
    if (sameSources(x, y)) return y.head.src === 'ncsu' && x.head.src !== 'ncsu';
    const [p, q] = [score(y), score(x)];
    const i = p.findIndex((v, k) => v !== q[k]);
    return i >= 0 ? p[i] > q[i] : byName(y.head, x.head) < 0;
  };
  const best = groups.reduce((x, y) => (x && !better(y, x) ? x : y), null);
  if (!best) return;
  const src = [best.head.src, ...best.members.filter((m) => m !== best.head).map((m) => m.src)];
  const check = checkOf(best);
  // (On a half where it gives the value shown, no alt: the other half carries the range.)
  if (JSON.stringify(best.head.va) !== JSON.stringify(ra.v)) ra.alt = { v: best.head.va, src, check };
  if (JSON.stringify(best.head.vb) !== JSON.stringify(rb.v)) rb.alt = { v: best.head.vb, src, check };
}
/** A page for the cultivar itself that may decide its form: an authority's, or its breeder's (a nursery's is one more nursery). */
const ownPage = (c) => (c.cultivarPage && c.kind === 'authority') || c.kind === 'breeder';
/**
 * A plant's forms, as a list (at most three, the catalog's current form first).
 *
 * One source decides: an authority's or the breeder's page for the cultivar itself, else an authority
 * (NC State), else USDA's habit (a fallback), else the nursery other sources back most. Its forms are the
 * answer; the catalog's form only orders them, never supplies one. Each form another independent source
 * also lists is backed: confirmed when every form is (likely, without an authority), else single
 * (reported). Another source listing a form the decider doesn't is noted; another authority (USDA's habit
 * included) whose forms share none with the decider's adds its own (both kept, the catalog's first). USDA
 * deciding alone with "Perennial" where the catalog names a fern, bulb, grass, cactus or aquatic settles nothing.
 * "Perennial" beside a fern, bulb, grass or cactus is its life cycle, not a second form, and
 * USDA's "Perennial" (any herb that lives for years) backs only a plain perennial.
 */
function combineForm(usable, prefer) {
  prefer = [prefer].flat()[0] ?? null;
  const herb = (list) => (list.some((x) => HERB_FORMS.has(x)) ? list.filter((x) => x !== 'Perennial') : list);
  const claims = usable.map((c) => ({ ...c, forms: herb([...new Set([c.v].flat().filter((x) => typeof x === 'string'))]) })).filter((c) => c.forms.length);
  if (!claims.length) return null;
  const levels = [claims.filter((c) => ownPage(c) && !c.fallback), claims.filter((c) => c.kind === 'authority' && !c.fallback), claims.filter((c) => c.fallback), claims.filter((c) => !c.fallback)];
  const level = levels.find((l) => l.length);
  const lists = (c, f) => c.forms.includes(f);
  const backersOf = (d, f) => claims.filter((c) => c !== d && lists(c, f)).map((c) => c.src);
  const support = (d) => d.forms.reduce((n, f) => n + backersOf(d, f).length, 0);
  const deciding = level.reduce((best, c) => (support(c) > support(best) ? c : best), level[0]);
  const authority = deciding.kind === 'authority';
  const others = claims.filter((c) => c !== deciding);
  const own = deciding.forms;
  // USDA deciding with only "Perennial" (any herb that lives for years), where the catalog names a kind of
  // herb: it settles nothing (a fern or bulb is a forb to USDA too).
  if (deciding.fallback && own.every((f) => f === 'Perennial' || f === 'Annual') && own.includes('Perennial') && (HERB_FORMS.has(prefer) || prefer === 'Aquatic/Emergent')) return null;
  // Another authority (USDA's habit included) with none of the same forms: both are kept, a list of the two
  // (at most three, the catalog's current form first), since either may be how the plant grows (autumn sage is a
  // perennial to NC State and a shrub to USDA). USDA's "Perennial" isn't against a fern, bulb, grass, cactus or
  // aquatic, which are perennial herbs too. (Agreed 2026-10-22: docs/catalog-sources.md, "Where sources disagree".)
  const herbsOnly = (c) => c.fallback && c.forms.every((f) => f === 'Perennial') && own.some((o) => HERB_FORMS.has(o) || o === 'Aquatic/Emergent');
  const rival = others.find((c) => c.kind === 'authority' && !herbsOnly(c) && !c.forms.some((f) => own.some((o) => lists({ forms: [f] }, o) || f === o)));
  if (rival) {
    // (A plain perennial beside a grass, fern or bulb is that herb: a rush NC State calls a perennial and USDA a grass.)
    const all = herb([...new Set([...own, ...rival.forms])]).sort((x, y) => Number(y === prefer) - Number(x === prefer));
    // At most three, at least one from each where the herb rule leaves one: the first three, else the first two and
    // the other side's first.
    let order = all.slice(0, 3);
    for (const side of [own, rival.forms]) {
      const first = all.find((f) => side.includes(f));
      if (first && !order.some((f) => side.includes(f))) order = [...order.slice(0, 2), first];
    }
    // (A source whose forms the herb rule folded into another's still backs it: NC State's perennial rush.)
    const shows = (c) => c.forms.some((f) => order.includes(f)) || herb([...c.forms, ...order]).length === order.length;
    const src = [...new Set([deciding, rival].filter(shows).map((c) => c.src).concat(order.flatMap((f) => backersOf(deciding, f))))];
    const kept = own.some((f) => order.includes(f)) && rival.forms.some((f) => order.includes(f)) ? ': both kept' : '';
    const cut = all.length > order.length ? ` (${all.filter((f) => !order.includes(f)).join(', ')} left out: three at most)` : '';
    return { v: order, src, check: 'single', kind: deciding.kind, note: `${deciding.src} lists ${own.join(', ')}; ${rival.src} lists ${rival.forms.join(', ')}${kept}${cut}` };
  }
  // USDA's "Perennial" says only that an herb lives for years: it backs a plain perennial and nothing else.
  const backers = (f) => others.filter((c) => lists(c.fallback && f !== 'Perennial' ? { forms: c.forms.filter((x) => x !== 'Perennial') } : c, f)).map((c) => c.src);
  const backed = own.filter((f) => backers(f).length);
  const notes = [];
  if (backed.length && backed.length < own.length) notes.push(`${own.filter((f) => !backed.includes(f)).join(', ')} from ${deciding.src} alone`);
  for (const c of others) {
    const extra = c.forms.filter((f) => !own.includes(f) && !(c.fallback && f === 'Perennial' && own.some((o) => HERB_FORMS.has(o))));
    if (extra.length) notes.push(`${c.src} lists ${extra.join(', ')}`);
  }
  const order = [...own].sort((x, y) => Number(y === prefer) - Number(x === prefer)).slice(0, 3);
  const all = backed.length === own.length;
  return { v: order, src: [...new Set([deciding.src, ...own.flatMap(backers)])], check: authority ? (all ? 'confirmed' : 'single') : all ? 'likely' : 'reported', kind: deciding.kind, ...(notes.length ? { note: notes.join('; ') } : {}) };
}
const fmtV = (v) => (Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? ('min' in v ? `${v.min}–${v.max}` : 'start' in v ? `months ${v.start}–${v.end}` : JSON.stringify(v)) : String(v));
