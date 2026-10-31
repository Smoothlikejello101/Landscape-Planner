import { test, expect } from '@playwright/test';
import { openFresh, tapFromCenter } from './helpers';

// A plant's facts from its edit pane (Jason, Oct 29: "Right now if I want to check bloom time, I have to go find
// the plant in the picker"): its Plant section, folded like every section, holds the picker's details (one section with
// linking it since Oct 30).

test("a placed plant's edit pane shows its facts, as the picker does", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Buttonbush');
  await page.locator('.sheet .proj-row', { hasText: 'Buttonbush' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await tapFromCenter(page, 0, 0);
  await page.locator('.sel-pill button.edit').click();
  const about = page.getByTestId('about-plant');
  await expect(about).toBeHidden(); // (folded until opened)
  await page.locator('[data-section=plant]').click();
  await expect(about).toBeVisible();
  await expect(about).toContainText('Bloom');
  await expect(about).toContainText('Size');
  // Its groups open as in the picker.
  await about.getByTestId('group-wildlife').click();
  await expect(about).toContainText('Native');
});
