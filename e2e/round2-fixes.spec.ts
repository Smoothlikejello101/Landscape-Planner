import { test, expect, type Page } from '@playwright/test';
import { addKind, addPlainShape, answerAsk, closeSheet, field, openFilters, openFresh, shapeCount, tapFromCenter } from './helpers';

// Round 2 of persona testing (Oct 30): the smaller fixes, each as a tester met it.

async function oneRect(page: Page, dx = 0) {
  await addKind(page, 'plain', 'rect');
  for (const [x, y] of [[dx - 2, -1.5], [dx + 2, -1.5], [dx, 1.5]]) await tapFromCenter(page, x, y);
  await expect(page.getByTestId('draw-bar')).toHaveCount(0);
}
const rects = (page: Page) => page.locator('#canvas-svg rect[data-shape-id]');

test('Undo lights up straight after an arrow nudge (Alex: it stayed gray, though Ctrl+Z undid it)', async ({ page }) => {
  await openFresh(page);
  await oneRect(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('button[title=Undo]')).toBeEnabled(); // (the rect drawn)
  await page.locator('button[title=Undo]').click();
  await page.locator('button[title=Undo]').isDisabled();
  await oneRect(page);
  const b = (await rects(page).first().boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  // A fresh plan with one step taken and undone, then redrawn: nudge and look at once.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('button[title=Undo]')).toBeEnabled();
  const x0 = (await rects(page).first().boundingBox())!.x;
  await page.locator('button[title=Undo]').click();
  await expect.poll(async () => (await rects(page).first().boundingBox())!.x).toBeLessThan(x0);
});

test('a second Ctrl+V steps a foot further, not onto the first paste (Tom)', async ({ page }) => {
  await openFresh(page);
  await oneRect(page);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.keyboard.press('Control+v');
  expect(await shapeCount(page)).toBe(3);
  const xs = await Promise.all([0, 1, 2].map(async (i) => Math.round((await rects(page).nth(i).boundingBox())!.x)));
  expect(new Set(xs).size).toBe(3);
});

test('Esc closes Layers with one of its buttons focused, and leaves Measure without keeping the line (Alex, Tom)', async ({ page }) => {
  await openFresh(page);
  await oneRect(page);
  await page.locator('button[title=Layers]').click();
  await page.locator('.sheet [data-action=toggle-locked]').first().focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet')).toHaveCount(0);
  // Measure: two points, Esc: no dimension line kept.
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await tapFromCenter(page, -4, 4);
  await tapFromCenter(page, 4, 4);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  expect(await shapeCount(page)).toBe(1);
});

test('switching plans and back keeps the undo steps (Sam: Clear all, another plan, back, and they were gone)', async ({ page }) => {
  await openFresh(page);
  await oneRect(page);
  await page.locator('.project-btn').click();
  await page.getByRole('button', { name: /New project/ }).click();
  await answerAsk(page, true, 'Second');
  await expect(page.locator('.project-btn .pname')).toHaveText('Second');
  await expect.poll(() => shapeCount(page)).toBe(0);
  await page.locator('.project-btn').click();
  await page.locator('.proj-row', { hasText: 'My Garden' }).first().click();
  await expect(page.locator('.project-btn .pname')).toHaveText('My Garden');
  await expect.poll(() => shapeCount(page)).toBe(1);
  await expect(page.locator('button[title=Undo]')).toBeEnabled();
  await page.locator('button[title=Undo]').click();
  await expect.poll(() => shapeCount(page)).toBe(0);
});

test('switching plans and back keeps the steps to undo, but not one undone: no Redo there (the UI review, 2026-11-01)', async ({ page }) => {
  await openFresh(page);
  await oneRect(page, -4);
  await oneRect(page, 4);
  await page.keyboard.press('Escape');
  await page.locator('button[title=Undo]').click();
  await expect.poll(() => shapeCount(page)).toBe(1);
  await expect(page.getByTestId('float-redo')).toBeVisible();
  await page.locator('.project-btn').click();
  await page.getByRole('button', { name: /New project/ }).click();
  await answerAsk(page, true, 'Second');
  await expect(page.locator('.project-btn .pname')).toHaveText('Second');
  await page.locator('.project-btn').click();
  await page.locator('.proj-row', { hasText: 'My Garden' }).first().click();
  await expect(page.locator('.project-btn .pname')).toHaveText('My Garden');
  await expect.poll(() => shapeCount(page)).toBe(1);
  await expect(page.getByTestId('float-redo')).toHaveCount(0);
  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+Shift+z');
  expect(await shapeCount(page)).toBe(1);
  // The step before it is still there to undo.
  await expect(page.locator('button[title=Undo]')).toBeEnabled();
  await page.locator('button[title=Undo]').click();
  await expect.poll(() => shapeCount(page)).toBe(0);
});

test('on a computer, Undo and Redo say what they would do: "Undo: delete Front bed"; a step that doesn\'t say, a plain Undo (the UI review, 2026-11-01)', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'rect');
  await expect(page.locator('.sheet')).toBeVisible();
  await field(page, 'Label').fill('Front bed');
  await closeSheet(page);
  const undo = page.locator('button[title=Undo]');
  // (The name typed: a step that doesn't say. The button is "Undo" by name either way.)
  await expect(undo).toBeEnabled();
  await expect(page.getByTestId('undo-says')).toHaveCount(0);
  await expect(page.locator('.topbar').getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await page.keyboard.press('Delete');
  await expect.poll(() => shapeCount(page)).toBe(0);
  await expect(page.getByTestId('undo-says')).toHaveAttribute('title', 'Undo: delete Front bed');
  await expect(page.locator('.topbar').getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await undo.click();
  await expect.poll(() => shapeCount(page)).toBe(1);
  await expect(page.getByTestId('redo-says')).toHaveAttribute('title', 'Redo: delete Front bed');
  await expect(page.getByTestId('undo-says')).toHaveCount(0); // (the name typed, again)
  // Another drawn: what it is.
  await oneRect(page, 6);
  await expect(page.getByTestId('undo-says')).toHaveAttribute('title', 'Undo: add a plain shape');
});

test('"In this plan" lists every plant in the plan, saying which the filters would hide (Ruth, Dana)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Butterfly milkweed');
  await page.locator('.sheet .proj-row', { hasText: 'Butterfly milkweed' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('');
  await openFilters(page);
  await page.getByRole('checkbox', { name: 'Not listed as poisonous to people' }).check();
  await page.getByTestId('in-plan').click();
  await expect(page.locator('.plant-item', { hasText: 'Butterfly milkweed' })).toBeVisible();
  await expect(page.getByTestId('filtered-in-plan')).toContainText('Your filters would hide it: Not listed as poisonous to people');
  await expect(page.locator('.sheet')).toContainText('1 kind of plant in this plan');
});
