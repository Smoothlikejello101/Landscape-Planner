import { test, expect, type Page } from '@playwright/test';
import { addKind, openFresh, shapeCount, tapFromCenter, tapping } from './helpers';

// Adding more of the same, the plant search, and property lines.

const placeBar = (page: Page) => page.getByTestId('place-bar');
const drawBanner = (page: Page) => page.getByTestId('draw-banner');

test('the search is kept while switching plants, and starts empty on a fresh pick', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Tennessee coneflower');
  await page.locator('.sheet .proj-row', { hasText: 'Tennessee coneflower' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  // The next plant for the same purpose is likely another match.
  await placeBar(page).getByTestId('place-switch').click();
  await expect(page.getByTestId('plant-search')).toHaveValue('Tennessee coneflower');
  await page.locator('.sheet-header .iconbtn').last().click();
  await placeBar(page).getByRole('button', { name: 'Done' }).click();
  // Something else entirely: an existing tree starts with nothing filtered out.
  await addKind(page, 'tree');
  await expect(page.getByTestId('plant-search')).toHaveValue('');
  await expect(page.locator('.sheet .proj-row').first()).toBeVisible();
});

test('More draws another of the same tree, or another of a drawn thing', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'tree');
  await page.getByTestId('unknown-tree').click();
  await tapFromCenter(page, -4, 0); await tapFromCenter(page, -4, 3);
  await page.getByTestId('pill-place-more').click();
  await expect(drawBanner(page)).toHaveText(tapping('Existing tree: Tap the trunk', true)); // drawn, not a default-size circle
  await expect(page.getByTestId('place-bar')).toHaveCount(0);
  await tapFromCenter(page, 4, 0); await tapFromCenter(page, 4, 2);
  expect(await shapeCount(page)).toBe(2);
  await expect(page.locator('#canvas-svg [data-role=trunk]')).toHaveCount(2);
  await page.locator('.sel-pill .edit').click();
  await expect(page.locator('.sheet .action-row').getByTestId('place-more')).toHaveText('Draw another');
  await page.locator('.sheet-header .iconbtn').last().click();

  // A bed: More starts drawing another bed.
  await page.locator('.tool-btn.bed').click();
  await page.locator('[data-testid=draw-bar] [data-method=rect]').click();
  await tapFromCenter(page, -6, 6); await tapFromCenter(page, 0, 6); await tapFromCenter(page, 0, 8);
  await page.getByTestId('pill-place-more').click();
  await expect(drawBanner(page)).toContainText('Bed:');
});

test('a property line can stay open, and is named along itself', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'property');
  await expect(page.locator('[data-testid=draw-bar] [data-method].on')).toHaveAttribute('data-method', 'line');
  await tapFromCenter(page, 2, -6); await tapFromCenter(page, 2, 6);
  await page.locator('[data-testid=draw-bar]').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('#canvas-svg polyline[data-shape-id]:not([data-role])')).toHaveCount(1); // open, not closed
  await expect(page.locator('#canvas-svg polygon[data-shape-id]')).toHaveCount(0);
  const label = page.locator('#canvas-svg text', { hasText: 'Property line' });
  await expect(label).toHaveAttribute('transform', /^rotate\(90 /); // runs along the line
});
