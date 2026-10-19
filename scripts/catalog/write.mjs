// Write the audit's values into the catalog (public/plants.json), each with its sources and how sure it
// is (docs/catalog-format.md), from the combined claims sample.mjs produces:
//   node scripts/catalog/write.mjs <combined.json> [--date YYYY-MM-DD] [--review review.json]
// Only facts the audit settled are written; a fact it couldn't settle (unknown, unsettled, disputed)
// keeps the catalog's current value, still marked unverified, and a disputed one goes on the review list.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogText } from './convert-v1.mjs';

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

/**
 * The catalog with the audit written in. `audit`: sample.mjs's output (per plant: id, facts, claims).
 * Returns the new file and a review list (disputed facts, and values the catalog can't take).
 */
export function writeAudit(catalog, audit, date) {
  const byId = new Map(audit.map((a) => [a.id, a]));
  const enums = catalog.meta.enums ?? {};
  const kindOf = new Map(); // source id → its kind (from the claims citing it)
  for (const a of audit) for (const c of a.claims ?? []) if (c.src && c.kind) kindOf.set(c.src, kindOf.get(c.src) === 'authority' ? 'authority' : c.kind);
  const used = new Set();
  const review = [];
  const plants = catalog.plants.map((rec) => {
    const a = byId.get(rec.id);
    if (!a) return rec;
    const facts = { ...rec.facts };
    let wrote = 0;
    for (const [key, [to, conv]] of Object.entries(FACTS)) {
      const f = a.facts?.[key];
      if (!f) continue;
      if (f.check === 'disputed') { review.push({ id: rec.id, fact: key, note: f.note ?? '' }); continue; }
      if (f.v == null || !SETTLED.has(f.check)) continue;
      const v = conv(f.v, enums);
      // (The sources can't say Wetland yet: it waits on USDA's wetland list. A plant the catalog calls a wetland
      // plant keeps that until then, rather than becoming merely "High".)
      if (key === 'water' && (rec.facts.water?.v ?? rec.facts.water) === 'Wetland') continue;
      // "Edible" beside a toxic rating (mayapple's ripe fruit; a plant whose other parts poison): for a person to
      // word, not a flag to set.
      if (key === 'edible' && /toxic|hard no/i.test(String(rec.facts.dog?.v ?? rec.facts.dog ?? ''))) { review.push({ id: rec.id, fact: key, note: 'edible, but rated toxic' }); continue; }
      if (v === undefined) { review.push({ id: rec.id, fact: key, note: `value the catalog can't take: ${JSON.stringify(f.v)}` }); continue; }
      const out = { v, src: f.src, check: f.check };
      if (f.at) out.at = f.at;
      if (f.alt) {
        const av = conv(f.alt.v, enums);
        if (av !== undefined && JSON.stringify(av) !== JSON.stringify(v)) { out.alt = { v: av, src: f.alt.src, check: f.alt.check }; for (const s of f.alt.src) used.add(s); }
      }
      for (const s of f.src) used.add(s);
      facts[to] = out;
      wrote++;
    }
    return wrote ? { ...rec, audited: date, facts } : rec;
  });
  const sources = { ...catalog.meta.sources };
  for (const s of [...used].sort()) {
    if (sources[s]) continue;
    sources[s] = BUILT_IN[s] ?? { title: s, url: `https://${s}`, trust: kindOf.get(s) === 'authority' ? 'reference' : 'nursery' };
  }
  return { file: { meta: { ...catalog.meta, updated: date, sources }, plants }, review };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const date = opt('--date') ?? new Date().toISOString().slice(0, 10);
  const reviewPath = opt('--review');
  const [auditPath] = args;
  if (!auditPath) { console.error('usage: node scripts/catalog/write.mjs <combined.json> [--date YYYY-MM-DD] [--review review.json]'); process.exit(1); }
  const path = 'public/plants.json';
  const { file, review } = writeAudit(JSON.parse(readFileSync(path, 'utf8')), JSON.parse(readFileSync(auditPath, 'utf8')), date);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, catalogText(file));
  renameSync(tmp, path);
  if (reviewPath) writeFileSync(reviewPath, JSON.stringify(review, null, 1) + '\n');
  const audited = file.plants.filter((p) => p.audited).length;
  console.log(`${audited} of ${file.plants.length} records audited; ${review.length} facts for review`);
}
