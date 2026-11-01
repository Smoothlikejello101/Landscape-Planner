import { test, expect, type Page } from '@playwright/test';
import { addKind, autoDialogs, clickRedo, closeSheet, field, openFresh, shapeCount, openSections, placeOnceAtCenter, openExport, tapFromCenter } from './helpers';

async function addPlant(page: Page, name: string, x: number) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await field(page, 'X position').fill(String(x));
}
const plantShapes = (page: Page) => page.locator('#canvas-svg circle[data-shape-id]');

test('track planted and planned plants by phase, view and print one phase', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);

  // Already in the ground.
  await addPlant(page, "Heuchera 'Autumn Bride'", 0);
  const status = page.getByTestId('status-section');
  await status.getByRole('radio', { name: 'Planted' }).click();
  await expect(page.getByTestId('planted-on')).not.toHaveValue('');
  await closeSheet(page);

  // Planned for fall, in a new phase.
  await addPlant(page, 'Little bluestem', 6);
  await status.getByRole('radio', { name: 'Planned' }).click();
  await page.getByTestId('phase-select').selectOption('__new');
  await page.getByTestId('new-phase').fill('Fall 2026');
  await expect(page.getByTestId('new-phase')).toBeFocused();
  await page.getByTestId('status-section').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('phase-select')).toHaveValue('Fall 2026');
  await closeSheet(page);
  // Planned plants draw with a dashed edge.
  await expect(plantShapes(page).nth(1)).toHaveAttribute('stroke-dasharray', '6 4');

  // To remove: a red cross. Gone: off the plan, still on record.
  await addPlant(page, 'Coneflower', 12);
  await status.getByRole('radio', { name: 'To remove' }).click();
  await expect(page.locator('#canvas-svg [data-role=status-remove]')).toHaveCount(1);
  await status.getByRole('radio', { name: 'Gone' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(plantShapes(page)).toHaveCount(2);
  expect(await shapeCount(page)).toBe(3);

  // Layers: show only fall's plants; the banner says so and clears it.
  await page.locator('button[title=Layers]').click();
  await expect(page.locator('.layer-row', { hasText: 'Little bluestem' })).toContainText('Planned · Fall 2026');
  await page.getByTestId('filter-phase').selectOption('Fall 2026');
  await closeSheet(page);
  await expect(plantShapes(page)).toHaveCount(1);
  await expect(page.getByTestId('filter-banner')).toContainText('Showing: Plants in Fall 2026');
  await page.getByTestId('filter-banner').getByRole('button', { name: 'Show all plants' }).click();
  await expect(plantShapes(page)).toHaveCount(2);

  // Gone plants can be shown again.
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('show-gone').check();
  await expect(page.locator('.layer-row', { hasText: 'oneflower' })).toContainText(/Gone \d{4}-\d{2}-\d{2}/); // (marked today)
  await closeSheet(page);
  await expect(plantShapes(page)).toHaveCount(3);

  // When it went: today, unless set otherwise.
  await page.locator('button[title=Layers]').click();
  await page.locator('.layer-row', { hasText: 'oneflower' }).click();
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await expect(page.getByTestId('gone-on')).not.toHaveValue('');
  await page.getByTestId('gone-on').fill('2026-10-01');
  await closeSheet(page);

  // Saved: statuses, dates and phases survive a reload.
  await page.waitForTimeout(600);
  await page.reload();
  await page.locator('button[title=Layers]').click();
  await expect(page.locator('.layer-row', { hasText: 'Autumn Bride' })).toContainText(/Planted \d{4}-\d{2}-\d{2}/);
  await expect(page.locator('.layer-row', { hasText: 'oneflower' })).toContainText('Gone 2026-10-01');
  await expect(page.locator('.phase-row')).toContainText('Fall 2026');
  await closeSheet(page);

  // Print just fall's work.
  await openExport(page);
  await page.getByTestId('printable-plan').click();
  await page.getByTestId('print-phase').selectOption('Fall 2026');
  await page.getByTestId('create-pdf').click();
  await expect(page.getByTestId('print-result')).toContainText('1 page');
});

test('set status for several plants at once', async ({ page }) => {
  await openFresh(page);
  await addPlant(page, 'Coneflower', 0);
  await closeSheet(page);
  await addPlant(page, 'Coneflower', 5);
  await closeSheet(page);
  await page.getByTestId('select-mode').click();
  const box = (await page.locator('#canvas-svg').boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 60, box.y + box.height - 5, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
  await page.locator('.multi-bar button[title=Edit]').click();
  await page.getByTestId('status-section').getByRole('radio', { name: 'Planned' }).click();
  await expect(page.getByTestId('status-section').getByRole('radio', { name: 'Planned' })).toHaveAttribute('aria-checked', 'true');
  await closeSheet(page);
  await expect(plantShapes(page).first()).toHaveAttribute('stroke-dasharray', '6 4');
  await expect(plantShapes(page).last()).toHaveAttribute('stroke-dasharray', '6 4');
});

/** Place two of a plant in one go (Done leaves them selected): the name it goes by. */
async function placeTwo(page: Page, name: string, y = 0): Promise<string> {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  const common = (await page.locator('.place-name').innerText()).trim();
  await tapFromCenter(page, -3, y);
  await tapFromCenter(page, 3, y);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  return common;
}

test("while a sheet is open, the top bar's Undo and Redo are grayed, and a tap there leaves the sheet as it is; closed, Undo takes the change back (the UI review, 2026-11-01)", async ({ page }) => {
  await openFresh(page);
  await placeTwo(page, 'Buttonbush');
  await page.locator('.multi-bar button[title=Edit]').click(); await openSections(page);
  const status = page.getByTestId('status-section');
  await status.getByRole('radio', { name: 'Planted' }).click();
  await expect(status.getByRole('radio', { name: 'Planted' })).toHaveAttribute('aria-checked', 'true');
  const undo = page.locator('button[title=Undo]');
  await expect(undo).toBeDisabled();
  // (Above the dimming: a tap on it is a tap on nothing, never the dimming's, which closed the sheet, the change kept.)
  const at = (await undo.boundingBox())!;
  await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(status.getByRole('radio', { name: 'Planted' })).toHaveAttribute('aria-checked', 'true');
  await closeSheet(page);
  await expect(plantShapes(page).first()).not.toHaveAttribute('stroke-dasharray', '6 4'); // (planted: no planned edge)
  await undo.click();
  await expect(plantShapes(page).first()).toHaveAttribute('stroke-dasharray', '6 4'); // (planned again)
  // Redo grayed (or, at Medium text and up, not floating) over a sheet too: Layers here.
  await page.locator('button[title=Layers]').click();
  await expect(undo).toBeDisabled();
  await expect(page.locator('button[title=Redo]:enabled')).toHaveCount(0);
  await closeSheet(page);
  await clickRedo(page);
  await expect(plantShapes(page).first()).not.toHaveAttribute('stroke-dasharray', '6 4');
});

test('several plants selected are named as plants, one kind by its name (the UI review, 2026-11-01: "11 shapes selected")', async ({ page }) => {
  await openFresh(page);
  const bush = await placeTwo(page, 'Buttonbush');
  await page.locator('.multi-bar button[title=Edit]').click();
  await expect(page.locator('.sheet-header .title')).toHaveText(`2 ${bush} selected`);
  await expect(page.locator('.sheet .banner').first()).toContainText(`2 ${bush} selected.`);
  await closeSheet(page);
  await placeTwo(page, 'Little bluestem', 4);
  await page.keyboard.press('Control+a');
  await page.locator('.multi-bar button[title=Edit]').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('4 plants selected');
  await closeSheet(page);
  // With a bed among them: shapes.
  await addKind(page, 'bed', 'rect');
  for (const [x, y] of [[-8, 6], [8, 6], [8, 9]]) await tapFromCenter(page, x, y);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+a');
  await page.locator('.multi-bar button[title=Edit]').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('5 shapes selected');
});

test('setting several at once asks before unmarking one marked to remove', async ({ page }) => {
  await openFresh(page);
  await addPlant(page, 'Coneflower', 0);
  await closeSheet(page);
  await addPlant(page, 'Little bluestem', 5);
  await page.getByTestId('status-section').getByRole('radio', { name: 'To remove' }).click();
  await closeSheet(page);
  const cross = page.locator('#canvas-svg [data-role=status-remove]');
  await expect(cross).toHaveCount(1);
  const selectBoth = async () => {
    // (Select mode stays on after a lasso: turn it on only if it's off.)
    if ((await page.getByTestId('select-mode').getAttribute('aria-pressed')) !== 'true') await page.getByTestId('select-mode').click();
    const box = (await page.locator('#canvas-svg').boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 60, box.y + box.height - 5, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
    await page.locator('.multi-bar button[title=Edit]').click();
  };
  await selectBoth();
  const status = page.getByTestId('status-section');
  const question = page.getByTestId('flag-question');

  const rows = async (cone: string, blue: string) => {
    await page.locator('button[title=Layers]').click();
    await expect(page.locator('.layer-row', { hasText: 'Coneflower' })).toContainText(cone);
    await expect(page.locator('.layer-row', { hasText: 'Little bluestem' })).toContainText(blue);
    await closeSheet(page);
  };

  // Planted, for both: it asks first, and nothing changes yet.
  await status.getByRole('radio', { name: 'Planted' }).click();
  await expect(question).toContainText('1 of these is marked To remove: Little bluestem');
  await expect(question).toContainText('Set it to Planted too?');
  await expect(page.getByTestId('flag-only')).toBeFocused();
  await page.getByTestId('flag-cancel').click();
  await expect(question).toHaveCount(0);
  await closeSheet(page);
  await rows('Planned', 'To remove');

  // A question left open goes with the panel: it doesn't come back.
  await page.keyboard.press('Escape');
  await selectBoth();
  await status.getByRole('radio', { name: 'Planted' }).click();
  await expect(question).toBeVisible();
  await closeSheet(page);
  await page.locator('.multi-bar button[title=Edit]').click();
  await expect(question).toHaveCount(0);
  await closeSheet(page);
  await rows('Planned', 'To remove');

  // Only the other: the coneflower is planted, the bluestem still to remove.
  await page.keyboard.press('Escape');
  await selectBoth();
  await status.getByRole('radio', { name: 'Planted' }).click();
  await page.getByTestId('flag-only').click();
  await expect(question).toHaveCount(0);
  await expect(page.locator('.sheet')).toContainText('Mixed');
  await closeSheet(page);
  await expect(cross).toHaveCount(1);
  await rows('Planted', 'To remove');

  // Or all of them, as one step to undo.
  await page.keyboard.press('Escape');
  await selectBoth();
  await status.getByRole('radio', { name: 'Planted' }).click();
  await page.getByTestId('flag-all').click();
  await expect(status.getByRole('radio', { name: 'Planted' })).toHaveAttribute('aria-checked', 'true');
  await closeSheet(page);
  await expect(cross).toHaveCount(0);
  await page.locator('button[title=Undo]').click();
  await expect(cross).toHaveCount(1);
});
