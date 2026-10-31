import { test, expect, type Page } from '@playwright/test';
import { answerAsk, closeSheet, openFresh, tapFromCenter } from './helpers';

// Jason's round 3 decisions (Oct 31), the first batch, each as a tester met it.

async function place(page: Page, name: string, spots: [number, number][]) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  for (const [x, y] of spots) await tapFromCenter(page, x, y);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
}

test('the Show plants filter stays with the plan after a reload (Jordan, Priya)', async ({ page }) => {
  await openFresh(page);
  await place(page, 'Turkey corn', [[0, 0]]);
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('filter-status').selectOption('planned');
  await closeSheet(page);
  await page.waitForTimeout(600);
  await page.reload();
  await page.locator('button[title=Layers]').click();
  await expect(page.getByTestId('filter-status')).toHaveValue('planned');
});

test('the project list keeps its order while open; a rename to a name in use gets "(2)" (Sam)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.project-btn').click();
  await page.getByRole('button', { name: /New project/ }).click();
  await answerAsk(page, true, 'Alpha');
  await page.locator('.project-btn').click();
  const names = () => page.locator('.sheet .proj-row .pname').allTextContents();
  const before = await names();
  await page.getByRole('button', { name: 'Rename My Garden' }).click();
  await page.locator('.modal input').fill('Alpha');
  await page.locator('.modal input').press('Enter');
  // Back on the list: renamed with "(2)", in the same place.
  await expect(page.locator('.sheet .proj-row .pname')).toHaveText(before.map((n) => (n === 'My Garden' ? 'Alpha (2)' : n)));
});

test('swapped for a bigger plant that now crowds a neighbor: said, with Undo (Dana)', async ({ page }) => {
  await openFresh(page);
  await place(page, 'Turkey corn', [[-1.5, 0], [1.5, 0]]);
  await page.waitForTimeout(450);
  await tapFromCenter(page, -1.5, 0);
  await page.locator('.sel-pill button.edit').click();
  await page.getByTestId('swap-plant').click();
  await page.getByTestId('plant-search').fill('Oakleaf hydrangea');
  await page.locator('.sheet .proj-row', { hasText: 'Oakleaf hydrangea' }).first().getByTestId('plant-place').click();
  const notice = page.getByTestId('crowd-notice');
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.sheet .title')).toContainText('Turkey corn');
});

test('one of my own, male or female, for a kind with both (Owen); its copy of a male starts male', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill("Southern Gentleman");
  await page.locator('.proj-row', { hasText: "Southern Gentleman" }).first().getByRole('button', { name: /Copy as my plant/ }).click();
  await expect(page.getByTestId('pf-species')).toBeChecked();
  await expect(page.getByTestId('pf-sex-field')).toBeVisible();
  await expect(page.getByTestId('pf-sex')).toHaveValue('male');
  // Not the same species: no such choice.
  await page.getByTestId('pf-species').uncheck();
  await expect(page.getByTestId('pf-sex-field')).toBeHidden();
});

test('while placing, a warning sits above the place bar, its buttons in one row (Bea)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Snowberry');
  await page.locator('.sheet .proj-row', { hasText: 'Snowberry' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await tapFromCenter(page, 1, 0);
  const notice = page.getByTestId('crowd-notice');
  await expect(notice).toBeVisible();
  const n = (await notice.boundingBox())!, bar = (await page.getByTestId('place-bar').boundingBox())!;
  expect(n.y + n.height).toBeLessThanOrEqual(bar.y);
  expect(n.y + n.height).toBeGreaterThan(bar.y - 40);
  const tops = await notice.locator('.notice-buttons button').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});
