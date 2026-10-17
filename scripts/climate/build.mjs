// Build public/climate/<ZIP prefix>.json from the official files in a folder
// (not kept in the repo):
//   node scripts/climate/build.mjs <folder> <date accessed, YYYY-MM-DD>
// The folder holds:
//   phzm_*_zipcode_2023.csv          PRISM Group, Oregon State University (https://prism.oregonstate.edu/phzm)
//   *_Gaz_zcta_national.txt          U.S. Census Bureau Gazetteer, ZIP code tabulation areas
//   normals/*.csv                    NOAA NCEI annual/seasonal normals 1991-2020, one CSV per station
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFiles, centersByZip, frostStations, table, zonesByZip } from './lib.mjs';

const [dir, accessed] = process.argv.slice(2);
if (!dir || !/^\d{4}-\d{2}-\d{2}$/.test(accessed ?? '')) {
  console.error('usage: node scripts/climate/build.mjs <folder> <YYYY-MM-DD accessed>');
  process.exit(1);
}
const files = readdirSync(dir);
const zones = new Map();
for (const f of files.filter((f) => /^phzm_.*_zipcode_2023\.csv$/.test(f))) for (const [z, v] of zonesByZip(readFileSync(join(dir, f), 'utf8'))) zones.set(z, v);
const gaz = files.find((f) => /Gaz_zcta_national\.txt$/.test(f));
const centers = gaz ? centersByZip(readFileSync(join(dir, gaz), 'utf8')) : new Map();
const rows = [];
const nd = join(dir, 'normals');
for (const f of readdirSync(nd).filter((f) => f.endsWith('.csv'))) rows.push(...table(readFileSync(join(nd, f), 'utf8')));
const stations = frostStations(rows);
const out = buildFiles(zones, centers, stations, accessed);

const target = 'public/climate';
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
let withFrost = 0;
for (const [prefix, f] of out) {
  writeFileSync(join(target, `${prefix}.json`), JSON.stringify(f));
  withFrost += Object.values(f.zips).filter((r) => r[1] >= 0).length;
}
console.log(`${zones.size} ZIP codes (${centers.size} with a location), ${stations.length} stations with frost dates, ${withFrost} ZIPs with frost dates, ${out.size} files.`);
