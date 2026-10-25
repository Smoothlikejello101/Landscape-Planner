import { test, expect } from '@playwright/test';
import { addKind, closeSheet, openFresh, openSections, tapFromCenter } from './helpers';

// One word per idea: sheets named after the thing, buttons that say what they start, "Existing" for what isn't
// a plant, and view switches that stay as they were left.

test('a bed is called a bed: its sheet, its More button, its status in Layers', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'bed', 'rect');
  for (const [x, y] of [[-3, -2], [3, -2], [0, 2]]) await tapFromCenter(page, x, y);
  await expect(page.getByTestId('pill-place-more')).toHaveText('Another bed');
  await page.locator('.sel-pill .edit').click();
  await openSections(page);
  await expect(page.locator('.sheet-header .title')).toHaveText('Bed');
  await expect(page.locator('.sheet .field', { hasText: 'Length (ft)' }).locator('input')).toHaveValue('4');
  await page.locator('.sheet .status-chip, .sheet button', { hasText: /^Existing$/ }).first().click();
  await closeSheet(page);
  await page.locator('button[title=Layers]').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Layers · 1 shape');
  const row = page.locator('.layer-row').first();
  await expect(row).toContainText('Existing');
  await expect(row).not.toContainText(/Planted|\d{4}-\d\d-\d\d/); // (no planting date on a bed)
});

test('full-size rings stay on after a reload; the top Undo takes back a plant while placing', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Autumn Bride');
  await page.locator('.proj-row', { hasText: "Heuchera 'Autumn Bride'" }).locator('[data-testid=plant-place]').click();
  const undo = page.locator('button[title=Undo]');
  await expect(undo).toBeDisabled();
  await tapFromCenter(page, 0, 0);
  await tapFromCenter(page, 3, 0);
  await expect(page.getByTestId('place-banner')).toContainText('2 placed');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByTestId('place-banner')).toContainText('1 placed');
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  // (Plants section of Layers: shown once there's a plant.)
  await page.locator('button[title=Layers]').click();
  const rings = () => page.locator('label', { hasText: 'Show full-size rings on every plant' }).locator('input');
  await rings().check();
  await closeSheet(page);
  await page.waitForTimeout(600);
  await page.reload();
  await page.locator('button[title=Layers]').click();
  await expect(rings()).toBeChecked();
});
