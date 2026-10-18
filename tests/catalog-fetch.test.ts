import { describe, expect, it } from 'vitest';
// @ts-expect-error (plain JavaScript build script)
import { allowedBy, blocksUsEverywhere, cacheName, crawlDelay, paceFor, parentHosts, parseRobots, patternMatches, robotsFromResponse } from '../scripts/catalog/fetch-lib.mjs';

describe('robots.txt', () => {
  it('groups consecutive user-agent lines and reads rules and delays', () => {
    const g = parseRobots('# hi\nUser-agent: a\nUser-Agent: B\nDisallow: /x\nCrawl-delay: 10\n\nUser-agent: *\nAllow: /\nDisallow:\n');
    expect(g).toEqual([
      { agents: ['a', 'b'], rules: [{ allow: false, path: '/x' }], delay: 10 },
      { agents: ['*'], rules: [{ allow: true, path: '/' }], delay: 0 },
    ]);
  });
  it('matches * and $ patterns', () => {
    expect(patternMatches('/plants/', '/plants/a')).toBe(true);
    expect(patternMatches('/*.pdf$', '/a/b.pdf')).toBe(true);
    expect(patternMatches('/*.pdf$', '/a/b.pdf?x')).toBe(false);
    expect(patternMatches('/plants?*', '/plants?q=1')).toBe(true);
    expect(patternMatches('/plants?*', '/plants/x')).toBe(false);
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
    expect(blocksUsEverywhere(mobot)).toBe(true);
    // A group for someone else doesn't apply; * still does.
    const other = parseRobots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n');
    expect(allowedBy(other, '/plants/a')).toBe(true);
    expect(allowedBy(other, '/admin/x')).toBe(false);
    expect(blocksUsEverywhere(other)).toBe(false);
    // * alone disallowing everything closes the host, but isn't a whole-host block "of a Claude agent".
    const all = parseRobots('User-agent: *\nDisallow: /\n');
    expect(allowedBy(all, '/')).toBe(false);
    expect(blocksUsEverywhere(all)).toBe(false);
  });
  it('reads a response: 404/410 none, a text file rules, anything else closed', () => {
    expect(robotsFromResponse(404, 'text/html', '<html>').kind).toBe('none');
    expect(robotsFromResponse(410, '', '').kind).toBe('none');
    expect(robotsFromResponse(200, 'text/plain', 'User-agent: *\nDisallow: /x').kind).toBe('rules');
    expect(robotsFromResponse(200, 'text/html', '<!DOCTYPE html><title>Just a moment...</title>').kind).toBe('closed');
    expect(robotsFromResponse(200, 'text/plain', '<html><body>app</body></html>').kind).toBe('closed');
    expect(robotsFromResponse(500, 'text/plain', '').kind).toBe('closed');
    expect(robotsFromResponse(403, 'text/html', '').kind).toBe('closed');
    expect(robotsFromResponse(400, 'application/xml', '<?xml version="1.0"?><Error/>').kind).toBe('closed');
    expect(robotsFromResponse(0, '', '').kind).toBe('closed');
  });
});

describe('hosts and pace', () => {
  it('lists the parents whose block closes a subdomain', () => {
    expect(parentHosts('yardandgarden.extension.iastate.edu')).toEqual(['extension.iastate.edu', 'www.extension.iastate.edu']);
    expect(parentHosts('ffl-api.ifas.ufl.edu')).toEqual(['ifas.ufl.edu', 'www.ifas.ufl.edu']);
    expect(parentHosts('plants.ces.ncsu.edu')).toEqual(['ces.ncsu.edu', 'www.ces.ncsu.edu']);
    expect(parentHosts('www.aspca.org')).toEqual([]);
  });
  it('never goes faster than 2 seconds, the source, or the crawl delay', () => {
    expect(paceFor(0, 0)).toBe(2);
    expect(paceFor(5, 0)).toBe(5);
    expect(paceFor(5, 30)).toBe(30);
    expect(paceFor(undefined, undefined)).toBe(2);
  });
  it('names cached pages readably and the same every time', () => {
    expect(cacheName('https://plants.ces.ncsu.edu/plants/cercis-canadensis/')).toBe('plants.ces.ncsu.edu_plants_cercis-canadensis');
    expect(cacheName('https://x.org/api/PlantProfile?symbol=CECA4')).toBe('x.org_api_PlantProfile_symbol_CECA4');
  });
});
