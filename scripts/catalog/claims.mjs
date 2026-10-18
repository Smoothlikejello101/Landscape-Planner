// What each source says about a plant ("claims"), and how they combine into
// catalog facts, by the tiers in docs/catalog-sources.md:
//   safety (toxicity, invasiveness, native status): authorities only;
//   survival (zones, sun, water, soil, size, deer): an authority decides;
//     without one, a breeder (for its own cultivars), then retail nurseries
//     agreeing with each other, at lower confidence;
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
export function waterNeed(f) {
  const d = new Set(f['Soil Drainage'] ?? []), r = new Set(f['Resistance To Challenges'] ?? []);
  if (!d.size) return null;
  if (d.has('Frequent Standing Water')) return 'High';
  if (d.has('Occasionally Wet') && !d.has('Good Drainage')) return 'High';
  if (d.has('Very Dry')) return 'Low';
  if (r.has('Drought') && d.has('Occasionally Dry') && !d.has('Moist')) return 'Low';
  return 'Moderate';
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

/** NC State Plant Toolbox fields → claims (an authority). */
export function ncsuClaims(f) {
  const c = [], add = (fact, v) => { if (v != null && !(Array.isArray(v) && !v.length)) c.push({ fact, v, src: 'ncsu', kind: 'authority' }); };
  const forms = ncsuForms(f['Plant Type']);
  if (forms.length === 1) {
    let form = forms[0];
    if (form === 'Tree') {
      const df = f['Design Feature'] ?? [];
      const under = df.includes('Understory Tree'), shade = df.includes('Shade Tree');
      form = under && !shade ? 'Tree (understory)' : shade && !under ? 'Tree (canopy)' : null;
    }
    add('form', form);
  }
  const h = f.Height ? feetRange(f.Height[0]) : null, w = f.Width ? feetRange(f.Width[0]) : null;
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
 * has none). Facts with no claims are null.
 */
export function combine(claims, { cultivar = false } = {}) {
  const out = {};
  const facts = new Set([...Object.keys(TIER), ...claims.map((c) => c.fact)]);
  for (const fact of facts) {
    const all = claims.filter((c) => c.fact === fact);
    const flagClaims = all.filter((c) => c.flag);
    let usable = all.filter((c) => !c.flag && c.v != null);
    if (TIER[fact] === 'safety') usable = usable.filter((c) => c.kind === 'authority');
    if (TIER[fact] === 'survival') usable = usable.filter((c) => c.kind !== 'blog'); // (authority, breeder, nursery: no blogs)
    if (cultivar && CULTIVAR_OWN.has(fact)) usable = usable.filter((c) => c.cultivarPage || c.kind === 'breeder');
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
  return out;
}
const fmtV = (v) => (Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? ('min' in v ? `${v.min}–${v.max}` : 'start' in v ? `months ${v.start}–${v.end}` : JSON.stringify(v)) : String(v));
