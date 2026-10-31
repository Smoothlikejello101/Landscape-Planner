import { test, expect, type Page } from '@playwright/test';
import { openFresh, tapFromCenter } from './helpers';

// Jason, Oct 30: a way to select nothing when there's no background left to tap; from a plant's pane, select every
// one of it, and swap it (or them) for a different plant; a species named with the genus its cultivars go by.

async function pickToPlace(page: Page, name: string) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
}
const layerRows = (page: Page, name: string) => page.locator('.layer-row', { hasText: name });

test('the selection pill deselects; a plant selects all of it on view, and swaps for another, one or all', async ({ page }) => {
  await openFresh(page);
  await pickToPlace(page, 'Turkey corn');
  for (const x of [-6, 0, 6]) await tapFromCenter(page, x, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();

  // Deselect from the pill, no background needed.
  await tapFromCenter(page, 0, 0);
  await expect(page.locator('.sel-pill')).toHaveCount(1);
  await page.getByTestId('pill-deselect').click();
  await expect(page.locator('.sel-pill')).toHaveCount(0);

  // Select all of it, from its pane: its pane closes on the three selected.
  await page.waitForTimeout(450); // (not a double tap)
  await tapFromCenter(page, 0, 0);
  await page.locator('.sel-pill button.edit').click();
  await expect(page.getByTestId('select-all-same')).toHaveText('Select all 3');
  await page.getByTestId('select-all-same').click();
  await expect(page.locator('#toast')).toContainText('All 3 Turkey corn selected.');
  await expect(page.locator('.multi-bar .count')).toHaveText('3 selected');

  // Swap all three: the picker says what it's for; they keep their places.
  await page.locator('.multi-bar button', { hasText: 'Edit' }).click();
  await page.getByTestId('swap-all').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Swap for another plant');
  await expect(page.getByTestId('swap-banner')).toContainText('swap these 3 for');
  await page.getByTestId('plant-search').fill('Buttonbush');
  const row = page.locator('.sheet .proj-row', { hasText: 'Buttonbush' }).first();
  await expect(row.getByTestId('plant-place')).toHaveText('Swap');
  await row.getByTestId('plant-place').click();
  // (Bigger, and now crowding each other: the crowding notice says so in place of the toast. Jason, Oct 31.)
  await expect(page.locator('#toast, [data-testid=crowd-notice]').filter({ hasText: /3 swapped for Buttonbush\.|Buttonbush/ })).toHaveCount(1);
  await page.locator('.sheet .iconbtn[aria-label=Close]').click();
  await page.locator('button[title=Layers]').click();
  await expect(layerRows(page, 'Buttonbush')).toHaveCount(3);
  await expect(layerRows(page, 'Turkey corn')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // One, swapped back.
  await page.locator('button[title=Layers]').click();
  await layerRows(page, 'Buttonbush').first().click();
  await page.locator('.sel-pill button.edit').click();
  await page.getByTestId('swap-plant').click();
  await expect(page.getByTestId('swap-banner')).toContainText('swap it for');
  await page.getByTestId('plant-search').fill('Turkey corn');
  await page.locator('.sheet .proj-row', { hasText: 'Turkey corn' }).first().getByTestId('plant-place').click();
  await expect(page.locator('#toast')).toContainText('Swapped for Turkey corn.');
  await expect(page.locator('.sheet .title')).toContainText('Turkey corn');
});

test("a species whose cultivars go by its genus is named with it in the picker: Cape jasmine (Gardenia)", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Cape jasmine');
  await expect(page.locator('.plant-item .pname', { hasText: 'Cape jasmine (Gardenia)' }).first()).toBeVisible();
});
