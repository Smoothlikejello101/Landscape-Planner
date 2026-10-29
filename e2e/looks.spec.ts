import { test, expect } from '@playwright/test';
import { openFresh, tapFromCenter } from './helpers';

// Plants drawn as pictures (src/looks.ts; Jason, Oct 27–29: R5c, every plant in bloom), or as plain circles from
// Layers, on this device.

test('a placed plant is drawn as a picture in bloom; Layers turns pictures off on this device, and back on', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Buttonbush');
  await page.locator('.sheet .proj-row', { hasText: 'Buttonbush' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  const look = page.locator('#canvas-svg [data-role=plant-look]');
  await expect(look).toHaveCount(1);
  // (Its blooms, in its first flower color: cream.)
  await expect(look.locator('[fill="#f1e6c4"]').first()).toBeAttached();
  await page.locator('button[title=Layers]').click();
  const sw = page.getByTestId('plant-looks');
  await expect(sw).toBeChecked();
  await sw.uncheck();
  await expect(look).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#canvas-svg [data-shape-group]')).toHaveCount(1);
  await expect(look).toHaveCount(0);
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('plant-looks').check();
  await expect(look).toHaveCount(1);
});
