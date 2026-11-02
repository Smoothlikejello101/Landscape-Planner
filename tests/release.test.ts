import { describe, expect, it } from 'vitest';
import { channelOf, signInAllowed } from '../src/channel';
// @ts-expect-error (a plain .mjs script)
import { joined, readAt, readHere, whatsNewProblems } from '../scripts/release/whats-new-check.mjs';
import { withPending } from '../src/whats-new-pending';
import { RELEASES } from '../src/whats-new';
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
    expect(p).toEqual(['Release 1 is already out, so its new lines would never be shown: put them in release 2, dated "next" (lines waiting in src/whats-new/next/ go there once release 1\'s date is written in: scripts/release/whats-new-fold.mjs).']);
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

// A pull request's lines in a file of its own, src/whats-new/next/<branch>.json, so pull requests open side by side
// don't change the same lines (Jason agreed, 2026-11-01: fewer merges of main to settle).
describe("what's new lines waiting in files of their own", () => {
  it('join the release not yet out after its own lines, by file name, or start one', () => {
    const next = { id: 2, date: 'next', items: ['a'] };
    expect(withPending([next, out], [['zinnia.json', ['z']], ['aster.json', ['b', 'c']]])).toEqual([{ ...next, items: ['a', 'b', 'c', 'z'] }, out]);
    expect(withPending([out], [['pins.json', ['p']]])).toEqual([{ id: 2, date: 'next', items: ['p'] }, out]);
    expect(withPending([], [['pins.json', ['p']]])).toEqual([{ id: 1, date: 'next', items: ['p'] }]);
    expect(withPending([out], [])).toEqual([out]);
  });
  it('are a list of lines, named like a branch', () => {
    expect(joined({ dated: [out], pending: [['pins-sooner.json', ['p']]] }).problems).toEqual([]);
    expect(joined({ dated: [out], pending: [['Pins Sooner.json', ['p']]] }).problems[0]).toContain('name it like the branch');
    for (const bad of [[], 'p', [''], [1], { items: ['p'] }]) expect(joined({ dated: [out], pending: [['pins.json', bad]] }).problems[0]).toContain('a JSON list of lines');
  });
  it('count as lines of a release that is out, once it is out: its date is written in first', () => {
    // (Release 2 went out with pins.json waiting; a new file before its date is written in would join it.)
    const shipped = joined({ dated: [out], pending: [['pins.json', ['p']]] }).releases;
    const now = joined({ dated: [out], pending: [['pins.json', ['p']], ['zoom.json', ['z']]] }).releases;
    expect(whatsNewProblems(now, shipped)[0]).toContain('Release 2 is already out');
    // Folded in with its date, the new file starts release 3.
    const folded = joined({ dated: [{ id: 2, date: '2026-11-02', items: ['p'] }, out], pending: [['zoom.json', ['z']]] }).releases;
    expect(folded[0]).toEqual({ id: 3, date: 'next', items: ['z'] });
    expect(whatsNewProblems(folded, shipped, { pr: true })).toEqual([]);
  });
  it('are what the app shows, read the same way here and at a commit', () => {
    expect(RELEASES).toEqual(joined(readHere()).releases);
    const atHead = readAt('HEAD');
    if (atHead) expect(joined(atHead).problems).toEqual([]);
    expect(readAt('no-such-branch-here')).toBeNull();
  });
});
