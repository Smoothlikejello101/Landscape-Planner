import { test, expect } from '@playwright/test';
import { openFresh } from './helpers';

// The phone's back button (a tester on Android, Oct 30): it closes what's open, one thing at a time, as Esc does; with
// nothing open, it says the next one leaves.
test('back closes the open panel and stays in the app; with nothing open it warns first', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await expect(page.locator('.sheet')).toHaveCount(1);
  await page.goBack();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('.project-btn .pname')).toBeVisible(); // (still in the app)
  // Nothing open: a word first, still in the app.
  await page.locator('#canvas-svg').click({ position: { x: 30, y: 30 } });
  await page.goBack();
  await expect(page.locator('#toast')).toContainText('Press back again to leave FullGrown.');
  await expect(page.locator('.project-btn .pname')).toBeVisible();
});
