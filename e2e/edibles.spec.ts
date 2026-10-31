import { test, expect, type Page } from '@playwright/test';
import { closeSheet, openFilters, openFresh, openWarnings, shapeCount, tapFromCenter, openSettings } from './helpers';

// Edibles and fruit partners (Jason, Oct 30): which part is edible, as chips under Edible; a notice as a plant is
// placed that needs a partner to fruit, with the catalog's partners to add.

async function pick(page: Page, search: string, name: string) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(search);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
}

test('a female winterberry placed says it needs a male, and offers one to place; with a male in the plan, nothing is said', async ({ page }) => {
  await openFresh(page);
  await pick(page, 'Winter Red', "'Winter Red'");
  await tapFromCenter(page, -3, 0);
  const notice = page.getByTestId('fruit-notice');
  await expect(notice).toContainText("'Winter Red' is a female: it needs a male of its kind nearby to fruit");
  await notice.getByRole('button', { name: "Add 'Southern Gentleman'" }).click();
  await expect(page.getByTestId('place-bar')).toContainText('Southern Gentleman');
  await tapFromCenter(page, 3, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => shapeCount(page)).toBe(2);
  // Another female, the male there: nothing to say.
  await pick(page, 'Winter Red', "'Winter Red'");
  await tapFromCenter(page, 0, 4);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => shapeCount(page)).toBe(3);
  await expect(page.getByTestId('fruit-notice')).toHaveCount(0);
  // The notices have a switch in Settings → Warnings.
  await openSettings(page);
  await openWarnings(page);
  await expect(page.getByTestId('fruit-warnings')).toBeChecked();
});

test('a male holly offers two females alike, and "All 4…" opens the picker on every one (Jason, Oct 30)', async ({ page }) => {
  await openFresh(page);
  await pick(page, 'Latifolia', "'Latifolia'");
  await tapFromCenter(page, -3, 0);
  const notice = page.getByTestId('fruit-notice');
  await expect(notice).toContainText("'Latifolia' is a male");
  // (Its two choices look alike: neither is "the" answer.)
  const choices = notice.locator('button.notice-choice');
  await expect(choices).toHaveCount(2);
  const looks = await choices.evaluateAll((bs) => bs.map((b) => getComputedStyle(b).backgroundColor));
  expect(looks[0]).toBe(looks[1]);
  await notice.getByRole('button', { name: 'All 4\u2026' }).click();
  await expect(page.locator('.sheet')).toContainText("Partners for Japanese holly 'Latifolia'");
  // (Under their species, its fold open to them: "4 of 8 cultivars match your filters; the species itself doesn't".)
  await expect(page.locator('.sheet')).toContainText('4 of 8 cultivars match');
  for (const n of ['Convexa', 'Helleri', 'Hetzii', 'Sky Pencil']) await expect(page.locator('.sheet .proj-row', { hasText: n })).toHaveCount(1);
  await expect(page.locator('.sheet .proj-row', { hasText: "'Stokes'" })).toHaveCount(0); // (a male)
});

test("the picker's Edible filter has chips for the part: fruit, leaves, flowers", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await openFilters(page);
  const parts = page.getByTestId('edible-parts');
  await expect(parts).toBeHidden();
  await page.getByTestId('edible-filter').check();
  await expect(parts).toBeVisible();
  await parts.locator('label', { hasText: 'Leaves' }).click();
  await expect(page.getByTestId('active-chip')).toHaveText(['Edible leaves']);
  await page.getByTestId('plant-search').fill("Pawpaw 'Davis'");
  await expect(page.locator('.plant-item', { hasText: "Pawpaw 'Davis'" })).toHaveCount(0); // (its fruit, not its leaves)
  await parts.locator('label', { hasText: 'Fruit' }).click();
  await expect(page.locator('.plant-item', { hasText: "Pawpaw 'Davis'" })).toHaveCount(1);
  // Edible unticked: the parts go with it.
  await page.getByTestId('edible-filter').uncheck();
  await expect(parts).toBeHidden();
  await expect(page.getByTestId('active-chip')).toHaveCount(0);
  await closeSheet(page);
});
