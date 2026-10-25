import { test, expect, type Page } from '@playwright/test';
import { addKind, addPlainShape, closeSheet, field, openFresh, openSections } from './helpers';

// A tree's canopy is drawn over what's under it, but taps go through it; the trunk picks the tree.

const FT = 24; // px per foot at 100%
/** The center of a shape on screen. */
async function centerOf(page: Page, selector: string) {
  const b = (await page.locator(selector).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('a tap under a canopy picks what\'s under it, locked tree or not; the trunk picks the tree; a hint says so', async ({ page }) => {
  await openFresh(page);
  // A rectangle; then a tree 6 ft to its right, its canopy 16 ft across, over the rectangle.
  await addPlainShape(page, 'rect');
  await closeSheet(page);
  const rect = await centerOf(page, '#canvas-svg rect[data-shape-id]');
  await addKind(page, 'tree');
  await page.getByTestId('unknown-tree').click();
  await page.mouse.click(rect.x + 6 * FT, rect.y);
  await page.mouse.click(rect.x + 6 * FT, rect.y + 8 * FT);
  await expect(page.locator('.sel-pill .name')).toHaveText('Tree');
  await page.locator('.sel-pill .edit').click(); await openSections(page);
  await field(page, 'Label').fill('Big oak');
  await closeSheet(page);
  const name = page.locator('.sel-pill .name');
  // Under the canopy, on the rectangle: the rectangle, and the hint.
  const onRect = await centerOf(page, '#canvas-svg rect[data-shape-id]');
  await page.mouse.click(onRect.x, onRect.y);
  await expect(name).toHaveText('Unlabeled rectangle');
  await expect(page.locator('#toast')).toContainText('Under Big oak’s canopy. To pick the tree, tap its trunk.');
  // The trunk: the tree.
  const trunk = await centerOf(page, '#canvas-svg [data-role=trunk-hit]');
  await page.mouse.click(trunk.x, trunk.y);
  await expect(name).toHaveText('Big oak');
  // Locked, the same: the rectangle under it is still reachable.
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await page.getByRole('button', { name: 'Unlocked' }).click();
  await expect(page.getByRole('button', { name: 'Locked' })).toBeVisible();
  await closeSheet(page);
  await page.mouse.click(onRect.x, onRect.y);
  await expect(name).toHaveText('Unlabeled rectangle');
  // Under the canopy on open ground: nothing is picked (the hint's third time).
  await page.mouse.click(trunk.x, trunk.y + 5 * FT);
  await expect(page.locator('.sel-pill')).toHaveCount(0);
  // Then no more.
  await page.mouse.click(trunk.x, trunk.y + 4 * FT);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lp-canopy-hint'))).toBe('3');
});
