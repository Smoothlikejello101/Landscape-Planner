import { test, expect, type Page } from '@playwright/test';
import { addKind, canvasBox, field, openFresh, openSections, zoomPct } from './helpers';

// Drawing numbers (src/draw-numbers.ts): the sides' lengths and the newest corner's angle while drawing and editing
// points, a typed length for the next side, Fit, and the yard's width on an empty plan.

// At the starting view (zoom 100%, 24 px per foot, view starting at -10 ft), canvas pixel 24*k is k-10 ft.
const FT = 24;
async function tapFt(page: Page, kx: number, ky: number) {
  const box = (await page.locator('#canvas-svg').boundingBox())!;
  await page.mouse.click(box.x + kx * FT, box.y + ky * FT);
}
const sides = (page: Page) => page.locator('#canvas-svg [data-role=side-length]');
const angles = (page: Page) => page.locator('#canvas-svg [data-role=corner-angle]');
const typed = (page: Page) => page.getByTestId('typed-length');

test("while drawing an outline: each side's length and the newest corner's angle; a typed side is exactly that long", async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'bed', 'poly');
  await expect(typed(page)).toHaveCount(0); // (no side to type until there's a first point)
  await tapFt(page, 2, 2);
  await tapFt(page, 12, 2);
  await expect(sides(page)).toHaveText(['10 ft']);
  await tapFt(page, 12, 8);
  await expect(sides(page)).toHaveText(['10 ft', '6 ft']);
  await expect(angles(page)).toHaveText(['90°']);
  // A typed side: the tap gives only its direction (a little off straight left: stuck to it).
  await expect(page.getByTestId('draw-bar')).toContainText('Next side');
  await typed(page).fill('7.5');
  await expect(page.locator('#canvas-svg [data-role=typed-guide]')).toHaveCount(1);
  await tapFt(page, 2.3, 8.2);
  await expect(sides(page)).toHaveText(['10 ft', '6 ft', '7.5 ft']);
  await expect(angles(page)).toHaveText(['90°']);
  await expect(typed(page)).toHaveValue(''); // (one side at a time)
  await tapFt(page, 2, 2); // closes it
  await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  // Editing its points: every side's length, the typed one still 7.5 ft (not squared away), and the closing side.
  await page.getByTestId('pill-edit-points').click();
  await expect(sides(page)).toHaveText(['10 ft', '6 ft', '7.5 ft', '6.5 ft']);
});

test("a rectangle from two typed sides: 10 ft, then 6 ft off it", async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'building');
  await tapFt(page, 2, 10);
  await expect(page.getByTestId('draw-bar')).toContainText('This side');
  await typed(page).fill('10');
  await tapFt(page, 14, 10.1);
  await expect(page.getByTestId('draw-bar')).toContainText('Other side');
  await expect(sides(page)).toHaveText(['10 ft']);
  await typed(page).fill('6');
  await tapFt(page, 8, 13); // (below the first side: the far side 6 ft below it, wherever the tap)
  await expect(page.getByTestId('draw-bar')).toHaveCount(0); // finished by itself
  await page.locator('.sel-pill .edit').click(); await openSections(page);
  await expect(field(page, 'Width (ft)')).toHaveValue('10');
  await expect(field(page, 'Length (ft)')).toHaveValue('6');
});

test('Fit (and Shift+1) brings the whole plan into view', async ({ page }) => {
  await openFresh(page);
  await expect(page.getByTestId('zoom-fit')).toHaveCount(0); // (nothing to fit)
  // (Zoomed out by hand, so a bed 30 ft wide fits on screen: the empty plan no longer asks the yard's width.)
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  const yardZoom = await zoomPct(page);
  // A bed, then zoomed far in: Fit puts it back in view.
  await addKind(page, 'bed', 'rect');
  const box = await canvasBox(page);
  const ppf = (24 * yardZoom) / 100;
  for (const [x, y] of [[10, 10], [40, 10], [40, 30]]) await page.mouse.click(box.x + box.width / 2 + (x - 30) * ppf, box.y + box.height / 2 + (y - 20) * ppf);
  await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByTestId('zoom-fit').click();
  const view = await canvasBox(page); // (the plan as it is now: taller once the drawing bar has gone)
  const shape = (await page.locator('#canvas-svg [data-shape-id]').first().boundingBox())!;
  expect(shape.x).toBeGreaterThanOrEqual(view.x);
  expect(shape.x + shape.width).toBeLessThanOrEqual(view.x + view.width);
  expect(shape.y).toBeGreaterThanOrEqual(view.y);
  expect(shape.y + shape.height).toBeLessThanOrEqual(view.y + view.height);
  const fitZoom = await zoomPct(page);
  // Shift+1 does the same.
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.locator('#canvas-svg').click({ position: { x: 5, y: 5 } }); // (the plan has the keys, not a button)
  await page.keyboard.press('Shift+Digit1');
  await expect.poll(() => zoomPct(page)).toBe(fitZoom);
});

test('typing every side of an outline closes it on the first point, no doubled corner; squaring keeps typed sides', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'bed', 'poly');
  await tapFt(page, 2, 2);
  // (Each tap only points the way: right, down, left, up.)
  for (const [x, y] of [[7, 2.05], [8.05, 6], [4, 8.05], [2.05, 4]]) { await typed(page).fill('6'); await tapFt(page, x, y); }
  await expect(page.getByTestId('draw-bar')).toHaveCount(0); // (the fourth side ended on the first point: closed)
  await page.getByTestId('pill-edit-points').click();
  await expect(sides(page)).toHaveText(['6 ft', '6 ft', '6 ft', '6 ft']);
  await page.getByTestId('draw-bar').getByRole('button', { name: 'Done' }).click();
  await page.keyboard.press('Escape'); // (nothing selected: the bottom bar back)
  await expect(page.getByTestId('add-btn')).toBeVisible();
  // Two typed sides and a tapped corner half a foot off square: squared, the typed sides still 10 and 6 ft.
  await addKind(page, 'bed', 'poly');
  await tapFt(page, 1, 10);
  await typed(page).fill('10'); await tapFt(page, 13, 10.1);
  await typed(page).fill('6'); await tapFt(page, 11.1, 18);
  await tapFt(page, 1.5, 16);
  await tapFt(page, 1, 10);
  await expect(page.locator('#toast-action')).toContainText('Squared the corners');
  await page.getByTestId('pill-edit-points').click();
  await expect(sides(page)).toHaveText(['10 ft', '6 ft', '10 ft', '6 ft']);
});

test('Edit points: undoing an added point leaves the points and numbers drawn (no error)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openFresh(page);
  await addKind(page, 'bed', 'poly');
  for (const [x, y] of [[2, 2], [12, 2], [12, 8], [2, 8], [2, 2]]) await tapFt(page, x, y);
  await page.getByTestId('pill-edit-points').click();
  await expect(page.locator('#canvas-svg [data-role=vertex]')).toHaveCount(4);
  await page.locator('#canvas-svg [data-role=midpoint]').first().click();
  await expect(page.locator('#canvas-svg [data-role=vertex]')).toHaveCount(5);
  await page.locator('button[title^=Undo]').first().click();
  await expect(page.locator('#canvas-svg [data-role=vertex]')).toHaveCount(4);
  await expect(sides(page)).toHaveCount(4);
  expect(errors).toEqual([]);
});
