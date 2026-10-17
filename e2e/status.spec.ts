import { test, expect, type Page } from '@playwright/test';
import { autoDialogs, closeSheet, field, openFresh, shapeCount, openSections, placeOnceAtCenter, openExport } from './helpers';

async function addPlant(page: Page, name: string, x: number) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().click();
  await placeOnceAtCenter(page);
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await field(page, 'X position').fill(String(x));
}
const plantShapes = (page: Page) => page.locator('#canvas-svg circle[data-shape-id]');

test('track planted and planned plants by phase, view and print one phase', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);

  // Already in the ground.
  await addPlant(page, "Heuchera 'Autumn Bride'", 0);
  const status = page.getByTestId('status-section');
  await status.getByRole('radio', { name: 'Planted' }).click();
  await expect(page.getByTestId('planted-on')).not.toHaveValue('');
  await closeSheet(page);

  // Planned for fall, in a new phase.
  await addPlant(page, 'Little bluestem', 6);
  await status.getByRole('radio', { name: 'Planned' }).click();
  await page.getByTestId('phase-select').selectOption('__new');
  await page.getByTestId('new-phase').fill('Fall 2026');
  await expect(page.getByTestId('new-phase')).toBeFocused();
  await page.getByTestId('status-section').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('phase-select')).toHaveValue('Fall 2026');
  await closeSheet(page);
  // Planned plants draw with a dashed edge.
  await expect(plantShapes(page).nth(1)).toHaveAttribute('stroke-dasharray', '6 4');

  // To remove: a red cross. Gone: off the plan, still on record.
  await addPlant(page, 'Coneflower', 12);
  await status.getByRole('radio', { name: 'To remove' }).click();
  await expect(page.locator('#canvas-svg [data-role=status-remove]')).toHaveCount(1);
  await status.getByRole('radio', { name: 'Gone' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(plantShapes(page)).toHaveCount(2);
  expect(await shapeCount(page)).toBe(3);

  // Layers: show only fall's plants; the banner says so and clears it.
  await page.locator('button[title=Layers]').click();
  await expect(page.locator('.layer-row', { hasText: 'Little bluestem' })).toContainText('Planned · Fall 2026');
  await page.getByTestId('filter-phase').selectOption('Fall 2026');
  await closeSheet(page);
  await expect(plantShapes(page)).toHaveCount(1);
  await expect(page.getByTestId('filter-banner')).toContainText('Showing: Plants in Fall 2026');
  await page.getByTestId('filter-banner').getByRole('button', { name: 'Show all plants' }).click();
  await expect(plantShapes(page)).toHaveCount(2);

  // Gone plants can be shown again.
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('show-gone').check();
  await closeSheet(page);
  await expect(plantShapes(page)).toHaveCount(3);

  // Saved: statuses, dates and phases survive a reload.
  await page.waitForTimeout(600);
  await page.reload();
  await page.locator('button[title=Layers]').click();
  await expect(page.locator('.layer-row', { hasText: 'Autumn Bride' })).toContainText(/Planted \d{4}-\d{2}-\d{2}/);
  await expect(page.locator('.phase-row')).toContainText('Fall 2026');
  await closeSheet(page);

  // Print just fall's work.
  await openExport(page);
  await page.getByTestId('printable-plan').click();
  await page.getByTestId('print-phase').selectOption('Fall 2026');
  await page.getByTestId('create-pdf').click();
  await expect(page.getByTestId('print-result')).toContainText('1 page');
});

test('set status for several plants at once', async ({ page }) => {
  await openFresh(page);
  await addPlant(page, 'Coneflower', 0);
  await closeSheet(page);
  await addPlant(page, 'Coneflower', 5);
  await closeSheet(page);
  await page.getByTestId('select-mode').click();
  const box = (await page.locator('#canvas-svg').boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 60, box.y + box.height - 5, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
  await page.locator('.multi-bar button[title=Edit]').click();
  await page.getByTestId('status-section').getByRole('radio', { name: 'Planned' }).click();
  await expect(page.getByTestId('status-section').getByRole('radio', { name: 'Planned' })).toHaveAttribute('aria-checked', 'true');
  await closeSheet(page);
  await expect(plantShapes(page).first()).toHaveAttribute('stroke-dasharray', '6 4');
  await expect(plantShapes(page).last()).toHaveAttribute('stroke-dasharray', '6 4');
});
