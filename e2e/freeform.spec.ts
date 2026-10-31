import { test, expect, type Page } from '@playwright/test';
import { addKind, canvasBox, closeSheet, drag, field, openFresh, shapeCount, addPlainShape, setRole, openSections, openSettings } from './helpers';

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
  await addKind(page, 'plain', 'poly');
  await expect(page.getByTestId('draw-banner')).toContainText('Plain shape: Tap each corner');
  for (const [x, y] of [[2, 2], [12, 2], [12, 6], [6, 6], [6, 12], [2, 12]]) await tapFt(page, x, y);
  await expect(drawPoints(page)).toHaveCount(6);
  await expect(page.getByTestId('draw-banner')).toContainText('first point');
  await tapFt(page, 2, 2); // tapping the first point closes the outline
}

test('draw an L-shaped bed by tapping corners', async ({ page }) => {
  await openFresh(page);
  await drawL(page);
  await page.locator('.sel-pill .edit').click(); await openSections(page); // properties stay closed after adding
  await expect(page.locator('.sheet-header .title')).toHaveText('Outline');
  await setRole(page, 'Bed');
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
  await addKind(page, 'bed', 'poly');
  await expect(page.locator('.bottom-toolbar .tool-btn')).toHaveCount(0); // the add buttons give way to the draw bar
  await tapFt(page, 2, 2);
  await tapFt(page, 6, 2);
  const box = await canvasBox(page);
  const before = await drawPoints(page).first().boundingBox();
  await drag(page, { x: box.x + 200, y: box.y + 300 }, { x: box.x + 248, y: box.y + 300 });
  await expect(drawPoints(page)).toHaveCount(2);
  const after = await drawPoints(page).first().boundingBox();
  expect(Math.round(after!.x - before!.x)).toBe(48); // the drawing moved with the plan
  await expect(bar(page).getByRole('button', { name: 'Done' })).toBeDisabled(); // an outline needs 3 corners
  await bar(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(drawPoints(page)).toHaveCount(1);
  await bar(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(bar(page)).toHaveCount(0);
  expect(await shapeCount(page)).toBe(0);
});

test('draw a fence line: a boundary with a length, easy to tap', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'fence');
  await expect(bar(page).locator('[data-method]')).toHaveCount(0); // a fence is only ever a line
  await tapFt(page, 2, 14);
  await tapFt(page, 14, 14);
  await tapFt(page, 14, 9);
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await page.locator('.sel-pill .edit').click(); await openSections(page);
  await expect(page.locator('.sheet-header .title')).toHaveText('Fence');
  await expect(page.getByTestId('what-it-is')).toContainText('Boundary');
  await expect(page.locator('[data-testid=measure]')).toHaveText('Length: 17 ft');
  await expect(field(page, 'Label')).toHaveValue('Fence');
  await field(page, 'Label').fill('Back fence');
  await closeSheet(page);
  // Deselect, then tap a few pixels off the line: the wide hit area still selects it.
  const box = await canvasBox(page);
  await page.mouse.click(box.x + 5 * FT, box.y + 3 * FT);
  await expect(page.locator('.sel-pill')).toHaveCount(0);
  await page.mouse.click(box.x + 8 * FT, box.y + 14 * FT + 6);
  await expect(page.locator('.sel-pill .name')).toHaveText('Back fence');
});

test('a property line drawn as an outline can be picked again by tapping near its edge', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'property', 'poly');
  for (const [x, y] of [[2, 2], [12, 2], [12, 10], [2, 10]]) await tapFt(page, x, y);
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.sel-pill .name')).toHaveText('Property line');
  // Deselect (inside it is the yard: a tap there picks nothing), then tap a few pixels off its dashed edge.
  const box = await canvasBox(page);
  await page.mouse.click(box.x + 7 * FT, box.y + 6 * FT);
  await expect(page.locator('.sel-pill')).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.mouse.click(box.x + 7 * FT, box.y + 10 * FT + 5);
  await expect(page.locator('.sel-pill .name')).toHaveText('Property line');
});

test('edit points: drag, add with +, delete, undo', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'plain', 'poly');
  for (const [x, y] of [[2, 2], [10, 2], [10, 8], [2, 8]]) await tapFt(page, x, y);
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await page.locator('.sel-pill .edit').click(); await openSections(page);
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
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await page.getByTestId('edit-points').click();
  await page.mouse.click(box.x + 6 * FT, box.y + 0 * FT);
  await bar(page).getByRole('button', { name: 'Delete point' }).click();
  await expect(vertices).toHaveCount(4);
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 54 sq ft');
  await closeSheet(page);

  // Undo brings the peak back.
  await page.locator('button[title=Undo]').click();
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 62 sq ft');
});

test('convert a rectangle to an outline and reshape it', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'rect');
  await field(page, 'Label').fill('Patio');
  await page.getByTestId('convert-outline').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Patio');
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 12 sq ft');
  await expect(field(page, 'Label')).toHaveValue('Patio');
  await field(page, 'Width (ft)').fill('8'); // stretches the points
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 24 sq ft');
  await page.getByTestId('edit-points').click();
  await expect(page.locator('#canvas-svg [data-role=vertex]')).toHaveCount(4);
});

test('measure two points, keep it as a dimension line', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'measure');
  await tapFt(page, 2, 4);
  await expect(page.getByTestId('draw-banner')).toContainText('other end');
  await tapFt(page, 5, 8); // a 3-4-5 triangle
  await expect(page.locator('#canvas-svg [data-role=measure-label]')).toHaveText('5 ft');
  await expect(page.getByTestId('draw-banner')).toContainText('5 ft');
  await bar(page).getByRole('button', { name: 'Keep' }).click();
  await expect(page.locator('#canvas-svg [data-role=measure-label]')).toHaveCount(0);
  await tapFt(page, 2, 10); // measuring again doesn't touch the kept line
  await tapFt(page, 8, 10);
  await expect(page.locator('#canvas-svg [data-role=measure-label]')).toHaveText('6 ft');
  await bar(page).getByRole('button', { name: 'Done' }).click();
  expect(await shapeCount(page)).toBe(1);
  await expect(page.locator('#canvas-svg text', { hasText: /^5 ft$/ })).toHaveCount(1);
  await expect(page.locator('#canvas-svg [data-role=dim-tick]')).toHaveCount(2);

  // Labelling it keeps the length; turning the length off leaves just the label.
  await page.locator('button[title=Layers]').click();
  await page.locator('.layer-row').first().click();
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await field(page, 'Label').fill('Gate');
  await expect(page.locator('#canvas-svg text', { hasText: 'Gate · 5 ft' })).toHaveCount(1);
  await page.getByTestId('show-length').locator('input').uncheck();
  await expect(page.locator('#canvas-svg text', { hasText: /^Gate$/ })).toHaveCount(1);
});

test('text notes: multi-line, sized in feet, scale with zoom', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'note');
  await expect(page.getByTestId('draw-banner')).toContainText('Tap where the note goes');
  await tapFt(page, 4, 4);
  await expect(page.locator('.sheet-header .title')).toHaveText('Note'); // a note opens on its text
  await openSections(page);
  const ta = page.locator('.sheet textarea');
  await ta.fill('Rain barrel\ngoes here');
  await expect(ta).toBeFocused(); // typing never rebuilds the panel (Android keyboard)
  await field(page, 'Text height (ft)').fill('2');
  await closeSheet(page);
  const note = page.locator('#canvas-svg [data-role=text-note]');
  await expect(note.locator('tspan')).toHaveText(['Rain barrel', 'goes here']);
  await expect(note).toHaveAttribute('font-size', '48');
  await page.locator('.zoombtn').first().click(); // zoom in 125%
  await expect(note).toHaveAttribute('font-size', '60');
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('#canvas-svg [data-role=text-note] tspan')).toHaveText(['Rain barrel', 'goes here']);
});

test('a bed drawn against an off-grid wall: each snap shown as it lands, with Unsnap; squaring said, with Undo; both can be turned off', async ({ page }) => {
  await openFresh(page);
  // A building, measured: 6.3 ft wide, so its right wall (x = 7.3) is off the half-foot grid.
  await addKind(page, 'building', 'rect');
  for (const [x, y] of [[1, 2], [7, 2], [7, 8]]) await tapFt(page, x, y);
  await page.locator('.sel-pill .edit').click(); await openSections(page);
  await field(page, 'Width (ft)').fill('6.3');
  await closeSheet(page);
  const chip = page.getByTestId('snap-chip');
  const lit = page.locator('#canvas-svg [data-role=snap-target]');
  const ringed = page.locator('#canvas-svg [data-role=draw-point][data-snapped=true]');
  // A tap a little short of the wall lands on it: ringed, the wall lit, and the bar says so.
  await addKind(page, 'bed', 'poly');
  const planHeight = (await canvasBox(page)).height;
  await tapFt(page, 7.4, 3);
  await expect(ringed).toHaveCount(1);
  expect((await canvasBox(page)).height).toBe(planHeight); // (the chip has its place in the bar: the plan doesn't shrink)
  await expect(lit).toHaveCount(1);
  await expect(chip).toContainText(/On (House|Building)/);
  // Unsnap: on the grid instead (half a foot off the wall), nothing lit; Undo takes the tap back.
  await chip.getByTestId('unsnap').click();
  await expect(chip).toHaveCount(0);
  await expect(ringed).toHaveCount(0);
  await bar(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(drawPoints(page)).toHaveCount(0);
  // Drawn against the wall, the far side not quite square: squared when it's closed, and said.
  const drawBed = async () => {
    for (const [x, y] of [[7.4, 3], [11, 3.4], [11, 7], [7.4, 7]]) await tapFt(page, x, y); // (11, 3.4 lands on the grid at 3.5)
    await tapFt(page, 7.4, 3); // (closes it)
  };
  await drawBed();
  const notice = page.locator('#toast-action');
  await expect(notice).toContainText('Squared the corners (moved up to 0.5 ft).');
  await expect(notice).not.toContainText('Lined up');
  const area = async () => { await page.locator('.sel-pill .edit').click(); await openSections(page); const v = await page.getByTestId('measure').textContent(); const w = await field(page, 'Width (ft)').inputValue(); await closeSheet(page); return [w, v]; };
  expect(await area()).toEqual(['3.7', expect.stringContaining('Area: 15 sq ft')]); // (from the wall, square: 3.7 × 4 ft, 14.8 sq ft, shown whole as everywhere)
  // A pan to look leaves the notice up; its Undo gives back the dots as drawn, still on the wall.
  const box = await canvasBox(page);
  await page.mouse.move(box.x + 13 * FT, box.y + 11 * FT); await page.mouse.down();
  await page.mouse.move(box.x + 12 * FT, box.y + 10 * FT, { steps: 4 }); await page.mouse.move(box.x + 13 * FT, box.y + 11 * FT, { steps: 4 });
  await page.mouse.up();
  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(notice).toHaveCount(0);
  const [w, a] = await area();
  expect(w).toBe('3.7'); // (still from the wall)
  expect(a).not.toContain('14.8');
  // Both off (in Settings): the next lands on the grid, as drawn, nothing said. A setting of this device.
  await page.locator('button[title=Undo]').click(); // (that bed gone)
  await openSettings(page);
  await page.getByTestId('snap-drawing').uncheck();
  await page.getByTestId('square-drawing').uncheck();
  await closeSheet(page);
  await addKind(page, 'bed', 'poly');
  await tapFt(page, 7.4, 3);
  await expect(chip).toHaveCount(0);
  await bar(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await drawBed();
  await expect(notice).toHaveCount(0);
  expect((await area())[0]).toBe('3.5');
  await page.waitForTimeout(600);
  await page.reload();
  await openSettings(page);
  await expect(page.getByTestId('snap-drawing')).not.toBeChecked();
  await expect(page.getByTestId('square-drawing')).not.toBeChecked();
});

test('a corner tapped right on a building\'s corner stays on it when the rest is squared', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'building', 'rect');
  for (const [x, y] of [[1, 2], [7, 2], [7, 8]]) await tapFt(page, x, y);
  // A bed from the building's top-right corner (on the grid already), the far side not quite square, its last
  // corner a little short of the wall.
  await addKind(page, 'bed', 'poly');
  for (const [x, y] of [[7, 2], [11, 2.4], [11, 6], [7.4, 6]]) await tapFt(page, x, y);
  await tapFt(page, 7, 2); // (closes it)
  await expect(page.locator('#toast-action')).toContainText('Squared the corners');
  await page.locator('.sel-pill .edit').click(); await openSections(page);
  // Squared to 7–11 × 2–6, its top edge still on the building's (not halfway to the tapped 2.5: 3.8 tall).
  await expect(field(page, 'Width (ft)')).toHaveValue('4');
  await expect(field(page, 'Length (ft)')).toHaveValue('4');
});
