import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
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
  await expect(page.getByTestId('print-result')).toContainText(/Ready: front-yard-plan-\d{4}/); // (not "plan-plan")
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

/** The words a PDF draws, its compressed streams opened. */
function pdfWords(pdf: Buffer): string {
  const text = pdf.toString('latin1');
  const out: string[] = [];
  for (const m of text.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length, end = text.indexOf('endstream', start);
    try { out.push(inflateSync(pdf.subarray(start, end)).toString('latin1')); } catch { out.push(text.slice(start, end)); }
  }
  return out.join('\n');
}

// The general bug hunt, Nov 1 (bug 7): the plant list read "Abyssinian banana 'Maurelii'  Ensete ventrico..." with the
// page mostly empty: a botanical name that doesn't fit after its plant's name goes whole on the line under it.
test('the printed plan\'s plant list gives each botanical name whole, under its plant\'s name when it doesn\'t fit beside it (the general bug hunt, Nov 1)', async ({ page }) => {
  await openFresh(page);
  const plant = (id: string, x: number) => ({ id, type: 'circle', x, y: 3, radius: 2, color: '#16a34a', label: "Abyssinian banana 'Maurelii'", opacity: 0.65, locked: false, role: 'plant', plantId: 'ensete-ventricosum-maurelii', status: 'planned' });
  const shapes = [{ id: 'bed', type: 'rect', x: 0, y: 0, width: 14, height: 6, rotation: 0, color: '#92400e', label: 'Bed', opacity: 0.65, locked: false, role: 'bed' }, plant('a', 3), plant('b', 7), plant('c', 11)];
  const file = { format: 'landscape-planner-project', version: 1, project: { name: 'Banana bed', lastModified: 1, data: { shapes } } };
  await page.locator('.project-btn').click();
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'b.fullgrown.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('.project-btn .pname')).toHaveText('Banana bed');
  await openExport(page);
  await page.getByTestId('printable-plan').click();
  await page.getByTestId('create-pdf').click();
  await expect(page.getByTestId('print-result')).toContainText('1 page');
  const download = page.waitForEvent('download');
  await page.getByTestId('download-pdf').click();
  const pdf = readFileSync((await (await download).path())!);
  writeFileSync(test.info().outputPath('plan.pdf'), pdf);
  const words = pdfWords(pdf);
  expect(words).toContain("(Ensete ventricosum 'Maurelii')");
  expect(words).not.toMatch(/ventrico[a-z]*\.\.\./);
});
