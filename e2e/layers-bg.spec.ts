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
  // The rest of its settings, one tap away.
  await row.getByTestId('layers-bg-more').click();
  await expect(page.locator('.sheet-header .title')).toContainText(/background/i);
});
