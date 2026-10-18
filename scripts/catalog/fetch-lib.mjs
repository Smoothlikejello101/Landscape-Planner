// The catalog audit's fetcher rules (docs/catalog-sources.md, "Before a
// source is used" and "How terms are read"): robots.txt as RFC 9309 reads it,
// applied strictly for every group that could mean us; the pace for each
// site; and the fetch loop itself, with the network, clock and files passed
// in so it can be tested.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDomain } from 'tldts';

/** What the fetcher sends: who we are, and how to reach us. */
export const USER_AGENT = 'FullGrownCatalog/1.0 (mailto:hello@fullgrown.garden)';
/** Every robots.txt group that applies to the audit (besides `*`). */
export const OUR_AGENTS = ['fullgrowncatalog', 'claudebot', 'claude-user', 'claude-searchbot', 'claude-web', 'anthropic-ai'];
/** Never faster than this, whatever a site allows (seconds). */
export const MIN_PACE = 2;
/** Each source's own pace (seconds), from docs/catalog-sources.md. */
export const SOURCE_PACE = { usda: 2, ncsu: 5, mnwild: 5, arkatlas: 5 };
/** HTTP answers that mean "stop asking this site". */
const REFUSALS = new Set([401, 403, 429, 451, 503]);
/** Signs of a bot check in place of the page asked for. On an ordinary 200 page only the unmistakable ones count. */
const CHALLENGE_STRICT = /cf-chl|_Incapsula_Resource|px-captcha|captcha-delivery\.com|<title>\s*(just a moment|attention required|access denied|are you (a )?human)/i;
const CHALLENGE_ANY = /cf-chl|just a moment\.\.\.|are you human|incapsula|px-captcha|perimeterx|datadome|captcha|<title>\s*access denied/i;
/** Whether an answer is a bot check or block page (the broad signs only where the status already refuses). */
export function isChallenge(status, text) {
  return (REFUSALS.has(status) ? CHALLENGE_ANY : CHALLENGE_STRICT).test(text.slice(0, 20000));
}

// ---------- robots.txt ----------

const UNRESERVED = /[A-Za-z0-9\-._~]/;
/**
 * A path in the one form robots.txt matching uses (RFC 9309 §2.2.2):
 * non-ASCII percent-encoded as UTF-8, escapes of unreserved characters
 * decoded, other escapes in upper case.
 */
export function normalizePath(p) {
  let out = '';
  for (const ch of String(p)) {
    const code = ch.codePointAt(0);
    out += code > 0x7e || code < 0x21 ? [...new TextEncoder().encode(ch)].map((b) => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('') : ch;
  }
  return out.replace(/%([0-9A-Fa-f]{2})/g, (_, h) => {
    const c = String.fromCharCode(parseInt(h, 16));
    return UNRESERVED.test(c) ? c : '%' + h.toUpperCase();
  });
}

/**
 * robots.txt as groups: { agents: [...product tokens, lowercase], rules: [{ allow, path }], delay }.
 * A run of user-agent lines shares a group until its first allow or disallow
 * line; other lines (sitemap, crawl-delay, unknown) don't end the run. Rules
 * before any user-agent line are ignored.
 */
export function parseRobots(text) {
  const groups = [];
  let cur = null, ruled = false;
  for (const raw of String(text ?? '').replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || ruled) { cur = { agents: [], rules: [], delay: 0 }; groups.push(cur); ruled = false; }
      // (Product tokens only; a comma or space list, though not valid, counts for each name in it.)
      for (const part of value.split(/[,\s]+/)) {
        const token = part === '*' ? '*' : (/^[A-Za-z_-]+/.exec(part)?.[0] ?? '').toLowerCase();
        if (token) cur.agents.push(token);
      }
      continue;
    }
    if (!cur) continue;
    if (key === 'allow' || key === 'disallow') {
      ruled = true;
      if (!value) continue; // ("Disallow:" alone allows everything)
      const path = value.startsWith('/') || value.startsWith('*') ? value : '/' + value;
      cur.rules.push({ allow: key === 'allow', path: normalizePath(path) });
    } else if (key === 'crawl-delay') {
      const n = parseFloat(value);
      if (Number.isFinite(n) && n > 0) cur.delay = Math.max(cur.delay, n);
    }
  }
  return groups;
}

/**
 * Whether a robots.txt pattern matches a path: a prefix match, `*` any run of
 * characters, `$` at the end anchors it. Linear in practice: one backtrack
 * point, so no pattern can stall the run.
 */
export function patternMatches(pattern, path) {
  let pat = pattern.replace(/\*+/g, '*');
  const anchored = pat.endsWith('$');
  if (anchored) pat = pat.slice(0, -1); else pat += '*';
  let p = 0, s = 0, star = -1, mark = 0;
  while (s < path.length) {
    if (p < pat.length && pat[p] !== '*' && pat[p] === path[s]) { p++; s++; }
    else if (p < pat.length && pat[p] === '*') { star = p++; mark = s; }
    else if (star >= 0) { p = star + 1; s = ++mark; }
    else return false;
  }
  while (p < pat.length && pat[p] === '*') p++;
  return p === pat.length;
}
/** One group's answer: the longest matching rule wins, allow winning a tie. */
function groupDecides(group, path, fold) {
  let best = null;
  for (const r of group.rules) {
    const rp = fold ? r.path.toLowerCase() : r.path;
    if (!patternMatches(rp, fold ? path.toLowerCase() : path)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}
/** Strict about case: many servers ignore it, so a rule blocks every spelling. */
function groupAllows(group, path) {
  return groupDecides(group, path, false) && groupDecides(group, path, true);
}
const isOurs = (a) => a === '*' || OUR_AGENTS.includes(a);
/** The groups that could mean us: `*` and any naming one of our agents. */
export function ourGroups(groups) {
  return groups.filter((g) => g.agents.some(isOurs));
}
/** Strict: allowed only if every group that could mean us allows it. */
export function allowedBy(groups, path) {
  const p = normalizePath(path || '/');
  return ourGroups(groups).every((g) => groupAllows(g, p));
}
/** The longest crawl delay among the groups that could mean us (seconds). */
export function crawlDelay(groups) {
  return Math.max(0, ...ourGroups(groups).map((g) => g.delay));
}
/** Whether a group that could mean us keeps bots off the whole host ("Disallow: /" or "/*", whatever else it allows). */
export function blocksWholeHost(groups) {
  return ourGroups(groups).some((g) => g.rules.some((r) => !r.allow && (r.path === '/' || r.path === '/*')));
}

/**
 * What a robots.txt answer means. 404 or 410: there is none (allow all). A
 * text file: its rules. Anything else (other errors, redirects, a network
 * failure, a page in its place such as a bot check): disallow everything.
 */
export function robotsFromResponse(status, contentType, body) {
  if (status === 404 || status === 410) return { kind: 'none', groups: [] };
  const page = /html|xml/i.test(contentType ?? '') || /^\s*</.test(body ?? '');
  if (status >= 200 && status < 300 && !page) return { kind: 'rules', groups: parseRobots(body ?? '') };
  return { kind: 'closed', groups: [], why: status ? `robots.txt answered ${status}${page ? ' with a page' : ''}` : 'robots.txt unreachable' };
}

// ---------- Hosts ----------

export const bare = (h) => String(h).toLowerCase().replace(/\.+$/, '');
/** The site a host belongs to (its registrable domain), for pacing and parents. */
export function siteOf(host) {
  const h = bare(host);
  return getDomain(h, { allowPrivateDomains: true }) ?? h;
}
/**
 * The other hosts whose whole-host block also closes this one ("closed to
 * bots, and so are its subdomains"): every parent down to the registrable
 * domain, each with its www. form. A host one label below its site (or the
 * site itself) also gets its www. or bare twin: extension.iastate.edu and
 * www.extension.iastate.edu are one site in practice, while a guessed
 * www.plants.ces.ncsu.edu isn't anything.
 */
export function relatedHosts(host) {
  const h = bare(host);
  const site = siteOf(h);
  const out = new Set();
  const core = h.startsWith('www.') ? h.slice(4) : h;
  if (core.split('.').length <= site.split('.').length + 1) out.add(h.startsWith('www.') ? core : `www.${h}`);
  const labels = h.split('.');
  for (let i = 1; i < labels.length; i++) {
    const p = labels.slice(i).join('.');
    if (p.length < site.length) break;
    out.add(p); out.add(`www.${p}`);
  }
  out.delete(h);
  return [...out];
}

/** Seconds to wait between requests to one site. */
export function paceFor(source, delay, itemPace) {
  return Math.max(MIN_PACE, SOURCE_PACE[source] ?? 0, itemPace ?? 0, delay ?? 0);
}
/**
 * What a request that got no HTTP answer means. Behind a proxy, curl's own
 * errors can't tell a missing host from a slow or refused one, so only a DNS
 * answer can: `none` when the name doesn't exist or has no address (nothing
 * there to block anything), `failed` otherwise (it couldn't be checked).
 * dns: 'nxdomain' | 'noaddress' | 'exists' | 'unknown' (the lookup itself failed).
 */
export function noAnswer(dns) {
  return dns === 'nxdomain' || dns === 'noaddress' ? 'none' : 'failed';
}
/** A DNS-over-HTTPS JSON answer (RFC 8484 JSON form) as noAnswer() reads it. */
export function dnsVerdict(answers) {
  if (!answers.length || answers.some((a) => !a || typeof a.Status !== 'number')) return 'unknown';
  if (answers.some((a) => a.Status === 3)) return 'nxdomain';
  if (answers.some((a) => a.Status !== 0)) return 'unknown';
  return answers.some((a) => (a.Answer ?? []).some((r) => r.type === 1 || r.type === 28 || r.type === 5)) ? 'exists' : 'noaddress';
}

/** A file name for a fetched URL: readable, and unique to the URL. */
export function cacheName(url) {
  const u = new URL(url);
  const readable = (u.hostname + u.pathname + (u.search ? '_' + u.search.slice(1) : ''))
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+$/, '').slice(0, 120);
  return `${readable || 'index'}-${createHash('sha256').update(url).digest('hex').slice(0, 10)}`;
}


// ---------- Files ----------

/** The fetcher's files under `root` (see fetch.mjs for the layout). */
export function fileStore(root, today) {
  const refusedFile = join(root, 'refused.json');
  return {
    cached(source, url) {
      const dir = join(root, source);
      if (!existsSync(dir)) return false;
      const name = cacheName(url) + '.meta.json';
      return readdirSync(dir).some((d) => {
        const f = join(dir, d, name);
        try { return existsSync(f) && JSON.parse(readFileSync(f, 'utf8')).url === url; } catch { return false; }
      });
    },
    save(source, url, page, meta) {
      const dir = join(root, source, today);
      mkdirSync(dir, { recursive: true });
      const name = cacheName(url);
      if (page != null) writeFileSync(join(dir, name), page);
      else rmSync(join(dir, name), { force: true }); // (no page: drop one saved earlier today)
      writeFileSync(join(dir, name + '.meta.json'), JSON.stringify(meta, null, 1));
    },
    saveRobots(host, status, type, body) {
      mkdirSync(join(root, 'robots'), { recursive: true });
      writeFileSync(join(root, 'robots', `${host.replace(/[^a-z0-9.-]/gi, '_')}-${today}.txt`), `# ${status} ${type}\n${body}`);
    },
    refused() {
      if (!existsSync(refusedFile)) return {};
      // (A file that doesn't read stops the run: carrying on would forget every refusal.)
      try { return JSON.parse(readFileSync(refusedFile, 'utf8')); } catch (e) { throw new Error(`${refusedFile} doesn't read as JSON (${e.message}): fix it by hand`); }
    },
    refuse(host, why) {
      const all = this.refused();
      all[host] = { why, date: today };
      mkdirSync(root, { recursive: true });
      writeFileSync(refusedFile + '.new', JSON.stringify(all, null, 1));
      renameSync(refusedFile + '.new', refusedFile);
    },
  };
}

// ---------- The loop ----------

/**
 * Fetch a list of { source, url, pace? } politely.
 * deps:
 *   get(url) → { status, type, location, body: Buffer | string, reach?, error? }
 *     (status 0: no HTTP answer; reach 'none' or 'failed', as noAnswer() says)
 *   sleep(seconds), now() → ms
 *   store: { cached(source, url) → bool, save(source, url, page, meta), saveRobots(host, status, type, body),
 *            refused() → { host: { why, date } }, refuse(host, why) }
 *   Only HTTP refusals and bot checks are remembered across runs; robots.txt is read afresh each run.
 *   today: 'YYYY-MM-DD', refresh: bool, log(line)
 * Returns { saved, cached, skipped }.
 */
export async function runFetch(list, deps) {
  const { get, sleep, now, store, today, refresh = false, log = () => {} } = deps;
  const robots = new Map(); // host → parsed
  const text = (b, n) => (Buffer.isBuffer(b) ? b.subarray(0, n ?? b.length).toString(n ? 'latin1' : 'utf8') : String(b ?? '').slice(0, n));
  const lastHit = new Map(); // site → ms
  const refused = new Map(Object.entries(store.refused()).map(([h, v]) => [h, v.why]));
  const out = { saved: 0, cached: 0, skipped: 0 };
  async function wait(site, pace) {
    const ms = (lastHit.get(site) ?? -Infinity) + pace * 1000 - now();
    if (ms > 0) await sleep(ms / 1000);
    lastHit.set(site, now());
  }
  async function robotsFor(host, pace) {
    if (robots.has(host)) return robots.get(host);
    // Redirects are followed for robots.txt only (RFC 9309: up to five), and only within the same site.
    let url = `https://${host}/robots.txt`, r;
    for (let hops = 0; ; hops++) {
      await wait(siteOf(host), pace);
      r = await get(url);
      const next = r.status >= 300 && r.status < 400 && r.location ? new URL(r.location, url) : null;
      if (!next || hops >= 5 || next.protocol !== 'https:' || siteOf(next.hostname) !== siteOf(host)) break;
      url = next.href;
    }
    const body = text(r.body);
    store.saveRobots(host, r.status, r.type, body);
    // (After a redirect the host did answer, so a missing redirect target means it couldn't be checked.)
    const parsed = r.status !== 0 ? robotsFromResponse(r.status, r.type, body)
      : r.reach === 'none' && url === `https://${host}/robots.txt` ? { kind: 'absent', groups: [], why: 'no such host' }
      : { kind: 'closed', groups: [], why: `robots.txt couldn't be read (${r.error ?? 'no answer'})` };
    robots.set(host, parsed);
    return parsed;
  }
  function refuse(host, why, remember) {
    refused.set(host, why);
    if (remember) store.refuse(host, why);
    log(`stop ${host}: ${why}`);
  }

  for (const item of list) {
    if (!Object.hasOwn(SOURCE_PACE, item.source ?? '')) { log(`skip: unknown source ${JSON.stringify(item.source)} (add it to SOURCE_PACE)`); out.skipped++; continue; }
    let u;
    try { u = new URL(item.url); } catch { log(`skip: bad URL ${item.url}`); out.skipped++; continue; }
    if (u.protocol !== 'https:' || u.username || u.password) { log(`skip ${item.url}: https only, no credentials`); out.skipped++; continue; }
    const host = bare(u.hostname) + (u.port ? ':' + u.port : '');
    const site = siteOf(u.hostname);
    if (!refresh && store.cached(item.source, u.href)) { out.cached++; continue; }
    if (refused.has(host)) { out.skipped++; continue; }
    const rb = await robotsFor(host, MIN_PACE);
    if (rb.kind !== 'none' && rb.kind !== 'rules') { refuse(host, rb.why, false); out.skipped++; continue; }
    let why = '';
    for (const other of relatedHosts(u.hostname)) {
      const pr = await robotsFor(bare(other), MIN_PACE);
      // (A host that isn't there blocks nothing; one that can't be checked, or answers with an error or a bot check, closes this one.)
      if (pr.kind === 'closed') { why = `${other}: ${pr.why}`; break; }
      if (pr.kind === 'rules' && blocksWholeHost(pr.groups)) { why = `${other} blocks bots from the whole host`; break; }
    }
    if (why) { refuse(host, why, false); out.skipped++; continue; }
    if (!allowedBy(rb.groups, u.pathname + u.search)) { log(`skip ${u.href}: robots.txt disallows it`); out.skipped++; continue; }
    await wait(site, paceFor(item.source, crawlDelay(rb.groups), item.pace));
    const r = await get(u.href);
    if (r.status === 0) { log(`fail ${u.href}: ${r.error ?? 'no answer'} (not saved)`); out.skipped++; continue; }
    const body = Buffer.isBuffer(r.body) ? r.body : Buffer.from(String(r.body ?? ''), 'utf8');
    const check = isChallenge(r.status, text(body, 20000));
    if (REFUSALS.has(r.status) || check) { refuse(host, `refused (${r.status}${check ? ', bot check' : ''})`, true); out.skipped++; continue; }
    const meta = { url: u.href, status: r.status, type: r.type, location: r.location || undefined, fetched: today, agent: USER_AGENT };
    if (r.status >= 200 && r.status < 300) store.save(item.source, u.href, body, meta);
    else if ((r.status >= 300 && r.status < 400) || r.status === 404 || r.status === 410) store.save(item.source, u.href, null, meta); // (an answer worth remembering, with no page)
    else { log(`${r.status} ${u.href} (not saved)`); out.skipped++; continue; }
    out.saved++;
    log(`${r.status} ${u.href}${r.location ? ` → ${r.location} (not followed)` : ''}`);
  }
  return out;
}
