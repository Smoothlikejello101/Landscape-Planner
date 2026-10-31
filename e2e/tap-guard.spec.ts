import { test, expect, type Page } from '@playwright/test';
import { addKind, canvasBox, closeSheet, openFresh, shapeCount } from './helpers';

// Taps that land on what a tap just put there (src/tap-guard.ts; round 2 testing, Oct 30).
// (The other tests run with the guard off: playwright.config.ts. Here it's on.)
test.use({ storageState: { cookies: [], origins: [] } });

const banner = (page: Page) => page.getByTestId('place-banner');
async function placeButton(page: Page, name: string) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  return page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]');
}
async function centerOf(sel: ReturnType<Page['locator']>) {
  const b = (await sel.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('a double tap on Place starts placing; its second tap places nothing where the button was', async ({ page }) => {
  await openFresh(page);
  const at = await centerOf(await placeButton(page, 'Tennessee coneflower'));
  await page.mouse.dblclick(at.x, at.y);
  await expect(banner(page)).toHaveText(/^(Tap|Click) to place Tennessee coneflower · 0 placed$/);
  expect(await shapeCount(page)).toBe(0);
  // A tap a moment later is a tap.
  await page.waitForTimeout(400);
  await page.mouse.click(at.x, at.y - 60);
  await expect(banner(page)).toHaveText(/^(Tap|Click) to place Tennessee coneflower · 1 placed$/);
});

test('a double tap on the plan while placing places one plant, not two on top of each other', async ({ page }) => {
  await openFresh(page);
  await (await placeButton(page, 'Tennessee coneflower')).click();
  const box = await canvasBox(page);
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(banner(page)).toHaveText(/^(Tap|Click) to place Tennessee coneflower · 1 placed$/);
  expect(await shapeCount(page)).toBe(1);
});

test('a double tap on Done ends placing and opens nothing in its place', async ({ page }) => {
  await openFresh(page);
  await (await placeButton(page, 'Tennessee coneflower')).click();
  const box = await canvasBox(page);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const at = await centerOf(page.getByTestId('place-bar').getByRole('button', { name: 'Done' }));
  await page.mouse.dblclick(at.x, at.y);
  await expect(page.getByTestId('place-bar')).toHaveCount(0);
  await expect(page.getByTestId('add-sheet')).toHaveCount(0);
  await expect(page.locator('.sheet')).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 839 } });

  test("the tap that finishes a sun area's circle doesn't press the button that comes up under it", async ({ page }) => {
    await openFresh(page);
    const box = await canvasBox(page);
    const cx = box.x + box.width / 2;
    // Where the panel's button comes up: draw one, look, take it away.
    await addKind(page, 'sun', 'circle');
    await page.touchscreen.tap(cx, box.y + 80);
    await page.touchscreen.tap(cx, box.y + 200);
    const record = page.getByTestId('record-sun');
    await expect(record).toBeVisible();
    const at = await centerOf(record);
    await closeSheet(page);
    await page.locator('button[title=Undo]').click();
    await expect.poll(() => shapeCount(page)).toBe(0);
    await page.waitForTimeout(400);
    // Again, the second tap right where that button will be.
    await addKind(page, 'sun', 'circle');
    await page.touchscreen.tap(at.x, at.y - 120);
    await page.touchscreen.tap(at.x, at.y);
    await expect(record).toBeVisible(); // (still to press: no sun recorded)
    await expect(page.getByTestId('sun-summary')).toHaveCount(0);
  });
});
