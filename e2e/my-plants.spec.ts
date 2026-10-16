import { test, expect, type Page } from '@playwright/test';
import { autoDialogs, closeSheet, field, openFresh, addPlainShape } from './helpers';

const circleR = async (page: Page, label: string) =>
  Number(await page.locator('[data-shape-group]', { has: page.locator('text', { hasText: label }) }).locator('circle[data-shape-id]').getAttribute('r'));

test('add a plant from its tag, place it, and switch to full size', async ({ page }) => {
  const dialogs = autoDialogs(page);
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Limelight');
  const add = page.getByTestId('add-own-plant');
  await expect(add).toHaveText('+ Add “Limelight” as my plant');
  await add.click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Add a plant');
  await expect(page.getByTestId('pf-name')).toHaveValue('Limelight');
  await page.getByTestId('pf-name').fill("Hydrangea 'Limelight'");
  await page.getByTestId('pf-save').click();
  await expect(page.getByTestId('pf-error')).toHaveText('Enter its spread, e.g. 6-8.');
  const spread = page.getByTestId('pf-spread');
  await expect(spread).toHaveAttribute('inputmode', 'decimal'); // number pad on phones
  // Inches: the number, then "in".
  await spread.fill('36');
  await page.getByTestId('pf-spread-in').click();
  await expect(page.locator('.field', { has: spread }).locator('.hint')).toContainText('Read as 3 ft');
  await page.getByTestId('pf-spread-ft').click();
  await spread.fill('6-8');
  await expect(spread).toBeFocused(); // typing never rebuilds the form (Android keyboard)
  await expect(page.locator('.field', { has: spread }).locator('.hint')).toContainText('Read as 6 ft to 8 ft');
  await page.locator('.role-chip', { hasText: 'Full sun' }).click();
  await page.locator('.role-chip', { hasText: 'Part sun' }).click();
  await page.getByTestId('pf-save').click();

  // Placed at typical size (7 ft spread = 3.5 ft radius = 84 px at 100%), selected, with its full-size ring.
  await expect(page.locator('.sel-pill .name')).toHaveText("Hydrangea 'Limelight'");
  expect(await circleR(page, 'Limelight')).toBe(84);
  await expect(page.locator('#canvas-svg [data-role=full-ring]')).toHaveAttribute('r', '96');
  await expect(page.locator('#toast')).toContainText('dashed ring is full size');

  // It's in the picker under My plants.
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('lime');
  await expect(page.locator('.list-heading').first()).toHaveText('My plants');
  await expect(page.locator('.proj-row', { hasText: 'Limelight' }).locator('.mine-badge')).toHaveText('Mine');
  await closeSheet(page);

  // Layers: draw plants at full size.
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('plant-size').getByRole('button', { name: 'Full size' }).click();
  expect(dialogs.at(-1)).toContain('Redraw 1 plant at full size?');
  await closeSheet(page);
  expect(await circleR(page, 'Limelight')).toBe(96);
  await expect(page.locator('#canvas-svg [data-role=full-ring]')).toHaveCount(0);

  // The library survives a reload.
  await page.waitForTimeout(600);
  await page.reload();
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('lime');
  await expect(page.locator('.proj-row', { hasText: 'Limelight' })).toHaveCount(1);
});

test('copy a catalog plant as your own cultivar', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill("Heuchera 'Autumn Bride'");
  await page.locator('.proj-row', { hasText: "Heuchera 'Autumn Bride'" }).first().getByRole('button', { name: /Copy as my plant/ }).click();
  await expect(page.locator('.sheet .banner')).toContainText("A copy of Heuchera 'Autumn Bride'");
  await expect(page.getByTestId('pf-botanical')).toHaveValue('Heuchera villosa');
  await expect(page.getByTestId('pf-spread')).not.toHaveValue('');
  await page.getByTestId('pf-name').fill("Heuchera 'Caramel'");
  await page.getByTestId('pf-save').click();
  await expect(page.locator('.sheet-header .title')).toContainText('Plant Picker');
  await page.getByTestId('plant-search').fill('Caramel');
  await page.locator('.proj-row', { hasText: 'Caramel' }).click();
  await expect(page.locator('.sel-pill .name')).toHaveText("Heuchera 'Caramel'");
});

test('turn a labeled circle into a plant, then edit the plant', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await addPlainShape(page, 'circle');
  await field(page, 'Label').fill('Mystery shrub');
  await page.getByTestId('plant-link').getByRole('button', { name: 'Link to a plant…' }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Link to a plant');
  await page.getByTestId('plant-search').fill('Ninebark');
  await page.getByTestId('add-own-plant').click();
  await page.getByTestId('pf-spread').fill('5 ft');
  await expect(page.getByTestId('pf-save')).toHaveText('Save and use for this circle');
  await page.getByTestId('pf-save').click();
  // The circle is now that plant, at its size.
  await page.locator('.sel-pill button.edit').click();
  await expect(page.getByTestId('plant-link')).toContainText('Spread 5 ft');
  await expect(field(page, 'Label')).toHaveValue('Ninebark');
  await expect(field(page, 'Radius (ft)')).toHaveValue('2.5');

  // Editing the library plant offers to resize it on the plan.
  await page.getByRole('button', { name: 'Edit "Ninebark" in My plants' }).click();
  await page.getByTestId('pf-spread').fill('8 ft');
  await page.getByTestId('pf-save').click();
  await page.locator('.sel-pill button.edit').click();
  await expect(field(page, 'Radius (ft)')).toHaveValue('4');

  // Sized by hand: a reset button appears.
  await field(page, 'Radius (ft)').fill('3');
  await closeSheet(page);
  await page.locator('.sel-pill button.edit').click();
  await page.getByTestId('plant-link').getByRole('button', { name: /Reset to plant size/ }).click();
  await expect(field(page, 'Radius (ft)')).toHaveValue('4');
});
