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

/** Three plain rectangles side by side, drawn from the plan's middle. */
async function threeRects(page: Page) {
  for (const dx of [-5, 0, 5]) {
    await addKind(page, 'plain', 'rect');
    for (const [x, y] of [[dx - 2, -1.5], [dx + 2, -1.5], [dx, 1.5]]) await tapFromCenter(page, x, y);
    await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  }
}
const left = async (page: Page, n = 0) => (await page.locator('#canvas-svg rect[data-shape-id]').nth(n).boundingBox())!.x;

test('Ctrl+A selects everything on the plan; Ctrl+X cuts it, with Undo; Ctrl+V puts it back', async ({ page }) => {
  await openFresh(page);
  await threeRects(page);
  await page.keyboard.press('Escape'); // (nothing selected)
  await page.keyboard.press('Control+a');
  await expect(page.locator('.multi-bar .count')).toHaveText('3 selected');
  await page.keyboard.press('Control+x');
  expect(await shapeCount(page)).toBe(0);
  await expect(page.locator('#toast-action')).toContainText('Cut 3 plain shapes'); // (with an Undo)
  await page.keyboard.press('Control+v');
  expect(await shapeCount(page)).toBe(3);
  await expect(page.locator('.multi-bar .count')).toHaveText('3 selected');
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); // (back to the three, uncut)
  expect(await shapeCount(page)).toBe(3);
});

test('the arrow keys move what is selected (Shift: farther), one undo step a run; with nothing selected they move around the plan', async ({ page }) => {
  await openFresh(page);
  await threeRects(page);
  await page.keyboard.press('Escape');
  const shape = page.locator('#canvas-svg rect[data-shape-id]').nth(1);
  const b = (await shape.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  const x0 = await left(page, 1), other0 = await left(page, 0);
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight'); // (ten half feet)
  const x1 = await left(page, 1);
  expect(x1).toBeGreaterThan(x0);
  await page.keyboard.press('Shift+ArrowLeft'); // (five feet back)
  expect(Math.abs(await left(page, 1) - x0)).toBeLessThan(1);
  expect(await left(page, 0)).toBeCloseTo(other0, 0); // (the others stay)
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Control+z'); // (the run of moves, at once)
  expect(Math.abs(await left(page, 1) - x0)).toBeLessThan(1);
  // Nothing selected: the plan moves under the view.
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowRight');
  expect(await left(page, 0)).toBeLessThan(other0 - 10);
});

test('Ctrl + and Ctrl − zoom the plan, not the page', async ({ page }) => {
  await openFresh(page);
  const pct = async () => Number((await page.locator('.project-btn .pinfo').innerText()).match(/(\d+)%/)![1]);
  const start = await pct();
  await page.keyboard.press('Control+Equal');
  expect(await pct()).toBe(Math.round(start * 1.25));
  await page.keyboard.press('Control+Minus');
  expect(await pct()).toBe(start);
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
});

test('a trackpad\'s two-finger scroll moves around the plan; its pinch and a mouse wheel zoom', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'a trackpad or mouse');
  await openFresh(page);
  await threeRects(page);
  const pct = async () => Number((await page.locator('.project-btn .pinfo').innerText()).match(/(\d+)%/)![1]);
  type Wheel = { deltaX?: number; deltaY: number; deltaMode?: number; ctrlKey?: boolean };
  const wheel = (init: Wheel) => page.evaluate((i: Wheel) => {
    const svg = document.getElementById('canvas-svg')!, r = svg.getBoundingClientRect();
    svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, ...i }));
  }, init);
  const zoom0 = await pct(), x0 = await left(page);
  await wheel({ deltaX: 40.5, deltaY: 12.25 }); // (a trackpad: pixels, sideways, in fractions)
  await expect.poll(() => left(page)).toBeLessThan(x0 - 30);
  expect(await pct()).toBe(zoom0);
  await wheel({ deltaY: -8, ctrlKey: true }); // (a pinch outward)
  await expect.poll(pct).toBeGreaterThan(zoom0);
  const zoom1 = await pct();
  await page.waitForTimeout(350); // (past the trackpad's scroll)
  await wheel({ deltaY: 3, deltaMode: 1 }); // (a mouse wheel's notch, toward you: out)
  await expect.poll(pct).toBeLessThan(zoom1);
});
