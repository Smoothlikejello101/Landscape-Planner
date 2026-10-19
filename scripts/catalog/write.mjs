// Write the audit's values into the catalog (public/plants.json), each with its sources and how sure it
// is (docs/catalog-format.md), from the combined claims sample.mjs produces:
//   npm run catalog:write -- <combined.json> [--date YYYY-MM-DD] [--review review.json]   (write-cli.ts)
// Only facts the audit settled are written; a fact it couldn't settle (unknown, unsettled, disputed)
// keeps the catalog's current value, still marked unverified, and a disputed one goes on the review list,
// as does a value that would make the record implausible (the app's catalogWarnings: 1 in tall, zones
// backwards).

/** The checks the app takes (src/catalog.ts): disputed facts aren't written. */
const SETTLED = new Set(['confirmed', 'single', 'likely', 'reported']);
const range = (r) => (r && typeof r.min === 'number' && typeof r.max === 'number' && r.min > 0 && r.min <= r.max
  ? { min: r.min, max: r.max, med: Math.round(((r.min + r.max) / 2) * 100) / 100 } : undefined);
const ZONE = (z) => (typeof z === 'number' && z >= 1 && z <= 13.5 && Number.isInteger(z * 2) ? z : undefined);
const SUN = (v) => (['Full', 'Part', 'Shade'].includes(v) ? v : undefined);
const yes = (v) => (v === true ? true : undefined); // (sources say so only when it's so: no "false" from silence)
/**
 * How each audited fact goes into the catalog: its key there and its value (undefined: not writable). Forms
 * are a list of up to three (one: plain); native status, toxicity, hosts and bloom wait on format changes
 * (docs/catalog-sources.md, "Waiting on format changes").
 */
const FACTS = {
  form: ['form', (v, enums) => { const l = [v].flat().filter((f) => enums.form?.includes(f)); return l.length ? (l.length === 1 ? l[0] : l.slice(0, 3)) : undefined; }],
  height: ['height', range],
  width: ['width', range],
  zone_min: ['zone_min', ZONE],
  zone_max: ['zone_max', ZONE],
  sun_most: ['sun_most', SUN],
  sun_least: ['sun_least', SUN],
  water: ['water', (v, enums) => (enums.water?.includes(v) ? v : undefined)],
  deer: ['deer', (v, enums) => (enums.deer?.includes(v) ? v : undefined)],
  clay_ok: ['clay_ok', yes],
  wet_feet: ['wet_feet', yes],
  edible: ['edible', yes],
  fall_color: ['fall_color', yes],
};
const BUILT_IN = {
  ncsu: { title: 'NC State Extension Gardener Plant Toolbox', url: 'https://plants.ces.ncsu.edu', trust: 'reference' },
  usda: { title: 'USDA PLANTS Database', url: 'https://plants.usda.gov', trust: 'reference' },
  arkatlas: { title: 'Atlas of the Vascular Plants of Arkansas', url: 'https://biology.uark.edu/herbarium/', trust: 'reference' },
  mnwild: { title: 'Minnesota Wildflowers', url: 'https://www.minnesotawildflowers.info', trust: 'reference' },
  tallamy: { title: 'Shropshire & Tallamy, Lepidoptera host plant records', trust: 'reference' },
};

/** Facts that make one range together: a nursery's report on one half only makes sense with its other. */
const PAIRS = [['zone_min', 'zone_max'], ['sun_most', 'sun_least']];
/** Which facts a catalogWarnings message is about (to take back the values that caused it). */
const WARNED = [[/ tall for /, ['height', 'form']], [/under 3 in|height range/, ['height']], [/width|spread/, ['width']], [/zones/, ['zone_min', 'zone_max']], [/sun range/, ['sun_most', 'sun_least']]];
const valueOf = (f) => (f && typeof f === 'object' && !Array.isArray(f) && 'v' in f ? f.v : f);
/**
 * The catalog with the audit written in. `audit`: sample.mjs's output (per plant: id, facts, claims).
 * `warnings`: the app's catalogWarnings (src/catalog.ts), to hold back values that would make a record
 * implausible. Returns the new file and a review list (disputed facts, values the catalog can't take, and
 * values held back).
 */
export function writeAudit(catalog, audit, date, warnings = () => []) {
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
    for (const [key, [to, conv]] of Object.entries(FACTS)) {
      const f = a.facts?.[key];
      if (!f) continue;
      if (f.check === 'disputed') { review.push({ id: rec.id, fact: key, note: f.note ?? '' }); continue; }
      if (f.v == null || !SETTLED.has(f.check)) continue;
      const v = conv(f.v, enums);
      // (The sources can't say Wetland yet: it waits on USDA's wetland list. A plant the catalog calls a wetland
      // plant keeps that until then, rather than becoming merely "High".)
      if (key === 'water' && rated('water') === 'Wetland') continue;
      // "Edible" beside a toxic rating (mayapple's ripe fruit; a plant whose other parts poison): for a person to
      // word, not a flag to set. (Toxic to dogs on the older list, or seriously toxic to people by the audit.)
      if (key === 'edible' && (/toxic|hard no/i.test(String(rated('dog') ?? '')) || [auditSays('tox_people')].flat().includes('major'))) { review.push({ id: rec.id, fact: key, note: 'edible, but rated toxic' }); continue; }
      if (v === undefined) { review.push({ id: rec.id, fact: key, note: `value the catalog can't take: ${JSON.stringify(f.v)}` }); continue; }
      const out = { v, src: f.src, check: f.check };
      if (f.at) out.at = f.at;
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
    // A nursery's report on half a pair (the other half not written: unsettled, or held back) would be read
    // with the older list's other half, as a range no nursery gave.
    // (A half sourced by an earlier run counts as written.)
    const sourced = (k) => written.has(k) || (valueOf(facts[k]) != null && facts[k]?.src?.length > 0 && facts[k].src.every((s) => catalog.meta.sources[s]?.trust !== 'unverified'));
    for (const pair of PAIRS) if (pair.some((k) => !sourced(k))) for (const k of pair) if (written.has(k) && facts[k].alt) { facts[k] = { ...facts[k] }; delete facts[k].alt; }
    for (const k of written) for (const s of [...facts[k].src, ...(facts[k].alt?.src ?? [])]) used.add(s);
    return written.size ? { ...rec, audited: date, facts } : rec;
  });
  const sources = { ...catalog.meta.sources };
  for (const s of [...used].sort()) {
    if (sources[s]) continue;
    sources[s] = BUILT_IN[s] ?? { title: s, url: `https://${s}`, trust: kindOf.get(s) === 'authority' ? 'reference' : 'nursery' };
  }
  return { file: { meta: { ...catalog.meta, updated: date, sources }, plants }, review };
}

