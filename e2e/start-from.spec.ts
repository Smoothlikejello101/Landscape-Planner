import { test, expect, type Page } from '@playwright/test';
import { openFresh, placeOnceAtCenter } from './helpers';

// A plant of mine started from another, and the same species as a catalog plant (asked for by Jason, 2026-10-25).

async function newPlant(page: Page, name: string) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.getByTestId('add-own-plant').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Add a plant');
}
/** Its details, opened from the picker. */
async function details(page: Page, name: string) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .plant-item', { hasText: name }).first().getByTestId('plant-row').click();
  return page.getByTestId('plant-details').first();
}

test('a new plant starts from a catalog plant, keeps its typed name, and is the same species: its warnings come along', async ({ page }) => {
  await openFresh(page);
  await newPlant(page, 'Neighbor hydrangea');
  await page.getByTestId('pf-from').fill('Limelight');
  await page.getByTestId('pf-from-hit').first().click();
  await expect(page.getByTestId('pf-from-banner')).toContainText("Starting from Hydrangea 'Limelight'");
  await expect(page.getByTestId('pf-name')).toHaveValue('Neighbor hydrangea'); // (typed: kept)
  await expect(page.getByTestId('pf-botanical')).toHaveValue("Hydrangea paniculata 'Limelight'");
  await expect(page.getByTestId('pf-spread')).not.toHaveValue('');
  const same = page.getByTestId('pf-species');
  await expect(same).toBeChecked();
  await expect(page.locator('.species-field label')).toHaveText('Same species as Panicled hydrangea (Hydrangea paniculata)');
  // Its own cultivar name: still the species.
  await page.getByTestId('pf-botanical').fill("Hydrangea paniculata 'Neighbor'");
  await page.getByTestId('pf-botanical').blur();
  await expect(same).toBeChecked();
  await page.getByTestId('pf-save').click();
  await placeOnceAtCenter(page);

  const box = await details(page, 'Neighbor hydrangea');
  const poison = box.locator('dt', { hasText: 'Poisonous to people' }).locator('xpath=following-sibling::dd[1]');
  await expect(poison).toContainText('from its species');
  await expect(box.getByTestId('tox-row')).toBeVisible(); // (said for pets too, as for the catalog's)
});

test('a botanical name of another species unticks it and says why; one naming a catalog species offers it, unticked', async ({ page }) => {
  await openFresh(page);
  await newPlant(page, 'Mystery shrub');
  await page.getByTestId('pf-from').fill('Limelight');
  await page.getByTestId('pf-from-hit').first().click();
  const same = page.getByTestId('pf-species');
  await expect(same).toBeChecked();
  await page.getByTestId('pf-botanical').fill('Asclepias tuberosa');
  await page.getByTestId('pf-botanical').blur();
  await expect(same).not.toBeChecked();
  await expect(page.getByTestId('pf-species-note')).toHaveText('Unticked: Asclepias tuberosa isn’t Hydrangea paniculata. Tick it again if it is.');
  // (Now offered for the species it names.)
  await expect(page.locator('.species-field label')).toContainText('Same species as Butterfly milkweed');
  await same.check();
  await page.getByTestId('pf-save').click();
  await placeOnceAtCenter(page);
  const box = await details(page, 'Mystery shrub');
  await expect(box.locator('dt', { hasText: 'Poisonous to people' }).locator('xpath=following-sibling::dd[1]')).toContainText('from its species');
});

test('another species typed and Save tapped at once: unticked, said, and saved only at a second tap (Diego, Oct 30)', async ({ page }) => {
  await openFresh(page);
  await newPlant(page, 'Rocky Mountain penstemon');
  await page.getByTestId('pf-from').fill('Limelight');
  await page.getByTestId('pf-from-hit').first().click();
  await page.getByTestId('pf-botanical').fill('Penstemon strictus');
  await page.getByTestId('pf-save').click(); // (straight from the field)
  await expect(page.getByTestId('pf-species-note')).toContainText('Unticked: Penstemon strictus isn’t Hydrangea paniculata');
  await expect(page.getByTestId('pf-save')).toBeVisible(); // (not saved yet)
  await page.getByTestId('pf-save').click();
  await expect(page.getByTestId('place-bar')).toBeVisible();
});

test('without a species, a plant of mine says nothing for pets, as before', async ({ page }) => {
  await openFresh(page);
  await newPlant(page, 'Backyard thing');
  await expect(page.locator('.species-field')).toBeHidden();
  await page.getByTestId('pf-spread').fill('3');
  await page.getByTestId('pf-save').click();
  await placeOnceAtCenter(page);
  const box = await details(page, 'Backyard thing');
  await expect(box.getByTestId('tox-row')).toHaveCount(0);
});
