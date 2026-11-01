import { test, expect, type Page } from '@playwright/test';
import { addKind, addPlainShape, closeSheet, field, openFresh, openSections, openSettings, openWarnings, setRole, shapeCount, tapFromCenter } from './helpers';

// Jason's round 3 decisions (Oct 31), the second batch, each as a tester met it.

async function place(page: Page, name: string, spots: [number, number][]) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  for (const [x, y] of spots) await tapFromCenter(page, x, y);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
}

test('after an undo, Redo floats out under Undo, nothing in the bar moving; gone with nothing left to redo (Dana, Alex, Ruth)', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'circle');
  await closeSheet(page);
  const undo = page.locator('button[title=Undo]');
  const before = (await undo.boundingBox())!;
  await expect(page.getByTestId('float-redo')).toHaveCount(0);
  await undo.click();
  expect(await shapeCount(page)).toBe(0);
  const redo = page.getByTestId('float-redo');
  await expect(redo).toBeVisible();
  expect(await undo.boundingBox()).toEqual(before);
  // (Under it, once it has slid out: read mid-slide, it can still be a pixel short.)
  await expect.poll(async () => (await redo.boundingBox())!.y).toBeGreaterThanOrEqual(before.y + before.height - 1);
  await redo.click();
  expect(await shapeCount(page)).toBe(1);
  await expect(redo).toHaveCount(0);
});

test('a sun record starts empty: a drag across the day draws the hours in sun (Grace, Tom)', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'rect');
  await field(page, 'Label').fill('Oak shade');
  await setRole(page, 'Sun exposure');
  const bar = page.getByTestId('sun-empty');
  await expect(bar).toBeVisible();
  await expect(page.getByTestId('sun-summary')).toHaveCount(0); // (nothing said until someone says it)
  // The day runs 5 am to 9 pm across the bar, 10 px in from each end: 9 am to 1 pm is a quarter to a half along.
  const b = (await bar.boundingBox())!;
  const x = (f: number) => b.x + 10 + (b.width - 20) * f;
  await page.mouse.move(x(0.25), b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(x(0.375), b.y + b.height / 2, { steps: 4 });
  await page.mouse.move(x(0.5), b.y + b.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('sun-summary')).toHaveText('☀ 4 h of direct sun · part sun / part shade');
  await expect(page.locator('.tr-readout').first()).toHaveText('9 am – 1 pm');
});

test("a plant USGS's register lists as invasive says so in its details, and that the register doesn't say where (Kim; Jason, Oct 31)", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Chinese privet');
  const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Chinese privet$/ }) });
  // (No ZIP, so no state's law: a plain Place. The red one follows the law: tests/location.spec.ts.)
  await expect(item.getByTestId('plant-place')).toHaveText('Place');
  await item.getByTestId('plant-row').click();
  const line = item.getByTestId('register-us');
  await expect(line).toContainText('Listed as widespread invasive in the lower 48: at least locally abundant, and harmful ecologically, economically or to health');
  await expect(line).toContainText("The register covers the lower 48 as a whole; it doesn't say where.");
  await expect(line.locator('.details-src')).toContainText(/USGS|U\.S\. Geological Survey/);
  // A plant not on it: no such line.
  await page.getByTestId('plant-search').fill('Buttonbush');
  const bush = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Buttonbush$/ }) });
  await bush.getByTestId('plant-row').click();
  await expect(bush.locator('.plant-details')).toBeVisible();
  await expect(bush.getByTestId('register-us')).toHaveCount(0);
});

test('an existing tree is Existing, not Planted, and so is the next one drawn after it (Grace)', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'tree');
  await page.getByTestId('unknown-tree').click();
  await tapFromCenter(page, 0, 4);
  await tapFromCenter(page, 0, 6);
  await page.locator('.sel-pill .edit').click(); await openSections(page);
  const status = page.getByTestId('status-section');
  await expect(status.locator('[aria-checked=true]')).toHaveText('Existing');
  // (Not offered for a tree already there: To move and Planted are for plants.)
  await page.getByTestId('place-more').click();
  await tapFromCenter(page, 0, -5);
  await tapFromCenter(page, 0, -3);
  await page.locator('.sel-pill .edit').click(); await openSections(page);
  await expect(page.getByTestId('status-section').locator('[aria-checked=true]')).toHaveText('Existing');
});

test("a notice's ✕ is at its top right corner, whatever its buttons (Jason)", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Snowberry');
  await page.locator('.sheet .proj-row', { hasText: 'Snowberry' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await tapFromCenter(page, 2, 0); // (crowded: a notice)
  const notice = page.locator('#toast-action');
  await expect(notice).toBeVisible();
  const n = (await notice.boundingBox())!, x = (await notice.getByTestId('notice-close').boundingBox())!;
  expect(n.x + n.width - (x.x + x.width)).toBeLessThan(8);
  expect(x.y - n.y).toBeLessThan(8);
});

test('Settings, from ⋮: names on the plan sized apart from the text, kept on this device (Ruth, Bea)', async ({ page }) => {
  await openFresh(page);
  await place(page, 'Buttonbush', [[0, 0]]);
  const label = page.locator('#canvas-svg [data-role=plant-label]').first();
  const size = async () => Number(await label.getAttribute('font-size'));
  const medium = await size();
  await openSettings(page);
  await expect(page.getByTestId('label-size-medium')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('label-size-large').click();
  await expect(page.getByTestId('label-size-large')).toHaveAttribute('aria-pressed', 'true');
  expect(await size()).toBeGreaterThan(medium);
  await expect(page.locator('html')).toHaveAttribute('data-text', 'medium'); // (the app's text as it was)
  await closeSheet(page);
  await page.reload();
  expect(await size()).toBeGreaterThan(medium);
  // Layers says where its settings went.
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('layers-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
});

test('Settings → Warnings lists every warning in the plan, by kind past a handful; a tap selects the plants (Owen; Jason)', async ({ page }) => {
  await openFresh(page);
  // (Placed without crowding notices, to tap where they'd be; still ringed, and listed.)
  await openSettings(page);
  await openWarnings(page);
  await page.getByTestId('crowd-warnings').uncheck();
  await closeSheet(page);
  // Six crowded pairs of snowberry (4½ ft spread), 2 ft apart, each pair 6 ft from the next.
  const spots: [number, number][] = [];
  for (const y of [-6, 0, 6]) for (const x0 of [-6, 2]) spots.push([x0, y], [x0 + 2, y]);
  await place(page, 'Snowberry', spots);
  await page.keyboard.press('Escape');
  await openSettings(page);
  await openWarnings(page);
  const now = page.getByTestId('warnings-now');
  await expect(now.locator(':scope > summary')).toHaveText('In this plan now · 6 active');
  await now.locator(':scope > summary').click();
  const crowding = page.getByTestId('warnings-kind-crowding');
  await expect(crowding.locator(':scope > summary')).toHaveText('Crowding · 6 active');
  await crowding.locator(':scope > summary').click();
  const rows = crowding.getByTestId('warning-row');
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toContainText('Snowberry and Snowberry: crowded, 2 ft apart');
  // A tap: the pair selected on the plan, the sheet put away.
  await rows.first().getByTestId('warning-select').click();
  await expect(page.getByTestId('settings')).toHaveCount(0);
  await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
  // Left close on purpose from Settings: listed as dismissed, below, folds kept open.
  await page.keyboard.press('Escape');
  await openSettings(page);
  await crowding.getByRole('button', { name: 'Dismiss all 6' }).click();
  await expect(crowding.locator(':scope > summary')).toHaveText('Crowding · 6 dismissed');
  await expect(rows.first()).toHaveAttribute('data-dismissed', 'true');
  await rows.first().getByTestId('warning-again').click();
  await expect(crowding.locator(':scope > summary')).toHaveText('Crowding · 1 active, 5 dismissed');
  await expect(rows.first()).toHaveAttribute('data-dismissed', 'false');
});
