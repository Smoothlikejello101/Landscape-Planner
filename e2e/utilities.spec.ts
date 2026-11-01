import { test, expect, type Page } from '@playwright/test';
import { addKind, closeSheet, openFresh, openSections, tapFromCenter } from './helpers';

// Utilities (sub-features part 2, decided with Jason, 2026-10-25): an overhead power line checks how tall the trees
// near it grow; a buried line, trees and shrubs within 10 ft; a septic field, trees and shrubs nearer it than they
// grow tall, and edibles on it (src/utilities.ts).

const badges = (page: Page) => page.locator('#canvas-svg [data-role=utility-warning]');
async function place(page: Page, name: string, x: number, y: number) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, x, y);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
}

test('a tall tree near a power line is flagged, says why, and can be dismissed', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'powerline');
  for (const [x, y] of [[-6, -5], [6, -5]]) await tapFromCenter(page, x, y);
  await page.getByTestId('draw-bar').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.sel-pill .name')).toHaveText('Power line');
  // A northern red oak (60 ft) 6 ft from it.
  await place(page, 'Northern red oak', 0, 1);
  await expect(badges(page)).toHaveCount(1);
  await tapFromCenter(page, 0, 1);
  await page.locator('.sel-pill button.edit').click();
  await expect(page.getByTestId('utility-line')).toHaveText(/Grows to 60 ft, [67](\.5)? ft from a power line/); // (where the tap lands, snapped)
  await expect(page.getByTestId('utility-detail')).toBeHidden();
  await page.getByTestId('utility-line').click();
  await expect(page.getByTestId('utility-detail')).toContainText('UF/IFAS Extension');
  await expect(page.getByTestId('utility-dismiss')).toHaveText('Dismiss for this one');
  await page.getByTestId('utility-dismiss').click();
  await expect(page.getByTestId('utility-line')).toContainText('(dismissed for this one: no badge on the plan)');
  await expect(page.getByTestId('utility-dismiss')).toHaveText('Show again');
  await closeSheet(page);
  await expect(badges(page)).toHaveCount(0);
});

test('a buried line: says to call 811, can be made overhead, and flags a shrub within 10 ft', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'buried');
  for (const [x, y] of [[-6, -5], [6, -5]]) await tapFromCenter(page, x, y);
  await page.getByTestId('draw-bar').getByRole('button', { name: 'Done' }).click();
  await page.locator('.sel-pill button.edit').click();
  await openSections(page);
  const section = page.getByTestId('utility-section');
  await expect(section).toContainText('Call 811');
  await section.locator('[data-utility=overhead]').click();
  await expect(section).toContainText('Trees near it are checked');
  await section.locator('[data-utility=buried]').click();
  await expect(section.locator('[data-utility=buried]')).toHaveAttribute('aria-pressed', 'true');
  await closeSheet(page);
  await place(page, 'Spicebush', 0, -1); // 4 ft from it
  await expect(badges(page)).toHaveCount(1);
});

test('a septic field: a shrub on it is flagged; a perennial is not', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'septic');
  for (const [x, y] of [[-6, -4], [6, -4], [0, 4]]) await tapFromCenter(page, x, y); // (12 × 8 ft)
  await expect(page.locator('.sel-pill .name')).toHaveText('Septic field');
  await place(page, 'Spicebush', -3, 0);
  await expect(badges(page)).toHaveCount(1);
  await place(page, 'Butterfly milkweed', 3, 0);
  await expect(badges(page)).toHaveCount(1);
  await tapFromCenter(page, -3, 0);
  await page.locator('.sel-pill button.edit').click();
  await expect(page.getByTestId('utility-line')).toHaveText(/On the septic field/);
});
