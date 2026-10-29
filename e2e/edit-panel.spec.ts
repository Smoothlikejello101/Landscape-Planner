import { test, expect, type Page } from '@playwright/test';
import { addKind, canvasBox, closeSheet, openFresh, openSections, shapeCount, zoomPct, placeOnceAtCenter } from './helpers';

// The compact properties panel, statuses that fit the thing, and getting
// started from an aerial photo.

const FT = 24; // px per foot at 100%; canvas pixel 24*k is k-10 ft
async function tapFt(page: Page, kx: number, ky: number) {
  const box = await canvasBox(page);
  await page.mouse.click(box.x + kx * FT, box.y + ky * FT);
}
const head = (page: Page, key: string) => page.locator(`.sheet [data-section=${key}]`);

test('properties show one row per group with its current state; a tap opens it', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.bed').click();
  await page.locator('[data-testid=draw-bar] [data-method=rect]').click();
  await tapFt(page, 2, 2); await tapFt(page, 12, 2); await tapFt(page, 12, 6);
  await page.locator('.sel-pill .edit').click();
  await expect(head(page, 'status')).toContainText('Planned'); // a new bed is a plan
  await expect(head(page, 'bed')).toContainText('None yet');
  await expect(head(page, 'size')).toContainText('10 × 4 ft · 40 sq ft');
  await expect(head(page, 'position')).toContainText('x -8, y -8');
  await expect(page.locator('.sheet .prop-section.open')).toHaveCount(0);
  await expect(page.locator('.sheet input[type=number]:visible')).toHaveCount(0); // nothing to wade through
  await head(page, 'size').click();
  await expect(page.locator('.sheet .field', { hasText: 'Width (ft)' }).locator('input')).toBeVisible();
  // Typing updates the row's summary in place (no rebuild, so the keyboard stays).
  const w = page.locator('.sheet .field', { hasText: 'Width (ft)' }).locator('input');
  await w.fill('12');
  await expect(w).toBeFocused();
  await expect(head(page, 'size')).toContainText('12 × 4 ft · 48 sq ft');
  await closeSheet(page);
  // Opened groups stay open for the next thing selected.
  await page.locator('.sel-pill .edit').click();
  await expect(page.getByTestId('section-size')).toHaveClass(/open/);
  await expect(page.locator('.sheet .action-row button')).toHaveText(['Arrange', 'Duplicate', 'Delete']);
});

test('an outline or path puts Edit points before its size', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.path').click();
  await tapFt(page, 2, 4); await tapFt(page, 12, 4);
  await page.locator('[data-testid=draw-bar]').getByRole('button', { name: 'Done' }).click();
  await page.locator('.sel-pill .edit').click();
  await expect(head(page, 'size')).toContainText('10 ft long · 3 ft wide');
  await head(page, 'size').click();
  const items = page.locator('[data-testid=section-size] .prop-body > *');
  await expect(items.first()).toContainText('Edit points');
});

test("a path's chip goes straight to its points, its width there too; a line has no turning knob", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.path').click();
  await tapFt(page, 2, 4); await tapFt(page, 12, 4);
  await page.locator('[data-testid=draw-bar]').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-role=shape-rotate]')).toHaveCount(0);
  await page.getByTestId('pill-edit-points').click();
  await expect(page.locator('[data-testid=draw-bar]').getByRole('button', { name: 'Delete point' })).toBeVisible();
  const w = page.getByTestId('edit-path-width');
  await expect(w).toHaveValue('3');
  await w.fill('5');
  await expect(w).toBeFocused(); // (typed without rebuilding the bar: the keyboard stays)
  await page.locator('[data-testid=draw-bar]').getByRole('button', { name: 'Done' }).click();
  await openSections(page);
  await expect(head(page, 'size')).toContainText('10 ft long · 5 ft wide');
});

test('statuses fit the thing: a house is Existing, not Planted', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'building');
  await tapFt(page, 2, 2); await tapFt(page, 12, 2); await tapFt(page, 12, 8);
  await page.locator('.sel-pill .edit').click();
  await expect(head(page, 'status')).toContainText('Existing');
  await head(page, 'status').click();
  await expect(page.locator('.sheet .status-chip')).toHaveText(['Not set', 'Planned', 'Existing', 'To remove', 'Gone']);
  await expect(page.getByTestId('planted-on')).toHaveCount(0);
  await closeSheet(page);
  // Sun exposure has no status at all.
  await addKind(page, 'sun', 'circle');
  await tapFt(page, 6, 12); await tapFt(page, 9, 12);
  await expect(page.locator('.sheet-header .title')).toHaveText('Sun exposure');
  await expect(head(page, 'status')).toHaveCount(0);
  await expect(page.getByTestId('section-sun')).toHaveClass(/open/); // opens on its sun record
});

test('new plants start as Planned, or join the status the plan is showing', async ({ page }) => {
  await openFresh(page);
  const place = async (name: string) => {
    await page.locator('.tool-btn.plants').click();
    await page.locator('.sheet input[type=text]').fill(name);
    await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
    await placeOnceAtCenter(page);
  };
  await place('Purple Coneflower');
  await page.locator('.sel-pill .edit').click();
  await expect(head(page, 'status')).toContainText('Planned');
  await head(page, 'status').click();
  await page.locator('.sheet .status-chip', { hasText: 'Planted' }).click();
  await closeSheet(page);
  // Show only planted plants: a plant placed now is planted too, so it doesn't vanish.
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('filter-status').selectOption('planted');
  await closeSheet(page);
  await place('Black-eyed Susan');
  expect(await shapeCount(page)).toBe(2);
  await expect(page.locator('#canvas-svg [data-role=plant-label]', { hasText: 'American Gold Rush' })).toHaveCount(1); // in view, named
});

test('an empty plan offers to start from an aerial photo', async ({ page }) => {
  await openFresh(page);
  await page.getByTestId('add-btn').click();
  await expect(page.getByTestId('add-photo')).toContainText('Aerial photo');
  await page.locator('[data-testid=add-sheet] .sheet-header button').click();
  await page.getByTestId('start-photo').click();
  await expect(page.locator('.sheet-header .title')).toContainText('Background');
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await expect(page.locator('.mode-banner')).toContainText('Calibrating');

  // While calibrating, a drag pans and a pinch zooms; only taps place points.
  const box = await canvasBox(page);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const before = await page.locator('#canvas-svg [data-layer=grid]').evaluate((n) => n.outerHTML);
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 40, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('.mode-banner')).toContainText('first known point'); // no point placed
  expect(await page.locator('#canvas-svg [data-layer=grid]').evaluate((n) => n.outerHTML)).not.toBe(before); // the plan moved
  await page.evaluate(({ cx, cy }) => {
    const fire = (type: string, id: number, x: number, y: number) => {
      document.getElementById('canvas-svg')!.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, pointerType: 'touch' }));
    };
    fire('pointerdown', 1, cx - 50, cy); fire('pointerdown', 2, cx + 50, cy);
    for (let i = 1; i <= 10; i++) fire('pointermove', 2, cx + 50 + i * 10, cy);
    fire('pointerup', 2, cx + 150, cy); fire('pointerup', 1, cx - 50, cy);
  }, { cx, cy });
  expect(await zoomPct(page)).toBe(200);
  await expect(page.locator('.mode-banner')).toContainText('first known point');
  await page.mouse.click(cx - 50, cy);
  await expect(page.locator('.mode-banner')).toContainText('second known point');
  // With a photo, the plan no longer offers one.
  await page.locator('.mode-banner button').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('start-photo')).toHaveCount(0);
});
