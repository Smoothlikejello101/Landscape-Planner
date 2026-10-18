// Search the web for each plant, fetch the pages the search finds (by the
// fetcher's rules: robots.txt, pace, refusals), and read their spec lines as
// claims (docs/catalog-sources.md, "Searching the web"):
//   node scripts/catalog/search.mjs <sample.json> <claims-out.json> [--max N] [--dry]
// <sample.json>: [{ id, species }, …] (names come from public/plants.json).
// --max: pages per plant (default 10). --dry: search and list, fetch nothing.
//
// Brave's terms: search results may not be stored. They stay in this
// process's memory: their URLs go to the fetcher, and what's kept is the
// pages we fetched ourselves and the facts read from them, each citing its
// page. The key is read from BRAVE_API_KEY or ~/.config/fullgrown/brave-key,
// never logged, and never passed on a command line.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fetchSession, fileStore, runFetch, siteOf } from './fetch-lib.mjs';
import { get } from './net.mjs';
import { savedMeta, savedPage } from './pages.mjs';
import { TERMS_GUESSES, siteKind, termsLinks, termsVerdict, webClaims } from './web.mjs';

const args = process.argv.slice(2);
const [samplePath, outPath] = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const max = Number(args[args.indexOf('--max') + 1]) || 10;
const dry = args.includes('--dry');
if (!samplePath || !outPath) { console.error('usage: node scripts/catalog/search.mjs <sample.json> <claims-out.json> [--max N] [--dry]'); process.exit(1); }

const keyFile = join(homedir(), '.config', 'fullgrown', 'brave-key');
const key = (process.env.BRAVE_API_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, 'utf8') : '')).trim();
if (!key) { console.error(`No search key: set BRAVE_API_KEY or put it in ${keyFile}`); process.exit(1); }

/** Pages read another way already (their own extractors): a search hit there would count them twice. */
const OWN_PIPELINE = new Set(['plants.ces.ncsu.edu', 'www.minnesotawildflowers.info', 'minnesotawildflowers.info', 'plants.usda.gov', 'plants.sc.egov.usda.gov']);

/** One Brave web search: the result URLs, in order. (The key goes to curl on stdin.) */
function search(q) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20&country=us&safesearch=strict`;
  const config = `header = "X-Subscription-Token: ${key}"\nheader = "Accept: application/json"\n`;
  const out = execFileSync('curl', ['-q', '-sS', '--proto', '=https', '--max-time', '30', '--config', '-', '--', url], { input: config, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const d = JSON.parse(out);
  if (d.type === 'ErrorResponse' || d.error) throw new Error(`search failed: ${d.error?.code ?? 'error'} ${d.error?.detail ?? ''}`.trim());
  return (d.web?.results ?? []).map((r) => r.url).filter((u) => typeof u === 'string' && u.startsWith('https://'));
}
const pause = (s) => new Promise((r) => setTimeout(r, s * 1000));

const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8'));
const byId = new Map(catalog.plants.map((p) => [p.id, p]));
const sample = JSON.parse(readFileSync(samplePath, 'utf8'));

// 1. Search (in memory only).
const picks = new Map(); // plant id → URLs to read
for (const s of sample) {
  const rec = byId.get(s.id) ?? {};
  const cultivar = (/'([^']+)'/.exec(rec.botanical ?? '') ?? /'([^']+)'/.exec(rec.common ?? ''))?.[1] ?? null;
  const name = cultivar ? `"${cultivar}" ${s.species}` : rec.botanical && rec.botanical !== s.species ? `"${rec.common}" ${s.species}` : `"${s.species}"`;
  const urls = [];
  for (const q of [`${name} plant`, `${name} hardiness zone height spread sun`]) {
    try { urls.push(...search(q)); } catch (e) { console.error(`${s.id}: ${e.message}`); }
    await pause(1.1); // (the plan's limit: one query a second)
  }
  const sites = new Set(), chosen = [];
  for (const u of urls) {
    const host = new URL(u).hostname.toLowerCase();
    if (OWN_PIPELINE.has(host) || siteKind(u) === 'skip') continue;
    const site = siteOf(host);
    if (sites.has(site)) continue; // (one page a site: a site is one voice)
    sites.add(site); chosen.push(u);
    if (chosen.length >= max) break;
  }
  picks.set(s.id, { plant: { species: s.species, cultivar }, urls: chosen });
  console.log(`${s.id}: ${urls.length} results, ${chosen.length} to read`);
}
if (dry) { for (const [id, p] of picks) console.log(id, p.urls.join('\n  ')); process.exit(0); }

const today = new Date().toISOString().slice(0, 10);
const session = fetchSession(); // (one robots.txt read and one pace per site, across every pass below)
const fetchList = (list) => runFetch(list, {
  get, store: fileStore('catalog-src', today), today, session,
  sleep: pause, now: () => Date.now(), log: (l) => console.log(l),
});
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
      if (!round.includes(at)) continue;
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

// 2. Each new site's terms, read as docs/catalog-sources.md says: its home
// page, then the terms pages it links to. The reading is kept, with the
// sentence that decided it, in catalog-src/site-terms.json.
const termsPath = join('catalog-src', 'site-terms.json');
const terms = existsSync(termsPath) ? JSON.parse(readFileSync(termsPath, 'utf8')) : {};
const homeOf = (u) => `https://${new URL(u).hostname}/`;
const newSites = new Map();
for (const { urls } of picks.values()) for (const u of urls) { const site = siteOf(new URL(u).hostname); if (!terms[site] && !newSites.has(site)) newSites.set(site, homeOf(u)); }
const homes = await fetchAll([...newSites.values()]);
const termsPages = new Map();
for (const [site, home] of newSites) {
  const at = homes.get(home);
  const h = at && savedPage('web', at);
  termsPages.set(site, h ? termsLinks(h.text, at) : null);
}
// Linked terms, or else the places terms usually live, tried in turn until one answers.
const found = await fetchAll([...termsPages.values()].flatMap((l) => l ?? []));
for (const [site, links] of termsPages) if (links) termsPages.set(site, links.map((u) => found.get(u)).filter(Boolean));
for (const guess of TERMS_GUESSES) {
  const want = [...termsPages].filter(([, l]) => l && !l.length).map(([site]) => [site, new URL(guess, homes.get(newSites.get(site))).href]);
  if (!want.length) break;
  const got = await fetchAll(want.map(([, u]) => u));
  for (const [site, u] of want) { const at = got.get(u); const p = at && savedPage('web', at); if (p && /html/i.test(p.type)) termsPages.set(site, [at]); }
}
for (const [site, links] of termsPages) {
  if (links == null) { terms[site] = { verdict: 'unread', because: 'home page not fetched', checked: today }; continue; }
  const read = links.map((u) => ({ u, p: savedPage('web', u) })).filter((x) => x.p && /html/i.test(x.p.type));
  if (!read.length) { terms[site] = { verdict: links.length ? 'unread' : 'none found', because: links.length ? 'terms page not fetched' : null, checked: today }; continue; }
  const verdicts = read.map((x) => ({ ...termsVerdict(x.p.text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')), url: x.u }));
  const worst = verdicts.find((v) => v.verdict === 'bots') ?? verdicts.find((v) => v.verdict === 'use') ?? verdicts[0];
  terms[site] = { verdict: worst.verdict, because: worst.because, terms: read.map((x) => x.u), checked: today };
}
writeFileSync(termsPath, JSON.stringify(terms, null, 1));
// Read only sites whose terms were read and say nothing against us, or that have none to find.
const usable = (u) => ['open', 'none found'].includes(terms[siteOf(new URL(u).hostname)]?.verdict);
const closed = {};
for (const p of picks.values()) {
  for (const u of p.urls) if (!usable(u)) { const v = terms[siteOf(new URL(u).hostname)]?.verdict ?? 'unread'; closed[v] = (closed[v] ?? 0) + 1; }
  p.urls = p.urls.filter(usable);
}
console.log(`terms: ${Object.entries(closed).map(([v, n]) => `${n} pages left out (${v})`).join(', ') || 'nothing left out'}`);

// 3. Fetch, taking turns between plants so no site is asked twice in a row.
const lists = [...picks.values()].map((p) => p.urls);
const order = [];
for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) order.push(l[i]);
const pages = await fetchAll(order);
console.log(`${[...pages.values()].filter(Boolean).length} of ${order.length} pages read.`);

// 4. Read: the facts each page states, as claims citing it.
const out = {};
for (const [id, { plant, urls }] of picks) {
  out[id] = [];
  for (const url of urls) {
    const at = pages.get(url);
    const p = at && savedPage('web', at);
    if (!p || !/html/i.test(p.type)) continue;
    out[id].push(...webClaims(at, p.text, plant));
  }
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`claims for ${Object.keys(out).length} plants → ${outPath}`);
