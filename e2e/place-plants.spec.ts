import { test, expect, type Page } from '@playwright/test';
import { addKind, canvasBox, drag, openFresh, shapeCount, tapFromCenter } from './helpers';

// Placing plants: pick once, tap each spot, Done.

const banner = (page: Page) => page.getByTestId('place-banner');
const bar = (page: Page) => page.getByTestId('place-bar');
async function pick(page: Page, name: string) {
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
}

test('pick a plant once, tap each spot, Undo the last, Done leaves the batch selected', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await pick(page, 'Tennessee coneflower');
  await expect(banner(page)).toHaveText('Tap to place Tennessee coneflower · 0 placed');
  await expect(bar(page).getByTestId('place-switch')).toContainText('Tennessee coneflower');
  await expect(page.locator('.bottom-toolbar .tool-btn')).toHaveCount(0);
  for (const x of [-4, -1, 2]) await tapFromCenter(page, x, 0);
  await expect(banner(page)).toHaveText('Tap to place Tennessee coneflower · 3 placed');
  expect(await shapeCount(page)).toBe(3);
  await bar(page).getByRole('button', { name: 'Undo' }).click();
  expect(await shapeCount(page)).toBe(2);
  await expect(banner(page)).toContainText('2 placed');

  // A drag pans the plan; it doesn't place one.
  const box = await canvasBox(page);
  await drag(page, { x: box.x + 60, y: box.y + 200 }, { x: box.x + 140, y: box.y + 260 });
  expect(await shapeCount(page)).toBe(2);

  await bar(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
  // One status for the whole batch.
  await page.locator('.multi-bar button[title=Edit]').click();
  await page.locator('.sheet [data-section=status]').click();
  await page.locator('.sheet .status-chip', { hasText: 'Planted' }).click();
  await expect(page.locator('.sheet [data-section=status]')).toContainText('Planted');
});

test('recent plants are one tap; the plant in hand can be switched; Place more from a plant', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('recent-plants')).toHaveCount(0);
  await pick(page, 'Tennessee coneflower');
  await tapFromCenter(page, 0, 0);
  // Switch to another plant mid-way: what's placed stays.
  await bar(page).getByTestId('place-switch').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Switch plant');
  await pick(page, 'Black-eyed Susan');
  await expect(banner(page)).toHaveText(/Tap to place Black-eyed Susan.* · 0 placed/); // (its own count: the coneflower's isn't carried over)
  await tapFromCenter(page, 4, 0);
  await expect(banner(page)).toHaveText(/Tap to place Black-eyed Susan.* · 1 placed/);
  await bar(page).getByRole('button', { name: 'Done' }).click();
  expect(await shapeCount(page)).toBe(2);

  await page.locator('.tool-btn.plants').click();
  const recent = page.getByTestId('recent-plants').locator('.recent-plant');
  await expect(recent).toHaveCount(2);
  await expect(recent.first()).toContainText('Black-eyed Susan'); // newest first
  await recent.nth(1).click();
  await expect(banner(page)).toContainText('Tennessee coneflower');
  await bar(page).getByRole('button', { name: 'Done' }).click();

  // A placed plant offers more of the same, from its pill and from its properties (instead of Duplicate).
  await tapFromCenter(page, 4, 0); // the Black-eyed Susan
  await expect(page.locator('.sel-pill .name')).toContainText('Black-eyed Susan');
  await page.locator('.sel-pill .edit').click();
  const actions = page.locator('.sheet .action-row');
  await expect(actions.getByRole('button', { name: 'Duplicate' })).toHaveCount(0);
  await actions.getByTestId('place-more').click();
  await expect(banner(page)).toContainText('Black-eyed Susan');
  await tapFromCenter(page, 4, 4);
  await bar(page).getByRole('button', { name: 'Done' }).click(); // the new one stays selected
  await page.getByTestId('pill-place-more').click();
  await expect(banner(page)).toContainText('Black-eyed Susan');
});

test('while placing, plants of the same kind show their full spread and crowding, for spacing', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await pick(page, 'Buttonbush'); // drawn at 5 ft typical spread; 6 ft full
  await tapFromCenter(page, -3, 0);
  await expect(page.locator('#canvas-svg [data-role=full-ring]')).toHaveCount(1);
  await tapFromCenter(page, -1, 0); // far too close
  await expect(page.locator('#canvas-svg [data-role=full-ring]')).toHaveCount(2);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);
  await bar(page).getByRole('button', { name: 'Done' }).click();
  // Afterwards the full spread only on request (Layers), or for a single selected plant; crowding stays ringed unless
  // turned off in Layers.
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);
  await expect(page.locator('#canvas-svg [data-role=full-ring]')).toHaveCount(0);
});

test('an existing tree: pick which, or draw an unknown one, by trunk and canopy edge', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'tree');
  await expect(page.locator('.sheet-header .title')).toHaveText('Which tree?');
  await expect(page.locator('.sheet .count-line, .sheet .hint').filter({ hasText: 'trees only' })).toHaveCount(1);
  const first = page.locator('.sheet .proj-row').first();
  const name = (await first.locator('.pname').innerText()).replace(/Mine$/, '').trim();
  await expect(page.getByTestId('unverified-note')).toBeVisible();
  await expect(page.getByTestId('partly-badge').first()).toBeAttached();
  await first.locator('[data-testid=plant-place]').click();
  await expect(page.getByTestId('draw-banner')).toContainText('Tap the trunk');
  await tapFromCenter(page, 0, 0);
  await tapFromCenter(page, 5, 0);
  await expect(page.locator('.sel-pill .name')).toHaveText(name);
  await page.locator('.sel-pill .edit').click();
  await expect(page.locator('.sheet [data-section=size]')).toContainText('10 ft spread');
  await expect(page.locator('.sheet [data-section=status]')).toContainText('Planted'); // it's already there
  await page.locator('.sheet-header button.iconbtn').last().click();

  await addKind(page, 'tree');
  await page.getByTestId('unknown-tree').click();
  await tapFromCenter(page, -8, 6);
  await tapFromCenter(page, -4, 6);
  await expect(page.locator('.sel-pill .name')).toHaveText('Tree');
});

test.describe('with a keyboard and mouse', () => {
  test.skip(({ isMobile }) => isMobile, 'laptops and desktops only');
  test('the plant follows the pointer; Enter or Esc finishes; letters do nothing while placing', async ({ page }) => {
    await openFresh(page);
    await page.keyboard.press('p');
    await pick(page, 'Tennessee coneflower');
    const box = await canvasBox(page);
    await page.mouse.move(box.x + 200, box.y + 200);
    await expect(page.locator('#canvas-svg [data-role=place-ghost]')).toHaveCount(1);
    await page.mouse.click(box.x + 200, box.y + 200);
    await page.keyboard.press('b'); // ignored while placing
    await expect(banner(page)).toContainText('1 placed');
    await page.keyboard.press('Enter');
    await expect(bar(page)).toHaveCount(0);
    await expect(page.locator('.sel-pill .name')).toHaveText('Tennessee coneflower');
  });
});
