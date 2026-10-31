import { test, expect, type Page } from '@playwright/test';
import { openFresh } from './helpers';

// What's new (src/whats-new.ts): after an update, a notice says so once and opens the list; ⋮ → What's new any time
// (Jason, Oct 31: before the beta invites go out).

async function openFromMenu(page: Page) {
  await page.locator('button[title=More]').click();
  await page.getByTestId('menu-whats-new').click();
}

test("a new device isn't told what's new; the list is in ⋮, with nothing marked New", async ({ page }) => {
  await openFresh(page);
  await expect(page.getByTestId('whats-new-notice')).toHaveCount(0);
  await openFromMenu(page);
  const list = page.getByTestId('whats-new');
  await expect(list.getByTestId('release-1')).toContainText('Settings has a sheet of its own');
  await expect(list.getByTestId('whats-new-fresh')).toHaveCount(0);
  await expect(list).toContainText(/Version \S+/);
});

test("after an update, a notice says what's new once, and opens the list with the new release marked", async ({ page }) => {
  await openFresh(page);
  // (A device that had seen none of the releases: as after an update.)
  await page.evaluate(() => localStorage.setItem('lp-whats-new', '0'));
  await page.reload();
  const notice = page.getByTestId('whats-new-notice');
  await expect(notice).toContainText(/FullGrown was updated: \d+ new things?\./);
  await notice.getByRole('button', { name: 'See what’s new' }).click();
  await expect(page.getByTestId('release-1').getByTestId('whats-new-fresh')).toHaveText('New');
  await page.locator('.sheet-header .iconbtn').click();
  // Said once.
  await page.reload();
  await expect(page.locator('.project-btn .pname')).toBeVisible();
  await expect(page.getByTestId('whats-new-notice')).toHaveCount(0);
});

test("a device used before the list existed hears of the newest release", async ({ page }) => {
  await openFresh(page);
  await page.evaluate(() => localStorage.removeItem('lp-whats-new'));
  await page.reload();
  await expect(page.getByTestId('whats-new-notice')).toBeVisible();
});
