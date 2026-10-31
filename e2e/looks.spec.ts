import { test, expect } from '@playwright/test';
import { openFresh, tapFromCenter, zoomPct } from './helpers';

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
  // (Its leaf color behind a link: Jason, Oct 30, Look demoted for plants drawn as pictures; no opacity there.)
  await expect(page.locator('.sheet .field', { hasText: 'Opacity' })).toHaveCount(0);
  await page.getByTestId('leaf-color-toggle').click();
  await page.locator('.sheet .swatches .swatch').nth(8).click(); // #ef4444
  await expect(look.locator('[fill="#ef4444"]').first()).toBeAttached();
  await expect(look.locator('[fill="#f7f4ec"]').first()).toBeAttached(); // (its blooms keep their color)
  await page.getByTestId('default-color').click();
  await expect(look.locator('[fill="#ef4444"]')).toHaveCount(0);
  await expect(look.locator('[fill="#6f9a4a"]').first()).toBeAttached();
  await expect(page.getByTestId('default-color')).toHaveCount(0);
});

test('a plant under a shorter, solid one: a pin and its name over it, outlined while that one is selected; a press near its middle picks it (Jason, Oct 30)', async ({ page }) => {
  await openFresh(page);
  const place = async (name: string, dx: number) => {
    await page.locator('.tool-btn.plants').click();
    await page.getByTestId('plant-search').fill(name);
    await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
    await tapFromCenter(page, dx, 0);
    await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
    await page.keyboard.press('Escape');
  };
  await place('Creeping phlox', 0);
  await place('Mountain mint', 0.5); // (3½ ft: solid, under the canopy height; its middle over the phlox's)
  await expect(page.locator('#canvas-svg [data-see-through=true]')).toHaveCount(0);
  const over = page.locator('#canvas-svg g[data-role=hidden-over]');
  await expect(over.locator('[data-role=hidden-rim][data-mark=pin]')).toHaveCount(1);
  await expect(over.locator('text')).toContainText('Creeping phlox');
  await page.waitForTimeout(450); // (not a double tap)
  await tapFromCenter(page, 0, 0);
  await expect(page.locator('.sel-pill .name')).toHaveText('Creeping phlox');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  await tapFromCenter(page, 1.5, 0);
  await expect(page.locator('.sel-pill .name')).toHaveText('Mountain mint');
  // (The mint selected: the phlox under it outlined, to see how far it reaches.)
  await expect(over.locator('[data-role=hidden-rim][data-mark=outline]')).toHaveCount(1);
});

test("a hidden plant's pin shrinks as the plan zooms out, and goes below 30%; zoomed back in, it's back (Jason, Oct 31)", async ({ page }) => {
  await openFresh(page);
  const place = async (name: string, dx: number) => {
    await page.locator('.tool-btn.plants').click();
    await page.getByTestId('plant-search').fill(name);
    await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
    await tapFromCenter(page, dx, 0);
    await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
    await page.keyboard.press('Escape');
  };
  await place('Creeping phlox', 0);
  await place('Mountain mint', 0.5);
  const pins = page.locator('#canvas-svg g[data-role=hidden-over] [data-role=hidden-rim][data-mark=pin]');
  await expect(pins).toHaveCount(1);
  const radius = async () => Number(await pins.locator('circle').first().getAttribute('r'));
  let last = await radius();
  expect(last).toBe(4.5);
  const zoomOut = page.getByRole('button', { name: 'Zoom out' });
  // (Smaller with each step out, until the plant's a speck or the plan's below 30%: then none.)
  for (let i = 0; i < 20 && (await zoomPct(page)) >= 30; i++) {
    await zoomOut.click();
    if (!(await pins.count())) break;
    const r = await radius();
    expect(r).toBeLessThanOrEqual(last);
    last = r;
  }
  expect(last).toBeLessThan(4.5); // (smaller before it went)
  for (let i = 0; i < 20 && (await zoomPct(page)) >= 30; i++) await zoomOut.click();
  await expect(pins).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=pin-hit]')).toHaveCount(0);
  for (let i = 0; i < 20 && (await zoomPct(page)) < 60; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(pins).toHaveCount(1);
});

test('the tallest plant is drawn on top, see-through as a canopy over a plant growing under it (Jason, Oct 30)', async ({ page }) => {
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

test('a run of the same small plant is named once, at its middle (Jason, Oct 30: a column of "Creeping liriope")', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Creeping phlox');
  await page.locator('.sheet .proj-row', { hasText: 'Creeping phlox' }).first().locator('[data-testid=plant-place]').click();
  for (let i = 0; i < 6; i++) await tapFromCenter(page, -4 + i, 0); // (1 ft apart, on the snap steps)
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await page.keyboard.press('Escape');
  const labels = page.locator('#canvas-svg [data-role=plant-label]');
  await expect(labels.filter({ hasText: 'Creeping phlox' })).toHaveCount(1);
  await expect(labels.filter({ hasText: 'Creeping phlox' })).toHaveText('Creeping phlox ×6');
});
