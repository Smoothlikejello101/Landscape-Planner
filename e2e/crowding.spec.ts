import { test, expect, type Page } from '@playwright/test';
import { closeSheet, field, openFresh, openSections, placeOnceAtCenter } from './helpers';

async function addPlant(page: Page, name: string, x: number) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().click();
  await placeOnceAtCenter(page);
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await field(page, 'X position').fill(String(x));
}

test('plants planted too close are flagged, and can be outlined', async ({ page }) => {
  await openFresh(page);
  await addPlant(page, "Heuchera 'Autumn Bride'", 0);
  await expect(page.getByTestId('crowding')).toHaveCount(0);
  await closeSheet(page);
  await addPlant(page, "Heuchera 'Autumn Bride'", 0.5);
  await expect(page.getByTestId('crowding')).toContainText('Planted closer than usual to one neighbor');
  await expect(page.getByTestId('crowding')).toContainText('0.5 ft apart');
  await closeSheet(page);

  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(0);
  await page.locator('button[title=Layers]').click();
  await expect(page.locator('.check-row', { hasText: 'Outline crowded plants' })).toContainText('(2 now)');
  await page.getByTestId('show-crowding').check();
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);

  // Spread them out: the outlines go.
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await field(page, 'X position').fill('12');
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(0);
});
