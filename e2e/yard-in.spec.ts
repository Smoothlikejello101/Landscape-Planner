import { test, expect, type Page } from '@playwright/test';
import { addKind, autoDialogs, canvasBox, closeSheet, openFresh, shapeCount, tapFromCenter, zoomPct } from './helpers';

// Getting the yard in (Jason's UI review, approved Nov 2): from a photo of the yard to the house, driveway, trees, lot
// line and beds traced over it.

const strip = (page: Page) => page.getByTestId('mode-strip');
const drawBanner = (page: Page) => page.getByTestId('draw-banner');

/** A bed, 6 by 4 ft, at the middle of the view: something on the plan, so Fit has something to fit. */
async function aBed(page: Page) {
  await page.locator('.tool-btn.bed').click();
  await page.locator('[data-testid=draw-bar] [data-method=rect]').click();
  await tapFromCenter(page, -3, -2); await tapFromCenter(page, 3, -2); await tapFromCenter(page, 3, 2);
  await expect.poll(() => shapeCount(page)).toBe(1);
  await page.getByTestId('pill-deselect').click();
}

test('while drawing, nothing floats over the plan: Fit and the side buttons go, and what to tap is on a strip above it (item 5)', async ({ page }) => {
  autoDialogs(page);
  await page.addInitScript(() => localStorage.setItem('lp-zoom-buttons', 'off')); // (as a phone starts: Fit in the corner)
  await openFresh(page);
  await aBed(page);
  await expect(page.getByTestId('zoom-fit')).toBeVisible();
  await expect(page.getByTestId('toggle-names')).toBeVisible();
  const bed = page.locator('#canvas-svg [data-shape-id]').first();
  const before = (await bed.boundingBox())!;
  await page.locator('.tool-btn.bed').click();
  await expect(drawBanner(page)).toBeVisible();
  // Nothing floats over the plan.
  await expect(page.getByTestId('zoom-fit')).toHaveCount(0);
  await expect(page.getByTestId('toggle-names')).toHaveCount(0);
  await expect(page.locator('#canvas-wrap .zoombtns button')).toHaveCount(0);
  // The words are above the plan, not on it; and the plan didn't move as they came.
  const plan = await canvasBox(page), words = (await drawBanner(page).boundingBox())!;
  expect(words.y + words.height).toBeLessThanOrEqual(plan.y + 0.5);
  const after = (await bed.boundingBox())!;
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  // One height through the drawing: the plan's edge doesn't move between taps.
  await page.locator('[data-testid=draw-bar] [data-method=rect]').click();
  const h0 = (await strip(page).boundingBox())!.height;
  await page.mouse.click(plan.x + 30, plan.y + 12); // (top left, where the words were)
  await expect(drawBanner(page)).toContainText('next corner');
  expect((await strip(page).boundingBox())!.height).toBe(h0);
  // A corner tapped in the top right corner, where Fit was, is a corner, not a zoom.
  const zoom = await zoomPct(page);
  await page.mouse.click(plan.x + plan.width - 14, plan.y + 14);
  await expect(drawBanner(page)).toContainText('opposite side');
  expect(await zoomPct(page)).toBe(zoom);
  await page.locator('[data-testid=draw-bar]').getByRole('button', { name: 'Cancel' }).click();
  // Done: the strip goes, the buttons are back, and the plan is where it was.
  await expect(strip(page)).toHaveCount(0);
  await expect(page.getByTestId('zoom-fit')).toBeVisible();
  const back = (await bed.boundingBox())!;
  expect(Math.abs(back.y - before.y)).toBeLessThan(1);
});

test('+ and −, turned on to zoom with one finger, stay while drawing; Fit goes (item 5)', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await aBed(page);
  await addKind(page, 'building');
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();
  await expect(page.getByTestId('zoom-fit')).toHaveCount(0);
});

/** A photo added from the first screen, its scale set: A and B a quarter of the way in from its sides, `feet` apart. */
async function photoToScale(page: Page, feet = 60, at = 0.5) {
  await page.getByTestId('start-photo').click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await expect(page.locator('.mode-banner')).toContainText('Calibrating');
  const img = (await page.locator('#canvas-svg image').boundingBox())!;
  await page.mouse.click(img.x + img.width * 0.25, img.y + img.height * at);
  await expect(page.locator('.mode-banner')).toContainText('second known point');
  await page.mouse.click(img.x + img.width * 0.75, img.y + img.height * at);
  await expect(page.getByTestId('scale-box')).toBeVisible();
  await page.getByTestId('scale-distance').fill(String(feet));
  await page.getByTestId('scale-set').click();
  await expect(page.locator('.sheet')).toContainText('Current scale:');
  await closeSheet(page);
}
/** Whether two boxes overlap. */
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('the Building tool opens where a house fits; a building drawn shed-sized, the only one, is asked about (item 1)', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  expect(await zoomPct(page)).toBe(100); // (the opening view: about 17 ft across a phone)
  await addKind(page, 'building');
  // 70 ft across the plan's narrower side, at least (its height on a computer, its width on a phone).
  const plan = await canvasBox(page), zoom = await zoomPct(page);
  expect(Math.min(plan.width, plan.height) / (24 * zoom / 100)).toBeGreaterThanOrEqual(69);
  expect(zoom).toBeLessThan(50);
  // Drawn 10 by 8 ft: "Is that the real size?", about it.
  await tapFromCenter(page, -5, -4); await tapFromCenter(page, 5, -4); await tapFromCenter(page, 5, 4);
  const ask = page.getByTestId('real-size');
  await expect(ask).toContainText('Is that the real size? At 10 × 8 ft, it’s small for a house.');
  await ask.getByRole('button', { name: 'Draw it again' }).click();
  expect(await shapeCount(page)).toBe(0);
  await expect(drawBanner(page)).toContainText('Building');
  // A house, then a shed beside it: no question for either.
  await tapFromCenter(page, -20, -10); await tapFromCenter(page, 20, -10); await tapFromCenter(page, 20, 10);
  await expect.poll(() => shapeCount(page)).toBe(1);
  await expect(ask).toHaveCount(0);
  await page.getByTestId('pill-deselect').click();
  await addKind(page, 'building');
  expect(await zoomPct(page)).toBe(zoom); // (a second building: the view left as it is)
  await tapFromCenter(page, 22, 12); await tapFromCenter(page, 30, 12); await tapFromCenter(page, 30, 18);
  await expect.poll(() => shapeCount(page)).toBe(2);
  await expect(ask).toHaveCount(0);
});

test('the scale box sits clear of A and B, the plan moved if they were under it, with lengths people know (item 3)', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await page.getByTestId('start-photo').click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await expect(page.locator('.mode-banner')).toContainText('Calibrating');
  // A and B near the top of the photo, where the box goes.
  const img = (await page.locator('#canvas-svg image').boundingBox())!;
  await page.mouse.click(img.x + img.width * 0.25, img.y + img.height * 0.05);
  await page.mouse.click(img.x + img.width * 0.75, img.y + img.height * 0.05);
  const box = page.getByTestId('scale-box');
  await expect(box).toBeVisible();
  const b = (await box.boundingBox())!;
  for (const p of ['a', 'b']) {
    const pt = (await page.locator(`#canvas-svg [data-role=scale-point-${p}]`).boundingBox())!;
    expect(overlap(pt, b), `point ${p.toUpperCase()} clear of the box`).toBe(false);
    expect(pt.y).toBeGreaterThan(b.y + b.height); // (below it: a phone's keyboard comes up from the bottom)
  }
  await expect(page.getByTestId('scale-hints')).toContainText('Your house’s front: its length may be in the listing');
  await expect(page.getByTestId('scale-hints')).toContainText('a one-car driveway is about 10–12 ft');
  await expect(page.getByTestId('scale-hints')).toContainText('on the county’s GIS map, or the plat');
  await expect(page.getByTestId('scale-distance')).toBeFocused();
});

test('a photo not to scale is marked so in Layers, and by a dot on the Layers button, until its scale is set (item 4; Jason\'s note on #209, Nov 4)', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await page.getByTestId('start-photo').click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await page.locator('.mode-banner button').click(); // (its scale not set)
  // ("Not to scale yet", as the background sheet says it: not "Rough scale". A dot on Layers, named for screen readers.)
  await expect(page.getByTestId('layers-scale-dot')).toBeVisible();
  await expect(page.getByTestId('layers-btn')).toHaveAttribute('aria-label', 'Layers: the photo isn’t to scale yet');
  await page.locator('button[title=Layers]').click();
  await expect(page.getByTestId('layers-bg-not-to-scale')).toHaveText('Not to scale yet');
  await expect(page.getByTestId('layers-bg')).toContainText('Its size on the plan is a guess until its scale is set');
  await page.getByTestId('layers-bg-set-scale').click();
  await expect(page.locator('.mode-banner')).toContainText('Calibrating');
  const img = (await page.locator('#canvas-svg image').boundingBox())!;
  await page.mouse.click(img.x + img.width * 0.25, img.y + img.height * 0.5);
  await page.mouse.click(img.x + img.width * 0.75, img.y + img.height * 0.5);
  await page.getByTestId('scale-distance').fill('40');
  await page.getByTestId('scale-set').click();
  await closeSheet(page);
  await expect(page.getByTestId('layers-scale-dot')).toHaveCount(0);
  await expect(page.getByTestId('layers-btn')).toHaveAttribute('aria-label', 'Layers');
  await page.locator('button[title=Layers]').click();
  await expect(page.getByTestId('layers-bg')).toBeVisible();
  await expect(page.getByTestId('layers-bg-not-to-scale')).toHaveCount(0);
});

test('once the photo is to scale, "Now trace" lists what to trace, each starting its tool; put away, it stays away (item 2)', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await photoToScale(page);
  // On the empty plan, it's the first screen's line, in the card under the photo.
  const line = page.getByTestId('trace-line');
  await expect(page.getByTestId('first-card').getByTestId('trace-line')).toBeVisible();
  await expect(line.locator('.trace-chip')).toHaveText(['House', 'Driveway', 'Trees', 'Lot line', 'Beds']);
  await line.getByTestId('trace-building').click();
  await expect(drawBanner(page)).toContainText('Building');
  await expect(line).toHaveCount(0); // (not while drawing)
  await tapFromCenter(page, -15, -10); await tapFromCenter(page, 15, -10); await tapFromCenter(page, 15, 8);
  await expect.poll(() => shapeCount(page)).toBe(1);
  // A card of its own now, above the house's chip, House ticked.
  const card = page.getByTestId('trace-card');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('trace-building')).toHaveClass(/done/);
  await expect(card.getByTestId('trace-building')).toHaveText('✓House');
  const pill = (await page.locator('.sel-pill').boundingBox())!, c = (await card.boundingBox())!;
  expect(c.y + c.height).toBeLessThanOrEqual(pill.y);
  await card.getByTestId('trace-driveway').click();
  await expect(drawBanner(page)).toContainText('Driveway');
  await page.getByTestId('draw-bar').getByRole('button', { name: 'Cancel' }).click();
  // Put away: not back on its own, after a reload, nor when the scale is set again.
  await card.getByTestId('trace-hide').click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('trace-hidden')).toContainText('under Add');
  await page.reload();
  await expect(page.locator('.project-btn .pname')).toBeVisible();
  await expect(page.getByTestId('trace-card')).toHaveCount(0);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Background image' }).click();
  await page.locator('.sheet button', { hasText: 'Calibrate scale' }).click();
  const plan = await canvasBox(page); // (the photo, zoomed in on the house, fills the plan)
  await page.mouse.click(plan.x + plan.width / 2 - 60, plan.y + plan.height / 2 + 60);
  await page.mouse.click(plan.x + plan.width / 2 + 60, plan.y + plan.height / 2 + 60);
  await page.getByTestId('scale-distance').fill('60');
  await page.getByTestId('scale-set').click();
  await closeSheet(page);
  await expect(page.getByTestId('trace-card')).toHaveCount(0);
});

const TABLE = {
  v: 1, accessed: '2026-10-17', zips: { '71923': ['8a', 0, 3] },
  stations: [{ name: 'Arkadelphia 2 N, AR', chance: 100, spring: '03-24', springLate: '04-08', fall: '11-06', fallEarly: '10-24' }],
};
const tourCard = (page: Page) => page.getByTestId('intro-card');

test('the tour: one × with a sheet open; leaving says where to pick it up; the card steps aside while drawing, and off the house (item 7)', async ({ page }) => {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  autoDialogs(page);
  await openFresh(page);
  await page.getByTestId('intro-start').click();
  await expect(page.getByTestId('intro-step')).toHaveText('Step 1 of 8');
  await expect(page.getByTestId('intro-exit')).toBeVisible();
  // Step 1's sheet open: its × is the one the card's words mean, and the only one.
  await page.getByTestId('intro-go').click();
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(page.getByTestId('intro-exit')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Close|Exit/ }).filter({ visible: true })).toHaveCount(1);
  await page.getByTestId('zip').fill('71923');
  await page.getByTestId('zip-lookup').click();
  await page.locator('.sheet-header button.iconbtn').last().click();
  await expect(page.getByTestId('intro-step')).toHaveText('Step 2 of 8');
  await page.getByTestId('intro-skip').click();
  await expect(page.getByTestId('intro-step')).toHaveText('Step 3 of 8');
  // Drawing the house: the card steps aside, off the plan.
  await page.getByTestId('intro-go').click();
  await page.locator('.kind-chip[data-kind=building]').first().click();
  await expect(drawBanner(page)).toContainText('Building');
  await expect(tourCard(page)).toHaveCount(0);
  // Drawn low on the plan, where step 4's card goes: the plan moves it clear, above the card.
  await tapFromCenter(page, -12, 22); await tapFromCenter(page, 12, 22); await tapFromCenter(page, 12, 34);
  await expect(page.getByTestId('intro-step')).toHaveText('Step 4 of 8');
  const house = (await page.locator('#canvas-svg [data-shape-id]').first().boundingBox())!;
  const card = (await tourCard(page).boundingBox())!;
  expect(overlap(house, card)).toBe(false);
  expect(house.y + house.height).toBeLessThanOrEqual(card.y);
  // Leaving the tour says where it waits.
  await page.getByTestId('intro-exit').click();
  await expect(tourCard(page)).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Tour closed. To pick it up again: ⋮ → Help → Take the tour.');
});

test('setting a photo\'s scale, no notice covers the photo; a notice about a building keeps off it (item 7)', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await page.getByTestId('start-photo').click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await expect(page.locator('.mode-banner')).toContainText('Calibrating');
  await expect(page.locator('#toast.show')).toHaveCount(0); // (the strip above the plan says what to tap)
  await page.locator('.mode-banner button').click();
  // A small building, the only one, near the top of the plan, where notices go: its question keeps off it.
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('layers-bg').getByRole('button', { name: 'Hide the background image' }).click();
  await page.locator('.sheet-header button.iconbtn').last().click();
  await addKind(page, 'building');
  const plan = await canvasBox(page), ppf = 24 * (await zoomPct(page)) / 100;
  const at = (fx: number, fy: number) => page.mouse.click(plan.x + plan.width / 2 + fx * ppf, plan.y + 30 + fy * ppf);
  await at(-6, 0); await at(6, 0); await at(6, 8);
  const ask = page.getByTestId('real-size');
  await expect(ask).toBeVisible();
  const building = (await page.locator('#canvas-svg [data-shape-id]').first().boundingBox())!;
  expect(overlap((await ask.boundingBox())!, building)).toBe(false);
});
