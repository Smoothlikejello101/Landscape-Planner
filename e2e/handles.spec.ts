import { test, expect, type Page } from '@playwright/test';
import { addKind, addPlainShape, closeSheet, field, openFresh, openSections, setRole, tapFromCenter, zoomPct } from './helpers';

// Handles on the selected shape: a corner resizes it, the knob above it turns it, a circle's edge sizes it.

const handle = (page: Page, which: string) => page.locator(`#canvas-svg [data-handle=${which}]`);
async function middleOf(page: Page, which: string) {
  const b = (await handle(page, which).locator('circle').first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
const ppf = async (page: Page) => 24 * (await zoomPct(page)) / 100;
const editSelected = async (page: Page) => { await page.locator('.sel-pill .edit').click(); await openSections(page); };

test('resize a bed by its corner, turn it by its knob, and undo each', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'bed', 'rect');
  for (const [x, y] of [[-4, -3], [4, -3], [0, 2]]) await tapFromCenter(page, x, y); // an 8 × 5 ft bed
  await expect(page.locator('#canvas-svg [data-role=shape-resize]')).toHaveCount(4);
  await expect(page.locator('#canvas-svg [data-role=shape-rotate]')).toHaveCount(1);
  const k = await ppf(page);

  // Pull the bottom-right corner 2 ft right and 1 ft down: the size shows as it goes.
  const br = await middleOf(page, 'br');
  await page.mouse.move(br.x, br.y);
  await page.mouse.down();
  await page.mouse.move(br.x + 2 * k, br.y + 1 * k, { steps: 6 });
  await expect(page.locator('#canvas-svg [data-role=handle-readout]')).toHaveText('10 × 6 ft');
  await page.mouse.up();
  await expect(page.locator('#canvas-svg [data-role=handle-readout]')).toHaveCount(0);
  await editSelected(page);
  await expect(field(page, 'Width (ft)')).toHaveValue('10');
  await expect(field(page, 'Length (ft)')).toHaveValue('6');
  await closeSheet(page);

  // Turn it a quarter turn: the knob, from above its center to its right.
  const knob = await middleOf(page, 'rotate');
  const center = { x: knob.x, y: knob.y + 30 + 3 * k }; // (the knob is 30 px above the top edge, 3 ft above the center)
  await page.mouse.move(knob.x, knob.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 3 * k, center.y - 3 * k, { steps: 4 });
  await page.mouse.move(center.x + 5 * k, center.y, { steps: 4 });
  await expect(page.locator('#canvas-svg [data-role=handle-readout]')).toHaveText('90°');
  await page.mouse.up();
  await editSelected(page);
  await expect(field(page, 'Rotation')).toHaveValue('90');
  await closeSheet(page);

  // One undo step for each drag.
  await page.locator('button[title=Undo]').click();
  await editSelected(page);
  await expect(field(page, 'Rotation')).toHaveValue('0');
  await expect(field(page, 'Width (ft)')).toHaveValue('10');
  await closeSheet(page);
  await page.locator('button[title=Undo]').click();
  await editSelected(page);
  await expect(field(page, 'Width (ft)')).toHaveValue('8');
});

test("a circle's edge sizes it; a plant or a locked shape shows no handles", async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'circle'); // 4 ft across
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=shape-resize]')).toHaveCount(1);
  await expect(page.locator('#canvas-svg [data-role=shape-rotate]')).toHaveCount(0);
  const k = await ppf(page);
  const edge = await middleOf(page, 'radius');
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + Math.SQRT1_2 * k, edge.y + Math.SQRT1_2 * k, { steps: 6 }); // 1 ft further out
  await page.mouse.up();
  await editSelected(page);
  await expect(page.getByTestId('circle-size')).toHaveValue('6');

  // A plant's size is its spread: no handle to pull by accident.
  await setRole(page, 'Plant');
  await expect(page.locator('#canvas-svg [data-role=shape-resize]')).toHaveCount(0);
  await closeSheet(page);

  // A locked shape: none either.
  await addPlainShape(page, 'rect');
  await expect(page.locator('#canvas-svg [data-role=shape-resize]')).toHaveCount(4);
  await page.locator('.sheet .lockbtn').click();
  await expect(page.locator('#canvas-svg [data-role=shape-resize]')).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=shape-rotate]')).toHaveCount(0);
});

test('a tap on a handle goes to what is under it', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'bed', 'rect');
  for (const [x, y] of [[-4, -3], [4, -3], [0, 2]]) await tapFromCenter(page, x, y);
  await expect(page.locator('.sel-pill')).toHaveCount(1);
  // Nothing under the knob: a tap there is a tap on the empty plan.
  const knob = await middleOf(page, 'rotate');
  await page.mouse.click(knob.x, knob.y);
  await expect(page.locator('.sel-pill')).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=shape-rotate]')).toHaveCount(0);
});
