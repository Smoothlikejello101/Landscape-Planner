import { test, expect } from '@playwright/test';
import { autoDialogs, openFresh } from './helpers';

test('Layers shows and hides the background image, and sets how faint it is', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'background image' }).click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await page.locator('.mode-banner button').click(); // skip calibration
  const image = page.locator('#canvas-svg image');
  await expect(image).toHaveCount(1);

  // With no shapes yet, Layers has the background row.
  await page.locator('button[title=Layers]').click();
  const row = page.getByTestId('layers-bg');
  await row.getByRole('button', { name: 'Hide the background image' }).click();
  await expect(image).toHaveCount(0);
  await expect(row.getByTestId('layers-bg-opacity')).toBeDisabled();
  await row.getByRole('button', { name: 'Show the background image' }).click();
  await expect(image).toHaveCount(1);

  // The slider redraws the plan only: it keeps its place.
  const slider = row.getByTestId('layers-bg-opacity');
  await slider.fill('0.3');
  await expect(slider).toBeFocused();
  await expect(image).toHaveAttribute('opacity', '0.3');
  await expect(row).toContainText('30%');
  // A toggle right after a slide is its own step to undo.
  await row.getByRole('button', { name: 'Hide the background image' }).click();
  await page.locator('.sheet-header button.iconbtn').last().click();
  await page.locator('button[title=Undo]').click();
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute('opacity', '0.3');
  await page.locator('button[title=Layers]').click();
  // The rest of its settings, one tap away.
  await row.getByTestId('layers-bg-more').click();
  await expect(page.locator('.sheet-header .title')).toContainText(/background/i);
});

test('while the image is being placed, Layers keeps it shown', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'background image' }).click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await expect(page.locator('.mode-banner')).toContainText('Calibrating');
  await page.locator('button[title=Layers]').click();
  await expect(page.getByTestId('layers-bg').getByRole('button', { name: 'Hide the background image' })).toBeDisabled();
});

test('a new photo is shown whole to calibrate on; left uncalibrated, it says so in its panel and once after a reload (Dana, Grace)', async ({ page }) => {
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'background image' }).click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  const image = page.locator('#canvas-svg image');
  await expect(image).toHaveCount(1);
  // (The whole photo in view: its box within the plan's.)
  const plan = (await page.locator('#canvas-svg').boundingBox())!, img = (await image.boundingBox())!;
  expect(img.x).toBeGreaterThanOrEqual(plan.x - 1);
  expect(img.x + img.width).toBeLessThanOrEqual(plan.x + plan.width + 1);
  expect(img.y).toBeGreaterThanOrEqual(plan.y - 1);
  expect(img.y + img.height).toBeLessThanOrEqual(plan.y + plan.height + 1);
  await page.locator('.mode-banner button').click(); // skip calibration
  await expect(page.getByTestId('calibrate-notice')).toHaveCount(0); // (just added: the banner asked)
  await page.reload();
  await expect(page.getByTestId('calibrate-notice')).toContainText('isn’t to scale yet');
  await page.getByTestId('calibrate-notice').getByRole('button', { name: 'Dismiss' }).click();
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'background image' }).click();
  await expect(page.getByTestId('bg-uncalibrated')).toContainText('Not to scale yet');
});
