import { test, expect, type Page } from '@playwright/test';
import { addKind, openFresh, tapFromCenter } from './helpers';

// Locking a selection from the header, as for one shape; and Esc when an extension takes its press (Jason, 2026-10-25).

async function centerOf(page: Page, selector: string, n = 0) {
  const b = (await page.locator(selector).nth(n).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function placeTwo(page: Page) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Tennessee coneflower');
  await page.locator('.sheet .proj-row', { hasText: 'Tennessee coneflower' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, -3, 0);
  await tapFromCenter(page, 3, 0);
  await expect(page.getByTestId('place-banner')).toContainText('2 placed');
}

test('a selection locks from the header toggle: how many are locked, then all, then none', async ({ page }) => {
  await openFresh(page);
  for (const dx of [-4, 4]) {
    await addKind(page, 'plain', 'rect');
    for (const [x, y] of [[dx - 2, -1.5], [dx + 2, -1.5], [dx, 1.5]]) await tapFromCenter(page, x, y);
    await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  }
  const shapes = '#canvas-svg rect[data-shape-id]';
  const [a, b] = [await centerOf(page, shapes, 0), await centerOf(page, shapes, 1)];
  // One locked on its own.
  await page.mouse.click(a.x, a.y);
  await page.locator('.sel-pill .edit').click();
  await page.locator('.sheet .lockbtn').click();
  await expect(page.locator('.sheet .lockbtn')).toHaveText('Locked');
  await page.locator('.sheet-header .iconbtn').last().click();
  await page.keyboard.press('Escape'); // (nothing selected)
  // Both: "1 of 2 locked", in the same corner.
  await page.getByTestId('select-mode').click();
  await page.mouse.click(a.x, a.y); await page.mouse.click(b.x, b.y);
  await page.locator('.multi-bar button', { hasText: 'Edit' }).click();
  const lock = page.locator('.sheet-header').getByTestId('lock-all');
  await expect(lock).toHaveText('1 of 2 locked');
  await expect(lock).toHaveAttribute('aria-label', 'Lock all (1 of 2 locked)');
  await lock.click();
  await expect(lock).toHaveText('Locked');
  await lock.click();
  await expect(lock).toHaveText('Unlocked');
  await expect(page.locator('.sheet-body').getByRole('button', { name: /Lock all|Unlock all/ })).toHaveCount(0); // (not in the body too)
});

test('Esc ends placing once, and still does when something takes its press', async ({ page }) => {
  await openFresh(page);
  await placeTwo(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('place-bar')).toHaveCount(0);
  await expect(page.locator('.multi-bar .count')).toHaveText('2 just placed'); // (its release didn't act again: still selected)
});

test('Esc whose press an extension takes still ends placing, on its release', async ({ page }) => {
  // (As PhotoShow does: it takes Esc before the page sees it.)
  await page.addInitScript(() => window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); } }, true));
  await openFresh(page);
  await placeTwo(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('place-bar')).toHaveCount(0);
  await expect(page.locator('.multi-bar .count')).toHaveText('2 just placed');
});
