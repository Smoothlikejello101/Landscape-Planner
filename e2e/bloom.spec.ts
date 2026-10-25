import { test, expect, type Page } from '@playwright/test';
import { autoDialogs, closeSheet, field, openFresh, addPlainShape, setRole, openSections, placeOnceAtCenter } from './helpers';

async function addPlant(page: Page, name: string, x: number) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await field(page, 'X position').fill(String(x));
  await field(page, 'Y position').fill('1');
  await closeSheet(page);
}

test('bloom calendar for a bed and for the whole plan', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'rect');
  await field(page, 'Label').fill('Front bed');
  await setRole(page, 'Bed');
  await field(page, 'X position').fill('0');
  await field(page, 'Y position').fill('0');
  await field(page, 'Width (ft)').fill('12');
  await closeSheet(page);
  await addPlant(page, "Heuchera 'Autumn Bride'", 2);
  await addPlant(page, "Heuchera 'Autumn Bride'", 4);
  await addPlant(page, 'Little bluestem', 30); // outside the bed

  // The bed's properties show its own plants by month.
  await page.locator('button[title=Layers]').click();
  await page.locator('.layer-row', { hasText: 'Front bed' }).click();
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  const chart = page.getByTestId('bloom-chart');
  await expect(chart.locator('.bloom-name').nth(1)).toHaveText("Heuchera 'Autumn Bride' ×2");
  await expect(chart.locator('.bloom-cell.on').first()).toBeVisible();
  await expect(page.getByTestId('bloom-gaps')).toContainText(/Nothing here blooms in .*\. The whole plan blooms /);
  await closeSheet(page);

  // The whole plan, bed by bed, from the menu.
  await page.locator('.iconbtn[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Bloom calendar' }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Bloom calendar');
  await expect(page.locator('.bloom-group .section-label')).toHaveText(['Front bed', 'Not in a bed']);
});

test('plants with no bloom months are listed by name, saying why; one of mine gets them from the calendar', async ({ page }) => {
  autoDialogs(page); // ("Update the placed plant to the new size?")
  await openFresh(page);
  await addPlant(page, 'Little bluestem', 30);
  // One of mine, with no bloom months.
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Backyard hosta');
  await page.getByTestId('add-own-plant').click();
  await page.getByTestId('pf-spread').fill('2');
  await page.getByTestId('pf-save').click();
  await placeOnceAtCenter(page);

  await page.locator('.iconbtn[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Bloom calendar' }).click();
  const none = page.getByTestId('bloom-none');
  await expect(none).toHaveCount(1);
  await expect(none).toContainText('No bloom months');
  await expect(page.locator('.bloom-name.none')).toHaveText('Backyard hosta');
  // Catalog plants all have months here: no call for a ZIP.
  await expect(page.getByTestId('bloom-zip')).toHaveCount(0);
  // Add: its form, then back to the calendar with it in bloom.
  await page.getByRole('button', { name: 'Add bloom months to Backyard hosta' }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Edit my plant');
  await page.locator('.sheet details summary').click();
  await page.locator('.sheet details select').nth(0).selectOption('6');
  await page.locator('.sheet details select').nth(1).selectOption('7');
  await page.getByTestId('pf-save').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Bloom calendar');
  await expect(none).toHaveCount(0);
  await expect(page.locator('.bloom-name', { hasText: 'Backyard hosta' })).toBeVisible();
});

test('catalog plants with a season and no months say so; with no ZIP, the calendar offers one and comes back', async ({ page }) => {
  await openFresh(page);
  await addPlant(page, 'Boxwood', 30);
  await page.locator('.iconbtn[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Bloom calendar' }).click();
  await expect(page.getByTestId('bloom-none')).toHaveText('Spring (no months)');
  await page.getByTestId('bloom-zip').click();
  await page.locator('.sheet-header .iconbtn').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Bloom calendar');
});
