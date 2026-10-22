// Build the catalog and the wild records from the pages already saved, in one go, and write the review
// report (docs/catalog-build.md):
//   npm run catalog:build [-- --fetch] [--date YYYY-MM-DD]
// Offline unless --fetch: it then first fetches, politely, the pages the list needs that aren't saved yet (NC
// State's species pages never asked for, USDA PLANTS's name searches and profiles, its county records, GBIF's
// names). The web search isn't run (search.mjs: it needs the search key and terms readings); a plant it hasn't
// searched yet is named in the report.
// --date: the day the audit's pages were read, written on each audited record (default: the catalog's own, the
// latest `audited` in it). Pass today's when --fetch brought new pages.
//
// Writes public/plants.json, public/wild/1/, docs/catalog-review.md (what's waiting on a person), and
// catalog-src/build/ (the steps' files and log, kept, not committed). Running it twice changes nothing.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { savedAuditList, toFetch } from './list.mjs';
import { rereadClaims } from './reclaim.mjs';
import { savedFile } from './pages.mjs';
import { reviewReport } from './report.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const fetching = args.includes('--fetch');
if (args.some((a, i) => a !== '--fetch' && a !== '--date' && args[i - 1] !== '--date') || (args.includes('--date') && !opt('--date'))) {
  console.error('usage: npm run catalog:build [-- --fetch] [--date YYYY-MM-DD]   (docs/catalog-build.md)');
  process.exit(1);
}
const ROOT = 'catalog-src', OUT = join(ROOT, 'build');
const ATLAS_PDF = 'https://biology.uark.edu/herbarium/AtlasVascularPlantsArkansas2013_lowerres.pdf';
const TALLAMY_XLSX = 'https://zenodo.org/records/17747343/files/oo_1478226.xlsx?download=1';
const KEW = join(ROOT, 'kew-wcvp');
const path = (f) => join(OUT, f);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const writeJson = (f, data) => { const tmp = `${f}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n'); renameSync(tmp, f); };

mkdirSync(OUT, { recursive: true });
// One build at a time (the fetch steps take catalog-src/.lock themselves, so this one is the build's own).
const lock = path('.lock');
try { writeFileSync(lock, String(process.pid), { flag: 'wx' }); } catch {
  console.error(`A build is already running (${lock}). If none is, delete that file and start again.`);
  process.exit(1);
}
const unlock = () => { try { if (readFileSync(lock, 'utf8') === String(process.pid)) rmSync(lock); } catch { /* gone */ } };
process.on('exit', unlock);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(130));

const log = [];
/** Run a step's script, its output to the log; stop the build if it fails. */
function run(label, cmd, cmdArgs) {
  const started = Date.now();
  process.stdout.write(`${label}… `);
  try {
    const out = execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
    log.push(`## ${label}\n$ ${[cmd, ...cmdArgs].join(' ')}\n${out}`);
    const last = out.trim().split('\n').filter(Boolean).pop() ?? '';
    console.log(`${last.slice(0, 160)} (${Math.round((Date.now() - started) / 1000)} s)`);
    return out;
  } catch (e) {
    log.push(`## ${label} (failed)\n$ ${[cmd, ...cmdArgs].join(' ')}\n${e.stdout ?? ''}${e.stderr ?? ''}`);
    writeFileSync(path('log.txt'), log.join('\n'));
    console.log('failed');
    console.error(String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-12).join('\n'));
    console.error(`(the whole log: ${path('log.txt')})`);
    process.exit(1);
  }
}
const node = (label, script, ...a) => run(label, process.execPath, [join('scripts/catalog', script), ...a]);
const viteNode = (label, script, ...a) => run(label, process.execPath, ['node_modules/vite-node/vite-node.mjs', join('scripts/catalog', script), ...(a.length ? ['--', ...a] : [])]);
/** Fetch a list of pages (fetch.mjs: robots.txt, pace, refusals). */
function fetchList(label, items) {
  if (!items.length) { console.log(`${label}: nothing to fetch`); return; }
  const f = path(`fetch-${label.replace(/\W+/g, '-')}.json`);
  writeJson(f, items);
  node(`${label} (${items.length} pages)`, 'fetch.mjs', f);
}

const catalogBefore = readFileSync('public/plants.json', 'utf8');
const catalog = JSON.parse(catalogBefore);
const date = opt('--date') ?? catalog.plants.map((p) => p.audited).filter(Boolean).sort().pop() ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error(`--date ${date}: not YYYY-MM-DD`); process.exit(1); }

// 0. Fetch what the list needs (--fetch).
if (fetching) {
  const first = toFetch(savedAuditList(catalog, ROOT), ROOT);
  const files = [['arkatlas', ATLAS_PDF], ['tallamy', TALLAMY_XLSX]].filter(([s, u]) => !savedFile(s, u, ROOT)).map(([source, url]) => ({ source, url }));
  fetchList('source pages', [...files, ...first.ncsu.map((url) => ({ source: 'ncsu', url })), ...first.searches.map((url) => ({ source: 'usda', url }))]);
  // (Then the profiles the searches lead to.)
  fetchList('USDA profiles', toFetch(savedAuditList(catalog, ROOT), ROOT).profiles.map((url) => ({ source: 'usda', url })));
}

// What the build can't fetch itself: missing, it stops before writing anything.
const atlasPdf = savedFile('arkatlas', ATLAS_PDF, ROOT);
if (!atlasPdf) { console.error(`The Arkansas atlas isn't saved: run with --fetch, or fetch ${ATLAS_PDF} (source arkatlas) with fetch.mjs`); process.exit(1); }
if (!existsSync(join(KEW, 'wcvp_names.csv')) || !existsSync(join(KEW, 'wcvp_distribution.csv'))) {
  console.error(`Kew's World Checklist isn't in ${KEW}/: download wcvp.zip from sftp.kew.org/pub/data-repositories/WCVP/ and unzip it there (docs/catalog-build.md)`);
  process.exit(1);
}

// 1. The plant list.
const list = savedAuditList(catalog, ROOT);
writeJson(path('list.json'), list);
console.log(`list: ${list.length} plants, ${list.filter((s) => s.ncsu).length} with an NC State page, ${list.filter((s) => s.usda).length} with a USDA symbol`);

// 2. The Arkansas atlas as text, and the caterpillar host genera, from their newest saved files.
const atlasText = path('atlas.txt');
run('atlas text', 'pdftotext', ['-q', '-layout', atlasPdf, atlasText]);
const xlsx = savedFile('tallamy', TALLAMY_XLSX, ROOT);
if (xlsx) {
  copyFileSync(xlsx, path('tallamy.xlsx')); // (the reader goes by the file's extension)
  run('caterpillar hosts', 'python3', ['-I', 'scripts/catalog/tallamy.py', path('tallamy.xlsx'), join(ROOT, 'tallamy', 'genera.json')]);
}
else console.log(`caterpillar hosts: the Tallamy spreadsheet isn't saved (--fetch gets it); none read`);

// 3. The web claims, read again with today's reader.
const searchedPath = join(ROOT, 'web-claims.json');
const searched = existsSync(searchedPath) ? readJson(searchedPath) : {};
const web = rereadClaims(searched, list, catalog, ROOT);
writeFileSync(path('web.json'), JSON.stringify(web.claims));
console.log(`web claims: ${web.pages} pages read again${web.missing ? `, ${web.missing} no longer saved` : ''}`);

// 4. Combine, then write the catalog.
node('combine', 'sample.mjs', path('list.json'), atlasText, path('combined.json'), path('web.json'));
viteNode('write', 'write-cli.ts', path('combined.json'), '--date', date, '--review', path('review.json'));

// 5. Where each plant grows wild, and its status by state.
if (fetching) {
  node('USDA county records', 'usda-fetch.mjs', path('combined.json'));
  node('GBIF names', 'gbif-fetch.mjs', path('combined.json'));
}
if (!existsSync(join(ROOT, 'counties.json'))) node('counties', 'counties.mjs');
if (!existsSync(join(ROOT, 'arkatlas', 'counties.json'))) {
  run('atlas counties', 'python3', ['-I', 'scripts/catalog/atlas_counties.py', atlasPdf, join(ROOT, 'counties.json'), join(ROOT, 'arkatlas', 'counties.json')]);
}
node('USDA counties', 'usda-counties.mjs', path('combined.json'));
node('Kew native status', 'wcvp.mjs', path('combined.json'));
node('wild records', 'wild.mjs', path('combined.json'));

// 6. The catalog's own checks, then the report.
/** Sites a search found whose terms aren't in the record yet (a reader couldn't tell, or none has read them): their packets' names. */
function termsUnsettled() {
  const dir = join(ROOT, 'terms-review');
  if (!existsSync(dir)) return [];
  const read = new Set(Object.keys(readJson('scripts/catalog/site-terms.json')).map((k) => k.replace(/[^a-z0-9.-]/gi, '_')));
  return readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4)).filter((k) => !read.has(k)).sort();
}
const checkOut = (() => {
  try { return execFileSync(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/catalog/check.ts'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { console.error('catalog:check found errors:\n' + e.stdout); process.exit(1); }
})();
log.push(`## check\n${checkOut}`);
const after = JSON.parse(readFileSync('public/plants.json', 'utf8'));
const report = reviewReport({
  catalog: after,
  date,
  list,
  combined: readJson(path('combined.json')),
  review: readJson(path('review.json')),
  searched,
  wcvp: existsSync(join(ROOT, 'wcvp-review.json')) ? readJson(join(ROOT, 'wcvp-review.json')) : null,
  native: existsSync(join(ROOT, 'native-review.json')) ? readJson(join(ROOT, 'native-review.json')) : [],
  bloom: existsSync(join(ROOT, 'bloom-review.json')) ? readJson(join(ROOT, 'bloom-review.json')) : [],
  warnings: checkOut.split('\n').filter((l) => l.startsWith('  ')).map((l) => l.trim()),
  unfetched: toFetch(list, ROOT),
  termsUnsettled: termsUnsettled(),
});
writeFileSync('docs/catalog-review.md', report.markdown);
writeFileSync(path('log.txt'), log.join('\n'));

// What changed, for the person running it.
const before = new Map(catalog.plants.map((p) => [p.id, JSON.stringify(p)]));
const changed = after.plants.filter((p) => before.get(p.id) !== JSON.stringify(p)).map((p) => p.id);
console.log(`\n${catalogBefore === readFileSync('public/plants.json', 'utf8') ? 'public/plants.json unchanged' : `public/plants.json: ${changed.length} records changed${changed.length ? ` (${changed.slice(0, 12).join(', ')}${changed.length > 12 ? '…' : ''})` : ''}`}`);
console.log(`docs/catalog-review.md: ${report.summary}`);
console.log(`(each step's output: ${path('log.txt')}; see git diff for the rest)`);
