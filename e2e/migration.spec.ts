import { test, expect, type Page } from '@playwright/test';
import { autoDialogs, canvasBox, closeSheet, drag, field, openFilters, openWarnings } from './helpers';

/** Each plan's stored "last modified" time, by name. */
const modifiedTimes = (page: Page) => page.evaluate(() => new Promise<Record<string, number>>((resolve) => {
  const open = indexedDB.open('landscape-planner');
  open.onsuccess = () => {
    const req = open.result.transaction('meta').objectStore('meta').getAll();
    req.onsuccess = () => { resolve(Object.fromEntries((req.result as { name: string; lastModified: number }[]).map((m) => [m.name, m.lastModified]))); open.result.close(); };
  };
}));

// Drives the real previous version (localStorage) to create data, then opens
// the current version on the same origin and checks everything carried over.
test('projects made in the previous version migrate intact', async ({ page }) => {
  autoDialogs(page, 'Front Yard');
  await page.goto('/legacy/index.html');
  await expect(page.locator('.project-btn .pname')).toHaveText('My Garden');

  // Project 1: labeled circle and a rotated rectangle, plus a background image.
  await page.locator('.tool-btn.circle').click(); // the previous version's toolbar
  await field(page, 'Label').fill('Old oak');
  await closeSheet(page);
  await page.locator('.tool-btn.rect').click(); // the previous version's toolbar
  await field(page, 'Label').fill('Old bed');
  await page.locator('.rot-quick button', { hasText: '+15°' }).click();
  await closeSheet(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'background image' }).click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await page.locator('.mode-banner button').click();

  // Project 2.
  await page.locator('.project-btn').click();
  await page.locator('button', { hasText: 'New project' }).click();
  await page.locator('.tool-btn.oval').click(); // the previous version's toolbar
  await field(page, 'Label').fill('Old pond');
  await closeSheet(page);
  await page.waitForTimeout(600); // old version saves on a 250 ms debounce
  const legacyKeys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(legacyKeys).toEqual(expect.arrayContaining(['lp-projects', 'lp-current']));
  const legacyTimes = await page.evaluate(() =>
    Object.fromEntries((JSON.parse(localStorage.getItem('lp-projects')!) as { name: string; lastModified: number }[]).map((p) => [p.name, p.lastModified])));

  // Open the new version.
  await page.goto('/');
  await expect(page.locator('.project-btn .pname')).toHaveText('Front Yard'); // last open project
  await expect(page.locator('#canvas-svg text', { hasText: 'Old pond' })).toHaveCount(1);
  // Each plan was last changed when it was in the old version: the update, and a Fit, a zoom or a pan after it,
  // change nothing in it (the UI review, 2026-11-01: Projects said "last modified" the minute Fit was tapped).
  await page.getByTestId('zoom-fit').click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const c = await canvasBox(page);
  await drag(page, { x: c.x + 20, y: c.y + 90 }, { x: c.x + 80, y: c.y + 130 }); // (from a corner, clear of the shapes)
  await page.waitForTimeout(600);
  expect(await modifiedTimes(page)).toEqual(legacyTimes);

  await page.locator('.project-btn').click();
  await expect(page.locator('.proj-row')).toHaveCount(2);
  await page.locator('.proj-row', { hasText: 'My Garden' }).click();
  await expect(page.locator('#canvas-svg text', { hasText: 'Old oak' })).toHaveCount(1);
  await expect(page.locator('#canvas-svg text', { hasText: 'Old bed' })).toHaveCount(1);
  await expect(page.locator('#canvas-svg rect[data-shape-id]')).toHaveAttribute('transform', /rotate\(15 /);
  await expect(page.locator('#canvas-svg image')).toHaveCount(1);

  // Data now lives in IndexedDB: a reload must not re-run the migration.
  await page.reload();
  await page.locator('.project-btn').click();
  await expect(page.locator('.proj-row')).toHaveCount(2);
});

/** Each plan's stored data, by name: the parts this test looks at. */
const storedPlans = (page: Page) => page.evaluate(() => new Promise<Record<string, Record<string, unknown>>>((resolve) => {
  const open = indexedDB.open('landscape-planner');
  open.onsuccess = () => {
    const db = open.result;
    const metas = db.transaction('meta').objectStore('meta').getAll();
    metas.onsuccess = () => {
      const req = db.transaction('projects').objectStore('projects').getAll();
      req.onsuccess = () => {
        const keys = db.transaction('projects').objectStore('projects').getAllKeys();
        keys.onsuccess = () => {
          const byId = Object.fromEntries((keys.result as string[]).map((k, i) => [k, req.result[i] as Record<string, unknown>]));
          resolve(Object.fromEntries((metas.result as { id: string; name: string }[]).map((m) => [m.name, byId[m.id]])));
          db.close();
        };
      };
    };
  };
}));

// The Plant list's ticks and who's in the yard are kept with the plan from Nov 1 (Jason). Plans made by the previous
// version open with nothing ticked, nothing else changed, and the yard this device had: here, kids and a dog, as a
// device that ran the guided introduction (Oct 28 on) kept them in 'lp-yard'.
test("plans from before open with nothing ticked and with who was in this device's yard, each plan its own after (Jason, Nov 1)", async ({ page }) => {
  autoDialogs(page, 'Front Yard');
  await page.goto('/legacy/index.html');
  await expect(page.locator('.project-btn .pname')).toHaveText('My Garden');
  await page.locator('.tool-btn.circle').click(); // the previous version's toolbar
  await field(page, 'Label').fill('Old oak');
  await closeSheet(page);
  await page.locator('.project-btn').click();
  await page.locator('button', { hasText: 'New project' }).click();
  await page.locator('.tool-btn.oval').click();
  await field(page, 'Label').fill('Old pond');
  await closeSheet(page);
  await page.waitForTimeout(600); // old version saves on a 250 ms debounce
  // (What this device kept per device before Nov 1.)
  await page.evaluate(() => {
    localStorage.setItem('lp-yard', JSON.stringify({ kids: true, dogs: 'hideToxic', cats: false, horses: false }));
    localStorage.setItem('lp-protect-line', 'answered');
  });
  const legacyTimes = await page.evaluate(() =>
    Object.fromEntries((JSON.parse(localStorage.getItem('lp-projects')!) as { name: string; lastModified: number }[]).map((p) => [p.name, p.lastModified])));

  await page.goto('/');
  await expect(page.locator('.project-btn .pname')).toHaveText('Front Yard');
  await expect(page.locator('#canvas-svg text', { hasText: 'Old pond' })).toHaveCount(1);
  // The yard this device had, in the picker's filters and its question answered.
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('picker-count')).toBeVisible();
  await expect(page.locator('.picker-filters > [data-testid=protect-line]:first-child')).toHaveCount(0);
  await openFilters(page);
  await expect(page.getByTestId('protect-kids')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('protect-dogs')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('dogs-hideToxic')).toBeChecked();
  await closeSheet(page);
  await page.waitForTimeout(600);
  // Nothing ticked, nothing else changed: not even when each plan last changed.
  expect(await modifiedTimes(page)).toEqual(legacyTimes);
  let plans = await storedPlans(page);
  for (const name of ['My Garden', 'Front Yard']) expect('bought' in plans[name]).toBe(false);
  // The other plan has it too.
  await page.locator('.project-btn').click();
  await page.locator('.proj-row', { hasText: 'My Garden' }).click();
  await expect(page.locator('#canvas-svg text', { hasText: 'Old oak' })).toHaveCount(1);
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('protect-dogs')).toHaveAttribute('aria-pressed', 'true');
  // Changed in one plan, it's that plan's: the other keeps its own, and the device's old record is left as it was.
  await page.getByTestId('protect-dogs').click();
  await expect(page.getByTestId('protect-dogs')).toHaveAttribute('aria-pressed', 'false');
  await closeSheet(page);
  await page.locator('.project-btn').click();
  await page.locator('.proj-row', { hasText: 'Front Yard' }).click();
  await expect(page.locator('.project-btn .pname')).toHaveText('Front Yard');
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('protect-dogs')).toHaveAttribute('aria-pressed', 'true');
  await closeSheet(page);
  await page.waitForTimeout(600);
  plans = await storedPlans(page);
  expect(plans['Front Yard'].household).toEqual({ kids: true, dogs: 'hideToxic', cats: false, horses: false, answered: true }); // (taken: no time)
  expect(plans['My Garden'].household).toEqual({ kids: true, dogs: '', cats: false, horses: false, answered: true, at: expect.any(Number) });
  expect(await page.evaluate(() => localStorage.getItem('lp-yard'))).toBe(JSON.stringify({ kids: true, dogs: 'hideToxic', cats: false, horses: false }));
});

// The warning switches are kept with the plan from Nov 1 (Jason approved "What's checked (and dismissed) goes with this
// plan, on all your devices"). Plans made by the previous version take what this device had switched (here crowding
// rings and poison off, as a device that ran a version from Oct 25 on kept them), each plan its own after; a new plan
// starts with every warning on.
test("plans from before take this device's warning switches, each plan its own after; a new one starts all on (Jason, Nov 1)", async ({ page }) => {
  // (The previous version's own prompt names the second plan; this version's questions are answered below.)
  page.on('dialog', (d) => void d.accept(d.type() === 'prompt' ? 'Front Yard' : undefined));
  await page.goto('/legacy/index.html');
  await expect(page.locator('.project-btn .pname')).toHaveText('My Garden');
  await page.locator('.tool-btn.circle').click(); // the previous version's toolbar
  await field(page, 'Label').fill('Old oak');
  await closeSheet(page);
  await page.locator('.project-btn').click();
  await page.locator('button', { hasText: 'New project' }).click();
  await page.locator('.tool-btn.oval').click();
  await field(page, 'Label').fill('Old pond');
  await closeSheet(page);
  await page.waitForTimeout(600); // old version saves on a 250 ms debounce
  await page.evaluate(() => { localStorage.setItem('lp-crowding', 'off'); localStorage.setItem('lp-warn-poison', 'off'); });
  const legacyTimes = await page.evaluate(() =>
    Object.fromEntries((JSON.parse(localStorage.getItem('lp-projects')!) as { name: string; lastModified: number }[]).map((p) => [p.name, p.lastModified])));

  await page.goto('/');
  await expect(page.locator('.project-btn .pname')).toHaveText('Front Yard');
  const switches = async () => {
    await openWarnings(page, 'poison', 'hardy', 'crowding', 'fruit');
    const out = await Promise.all(['show-crowding', 'crowd-warnings', 'hardy-warnings', 'poison-warnings', 'fruit-warnings'].map((t) => page.getByTestId(t).isChecked()));
    return out;
  };
  expect(await switches()).toEqual([false, true, true, false, true]);
  await closeSheet(page);
  // Taken at the update, by every plan, with nothing else changed: not even when each last changed.
  const DEVICE = { showCrowding: { on: false }, crowdWarnings: { on: true }, hardyWarnings: { on: true }, poisonWarnings: { on: false }, fruitWarnings: { on: true } };
  let plans = await storedPlans(page);
  for (const name of ['My Garden', 'Front Yard']) expect(plans[name].switches).toEqual(DEVICE);
  expect(await modifiedTimes(page)).toEqual(legacyTimes);
  // Switched in one plan, it's that plan's.
  await openWarnings(page, 'poison');
  await page.getByTestId('poison-warnings').check();
  await closeSheet(page);
  await page.locator('.project-btn').click();
  await page.locator('.proj-row', { hasText: 'My Garden' }).click();
  await expect(page.locator('#canvas-svg text', { hasText: 'Old oak' })).toHaveCount(1);
  expect(await switches()).toEqual([false, true, true, false, true]);
  await closeSheet(page);
  // A new plan, not the same garden: every warning on.
  await page.locator('.project-btn').click();
  await page.getByRole('button', { name: /New project/ }).click();
  await page.locator('.ask-overlay label', { hasText: 'Same garden?' }).locator('input').uncheck();
  await page.getByTestId('ask-input').fill('Elsewhere');
  await page.getByTestId('ask-ok').click();
  await expect(page.locator('.project-btn .pname')).toHaveText('Elsewhere');
  expect(await switches()).toEqual([true, true, true, true, true]);
  await closeSheet(page);
  // After a reload, each as it was; the device's own keys left for an older version.
  await page.reload();
  await page.locator('.project-btn').click();
  await page.locator('.proj-row', { hasText: 'Front Yard' }).click();
  await expect(page.locator('.project-btn .pname')).toHaveText('Front Yard');
  expect(await switches()).toEqual([false, true, true, true, true]);
  plans = await storedPlans(page);
  expect(plans['Front Yard'].switches).toEqual({ ...DEVICE, poisonWarnings: { on: true, at: expect.any(Number) } });
  expect(await page.evaluate(() => [localStorage.getItem('lp-crowding'), localStorage.getItem('lp-warn-poison')])).toEqual(['off', 'off']);
});
