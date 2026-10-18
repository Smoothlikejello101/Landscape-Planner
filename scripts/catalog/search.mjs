// Search the web for each plant, fetch the pages the search finds (by the
// fetcher's rules: robots.txt, pace, refusals), and read their spec lines as
// claims (docs/catalog-sources.md, "Searching the web"):
//   node scripts/catalog/search.mjs <sample.json> <claims-out.json> [--max N] [--wait MINUTES] [--dry]
// <sample.json>: [{ id, species }, …] (names come from public/plants.json).
// --max: pages per plant (default 10). --dry: search only, and say how many.
// --wait: how long to wait for terms reviews before reading (default 0:
//   sites not yet reviewed are left out of this run).
//
// Terms are read by a person or an agent, never decided by pattern: a site
// is read only when scripts/catalog/site-terms.json, our record of those
// readings, says its terms allow it. For each site not in it yet, this run
// fetches its home page and terms pages and writes a review packet to
// catalog-src/terms-review/<site>.txt (the passages that matter, with a
// pattern's guess as a hint); a reviewer's verdict, written to
// catalog-src/terms-verdicts/<site>.json, is checked and added to the record.
//
// Brave's terms: search results may not be stored. They stay in this
// process's memory: their URLs go to the fetcher, and what's kept is the
// pages we fetched ourselves, the facts read from them (each citing its
// page), and the record of whose terms we've read. The log has counts only.
// The key is read from BRAVE_API_KEY or ~/.config/fullgrown/brave-key, never
// logged, and never passed on a command line.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { cacheName, fetchSession, fileStore, runFetch, siteOf } from './fetch-lib.mjs';
import { get } from './net.mjs';
import { lockCatalogSrc, savedMeta, savedPage } from './pages.mjs';
import { TERMS_GUESSES, headline, looksLikeTerms, mentionsTerms, plainText, siteKind, termsKey, termsLinks, termsPassages, termsVerdict, webClaims } from './web.mjs';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const [samplePath, outPath] = args.filter((a, i) => !a.startsWith('--') && !['--max', '--wait'].includes(args[i - 1]));
const max = Number(flag('--max')) || 10;
const waitMinutes = Number(flag('--wait')) || 0;
const dry = args.includes('--dry');
if (!samplePath || !outPath) { console.error('usage: node scripts/catalog/search.mjs <sample.json> <claims-out.json> [--max N] [--wait MINUTES] [--dry]'); process.exit(1); }

const keyFile = join(homedir(), '.config', 'fullgrown', 'brave-key');
const key = (process.env.BRAVE_API_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, 'utf8') : '')).trim();
if (!key) { console.error(`No search key: set BRAVE_API_KEY or put it in ${keyFile}`); process.exit(1); }
lockCatalogSrc(); // (one run at a time: pace, robots.txt and the files in catalog-src/ are this process's alone)

const REGISTRY = 'scripts/catalog/site-terms.json';
const REVIEW_DIR = join('catalog-src', 'terms-review'), VERDICT_DIR = join('catalog-src', 'terms-verdicts');
const writeJsonAtomic = (path, data) => { const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n'); renameSync(tmp, path); };
const keyOf = (u) => termsKey(new URL(u).hostname);
const fileOf = (k) => k.replace(/[^a-z0-9.-]/gi, '_');

/** One Brave web search: the result URLs, in order. (The key goes to curl on stdin.) */
function search(q) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20&country=us&safesearch=strict`;
  const config = `header = "X-Subscription-Token: ${key}"\nheader = "Accept: application/json"\n`;
  const out = execFileSync('curl', ['-q', '-sS', '--proto', '=https', '--max-time', '30', '--config', '-', '--', url], { input: config, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const d = JSON.parse(out);
  if (d.type === 'ErrorResponse' || d.error) throw new Error(`search failed: ${d.error?.code ?? 'error'}`);
  return (d.web?.results ?? []).map((r) => r.url).filter((u) => typeof u === 'string' && u.startsWith('https://'));
}
const pause = (s) => new Promise((r) => setTimeout(r, s * 1000));

const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8'));
const byId = new Map(catalog.plants.map((p) => [p.id, p]));
const sample = JSON.parse(readFileSync(samplePath, 'utf8'));

// 1. Search (in memory only).
const picks = new Map(); // plant id → { plant, urls }
for (const s of sample) {
  const rec = byId.get(s.id) ?? {};
  const cultivar = (/'([^']+)'/.exec(rec.botanical ?? '') ?? /'([^']+)'/.exec(rec.common ?? ''))?.[1] ?? null;
  const name = cultivar ? `"${cultivar}" ${s.species}` : rec.botanical && rec.botanical !== s.species ? `"${rec.common}" ${s.species}` : `"${s.species}"`;
  const urls = [];
  for (const q of [`${name} plant`, `${name} hardiness zone height spread sun`]) {
    try { urls.push(...search(q)); } catch (e) { console.error(`${s.id}: ${e.message}`); }
    await pause(1.1); // (the plan's limit: one query a second)
  }
  const keys = new Set(), chosen = [];
  for (const u of urls) {
    let k;
    try { k = keyOf(u); } catch { continue; } // (a malformed result: skipped, never printed)
    if (siteKind(u) === 'skip' || keys.has(k)) continue; // (closed, ask-first, crowd-sourced, archives, read another way; one page a site)
    keys.add(k); chosen.push(u);
    if (chosen.length >= max) break;
  }
  picks.set(s.id, { plant: { species: s.species, cultivar, common: rec.common ?? '' }, urls: chosen });
  console.log(`${s.id}: ${urls.length} results, ${chosen.length} to read`);
}
if (dry) process.exit(0);

const today = new Date().toISOString().slice(0, 10);
const session = fetchSession(); // (one robots.txt read and one pace per site, across every pass below)
const tallies = {};
const tally = (line) => { const k = /^(\d{3}|stop|skip|fail\w*)/.exec(line)?.[1] ?? 'other'; tallies[k] = (tallies[k] ?? 0) + 1; };
const fetched = new Set(); // (every URL this run asked for: what it leaves behind with no page is removed at the end)
const fetchList = (list) => { for (const x of list) fetched.add(x.url); return runFetch(list, { get, store: fileStore('catalog-src', today), today, session, sleep: pause, now: () => Date.now(), log: tally }); };
/**
 * Fetch URLs, following redirects within the same site (up to 3), each
 * target fetched by the same rules. Returns url → the URL whose page
 * answered it (or null).
 */
async function fetchAll(urls) {
  const final = new Map(urls.map((u) => [u, u]));
  let round = [...new Set(urls)];
  for (let hop = 0; round.length && hop <= 3; hop++) {
    await fetchList(round.map((url) => ({ source: 'web', url })));
    const next = [];
    for (const [from, at] of final) {
      if (!at || !round.includes(at)) continue;
      const m = savedMeta('web', at);
      if (!m || m.status < 300 || m.status >= 400 || !m.location) { if (!savedPage('web', at)) final.set(from, null); continue; }
      let to;
      try { to = new URL(m.location, at); } catch { final.set(from, null); continue; }
      if (to.protocol !== 'https:' || siteOf(to.hostname) !== siteOf(new URL(at).hostname) || hop === 3) { final.set(from, null); continue; }
      to.hash = '';
      final.set(from, to.href); next.push(to.href);
    }
    round = [...new Set(next)];
  }
  return final;
}
const htmlOf = (u) => { const p = u && savedPage('web', u); return p && /html/i.test(p.type) ? p.text : null; };

// 2. Terms: packets for each site not yet reviewed.
const registry = existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf8')) : {};
const pending = new Map(); // key → home URL
for (const { urls } of picks.values()) for (const u of urls) { const k = keyOf(u); if (!registry[k] && !pending.has(k)) pending.set(k, `https://${new URL(u).hostname}/`); }
mkdirSync(REVIEW_DIR, { recursive: true }); mkdirSync(VERDICT_DIR, { recursive: true });
// A subdomain's owner usually keeps its terms on the main site too (explorer.natureserve.org, natureserve.org): both are read.
const rootOf = (home) => { const h = new URL(home).hostname, site = siteOf(h); return termsKey(h) === site && h !== site && h !== `www.${site}` ? `https://${site}/` : null; };
const homes = await fetchAll([...pending.values()].flatMap((home) => [home, rootOf(home)]).filter(Boolean));
const linked = new Map();
for (const [k, home] of pending) {
  const at = homes.get(home), h = htmlOf(at);
  const root = rootOf(home), rootAt = root && homes.get(root), rh = rootAt && htmlOf(rootAt);
  const links = [...new Set([...(h ? termsLinks(h, at) : []), ...(rh ? termsLinks(rh, rootAt) : [])])].slice(0, 6);
  linked.set(k, { home: at, html: h, root: rootAt, rootHtml: rh, links });
}
const found = await fetchAll([...linked.values()].flatMap((r) => r.links));
for (const guess of TERMS_GUESSES) {
  const want = [...linked].filter(([, r]) => r.html && !r.links.length && !r.guessed).map(([k, r]) => [k, new URL(guess, r.home).href]);
  if (!want.length) break;
  const got = await fetchAll(want.map(([, u]) => u));
  for (const [k, u] of want) { const at = got.get(u), r = linked.get(k); if (at && at !== r.home && looksLikeTerms(htmlOf(at) ?? '')) r.guessed = at; }
}
for (const [k, r] of linked) {
  const pages = [...r.links.map((u) => ({ url: u, at: found.get(u) })), ...(r.guessed ? [{ url: r.guessed, at: r.guessed, guessed: true }] : [])];
  const lines = [`SITE ${k}`, `home: ${r.home ?? '(not fetched)'}`, `home page mentions terms of use/service: ${r.html ? (mentionsTerms(r.html) ? 'yes' : 'no') : '?'}`];
  if (r.root !== undefined && rootOf(pending.get(k))) lines.push(`main site's home: ${r.root ?? '(not fetched)'}`, `main site's home mentions terms of use/service: ${r.rootHtml ? (mentionsTerms(r.rootHtml) ? 'yes' : 'no') : '? (not fetched: then this site is unread)'}`);
  lines.push('');
  if (!r.html) lines.push('The home page could not be fetched: leave this site unread (verdict "unread").');
  // The end of each home page, where footers link their terms: a reviewer can see whether terms are named but not linked in a way we could follow.
  else lines.push("home page's last part (its footer):", plainText(r.html).slice(-1500), '');
  if (r.rootHtml) lines.push("main site's home page, last part:", plainText(r.rootHtml).slice(-1500), '');
  for (const p of pages) {
    const html = htmlOf(p.at);
    lines.push(`=== ${p.guessed ? 'GUESSED ' : ''}PAGE ${p.url}${p.at && p.at !== p.url ? ` → ${p.at}` : ''}`);
    if (!html) { lines.push('(could not be fetched, or not a web page)', ''); continue; }
    const text = plainText(html);
    lines.push(`title: ${headline(html)}`, `length: ${text.length} characters`, `pattern hint: ${termsVerdict(html).verdict}`, 'opening:', text.slice(0, 1200), 'passages:');
    for (const ps of termsPassages(html)) lines.push(`  … ${ps} …`);
    lines.push('');
  }
  if (!pages.length && r.html) lines.push('No terms page linked from the home page, and none at the usual addresses.');
  writeFileSync(join(REVIEW_DIR, `${fileOf(k)}.txt`), lines.join('\n'));
}
if (pending.size) console.log(`terms: ${pending.size} sites to review (packets in ${REVIEW_DIR}/)`);

/** Verdicts reviewers have written, checked and added to the record. */
const VERDICTS = new Set(['open', 'none found', 'bots', 'use', 'unread']);
function takeVerdicts() {
  for (const f of readdirSync(VERDICT_DIR)) {
    if (!f.endsWith('.json')) continue;
    let v;
    try { v = JSON.parse(readFileSync(join(VERDICT_DIR, f), 'utf8')); } catch { continue; } // (still being written)
    if (!v || !pending.has(v.site) || !VERDICTS.has(v.verdict) || typeof v.note !== 'string') continue;
    rmSync(join(VERDICT_DIR, f));
    if (v.verdict === 'unread') { pending.delete(v.site); continue; } // (tried again next run)
    registry[v.site] = { verdict: v.verdict, read: today, by: v.by ?? 'review', pages: Array.isArray(v.pages) ? v.pages : [], note: v.note.slice(0, 400) };
    pending.delete(v.site);
  }
  writeJsonAtomic(REGISTRY, Object.fromEntries(Object.entries(registry).sort(([a], [b]) => a.localeCompare(b))));
}
const until = Date.now() + waitMinutes * 60000;
takeVerdicts();
while (pending.size && Date.now() < until) { await pause(20); takeVerdicts(); }
if (pending.size) console.log(`terms: ${pending.size} sites not reviewed yet, left out of this run`);

// 3. Fetch pages from sites whose terms allow it, taking turns between plants so no site is asked twice in a row.
const usable = (u) => ['open', 'none found'].includes(registry[keyOf(u)]?.verdict);
const closed = {};
for (const p of picks.values()) {
  for (const u of p.urls) if (!usable(u)) { const v = registry[keyOf(u)]?.verdict ?? 'not reviewed'; closed[v] = (closed[v] ?? 0) + 1; }
  p.urls = p.urls.filter(usable);
}
console.log(`terms: ${Object.entries(closed).map(([v, n]) => `${n} pages left out (${v})`).join(', ') || 'nothing left out'}`);
const lists = [...picks.values()].map((p) => p.urls);
const order = [];
for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) order.push(l[i]);
const pages = await fetchAll(order);
console.log(`${[...pages.values()].filter(Boolean).length} of ${order.length} pages read. Requests: ${JSON.stringify(tallies)}`);

// 4. Read: the facts each page states, as claims citing it.
const out = {};
for (const [id, { plant, urls }] of picks) {
  out[id] = [];
  for (const url of urls) {
    const at = pages.get(url);
    const html = htmlOf(at);
    if (html) out[id].push(...webClaims(at, html, plant));
  }
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`claims for ${Object.keys(out).length} plants → ${outPath}`);

// What this run asked for and got no page of its own for (not found, redirected elsewhere) isn't kept.
for (const u of fetched) {
  if (savedPage('web', u)) continue;
  const m = savedMeta('web', u);
  if (m?.fetched !== today) continue;
  rmSync(join('catalog-src', 'web', today, `${cacheName(u)}.meta.json`), { force: true });
}
