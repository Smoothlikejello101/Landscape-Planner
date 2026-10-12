import { test, expect, type Page } from '@playwright/test';
import { canvasBox, closeSheet, drag, field, openFresh, shapeCount } from './helpers';

// At the starting view (zoom 100%, 24 px per foot, view starting at -10 ft),
// canvas pixel 24*k is k-10 ft: tapping at multiples of 24 px lands on the grid.
const FT = 24;
async function tapFt(page: Page, kx: number, ky: number) {
  const box = await canvasBox(page);
  await page.mouse.click(box.x + kx * FT, box.y + ky * FT);
}
const drawPoints = (page: Page) => page.locator('#canvas-svg [data-role=draw-point], #canvas-svg [data-role=draw-close]');
const bar = (page: Page) => page.getByTestId('draw-bar');
const shapePath = (page: Page) => page.locator('#canvas-svg polygon[data-shape-id], #canvas-svg polyline[data-shape-id]');

async function drawL(page: Page) {
  await page.getByTestId('draw-btn').click();
  await expect(page.getByTestId('draw-banner')).toContainText('first corner');
  for (const [x, y] of [[2, 2], [12, 2], [12, 6], [6, 6], [6, 12], [2, 12]]) await tapFt(page, x, y);
  await expect(drawPoints(page)).toHaveCount(6);
  await expect(page.getByTestId('draw-banner')).toContainText('first point');
  await tapFt(page, 2, 2); // tapping the first point closes the outline
}

test('draw an L-shaped bed by tapping corners', async ({ page }) => {
  await openFresh(page);
  await drawL(page);
  await expect(page.locator('.sheet-header .title')).toHaveText('Outline properties');
  await page.locator('.role-chip', { hasText: 'Bed' }).click();
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 64 sq ft');
  await expect(field(page, 'Width (ft)')).toHaveValue('10');
  await field(page, 'Label').fill('L bed');
  await closeSheet(page);
  expect(await shapeCount(page)).toBe(1);
  await expect(shapePath(page)).toHaveCount(1);

  // Saved and reloaded as an outline.
  await page.waitForTimeout(600);
  await page.reload();
  await page.locator('button[title=Layers]').click();
  await expect(page.locator('.layer-row', { hasText: 'L bed' })).toContainText('6 points · 10 × 10 ft');
});

test('drawing: drags pan instead of adding points; undo point; cancel', async ({ page }) => {
  await openFresh(page);
  await page.getByTestId('draw-btn').click();
  await expect(page.locator('.bottom-toolbar .tool-btn')).toHaveCount(0); // shape buttons give way to the draw bar
  await tapFt(page, 2, 2);
  await tapFt(page, 6, 2);
  const box = await canvasBox(page);
  const before = await drawPoints(page).first().boundingBox();
  await drag(page, { x: box.x + 200, y: box.y + 300 }, { x: box.x + 248, y: box.y + 300 });
  await expect(drawPoints(page)).toHaveCount(2);
  const after = await drawPoints(page).first().boundingBox();
  expect(Math.round(after!.x - before!.x)).toBe(48); // the drawing moved with the plan
  await expect(bar(page).getByRole('button', { name: 'Done' })).toBeDisabled(); // an outline needs 3 corners
  await bar(page).getByRole('button', { name: 'Undo point' }).click();
  await expect(drawPoints(page)).toHaveCount(1);
  await bar(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(bar(page)).toHaveCount(0);
  expect(await shapeCount(page)).toBe(0);
});

test('draw a fence line: a boundary with a length, easy to tap', async ({ page }) => {
  await openFresh(page);
  await page.getByTestId('draw-btn').click();
  await bar(page).getByRole('button', { name: 'Line', exact: true }).click();
  await tapFt(page, 2, 14);
  await tapFt(page, 14, 14);
  await tapFt(page, 14, 9);
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Line properties');
  await expect(page.locator('.role-chip.sel')).toContainText('Boundary');
  await expect(page.locator('[data-testid=measure]')).toHaveText('Length: 17 ft');
  await field(page, 'Label').fill('Back fence');
  await closeSheet(page);
  // Deselect, then tap a few pixels off the line: the wide hit area still selects it.
  const box = await canvasBox(page);
  await page.mouse.click(box.x + 5 * FT, box.y + 3 * FT);
  await expect(page.locator('.sel-pill')).toHaveCount(0);
  await page.mouse.click(box.x + 8 * FT, box.y + 14 * FT + 6);
  await expect(page.locator('.sel-pill .name')).toHaveText('Back fence');
});

test('edit points: drag, add with +, delete, undo', async ({ page }) => {
  await openFresh(page);
  await page.getByTestId('draw-btn').click();
  for (const [x, y] of [[2, 2], [10, 2], [10, 8], [2, 8]]) await tapFt(page, x, y);
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 48 sq ft');
  await page.getByTestId('edit-points').click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  const vertices = page.locator('#canvas-svg [data-role=vertex]');
  await expect(vertices).toHaveCount(4);
  await expect(page.locator('#canvas-svg [data-role=midpoint]')).toHaveCount(4);

  // Drag the bottom-right corner 2 ft right: a trapezoid of (8+10)/2*6 = 54 sq ft.
  const box = await canvasBox(page);
  await drag(page, { x: box.x + 10 * FT, y: box.y + 8 * FT }, { x: box.x + 12 * FT, y: box.y + 8 * FT });
  // Press the + on the top edge (at x=6) and pull it up 2 ft: adds a 8*2/2 = 8 sq ft peak.
  await drag(page, { x: box.x + 6 * FT, y: box.y + 2 * FT }, { x: box.x + 6 * FT, y: box.y + 0 * FT });
  await expect(vertices).toHaveCount(5);
  await expect(bar(page).getByRole('button', { name: 'Delete point' })).toBeEnabled(); // the new point is selected
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 62 sq ft');
  await closeSheet(page);

  // Delete the peak again.
  await page.locator('.sel-pill button.edit').click();
  await page.getByTestId('edit-points').click();
  await page.mouse.click(box.x + 6 * FT, box.y + 0 * FT);
  await bar(page).getByRole('button', { name: 'Delete point' }).click();
  await expect(vertices).toHaveCount(4);
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 54 sq ft');
  await closeSheet(page);

  // Undo brings the peak back.
  await page.locator('button[title=Undo]').click();
  await page.locator('.sel-pill button.edit').click();
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 62 sq ft');
});

test('convert a rectangle to an outline and reshape it', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.rect').click();
  await field(page, 'Label').fill('Patio');
  await page.getByTestId('convert-outline').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Outline properties');
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 12 sq ft');
  await expect(field(page, 'Label')).toHaveValue('Patio');
  await field(page, 'Width (ft)').fill('8'); // stretches the points
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 24 sq ft');
  await page.getByTestId('edit-points').click();
  await expect(page.locator('#canvas-svg [data-role=vertex]')).toHaveCount(4);
});
