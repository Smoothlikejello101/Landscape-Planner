import { test, expect, type Page } from '@playwright/test';
import { closeSheet, openFresh, openSections, shapeCount, tapFromCenter } from './helpers';

// Crowding as plants are placed (decided with Jason, 2026-10-25): amber rings where plants are close, red where
// they're crowded, on by default; a notice as one is placed too close, with Leave it, Move it and Settings; red every
// time, amber once a placing session. One line that opens to say how far and why (2026-10-27); a small plant crowded
// by a bigger one is "too far under" it. Spring bulbs under a deciduous plant 3 ft or taller don't count, except right
// at its base (2026-10-26), and get no notice.

const notice = (page: Page) => page.getByTestId('crowd-notice');
const bar = (page: Page) => page.getByTestId('place-bar');
async function startPlacing(page: Page, name: string) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
}

test('placing too close: a notice says which plant and why; Move it takes it back; close warns once, crowded every time', async ({ page }) => {
  await openFresh(page);
  await startPlacing(page, 'Snowberry'); // 4½ ft typical spread: usual spacing 4½ ft, crowded under 3⅜ (buttonbush's spread is 6–10 ft since Oct 29)
  await tapFromCenter(page, -6, 0);
  await expect(notice(page)).toHaveCount(0);
  await tapFromCenter(page, -4, 0); // 2 ft away: crowded
  // One red line; tapped, it says how far apart and why.
  await expect(notice(page).getByTestId('notice-line')).toHaveText('Crowding Snowberry');
  await expect(notice(page)).toHaveClass(/tone-red/);
  await expect(notice(page).getByTestId('notice-detail')).toBeHidden();
  await notice(page).getByTestId('notice-line').click();
  await expect(notice(page).getByTestId('notice-detail')).toHaveText('Snowberry and Snowberry will grow into each other: 2 ft apart, where about 4.5 ft is usual for these two.');
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);
  // Move it: that one goes, to be tapped again.
  await notice(page).getByRole('button', { name: 'Move it' }).click();
  expect(await shapeCount(page)).toBe(1);
  await expect(page.locator('#toast')).toContainText('Tap where it should go.');
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(0);
  // 4 ft away: close (their typical spreads touch). Amber, and the words Jason asked for.
  await tapFromCenter(page, -2, 0);
  await expect(notice(page).getByTestId('notice-line')).toHaveText('Close to Snowberry');
  await expect(notice(page)).toHaveClass(/tone-amber/);
  await expect(notice(page).getByTestId('notice-detail')).toHaveText('Snowberry and Snowberry may quickly grow into one another: 4 ft apart, where about 4.5 ft is usual for these two. A little of this can be fine, if you\'re after a quick, full look.');
  await expect(page.locator('#canvas-svg [data-role=close]')).toHaveCount(2);
  // Another close one: no notice this time (once a placing session); a crowded one: again.
  await tapFromCenter(page, 2, 0);
  await expect(notice(page)).toHaveCount(0);
  await tapFromCenter(page, 3, 0);
  await expect(notice(page).getByTestId('notice-line')).toContainText('Crowding Snowberry');
  // Done closes it; the rings stay (on by default).
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await expect(notice(page)).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);
});

test('Leave it: that pair is left close, said so in its sheet, and can be flagged again', async ({ page }) => {
  await openFresh(page);
  await startPlacing(page, 'Snowberry');
  await tapFromCenter(page, 0, 0);
  await tapFromCenter(page, 2, 0);
  await notice(page).getByRole('button', { name: 'Leave it' }).click();
  await expect(notice(page)).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(0);
  await bar(page).getByRole('button', { name: 'Done' }).click();
  // The one placed second: its sheet says it's left close, with Flag again.
  await tapFromCenter(page, 0, 8); // (nothing there: the two placed are let go)
  await tapFromCenter(page, 2.5, 0);
  await page.locator('.sel-pill button.edit').click();
  // (One quiet line, folded, that opens to who.)
  await expect(page.getByTestId('left-close-line')).toHaveText('Left close to one neighbor on purpose');
  await expect(page.getByTestId('flag-again')).toBeHidden();
  await page.getByTestId('left-close-line').click();
  await expect(page.getByTestId('crowding')).toContainText('Left close on purpose: Snowberry');
  await page.getByTestId('flag-again').click();
  await expect(page.getByTestId('crowding')).toContainText('Planted closer than usual to one neighbor');
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);
  // An undo takes the Flag again back.
  await page.locator('button[title=Undo]').first().click();
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(0);
});

test('a small plant crowded by a bigger one is too far under it: try out toward its edge', async ({ page }) => {
  await openFresh(page);
  await startPlacing(page, 'Sweet Joe Pye weed'); // 6 ft tall
  await tapFromCenter(page, 0, 0);
  await bar(page).getByTestId('place-switch').click();
  await page.getByTestId('plant-search').fill("Heuchera 'Autumn Bride'");
  await page.locator('.sheet .proj-row', { hasText: 'Autumn Bride' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0.5, 0);
  await expect(notice(page).getByTestId('notice-line')).toHaveText('Too far under Sweet Joe Pye weed');
  await notice(page).getByTestId('notice-line').click();
  await expect(notice(page).getByTestId('notice-detail')).toContainText("Heuchera 'Autumn Bride' will be buried by Sweet Joe Pye weed: 0.5 ft apart");
  await expect(notice(page).getByTestId('notice-detail')).toContainText('Try moving it out toward the edge of Sweet Joe Pye weed.');
  // In its properties: one line, opened to say so.
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await tapFromCenter(page, 0, 8); // (nothing there: the two placed are let go)
  await tapFromCenter(page, 0.6, 0);
  await expect(page.locator('.sel-pill .name')).toHaveText("Heuchera 'Autumn Bride'");
  await page.locator('.sel-pill button.edit').click();
  await openSections(page);
  await expect(page.getByTestId('crowding-line')).toHaveText('⚠ Planted closer than usual to one neighbor');
  await expect(page.getByTestId('crowding-detail')).toBeHidden();
  await page.getByTestId('crowding-line').click();
  await expect(page.getByTestId('crowding-detail')).toContainText('Sweet Joe Pye weed: 0.5 ft apart');
  await expect(page.getByTestId('crowding-detail')).toContainText('buried by it: try out toward its edge');
});

test('flagged pairs can be left close after the fact: one plant from its properties, or all at once from Layers', async ({ page }) => {
  await openFresh(page);
  await startPlacing(page, 'Snowberry');
  for (const x of [-6, -4, 2, 4]) await tapFromCenter(page, x, 0); // (two crowded pairs)
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(4);
  // One plant: its crowding line opens to Leave this close.
  await tapFromCenter(page, 0, 8);
  await tapFromCenter(page, -6, 0);
  await page.locator('.sel-pill button.edit').click();
  await page.getByTestId('crowding-line').click();
  await page.getByTestId('leave-close').click();
  await expect(page.getByTestId('crowding')).toContainText('Left close on purpose: Snowberry');
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);
  // The rest at once, from Layers; warnings stay on; Undo brings them back.
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('leave-all-close').click();
  await expect(page.locator('#toast-action')).toContainText('Left 1 pair close on purpose');
  await expect(page.getByTestId('leave-all-close')).toHaveCount(0);
  await expect(page.getByTestId('crowd-warnings')).toBeChecked();
  await expect(page.getByTestId('crowding-settings')).toContainText('2 pairs left close on purpose');
  await page.locator('#toast-action').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('leave-all-close')).toHaveText('Leave all flagged now (1 pair)');
});

test('Crowding settings… opens Layers at its crowding switches; with warnings off, no notice', async ({ page }) => {
  await openFresh(page);
  await startPlacing(page, 'Snowberry');
  await tapFromCenter(page, 0, 0);
  await tapFromCenter(page, 2, 0);
  await notice(page).getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByTestId('crowding-settings')).toBeVisible();
  await expect(page.getByTestId('crowding-settings')).toContainText('(0 close, 2 crowded now)');
  await page.getByTestId('crowd-warnings').uncheck();
  await closeSheet(page);
  await tapFromCenter(page, 4, 0);
  expect(await shapeCount(page)).toBe(3);
  await expect(notice(page)).toHaveCount(0);
  // Kept on this device.
  await page.reload();
  await page.locator('button[title=Layers]').click();
  await expect(page.getByTestId('crowd-warnings')).not.toBeChecked();
  await expect(page.getByTestId('show-crowding')).toBeChecked();
});

test('a spring bulb under a deciduous plant 3 ft or taller is not crowding it, except right at its base', async ({ page }) => {
  await openFresh(page);
  await startPlacing(page, 'Sweet Joe Pye weed'); // 6 ft, deciduous by NC State's description; 3 ft spread
  await tapFromCenter(page, 0, 0);
  await bar(page).getByTestId('place-switch').click();
  await page.getByTestId('plant-search').fill('Grape hyacinth');
  await page.locator('.sheet .proj-row', { hasText: 'Grape hyacinth' }).first().locator('[data-testid=plant-place]').click();
  // 1¼ ft from its center: under it, not at its base. No ring, no notice (2026-10-27: nothing to say there).
  await tapFromCenter(page, 1.25, 0);
  await expect(notice(page)).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=close], #canvas-svg [data-role=crowded]')).toHaveCount(0);
  // Right at its base: close.
  await tapFromCenter(page, -0.4, 0);
  await expect(notice(page).getByTestId('notice-line')).toHaveText('Close to Sweet Joe Pye weed, at its base');
});

test('a notice can be put away without its buttons: ✕, or a swipe sideways; a short swipe slides it back', async ({ page }) => {
  await openFresh(page);
  await startPlacing(page, 'Snowberry');
  await tapFromCenter(page, 0, 0);
  await tapFromCenter(page, 2, 0);
  await expect(notice(page)).toBeVisible();
  await notice(page).getByTestId('notice-close').click();
  await expect(notice(page)).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2); // (put away, not left close)
  // Again, swiped: a little, and it comes back; far enough, and it goes.
  await tapFromCenter(page, -2, 0);
  const b = (await notice(page).boundingBox())!;
  const y = b.y + b.height / 2, x = b.x + 30;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 30, y, { steps: 5 }); await page.mouse.up();
  await expect(notice(page)).toBeVisible();
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 160, y, { steps: 8 }); await page.mouse.up();
  await expect(notice(page)).toHaveCount(0);
});
