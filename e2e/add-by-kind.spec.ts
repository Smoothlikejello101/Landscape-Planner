import { test, expect, type Page } from '@playwright/test';
import { addKind, closeSheet, field, openFresh, shapeCount } from './helpers';

// Adding things by what they are: the bottom bar, the Add sheet, and drawing
// each kind by tapping.

// At the starting view (zoom 100%, 24 px per foot, view starting at -10 ft),
// canvas pixel 24*k is k-10 ft.
const FT = 24;
async function tapFt(page: Page, kx: number, ky: number) {
  const box = (await page.locator('#canvas-svg').boundingBox())!;
  await page.mouse.click(box.x + kx * FT, box.y + ky * FT);
}
const bar = (page: Page) => page.getByTestId('draw-bar');
const banner = (page: Page) => page.getByTestId('draw-banner');

test('the bottom bar names garden things; the Add sheet holds the rest', async ({ page }) => {
  await openFresh(page);
  await expect(page.locator('.bottom-toolbar .tool-btn .lbl')).toHaveText(['Plant', 'Bed', 'Path', 'Add']);
  await page.getByTestId('add-btn').click();
  const sheet = page.getByTestId('add-sheet');
  await expect(sheet.locator('.kind-group-name')).toHaveText(['Garden', 'Paths and paving', 'Buildings and boundaries', 'Site conditions', 'Notes and tools']);
  await expect(sheet.locator('.kind-chip')).toHaveCount(15);
  await expect(sheet.getByTestId('recent-kinds')).toHaveCount(0); // nothing added yet
  await sheet.locator('.sheet-header button').click();
  await page.locator('.tool-btn.plants').click();
  await expect(page.locator('.sheet-header .title')).toContainText('Plant Picker');
});

test('a building from three taps: tilted to follow the first side, labeled House, then Building', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'building');
  await expect(bar(page).locator('[data-method].on')).toHaveAttribute('data-method', 'rect');
  await expect(banner(page)).toHaveText('Building: Tap a corner');
  await tapFt(page, 2, 10);
  await expect(banner(page)).toHaveText('Building: Tap the next corner along the same side');
  await tapFt(page, 10, 4); // a side 10 ft long, (8, -6) ft
  await expect(banner(page)).toHaveText('Building: Tap anywhere on the opposite side');
  await tapFt(page, 12, 10); // a point 6 ft out from that side
  await expect(bar(page)).toHaveCount(0); // finished by itself
  await expect(page.locator('.sheet')).toHaveCount(0); // properties stay closed
  await expect(page.locator('.sel-pill .name')).toHaveText('House');
  await page.locator('.sel-pill .edit').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Rectangle properties');
  await expect(page.getByTestId('what-it-is')).toContainText('Building');
  await expect(field(page, 'Width (ft)')).toHaveValue('10');
  await expect(field(page, 'Height (ft)')).toHaveValue('6');
  await expect(page.locator('#canvas-svg rect[data-shape-id]')).toHaveAttribute('transform', /rotate\(-36\.9 /);
  await closeSheet(page);

  // The second building in a plan isn't the house.
  await addKind(page, 'building');
  await tapFt(page, 1, 12); await tapFt(page, 5, 12); await tapFt(page, 5, 15);
  await expect(page.locator('.sel-pill .name')).toHaveText('Building');
  // ...and Building now shows under Recent.
  await page.getByTestId('add-btn').click();
  await expect(page.getByTestId('recent-kinds').locator('.kind-chip')).toHaveText(['Building']);
});

test('the drawing method is a choice with pictures, remembered per kind', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.bed').click();
  const methods = bar(page).locator('[data-method]');
  await expect(methods).toHaveText(['Outline', 'Rectangle', 'Circle', 'Oval']);
  await expect(methods.first().locator('svg.method-icon .m-dot')).toHaveCount(5); // the taps it takes
  await expect(bar(page).locator('[data-method=rect] .m-dot')).toHaveCount(3);
  await bar(page).locator('[data-method=circle]').click();
  await expect(banner(page)).toHaveText('Bed: Tap the center');
  await tapFt(page, 10, 10);
  await tapFt(page, 13, 14); // 5 ft out
  await page.locator('.sel-pill .edit').click();
  await expect(field(page, 'Radius (ft)')).toHaveValue('5');
  await expect(page.getByTestId('what-it-is')).toContainText('Bed');
  await closeSheet(page);
  await page.locator('.tool-btn.bed').click();
  await expect(bar(page).locator('[data-method].on')).toHaveAttribute('data-method', 'circle'); // remembered
  await bar(page).getByRole('button', { name: 'Cancel' }).click();
  expect(await shapeCount(page)).toBe(1);
});

test('a path is a band at its real width, set while drawing', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.path').click();
  await expect(bar(page).locator('[data-method].on')).toHaveAttribute('data-method', 'path');
  const width = page.getByTestId('draw-path-width');
  await expect(width).toHaveValue('3');
  await width.fill('4');
  await expect(width).toBeFocused(); // typing never rebuilds the bar (Android keyboard)
  await tapFt(page, 2, 4); await tapFt(page, 12, 4); await tapFt(page, 12, 10);
  await expect(page.locator('#canvas-svg [data-role=draw-band]')).toHaveAttribute('stroke-width', String(4 * FT));
  await bar(page).getByRole('button', { name: 'Done' }).click();
  const band = page.locator('#canvas-svg polyline[data-shape-id]').first();
  await expect(band).toHaveAttribute('stroke-width', String(4 * FT));
  await page.locator('.sel-pill .edit').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Path properties');
  await expect(page.locator('[data-testid=measure]')).toHaveText('Length: 16 ft · about 64 sq ft');
  await page.getByTestId('path-width').fill('2');
  await expect(band).toHaveAttribute('stroke-width', String(2 * FT));
  await closeSheet(page);
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('#canvas-svg polyline[data-shape-id]').first()).toHaveAttribute('stroke-width', String(2 * FT));
});

test('an existing tree is a circle from trunk to canopy edge, sized by hand', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'tree');
  await tapFt(page, 10, 10);
  await tapFt(page, 10, 18);
  await expect(page.locator('.sel-pill .name')).toHaveText('Tree');
  await page.locator('.sel-pill .edit').click();
  await expect(field(page, 'Radius (ft)')).toHaveValue('8');
});

test('sun exposure and notes open their properties; others stay closed', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'sun', 'circle');
  await tapFt(page, 10, 10); await tapFt(page, 14, 10);
  await expect(page.locator('.sheet-header .title')).toHaveText('Circle properties');
  await expect(page.getByTestId('what-it-is')).toContainText('Sun exposure');
  await closeSheet(page);
  await addKind(page, 'note');
  await tapFt(page, 4, 4);
  await expect(page.locator('.sheet textarea')).toBeVisible();
});

test('what something is can be changed behind Change', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.bed').click();
  await bar(page).locator('[data-method=rect]').click();
  await tapFt(page, 2, 2); await tapFt(page, 10, 2); await tapFt(page, 10, 6);
  await page.locator('.sel-pill .edit').click();
  const what = page.getByTestId('what-it-is');
  await expect(what.locator('.role-chip')).toHaveCount(0); // the list stays out of the way
  await page.getByTestId('change-kind').click();
  await expect(what.locator('.role-chip')).toHaveCount(10);
  await expect(what.locator('.role-chip', { hasText: 'Plain shape' })).toHaveCount(1);
  await what.locator('.role-chip', { hasText: 'Lawn' }).click();
  await expect(what).toContainText('Lawn');
  await expect(what.locator('.role-chip')).toHaveCount(0);
});

test.describe('with a keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'laptops and desktops only');
  test('letters add things, Enter finishes, ? lists them; the shape follows the pointer', async ({ page }) => {
    await openFresh(page);
    await expect(page.locator('.tool-btn.bed')).toHaveAttribute('title', 'Bed (B)');
    await page.keyboard.press('b');
    await expect(banner(page)).toHaveText('Bed: Tap each corner');
    await tapFt(page, 2, 2); await tapFt(page, 8, 2); await tapFt(page, 8, 8);
    const box = (await page.locator('#canvas-svg').boundingBox())!;
    await page.mouse.move(box.x + 2 * FT, box.y + 9 * FT);
    await expect(page.locator('#canvas-svg [data-role=draw-hover]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    expect(await shapeCount(page)).toBe(1);
    await page.keyboard.press('h');
    await expect(banner(page)).toContainText('Building');
    await page.keyboard.press('Escape');
    await expect(bar(page)).toHaveCount(0);
    await page.keyboard.press('a');
    await expect(page.getByTestId('add-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcuts')).toContainText('Add: Bed');
    await page.keyboard.press('Escape');

    // A drawing with taps in it isn't thrown away by a stray letter.
    await page.keyboard.press('w');
    await tapFt(page, 2, 12);
    await page.keyboard.press('b');
    await expect(banner(page)).toContainText('Path');
    await page.keyboard.press('Escape');
    // Typing a label never adds things.
    await tapFt(page, 5, 4); // the bed drawn above
    await page.locator('.sel-pill .edit').click();
    await field(page, 'Label').fill('');
    await page.keyboard.type('bwh');
    await expect(field(page, 'Label')).toHaveValue('bwh');
    await expect(bar(page)).toHaveCount(0);
    expect(await shapeCount(page)).toBe(1);
  });
});

test('triangles from older plans keep their right-angle corner control', async ({ page }) => {
  await openFresh(page);
  await page.locator('.project-btn').click();
  const file = {
    format: 'landscape-planner-project', version: 1,
    project: {
      name: 'Old plan', lastModified: 1,
      data: { shapes: [{ id: 't', type: 'triangle', x: 0, y: 0, width: 4, height: 3, rotation: 0, rightAngle: 'bl', color: '#7c3aed', label: 'Old triangle', opacity: 0.65, locked: false }] },
    },
  };
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'old.landscape.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('.project-btn .pname')).toHaveText('Old plan');
  await page.locator('#canvas-svg polygon[data-shape-id=t]').click();
  await page.locator('.sel-pill .edit').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Triangle properties');
  await page.locator('.tri-corner-btn', { hasText: 'Top-right' }).click();
  await expect(page.locator('.tri-corner-btn', { hasText: 'Top-right' })).toHaveClass(/sel/);
});
