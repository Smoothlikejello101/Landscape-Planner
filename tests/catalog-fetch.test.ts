import { describe, expect, it } from 'vitest';
// @ts-expect-error (plain JavaScript build script)
import { allowedBy, blocksWholeHost, cacheName, crawlDelay, dnsVerdict, fileStore, isChallenge, noAnswer, normalizePath, paceFor, parseRobots, patternMatches, relatedHosts, robotsFromResponse, runFetch, siteOf, fetchSession } from '../scripts/catalog/fetch-lib.mjs';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('robots.txt', () => {
  it('groups user-agent runs until their first rule, whatever lines come between', () => {
    const g = parseRobots('﻿# hi\nDisallow: /before-any-agent\nUser-agent: a\nSitemap: https://x/s.xml\nUser-Agent: ClaudeBot/1.0 (+https://x)\nCrawl-delay: 5s\nDisallow: /x\n\nUser-agent: *\nAllow: /\nDisallow:\n');
    expect(g).toEqual([
      { agents: ['a', 'claudebot'], rules: [{ allow: false, path: '/x' }], delay: 5 },
      { agents: ['*'], rules: [{ allow: true, path: '/' }], delay: 0 },
    ]);
    expect(parseRobots('User-agent: *\rDisallow: /a\r')).toEqual([{ agents: ['*'], rules: [{ allow: false, path: '/a' }], delay: 0 }]);
    expect(parseRobots('')).toEqual([]);
    expect(parseRobots('User-agent: *\nDisallow: plants/')[0].rules[0].path).toBe('/plants/');
    // (A comma list isn't valid, but it's read as naming each agent in it.)
    expect(allowedBy(parseRobots('User-agent: GPTBot, ClaudeBot\nDisallow: /'), '/x')).toBe(false);
  });
  it('matches * and $ patterns, quickly', () => {
    expect(patternMatches('/plants/', '/plants/a')).toBe(true);
    expect(patternMatches('/*.pdf$', '/a/b.pdf')).toBe(true);
    expect(patternMatches('/*.pdf$', '/a/b.pdf?x')).toBe(false);
    expect(patternMatches('/plants?*', '/plants?q=1')).toBe(true);
    expect(patternMatches('/plants?*', '/plants/x')).toBe(false);
    expect(patternMatches('/a$', '/a')).toBe(true);
    expect(patternMatches('/a$', '/ab')).toBe(false);
    const t = Date.now();
    expect(patternMatches('/' + '*a'.repeat(30) + 'b', '/' + 'a'.repeat(60))).toBe(false);
    expect(Date.now() - t).toBeLessThan(200);
  });
  it('compares paths in one percent-encoded form', () => {
    expect(normalizePath('/%50lant%2fé')).toBe('/Plant%2F%C3%A9');
    const g = parseRobots('User-agent: *\nDisallow: /PlantFinder/\nDisallow: /plantes/é');
    expect(allowedBy(g, '/%50lantFinder/x.aspx')).toBe(false);
    expect(allowedBy(g, '/plantes/%C3%A9')).toBe(false);
  });
  it('treats a rule as blocking every spelling of a path', () => {
    const g = parseRobots('User-agent: *\nDisallow: /PlantFinder/');
    expect(allowedBy(g, '/plantfinder/x.aspx')).toBe(false);
    expect(allowedBy(g, '/PLANTFINDER/x.aspx')).toBe(false);
  });
  it('takes the longest rule, allow winning a tie', () => {
    const g = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a/b\nDisallow: /c\nAllow: /c\n');
    expect(allowedBy(g, '/a/x')).toBe(false);
    expect(allowedBy(g, '/a/b/c')).toBe(true);
    expect(allowedBy(g, '/c')).toBe(true);
    expect(allowedBy(g, '/elsewhere')).toBe(true);
  });
  it('is strict: every group that could mean us must allow it', () => {
    // MOBOT's shape: * keeps us out of Plant Finder, ClaudeBot out of everything.
    const mobot = parseRobots('User-agent: *\nCrawl-delay: 30\nDisallow: /PlantFinder/\n\nUser-agent: Bytespider\nUser-agent: ClaudeBot\nDisallow: /\n');
    expect(allowedBy(mobot, '/PlantFinder/x.aspx')).toBe(false);
    expect(allowedBy(mobot, '/visit')).toBe(false); // (ClaudeBot)
    expect(crawlDelay(mobot)).toBe(30);
    expect(blocksWholeHost(mobot)).toBe(true);
    // A group for someone else doesn't apply; * still does.
    const other = parseRobots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n');
    expect(allowedBy(other, '/plants/a')).toBe(true);
    expect(allowedBy(other, '/admin/x')).toBe(false);
    expect(blocksWholeHost(other)).toBe(false);
    // A whole-host block that leaves only the home page open still counts; so does one for *.
    expect(blocksWholeHost(parseRobots('User-agent: ClaudeBot\nDisallow: /\nAllow: /$\n'))).toBe(true);
    expect(blocksWholeHost(parseRobots('User-agent: *\nDisallow: /*\n'))).toBe(true);
  });
  it('reads a response: 404/410 none, a text file rules, anything else closed', () => {
    expect(robotsFromResponse(404, 'text/html', '<html>').kind).toBe('none');
    expect(robotsFromResponse(410, '', '').kind).toBe('none');
    expect(robotsFromResponse(200, 'text/plain', 'User-agent: *\nDisallow: /x').kind).toBe('rules');
    expect(robotsFromResponse(200, 'text/html', '<!DOCTYPE html><title>Just a moment...</title>').kind).toBe('closed');
    expect(robotsFromResponse(200, 'text/plain', '<html><body>app</body></html>').kind).toBe('closed');
    expect(robotsFromResponse(200, 'text/plain', '  <script>challenge()</script>').kind).toBe('closed');
    for (const s of [301, 400, 403, 429, 500, 0]) expect(robotsFromResponse(s, 'text/plain', '').kind).toBe('closed');
  });
  it('counts a host as not there only on a DNS answer that says so', () => {
    expect(noAnswer('nxdomain', 56, 'curl: (56) CONNECT tunnel failed, response 502')).toBe('none');
    expect(noAnswer('noaddress', 7, '')).toBe('none');
    expect(noAnswer('exists', 35, 'curl: (35) Recv failure: Connection reset by peer')).toBe('silent');
    expect(noAnswer('exists', 28, 'curl: (28) Operation timed out')).toBe('silent');
    expect(noAnswer('exists', 60, 'curl: (60) SSL certificate problem')).toBe('failed'); // (it serves HTTPS, badly: can't be checked)
    expect(noAnswer('exists', 56, 'curl: (56) CONNECT tunnel failed, response 403')).toBe('failed'); // (this machine's proxy said no)
    expect(noAnswer('unknown', 7, '')).toBe('failed');
    expect(dnsVerdict([{ Status: 3 }, { Status: 3 }])).toBe('nxdomain');
    expect(dnsVerdict([{ Status: 0 }, { Status: 0, Answer: [] }])).toBe('noaddress');
    expect(dnsVerdict([{ Status: 0, Answer: [{ type: 1, data: '1.2.3.4' }] }, { Status: 0 }])).toBe('exists');
    expect(dnsVerdict([{ Status: 2 }, { Status: 0 }])).toBe('unknown'); // (SERVFAIL)
    expect(dnsVerdict([null, { Status: 3 }])).toBe('unknown'); // (a lookup failed)
  });
  it('spots bot checks, but not an ordinary page with a form', () => {
    expect(isChallenge(200, '<html><title>Just a moment...</title>')).toBe(true);
    expect(isChallenge(200, '<script src="/_Incapsula_Resource?x"></script>')).toBe(true);
    expect(isChallenge(200, '<html><form><div class="g-recaptcha"></div></form>Plant facts</html>')).toBe(false);
    expect(isChallenge(403, '<div class="g-recaptcha">')).toBe(true);
    expect(isChallenge(404, '<html>Not found<div class="g-recaptcha"></div></html>')).toBe(false);
  });
});

describe('hosts and pace', () => {
  it('lists the related hosts whose whole-host block closes this one', () => {
    expect(relatedHosts('yardandgarden.extension.iastate.edu')).toEqual(['extension.iastate.edu', 'www.extension.iastate.edu', 'iastate.edu', 'www.iastate.edu']);
    expect(relatedHosts('plants.ces.ncsu.edu')).toEqual(['ces.ncsu.edu', 'www.ces.ncsu.edu', 'ncsu.edu', 'www.ncsu.edu']);
    expect(relatedHosts('extension.iastate.edu')).toEqual(['www.extension.iastate.edu', 'iastate.edu', 'www.iastate.edu']);
    expect(relatedHosts('www.aspca.org')).toEqual(['aspca.org']);
    expect(relatedHosts('plants.ces.ncsu.edu.')).toContain('ncsu.edu');
    expect(relatedHosts('www.extension.iastate.edu')).toEqual(['extension.iastate.edu', 'iastate.edu', 'www.iastate.edu']);
    expect(siteOf('www.bbc.co.uk')).toBe('bbc.co.uk');
  });
  it('never goes faster than 2 seconds, the source, or the crawl delay', () => {
    expect(paceFor('usda', 0)).toBe(2);
    expect(paceFor('ncsu', 0)).toBe(5);
    expect(paceFor('ncsu', 0, 1)).toBe(5);
    expect(paceFor('ncsu', 30)).toBe(30);
  });
  it('names cached pages uniquely', () => {
    const names = ['https://x.org/a/b', 'https://x.org/a/b/', 'https://x.org/a?b', 'https://x.org/' + 'q'.repeat(200) + '1', 'https://x.org/' + 'q'.repeat(200) + '2'].map(cacheName);
    expect(new Set(names).size).toBe(names.length);
    expect(cacheName('https://plants.ces.ncsu.edu/plants/cercis-canadensis/')).toMatch(/^plants\.ces\.ncsu\.edu_plants_cercis-canadensis-[0-9a-f]{10}$/);
  });
});

/** A fake web and clock: `pages` maps URL → response; time only moves when the fetcher sleeps. */
const NOT_THERE = { status: 0, reach: 'none' };
const SILENT = { status: 0, reach: 'silent', error: 'curl: (35) Recv failure' };
function fakeWorld(pages: Record<string, { status: number; type?: string; body?: string; location?: string; reach?: string }>, refusedAtStart: Record<string, { why: string; date: string }> = {}) {
  let t = 0;
  const requests: { url: string; at: number }[] = [];
  const saved = new Map<string, { page: Buffer | null; meta: { status: number } }>();
  const refused: Record<string, { why: string; date: string }> = { ...refusedAtStart };
  const deps = {
    // (A URL the test doesn't list is a host that isn't there: robots.txt of a www. twin or a parent.)
    get: async (url: string) => { requests.push({ url, at: t }); return { type: 'text/plain', location: '', body: '', ...(pages[url] ?? NOT_THERE) }; },
    sleep: async (s: number) => { t += s * 1000; },
    now: () => t,
    today: '2026-10-17',
    store: {
      cached: (source: string, url: string) => saved.has(source + ' ' + url),
      save: (source: string, url: string, page: Buffer | null, meta: { status: number }) => { saved.set(source + ' ' + url, { page, meta }); },
      saveRobots: () => {},
      refused: () => refused,
      refuse: (host: string, why: string) => { refused[host] = { why, date: '2026-10-17' }; },
    },
  };
  return { deps, requests, saved, refused };
}
const plant = (n: number) => `https://plants.ces.ncsu.edu/plants/p${n}/`;

describe('the fetch loop', () => {
  it('reads robots.txt once per host, keeps the pace, and saves pages', async () => {
    const w = fakeWorld({
      'https://plants.ces.ncsu.edu/robots.txt': { status: 404 },
      [plant(1)]: { status: 200, type: 'text/html', body: '<html>one</html>' },
      [plant(2)]: { status: 200, type: 'text/html', body: '<html>two</html>' },
    });
    const r = await runFetch([{ source: 'ncsu', url: plant(1) }, { source: 'ncsu', url: plant(2) }], w.deps);
    expect(r).toEqual({ saved: 2, cached: 0, skipped: 0 });
    expect(w.requests.filter((q) => q.url === 'https://plants.ces.ncsu.edu/robots.txt')).toHaveLength(1);
    const pages = w.requests.filter((q) => q.url.includes('/plants/'));
    expect(pages[1].at - pages[0].at).toBeGreaterThanOrEqual(5000); // (NC State's pace)
    // Every request to the site, robots.txt included, at least 2 s apart.
    const ncsu = w.requests.filter((q) => q.url.includes('ncsu.edu'));
    for (let i = 1; i < ncsu.length; i++) expect(ncsu[i].at - ncsu[i - 1].at).toBeGreaterThanOrEqual(2000);
    expect(String(w.saved.get('ncsu ' + plant(1))?.page)).toBe('<html>one</html>');
    // A second run finds them here and asks nothing.
    const before = w.requests.length;
    expect(await runFetch([{ source: 'ncsu', url: plant(1) }], w.deps)).toEqual({ saved: 0, cached: 1, skipped: 0 });
    expect(w.requests.length).toBe(before);
  });
  it('in one session, reads robots.txt once and keeps the pace across runs', async () => {
    const w = fakeWorld({
      'https://plants.ces.ncsu.edu/robots.txt': { status: 404 },
      [plant(1)]: { status: 200, type: 'text/html', body: 'one' },
      [plant(2)]: { status: 200, type: 'text/html', body: 'two' },
    });
    const session = fetchSession();
    await runFetch([{ source: 'ncsu', url: plant(1) }], { ...w.deps, session });
    await runFetch([{ source: 'ncsu', url: plant(2) }], { ...w.deps, session });
    const robots = w.requests.filter((q) => q.url.endsWith('/robots.txt')).map((q) => q.url);
    expect(robots.length).toBeGreaterThan(0);
    expect(new Set(robots).size).toBe(robots.length); // (each host's, and its related hosts', once)
    const pages = w.requests.filter((q) => q.url.includes('/plants/'));
    expect(pages[1].at - pages[0].at).toBeGreaterThanOrEqual(5000);
  });
  it('keeps to the crawl delay', async () => {
    const w = fakeWorld({
      'https://plants.ces.ncsu.edu/robots.txt': { status: 200, body: 'User-agent: *\nCrawl-delay: 30\nDisallow: /admin' },
      [plant(1)]: { status: 200, body: 'a' }, [plant(2)]: { status: 200, body: 'b' },
    });
    await runFetch([{ source: 'ncsu', url: plant(1) }, { source: 'ncsu', url: plant(2) }], w.deps);
    const pages = w.requests.filter((q) => q.url.includes('/plants/'));
    expect(pages[1].at - pages[0].at).toBeGreaterThanOrEqual(30000);
  });
  it('skips disallowed paths, and closes a host whose robots.txt is an error or whose parent blocks bots', async () => {
    const w = fakeWorld({
      'https://plants.ces.ncsu.edu/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /plants/p2/' },
      [plant(1)]: { status: 200, body: 'a' },
      'https://a.example.org/robots.txt': { status: 500 },
      'https://yardandgarden.extension.iastate.edu/robots.txt': { status: 404 },
      'https://www.extension.iastate.edu/robots.txt': { status: 200, body: 'User-agent: ClaudeBot\nDisallow: /' },
    });
    const r = await runFetch([
      { source: 'ncsu', url: plant(2) }, { source: 'ncsu', url: plant(1) },
      { source: 'usda', url: 'https://a.example.org/p' }, { source: 'usda', url: 'https://a.example.org/q' },
      { source: 'usda', url: 'https://yardandgarden.extension.iastate.edu/encyclopedia/x' },
    ], w.deps);
    expect(r).toEqual({ saved: 1, cached: 0, skipped: 4 });
    expect(w.requests.some((q) => q.url === plant(2))).toBe(false);
    expect(w.requests.some((q) => q.url === 'https://a.example.org/p' || q.url === 'https://a.example.org/q')).toBe(false);
    expect(w.requests.some((q) => q.url.includes('/encyclopedia/'))).toBe(false);
    // (Closed by robots.txt: read afresh next run, not remembered.)
    expect(Object.keys(w.refused)).toEqual([]);
  });
  it('stops at a refusal or bot check, and remembers it across runs', async () => {
    const w = fakeWorld({
      'https://plants.ces.ncsu.edu/robots.txt': { status: 404 },
      [plant(1)]: { status: 429 },
      'https://b.example.org/robots.txt': { status: 404 },
      'https://b.example.org/p': { status: 200, type: 'text/html', body: '<html><title>Just a moment...</title></html>' },
    });
    await runFetch([{ source: 'ncsu', url: plant(1) }, { source: 'ncsu', url: plant(2) }, { source: 'usda', url: 'https://b.example.org/p' }], w.deps);
    expect(w.requests.some((q) => q.url === plant(2))).toBe(false);
    expect(w.saved.size).toBe(0);
    expect(Object.keys(w.refused).sort()).toEqual(['b.example.org', 'plants.ces.ncsu.edu']);
    const n = w.requests.length;
    await runFetch([{ source: 'ncsu', url: plant(3) }], w.deps);
    expect(w.requests.length).toBe(n);
  });
  it('records a redirect without following it, and never saves a failure', async () => {
    const w = fakeWorld({
      'https://plants.ces.ncsu.edu/robots.txt': { status: 404 },
      [plant(1)]: { status: 301, location: 'https://elsewhere.example.com/x' },
      [plant(3)]: { status: 500 },
    });
    const r = await runFetch([{ source: 'ncsu', url: plant(1) }, { source: 'ncsu', url: plant(2) }, { source: 'ncsu', url: plant(3) }], w.deps);
    expect(r).toEqual({ saved: 1, cached: 0, skipped: 2 });
    expect(w.requests.some((q) => q.url.includes('elsewhere'))).toBe(false);
    expect(w.saved.get('ncsu ' + plant(1))).toMatchObject({ page: null, meta: { status: 301 } });
    expect(w.saved.has('ncsu ' + plant(2))).toBe(false); // (no answer)
    expect(w.saved.has('ncsu ' + plant(3))).toBe(false); // (an error)
  });
  it('follows a robots.txt redirect within the same site only', async () => {
    const w = fakeWorld({
      'https://ncsu.edu/robots.txt': { status: 301, location: 'https://www.ncsu.edu/robots.txt' },
      'https://www.ncsu.edu/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /private' },
      'https://ncsu.edu/plants/x': { status: 200, body: 'x' },
      'https://c.example.org/robots.txt': { status: 302, location: 'https://other.example.net/robots.txt' },
    });
    const r = await runFetch([{ source: 'ncsu', url: 'https://ncsu.edu/plants/x' }, { source: 'usda', url: 'https://c.example.org/p' }], w.deps);
    expect(r).toEqual({ saved: 1, cached: 0, skipped: 1 });
    expect(w.requests.some((q) => q.url.includes('other.example.net'))).toBe(false);
  });
  it('refuses anything but plain https URLs and safe source names', async () => {
    const w = fakeWorld({});
    const r = await runFetch([
      { source: 'ncsu', url: 'http://plants.ces.ncsu.edu/plants/x/' },
      { source: 'ncsu', url: 'https://user:pw@plants.ces.ncsu.edu/plants/x/' },
      { source: 'ncsu', url: 'ftp://plants.ces.ncsu.edu/x' },
      { source: '../x', url: plant(1) },
      { source: 'robots', url: plant(1) },
      { source: 'ncstate', url: plant(1) }, // (not a known source: no pace for it)
      { source: 'ncsu', url: 'not a url' },
    ], w.deps);
    expect(r).toEqual({ saved: 0, cached: 0, skipped: 7 });
    expect(w.requests).toHaveLength(0);
  });
  it('closes a host when a related host\'s robots.txt blocks bots everywhere, but not when it only answers with an error or a bot filter', async () => {
    for (const [answer, closes] of [
      [{ status: 200, body: 'User-agent: *\nDisallow: /' }, true],
      [{ status: 200, body: 'User-agent: ClaudeBot\nDisallow: /\nAllow: /$' }, true],
      [{ status: 200, body: 'User-agent: *\nDisallow: /admin' }, false],
      [{ status: 0, reach: 'failed' }, false],
      [{ status: 403, type: 'text/html', body: '<title>Access Denied</title>' }, false], // (USDA's main site, behind its bot filter)
      [{ status: 202, type: 'text/html', body: '' }, false], // (NC State's main site, likewise)
      [{ status: 301, location: 'https://other.example.net/robots.txt' }, false],
    ] as const) {
      const w = fakeWorld({ 'https://plants.ces.ncsu.edu/robots.txt': { status: 404 }, 'https://ncsu.edu/robots.txt': answer, [plant(1)]: { status: 200, body: 'a' } });
      expect(await runFetch([{ source: 'ncsu', url: plant(1) }], w.deps)).toEqual(closes ? { saved: 0, cached: 0, skipped: 1 } : { saved: 1, cached: 0, skipped: 0 });
    }
  });
  it('lets a host\'s own narrower Allow decide its paths', async () => {
    const w = fakeWorld({ 'https://plants.ces.ncsu.edu/robots.txt': { status: 200, body: 'User-agent: ClaudeBot\nDisallow: /\nAllow: /plants/' }, [plant(1)]: { status: 200, body: 'a' } });
    expect(await runFetch([{ source: 'ncsu', url: plant(1) }, { source: 'ncsu', url: 'https://plants.ces.ncsu.edu/admin/' }], w.deps)).toEqual({ saved: 1, cached: 0, skipped: 1 });
  });
  it('keeps a refused host refused, spelled with a trailing dot or not', async () => {
    const w = fakeWorld({}, { 'plants.ces.ncsu.edu': { why: 'refused (429)', date: '2026-10-16' } });
    expect(await runFetch([{ source: 'ncsu', url: 'https://plants.ces.ncsu.edu./plants/x/' }, { source: 'ncsu', url: 'https://PLANTS.ces.ncsu.edu/plants/y/' }], w.deps)).toEqual({ saved: 0, cached: 0, skipped: 2 });
    expect(w.requests).toHaveLength(0);
  });
  it('doesn\'t refuse an ordinary page that has a reCAPTCHA form', async () => {
    const w = fakeWorld({ 'https://plants.ces.ncsu.edu/robots.txt': { status: 404 }, [plant(1)]: { status: 200, type: 'text/html', body: '<html>facts<div class="g-recaptcha"></div></html>' } });
    expect(await runFetch([{ source: 'ncsu', url: plant(1) }], w.deps)).toEqual({ saved: 1, cached: 0, skipped: 0 });
    expect(w.refused).toEqual({});
  });
});

describe('the fetcher\'s files', () => {
  it('keeps pages byte for byte, by date, and finds them again by URL', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fetch-'));
    const store = fileStore(root, '2026-10-17');
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0x80, 0x00, 0xc3]);
    const w = fakeWorld({ 'https://plants.ces.ncsu.edu/robots.txt': { status: 404 } });
    const url = 'https://plants.ces.ncsu.edu/a.pdf';
    const deps = { ...w.deps, store, get: async (u: string) => (u === url ? { status: 200, type: 'application/pdf', location: '', body: pdf } : w.deps.get(u)) };
    expect(await runFetch([{ source: 'ncsu', url }], deps)).toEqual({ saved: 1, cached: 0, skipped: 0 });
    expect(Buffer.compare(readFileSync(join(root, 'ncsu', '2026-10-17', cacheName(url))), pdf)).toBe(0);
    expect(store.cached('ncsu', url)).toBe(true);
    expect(store.cached('ncsu', url + '?other')).toBe(false);
  });
  it('remembers refusals, and stops rather than forget them when the file is damaged', () => {
    const root = mkdtempSync(join(tmpdir(), 'fetch-'));
    const store = fileStore(root, '2026-10-17');
    store.refuse('a.org', 'refused (429)');
    store.refuse('b.org', 'refused (403)');
    expect(Object.keys(fileStore(root, '2026-10-18').refused())).toEqual(['a.org', 'b.org']);
    writeFileSync(join(root, 'refused.json'), '{ "a.org": { "why": "x", },');
    expect(() => store.refused()).toThrow(/fix it by hand/);
  });
  it('treats a robots.txt redirect to a host that doesn\'t answer as unchecked', async () => {
    const w = fakeWorld({
      'https://plants.ces.ncsu.edu/robots.txt': { status: 301, location: 'https://www.plants.ces.ncsu.edu/robots.txt' },
      [plant(1)]: { status: 200, body: 'a' },
    });
    expect(await runFetch([{ source: 'ncsu', url: plant(1) }], w.deps)).toEqual({ saved: 0, cached: 0, skipped: 1 });
  });
  it('drops a page saved earlier the same day when a refresh finds it moved', () => {
    const root = mkdtempSync(join(tmpdir(), 'fetch-'));
    const store = fileStore(root, '2026-10-17');
    const url = 'https://plants.ces.ncsu.edu/x';
    store.save('ncsu', url, Buffer.from('old'), { url, status: 200 });
    store.save('ncsu', url, null, { url, status: 301 });
    expect(existsSync(join(root, 'ncsu', '2026-10-17', cacheName(url)))).toBe(false);
  });
  it('ignores a related host that serves nothing, but closes the host we want if it\'s silent', async () => {
    const w = fakeWorld({
      'https://plants.ces.ncsu.edu/robots.txt': { status: 404 },
      'https://ncsu.edu/robots.txt': SILENT,
      [plant(1)]: { status: 200, body: 'a' },
      'https://d.example.org/robots.txt': SILENT,
    });
    expect(await runFetch([{ source: 'ncsu', url: plant(1) }, { source: 'usda', url: 'https://d.example.org/p' }], w.deps)).toEqual({ saved: 1, cached: 0, skipped: 1 });
    expect(w.requests.some((q) => q.url === 'https://d.example.org/p')).toBe(false);
  });
});
