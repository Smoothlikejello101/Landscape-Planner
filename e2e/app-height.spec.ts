import { test, expect, type Page } from '@playwright/test';
import { openFresh } from './helpers';

// The app's height is the window's own (src/app-height.ts). Jason, on Next, Oct 31: after the update reload, the bar at
// the bottom was cut off (a white strip of it showing) until he left the app and came back. Here a wrong height is
// put in by hand, as the browser got it wrong there, and the app must put itself right when it's shown again.

const barBottom = (page: Page) => page.locator('.bottom-toolbar').first().evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
const windowHeight = (page: Page) => page.evaluate(() => window.innerHeight);
// (After the app's own checks just after start, which would put it right on their own: src/app-height.ts.)
const settled = (page: Page) => page.waitForTimeout(4500);
const breakHeight = (page: Page) => page.evaluate(() => {
  document.documentElement.style.setProperty('--app-h', `${window.innerHeight + 90}px`);
});

test('the bar at the bottom sits at the bottom of the window, and comes back when the page is shown again', async ({ page }) => {
  await openFresh(page);
  await settled(page);
  const h = await windowHeight(page);
  expect(Math.abs((await barBottom(page)) - h)).toBeLessThanOrEqual(1);

  // Laid out too tall: the bar goes under the window's edge.
  await breakHeight(page);
  expect(await barBottom(page)).toBeGreaterThan(h + 40);
  // Coming back from the background (home screen and back) re-measures.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => barBottom(page)).toBeLessThanOrEqual(h + 1);

  // So does the page being shown again (a reload restored from the cache), and a window brought to the front.
  await breakHeight(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect.poll(() => barBottom(page)).toBeLessThanOrEqual(h + 1);
  await breakHeight(page);
  await page.evaluate(() => window.dispatchEvent(new FocusEvent('focus')));
  await expect.poll(() => barBottom(page)).toBeLessThanOrEqual(h + 1);
});

test('a new window size is the app\'s size, and a page scrolled by something is put back', async ({ page }) => {
  await openFresh(page);
  await settled(page);
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: size.height - 120 });
  await expect.poll(() => barBottom(page)).toBe(size.height - 120);

  // The page itself never scrolls: if something scrolls it anyway (an element brought into view scrolls every box
  // above it), it's put back at once, and the app fits the window again. (Its own box can't scroll, styles.css: the
  // page made scrollable here, as a browser without overflow: clip leaves it.)
  await breakHeight(page);
  await page.evaluate(() => { document.body.style.overflow = 'visible'; document.scrollingElement!.scrollTo(0, 60); });
  await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  await expect.poll(() => barBottom(page)).toBe(size.height - 120);
  // (Said once in the device's error log, for a support file.)
  expect(await page.evaluate(() => localStorage.getItem('lp-errors') ?? '')).toContain('The page had scrolled');
});

test('a citation deep in a plant\'s details, brought into view, scrolls the picker, never the page', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Chinquapin oak');
  const oak = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Chinquapin oak$/ }) });
  await oak.getByTestId('plant-row').click();
  await expect(oak.locator('.details-src').first()).toBeVisible();
  // (The last citation, the furthest down, and a long one's hidden full text, on a phone where it's cut to a line: as
  // a screen reader or the browser's find would bring them in.)
  await oak.locator('.details-src').last().evaluate((el) => el.scrollIntoView());
  for (const full of await oak.locator('.cite-full').all()) await full.evaluate((el) => el.scrollIntoView());
  const scrolled = () => page.evaluate(() => [document.scrollingElement!, document.body, document.getElementById('root')!].map((b) => b.scrollTop));
  expect(await scrolled()).toEqual([0, 0, 0]);
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight)).toBe(await windowHeight(page));
  expect(Math.abs((await barBottom(page)) - (await windowHeight(page)))).toBeLessThanOrEqual(1);
});
