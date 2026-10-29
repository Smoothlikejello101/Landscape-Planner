import { test, expect, type Page } from '@playwright/test';
import { openFresh, tapFromCenter } from './helpers';

// Garden over time (Jason, Oct 29: the month slider, for most of the beta): the plan drawn in a month, from the
// plan's Through the year button; Done goes back to every plant in bloom.

async function place(page: Page, name: string, dx: number) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, dx, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
}

test('through the year: each plant as it is that month, bare in winter and in bloom in summer; Done brings back the plan in bloom', async ({ page }) => {
  await openFresh(page);
  await place(page, 'Buttonbush', 0);
  const look = page.locator('#canvas-svg [data-role=plant-look]');
  await page.getByTestId('year-open').click();
  await expect(page.getByTestId('year-bar')).toBeVisible();
  await expect(page.locator('.tool-btn.plants')).toHaveCount(0); // (the month's controls in the bar's place)
  const month = page.getByTestId('year-month');
  // January: bare twigs, no blooms.
  await page.getByTestId('year-slider').fill('1');
  await expect(month).toHaveText('January');
  await expect(look.locator('[fill="#ebe0c9"]').first()).toBeAttached();
  await expect(look.locator('[fill="#f1e6c4"]')).toHaveCount(0);
  await expect(page.getByTestId('year-count')).toHaveText('Nothing in bloom');
  // A step on: February. July: in leaf, its cream blooms (faint: NC State's "summer" is a season, so "around").
  await page.getByTestId('year-next').click();
  await expect(month).toHaveText('February');
  await page.getByTestId('year-slider').fill('7');
  await expect(month).toHaveText('July');
  await expect(look.locator('[fill="#f1e6c4"]').first()).toBeAttached();
  await expect(page.getByTestId('year-count')).toHaveText('1 of 1 in bloom');
  // Done: the plan's own bar again, the plant in bloom.
  await page.getByTestId('year-done').click();
  await expect(page.getByTestId('year-bar')).toHaveCount(0);
  await expect(page.locator('.tool-btn.plants')).toBeVisible();
  await expect(look.locator('[fill="#f1e6c4"]').first()).toBeAttached();
});

test("a plant whose winter isn't on record: a dotted ring in the winter months, none in summer", async ({ page }) => {
  await openFresh(page);
  await place(page, 'Calamintha', 0);
  await page.getByTestId('year-open').click();
  const ring = page.locator('#canvas-svg [data-role=look-unknown]');
  await page.getByTestId('year-slider').fill('1');
  await expect(ring).toHaveCount(1);
  await page.getByTestId('year-slider').fill('7');
  await expect(ring).toHaveCount(0);
});
