import { test, expect, type Page } from '@playwright/test';
import { addKind, openFresh, shapeCount, tapFromCenter } from './helpers';

// What a keyboard and mouse are expected to do on a laptop or desktop (asked for by Jason, 2026-10-25).

async function centerOf(page: Page, selector: string, n = 0) {
  const b = (await page.locator(selector).nth(n).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function clickWith(page: Page, key: string, p: { x: number; y: number }) {
  await page.keyboard.down(key); await page.mouse.click(p.x, p.y); await page.keyboard.up(key);
}

test('Esc is done drawing, as Done is; with too few taps to make anything it puts the drawing away', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'bed');
  for (const [x, y] of [[-6, -3], [2, -3], [2, 3]]) await tapFromCenter(page, x, y);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  expect(await shapeCount(page)).toBe(1);
  await expect(page.locator('.sel-pill')).toBeVisible(); // (the new bed, as Done leaves it)
  await addKind(page, 'path');
  await tapFromCenter(page, 6, 6);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  expect(await shapeCount(page)).toBe(1);
});

test('Shift, Ctrl or Cmd with a click adds to the selection or takes out; with a drag, adds what a box touches', async ({ page }) => {
  await openFresh(page);
  for (const dx of [-5, 0, 5]) {
    await addKind(page, 'plain', 'rect');
    for (const [x, y] of [[dx - 2, -1.5], [dx + 2, -1.5], [dx, 1.5]]) await tapFromCenter(page, x, y);
    await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  }
  const shapes = '#canvas-svg rect[data-shape-id]';
  const [a, b, c] = [await centerOf(page, shapes, 0), await centerOf(page, shapes, 1), await centerOf(page, shapes, 2)];
  const count = page.locator('.multi-bar .count');
  await page.mouse.click(a.x, a.y);
  await clickWith(page, 'Control', b);
  await expect(count).toHaveText('2 selected');
  await clickWith(page, 'Meta', c);
  await expect(count).toHaveText('3 selected');
  await clickWith(page, 'Shift', b); // out again
  await expect(count).toHaveText('2 selected');
  await clickWith(page, 'Control', { x: a.x, y: a.y + 150 }); // missed: what's selected stays
  await expect(count).toHaveText('2 selected');
  // A plain click picks just the one; a Shift-drag adds the two a box touches.
  await page.mouse.click(c.x, c.y);
  await expect(page.locator('.sel-pill')).toBeVisible();
  await page.keyboard.down('Shift');
  await page.mouse.move(a.x - 60, a.y + 60); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(count).toHaveText('3 selected');
});

test('the picker opens with the cursor in its search where there is a keyboard, not on a phone; Esc closes it', async ({ page }, info) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const search = page.getByTestId('plant-search');
  await expect(search).toBeVisible();
  if (info.project.name === 'phone') {
    await expect(search).not.toBeFocused(); // (its keyboard would cover the list)
    return;
  }
  await expect(search).toBeFocused();
  await page.keyboard.type('cone');
  await expect(search).toHaveValue('cone');
  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
  // Opened again: the cursor's there again.
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('plant-search')).toBeFocused();
});
