import { test, expect, type Page } from '@playwright/test';
import { addKind, canvasBox, closeSheet, drag, openFresh, openSections, tapFromCenter, zoomPct } from './helpers';

// Vines on what they climb (decided with Jason, Oct 28–29): placed or moved by a fence or a tree, a vine is offered
// it, with a button, each time (Oct 29); climbing, it's drawn as its spot and a band along what it climbs; "Climbing on" sets it by hand;
// moved out of reach, or its support deleted, it's a groundcover again.

const band = (page: Page) => page.locator('#canvas-svg [data-role=vine-band]');
async function startPlacing(page: Page, name: string) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
}
const done = (page: Page) => page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
async function feetToScreen(page: Page, dx: number, dy: number) {
  const box = await canvasBox(page);
  const ppf = 24 * (await zoomPct(page)) / 100;
  return { x: box.x + box.width / 2 + dx * ppf, y: box.y + box.height / 2 + dy * ppf };
}

test('a vine placed by a fence is offered it; climbing, it\'s drawn along the fence; set to nothing, a groundcover', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'fence');
  for (const [x, y] of [[-6, -5], [6, -5]]) await tapFromCenter(page, x, y); // (clear of the plan's buttons at the top right on a phone)
  await page.getByTestId('draw-bar').getByRole('button', { name: 'Done' }).click();
  await startPlacing(page, 'Carolina jessamine');
  // (A foot below the fence, where it is on the screen now: placing can move the plan's center.)
  const line = (await page.locator('#canvas-svg [data-role=line-hit]').first().boundingBox())!;
  const ppf = 24 * (await zoomPct(page)) / 100;
  await page.mouse.click(line.x + line.width / 2, line.y + line.height / 2 + ppf);
  const offer = page.getByTestId('vine-offer');
  await expect(offer).toContainText('Carolina jessamine could climb the fence.');
  await offer.getByRole('button', { name: 'Climb it' }).click();
  await done(page);
  await expect(band(page)).toHaveCount(1);
  // By hand: its Climbing on, at the top of its pane, shows the fence, with a way to select it; no tree switch.
  const spot = (await page.locator('#canvas-svg [data-role=vine-spot]').boundingBox())!;
  await page.mouse.click(spot.x + spot.width / 2, spot.y + spot.height / 2);
  await page.locator('.sel-pill button.edit').click();
  const climbs = page.getByTestId('climbs-on');
  await expect(climbs).toBeVisible(); // (not in a folded section)
  await expect(climbs.locator('option:checked')).toContainText('Fence');
  await openSections(page);
  await expect(page.getByTestId('is-tree')).toHaveCount(0); // (Oct 29: a vine ticked into a tree by a fat finger)
  // The fence's pane says what grows on it, a tap from the vine.
  await page.getByTestId('select-support').click();
  await expect(page.locator('.sheet .title')).toContainText('Fence');
  await expect(page.getByTestId('vines-on-it')).toContainText('Carolina jessamine grows on it');
  await page.getByTestId('vines-on-it').getByRole('button', { name: 'Select' }).click();
  await expect(page.locator('.sheet .title')).toContainText('Carolina jessamine');
  // Set to nothing: a patch on the ground again.
  await page.getByTestId('climbs-on').selectOption({ index: 0 });
  await closeSheet(page);
  await expect(band(page)).toHaveCount(0);
});

test('a vine is offered what it could climb every time it\'s moved near it, unless it\'s set to grow as a groundcover', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'fence');
  for (const [x, y] of [[-6, -5], [6, -5]]) await tapFromCenter(page, x, y); // (clear of the plan's buttons at the top right on a phone)
  await page.getByTestId('draw-bar').getByRole('button', { name: 'Done' }).click();
  await startPlacing(page, 'Carolina jessamine');
  const line = (await page.locator('#canvas-svg [data-role=line-hit]').first().boundingBox())!;
  const ppf = 24 * (await zoomPct(page)) / 100;
  await page.mouse.click(line.x + line.width / 2, line.y + line.height / 2 + ppf); // (a foot below the fence)
  const offer = page.getByTestId('vine-offer');
  await expect(offer).toContainText('Carolina jessamine could climb the fence.');
  await done(page);
  await page.keyboard.press('Escape');
  const vine = page.locator('#canvas-svg circle[data-shape-id]').first();
  const center = async () => { const b = (await vine.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // Left on the ground (the notice dismissed), moved a foot along, still by the fence: offered again.
  await offer.getByTestId('notice-close').click();
  await expect(offer).toHaveCount(0);
  let c = await center();
  await drag(page, c, { x: c.x + ppf, y: c.y });
  await expect(offer).toContainText('Carolina jessamine could climb the fence.');
  await offer.getByTestId('notice-close').click();
  // Set to grow as a groundcover: moved again, no offer.
  c = await center();
  await page.waitForTimeout(450);
  await page.mouse.click(c.x, c.y);
  await expect(page.locator('.sel-pill .name')).toHaveText('Carolina jessamine');
  await page.locator('.sel-pill button.edit').click();
  await page.getByTestId('groundcover').check();
  await closeSheet(page);
  await page.keyboard.press('Escape');
  c = await center();
  await drag(page, c, { x: c.x - ppf, y: c.y });
  await page.waitForTimeout(500);
  await expect(offer).toHaveCount(0);
});

test('a tree placed by a vine is offered to it; the vine moved out of its reach is a groundcover again, with Undo', async ({ page }) => {
  await openFresh(page);
  await startPlacing(page, 'Carolina jessamine');
  await tapFromCenter(page, 2, 0);
  await done(page);
  await startPlacing(page, 'Eastern redbud');
  await tapFromCenter(page, 0, 0);
  const offer = page.getByTestId('vine-offer');
  await expect(offer).toContainText('Carolina jessamine could climb the eastern redbud.');
  await offer.getByRole('button', { name: 'Climb it' }).click();
  await done(page);
  await expect(band(page)).toHaveCount(1);
  // Dragged 18 ft from the tree: past its spread (12.5 ft), out of its reach. (Zoomed out, so it stays in view.)
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await drag(page, await feetToScreen(page, 2, 0), await feetToScreen(page, 2, 18));
  const freed = page.getByTestId('vine-freed');
  await expect(freed).toContainText('Carolina jessamine is out of reach of what it climbed: now a groundcover.');
  await expect(band(page)).toHaveCount(0);
  await freed.getByRole('button', { name: 'Undo' }).click();
  await expect(band(page)).toHaveCount(1);
});

// A trellis and an arbor (the vine plan's last part, Oct 29): garden structures in the Add sheet. A vine by a trellis
// bands along it; a vine by an arbor covers its top.
test('an arbor drawn, a vine placed by it is offered it and covers it; a trellis is drawn with its lattice', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'arbor');
  for (const [x, y] of [[-4, -6], [4, -6], [4, -2]]) await tapFromCenter(page, x, y);
  await expect(page.locator('#canvas-svg [data-role=arbor-slats]')).toHaveCount(1);
  const arbor = page.locator('#canvas-svg rect[data-shape-id]');
  await startPlacing(page, 'Carolina jessamine');
  // (A foot below the arbor, where it is on the screen now.)
  const box = (await arbor.boundingBox())!;
  const ppf = 24 * (await zoomPct(page)) / 100;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height + ppf);
  const offer = page.getByTestId('vine-offer');
  await expect(offer).toContainText('Carolina jessamine could climb the arbor.');
  await offer.getByRole('button', { name: 'Climb it' }).click();
  await done(page);
  // Over its top: the cover is the arbor's own size (the vine's 25 ft spread covers all 8 ft of it).
  const cover = (await band(page).boundingBox())!, under = (await arbor.boundingBox())!;
  expect(Math.abs(cover.width - under.width)).toBeLessThan(4);
  expect(Math.abs(cover.height - under.height)).toBeLessThan(4);
  // A trellis: a line with its lattice.
  await page.keyboard.press('Escape');
  await addKind(page, 'trellis');
  for (const [x, y] of [[-3, 6], [3, 6]]) await tapFromCenter(page, x, y);
  await page.getByTestId('draw-bar').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('#canvas-svg [data-role=trellis-lattice]')).toHaveCount(1);
});
