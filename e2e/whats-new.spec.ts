import { test, expect, type Page } from '@playwright/test';
import { answerAsk, openFresh } from './helpers';

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

test('⋮\'s version line checks for updates: here, with no service worker, it says there\'s nothing to check (Jason, the UI review, 2026-11-01)', async ({ page }) => {
  await openFresh(page);
  await page.locator('button[title=More]').click();
  const line = page.getByTestId('update-check');
  await expect(page.locator('.menu-version')).toContainText(/^Version \S+ ·/); // (the version first, as before)
  await page.getByTestId('check-updates').click();
  await expect(line).toHaveText('Nothing to check here: the app opens at its newest version.');
  await expect(page.getByTestId('check-updates')).toBeVisible({ timeout: 8000 }); // (said for a moment)
});

test('⋮\'s Check for updates: up to date for a moment; a new version found waits for Update now, which saves and switches (Jason, the UI review, 2026-11-01)', async ({ page }) => {
  test.setTimeout(60_000); // (Update now reloads the app within 10 s when no real worker takes over)
  // (The tests run with service workers blocked: one stood in for, whose check finds a new version once told to.)
  await page.addInitScript(() => {
    const w = window as unknown as { __newVersion?: boolean; __checks?: number };
    const reg = { waiting: null as object | null, installing: null, update: async () => { w.__checks = (w.__checks ?? 0) + 1; if (w.__newVersion) reg.waiting = {}; } };
    const container = navigator.serviceWorker;
    if (container) Object.defineProperty(container, 'getRegistration', { value: async () => reg });
    else Object.defineProperty(Navigator.prototype, 'serviceWorker', { get: () => ({ getRegistration: async () => reg }) });
  });
  await openFresh(page);
  await page.evaluate(() => { (window as unknown as { __page: number }).__page = 1; }); // (gone if the page reloads)
  const marker = () => page.evaluate(() => (window as unknown as { __page?: number }).__page);
  await page.locator('button[title=More]').click();
  const line = page.getByTestId('update-check');
  await page.getByTestId('check-updates').click();
  await expect(line).toHaveText('You’re up to date.');
  await expect(page.getByTestId('check-updates')).toBeVisible({ timeout: 8000 });
  // A new version found: said, and nothing more till Update now.
  await page.evaluate(() => { (window as unknown as { __newVersion: boolean }).__newVersion = true; });
  await page.getByTestId('check-updates').click();
  await expect(line).toContainText('A new version is ready.');
  await page.waitForTimeout(5000);
  expect(await marker()).toBe(1);
  await expect(line).toContainText('A new version is ready.'); // (still there, unlike "up to date")
  // Closed and opened again: still offered.
  await page.keyboard.press('Escape');
  await page.locator('button[title=More]').click();
  await expect(page.getByTestId('update-now')).toBeVisible();
  // Update now: a plan's last change saved first, then the app reloads (as the banner's Update does).
  await page.keyboard.press('Escape');
  await page.locator('.project-btn').click();
  await page.getByRole('button', { name: /New project/ }).click();
  await answerAsk(page, true, 'Saved first');
  await page.locator('button[title=More]').click();
  await Promise.all([page.waitForEvent('load', { timeout: 20_000 }), page.getByTestId('update-now').click()]);
  await expect(page.locator('.project-btn .pname')).toHaveText('Saved first');
});
