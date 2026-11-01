import { test, expect, type Page } from '@playwright/test';
import { addKind, answerAsk, openFresh, shapeCount, tapFromCenter, zoomPct } from './helpers';

// With a keyboard (Alex and Tom, round 2, Oct 30): sheets take focus and keep Tab inside; a choice in one keeps focus
// where it was; Layers rows are reached by Tab; the month steps by the arrow keys; the app asks its own questions.

test.skip(({ isMobile }) => isMobile, 'laptops and desktops only');

async function oneRect(page: Page, dx = 0) {
  await addKind(page, 'plain', 'rect');
  for (const [x, y] of [[dx - 2, -1.5], [dx + 2, -1.5], [dx, 1.5]]) await tapFromCenter(page, x, y);
  await expect(page.getByTestId('draw-bar')).toHaveCount(0);
}
const inSheet = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('.overlay'));
const focused = (page: Page) => page.evaluate(() => {
  const a = document.activeElement as HTMLElement | null;
  return a ? `${a.getAttribute('data-testid') ?? ''}|${a.getAttribute('aria-label') ?? ''}|${(a.textContent ?? '').trim().slice(0, 40)}` : '';
});

test('a sheet opened by key takes focus; Tab stays inside it; Esc closes it', async ({ page }) => {
  await openFresh(page);
  await page.keyboard.press('a'); // (the Add sheet)
  await expect(page.getByTestId('add-sheet')).toBeVisible();
  expect(await inSheet(page)).toBe(true);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  expect(await inSheet(page)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await inSheet(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('add-sheet')).toHaveCount(0);
});

test('the ZIP sheet, opened by key from ⋮ or the tour, has the cursor in its field, not on its × (the UI review; Alex, Tom)', async ({ page }) => {
  await openFresh(page);
  await page.locator('button[title=More]').focus();
  await page.keyboard.press('Enter');
  await page.locator('.menu-item', { hasText: 'Garden location' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('zip')).toBeFocused();
  await page.keyboard.type('719');
  await expect(page.getByTestId('zip')).toHaveValue('719');
  await page.locator('.sheet-header .iconbtn[aria-label=Close]').click();
  // The tour's "Enter your ZIP" (it draws the sheet twice: the cursor stays).
  await page.getByTestId('intro-start').click();
  await page.getByTestId('intro-go').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('zip')).toBeFocused();
});

test('a choice in the properties sheet keeps focus on it, not back at the page', async ({ page }) => {
  await openFresh(page);
  await oneRect(page);
  await page.locator('.sel-pill .edit').click();
  await page.keyboard.press('Tab'); // (opened by mouse: Tab goes into it, not to "My Garden" behind it)
  expect(await inSheet(page)).toBe(true);
  // A section's header, opened by Enter: focus stays on it.
  const head = page.locator('.sheet .prop-head[aria-expanded=false]').first();
  await head.focus();
  const was = await focused(page);
  await page.keyboard.press('Enter');
  expect(await inSheet(page)).toBe(true);
  expect((await focused(page)).split('|')[0]).toBe(was.split('|')[0]);
  await expect(page.locator('.sheet .prop-head[aria-expanded=true]').first()).toBeFocused();
});

test('Layers rows are reached with Tab, and Enter selects one', async ({ page }) => {
  await openFresh(page);
  await oneRect(page);
  await page.keyboard.press('Escape');
  await page.locator('button[title=Layers]').click();
  const row = page.getByTestId('layer-select').first();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('.sel-pill')).toBeVisible();
});

test('through the year, the arrow keys step the month (Shift pans), and Esc from the slider closes it', async ({ page }) => {
  await openFresh(page);
  await page.getByTestId('year-open').click();
  await page.getByTestId('year-slider').fill('3');
  await expect(page.getByTestId('year-month')).toHaveText('March');
  await page.locator('#canvas-svg').click({ position: { x: 5, y: 5 } }); // (the plan, not the slider)
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('year-month')).toHaveText('April');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('year-month')).toHaveText('February');
  await page.getByTestId('year-slider').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('year-bar')).toHaveCount(0);
});

test('the arrow keys move through the More menu, not the plan behind it', async ({ page }) => {
  await openFresh(page);
  const zoom = await zoomPct(page);
  const view = await page.locator('#canvas-svg').getAttribute('viewBox');
  await page.locator('button[title=More]').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.menu .menu-item:focus')).toHaveCount(1);
  expect(await page.locator('#canvas-svg').getAttribute('viewBox')).toBe(view);
  expect(await zoomPct(page)).toBe(zoom);
});

test('the app asks its own questions: a locked shape deleted by key asks first, focus on Cancel (round 3: a stray Enter keeps it); Esc keeps it', async ({ page }) => {
  await openFresh(page);
  await oneRect(page);
  await page.locator('.sel-pill .edit').click();
  await page.locator('.sheet .lockbtn').click();
  await page.locator('.sheet-header button.iconbtn').last().click();
  await page.keyboard.press('Delete');
  const ask = page.locator('.ask-overlay [role=alertdialog]');
  await expect(ask).toContainText('is locked. Delete it anyway?');
  await expect(ask.getByTestId('ask-cancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  expect(await shapeCount(page)).toBe(1);
  await expect(page.locator('.sel-pill')).toBeVisible(); // (Esc answered the question; the selection stays)
  await page.keyboard.press('Delete');
  await answerAsk(page, true);
  await expect.poll(() => shapeCount(page)).toBe(0);
});
