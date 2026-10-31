import { test, expect, type Page } from '@playwright/test';
import { answerAsk, openFresh, openSections, tapFromCenter, openSettings } from './helpers';

// Round 3 of persona testing (Oct 31): the smaller fixes, each as a tester met it.

async function placeOne(page: Page, name: string) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
}
/** A tap on the dark part of a sheet's overlay, beside the sheet. */
async function tapBeside(page: Page) {
  const box = (await page.locator('.overlay .sheet').boundingBox())!;
  const vw = page.viewportSize()!;
  // (Above a phone's bottom sheet; left of a laptop's side sheet.)
  if (box.y > 40) await page.mouse.click(vw.width / 2, box.y / 2);
  else await page.mouse.click(Math.max(5, box.x / 2), vw.height / 2);
}

test('the Add-a-plant form asks before a tap beside it throws typing away; a bloom color asks for its month (Diego, Owen)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Rabbitbrush');
  await page.getByTestId('add-own-plant').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Add a plant');
  await page.getByTestId('pf-spread').fill('4-6');
  await tapBeside(page);
  expect(await answerAsk(page, false)).toBe('Leave without saving this plant?');
  await expect(page.getByTestId('pf-spread')).toHaveValue('4-6'); // (Keep editing)

  // A bloom color with no month: said as it's typed, and Save asks for the month rather than dropping it.
  await page.locator('.sheet details summary', { hasText: 'Bloom and notes' }).click();
  await page.locator('.sheet input[placeholder="e.g. white aging to pink"]').fill('golden yellow');
  await expect(page.getByTestId('pf-bloom-hint')).toContainText('Give its bloom months too');
  await page.getByTestId('pf-save').click();
  await expect(page.getByTestId('pf-bloom-hint')).toContainText('Give the month it starts blooming');
  await expect(page.locator('.sheet-header .title')).toHaveText('Add a plant');

  await tapBeside(page);
  await answerAsk(page, true);
  await expect(page.locator('.sheet-header .title', { hasText: 'Add a plant' })).toHaveCount(0);
});

test('an empty plan\'s "In this plan" says so, without "loosen a filter" (Sam)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('');
  await page.getByTestId('in-plan').click();
  await expect(page.locator('.sheet')).toContainText('No plants placed in this plan yet');
  await expect(page.locator('.sheet')).not.toContainText('loosen a filter');
});

test('the zoom buttons switch is in Settings, from the ⋮ menu (Ruth, Bea)', async ({ page }) => {
  await openFresh(page);
  await openSettings(page);
  const check = page.getByTestId('zoom-buttons');
  const on = await check.isChecked();
  await check.click();
  await expect(page.locator('.zoombtn[aria-label="Zoom in"]')).toHaveCount(on ? 0 : 1);
});

test.describe('with a keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'laptops and desktops only');

  test('Esc leaves a number field, then closes the sheet; the arrow keys never move the plan behind a sheet (Alex, Kim)', async ({ page }) => {
    await openFresh(page);
    await placeOne(page, 'Turkey corn');
    await page.waitForTimeout(450);
    await tapFromCenter(page, 0, 0);
    const plant = page.locator('#canvas-svg [data-shape-id]').first();
    const before = (await plant.boundingBox())!;
    await page.locator('.sel-pill button.edit').click();
    // The focus on the pill's Edit, outside the sheet: the arrows do nothing to the plant.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect((await plant.boundingBox())!.y).toBeCloseTo(before.y, 0);

    await openSections(page);
    const num = page.locator('.sheet input[type=number]').first();
    await num.focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.overlay .sheet')).toBeVisible();
    await expect(num).not.toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.overlay .sheet')).toHaveCount(0);
  });

  test('the suggested name in a question is selected again at the first click, to type over (Alex: "UntitledImport test")', async ({ page }) => {
    await openFresh(page);
    await page.locator('.project-btn').click();
    await page.getByRole('button', { name: /New project/ }).first().click();
    const input = page.getByTestId('ask-input');
    await input.click();
    await page.keyboard.type('Import test');
    await expect(input).toHaveValue('Import test');
  });
});
