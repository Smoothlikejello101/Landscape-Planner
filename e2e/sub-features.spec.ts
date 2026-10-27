import { test, expect, type Page } from '@playwright/test';
import { addKind, closeSheet, openSections, setRole, tapFromCenter, zoomPct } from './helpers';

// Sub-features: doors and windows on a building, gates in a fence, steps off a deck, tapped onto their edges.

const feats = (page: Page) => page.locator('#canvas-svg [data-role=sub-feature]');
const ppf = async (page: Page) => 24 * (await zoomPct(page)) / 100;
async function editSelected(page: Page) { await page.locator('.sel-pill .edit').click(); await openSections(page); }

test('a building drawn, then its door and windows tapped onto its walls; moved, sized, taken off, undone', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'building', 'rect');
  await page.getByTestId('then-features').check();
  for (const [x, y] of [[-6, -4], [6, -4], [0, 4]]) await tapFromCenter(page, x, y); // a 12 × 8 ft house
  // Straight on to its doors and windows.
  await expect(page.getByTestId('feature-banner')).toContainText('Tap a wall where the door goes');
  // (Where the house is now: the bar below grew, so the plan's middle moved on screen.)
  const k0 = await ppf(page);
  const h = (await page.locator('#canvas-svg [data-shape-id]').first().boundingBox())!;
  await page.mouse.click(h.x + 4 * k0, h.y - 0.2 * k0); // on the top wall
  await page.locator('[data-testid=feature-bar] [data-feature=window]').click();
  await page.mouse.click(h.x + 9 * k0, h.y + 0.1 * k0);
  await page.mouse.click(h.x + h.width / 2, h.y + h.height / 2); // the middle of the house: not a wall
  await expect(page.locator('#toast')).toContainText('Tap on an edge of it');
  await expect(page.getByTestId('feature-banner')).toContainText('2 added');
  // The top bar's Undo takes back the last one, as the bar's does; a third tapped on again.
  await page.locator('button[title=Undo]').click();
  await expect(page.getByTestId('feature-banner')).toContainText('1 added');
  await expect(feats(page)).toHaveCount(1);
  await page.mouse.click(h.x + 9 * k0, h.y + 0.1 * k0);
  await expect(page.getByTestId('feature-banner')).toContainText('2 added');
  await page.getByTestId('feature-bar').getByRole('button', { name: 'Done' }).click();
  await expect(feats(page)).toHaveCount(2);
  await expect(page.locator('#canvas-svg [data-feature=door]')).toHaveCount(1);

  // Listed in its properties; widened there.
  await editSelected(page);
  await expect(page.getByTestId('section-features').locator('.prop-summary')).toHaveText('Door, window');
  await page.getByTestId('feature-width').first().fill('4');
  await closeSheet(page);

  // Dragged along the wall: the window goes 2 ft left.
  const k = await ppf(page);
  const win = page.locator('#canvas-svg [data-feature=window] [data-role=feature-hit]');
  const b = (await win.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 2 * k, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  const b2 = (await win.boundingBox())!;
  expect(Math.round(b2.x - b.x)).toBe(Math.round(-2 * k));

  // Taken off, and back with Undo.
  await editSelected(page);
  await page.getByTestId('feature-delete').last().click();
  await expect(feats(page)).toHaveCount(1);
  await closeSheet(page);
  await page.locator('button[title=Undo]').click();
  await expect(feats(page)).toHaveCount(2);

  // Made a bed instead: what was on it is still listed, to take off.
  await editSelected(page);
  await setRole(page, 'Bed');
  await expect(page.getByTestId('section-features').locator('.prop-title')).toHaveText('On its edges');
  await expect(page.getByTestId('feature-add')).toHaveCount(0);
  await page.getByTestId('feature-delete').first().click();
  await page.getByTestId('feature-delete').first().click();
  await expect(feats(page)).toHaveCount(0);
  await expect(page.getByTestId('section-features')).toHaveCount(0);
});

test('a gate in a fence, added from its properties; a plain bed takes none', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'fence');
  for (const [x, y] of [[-8, 2], [8, 2]]) await tapFromCenter(page, x, y);
  await page.getByTestId('draw-bar').getByRole('button', { name: 'Done' }).click();
  await editSelected(page);
  await expect(page.getByTestId('section-features').locator('.prop-title')).toHaveText('Gates');
  await page.locator('[data-testid=feature-add][data-feature=gate]').click();
  await expect(page.getByTestId('feature-banner')).toContainText('Tap the line where the gate goes');
  // (Opening its properties brought the fence into view: tap it where it is now, a little off the line.)
  const line = (await page.locator('#canvas-svg [data-role=line-hit]').boundingBox())!;
  await page.mouse.click(line.x + line.width / 2 + 24, line.y + line.height / 2 + 4);
  await page.getByTestId('feature-bar').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('#canvas-svg [data-feature=gate]')).toHaveCount(1);

  await addKind(page, 'bed', 'rect');
  for (const [x, y] of [[-3, -6], [3, -6], [0, -3]]) await tapFromCenter(page, x, y);
  await editSelected(page);
  await expect(page.getByTestId('section-features')).toHaveCount(0);
});

async function openFresh(page: Page) {
  await page.goto('./');
  await expect(page.locator('.project-btn .pname')).toBeVisible();
}
