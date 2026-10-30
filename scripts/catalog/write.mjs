// Write the audit's values into the catalog (public/plants.json), each with its sources and how sure it
// is (docs/catalog-format.md), from the combined claims sample.mjs produces:
//   npm run catalog:write -- <combined.json> [--date YYYY-MM-DD] [--review review.json]   (write-cli.ts)
// Only facts the audit settled are written; a fact it couldn't settle (unknown, unsettled, disputed)
// keeps the catalog's current value, still marked unverified, and a disputed one goes on the review list,
// as does a value that would make the record implausible (the app's catalogWarnings: 1 in tall, zones
// backwards).

import { ATTRACTS, BARK, BARK_COLORS, bloomSeasons, CLIMBING, flowerColors, FORM_WORDS, HABIT_FORMS, ncsuNoPoison, PART_COLORS, PETS, SEASONS, TEXTURES, TOLERATES } from './claims.mjs';
import { PROSE_HABITS } from './prose.mjs';

/** The checks the app takes (src/catalog.ts): disputed facts aren't written. */
const SETTLED = new Set(['confirmed', 'single', 'likely', 'reported']);
/** A size range, its `med` the typical size: from the sources that agree on it (claims.mjs typicalOf), else its middle. */
const range = (r, _enums, f) => (r && typeof r.min === 'number' && typeof r.max === 'number' && r.min > 0 && r.min <= r.max
  ? { min: r.min, max: r.max, med: typeof f?.typical === 'number' && f.typical >= r.min && f.typical <= r.max ? f.typical : Math.round(((r.min + r.max) / 2) * 100) / 100 } : undefined);
const ZONE = (z) => (typeof z === 'number' && z >= 1 && z <= 13.5 && Number.isInteger(z * 2) ? z : undefined);
const SUN = (v) => (['Full', 'Part', 'Shade'].includes(v) ? v : undefined);
const yes = (v) => (v === true ? true : undefined); // (sources say so only when it's so: no "false" from silence)
/** Poisonous to people, as NC State says it (claims.mjs ncsuPoison): { severity?, parts?, skin? }. */
const SEVERITY = ['low', 'medium', 'high'];
const poisonOf = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out = {};
  if (v.severity != null) { if (!SEVERITY.includes(v.severity)) return undefined; out.severity = v.severity; }
  if (v.parts != null) { if (!Array.isArray(v.parts) || !v.parts.length || !v.parts.every((x) => typeof x === 'string' && x)) return undefined; out.parts = v.parts; }
  if (v.skin === true) out.skin = true;
  return out;
};
// The words the catalog takes for the leaf facts (the same lists as src/catalog.ts, which checks them).
const LEAF_COLORS = ['green', 'silver', 'gold', 'blue', 'purple', 'red', 'copper', 'white', 'variegated', 'orange', 'pink', 'cream', 'black'];
const FALL_COLORS = ['gold', 'red', 'orange', 'purple', 'copper', 'cream', 'silver', 'pink'];
const FOLIAGE = ['evergreen', 'semi-evergreen', 'deciduous'];
const GROWTH_RATES = ['slow', 'medium', 'fast'];
const LEVELS = ['low', 'medium', 'high'];
/** A list of words from `words`, each once, in the order given (undefined if empty or any isn't one). */
const listOf = (words) => (v) => (Array.isArray(v) && v.length && v.every((x) => words.includes(x)) ? [...new Set(v)] : undefined);
const oneOf = (words) => (v) => (words.includes(v) ? v : undefined);
/** { part: [words] } with each part's words from `parts` (undefined if empty, or any part or word isn't one). */
const formWords = (parts) => (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || !Object.keys(v).length) return undefined;
  const out = {};
  for (const [k, l] of Object.entries(v)) { const ok = parts[k] && listOf(parts[k])(l); if (!ok) return undefined; out[k] = ok; }
  return out;
};
/**
 * Caterpillars a source names the plant a larval host for: names, never a sentence ("Monarch (Danaus plexippus)",
 * "Spring Azure"), each once; a bare name that another, with its binomial, already gives is the same caterpillar.
 */
const hostsOf = (v) => {
  const names = [v].flat().filter((x) => typeof x === 'string' && x.trim().length >= 3 && x.length <= 80 && !/[.;:!?]/.test(x)).map((x) => x.trim());
  const withBinomial = new Set(names.filter((x) => /\(/.test(x)).map((x) => x.replace(/\s*\(.*$/, '').toLowerCase()));
  const out = [...new Set(names.filter((x) => /\(/.test(x) || !withBinomial.has(x.toLowerCase())))];
  return out.length ? out : undefined;
};
/** Shropshire & Tallamy's count for the plant's genus (claims.mjs tallamyClaims): native caterpillar species recorded on it. */
const hostGenusOf = (v) => (v && typeof v.genus === 'string' && /^[A-Z][a-z]+$/.test(v.genus) && Number.isInteger(v.species) && v.species > 0 ? { genus: v.genus, species: v.species } : undefined);
/**
 * How each audited fact goes into the catalog: its key there and its value (undefined: not writable). Forms
 * are a list of up to three (one: plain); native status and toxicity to animals wait on format changes
 * (docs/catalog-sources.md, "Waiting on format changes"). Bloom seasons and flower colors are their sources' words
 * in the catalog's (claims.mjs bloomSeasons, flowerColors); a bloom's months stay the earlier list's (`bloom`).
 */
const FACTS = {
  form: ['form', (v, enums) => { const l = [v].flat().filter((f) => enums.form?.includes(f)); return l.length ? (l.length === 1 ? l[0] : l.slice(0, 3)) : undefined; }],
  height: ['height', range],
  width: ['width', range],
  // How far apart to plant it (a nursery's or an extension's spec line: web.mjs, Oct 29), for a groundcover's circle.
  spacing: ['spacing', range],
  zone_min: ['zone_min', ZONE],
  zone_max: ['zone_max', ZONE],
  sun_most: ['sun_most', SUN],
  sun_least: ['sun_least', SUN],
  water: ['water', (v, enums) => (enums.water?.includes(v) ? v : undefined)],
  deer: ['deer', (v, enums) => (enums.deer?.includes(v) ? v : undefined)],
  // How it spreads, read from NC State's description (prose.mjs): by seed, and underground or by runners (a habit
  // src/spread.ts knows).
  self_seed: ['self_seed', (v, enums) => (enums.self_seed?.includes(v) ? v : undefined)],
  habit: ['habit', oneOf(PROSE_HABITS)],
  clay_ok: ['clay_ok', yes],
  wet_feet: ['wet_feet', yes],
  edible: ['edible', yes],
  // (Yes, or no where NC State calls its fall color "Insignificant": a source saying so, not silence.)
  fall_color: ['fall_color', (v) => (typeof v === 'boolean' ? v : undefined)],
  fall_colors: ['fall_colors', listOf(FALL_COLORS)],
  leaf_color: ['leaf_color', listOf(LEAF_COLORS)],
  foliage: ['foliage', oneOf(FOLIAGE)],
  needles: ['needles', yes],
  growth_rate: ['growth_rate', oneOf(GROWTH_RATES)],
  bloom_season: ['bloom_season', (v) => { const l = bloomSeasons([v].flat()); return l.length ? l : undefined; }],
  // (Every color the source gives, or none: "Violet, Red" isn't "red", nor "Pink, Magenta" "pink".)
  flower_color: ['flower_color', (v) => { const w = [v].flat(); return w.length && w.every((x) => flowerColors([x]).length) ? flowerColors(w) : undefined; }],
  low_branched: ['low_branched', yes],
  // Caterpillar hosts: the ones its sources name (`hosts`: the earlier list's `host` sentence stays as it was), and
  // how many native caterpillar species its genus is recorded feeding (each state's count is in its state file).
  host: ['hosts', hostsOf],
  host_genus: ['host_genus', hostGenusOf],
  poison: ['poison', poisonOf],
  // NC State's lists, as it gives them (claims.mjs ATTRACTS, TOLERATES, PETS): who it attracts, what it tolerates, the
  // animals it's a problem for (a warning: never "safe" from silence); its upkeep level; thorns; winter interest.
  attracts: ['attracts', listOf(ATTRACTS)],
  tolerates: ['tolerates', listOf(TOLERATES)],
  tox_pets: ['problem_for', listOf(PETS)],
  maintenance_level: ['maintenance_level', oneOf(LEVELS)],
  thorns: ['thorns', yes],
  winter_interest: ['winter_interest', yes],
  // What shows in winter, as NC State lists it (claims.mjs BARK, BARK_COLORS, PART_COLORS, SEASONS).
  bark: ['bark', listOf(BARK)],
  bark_color: ['bark_color', listOf(BARK_COLORS)],
  stem_color: ['stem_color', listOf(PART_COLORS)],
  fruit_season: ['fruit_season', listOf(SEASONS)],
  fruit_color: ['fruit_color', listOf(PART_COLORS)],
  // What its flowers, its leaves and the plant look like, as NC State's fields give them (claims.mjs FORM_WORDS).
  flower_form: ['flower_form', formWords(FORM_WORDS.flower_form)],
  leaf_form: ['leaf_form', formWords(FORM_WORDS.leaf_form)],
  texture: ['texture', listOf(TEXTURES)],
  habit_form: ['habit_form', listOf(HABIT_FORMS)],
  climbs_by: ['climbs_by', listOf(CLIMBING)],
};
const BUILT_IN = {
  ncsu: { title: 'NC State Extension Gardener Plant Toolbox', url: 'https://plants.ces.ncsu.edu', trust: 'reference' },
  usda: { title: 'USDA PLANTS Database', url: 'https://plants.usda.gov', trust: 'reference' },
  arkatlas: { title: 'Atlas of the Vascular Plants of Arkansas', url: 'https://biology.uark.edu/herbarium/', trust: 'reference' },
  mnwild: { title: 'Minnesota Wildflowers', url: 'https://www.minnesotawildflowers.info', trust: 'reference' },
  tallamy: { title: 'Shropshire & Tallamy, Lepidoptera host plant records', trust: 'reference' },
};

/** Facts that make one range together: another source's range (`alt`) on one half only makes sense with the other. */
const PAIRS = [['zone_min', 'zone_max'], ['sun_most', 'sun_least']];
/** Which facts a catalogWarnings message is about (to take back the values that caused it). */
const WARNED = [[/ tall for /, ['height', 'form']], [/under 3 in|height range/, ['height']], [/width|spread/, ['width']], [/zones/, ['zone_min', 'zone_max']], [/sun range/, ['sun_most', 'sun_least']]];
const valueOf = (f) => (f && typeof f === 'object' && !Array.isArray(f) && 'v' in f ? f.v : f);
/**
 * A form a person chose for a cultivar from what its species' authorities list (scripts/catalog/decisions.json):
 * the written fact, or a reason it can't be (a form the catalog doesn't have, more than three, or one no authority
 * lists: a decision never adds one). Its sources are the authorities listing the forms chosen, those listing all
 * of them first. Always `single`, never `confirmed`: the sources list the species as either form, and a person
 * chose which the cultivar is, so no two sources agree on the cultivar.
 */
export function decidedForm(chosen, claims, enums) {
  const forms = [...new Set([chosen].flat())];
  if (!forms.length || !forms.every((x) => enums.form?.includes(x))) return { why: `names a form the catalog doesn't have (${forms.join(', ')})` };
  if (forms.length > 3) return { why: 'names more than three forms' };
  const listing = claims.filter((c) => c.fact === 'form' && c.src && !c.flag && c.kind === 'authority').map((c) => ({ src: c.src, forms: [c.v].flat() }));
  if (!forms.every((x) => listing.some((l) => l.forms.includes(x)))) return { why: `names a form its sources don't list (${forms.join(', ')})` };
  const all = listing.filter((l) => forms.every((x) => l.forms.includes(x)));
  const some = listing.filter((l) => !all.includes(l) && forms.some((x) => l.forms.includes(x)));
  return { fact: { v: forms.length === 1 ? forms[0] : forms, src: [...new Set([...all, ...some].map((l) => l.src))], check: 'single' } };
}
/**
 * The catalog with the audit written in. `audit`: sample.mjs's output (per plant: id, facts, claims).
 * `warnings`: the app's catalogWarnings (src/catalog.ts), to hold back values that would make a record
 * implausible. `decisions`: scripts/catalog/decisions.json, what a person decided on earlier review items (a
 * cultivar's form; whether a plant rated toxic is marked edible). Returns the new file and a review list (disputed facts, values the catalog can't take, and
 * values held back).
 */
export function writeAudit(catalog, audit, date, warnings = () => [], decisions = {}) {
  const byId = new Map(audit.map((a) => [a.id, a]));
  const recById = new Map(catalog.plants.map((r) => [r.id, r]));
  const enums = catalog.meta.enums ?? {};
  const kindOf = new Map(); // source id → its kind (from the claims citing it)
  for (const a of audit) for (const c of a.claims ?? []) if (c.src && c.kind) kindOf.set(c.src, kindOf.get(c.src) === 'authority' ? 'authority' : c.kind);
  const used = new Set();
  const review = [];
  const plants = catalog.plants.map((rec) => {
    const a = byId.get(rec.id);
    if (!a) return rec;
    const parent = rec.parent ? recById.get(rec.parent) : undefined, parentAudit = rec.parent ? byId.get(rec.parent) : undefined;
    // What the plant (or, for a cultivar, its species) is rated: the catalog's own, and the audit's.
    const rated = (key) => valueOf(rec.facts[key]) ?? valueOf(parent?.facts[key]);
    const auditSays = (key) => a.facts?.[key]?.v ?? parentAudit?.facts?.[key]?.v;
    const facts = { ...rec.facts };
    const written = new Set();
    let unmarked = false; // (an older "edible" a person decided against, taken out)
    // Poisonous to people: NC State's page read, and it says nothing of poison: none listed, its source named. Not
    // where the species is rated (a cultivar's own page can leave out what its species' says).
    if (!a.facts?.poison?.v && a.sources?.ncsu && ncsuNoPoison(a.raw?.ncsu ?? {}) && valueOf(parent?.facts.poison) == null && parentAudit?.facts?.poison?.v == null) {
      facts.poison = { v: null, src: ['ncsu'] };
      written.add('poison');
    }
    for (const [key, [to, conv]] of Object.entries(FACTS)) {
      const f = a.facts?.[key];
      if (!f) continue;
      if (f.check === 'disputed') {
        // A cultivar whose species is listed as a tree: the forms a person chose, from those its species' sources list.
        const chose = key === 'form' && /a cultivar may be a tree/.test(f.note ?? '') ? decisions.form?.[rec.id] : undefined;
        const out = chose && decidedForm(chose.v, a.claims ?? [], enums);
        if (out?.fact) { facts[to] = out.fact; written.add(to); continue; }
        review.push({ id: rec.id, fact: key, note: chose ? `${f.note ?? ''}; the decision ${out.why}` : f.note ?? '' });
        continue;
      }
      if (f.v == null || !SETTLED.has(f.check)) continue;
      const v = conv(f.v, enums, f);
      // (The sources can't say Wetland yet: it waits on USDA's wetland list. A plant the catalog calls a wetland
      // plant keeps that until then, rather than becoming merely "High".)
      if (key === 'water' && rated('water') === 'Wetland') continue;
      // (A tree's or a vine's "clumps" are its trunks or its base, not a way of not running: a river birch "grows in a
      // clump", a clematis "forms a clump".)
      if (key === 'habit' && f.v === 'Clumping' && [rated('form')].flat().some((x) => x === 'Tree' || x === 'Vine')) continue;
      // Thorns on a plant named for having none (a thornless blackberry, honeylocust var. inermis, read off its species'
      // page): for a person to look at, not a flag to set.
      if (key === 'thorns' && /thornless|inermis/i.test(`${rec.common ?? ''} ${rec.botanical ?? ''}`)) { review.push({ id: rec.id, fact: key, note: 'thorns, but named thornless' }); continue; }
      // "Edible" beside a toxic rating (mayapple's ripe fruit; a plant whose other parts poison): for a person to
      // word, not a flag to set. (Toxic to dogs on the older list, or seriously toxic to people by the audit.)
      // A person's decision (scripts/catalog/decisions.json `edible`) settles it: written, its poisonous parts shown
      // beside it from the same source (poison); or left unmarked.
      if (key === 'edible' && (/toxic|hard no/i.test(String(rated('dog') ?? '')) || [auditSays('tox_people')].flat().includes('major'))) {
        const chose = decisions.edible?.[rec.id];
        if (!chose) { review.push({ id: rec.id, fact: key, note: 'edible, but rated toxic' }); continue; }
        if (chose.v !== true) { if (valueOf(facts.edible) === true) { delete facts.edible; unmarked = true; } continue; }
      }
      if (v === undefined) { review.push({ id: rec.id, fact: key, note: `value the catalog can't take: ${JSON.stringify(f.v)}` }); continue; }
      const out = { v, src: f.src, check: f.check };
      if (f.at) out.at = f.at;
      // (Read from a description: said so, not the sentence itself. Descriptions aren't copied: docs/catalog-sources.md.)
      if (f.from) out.from = f.from;
      if (f.alt) {
        const av = conv(f.alt.v, enums);
        if (av !== undefined && JSON.stringify(av) !== JSON.stringify(v)) out.alt = { v: av, src: f.alt.src, check: f.alt.check };
      }
      facts[to] = out;
      written.add(to);
    }
    // Values that make the record implausible (new warnings, not the kinds it had: "40 ft is tall for a shrub"
    // becoming "50 ft …" is the same doubt, about its form) go back, for review.
    // (Of a kind it had, a height that's grown past double is a new doubt: 40 ft for a shrub becoming 400 ft.)
    const kind = (w) => w.replace(/\d+(\.\d+)?/g, '#');
    const first = (w) => parseFloat(w.replace(`${rec.id}: `, ''));
    const before = new Map(warnings({ meta: catalog.meta, plants: [rec] }).map((w) => [kind(w), w]));
    for (const w of warnings({ meta: catalog.meta, plants: [{ ...rec, facts }] })) {
      const had = before.get(kind(w));
      if (had && !(/ tall for /.test(w) && first(w) > 2 * first(had))) continue;
      const keys = (WARNED.find(([re]) => re.test(w))?.[1] ?? []).filter((k) => written.has(k));
      for (const k of keys) { facts[k] = rec.facts[k]; if (facts[k] === undefined) delete facts[k]; written.delete(k); }
      if (keys.length) review.push({ id: rec.id, fact: keys.join(', '), note: `held back: ${w.replace(`${rec.id}: `, '')}` });
    }
    // Another source's range (`alt`) on half a pair (the other half not written: unsettled, or held back) would
    // be read with the older list's other half, as a range no source gave.
    // (A half sourced by an earlier run counts as written.)
    const sourced = (k) => written.has(k) || (valueOf(facts[k]) != null && facts[k]?.src?.length > 0 && facts[k].src.every((s) => catalog.meta.sources[s]?.trust !== 'unverified'));
    for (const pair of PAIRS) if (pair.some((k) => !sourced(k))) for (const k of pair) if (written.has(k) && facts[k].alt) { facts[k] = { ...facts[k] }; delete facts[k].alt; }
    for (const k of written) for (const s of [...facts[k].src, ...(facts[k].alt?.src ?? [])]) used.add(s);
    // A value an earlier run sourced that no source gives now (its page no longer read, or no longer saying it):
    // kept, since a record may need it (a plant's spread draws its circle), but listed, its citation no longer
    // true of today's sources. (Not where this run already lists the fact.)
    const listed = new Set(review.filter((i) => i.id === rec.id).flatMap((i) => i.fact.split(', ')));
    // (Read from text and held by the second reading, second-reading.mjs: the review lists it from the audit. One an
    // earlier build wrote from a description, the second reading now differing, is taken out: unsettled. One whose page
    // waits for a second reading stays as it was until it's read.)
    const heldBy = new Map((a.held ?? []).map((h) => [h.fact, h.why]));
    let retracted = false;
    for (const [, [to]] of Object.entries(FACTS)) {
      const f = rec.facts[to];
      if (written.has(to) || listed.has(to) || (to === 'edible' && unmarked) || !(f?.src?.length > 0) || f.src.some((s) => catalog.meta.sources[s]?.trust === 'unverified')) continue;
      if (heldBy.has(to) && f.from === 'description') { if (heldBy.get(to) === 'disagree') { delete facts[to]; retracted = true; } continue; }
      // (Every source of it check-only (decisions.json `checkOnly`): taken out, not kept. Such a source never decides, from
      // its fields or its description.)
      if (f.src.every((s) => decisions.checkOnly?.[s])) { delete facts[to]; retracted = true; review.push({ id: rec.id, fact: to, note: `check only: ${JSON.stringify(f.v)}, from ${f.src.join(', ')}` }); continue; }
      // (Read from a description by rules that no longer read it so: a misread, taken out. "A light winter mulch of
      // evergreen boughs" once made a pincushion flower evergreen.)
      if (f.from === 'description') { delete facts[to]; retracted = true; review.push({ id: rec.id, fact: to, note: `taken out: ${JSON.stringify(f.v)}, read from ${f.src.join(', ')}'s description, which the rules no longer read so` }); continue; }
      // (Every source of it withdrawn, its terms taken back or found to bar us (decisions.json `withdrawn`): taken
      // out, not kept: we may no longer read it.)
      if (f.src.every((s) => decisions.withdrawn?.[s])) { delete facts[to]; retracted = true; review.push({ id: rec.id, fact: to, note: `withdrawn: ${JSON.stringify(f.v)}, from ${f.src.join(', ')}: ${f.src.map((s) => decisions.withdrawn[s].why).join('; ')}` }); continue; }
      review.push({ id: rec.id, fact: to, note: `no source gives it now: ${JSON.stringify(f.v)}, from ${f.src.join(', ')}` });
    }
    // (Dated by this run only where its facts changed, or it had none audited: a record the run leaves as it was
    // keeps the date its facts were written on. So a build on a later day changes only what it changed.)
    if (!written.size && !unmarked && !retracted) return rec;
    return { ...rec, audited: rec.audited && JSON.stringify(facts) === JSON.stringify(rec.facts) ? rec.audited : date, facts };
  });
  const sources = { ...catalog.meta.sources };
  // (A withdrawn or check-only source nothing cites any more leaves the list of sources.)
  const cited = new Set(plants.flatMap((p) => Object.values(p.facts).flatMap((f) => (f && typeof f === 'object' ? [...(f.src ?? []), ...(f.alt?.src ?? [])] : []))));
  for (const s of [...Object.keys(decisions.withdrawn ?? {}), ...Object.keys(decisions.checkOnly ?? {})]) if (!cited.has(s)) delete sources[s];
  for (const s of [...used].sort()) {
    if (sources[s]) continue;
    sources[s] = BUILT_IN[s] ?? { title: s, url: `https://${s}`, trust: kindOf.get(s) === 'authority' ? 'reference' : 'nursery' };
  }
  const changed = plants.some((p, i) => p !== catalog.plants[i] && JSON.stringify(p) !== JSON.stringify(catalog.plants[i]));
  return { file: { meta: { ...catalog.meta, updated: changed ? date : catalog.meta.updated ?? date, sources }, plants }, review };
}

