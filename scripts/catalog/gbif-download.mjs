// GBIF SQL downloads (gbif.mjs DOWNLOADS): counts of US records for the catalog's species, built on GBIF's
// side, each with its own DOI to cite (docs/bloom-months.md). Into catalog-src/gbif-downloads/:
//   node scripts/catalog/gbif-download.mjs request <bloom|counties> <combined.json>   (asks GBIF to build it)
//   node scripts/catalog/gbif-download.mjs fetch <bloom|counties>                     (once it's built)
// `request` needs the FullGrown GBIF account: ~/.config/fullgrown/gbif holds a curl config line
// `user = "name:password"` (never in the repo, never on a command line). `fetch` needs no account: a built
// download is public. Run gbif-fetch.mjs first (the species' GBIF names).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { USER_AGENT } from './fetch-lib.mjs';
import { savedPage } from './pages.mjs';
import { DOWNLOADS, matchedTaxon, matchUrl } from './gbif.mjs';
import { bloomSpecies } from './bloom.mjs';

const API = 'https://api.gbif.org/v1/occurrence/download';
const DIR = 'catalog-src/gbif-downloads';
const [cmd, name, auditPath] = process.argv.slice(2);
if (!['request', 'fetch'].includes(cmd) || !DOWNLOADS[name] || (cmd === 'request' && !auditPath)) {
  console.error('usage: node scripts/catalog/gbif-download.mjs request <bloom|counties> <combined.json> | fetch <bloom|counties>');
  process.exit(1);
}
mkdirSync(DIR, { recursive: true });
/** curl with its options from stdin (a password never shows in the process list): its stdout. */
const curl = (config, args = []) => execFileSync('curl', ['-q', '-sS', '--proto', '=https', '--max-time', '300', '--config', '-', ...args],
  { input: `user-agent = "${USER_AGENT}"\n${config}`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const meta = join(DIR, `${name}.json`);

if (cmd === 'request') {
  const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8'));
  const json = (u) => { try { return JSON.parse(savedPage('gbif', u)?.text ?? 'null'); } catch { return null; } };
  const species = bloomSpecies(catalog, JSON.parse(readFileSync(auditPath, 'utf8')));
  const missing = species.filter((s) => !savedPage('gbif', matchUrl(s.binomial)));
  if (missing.length) { console.error(`${missing.length} species' GBIF names not fetched yet (gbif-fetch.mjs): ${missing.slice(0, 5).map((s) => s.binomial).join(', ')}…`); process.exit(1); }
  const keys = [...new Set(species.map((s) => matchedTaxon(json(matchUrl(s.binomial)))?.key).filter(Boolean))].sort((a, b) => a - b);
  const account = readFileSync(join(homedir(), '.config', 'fullgrown', 'gbif'), 'utf8');
  const body = JSON.stringify({ sendNotification: true, notificationAddresses: ['hello@fullgrown.garden'], format: 'SQL_TSV_ZIP', sql: DOWNLOADS[name](keys) });
  const tmp = join(DIR, `${name}.request.tmp`);
  writeFileSync(tmp, body);
  try {
    const out = curl(`${account}\nheader = "Content-Type: application/json"\ndata = "@${tmp}"\nurl = "${API}/request"\nwrite-out = "\\n%{http_code}"`).trim().split('\n');
    const status = Number(out.pop()), answer = out.join('\n');
    if (status !== 201) { console.error(`GBIF said ${status}: ${answer.slice(0, 300)}`); process.exit(1); }
    writeFileSync(meta, JSON.stringify({ key: answer.trim(), requested: new Date().toISOString(), species: keys.length }, null, 1) + '\n');
    console.log(`requested ${name}: ${answer.trim()} (${keys.length} species); fetch it once GBIF has built it (an email comes to hello@)`);
  } finally { rmSync(tmp, { force: true }); }
} else {
  if (!existsSync(meta)) { console.error(`no ${name} download requested (${meta})`); process.exit(1); }
  const m = JSON.parse(readFileSync(meta, 'utf8'));
  const info = JSON.parse(curl(`url = "${API}/${m.key}"`));
  if (info.status !== 'SUCCEEDED') { console.log(`${name} (${m.key}): ${info.status}`); process.exit(info.status === 'FAILED' || info.status === 'CANCELLED' ? 1 : 0); }
  const zip = join(DIR, `${name}.zip`), tsv = join(DIR, `${name}.tsv`);
  curl(`url = "${info.downloadLink}"\nlocation\noutput = "${zip}"`);
  const text = execFileSync('unzip', ['-p', zip], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  writeFileSync(`${tsv}.tmp`, text); renameSync(`${tsv}.tmp`, tsv); rmSync(zip, { force: true });
  writeFileSync(meta, JSON.stringify({ ...m, doi: info.doi, created: info.created, rows: info.totalRecords }, null, 1) + '\n');
  console.log(`${name}: ${info.totalRecords} rows, doi:${info.doi} → ${tsv}`);
}
