import { test, expect, type Page } from '@playwright/test';
import { openFresh } from './helpers';

// Send feedback opens a sheet: write to us (the person's own mail app, a mailto: link, with the version and kind of
// device filled in), or save a support file to attach (src/support.ts).

/** Record links clicked (a mailto:, a download) instead of leaving for a mail app the test browser doesn't have. */
async function recordLinks(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { opened: { href: string; download: string }[] };
    w.opened = [];
    HTMLAnchorElement.prototype.click = function () { w.opened.push({ href: this.href, download: this.download }); };
  });
}
const opened = (page: Page) => page.evaluate(() => (window as unknown as { opened: { href: string; download: string }[] }).opened);
async function openFeedback(page: Page) {
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Send feedback' }).click();
  await expect(page.locator('.menu')).toHaveCount(0);
  await expect(page.getByTestId('feedback-sheet')).toBeVisible();
}

test('Send feedback: Write to us opens an email to us with the version and device', async ({ page }, info) => {
  await recordLinks(page);
  await openFresh(page);
  await page.locator('button[title=More]').click();
  const version = (await page.locator('.menu-version').innerText()).match(/^Version (\S+) ·/)![1];
  await page.locator('.menu-item', { hasText: 'Send feedback' }).click();
  await expect(page.locator('.menu')).toHaveCount(0);
  await expect(page.getByTestId('feedback-sheet')).toBeVisible();
  await page.getByTestId('write-to-us').click();
  await expect(page.getByTestId('feedback-sheet')).toHaveCount(0);
  await expect(page.getByText('If nothing opens, write to hello@fullgrown.garden.')).toBeVisible();
  const links = await opened(page);
  expect(links).toHaveLength(1);
  const url = new URL(links[0].href);
  expect(url.protocol).toBe('mailto:');
  expect(url.pathname).toBe('hello@fullgrown.garden');
  expect(url.searchParams.get('subject')).toBe('FullGrown feedback');
  // Playwright's phone is a Pixel 7; its desktop Chrome says Windows.
  const device = info.project.name === 'phone' ? 'Android phone' : 'Windows PC';
  expect(url.searchParams.get('body')).toBe(`\n\n\n---\nFullGrown ${version} · ${device}`);
});

test('Send feedback: a support file says what it holds, holds the plans and the app’s errors, never the sign-in', async ({ page }) => {
  await recordLinks(page);
  // (A sign-in kept on the device, as Supabase keeps one: it must not be in the file.)
  await page.addInitScript(() => { if (!localStorage.getItem('lp-auth')) localStorage.setItem('lp-auth', JSON.stringify({ access_token: 'not-for-the-file' })); });
  await openFresh(page);
  // (An error nothing caught, as a bug would throw: kept in the app's log.)
  await page.evaluate(() => { setTimeout(() => { throw new Error('boom from the test'); }); });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lp-errors') ?? '')).toContain('boom from the test');

  await openFeedback(page);
  const summary = page.getByTestId('support-summary');
  await expect(summary).toContainText('Your 1 project');
  await expect(summary).toContainText('The app’s last errors (1)');
  await expect(page.getByTestId('support-file')).toContainText('Never in it: your sign-in or your email address.');
  await page.getByTestId('support-save').click();
  await expect(page.getByTestId('support-saved')).toContainText('Attach it to your email to hello@fullgrown.garden');

  const [file] = await opened(page);
  expect(file.download).toMatch(/^fullgrown-support-\d{4}-\d\d-\d\d\.fullgrown\.json$/);
  const text = await page.evaluate((href) => fetch(href).then((r) => r.text()), file.href);
  expect(text).not.toContain('not-for-the-file');
  expect(text).not.toContain('lp-auth');
  const json = JSON.parse(text);
  expect(json.format).toBe('landscape-planner-backup');
  expect(json.projects).toHaveLength(1);
  expect(json.support.app.version).toBeTruthy();
  expect(json.support.device.kind).toBeTruthy();
  expect(json.support.errors.map((e: { message: string }) => e.message).join()).toContain('boom from the test');

  // Then the email, saying which file to attach.
  await page.getByTestId('write-with-file').click();
  const mail = new URL((await opened(page))[1].href);
  expect(mail.protocol).toBe('mailto:');
  expect(mail.searchParams.get('body')).toContain(`Support file attached: ${file.download}`);
});
