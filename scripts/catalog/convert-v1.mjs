// One-time conversion of the first catalog (a flat list, 2026) to version 2
// (sourced facts; see docs/catalog-format.md).
//
//   node scripts/catalog/convert-v1.mjs old-plants.json > public/plants.json
//
// Every value is kept, sourced to the first compendium and marked unaudited:
// nothing from it is trusted until the audit re-derives it. A cultivar is
// linked to its species only where the catalog clearly has the species.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NAMES = new Set(['id', 'common', 'botanical']);
const isCultivar = (b) => /['‘’]/.test(b ?? '');
const speciesOf = (b) => b.split(/['‘’]/)[0].trim().toLowerCase();

/** The version 2 catalog for a version 1 file. */
export function convertV1(v1, today = new Date().toISOString().slice(0, 10)) {
  // A species record: a botanical name with no cultivar in it, and a common name with none either
  // ("Beebalm 'Jacob Cline'" filed under Monarda didyma is a cultivar, not the species).
  // Only a botanical name with exactly one such record links; anything unclear stays unlinked.
  const candidates = new Map();
  for (const p of v1.plants) {
    if (!p.botanical || isCultivar(p.botanical) || isCultivar(p.common)) continue;
    const key = p.botanical.trim().toLowerCase();
    candidates.set(key, [...(candidates.get(key) ?? []), p.id]);
  }
  const species = new Map([...candidates].filter(([, ids]) => ids.length === 1).map(([k, ids]) => [k, ids[0]]));

  const plants = v1.plants.map((p) => {
    const facts = {};
    for (const [k, v] of Object.entries(p)) {
      if (NAMES.has(k) || v == null) continue; // a missing value is unknown, not a fact
      // Version 1 rated zones in whole zones: its zone_max 9 was through 9b, 9.5 on the half-zone scale.
      facts[k] = k === 'zone_max' && Number.isInteger(v) ? v + 0.5 : v;
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
  return {
    meta: {
      format: 'lp-catalog', version: 2, zones: 'half', title: 'Plant catalog', updated: today,
      sources: { compendium: { title: 'First compendium (2026): unsourced claims, kept until the audit replaces them', trust: 'unverified' } },
      enums,
      notes: 'See docs/catalog-format.md. Heights and spreads in feet; bloom months 1-12. Records with audited: null are unverified.',
    },
    plants,
  };
}
/** The file as written: one record per line, so each change in review is one line of the diff. */
export function catalogText(file) {
  return `{"meta":${JSON.stringify(file.meta)},\n"plants":[\n${file.plants.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , path] = process.argv;
  if (!path) { console.error('usage: convert-v1.mjs <plants.json>'); process.exit(1); }
  const v1 = JSON.parse(readFileSync(path, 'utf8'));
  if (v1.meta?.format === 'lp-catalog') { console.error('already version 2'); process.exit(1); }
  const out = convertV1(v1);
  process.stdout.write(catalogText(out));
  console.error(`${out.plants.length} records, ${out.plants.filter((p) => p.parent).length} cultivars linked to a species`);
}
