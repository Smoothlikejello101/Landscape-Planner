import { test, expect, type Page } from '@playwright/test';
import { closeSheet, openFresh, shapeCount, tapFromCenter } from './helpers';

// Crowding as plants are placed (decided with Jason, 2026-10-25): amber rings where plants are close, red where
// they're crowded, on by default; a notice as one is placed too close, saying which plant, how far and why, with Leave
// it, Move it and Crowding settings…; red every time, amber once a placing session. Spring bulbs under a deciduous
// plant 3 ft or taller don't count, except right at its base (2026-10-26).

const notice = (page: Page) => page.getByTestId('crowd-notice');
const bar = (page: Page) => page.getByTestId('place-bar');
async function startPlacing(page: Page, name: string) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
}

test('placing too close: a notice says which plant and why; Move it takes it back; close warns once, crowded every time', async ({ page }) => {
  await openFresh(page);
  await startPlacing(page, 'Buttonbush'); // 4½ ft typical spread: usual spacing 4½ ft, crowded under 3⅜
  await tapFromCenter(page, -6, 0);
  await expect(notice(page)).toHaveCount(0);
  await tapFromCenter(page, -4, 0); // 2 ft away: crowded
  await expect(notice(page)).toContainText('Buttonbush is crowding Buttonbush: 2 ft apart, where about 4.5 ft is usual for these two');
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);
  // Move it: that one goes, to be tapped again.
  await notice(page).getByRole('button', { name: 'Move it' }).click();
  expect(await shapeCount(page)).toBe(1);
  await expect(page.locator('#toast')).toContainText('Tap where it should go.');
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(0);
  // 4 ft away: close (their typical spreads touch). Amber, and the words Jason asked for.
  await tapFromCenter(page, -2, 0);
  await expect(notice(page)).toContainText('Buttonbush is close to Buttonbush, and they may quickly grow into one another. A little of this can be fine, if you\'re after a quick, full look.');
  await expect(page.locator('#canvas-svg [data-role=close]')).toHaveCount(2);
  // Another close one: no notice this time (once a placing session); a crowded one: again.
  await tapFromCenter(page, 2, 0);
  await expect(notice(page)).toHaveCount(0);
  await tapFromCenter(page, 3, 0);
  await expect(notice(page)).toContainText('is crowding');
  // Done closes it; the rings stay (on by default).
  await bar(page).getByRole('button', { name: 'Done' }).click();
  await expect(notice(page)).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);
});

test('Leave it: that pair is left close, said so in its sheet, and can be flagged again', async ({ page }) => {
  await openFresh(page);
  await startPlacing(page, 'Buttonbush');
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
  await expect(page.getByTestId('crowding')).toContainText('Left close on purpose: Buttonbush');
  await page.getByTestId('flag-again').click();
  await expect(page.getByTestId('crowding')).toContainText('Planted closer than usual to one neighbor');
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);
  // An undo takes the Flag again back.
  await page.locator('button[title=Undo]').first().click();
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(0);
});

test('Crowding settings… opens Layers at its crowding switches; with warnings off, no notice', async ({ page }) => {
  await openFresh(page);
  await startPlacing(page, 'Buttonbush');
  await tapFromCenter(page, 0, 0);
  await tapFromCenter(page, 2, 0);
  await notice(page).getByRole('button', { name: 'Crowding settings…' }).click();
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
  // 1¼ ft from its center: under it, not at its base. No ring, no notice; a note says why, once.
  await tapFromCenter(page, 1.25, 0);
  await expect(notice(page)).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Grape hyacinth under Sweet Joe Pye weed: spring bulbs flower and ripen their leaves before a deciduous plant leafs out');
  await expect(page.locator('#canvas-svg [data-role=close], #canvas-svg [data-role=crowded]')).toHaveCount(0);
  // Right at its base: close.
  await tapFromCenter(page, -0.4, 0);
  await expect(notice(page)).toContainText('Grape hyacinth is close to Sweet Joe Pye weed, right at its base');
});
