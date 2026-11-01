import { describe, expect, it } from 'vitest';
import { channelOf, signInAllowed } from '../src/channel';
// @ts-expect-error (a plain .mjs script)
import { whatsNewProblems } from '../scripts/release/whats-new-check.mjs';
// @ts-expect-error (a plain .mjs script)
import { NEXT_HOST, nextIndex, nextManifest } from '../scripts/release/next-channel.mjs';

// Releases (docs/releasing.md): main is built as Next, the preview copy; the release branch is what testers have.

const out = { id: 1, date: '2026-10-31', items: ['a'] };

describe('channels', () => {
  it('reads a build as Next only when it says so, and turns sign-in off there', () => {
    expect([channelOf('next'), channelOf('release'), channelOf(undefined), channelOf('')]).toEqual(['next', 'release', 'release', 'release']);
    expect([signInAllowed('next'), signInAllowed('release')]).toEqual([false, true]);
  });
  it("names Next's copy apart from the real app's, and keeps it out of search", () => {
    const m = nextManifest({ name: 'FullGrown Garden Planner', short_name: 'FullGrown', start_url: './' });
    expect(m).toEqual({ name: 'FullGrown Next (preview)', short_name: 'FG Next', start_url: './' });
    const html = nextIndex('<head>\n  <meta name="apple-mobile-web-app-title" content="FullGrown" />\n  <title>FullGrown Garden Planner</title>\n</head>');
    expect(html).toContain('<title>FullGrown Next (preview)</title>');
    expect(html).toContain('content="FG Next"');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(NEXT_HOST).toBe('next.fullgrown.garden');
  });
});

describe("what's new against the release branch", () => {
  it('is fine with a new release dated "next" above the ones out', () => {
    expect(whatsNewProblems([out], null)).toEqual([]);
    expect(whatsNewProblems([{ id: 2, date: 'next', items: ['b'] }, out], [out], { pr: true })).toEqual([]);
  });
  it('refuses new lines in a release that is out, and names the release to put them in', () => {
    const p = whatsNewProblems([{ ...out, items: ['a', 'b'] }], [out]);
    expect(p).toEqual(['Release 1 is already out, so its new lines would never be shown: put them in release 2, dated "next".']);
    // (With one not yet out above it: that one.)
    expect(whatsNewProblems([{ id: 2, date: 'next', items: ['c'] }, { ...out, items: ['a', 'b'] }], [out])[0]).toContain('put them in release 2');
  });
  it('asks a pull request to write in the day a release went out', () => {
    const shipped = [{ ...out, date: 'next' }];
    expect(whatsNewProblems(shipped, shipped, { pr: false })).toEqual([]);
    expect(whatsNewProblems(shipped, shipped, { pr: true })[0]).toContain('write in the day it went out');
  });
  it('allows "next" on the top release only, and ids running down to 1', () => {
    expect(whatsNewProblems([{ id: 2, date: '2026-11-02', items: ['b'] }, { ...out, date: 'next' }], null)[0]).toContain('isn\'t the top one');
    expect(whatsNewProblems([{ id: 3, date: 'next', items: ['b'] }, out], null)[0]).toContain('ids must run down to 1');
    expect(whatsNewProblems([{ id: 1, date: 'Nov 2', items: ['b'] }], null)[0]).toContain('isn\'t YYYY-MM-DD');
  });
});
