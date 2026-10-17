// One-time conversion of the first catalog (a flat list, 2026) to version 2
// (sourced facts; see docs/catalog-format.md).
//
//   node scripts/catalog/convert-v1.mjs public/plants.json > /tmp/plants-v2.json
//
// Every value is kept, sourced to the first compendium and marked unaudited:
// nothing from it is trusted until the audit re-derives it. Cultivars are
// linked to their species where the catalog has the species.
import { readFileSync } from 'node:fs';

const [, , path] = process.argv;
if (!path) { console.error('usage: convert-v1.mjs <plants.json>'); process.exit(1); }
const v1 = JSON.parse(readFileSync(path, 'utf8'));
if (v1.meta?.format === 'lp-catalog') { console.error('already version 2'); process.exit(1); }

const NAMES = new Set(['id', 'common', 'botanical']);
const isCultivar = (b) => /['‘’]/.test(b ?? '');
const speciesOf = (b) => b.split(/['‘’]/)[0].trim().toLowerCase();
const species = new Map(v1.plants.filter((p) => p.botanical && !isCultivar(p.botanical)).map((p) => [p.botanical.trim().toLowerCase(), p.id]));

const plants = v1.plants.map((p) => {
  const facts = {};
  for (const [k, v] of Object.entries(p)) {
    if (NAMES.has(k) || v == null) continue; // a missing value is unknown, not a fact
    facts[k] = v;
  }
  const parent = isCultivar(p.botanical) ? species.get(speciesOf(p.botanical)) : undefined;
  return {
    id: p.id, common: p.common, ...(p.botanical ? { botanical: p.botanical } : {}),
    ...(parent && parent !== p.id ? { parent } : {}),
    src: ['compendium'], audited: null, facts,
  };
});

const enums = { ...(v1.meta?.enums ?? {}) };
enums.bird ??= enums.nectar;
const out = {
  meta: {
    format: 'lp-catalog', version: 2, title: 'Plant catalog', updated: new Date().toISOString().slice(0, 10),
    sources: {
      compendium: { title: 'First compendium (2026): unsourced claims, kept until the audit replaces them', trust: 'unverified' },
    },
    enums,
    notes: 'See docs/catalog-format.md. Heights and spreads in feet; bloom months 1-12. Records with audited: null are unverified.',
  },
  plants,
};
// One record per line, so each change in review is one line of the diff.
process.stdout.write(`{"meta":${JSON.stringify(out.meta)},\n"plants":[\n${plants.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
console.error(`${plants.length} records, ${plants.filter((p) => p.parent).length} cultivars linked to a species`);
