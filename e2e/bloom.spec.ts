import { test, expect, type Page } from '@playwright/test';
import { closeSheet, field, openFresh, addPlainShape, setRole, openSections, placeOnceAtCenter } from './helpers';

async function addPlant(page: Page, name: string, x: number) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await field(page, 'X position').fill(String(x));
  await field(page, 'Y position').fill('1');
  await closeSheet(page);
}

test('bloom calendar for a bed and for the whole plan', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'rect');
  await field(page, 'Label').fill('Front bed');
  await setRole(page, 'Bed');
  await field(page, 'X position').fill('0');
  await field(page, 'Y position').fill('0');
  await field(page, 'Width (ft)').fill('12');
  await closeSheet(page);
  await addPlant(page, "Heuchera 'Autumn Bride'", 2);
  await addPlant(page, "Heuchera 'Autumn Bride'", 4);
  await addPlant(page, 'Little bluestem', 30); // outside the bed

  // The bed's properties show its own plants by month.
  await page.locator('button[title=Layers]').click();
  await page.locator('.layer-row', { hasText: 'Front bed' }).click();
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  const chart = page.getByTestId('bloom-chart');
  await expect(chart.locator('.bloom-name').nth(1)).toHaveText("Heuchera 'Autumn Bride' ×2");
  await expect(chart.locator('.bloom-cell.on').first()).toBeVisible();
  await expect(page.getByTestId('bloom-gaps')).toContainText('Nothing in bloom in');
  await closeSheet(page);

  // The whole plan, bed by bed, from the menu.
  await page.locator('.iconbtn[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Bloom calendar' }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Bloom calendar');
  await expect(page.locator('.bloom-group .section-label')).toHaveText(['Front bed', 'Not in a bed']);
});
