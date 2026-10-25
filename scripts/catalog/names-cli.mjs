// Name every cultivar in public/plants.json by the rule (scripts/catalog/names.mjs), keeping each former name as a
// synonym:  npm run catalog:names  (the build's write step does the same, so later builds keep the rule)
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { catalogText } from './convert-v1.mjs';
import { renameCultivars } from './names.mjs';

const path = 'public/plants.json';
const file = JSON.parse(readFileSync(path, 'utf8'));
const changes = renameCultivars(file);
const tmp = `${path}.${process.pid}.tmp`;
writeFileSync(tmp, catalogText(file));
renameSync(tmp, path);
console.log(`${changes.length} cultivar names written as plant, then cultivar or trade name`);
for (const [, from, to] of changes) console.log(`  ${from}  →  ${to}`);
