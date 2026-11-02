// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { builtOn, markSeen, newestRelease, newsAtStart, releaseDate, releasesSince, RELEASES, seenRelease, type Release } from '../src/whats-new';

// What's new: what changed in each update, said once after it (src/whats-new.ts).

const three: Release[] = [
  { id: 3, date: '2026-11-08', items: ['c'] },
  { id: 2, date: '2026-11-04', items: ['b1', 'b2'] },
  { id: 1, date: '2026-10-31', items: ['a'] },
];

beforeEach(() => localStorage.clear());

describe("what's new", () => {
  it('lists releases newest first, each one more than the last, dated, every line in plain words for a phone or a computer', () => {
    RELEASES.forEach((r, i) => {
      expect(r.id).toBe(RELEASES.length - i);
      // (Dated the day it went out; only the top one, not yet out, may be "next".)
      expect(r.date).toMatch(i === 0 ? /^(\d{4}-\d{2}-\d{2}|next)$/ : /^\d{4}-\d{2}-\d{2}$/);
      expect(r.items.length).toBeGreaterThan(0);
      for (const line of r.items) expect(line).not.toMatch(/\b(tap|click)/i);
    });
    expect(newestRelease()).toBe(RELEASES[0].id);
  });
  it('tells a new device nothing (the app is all new to it), and counts everything seen', () => {
    expect(newsAtStart(false, three)).toEqual([]);
    expect(seenRelease()).toBe(3);
  });
  it('tells a device used before the list existed of the newest release only', () => {
    expect(newsAtStart(true, three).map((r) => r.id)).toEqual([3]);
    expect(seenRelease()).toBe(3);
    expect(newsAtStart(true, three)).toEqual([]); // (once)
  });
  it('tells a device what it has not seen, newest first, once', () => {
    markSeen(1);
    expect(newsAtStart(true, three).map((r) => r.id)).toEqual([3, 2]);
    expect(newsAtStart(true, three)).toEqual([]);
    expect(releasesSince(0, three).map((r) => r.id)).toEqual([3, 2, 1]);
  });
  it('reads a kept value it cannot use as none kept', () => {
    localStorage.setItem('lp-whats-new', 'soon');
    expect(seenRelease()).toBeNull();
    expect(newsAtStart(false, three)).toEqual([]);
  });
  it('dates a release as people write it; the one not yet out is "Not released yet" in Next, and its build day in a release', () => {
    expect(releaseDate('2026-10-31')).toBe('Oct 31, 2026');
    expect(releaseDate('2027-01-02')).toBe('Jan 2, 2027');
    expect(releaseDate('next', 'next', '2026-11-02')).toBe('Not released yet');
    expect(releaseDate('next', 'release', '2026-11-02')).toBe('Nov 2, 2026');
  });
  it('gives the build\'s day by the person\'s own calendar, as files are dated: built at 00:17 UTC on Nov 2 is Nov 1 in Arkansas (the bug hunt, Nov 1)', () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = 'America/Chicago';
      expect(builtOn('2026-11-02T00:17:00.000Z')).toBe('2026-11-01');
      expect(releaseDate('next', 'release', builtOn('2026-11-02T00:17:00.000Z'))).toBe('Nov 1, 2026');
      process.env.TZ = 'Pacific/Auckland';
      expect(builtOn('2026-11-01T12:30:00.000Z')).toBe('2026-11-02');
    } finally {
      if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
    }
    // (A build's date alone, from before its time was kept, as it is; nothing, nothing.)
    expect(builtOn('2026-10-29')).toBe('2026-10-29');
    expect(builtOn('')).toBe('');
  });
});
