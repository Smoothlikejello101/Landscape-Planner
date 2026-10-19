// Write the combined audit into public/plants.json (scripts/catalog/write.mjs):
//   npm run catalog:write -- <combined.json> [--date YYYY-MM-DD] [--review review.json]
// The date is the day the audit's pages were read. Written atomically (a temporary file, then a rename).
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
// @ts-expect-error (a plain .mjs script)
import { writeAudit } from './write.mjs';
// @ts-expect-error (a plain .mjs script)
import { catalogText } from './convert-v1.mjs';
import { catalogWarnings, type CatalogFile } from '../../src/catalog';

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const date = opt('--date') ?? new Date().toLocaleDateString('en-CA');
const reviewPath = opt('--review');
const [auditPath] = args;
if (!auditPath) { console.error('usage: npm run catalog:write -- <combined.json> [--date YYYY-MM-DD] [--review review.json]'); process.exit(1); }
const path = 'public/plants.json';
const catalog = JSON.parse(readFileSync(path, 'utf8')) as CatalogFile;
const audit = JSON.parse(readFileSync(auditPath, 'utf8')) as { id: string }[];
const { file, review } = writeAudit(catalog, audit, date, catalogWarnings) as { file: CatalogFile; review: unknown[] };
const tmp = `${path}.${process.pid}.tmp`;
writeFileSync(tmp, catalogText(file));
renameSync(tmp, path);
if (reviewPath) writeFileSync(reviewPath, JSON.stringify(review, null, 1) + '\n');
const ids = new Set(catalog.plants.map((r) => r.id));
const notInCatalog = audit.filter((a) => !ids.has(a.id)).length;
const audited = file.plants.filter((p) => p.audited).length;
console.log(`${audited} of ${file.plants.length} records audited; ${review.length} facts for review` + (notInCatalog ? `; ${notInCatalog} audited plants aren't in the catalog (not written)` : ''));
