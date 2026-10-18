// Fetch pages for the catalog audit, politely (docs/catalog-sources.md):
//   node scripts/catalog/fetch.mjs <list.json> [--refresh]
// <list.json>: [{ "source": "ncsu", "url": "https://…", "pace": 5 }, …]
// Each page is saved once in catalog-src/<source>/ (not committed), beside a
// .meta.json saying when and how it was fetched; redirects are recorded, not followed. robots.txt is read for every
// host (and its parents, for a whole-host block of a Claude agent), and kept
// in catalog-src/robots/. A host that refuses us (403, 429, 503 or a bot
// challenge) is left alone for the rest of the run.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { USER_AGENT, allowedBy, blocksUsEverywhere, cacheName, crawlDelay, paceFor, parentHosts, robotsFromResponse } from './fetch-lib.mjs';

const ROOT = 'catalog-src';
const today = new Date().toISOString().slice(0, 10);
const [listPath, ...flags] = process.argv.slice(2);
if (!listPath) { console.error('usage: node scripts/catalog/fetch.mjs <list.json> [--refresh]'); process.exit(1); }
const refresh = flags.includes('--refresh');
const list = JSON.parse(readFileSync(listPath, 'utf8'));

/** One request with curl (it goes through this machine's proxy setup). */
function get(url) {
  const tmp = join(ROOT, '.tmp');
  mkdirSync(tmp, { recursive: true });
  const body = join(tmp, 'body'), head = join(tmp, 'head');
  let status = 0;
  try {
    status = Number(execFileSync('curl', ['-sS', '--max-time', '60', '-A', USER_AGENT,
      '-D', head, '-o', body, '-w', '%{http_code}', url], { encoding: 'utf8' }));
  } catch { return { status: 0, type: '', body: Buffer.alloc(0) }; }
  const headers = existsSync(head) ? readFileSync(head, 'utf8') : '';
  const type = /^content-type:\s*(.+)$/im.exec(headers)?.[1].trim() ?? '';
  const location = /^location:\s*(.+)$/im.exec(headers)?.[1].trim() ?? '';
  return { status, type, location, body: existsSync(body) ? readFileSync(body) : Buffer.alloc(0) };
}
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

const robots = new Map(); // host → { kind, groups, why }
const lastHit = new Map(); // host → ms
const refused = new Map(); // host → why
async function politely(host, pace) {
  const wait = (lastHit.get(host) ?? 0) + pace * 1000 - Date.now();
  if (wait > 0) await sleep(wait / 1000);
  lastHit.set(host, Date.now());
}
async function robotsFor(host) {
  if (robots.has(host)) return robots.get(host);
  await politely(host, 2);
  const r = get(`https://${host}/robots.txt`);
  const text = r.body.toString('utf8');
  const parsed = robotsFromResponse(r.status, r.type, text);
  mkdirSync(join(ROOT, 'robots'), { recursive: true });
  writeFileSync(join(ROOT, 'robots', `${host}-${today}.txt`), `# ${r.status} ${r.type}\n${text}`);
  robots.set(host, parsed);
  return parsed;
}

let saved = 0, cached = 0, skipped = 0;
for (const item of list) {
  const u = new URL(item.url);
  const host = u.hostname;
  const dir = join(ROOT, item.source);
  const file = join(dir, cacheName(item.url));
  if (!refresh && existsSync(file + '.meta.json')) { cached++; continue; }
  if (refused.has(host)) { skipped++; continue; }
  const rb = await robotsFor(host);
  let why = rb.kind === 'closed' ? rb.why : !allowedBy(rb.groups, u.pathname + u.search) ? 'robots.txt disallows it' : '';
  if (!why) for (const p of parentHosts(host)) {
    const pr = await robotsFor(p);
    if (pr.kind === 'rules' && blocksUsEverywhere(pr.groups)) { why = `${p} blocks Claude agents`; break; }
  }
  if (why) {
    console.log(`skip ${item.url}: ${why}`);
    if (why !== 'robots.txt disallows it') refused.set(host, why); // (a disallowed path closes only itself)
    skipped++; continue;
  }
  await politely(host, paceFor(item.pace, crawlDelay(rb.groups)));
  const r = get(item.url);
  const challenge = /cf-chl|just a moment|are you human|incapsula/i.test(r.body.subarray(0, 4000).toString('utf8'));
  if (r.status === 403 || r.status === 429 || r.status === 503 || challenge) {
    const w = `refused (${r.status}${challenge ? ', challenge page' : ''})`;
    console.log(`stop ${host}: ${w}`); refused.set(host, w); skipped++; continue;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, r.body);
  // (Redirects aren't followed: the new address gets its own robots.txt check when it's listed.)
  writeFileSync(file + '.meta.json', JSON.stringify({ url: item.url, status: r.status, type: r.type, location: r.location || undefined, fetched: today, agent: USER_AGENT }, null, 1));
  saved++;
  console.log(`${r.status} ${item.url}${r.location ? ` → ${r.location}` : ''}`);
}
console.log(`${saved} fetched, ${cached} already here, ${skipped} skipped.`);
if (refused.size) for (const [h, w] of refused) console.log(`  ${h}: ${w}`);
