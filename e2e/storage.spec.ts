import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openFresh, autoDialogs, shapeCount, closeSheet, field, addPlainShape } from './helpers';

test('an edit survives an immediate reload (saved when the page hides)', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'circle');
  await field(page, 'Label').fill('Saved fast');
  await closeSheet(page);
  await page.reload(); // no waiting for the save debounce
  await expect(page.locator('#canvas-svg text', { hasText: 'Saved fast' })).toHaveCount(1);
});

test('the background image survives a reload', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'background image' }).click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await page.locator('.mode-banner button').click();
  await page.reload();
  await expect(page.locator('#canvas-svg image')).toHaveCount(1);
  expect(await page.locator('#canvas-svg image').getAttribute('href')).toMatch(/^data:image\/jpeg;base64,/);
});

test('backup all projects, then restore them on a fresh device', async ({ page, browser }) => {
  autoDialogs(page, 'Front Yard');
  await openFresh(page);
  await addPlainShape(page, 'circle');
  await field(page, 'Label').fill('Garden oak');
  await closeSheet(page);
  await page.locator('.project-btn').click();
  await page.locator('button', { hasText: 'New project' }).click();
  await addPlainShape(page, 'rect');
  await field(page, 'Label').fill('Front bed');
  await closeSheet(page);

  await page.locator('.project-btn').click();
  await expect(page.locator('.backup-section')).toContainText('Last full backup: never');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.backup-section button', { hasText: 'Back up all projects' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^landscape-backup-\d{4}-\d{2}-\d{2}\.landscape\.json$/);
  const file = await download.path();
  await expect(page.locator('#toast')).toContainText('Backed up 2 projects');
  await expect(page.locator('.backup-section')).not.toContainText('never');

  // A brand-new browser profile = empty storage.
  const ctx = await browser.newContext();
  const fresh = await ctx.newPage();
  await openFresh(fresh);
  await fresh.locator('.project-btn').click();
  await fresh.locator('[data-testid=import-file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: readFileSync(file) });
  await expect(fresh.locator('#toast')).toContainText('Imported 2 projects');
  await expect(fresh.locator('.proj-row')).toHaveCount(3); // empty My Garden + two imported
  await fresh.locator('.proj-row', { hasText: 'Front Yard' }).click();
  await expect(fresh.locator('#canvas-svg text', { hasText: 'Front bed' })).toHaveCount(1);
  await fresh.locator('.project-btn').click();
  await fresh.locator('.proj-row', { hasText: 'My Garden (2)' }).click();
  await expect(fresh.locator('#canvas-svg text', { hasText: 'Garden oak' })).toHaveCount(1);
  await ctx.close();
});

test('a single project file imports and opens', async ({ page, browser }) => {
  await openFresh(page);
  await addPlainShape(page, 'oval');
  await field(page, 'Label').fill('Pond');
  await closeSheet(page);
  await page.locator('.project-btn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.proj-row .iconbtn[title="Save project file"]').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^my-garden-.*\.landscape\.json$/);
  const ctx = await browser.newContext();
  const fresh = await ctx.newPage();
  await openFresh(fresh);
  await fresh.locator('.project-btn').click();
  await fresh.locator('[data-testid=import-file]').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: readFileSync((await download.path())!) });
  await expect(fresh.locator('.project-btn .pname')).toHaveText('My Garden (2)');
  await expect(fresh.locator('#canvas-svg text', { hasText: 'Pond' })).toHaveCount(1);
  expect(await shapeCount(fresh)).toBe(1);
  await ctx.close();
});

test('importing a file that is not a project shows an error', async ({ page }) => {
  const messages = autoDialogs(page);
  await openFresh(page);
  await page.locator('.project-btn').click();
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":true}') });
  await expect.poll(() => messages.join(' ')).toContain("isn't a Landscape Planner");
});

test('undo and redo after adding a background image keep a single stored copy', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'background image' }).click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await page.locator('.mode-banner button').click();
  await addPlainShape(page, 'circle');
  await closeSheet(page);
  for (let i = 0; i < 3; i++) {
    await page.locator('button[title=Undo]').click();
    await page.locator('button[title=Undo]').click();
    await page.locator('button[title=Redo]').click();
    await page.locator('button[title=Redo]').click();
  }
  await page.waitForTimeout(600);
  const imageRecords = await page.evaluate(() => new Promise<number>((resolve) => {
    const open = indexedDB.open('landscape-planner');
    open.onsuccess = () => {
      const req = open.result.transaction('images').objectStore('images').count();
      req.onsuccess = () => resolve(req.result);
    };
  }));
  expect(imageRecords).toBe(1);
});

test('a failing save shows a warning without closing the keyboard', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'circle');
  const label = field(page, 'Label');
  await label.click();
  const handle = await label.elementHandle();
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException('disk full', 'QuotaExceededError'); };
    window.alert = () => {};
  });
  await page.keyboard.type('abc', { delay: 30 });
  await expect(page.locator('#save-warning')).toBeVisible();
  expect(await handle!.evaluate((n) => n.isConnected && document.activeElement === n)).toBe(true);
  await expect(label).toHaveValue('abc');
});
