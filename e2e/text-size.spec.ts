import { test, expect, type Page } from '@playwright/test';
import { addPlainShape, closeSheet, openFresh, openSettings, shapeCount } from './helpers';

// Text size (decided with Jason, 2026-10-25; four sizes 2026-10-27): Medium (115%, main text 16 px) by default; Small,
// Large and Extra large in Settings (the ⋮ menu's foot until Oct 31), kept on this device. Above Small the top bar keeps room for the plan's name.
const fontPx = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));

test('Medium by default: the top bar keeps room for the name, Redo in the menu, the zoom shown as it changes', async ({ page }) => {
  await openFresh(page);
  await expect(page.locator('html')).toHaveAttribute('data-text', 'medium');
  expect(await fontPx(page, '.project-btn .pname')).toBeCloseTo(14 * 1.15, 1);
  // Only whether it's saved: no shape count or zoom, no Redo.
  await expect(page.locator('.project-btn .pinfo')).toHaveText('Saved');
  await expect(page.locator('button[title=Redo]')).toHaveCount(0);
  // Redo is in the menu, and works.
  await addPlainShape(page, 'circle');
  await closeSheet(page);
  await page.locator('button[title=Undo]').click();
  expect(await shapeCount(page)).toBe(0);
  await page.locator('button[title=More]').click();
  await page.getByTestId('menu-redo').click();
  expect(await shapeCount(page)).toBe(1);
  await page.locator('button[title=More]').click();
  await expect(page.getByTestId('menu-redo')).toBeDisabled(); // (nothing more to redo)
  await page.keyboard.press('Escape');
  await page.mouse.click(10, 300);
  // The zoom, for a moment, as it changes.
  await page.locator('.zoombtn[title="Zoom in"]').click();
  await expect(page.getByTestId('zoom-flash')).toHaveText('125%');
  await expect(page.getByTestId('zoom-flash')).toHaveClass(/on/);
  await expect(page.getByTestId('zoom-flash')).not.toHaveClass(/on/, { timeout: 4000 });
});

test('Settings sets Small, Large or Extra large, at once and on this device from then on', async ({ page }) => {
  await openFresh(page);
  await openSettings(page);
  await expect(page.getByTestId('text-size-medium')).toHaveAttribute('aria-pressed', 'true');
  // Small: the size the app was drawn at; the top bar as it was, with its count, zoom and Redo.
  await page.getByTestId('text-size-small').click();
  await expect(page.locator('html')).toHaveAttribute('data-text', 'small');
  await expect(page.getByTestId('text-size-small')).toHaveAttribute('aria-pressed', 'true'); // (the sheet stays open to try another)
  expect(await fontPx(page, '.text-size-row > span')).toBeCloseTo(14, 1);
  await closeSheet(page);
  await page.mouse.click(10, 300);
  await expect(page.locator('.project-btn .pinfo')).toHaveText('0 shapes · 100% · Saved');
  await expect(page.locator('button[title=Redo]')).toBeVisible();
  // Kept after a reload.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text', 'small');
  // Large: 130%; Extra large: 145%, buttons at least 48 px.
  await openSettings(page);
  await page.getByTestId('text-size-large').click();
  await expect(page.locator('html')).toHaveAttribute('data-text', 'large');
  expect(await fontPx(page, '.text-size-row > span')).toBeCloseTo(14 * 1.3, 1);
  await page.getByTestId('text-size-xlarge').click();
  await expect(page.locator('html')).toHaveAttribute('data-text', 'xlarge');
  expect(await fontPx(page, '.text-size-row > span')).toBeCloseTo(14 * 1.45, 1);
  const more = (await page.locator('button[title=More]').boundingBox())!;
  expect(Math.min(more.width, more.height)).toBeGreaterThanOrEqual(48);
});

test('the plan\'s name reads as a button, its name with room at 360 px, Small to Extra large; ⋮ opens the same pane (Jason, the UI review, 2026-11-01)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openFresh(page);
  const btn = page.locator('.project-btn');
  for (const size of ['small', 'medium', 'large', 'xlarge']) {
    await page.evaluate((s) => localStorage.setItem('lp-text-size-2', s), size);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-text', size);
    // Outlined and tinted, as the app's other buttons; the ▾ beside the name.
    const look = await btn.evaluate((e) => { const c = getComputedStyle(e); return { border: c.borderTopWidth, bg: c.backgroundColor }; });
    expect(look.border).toBe('1px');
    expect(look.bg).not.toBe('rgba(0, 0, 0, 0)');
    await expect(btn.locator('.pname-row .pchev svg')).toBeVisible();
    // The name has room (it had a letter or two at Extra large, none at Small); whether it's saved, under it.
    const name = (await btn.locator('.pname').boundingBox())!;
    expect(name.width).toBeGreaterThan(70);
    if (size === 'small' || size === 'medium') expect(await btn.locator('.pname').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    expect((await btn.locator('.pinfo').boundingBox())!.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
    // Clear of Undo.
    expect((await btn.boundingBox())!.x + (await btn.boundingBox())!.width).toBeLessThanOrEqual((await page.locator('button[title=Undo]').boundingBox())!.x);
  }
  // ⋮ → Plans and backup…: the same pane.
  await page.locator('button[title=More]').click();
  await page.getByTestId('menu-plans').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Projects (1)');
  await expect(page.locator('.sheet').getByRole('button', { name: /Back up/ }).first()).toBeVisible();
});

test('a size chosen before there were four carries over: Large stays as big as it was, now Extra large', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('set')) { localStorage.setItem('lp-text-size', 'large'); sessionStorage.setItem('set', '1'); } });
  await openFresh(page);
  await expect(page.locator('html')).toHaveAttribute('data-text', 'xlarge');
  expect(await fontPx(page, '.project-btn .pname')).toBeCloseTo(14 * 1.45, 1);
});

test('a plant\'s details: one column, each fact on its label\'s line, its source on a line of its own', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('butterfly milkweed');
  const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Butterfly milkweed$/ }) }).first();
  await item.getByTestId('plant-row').click();
  const details = item.getByTestId('plant-details');
  const dt = details.locator('dt', { hasText: /^Size$/ });
  const dd = dt.locator('xpath=following-sibling::dd[1]');
  const label = (await dt.boundingBox())!;
  const value = (await dd.locator('xpath=text()/..').boundingBox())!;
  const source = (await dd.locator('.details-src').boundingBox())!;
  expect(Math.abs(value.y - label.y)).toBeLessThan(4); // (the value starts on the label's line)
  expect(source.y).toBeGreaterThanOrEqual(label.y + label.height - 1); // (the source below it)
  expect(await dd.locator('.details-src').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeLessThan(await dt.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)));
});
