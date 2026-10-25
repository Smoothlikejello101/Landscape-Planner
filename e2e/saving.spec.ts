import { test, expect } from '@playwright/test';
import { addPlainShape, autoDialogs, closeSheet, openFresh } from './helpers';

// Saving, printing and deleting say what happened.

test('the top bar says the plan is saved; a delete says what went, with an Undo', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await addPlainShape(page, 'circle');
  await expect(page.getByTestId('save-state')).toHaveText('Saved'); // (after "Saving…", once it's written)
  await expect(page.getByTestId('save-state')).toHaveAttribute('title', 'Saved on this device');
  await page.locator('.sheet').getByRole('button', { name: /Delete/ }).first().click();
  const notice = page.locator('#toast-action');
  await expect(notice).toContainText('Deleted');
  // (A sheet opened under it: the notice moves above the sheet, clear of its buttons.)
  await page.locator('.tool-btn.plants').click();
  const n = (await notice.boundingBox())!, sheet = (await page.locator('.sheet').boundingBox())!;
  expect(n.y + n.height).toBeLessThanOrEqual(sheet.y);
  await closeSheet(page);
  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.project-btn .pinfo')).toContainText('1 shape');
  // Clear all, too.
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Clear all shapes' }).click();
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(notice).toContainText('Cleared 1 shape');
  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.project-btn .pinfo')).toContainText('1 shape');
});

test('print is its own menu item, and Create PDF stays in view with its result', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'rect');
  await closeSheet(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Print or save as PDF' }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Printable plan');
  const create = page.getByTestId('create-pdf');
  await expect(create).toBeInViewport(); // (at the bottom of the sheet, however far its options scroll)
  await create.click();
  await expect(page.getByTestId('pdf-ready')).toBeInViewport();
  await expect(page.getByTestId('download-pdf')).toBeInViewport();
});
