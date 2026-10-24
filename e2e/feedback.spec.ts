import { test, expect } from '@playwright/test';
import { openFresh } from './helpers';

// Send feedback opens the person's own mail app (a mailto: link), with the version and kind of device filled in.
test('Send feedback opens an email to us with the version and device, and closes the menu', async ({ page }, info) => {
  await page.addInitScript(() => {
    // Record the link instead of leaving for a mail app the test browser doesn't have.
    const w = window as unknown as { opened: string[] };
    w.opened = [];
    HTMLAnchorElement.prototype.click = function () { w.opened.push(this.href); };
  });
  await openFresh(page);
  await page.locator('button[title=More]').click();
  const version = (await page.locator('.menu-version').innerText()).match(/^Version (\S+) ·/)![1];
  await page.locator('.menu-item', { hasText: 'Send feedback' }).click();
  await expect(page.locator('.menu')).toHaveCount(0);
  await expect(page.getByText('If nothing opens, write to hello@fullgrown.garden.')).toBeVisible();
  const opened = await page.evaluate(() => (window as unknown as { opened: string[] }).opened);
  expect(opened).toHaveLength(1);
  const url = new URL(opened[0]);
  expect(url.protocol).toBe('mailto:');
  expect(url.pathname).toBe('hello@fullgrown.garden');
  expect(url.searchParams.get('subject')).toBe('FullGrown feedback');
  // Playwright's phone is a Pixel 7; its desktop Chrome says Windows.
  const device = info.project.name === 'phone' ? 'Android phone' : 'Windows PC';
  expect(url.searchParams.get('body')).toBe(`\n\n\n---\nFullGrown ${version} · ${device}`);
});
