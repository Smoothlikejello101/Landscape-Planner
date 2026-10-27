import { test, expect, type Page } from '@playwright/test';
import { closeSheet, field, openFresh, openSections, placeOnceAtCenter } from './helpers';

async function addPlant(page: Page, name: string, x: number) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await field(page, 'X position').fill(String(x));
}

test('plants planted too close are flagged, and ringed on the plan unless that\'s turned off', async ({ page }) => {
  await openFresh(page);
  await addPlant(page, "Heuchera 'Autumn Bride'", 0);
  await expect(page.getByTestId('crowding')).toHaveCount(0);
  await closeSheet(page);
  await addPlant(page, "Heuchera 'Autumn Bride'", 0.5);
  await expect(page.getByTestId('crowding')).toContainText('Planted closer than usual to one neighbor');
  await expect(page.getByTestId('crowding')).toContainText('0.5 ft apart');
  await closeSheet(page);

  // Ringed by default (decided with Jason, 2026-10-25); Layers turns it off and on.
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);
  await page.locator('button[title=Layers]').click();
  await expect(page.getByTestId('crowding-settings')).toContainText('(0 close, 2 crowded now)');
  await page.getByTestId('show-crowding').uncheck();
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(0);
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('show-crowding').check();
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);

  // Spread them out: the outlines go.
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await field(page, 'X position').fill('12');
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(0);
});

test('plants crowd a tree only as much as they reach into its crown, a third of its height up', async ({ page }) => {
  await openFresh(page);
  await addPlant(page, 'Northern red oak', 0); // 60 ft: its crown can be raised to 20 ft
  await closeSheet(page);
  await addPlant(page, 'Spicebush', 4); // 11.5 ft: wholly under it
  await expect(page.getByTestId('crowding')).toHaveCount(0);
  await closeSheet(page);
  await addPlant(page, 'Eastern redbud', 9); // 25 ft: its top 5 ft in the oak's crown
  await expect(page.getByTestId('crowding')).toContainText('Planted closer than usual to one neighbor');
  await expect(page.getByTestId('crowding')).toContainText('Northern red oak: 9 ft apart, about 13.9 ft is usual, as one grows partly under the other');
});

test('a tree can be given its own lowest branches and height; an evergreen screen keeps its branches to the ground', async ({ page }) => {
  await openFresh(page);
  await addPlant(page, 'Northern red oak', 0);
  // Its lowest branches: a third of its 60 ft, unless set; its height, the plant's.
  await expect(page.getByTestId('lowest-branch')).toHaveAttribute('placeholder', '20');
  await expect(page.getByTestId('tree-height')).toHaveAttribute('placeholder', '60');
  // An older, taller oak: a third of its 90 ft, as soon as it's typed.
  await page.getByTestId('tree-height').fill('90');
  await expect(page.getByTestId('lowest-branch')).toHaveAttribute('placeholder', '30');
  await page.getByTestId('tree-height').fill('');
  await page.getByTestId('tree-height').dispatchEvent('change');
  await expect(page.getByTestId('lowest-branch')).toHaveAttribute('placeholder', '20');
  await page.getByTestId('lowest-branch').fill('0'); // never limbed up: branches to the ground
  await closeSheet(page);
  await addPlant(page, 'Spicebush', 4);
  await expect(page.getByTestId('crowding')).toContainText('Northern red oak: 4 ft apart');
  await closeSheet(page);
  // Green Giant arborvitae: NC State lists it as a dense evergreen screen.
  await addPlant(page, "Arborvitae 'Green Giant'", 60);
  await expect(page.getByTestId('lowest-branch')).toHaveAttribute('placeholder', '0');
  await expect(page.locator('.sheet .hint', { hasText: 'an evergreen screen keeps its branches to the ground' })).toHaveCount(1);
});
