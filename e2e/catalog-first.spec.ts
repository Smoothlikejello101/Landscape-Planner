import { test, expect } from '@playwright/test';
import { openFresh, tapFromCenter } from './helpers';

// Jason, Oct 29: "a flash of dismissed warning rings when I first open the app (only after it was completely closed)".
// On a cold start the plan is drawn before plants.json is read; crowding judged without plants' heights rang plants a
// moment. Now what rests on plant facts (crowding rings, plants drawn as pictures) waits for the catalog.

test('reopened, a plan shows no crowding rings or plant pictures until the catalog is in, then both', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Snowberry');
  await page.locator('.sheet .proj-row', { hasText: 'Snowberry' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, -6, 0);
  await tapFromCenter(page, -4, 0); // (2 ft apart: crowded)
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  const crowded = page.locator('#canvas-svg [data-role=crowded]'), looks = page.locator('#canvas-svg [data-role=plant-look]');
  await expect(crowded).toHaveCount(2);
  await expect(looks).toHaveCount(2);
  // Opened again, the catalog held back: the plants drawn, plain, with no rings.
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  await page.route('**/plants.json', async (route) => { await held; await route.continue(); });
  await page.reload();
  await expect(page.locator('#canvas-svg [data-shape-group]')).toHaveCount(2);
  await page.waitForTimeout(500);
  await expect(crowded).toHaveCount(0);
  await expect(looks).toHaveCount(0);
  // The catalog in: the rings, and the pictures.
  release();
  await expect(crowded).toHaveCount(2);
  await expect(looks).toHaveCount(2);
});
