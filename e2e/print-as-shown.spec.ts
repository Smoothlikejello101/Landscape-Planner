import { test, expect } from '@playwright/test';
import { closeSheet, openFresh, tapFromCenter } from './helpers';

// Jason, Oct 31 (round 3's most common complaint: six testers): Print starts from what the screen shows (its status and
// phase filter, roles hidden in Layers, names on or off, the month) and says so; each can be changed for the sheet.

test('Print starts from the screen: its filter, names and month, said in a line, and changeable', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Turkey corn');
  await page.locator('.sheet .proj-row', { hasText: 'Turkey corn' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();

  // Nothing filtered on the screen: Print says nothing about it.
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Print or save as PDF' }).click();
  await expect(page.getByTestId('print-as-shown')).toHaveCount(0);
  await expect(page.getByTestId('print-names')).toBeChecked();
  await closeSheet(page);

  // Planned plants only, names hidden, in February.
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('filter-status').selectOption('planned');
  await closeSheet(page);
  await page.getByTestId('toggle-names').click();
  await page.getByTestId('year-open').click();
  for (let i = 0; i < 12 && !(await page.getByTestId('year-month').textContent())!.startsWith('Feb'); i++) await page.getByTestId('year-next').click();
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Print or save as PDF' }).click();
  await expect(page.getByTestId('print-status')).toHaveValue('planned');
  await expect(page.getByTestId('print-as-shown')).toContainText('only planned plants, no names, as in February');
  await expect(page.getByTestId('print-names')).not.toBeChecked();
  await expect(page.getByTestId('print-month')).toBeChecked();

  // Changed for the sheet: the line says only what still comes from the screen.
  await page.getByTestId('print-names').check();
  await page.getByTestId('print-month').uncheck();
  await expect(page.getByTestId('print-as-shown')).toHaveText('As the plan shows it now: only planned plants. Change it below, or in Layers.');
  await page.getByTestId('create-pdf').click();
  await expect(page.getByTestId('print-result')).toContainText('1 page');
});
