import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DB_VERSION } from '../src/db';
import { addPlainShape, closeSheet, field, openFresh } from './helpers';

// An older version of the app never saves over a newer one's plans (src/db.ts DB_VERSION; Nov 1: a buried line lost its
// role, saved over by a tab left open on an older version). Two pages in one browser: the app, and another page of the
// same site standing in for another tab or window, which opens the database as a newer version (or an older one) would.

const DB = 'landscape-planner';
/** A newer version's database, pretended: one above this build's (src/db.ts DB_VERSION). */
const NEWER = DB_VERSION + 1;

/** A page of the site that isn't the app: another tab, opening the database its own way. */
async function otherTab(context: BrowserContext): Promise<Page> {
  await context.route('**/other-tab.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Another tab</title>' }));
  const p = await context.newPage();
  await p.goto('./other-tab.html');
  return p;
}

type Records = Record<string, Record<string, unknown>>;
/** The database's version and every store's records, read from `p` (a connection of its own, closed after). */
const dump = (p: Page) => p.evaluate((name) => new Promise<{ version: number; stores: Records }>((resolve, reject) => {
  const r = indexedDB.open(name);
  r.onerror = () => reject(r.error);
  r.onsuccess = async () => {
    const db = r.result, stores: Records = {};
    for (const s of Array.from(db.objectStoreNames)) {
      const os = db.transaction(s).objectStore(s);
      const all = (q: IDBRequest) => new Promise<unknown[]>((res) => { q.onsuccess = () => res(q.result as unknown[]); });
      const [keys, values] = await Promise.all([all(os.getAllKeys()), all(os.getAll())]);
      stores[s] = Object.fromEntries(keys.map((k, i) => [String(k), values[i]]));
    }
    db.close();
    resolve({ version: db.version, stores });
  };
}), DB);

/**
 * Opens the database in `p` at `version` and keeps the connection, as another tab would (window.held). `records`, if
 * given: the stores made and filled, as a page of that version would have left them. It never closes by itself.
 */
const holdAt = (p: Page, version: number, records?: Records) => p.evaluate(({ name, version, records }) => new Promise<boolean>((resolve, reject) => {
  let blocked = false;
  const r = indexedDB.open(name, version);
  r.onblocked = () => { blocked = true; };
  r.onupgradeneeded = () => {
    if (!records) return;
    for (const s of ['meta', 'projects', 'images', 'kv']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
    const tx = r.transaction!;
    for (const [s, recs] of Object.entries(records)) for (const [k, v] of Object.entries(recs)) tx.objectStore(s).put(v, k);
  };
  r.onsuccess = () => { (window as unknown as { held: IDBDatabase }).held = r.result; resolve(blocked); };
  r.onerror = () => reject(r.error);
}), { name: DB, version, records });

const journals = (p: Page) => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lp-journal:')));

const circle = (id: string, label: string) => ({ id, type: 'circle', x: 0, y: 0, radius: 2, color: '#16a34a', label, opacity: 0.65, locked: false });
const SW = { showCrowding: { on: true }, crowdWarnings: { on: true }, hardyWarnings: { on: true }, poisonWarnings: { on: true }, fruitWarnings: { on: true } };
const YARD = { kids: false, dogs: '', cats: false, horses: false, answered: true };
/** A device as release 3 left it (database version 1): a plan with a buried line, its ticks, yard and switches. */
const RELEASE3: Records = {
  meta: { p1: { id: 'p1', name: 'Back Yard', lastModified: 1000, shapeCount: 2 } },
  projects: {
    p1: {
      shapes: [circle('oak', 'Old oak'), { id: 'line1', type: 'line', x: 0, y: 6, points: [[0, 0], [12, 0]], rotation: 0, color: '#7c3aed', label: 'Buried line', opacity: 0.8, locked: false, role: 'utility', utility: 'buried' }],
      zoom: 1, offsetX: -10, offsetY: -10, roleViews: {}, print: { paper: 'letter' }, sizeMode: 'typical', sunWarnings: true, phases: [], bgImage: null, photoElsewhere: null,
      bought: { 'pl:1': { n: 2, at: 5 } }, household: YARD, switches: SW,
    },
  },
  images: {},
  kv: { current: 'p1', migratedFromLocalStorage: 1, tookFromDevice: { at: 1, household: YARD, switches: SW } },
};

test('a page open when a newer version opens the database keeps its last edit, says so, and writes nothing after; reloaded, it says a newer version has the plans', async ({ page, context }) => {
  await openFresh(page);
  await addPlainShape(page, 'circle');
  await field(page, 'Label').fill('Drawn before the update');
  await closeSheet(page);
  await page.waitForTimeout(600); // (saved)

  // A newer version opens the database in another tab: this page lets go at once.
  const other = await otherTab(context);
  expect(await holdAt(other, NEWER)).toBe(false); // (never kept waiting)
  await expect(page.getByTestId('newer-tab')).toContainText('FullGrown was updated in another tab or window. This page will reload into the new version.');
  const after = await dump(other);
  expect(after.version).toBe(NEWER);
  const labels = Object.values(after.stores.projects).flatMap((p) => (p as { shapes: { label: string }[] }).shapes.map((s) => s.label));
  expect(labels).toContain('Drawn before the update');
  expect(await journals(other)).toEqual([]);

  // Nothing more from this page: hidden, or put away.
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
  await page.waitForTimeout(600);
  expect(await dump(other)).toEqual(after);
  expect(await journals(other)).toEqual([]);

  // Reloaded (this build again: the newer one is only pretended), it stops before opening the plans.
  await Promise.all([page.waitForEvent('load'), page.getByTestId('newer-tab').getByTestId('ask-ok').click()]);
  await expect(page.getByTestId('newer-version')).toContainText('A newer version of FullGrown saved the plans on this device.');
  await expect(page.locator('.project-btn')).toHaveCount(0);
  await page.waitForTimeout(600);
  expect(await dump(other)).toEqual(after);
  expect(await journals(other)).toEqual([]);
});

test('a page opened after a newer version has the database says so, writes nothing, and reloads only when asked', async ({ page, context }) => {
  const other = await otherTab(context);
  await holdAt(other, NEWER, RELEASE3);
  await other.evaluate(() => { (window as unknown as { held: IDBDatabase }).held.close(); });
  const before = await dump(other);
  // (What's kept in localStorage, but for when this device last had the app on screen: src/hints.ts, noted as any page
  // is put away.)
  const localNow = () => other.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => k !== 'lp-last-visit').sort()));
  const local = await localNow();
  let loads = 0;
  page.on('load', () => { loads++; });

  await page.goto('./');
  const said = page.getByTestId('newer-version');
  await expect(said).toContainText('A newer version of FullGrown saved the plans on this device. This page is an older version, so it hasn’t opened them, and has changed nothing. Reload to get the newer version.');
  await expect(page.locator('.project-btn')).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(loads).toBe(1); // (it never reloads by itself)
  expect(await dump(other)).toEqual(before);
  expect(await localNow()).toBe(local);

  // For when no version can open them: a raw copy of every record, as stored, saved as a file; nothing changed by it.
  await expect(said).toContainText('A raw copy is everything stored on this device, exactly as it is, in one file');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('newer-raw-copy').click()]);
  expect(download.suggestedFilename()).toMatch(/^fullgrown-raw-copy-.+\.json$/);
  const copy = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(copy).toMatchObject({ format: 'fullgrown-raw-database', databaseVersion: NEWER });
  expect(copy.stores).toEqual(JSON.parse(JSON.stringify(before.stores)));
  expect(await dump(other)).toEqual(before);

  // Reload, asked for: the same again (no newer version can be had here), and still only once.
  await Promise.all([page.waitForEvent('load'), page.getByTestId('newer-reload').click()]);
  await expect(said).toBeVisible();
  await page.waitForTimeout(1500);
  expect(loads).toBe(2);
  expect(await dump(other)).toEqual(before);
  expect(await localNow()).toBe(local);
});

// A bed's conditions (Plant this bed) came with database version 4; a version-3 page drops them. Its unsaved edits, a
// journal written without them, are kept as a plan of their own, never put over a plan saved at 4 (src/storage.ts
// replayJournals): the bed keeps its answers.
test('a version-3 page’s unsaved edits to a plan saved at 4 are kept apart: the bed keeps its conditions', async ({ page, context }) => {
  const CONDITIONS = { soil: 'clay', moisture: 'wet', drip: true };
  const bed = { id: 'bed1', type: 'rect', x: 4, y: 4, width: 8, height: 4, rotation: 0, color: '#a16207', label: 'Front bed', opacity: 0.5, locked: false, role: 'bed' };
  const plan = RELEASE3.projects.p1 as Record<string, unknown>;
  const SAVED_AT_4: Records = {
    ...RELEASE3,
    projects: { p1: { ...plan, shapes: [circle('oak', 'Old oak'), { ...bed, conditions: CONDITIONS }], dbVersion: DB_VERSION, savedByPage: 'page-new', savedAt: 1000, savedSeq: 3 } },
  };
  const other = await otherTab(context);
  await holdAt(other, DB_VERSION, SAVED_AT_4);
  await other.evaluate(() => { (window as unknown as { held: IDBDatabase }).held.close(); });
  // The version-3 page's journal: later than the plan's last save, its bed without them, and an edit of its own.
  const journal = { projectId: 'p1', at: 2000, dbVersion: 3, page: 'page-v3', seq: 7, data: { ...plan, shapes: [circle('oak', 'Old oak'), bed, circle('new', 'Drawn in the older tab')] } };
  await other.evaluate((j) => { localStorage.setItem(`lp-journal:p1@${j.page}`, JSON.stringify(j)); }, journal);

  await page.goto('./');
  await expect(page.locator('.project-btn .pname')).toHaveText('Back Yard');
  await expect(page.getByTestId('kept-apart')).toContainText('“Back Yard (from an older tab)”');
  await expect(page.getByTestId('kept-apart')).toContainText('Nothing newer was replaced.');
  const after = await dump(other);
  const byName = Object.fromEntries(Object.entries(after.stores.meta).map(([id, m]) => [(m as { name: string }).name, after.stores.projects[id] as { shapes: Record<string, unknown>[] }]));
  expect(Object.keys(byName).sort()).toEqual(['Back Yard', 'Back Yard (from an older tab)']);
  expect(byName['Back Yard'].shapes.find((s) => s.id === 'bed1')).toMatchObject({ role: 'bed', conditions: CONDITIONS });
  expect(byName['Back Yard'].shapes.map((s) => s.label)).not.toContain('Drawn in the older tab');
  const apart = byName['Back Yard (from an older tab)'].shapes;
  expect(apart.map((s) => s.label)).toContain('Drawn in the older tab');
  expect(apart.find((s) => s.label === 'Front bed')).not.toHaveProperty('conditions');
  expect(await journals(other)).toEqual([]);
});

test("the update waits for an older tab still holding the database, says to close it, and goes on once it's closed, every record as it was", async ({ page, context }) => {
  // An older version's tab that can't answer (frozen in the background, say): it holds release 3's database open.
  const other = await otherTab(context);
  await holdAt(other, 1, RELEASE3);
  const before = await dump(other);
  expect(before.version).toBe(1);

  await page.goto('./');
  await expect(page.locator('#open-blocked')).toContainText('Close FullGrown’s other tabs or windows');
  await expect(page.locator('.project-btn')).toHaveCount(0);

  await other.evaluate(() => { (window as unknown as { held: IDBDatabase }).held.close(); });
  await expect(page.locator('.project-btn .pname')).toHaveText('Back Yard');
  await expect(page.locator('#open-blocked')).toHaveCount(0);
  await expect(page.locator('#canvas-svg text', { hasText: 'Old oak' })).toHaveCount(1);
  const after = await dump(other);
  expect(after.version).toBe(DB_VERSION);
  for (const s of ['meta', 'projects', 'images']) expect(after.stores[s]).toEqual(before.stores[s]);
  expect(after.stores.kv).toMatchObject(before.stores.kv);
});
