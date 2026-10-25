import { test, expect, type Page } from '@playwright/test';
import { openFresh, closeSheet, canvasBox, drag, field, addPlainShape, setRole } from './helpers';

async function addRect(page: Page, label: string, role?: string) {
  await addPlainShape(page, 'rect');
  await field(page, 'Label').fill(label);
  if (role) await setRole(page, role);
  await closeSheet(page);
}
const centerOf = async (page: Page, label: string) => {
  const b = (await page.locator('[data-shape-group]', { has: page.locator('text', { hasText: label }) }).locator('[data-shape-id]').boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test('dragging on a locked shape pans the plan; tapping it selects it', async ({ page }) => {
  await openFresh(page);
  await addRect(page, 'Big shade');
  await page.locator('.sel-pill button.edit').click();
  const x0 = await field(page, 'X position').inputValue();
  await page.locator('.lockbtn').click(); // lock it
  await closeSheet(page);
  await page.mouse.click(5, (await canvasBox(page)).y + 5); // deselect
  await expect(page.locator('.sel-pill')).toHaveCount(0);

  const start = await centerOf(page, 'Big shade');
  await drag(page, start, { x: start.x + 80, y: start.y + 30 });
  const after = await centerOf(page, 'Big shade');
  expect(Math.round(after.x - start.x)).toBe(80); // the view moved with the finger
  expect(Math.round(after.y - start.y)).toBe(30);

  await page.mouse.click(after.x, after.y); // a tap selects it
  await expect(page.locator('.sel-pill .name')).toHaveText('Big shade');
  await page.locator('.sel-pill button.edit').click();
  expect(await field(page, 'X position').inputValue()).toBe(x0); // not moved in the plan
});

test('a role sets the default look and the drawing order', async ({ page }) => {
  await openFresh(page);
  await addRect(page, 'Plant spot', 'Plant');
  await addRect(page, 'Afternoon shade', 'Sun exposure');
  // Shade is drawn under plants even though it was added later.
  const order = await page.locator('[data-shape-group] text').evaluateAll((ns) => ns.map((n) => n.textContent));
  expect(order).toEqual(['Afternoon shade', 'Plant spot']);
  const shade = page.locator('[data-shape-group]', { has: page.locator('text', { hasText: 'Afternoon shade' }) }).locator('[data-shape-id]');
  await expect(shade).toHaveAttribute('fill', '#334155');
  await expect(shade).toHaveAttribute('fill-opacity', '0.3');
});

test('boundaries draw as dashed lines with no fill', async ({ page }) => {
  await openFresh(page);
  await addRect(page, 'Property line', 'Boundary');
  const line = page.locator('[data-shape-id]');
  await expect(line).toHaveAttribute('fill', 'none');
  await expect(line).toHaveAttribute('stroke-dasharray', '8 4');
});

test('a whole role can be hidden and locked from Layers, and that is saved', async ({ page }) => {
  await openFresh(page);
  await addRect(page, 'Bed one', 'Bed');
  await addRect(page, 'Shade one', 'Sun exposure');
  await page.locator('button[title=Layers]').click();
  const shadeRow = page.locator('.role-row[data-role-key=shade]');
  // (Each row's eye and lock come first, beside the name they act on, and are fingertip-sized.)
  await expect(shadeRow.locator(':scope > *').first()).toHaveAttribute('data-action', 'toggle-hidden');
  await expect(shadeRow.locator(':scope > *').nth(1)).toHaveAttribute('data-action', 'toggle-locked');
  const eyeBox = (await shadeRow.locator('[data-action=toggle-hidden]').boundingBox())!;
  expect(Math.min(eyeBox.width, eyeBox.height)).toBeGreaterThanOrEqual(48);
  await shadeRow.locator('[data-action=toggle-hidden]').click();
  await closeSheet(page);
  await expect(page.locator('#canvas-svg text', { hasText: 'Shade one' })).toHaveCount(0);
  await expect(page.locator('#canvas-svg text', { hasText: 'Bed one' })).toHaveCount(1);

  // Lock beds: dragging the bed now pans instead of moving it.
  await page.locator('button[title=Layers]').click();
  await page.locator('.role-row[data-role-key=bed] [data-action=toggle-locked]').click();
  await closeSheet(page);
  const box = await canvasBox(page);
  const bed = await centerOf(page, 'Bed one');
  await drag(page, bed, { x: bed.x + 50, y: bed.y });
  expect(Math.round((await centerOf(page, 'Bed one')).x - bed.x)).toBe(50);
  expect(box.width).toBeGreaterThan(0);

  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('#canvas-svg text', { hasText: 'Shade one' })).toHaveCount(0);
  await page.locator('button[title=Layers]').click();
  await expect(page.locator('.role-row[data-role-key=bed] [data-action=toggle-locked]')).toHaveAttribute('aria-pressed', 'true');
});

test('several shapes can be given a role at once', async ({ page }) => {
  await openFresh(page);
  await addRect(page, 'One');
  await addRect(page, 'Two');
  await page.getByTestId('select-mode').click();
  const box = await canvasBox(page);
  await drag(page, { x: box.x + 10, y: box.y + 70 }, { x: box.x + box.width - 50, y: box.y + box.height - 70 });
  await page.locator('.multi-bar button', { hasText: 'Edit' }).click();
  await setRole(page, 'Lawn');
  await closeSheet(page);
  await page.locator('button[title=Layers]').click();
  await expect(page.locator('.role-row[data-role-key=lawn] .count')).toHaveText(/· 2$/); // (beside the name: "Lawn · 2")
});
