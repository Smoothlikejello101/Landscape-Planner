import { test, expect } from '@playwright/test';
import { closeSheet, field, openFresh, addPlainShape, setRole, placeOnceAtCenter, openExport } from './helpers';

test('printable plan: options persist and a PDF downloads', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'rect');
  await setRole(page, 'Bed');
  await field(page, 'Label').fill('Front bed');
  await field(page, 'Width (ft)').fill('12');
  await closeSheet(page);
  await page.locator('.tool-btn.plants').click();
  await page.locator('.sheet input[type=text]').fill("Heuchera 'Autumn Bride'");
  await page.locator('.sheet .proj-row', { hasText: "Heuchera 'Autumn Bride'" }).first().locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);

  await openExport(page);
  await page.getByTestId('printable-plan').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Printable plan');
  await expect(page.getByTestId('print-summary')).toContainText('scale 1 in =');
  await page.getByTestId('paper').getByRole('button', { name: '11 × 17' }).click();
  const title = page.locator('.sheet .field').filter({ hasText: 'Title' }).locator('input').first();
  await title.fill('Front yard plan');
  await expect(title).toBeFocused(); // typing doesn't rebuild the panel
  await page.getByRole('button', { name: '→ Right' }).click();

  await page.getByTestId('create-pdf').click();
  await expect(page.getByTestId('print-result')).toContainText('front-yard-plan-plan-');
  await expect(page.getByTestId('print-result')).toContainText('1 page');
  const download = page.waitForEvent('download');
  await page.getByTestId('download-pdf').click();
  const file = await (await download).path();
  const bytes = (await import('node:fs')).readFileSync(file!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(5000);

  // Changing an option drops the old PDF; settings are kept with the project.
  await page.locator('.check-row', { hasText: 'Grid' }).locator('input').uncheck();
  await expect(page.getByTestId('download-pdf')).toHaveCount(0);
  await page.waitForTimeout(600);
  await page.reload();
  await openExport(page);
  await page.getByTestId('printable-plan').click();
  await expect(page.getByTestId('paper').getByRole('button', { name: '11 × 17' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sheet .field').filter({ hasText: 'Title' }).locator('input').first()).toHaveValue('Front yard plan');
  await expect(page.locator('.sheet .field').filter({ hasText: 'North points' }).locator('input')).toHaveValue('90');
  await expect(page.locator('.check-row', { hasText: 'Grid' }).locator('input')).not.toBeChecked();
});
