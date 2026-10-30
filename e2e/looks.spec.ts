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
  // (Its blooms, in its first flower color: white.)
  await expect(look.locator('[fill="#f7f4ec"]').first()).toBeAttached();
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

test("a color picked for a plant draws its picture's leaves, and Default color brings back its own colors", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Buttonbush');
  await page.locator('.sheet .proj-row', { hasText: 'Buttonbush' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await tapFromCenter(page, 0, 0);
  await page.locator('.sel-pill button.edit').click();
  const look = page.locator('#canvas-svg [data-role=plant-look]');
  // (Its own colors: green leaves, no Default color to go back to.)
  await expect(look.locator('[fill="#6f9a4a"]').first()).toBeAttached();
  await expect(page.getByTestId('default-color')).toHaveCount(0);
  await page.locator('[data-section=look]').click();
  await page.locator('.swatch').nth(8).click(); // #ef4444
  await expect(look.locator('[fill="#ef4444"]').first()).toBeAttached();
  await expect(look.locator('[fill="#f7f4ec"]').first()).toBeAttached(); // (its blooms keep their color)
  await page.getByTestId('default-color').click();
  await expect(look.locator('[fill="#ef4444"]')).toHaveCount(0);
  await expect(look.locator('[fill="#6f9a4a"]').first()).toBeAttached();
  await expect(page.getByTestId('default-color')).toHaveCount(0);
});

test('the tallest plant is drawn on top, see-through over a plant growing under it (Jason, Oct 30)', async ({ page }) => {
  await openFresh(page);
  const place = async (name: string, dx: number) => {
    await page.locator('.tool-btn.plants').click();
    await page.getByTestId('plant-search').fill(name);
    await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
    await tapFromCenter(page, dx, 0);
    await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  };
  await place('Creeping phlox', 0); // (placed first, then the shrub over it: the shrub still on top)
  await page.keyboard.press('Escape');
  await place('Buttonbush', 1);
  const groups = page.locator('#canvas-svg [data-shape-group]');
  const names = await groups.evaluateAll((gs) => gs.map((g) => g.querySelector('text')?.textContent ?? ''));
  expect(names.findIndex((n) => /Buttonbush/.test(n))).toBeGreaterThan(names.findIndex((n) => /phlox/i.test(n)));
  await expect(page.locator('#canvas-svg [data-role=plant-look][data-see-through=true]')).toHaveCount(1);
  // A tap on the phlox, through the shrub, picks the phlox; elsewhere on the shrub, the shrub.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450); // (not a double tap)
  await tapFromCenter(page, 0, 0);
  await expect(page.locator('.sel-pill .name')).toHaveText('Creeping phlox');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  await tapFromCenter(page, 3, 0);
  await expect(page.locator('.sel-pill .name')).toHaveText('Buttonbush');
});
