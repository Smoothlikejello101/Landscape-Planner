import { test, expect, type Page } from '@playwright/test';
import { addKind, canvasBox, closeSheet, drag, field, openFresh, shapeCount, addPlainShape, setRole, openSections, openSettings, tapping, planPoint, zoomBackIn, middleOf } from './helpers';

// At the starting view (zoom 100%, 24 px per foot, view starting at -10 ft),
// canvas pixel 24*k is k-10 ft: tapping at multiples of 24 px lands on the grid.
const FT = 24;
/** Where canvas pixel (24 kx, 24 ky) was at the starting view: kx − 10, ky − 10 ft, at the view as it is now (a strip
 * of words above the plan while drawing, the Building tool opening where a house fits). */
const at = (page: Page, kx: number, ky: number) => planPoint(page, kx - 10, ky - 10);
async function tapFt(page: Page, kx: number, ky: number) {
  const p = await at(page, kx, ky);
  await page.mouse.click(p.x, p.y);
}
const drawPoints = (page: Page) => page.locator('#canvas-svg [data-role=draw-point], #canvas-svg [data-role=draw-close]');
const bar = (page: Page) => page.getByTestId('draw-bar');
const shapePath = (page: Page) => page.locator('#canvas-svg polygon[data-shape-id], #canvas-svg polyline[data-shape-id]');

async function drawL(page: Page) {
  await addKind(page, 'plain', 'poly');
  await expect(page.getByTestId('draw-banner')).toContainText(tapping('Plain Shape: Tap each corner'));
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
  await tapFt(page, 5, 3);
  await expect(page.locator('.sel-pill')).toHaveCount(0);
  await tapFt(page, 8, 14 + 6 / FT);
  await expect(page.locator('.sel-pill .name')).toHaveText('Back fence');
});

test('a property line drawn as an outline can be picked again by tapping near its edge', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'property', 'poly');
  for (const [x, y] of [[2, 2], [12, 2], [12, 10], [2, 10]]) await tapFt(page, x, y);
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.sel-pill .name')).toHaveText('Property Line');
  // Deselect (inside it is the yard: a tap there picks nothing), then tap a few pixels off its dashed edge.
  await tapFt(page, 7, 6);
  await expect(page.locator('.sel-pill')).toHaveCount(0);
  await page.waitForTimeout(400);
  await tapFt(page, 7, 10 + 5 / FT);
  await expect(page.locator('.sel-pill .name')).toHaveText('Property Line');
});

test('edit points: drag, add with +, delete, undo', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'plain', 'poly');
  for (const [x, y] of [[2, 5], [10, 5], [10, 11], [2, 11]]) await tapFt(page, x, y); // (below the strip over the plan's top)
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await page.locator('.sel-pill .edit').click(); await openSections(page);
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 48 sq ft');
  await page.getByTestId('edit-points').click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  const vertices = page.locator('#canvas-svg [data-role=vertex]');
  await expect(vertices).toHaveCount(4);
  await expect(page.locator('#canvas-svg [data-role=midpoint]')).toHaveCount(4);

  // Drag the bottom-right corner 2 ft right: a trapezoid of (8+10)/2*6 = 54 sq ft.
  await drag(page, await at(page, 10, 11), await at(page, 12, 11));
  // Press the + on the top edge (at x=6) and pull it up 2 ft: adds a 8*2/2 = 8 sq ft peak.
  await drag(page, await at(page, 6, 5), await at(page, 6, 3));
  await expect(vertices).toHaveCount(5);
  await expect(bar(page).getByRole('button', { name: 'Delete point' })).toBeEnabled(); // the new point is selected
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 62 sq ft');
  await closeSheet(page);

  // Delete the peak again.
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await page.getByTestId('edit-points').click();
  await tapFt(page, 6, 3);
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

  // Labeling it keeps the length; turning the length off leaves just the label.
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
  await expect(page.getByTestId('draw-banner')).toContainText(/(Tap|Click) where the note goes/);
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
  // (The first building opened where a house fits: this bed's taps are a foot or two apart.)
  await zoomBackIn(page, await middleOf(page, '#canvas-svg rect[data-shape-id]'));
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
  const p = await at(page, 13, 11), q = await at(page, 12, 10);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 4 }); await page.mouse.move(p.x, p.y, { steps: 4 });
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
  // (The first building opened where a house fits: this bed's taps are a few feet apart.)
  await zoomBackIn(page, await middleOf(page, '#canvas-svg rect[data-shape-id]'));
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

test('squaring, more readily (Jason, Nov 4): an L whose short wall was tapped 14° out comes out square; a corner dragged near square sticks there, marked, until let go', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'bed', 'poly');
  for (const [x, y] of [[2, 2], [14, 2], [14, 6], [8, 7.5], [8, 12], [2, 12], [2, 2]]) await tapFt(page, x, y);
  await expect(page.locator('#toast-action')).toContainText('Squared the corners (moved up to 0.8 ft).');
  await page.getByTestId('pill-edit-points').click();
  const vertex = page.locator('#canvas-svg [data-role=vertex][data-index="2"]');
  const from = await middleOf(page, '#canvas-svg [data-role=vertex][data-index="2"]');
  const to = await at(page, 14.3, 9.2); // (2.4° off the wall from the corner before it)
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  // Held on the line of its wall: the wall lit faintly, the corner before it marked square.
  await expect(page.locator('#canvas-svg [data-role=square-wall]')).toHaveCount(1);
  await expect(page.locator('#canvas-svg [data-role=square-mark][data-at="1"]')).toHaveCount(1);
  const held = (await vertex.boundingBox())!, wall = (await page.locator('#canvas-svg [data-role=vertex][data-index="1"]').boundingBox())!;
  expect(Math.abs(held.x - wall.x)).toBeLessThan(0.5); // (straight above the corner before it, not under the pointer)
  await page.mouse.up();
  await expect(page.locator('#canvas-svg [data-role=square-mark], #canvas-svg [data-role=square-wall]')).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=side-length]').nth(1)).toHaveText('7 ft');
});
