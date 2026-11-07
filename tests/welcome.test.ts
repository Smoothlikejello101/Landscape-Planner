// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arrive, backupDue, changedOn, deviceWord, savedHereSettled, settleSavedHere, startCard, WELCOME_BACK_DAYS, BACKUP_STALE_DAYS, type Arrival, type Scene } from '../src/welcome';
import { lastVisitAt, noteVisit } from '../src/hints';

// Welcome back (src/welcome.ts): after a gap or an update, the whole plan and a small card; on the second visit, once,
// "Saved on this phone". Driven by the clock, faked here.

const DAY = 24 * 60 * 60 * 1000;
const V = '0.2.211';

/** The app started now: as src/main.ts does it, the visit read, then noted. */
function start(version = V): Arrival {
  const a = arrive(lastVisitAt(), version);
  noteVisit();
  return a;
}
/** The app closed: its window's sessionStorage goes with it. */
function close() { sessionStorage.clear(); }
/** Time goes by, the app put away meanwhile (the last visit is when it was left). */
function later(ms: number) { vi.setSystemTime(Date.now() + ms); }

const ON_PLAN: Scene = { touring: false, drawn: true, backedUp: false, syncing: false, saving: true };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 2, 10, 0)); // (Nov 2, 10 am, local time)
});
afterEach(() => vi.useRealTimers());

describe('a start of the app', () => {
  it('on a new device: the first visit, no gap, no update; the version is noted', () => {
    expect(start()).toEqual({ visit: 1, away: null, gap: false, updated: false });
    expect(localStorage.getItem('lp-app-version')).toBe(V);
  });

  it('reloaded in the same window the same day: the same visit; closed and opened again: the second', () => {
    start();
    later(60_000);
    expect(start().visit).toBe(1);
    close();
    later(60_000);
    expect(start().visit).toBe(2);
    close();
    expect(start().visit).toBe(3);
  });

  it('in a window left open (or brought back by the browser) on a later day: a visit of its own', () => {
    vi.setSystemTime(new Date(2026, 10, 2, 23, 50));
    start();
    later(20 * 60_000); // (past midnight)
    expect(start().visit).toBe(2);
    later(60_000);
    expect(start().visit).toBe(2); // (reloaded again that day: the same)
  });

  it(`a gap is ${WELCOME_BACK_DAYS} days or more since the app was last on screen, not since it was opened`, () => {
    start();
    later(5 * DAY);
    noteVisit(); // (left after a long sitting, five days on)
    close();
    later(WELCOME_BACK_DAYS * DAY - 60_000);
    expect(start()).toMatchObject({ gap: false, away: WELCOME_BACK_DAYS * DAY - 60_000 });
    close();
    later(WELCOME_BACK_DAYS * DAY);
    expect(start()).toMatchObject({ gap: true, away: WELCOME_BACK_DAYS * DAY });
    close();
    later(DAY);
    expect(start().gap).toBe(false); // (seen yesterday)
  });

  it('an update is the first start of a new version: once', () => {
    start('0.2.210');
    close();
    later(DAY);
    expect(start('0.2.211').updated).toBe(true);
    later(60_000);
    expect(start('0.2.211').updated).toBe(false); // (reloaded: said once)
    close();
    expect(start('0.2.211').updated).toBe(false);
  });

  it('a device that used the app before any of this was kept: an update, and its earlier visits count as one', () => {
    localStorage.setItem('lp-last-visit', String(Date.now() - DAY));
    expect(start()).toMatchObject({ updated: true, visit: 2, gap: false });
  });

  it('reads what it can’t use as nothing kept, and works with no storage at all', () => {
    localStorage.setItem('lp-visits', '{"n":"two"}');
    expect(start().visit).toBe(1);
    expect(arrive(0, V, Date.now(), null, null)).toEqual({ visit: 1, away: null, gap: false, updated: false });
  });
});

describe('which card, in what order', () => {
  /** A device on its `visit`th visit, `gap` days away, `updated` or not. */
  const at = (o: Partial<Arrival>): Arrival => ({ visit: 5, away: DAY, gap: false, updated: false, ...o });

  it('the guided introduction under way, or nothing drawn (the first screen): no card, the view as it was left', () => {
    for (const a of [at({ gap: true }), at({ updated: true }), at({ visit: 2 })]) {
      expect(startCard(a, { ...ON_PLAN, touring: true })).toEqual({ card: null, fit: false });
      expect(startCard(a, { ...ON_PLAN, drawn: false })).toEqual({ card: null, fit: false });
    }
    expect(savedHereSettled()).toBe(false); // (the second visit's card still to come)
  });

  it('after a gap or an update: the welcome-back card, and the whole plan', () => {
    settleSavedHere('shown'); // (a device past its second visit's card)
    expect(startCard(at({ gap: true }), ON_PLAN)).toEqual({ card: 'welcome', fit: true });
    expect(startCard(at({ updated: true }), ON_PLAN)).toEqual({ card: 'welcome', fit: true });
    expect(startCard(at({}), ON_PLAN)).toEqual({ card: null, fit: false });
  });

  it('the second visit: "Saved on this phone", once; an update first, the card waits for the next visit', () => {
    expect(startCard(at({ visit: 1 }), ON_PLAN).card).toBe(null);
    expect(startCard(at({ visit: 2, updated: true }), ON_PLAN)).toEqual({ card: 'welcome', fit: true });
    expect(startCard(at({ visit: 3 }), ON_PLAN)).toEqual({ card: 'saved', fit: false });
    settleSavedHere('shown'); // (src/ui/welcome-card.ts, as it shows)
    expect(startCard(at({ visit: 4 }), ON_PLAN).card).toBe(null);
  });

  it('the second visit after a gap: "Saved on this phone" in the welcome card’s place, the plan still whole', () => {
    expect(startCard(at({ visit: 2, gap: true }), ON_PLAN)).toEqual({ card: 'saved', fit: true });
  });

  it('backed up already, or syncing to the account: never; the gap’s card instead', () => {
    expect(startCard(at({ visit: 2, gap: true }), { ...ON_PLAN, backedUp: true })).toEqual({ card: 'welcome', fit: true });
    expect(savedHereSettled()).toBe(true);
    expect(startCard(at({ visit: 3 }), ON_PLAN).card).toBe(null); // (the backup since lost track of: still never)
    localStorage.clear();
    expect(startCard(at({ visit: 2 }), { ...ON_PLAN, syncing: true }).card).toBe(null);
    expect(localStorage.getItem('lp-saved-here')).toBe('skipped');
  });

  it('nothing being saved on this device (a browser that keeps nothing, saves failing): not said, and still to come', () => {
    expect(startCard(at({ visit: 2 }), { ...ON_PLAN, saving: false }).card).toBe(null);
    expect(savedHereSettled()).toBe(false);
    expect(startCard(at({ visit: 3 }), ON_PLAN).card).toBe('saved');
  });

  it('a new device, day by day: nothing; the second visit’s card; a week away, welcome back; an update, welcome back', () => {
    const scene = () => ON_PLAN;
    const card = () => { const { card } = startCard(start(), scene()); if (card === 'saved') settleSavedHere('shown'); return card; };
    expect(card()).toBe(null);
    later(60_000);
    expect(card()).toBe(null); // (reloaded)
    close(); later(DAY);
    expect(card()).toBe('saved');
    close(); later(DAY);
    expect(card()).toBe(null);
    close(); later(7 * DAY);
    expect(card()).toBe('welcome');
    close(); later(60_000);
    expect(startCard(start('0.2.212'), scene()).card).toBe('welcome');
  });
});

describe('what the card says', () => {
  it(`offers a backup when there's none, or the last is over ${BACKUP_STALE_DAYS} days old with a plan changed since`, () => {
    const now = Date.now();
    expect(backupDue(null, now - DAY, now)).toBe(true);
    expect(backupDue(now - 2 * DAY, now - DAY, now)).toBe(false);
    expect(backupDue(now - BACKUP_STALE_DAYS * DAY, now - DAY, now)).toBe(true);
    expect(backupDue(now - BACKUP_STALE_DAYS * DAY, now - 40 * DAY, now)).toBe(false); // (nothing changed since)
  });

  it('names the device as people do: this phone, this tablet, this computer', () => {
    expect(deviceWord('Android phone')).toBe('this phone');
    expect(deviceWord('iPhone')).toBe('this phone');
    expect(deviceWord('Android tablet')).toBe('this tablet');
    expect(deviceWord('iPad')).toBe('this tablet');
    expect(deviceWord('Mac', 5)).toBe('this tablet'); // (an iPad asking for the desktop site)
    expect(deviceWord('Mac')).toBe('this computer');
    expect(deviceWord('Windows PC')).toBe('this computer');
    expect(deviceWord('Chromebook')).toBe('this computer');
    expect(deviceWord('another device')).toBe('this device');
  });

  it('says when the plan last changed: today, yesterday, Oct 28, and the year when it isn’t this one', () => {
    const now = Date.now();
    expect(changedOn(new Date(2026, 10, 2, 7, 5).getTime(), now)).toBe('today');
    expect(changedOn(new Date(2026, 10, 1, 23, 59).getTime(), now)).toBe('yesterday');
    expect(changedOn(new Date(2026, 9, 28, 12).getTime(), now)).toBe('Oct 28');
    expect(changedOn(new Date(2025, 11, 30, 12).getTime(), now)).toBe('Dec 30, 2025');
    expect(changedOn(new Date(2026, 10, 30, 0, 1).getTime(), new Date(2026, 11, 1, 9).getTime())).toBe('yesterday'); // (across a month)
  });
});
