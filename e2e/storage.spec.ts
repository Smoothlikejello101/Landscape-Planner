import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openFresh, autoDialogs, shapeCount, clickRedo, closeSheet, field, addPlainShape, openExport, answerAsk, openWarnings } from './helpers';

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
  expect(download.suggestedFilename()).toMatch(/^fullgrown-backup-\d{4}-\d{2}-\d{2}\.fullgrown\.json$/);
  const file = await download.path();
  await expect(page.locator('#toast')).toContainText(/Backed up 2 projects to your Downloads: fullgrown-backup-.*To bring them back, open Projects and (tap|click) Import from file/);
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

// Settings → Warnings' switches go with the plan (Jason, Nov 1: "What's checked (and dismissed) goes with this plan, on
// all your devices"): a new plan starts with every warning on, "Same garden?" copies them, and a backup carries them.
test('the warning switches go with the plan: a new one starts all on, "Same garden?" copies them, a backup carries them (Jason, Nov 1)', async ({ page, browser }) => {
  await openFresh(page);
  const ids = ['show-crowding', 'crowd-warnings', 'sun-warnings', 'hardy-warnings', 'poison-warnings', 'fruit-warnings'];
  const switches = async (p = page) => {
    await openWarnings(p, 'crowding', 'sun', 'hardy', 'poison', 'fruit');
    const out = await Promise.all(ids.map((t) => p.getByTestId(t).isChecked()));
    await closeSheet(p);
    return out;
  };
  await openWarnings(page, 'poison', 'sun');
  await page.getByTestId('poison-warnings').uncheck();
  await page.getByTestId('sun-warnings').uncheck();
  await expect(page.getByTestId('warnings')).toContainText('What’s checked (and dismissed) goes with this plan, on all your devices.');
  await closeSheet(page);
  const newPlan = async (name: string, same: boolean) => {
    await page.locator('.project-btn').click();
    await page.getByRole('button', { name: /New project/ }).click();
    const check = page.locator('.ask-overlay label', { hasText: 'Same garden?' }).locator('input');
    await expect(check).toBeChecked(); // (no ZIP, no one in the yard: offered for the warnings)
    if (!same) await check.uncheck();
    await page.getByTestId('ask-input').fill(name);
    await page.getByTestId('ask-ok').click();
    await expect(page.locator('.project-btn .pname')).toHaveText(name);
  };
  await newPlan('Back corner', true);
  expect(await switches()).toEqual([true, true, false, true, false, true]);
  await newPlan('Elsewhere', false);
  expect(await switches()).toEqual([true, true, true, true, true, true]);

  await page.locator('.project-btn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.backup-section button', { hasText: 'Back up all projects' }).click(),
  ]);
  const file = await download.path();
  const ctx = await browser.newContext();
  const fresh = await ctx.newPage();
  await openFresh(fresh);
  await fresh.locator('.project-btn').click();
  await fresh.locator('[data-testid=import-file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: readFileSync(file) });
  await expect(fresh.locator('#toast')).toContainText('Imported 3 projects');
  await fresh.locator('.proj-row', { hasText: 'Back corner' }).click();
  await expect(fresh.locator('.project-btn .pname')).toHaveText('Back corner');
  expect(await switches(fresh)).toEqual([true, true, false, true, false, true]);
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
  expect(download.suggestedFilename()).toMatch(/^my-garden-.*\.fullgrown\.json$/);
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

test('deleting a project offers to save a copy first: its file saved, as Save as a file does, then the project deleted (the UI review, 2026-11-01)', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'oval');
  await field(page, 'Label').fill('Pond');
  await closeSheet(page);
  await page.locator('.project-btn').click();
  await page.locator('button', { hasText: 'New project' }).click();
  await answerAsk(page, true, 'Back yard');
  await page.locator('.project-btn').click();
  await page.getByRole('button', { name: 'Delete My Garden' }).click();
  const ask = page.getByTestId('ask-delete-project');
  await expect(ask.locator('.ask-message')).toHaveText('Delete project \u201cMy Garden\u201d? This cannot be undone.');
  await expect(ask.locator('button')).toHaveText(['Save a copy first, then delete', 'Delete', 'Cancel']);
  // Cancel keeps it.
  await ask.getByTestId('ask-cancel').click();
  await expect(page.locator('.proj-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete My Garden' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    ask.getByTestId('ask-save-first').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^my-garden-\d{4}-\d{2}-\d{2}\.fullgrown\.json$/);
  await expect(page.locator('.proj-row')).toHaveCount(1);
  await expect(page.locator('#toast')).toContainText(`Saved ${download.suggestedFilename()} to your Downloads, then deleted \u201cMy Garden\u201d.`);
  // The copy brings it back.
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: readFileSync((await download.path())!) });
  await expect(page.locator('.project-btn .pname')).toHaveText('My Garden');
  await expect(page.locator('#canvas-svg text', { hasText: 'Pond' })).toHaveCount(1);
});

test.describe('late in the evening in Arkansas', () => {
  test.use({ timezoneId: 'America/Chicago' });
  test('every file the app names is dated that day, not the next as in UTC (the UI review, 2026-11-01)', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-01T04:25:00Z') }); // 11:25 PM on Oct 31 there
    await openFresh(page);
    await addPlainShape(page, 'rect');
    await closeSheet(page);
    // The picture.
    await openExport(page);
    await page.getByRole('button', { name: 'Download SVG' }).click();
    await expect(page.locator('.dl-link')).toHaveAttribute('download', /-2026-10-31\.svg$/);
    await page.getByRole('button', { name: 'Done' }).click();
    // The printable plan.
    await page.locator('button[title=More]').click();
    await page.locator('.menu-item', { hasText: 'Print or save as PDF' }).click();
    await page.getByTestId('create-pdf').click();
    await expect(page.getByTestId('pdf-ready')).toContainText('-2026-10-31.pdf');
    await page.locator('.sheet-header .iconbtn[aria-label=Close]').click();
    // The backup, and the plan's own file.
    await page.locator('.project-btn').click();
    const [backup] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.backup-section button', { hasText: 'Back up all projects' }).click(),
    ]);
    expect(backup.suggestedFilename()).toBe('fullgrown-backup-2026-10-31.fullgrown.json');
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.proj-row .iconbtn[title="Save project file"]').click(),
    ]);
    expect(file.suggestedFilename()).toBe('my-garden-2026-10-31.fullgrown.json');
  });
});

test('importing a file that is not a project shows an error', async ({ page }) => {
  const messages = autoDialogs(page);
  await openFresh(page);
  await page.locator('.project-btn').click();
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":true}') });
  await expect.poll(() => messages.join(' ')).toContain("isn't a FullGrown");
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
    await clickRedo(page);
    await clickRedo(page);
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

test('a plan file with markup hidden after its photo exports an SVG with that markup escaped, not live (weekly security check, Nov 1)', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  const tail = '" onload="window.pwned=1"/><script>window.pwned=1</script><image href="';
  const file = {
    format: 'landscape-planner-project', version: 1, exportedAt: '2026-11-01T00:00:00Z',
    project: { name: 'Doctored', lastModified: 1, data: {
      shapes: [{ id: 'r1', type: 'rect', x: -5, y: -5, w: 10, h: 10, rotation: 0, label: 'Shed' }],
      bgImage: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' + tail, naturalWidth: 100, naturalHeight: 100, ftPerPx: 0.1, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true },
    } },
  };
  await page.locator('.project-btn').click();
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('.project-btn .pname')).toHaveText('Doctored');
  await openExport(page);
  await page.locator('button', { hasText: 'Download SVG' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-picture').click()]);
  const svg = readFileSync((await download.path())!, 'utf8');
  expect(svg).toContain('base64,iVBORw0KGgo=&quot; onload=&quot;');
  expect(svg).not.toContain('<script');
  expect(svg).not.toContain('onload="');
});
