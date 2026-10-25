import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { addPlainShape, closeSheet, openFresh, placeOnceAtCenter } from './helpers';

// What a screen reader needs (every control named) and what low vision needs (text dark enough), checked by
// axe-core on the screens people use most. The plan itself (the drawing) is left out: its labels are drawn over
// whatever is under them, which axe can't judge.
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const RULES = ['button-name', 'select-name', 'label', 'input-button-name', 'link-name', 'image-alt', 'aria-toggle-field-name', 'aria-input-field-name', 'color-contrast'];

async function problems(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  const found = await page.evaluate(async (rules) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axe = (window as any).axe;
    const r = await axe.run({ exclude: [['#canvas-svg']] }, { runOnly: { type: 'rule', values: rules } });
    return r.violations.flatMap((v: { id: string; nodes: { target: string[]; failureSummary: string }[] }) =>
      v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} ${v.id === 'color-contrast' ? n.failureSummary.split('\n').slice(1, 2).join('') : ''}`.trim()));
  }, RULES);
  return found;
}

test('every control has a name, and text is dark enough, on the main screens', async ({ page }) => {
  const seen: Record<string, string[]> = {};
  await openFresh(page);
  seen.start = await problems(page);
  await page.locator('.tool-btn.plants').click();
  seen.picker = await problems(page);
  await page.getByTestId('plant-search').fill('Autumn Bride');
  await page.locator('.proj-row', { hasText: "Heuchera 'Autumn Bride'" }).locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);
  seen.selected = await problems(page);
  expect((await page.locator('.sel-pill button.edit').boundingBox())!.height).toBeGreaterThanOrEqual(40); // (was 23 px)
  await page.locator('.sel-pill button.edit').click();
  seen.properties = await problems(page);
  await closeSheet(page);
  await page.locator('button[title=Layers]').click();
  seen.layers = await problems(page);
  await closeSheet(page);
  await page.locator('button[title=More]').click();
  seen.menu = await problems(page);
  await page.keyboard.press('Escape');
  await addPlainShape(page, 'rect');
  seen.shape = await problems(page);
  const all = Object.entries(seen).flatMap(([screen, list]) => list.map((x) => `${screen}: ${x}`));
  expect(all).toEqual([]);
});

test('the same on the other sheets: plant details, adding, projects, export and print, a plant of my own', async ({ page }) => {
  const seen: Record<string, string[]> = {};
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Butterfly milkweed');
  await page.locator('.plant-item', { hasText: 'Butterfly milkweed' }).first().getByTestId('plant-row').click();
  seen.details = await problems(page);
  await page.getByTestId('add-own-plant').click();
  seen.plantForm = await problems(page);
  await closeSheet(page);
  await page.getByTestId('add-btn').click();
  seen.add = await problems(page);
  await closeSheet(page);
  await page.locator('.project-btn').click();
  seen.projects = await problems(page);
  await closeSheet(page);
  await addPlainShape(page, 'circle');
  await closeSheet(page);
  await addPlainShape(page, 'rect');
  await closeSheet(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Export image' }).click();
  seen.export = await problems(page);
  await closeSheet(page);
  await page.locator('button[title="Select several"]').click();
  seen.selectMode = await problems(page);
  const all = Object.entries(seen).flatMap(([screen, list]) => list.map((x) => `${screen}: ${x}`));
  expect(all).toEqual([]);
});

test('pinch-zoom works on sheets and menus, never stranding the plan; a tap on the plan beside a button stays on the plan', async ({ page, isMobile }) => {
  await openFresh(page);
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).not.toMatch(/maximum-scale|user-scalable/);
  await expect(page.locator('#canvas-wrap')).toHaveCSS('touch-action', 'none');
  test.skip(!isMobile, 'touch only');
  // (Chrome moves a tap near a button onto it unless what's under the finger takes taps itself.)
  const names = page.getByTestId('toggle-names');
  const box = (await names.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height + 5);
  await expect(names).toHaveAttribute('aria-pressed', 'false');
  // The buttons themselves are fingertip-sized.
  for (const b of await page.locator('.zoombtn').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(48);
});
