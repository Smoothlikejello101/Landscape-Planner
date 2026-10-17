import { test, expect } from '@playwright/test';
import { autoDialogs, closeSheet, field } from './helpers';

// Drives the real previous version (localStorage) to create data, then opens
// the current version on the same origin and checks everything carried over.
test('projects made in the previous version migrate intact', async ({ page }) => {
  autoDialogs(page, 'Front Yard');
  await page.goto('/legacy/index.html');
  await expect(page.locator('.project-btn .pname')).toHaveText('My Garden');

  // Project 1: labelled circle and a rotated rectangle, plus a background image.
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

  // Open the new version.
  await page.goto('/');
  await expect(page.locator('.project-btn .pname')).toHaveText('Front Yard'); // last open project
  await expect(page.locator('#canvas-svg text', { hasText: 'Old pond' })).toHaveCount(1);

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
