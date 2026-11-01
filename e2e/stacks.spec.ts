import { test, expect, type Page } from '@playwright/test';
import { addKind, closeSheet, openFresh, tapFromCenter } from './helpers';

// Shapes stacked under a finger (Jason's testing notes, Oct 29): a second, separate tap picks the next one under it,
// round the stack; a tree's trunk is over everything, so a tap on it always picks the tree; a press on a locked shape
// goes to what's on it.

const name = (page: Page) => page.locator('.sel-pill .name');
async function place(page: Page, plant: string, dx: number, dy: number) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(plant);
  await page.locator('.sheet .proj-row', { hasText: plant }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, dx, dy);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
}
/** A separate tap: past a double tap's time. */
const slowTap = async (page: Page, dx: number, dy: number) => { await page.waitForTimeout(450); await tapFromCenter(page, dx, dy); };

test('a second tap picks what\'s under it, round the stack, said the first time; a double tap opens the one selected', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'bed', 'rect');
  for (const [x, y] of [[-6, -4], [6, -4], [6, 4]]) await tapFromCenter(page, x, y);
  await place(page, 'Buttonbush', 0, 0);
  await page.keyboard.press('Escape');
  await slowTap(page, 0, 0);
  await expect(name(page)).toHaveText('Buttonbush');
  await expect(page.locator('#toast')).toContainText(/(Tap|Click) again for the bed under it\./);
  await slowTap(page, 0, 0);
  await expect(name(page)).toHaveText('Bed');
  await slowTap(page, 0, 0);
  await expect(name(page)).toHaveText('Buttonbush');
  // A double tap on it: its own pane, not the bed's.
  await page.waitForTimeout(450);
  const box = (await page.locator('#canvas-svg').boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.sheet .title')).toContainText('Buttonbush');
});

test('a tree\'s trunk is over a groundcover patch around it: a tap on it picks the tree', async ({ page }) => {
  await openFresh(page);
  await place(page, 'Eastern redbud', 0, 0);
  await place(page, 'Carolina jessamine', 0.5, 0); // (on the ground, drawn at its base, 2 ft across: over the trunk)
  await page.keyboard.press('Escape');
  const trunk = (await page.locator('#canvas-svg [data-role=trunk-hit]').boundingBox())!;
  await page.waitForTimeout(450);
  await page.mouse.click(trunk.x + trunk.width / 2, trunk.y + trunk.height / 2);
  await expect(name(page)).toHaveText('Eastern redbud');
});

test('a press on a locked house goes to the bed drawn on it: a tap picks the bed, a drag moves it', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'building', 'rect');
  for (const [x, y] of [[-6, -4], [6, -4], [6, 3]]) await tapFromCenter(page, x, y);
  await addKind(page, 'bed', 'rect');
  for (const [x, y] of [[-2, -1.5], [2, -1.5], [2, 1.5]]) await tapFromCenter(page, x, y);
  // (Where they are now: the plan grows taller once the drawing bar goes. The bed is drawn first, under the house.)
  const bed = page.locator('#canvas-svg rect[data-shape-id]').first(), house = page.locator('#canvas-svg rect[data-shape-id]').last();
  const middle = async (l: typeof bed) => { const b = (await l.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  const tap = async (p: { x: number; y: number }) => { await page.waitForTimeout(450); await page.mouse.click(p.x, p.y); };
  // The house, locked (picked where the bed isn't).
  await page.keyboard.press('Escape');
  const h = await middle(house);
  await tap({ x: h.b.x + 10, y: h.b.y + 10 });
  await expect(name(page)).toHaveText('House');
  await page.locator('.sel-pill .edit').click();
  await page.getByRole('button', { name: 'Unlocked' }).click();
  await expect(page.getByRole('button', { name: 'Locked' })).toBeVisible();
  await closeSheet(page);
  await page.keyboard.press('Escape');
  const m = await middle(bed);
  await tap(m);
  await expect(name(page)).toHaveText('Bed');
  // Dragged 3 ft right: the bed moves, the house stays.
  const ppf = h.b.width / 12;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  await page.mouse.move(m.x, m.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(m.x + (i * 3 * ppf) / 8, m.y);
  await page.mouse.up();
  expect((await house.boundingBox())!.x).toBeCloseTo(h.b.x, 0);
  expect((await bed.boundingBox())!.x).toBeCloseTo(m.b.x + 3 * ppf, -1);
});
