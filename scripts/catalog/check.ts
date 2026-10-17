// The catalog's review list: structural errors (which also fail `npm test`)
// and implausible values for the audit to look at.
//
//   npx vite-node scripts/catalog/check.ts [public/plants.json]
import { readFileSync } from 'node:fs';
import { catalogErrors, catalogWarnings, isCatalogV2 } from '../../src/catalog';

const path = process.argv[2] ?? 'public/plants.json';
const file = JSON.parse(readFileSync(path, 'utf8'));
if (!isCatalogV2(file)) { console.error(`${path} isn't a version 2 catalog`); process.exit(1); }
const errors = catalogErrors(file), warnings = catalogWarnings(file);
const audited = file.plants.filter((r) => r.audited).length;
console.log(`${file.plants.length} records, ${audited} audited, ${file.plants.length - audited} unverified`);
console.log(`\n${errors.length} errors`);
for (const e of errors) console.log('  ' + e);
console.log(`\n${warnings.length} for review`);
for (const w of warnings) console.log('  ' + w);
process.exit(errors.length ? 1 : 0);
