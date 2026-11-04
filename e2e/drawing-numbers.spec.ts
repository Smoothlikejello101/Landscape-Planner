import { test, expect, type Page } from '@playwright/test';
import { addKind, canvasBox, field, openFresh, openSections, zoomPct, planPoint } from './helpers';

// Drawing numbers (src/draw-numbers.ts): the sides' lengths and the newest corner's angle while drawing and editing
// points, a typed length for the next side, Fit, and the yard's width on an empty plan.

// At the starting view (zoom 100%, 24 px per foot, view starting at -10 ft), canvas pixel 24*k is k-10 ft.
async function tapFt(page: Page, kx: number, ky: number) {
  // (In feet, kx − 10 and ky − 10, at the view as it is: a strip of words above the plan, or the Building tool opening
  // where a house fits.)
  const p = await planPoint(page, kx - 10, ky - 10);
  await page.mouse.click(p.x, p.y);
}
const sides = (page: Page) => page.locator('#canvas-svg [data-role=side-length]');
const angles = (page: Page) => page.locator('#canvas-svg [data-role=corner-angle]');
const typed = (page: Page) => page.getByTestId('typed-length');

test("while drawing an outline: each side's length and the newest corner's angle; a typed side is exactly that long", async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'bed', 'poly');
  await expect(typed(page)).toBeDisabled(); // (no side to type until there's a first point: its place kept)
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

test('a rectangle whose other side is typed: Enter makes it on a phone (testers, Oct 30); with a mouse, a click on its side does (round 3)', async ({ page, isMobile }) => {
  await openFresh(page);
  await addKind(page, 'building');
  await tapFt(page, 2, 10);
  await typed(page).fill('10');
  await tapFt(page, 14, 10.1);
  // (Not a length: said so, and nothing made.)
  await typed(page).fill('-5');
  await typed(page).press('Enter');
  await expect(page.locator('#toast')).toContainText('A length in feet, more than 0');
  await expect(page.getByTestId('draw-bar')).toBeVisible();
  await typed(page).fill('6');
  await typed(page).press('Enter');
  if (!isMobile) {
    // (The side the mouse was last on, crossing to the field, isn't a choice: it waits for a click on the side.)
    await expect(page.getByTestId('draw-bar')).toBeVisible();
    await tapFt(page, 8, 13);
  }
  await expect(page.getByTestId('draw-bar')).toHaveCount(0); // (made)
  await page.locator('.sel-pill .edit').click(); await openSections(page);
  await expect(field(page, 'Width (ft)')).toHaveValue('10');
  await expect(field(page, 'Length (ft)')).toHaveValue('6');
});

test('a house typed 50 by 30 ft at 360 × 640: its other side goes toward the middle of the plan, and the house is brought into view (the UI review, 2026-11-01)', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openFresh(page);
  await addKind(page, 'building');
  await tapFt(page, 1.5, 2.5); // (a corner near the top of the plan)
  await typed(page).fill('50');
  await typed(page).press('Enter');
  // On a phone, nothing follows a pointer: the length typed, and what to do next, by the corner.
  if (isMobile) await expect(page.locator('#canvas-svg [data-role=typed-note]')).toHaveText('50 ft: tap which way');
  await tapFt(page, 11.5, 2.45); // (toward the right, a hair above the corner's line)
  await expect(page.getByTestId('draw-bar')).toContainText('Other side');
  await typed(page).fill('30');
  await typed(page).press('Enter');
  if (!isMobile) await tapFt(page, 8, 6); // (with a mouse, a click on its side)
  await expect(page.getByTestId('draw-bar')).toHaveCount(0); // (made)
  const plan = (await page.locator('#canvas-svg').boundingBox())!;
  const house = (await page.locator('#canvas-svg rect[data-shape-id]').first().boundingBox())!;
  // (In view, give or take its outline's stroke: opened where a house fits, it can end right at the plan's edge.)
  expect(house.y).toBeGreaterThanOrEqual(plan.y - 1);
  expect(house.x).toBeGreaterThanOrEqual(plan.x - 1);
  expect(house.y + house.height).toBeLessThanOrEqual(plan.y + plan.height + 1);
  expect(house.x + house.width).toBeLessThanOrEqual(plan.x + plan.width + 1);
  // Down from its first side, not up: its top is the corner tapped (-8.5, -7.5 ft).
  await page.locator('.sel-pill .edit').click(); await openSections(page);
  await expect(field(page, 'Width (ft)')).toHaveValue('50');
  await expect(field(page, 'Length (ft)')).toHaveValue('30');
  await expect(field(page, 'Y position')).toHaveValue('-7.5');
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

test('a finger on a point: its angle and its two sides read out at least 80 px above the finger from the press, and they don\'t jump as the drag starts; at the top, beside it (Jason, Nov 4)', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a finger: touch on a phone (a mouse keeps the angle in the corner, as before)');
  await openFresh(page);
  await addKind(page, 'bed', 'poly');
  for (const [x, y] of [[2, 3], [11, 3], [11, 9], [2, 9], [2, 3]]) await tapFt(page, x, y); // (its top 72 px down the plan, under the strip of words while drawing)
  await page.getByTestId('pill-edit-points').click();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!;
  const corner = async (i: number) => { const b = await box(page.locator(`#canvas-svg [data-role=vertex][data-index="${i}"]`)); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // The bottom right corner, pressed: before it moves, the readouts are up above the finger, in a row.
  const f = await corner(2);
  await touch('touchStart', f);
  await expect(angles(page)).toHaveText(['90°']);
  const a0 = await box(angles(page));
  expect(a0.y + a0.height).toBeLessThanOrEqual(f.y - 79);
  const row = page.locator('#canvas-svg [data-role=side-length]').filter({ has: page.locator('text') });
  const ys = await Promise.all((await row.all()).map(async (l) => Math.round((await box(l)).y)));
  expect(ys.filter((y) => Math.abs(y - a0.y) < 1).length).toBe(2); // (its two sides beside it: 9 ft and 6 ft)
  // A hair (no drag yet), then a drag: the readout keeps its place over the finger.
  for (const d of [2, 40]) {
    const at = { x: f.x + d, y: f.y + d / 2 };
    await touch('touchMove', at);
    await expect.poll(async () => Math.round(((await box(angles(page))).y + (await box(angles(page))).height) - at.y)).toBe(Math.round(a0.y + a0.height - f.y));
  }
  await touch('touchEnd');
  // A top corner, with no room above it: beside the finger, level with it.
  const t = await corner(1);
  await touch('touchStart', t);
  const a1 = await box(angles(page));
  expect(Math.abs(a1.y + a1.height / 2 - t.y)).toBeLessThan(3);
  expect(Math.abs(a1.x + a1.width / 2 - t.x)).toBeGreaterThanOrEqual(80);
  await touch('touchEnd');
});
