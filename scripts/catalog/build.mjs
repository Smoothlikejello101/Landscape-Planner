// Build the catalog and the wild records from the pages already saved, in one go, and write the review
// report (docs/catalog-build.md):
//   npm run catalog:build [-- --fetch --date YYYY-MM-DD | --date YYYY-MM-DD]
// Offline unless --fetch: it then first fetches, through the fetcher (robots.txt, each site's pace), what the
// list needs that was never asked for. The web search and GBIF's download requests aren't run (they need the
// search key, the account, and terms readings); what they'd add is named in the report.
// --date: the day the pages were read, which the writer puts on every audited record (default: the catalog's
// own, the latest `audited` in it). --fetch needs it.
//
// Writes public/plants.json, public/wild/1/, docs/catalog-review.md (what's waiting on a person), and
// catalog-src/build/ (the steps' files and log, kept, not committed). Running it twice changes nothing.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBuildArgs } from './build-args.mjs';
import { savedAuditList, toFetch } from './list.mjs';
import { lockCatalogSrc, savedFile } from './pages.mjs';
import { rereadClaims } from './reclaim.mjs';
import { reviewReport, termsUnsettled } from './report.mjs';

const opts = parseBuildArgs(process.argv.slice(2), process.env);
if (opts.error) { console.error(opts.error); process.exit(1); }
const ROOT = 'catalog-src', OUT = join(ROOT, 'build');
const ATLAS_PDF = 'https://biology.uark.edu/herbarium/AtlasVascularPlantsArkansas2013_lowerres.pdf';
const TALLAMY_XLSX = 'https://zenodo.org/records/17747343/files/oo_1478226.xlsx?download=1';
const KEW = join(ROOT, 'kew-wcvp'), GBIF = join(ROOT, 'gbif-downloads'), CLAIMS = join(ROOT, 'web-claims.json');
const path = (f) => join(OUT, f);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const writeJson = (f, data) => { const tmp = `${f}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n'); renameSync(tmp, f); };
const stop = (why) => { console.error(why); process.exit(1); };

// What the build can't make or fetch itself. Missing, it stops before writing anything: a build without the web
// claims would drop every fact they give, and one without GBIF's downloads every bloom month and GBIF county.
if (!existsSync(CLAIMS)) stop(`${CLAIMS} is missing: the web search's claims (search.mjs's output; docs/catalog-build.md). Without them the build would drop every fact they give.`);
if (!existsSync(join(KEW, 'wcvp_names.csv')) || !existsSync(join(KEW, 'wcvp_distribution.csv'))) stop(`Kew's World Checklist isn't in ${KEW}/: download wcvp.zip from sftp.kew.org/pub/data-repositories/WCVP/ and unzip it there (docs/catalog-build.md).`);
for (const d of ['bloom', 'counties']) {
  // (The download's key and DOI in <d>.json, its rows in <d>.tsv: wild.mjs needs both.)
  let key = null;
  try { key = JSON.parse(readFileSync(join(GBIF, `${d}.json`), 'utf8')); } catch { /* none */ }
  if (existsSync(join(GBIF, `${d}.tsv`)) && key?.doi) continue;
  stop(key?.key
    ? `GBIF's ${d} download isn't saved: \`node scripts/catalog/gbif-download.mjs fetch ${d}\` (no account needed) (docs/bloom-months.md).`
    : `GBIF's ${d} download is missing: request it with \`node scripts/catalog/gbif-download.mjs request ${d} catalog-src/build/combined.json\` (the account; that file is the last build's combined audit), then fetch it (docs/bloom-months.md). Without it the wild records would lose every ${d === 'bloom' ? 'bloom month' : 'GBIF county'}.`);
}

mkdirSync(OUT, { recursive: true });
// One build at a time. (The fetch steps take catalog-src/.lock themselves; the build takes it once they're done.)
const lock = path('.lock');
try { writeFileSync(lock, String(process.pid), { flag: 'wx' }); } catch { stop(`A build is already running (${lock}). If none is, delete that file and start again.`); }
process.on('exit', () => { try { if (readFileSync(lock, 'utf8') === String(process.pid)) rmSync(lock); } catch { /* gone */ } });
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(130));

const catalogBefore = readFileSync('public/plants.json', 'utf8');
const log = [];
/** Whether public/plants.json has been rewritten (a later failure says so): by its bytes, not by which step ran. */
const rewritten = () => { try { return readFileSync('public/plants.json', 'utf8') !== catalogBefore; } catch { return true; } };
const saveLog = () => writeFileSync(path('log.txt'), log.join('\n'));
/** Run a step's script, its output to the log (or to the screen as it goes, `live`); stop the build if it fails. */
function run(label, cmd, cmdArgs, { live = false } = {}) {
  const started = Date.now();
  if (live) console.log(`${label}:`); else process.stdout.write(`${label}… `);
  try {
    const out = execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', live ? 'inherit' : 'pipe', live ? 'inherit' : 'pipe'], maxBuffer: 1 << 28 }) ?? '';
    log.push(`## ${label}\n$ ${[cmd, ...cmdArgs].join(' ')}\n${live ? '(shown as it ran)\n' : out}`);
    const last = out.trim().split('\n').filter(Boolean).pop() ?? '';
    console.log(`${live ? '  done' : last.slice(0, 160)} (${Math.round((Date.now() - started) / 1000)} s)`);
    return out;
  } catch (e) {
    log.push(`## ${label} (failed)\n$ ${[cmd, ...cmdArgs].join(' ')}\n${e.stdout ?? ''}${e.stderr ?? ''}`);
    saveLog();
    console.log('failed');
    if (!live) console.error(String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-12).join('\n'));
    console.error(`(the whole log: ${path('log.txt')})`);
    if (rewritten()) console.error('public/plants.json was already rewritten, and the wild records and the report may not match it: see git diff, fix the step, and build again.');
    process.exit(1);
  }
}
const node = (label, script, a, o) => run(label, process.execPath, [join('scripts/catalog', script), ...a], o);
const viteNode = (label, script, a) => run(label, process.execPath, ['node_modules/vite-node/vite-node.mjs', join('scripts/catalog', script), '--', ...a]);
/** Fetch a list of pages (fetch.mjs: robots.txt, each site's pace, refusals), showing its progress. */
function fetchList(label, items) {
  if (!items.length) return 0;
  const f = path(`fetch-${label.replace(/\W+/g, '-')}.json`);
  writeJson(f, items);
  node(`${label} (${items.length} pages)`, 'fetch.mjs', [f], { live: true });
  return items.length;
}

const catalog = JSON.parse(catalogBefore);
const date = opts.date ?? catalog.plants.map((p) => p.audited).filter(Boolean).sort().pop() ?? new Date().toISOString().slice(0, 10);

// 0. Fetch what the list needs (--fetch): rounds, since a search leads to profiles, and a profile can change a
// pick. It stops when nothing new is asked for (a page that failed is asked again next build).
if (opts.fetch) {
  const files = [['arkatlas', ATLAS_PDF], ['tallamy', TALLAMY_XLSX]].filter(([s, u]) => !savedFile(s, u, ROOT)).map(([source, url]) => ({ source, url }));
  const tried = new Set();
  for (let round = 1; round <= 4; round++) {
    const need = toFetch(savedAuditList(catalog, ROOT), ROOT);
    const items = [...(round === 1 ? files : []), ...[...need.ncsu, ...need.named].map((url) => ({ source: 'ncsu', url })), ...[...need.searches, ...need.profiles].map((url) => ({ source: 'usda', url }))]
      .filter((i) => !tried.has(i.url));
    if (!items.length) break;
    if (round === 4) { console.log(`pages: still ${items.length} to ask for after 3 rounds; the next --fetch asks for them`); break; }
    items.forEach((i) => tried.add(i.url));
    fetchList(`pages, round ${round}`, items);
  }
}
const atlasPdf = savedFile('arkatlas', ATLAS_PDF, ROOT);
if (!atlasPdf) stop(`The Arkansas atlas isn't saved: run with --fetch, or fetch ${ATLAS_PDF} (source arkatlas) with fetch.mjs.`);

// 1. The plant list.
const list = savedAuditList(catalog, ROOT);
writeJson(path('list.json'), list);
console.log(`list: ${list.length} plants, ${list.filter((s) => s.ncsu).length} with an NC State page, ${list.filter((s) => s.usda).length} with a USDA symbol`);

// 2. The Arkansas atlas as text, and the caterpillar host genera, from their newest saved files, each build.
const atlasText = path('atlas.txt');
run('atlas text', 'pdftotext', ['-q', '-layout', atlasPdf, atlasText]);
const xlsx = savedFile('tallamy', TALLAMY_XLSX, ROOT);
if (xlsx) {
  copyFileSync(xlsx, path('tallamy.xlsx')); // (the reader goes by the file's extension)
  run('caterpillar hosts', 'python3', ['-I', 'scripts/catalog/tallamy.py', path('tallamy.xlsx'), join(ROOT, 'tallamy', 'genera.json')]);
} else console.log(`caterpillar hosts: the Tallamy spreadsheet isn't saved (--fetch gets it)${existsSync(join(ROOT, 'tallamy', 'genera.json')) ? '; the genera made from it before are used' : '; none read'}`);

// 3. The web claims, read again with today's reader.
const searched = readJson(CLAIMS);
const web = rereadClaims(searched, list, catalog, ROOT);
writeFileSync(path('web.json'), JSON.stringify(web.claims));
console.log(`web claims: ${web.pages} pages read again${web.missing ? `, ${web.missing} no longer saved` : ''}`);

// 4. Combine; with --fetch, the county records and GBIF names the combined audit leads to (before anything is written).
node('combine', 'sample.mjs', [path('list.json'), atlasText, path('combined.json'), path('web.json')]);
if (opts.fetch) {
  node('USDA county records', 'usda-fetch.mjs', [path('combined.json')], { live: true });
  node('GBIF names', 'gbif-fetch.mjs', [path('combined.json')], { live: true });
}

// 5. Write the catalog, then where each plant grows wild and its status by state. (catalog-src/ is the build's
// alone from here: no fetch or search may change it under the steps.)
lockCatalogSrc(ROOT);
viteNode('write', 'write-cli.ts', [path('combined.json'), '--date', date, '--review', path('review.json')]);
if (!existsSync(join(ROOT, 'counties.json'))) node('counties', 'counties.mjs', []);
const atlasCounties = join(ROOT, 'arkatlas', 'counties.json');
if (!existsSync(atlasCounties) || statSync(atlasCounties).mtimeMs < statSync(atlasPdf).mtimeMs) {
  run('atlas counties', 'python3', ['-I', 'scripts/catalog/atlas_counties.py', atlasPdf, join(ROOT, 'counties.json'), atlasCounties]);
}
node('USDA counties', 'usda-counties.mjs', [path('combined.json')]);
node('Kew native status', 'wcvp.mjs', [path('combined.json')]);
node('wild records', 'wild.mjs', [path('combined.json')]);

// 6. The catalog's own checks, then the report.
let checkOut;
try { checkOut = execFileSync(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/catalog/check.ts'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) {
  log.push(`## check (errors)\n${e.stdout ?? ''}${e.stderr ?? ''}`);
  saveLog();
  stop(`catalog:check found errors in the catalog as written (no report written):\n${e.stdout ?? e.message}\npublic/plants.json was rewritten: see git diff.`);
}
log.push(`## check\n${checkOut}`);
const after = JSON.parse(readFileSync('public/plants.json', 'utf8'));
const maybe = (f, empty) => (existsSync(join(ROOT, f)) ? readJson(join(ROOT, f)) : empty);
const report = reviewReport({
  catalog: after,
  date,
  list,
  combined: readJson(path('combined.json')),
  review: readJson(path('review.json')),
  searched,
  wcvp: maybe('wcvp-review.json', null),
  native: maybe('native-review.json', []),
  bloom: maybe('bloom-review.json', []),
  warnings: checkOut.split('\n').filter((l) => l.startsWith('  ')).map((l) => l.trim()),
  unfetched: toFetch(list, ROOT),
  termsUnsettled: termsUnsettled(join(ROOT, 'terms-review'), readJson('scripts/catalog/site-terms.json')),
});
writeFileSync('docs/catalog-review.md', report.markdown);
saveLog();

// What changed, for the person running it.
const before = new Map(catalog.plants.map((p) => [p.id, JSON.stringify(p)]));
const changed = after.plants.filter((p) => before.get(p.id) !== JSON.stringify(p)).map((p) => p.id);
const datedOnly = changed.filter((id) => { const a = after.plants.find((p) => p.id === id), b = JSON.parse(before.get(id) ?? '{}'); return JSON.stringify({ ...a, audited: null }) === JSON.stringify({ ...b, audited: null }); });
if (datedOnly.length) console.log(`(${datedOnly.length} of the changed records changed only their audited date, to ${date}: the writer dates every audited record by --date)`);
console.log(`\n${catalogBefore === readFileSync('public/plants.json', 'utf8') ? 'public/plants.json unchanged' : `public/plants.json: ${changed.length} records changed${changed.length ? ` (${changed.slice(0, 12).join(', ')}${changed.length > 12 ? '…' : ''})` : ''}`}`);
console.log(`docs/catalog-review.md: ${report.summary}`);
console.log(`(each step's output: ${path('log.txt')}; git diff shows the rest)`);
