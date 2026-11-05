import { test, expect, type Page } from '@playwright/test';
import { addKind, closeSheet, field, openFresh, openSections, planPoint, zoomPct } from './helpers';
import { measuredSides } from '../src/measured';
import type { Shape } from '../src/types';

// Sides typed as numbers, remembered with the shape for Rescale (a later change), as the app stores them: typed while
// drawing and in the edit pane, then reshaped. What Rescale's helper (src/measured.ts measuredSides) makes of each, read
// from the plan as stored. Nothing about them shows yet.

/** The open plan's shapes as stored (after its save). */
const storedShapes = (page: Page) => page.evaluate(() => new Promise<Shape[]>((resolve) => {
  const open = indexedDB.open('landscape-planner');
  open.onsuccess = () => {
    const db = open.result;
    const cur = db.transaction('kv').objectStore('kv').get('current');
    cur.onsuccess = () => {
      const p = db.transaction('projects').objectStore('projects').get(cur.result as string);
      p.onsuccess = () => { resolve(((p.result as { shapes?: Shape[] } | undefined)?.shapes) ?? []); db.close(); };
    };
  };
}));
/** Rescale's answer for the shape labeled `label`, as stored: [side, feet] each. */
const typedSides = async (page: Page, label: string) => {
  const s = (await storedShapes(page)).find((x) => x.label === label);
  return s ? measuredSides(s).map((m) => [m.side, m.ft]) : null;
};
async function tapFt(page: Page, kx: number, ky: number) {
  const p = await planPoint(page, kx - 10, ky - 10);
  await page.mouse.click(p.x, p.y);
}
const typed = (page: Page) => page.getByTestId('typed-length');
const handle = (page: Page, which: string) => page.locator(`#canvas-svg [data-handle=${which}] circle`).first();
async function centerOf(l: ReturnType<Page['locator']>) { const b = (await l.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }

test('a house from two typed sides: all four remembered; its Width typed again, the new length; stretched by a corner, its width forgotten, its length kept; turned, kept; Undo brings them back', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'building');
  await tapFt(page, 2, 10);
  await typed(page).fill('10');
  await tapFt(page, 14, 10.1);
  await typed(page).fill('6');
  await tapFt(page, 8, 13);
  await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  await page.getByTestId('real-size').getByRole('button', { name: 'It’s right' }).click(); // (small for a house: asked)
  await expect.poll(() => typedSides(page, 'House')).toEqual([[0, 10], [1, 6], [2, 10], [3, 6]]);

  // Its Width typed in the edit pane: the new length, its Length as it was.
  await page.locator('.sel-pill .edit').click(); await openSections(page);
  await field(page, 'Width (ft)').fill('12');
  await closeSheet(page);
  await expect.poll(() => typedSides(page, 'House')).toEqual([[0, 12], [1, 6], [2, 12], [3, 6]]);

  // A corner pulled 2 ft right: its width isn't what was typed any more; its length is.
  const k = 24 * (await zoomPct(page)) / 100;
  const br = await centerOf(handle(page, 'br'));
  await page.mouse.move(br.x, br.y);
  await page.mouse.down();
  await page.mouse.move(br.x + 2 * k, br.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => typedSides(page, 'House')).toEqual([[1, 6], [3, 6]]);
  // Turned a quarter by its knob: still its length.
  const knob = await centerOf(handle(page, 'rotate'));
  const center = { x: knob.x, y: knob.y + 30 + 3 * k };
  await page.mouse.move(knob.x, knob.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 3 * k, center.y - 3 * k, { steps: 4 });
  await page.mouse.move(center.x + 5 * k, center.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await storedShapes(page)).find((s) => s.label === 'House')?.rotation).toBe(90);
  expect(await typedSides(page, 'House')).toEqual([[1, 6], [3, 6]]);
  // Undo the turn and the stretch: the width typed is back with the width.
  await page.locator('button[title=Undo]').click();
  await page.locator('button[title=Undo]').click();
  await expect.poll(() => typedSides(page, 'House')).toEqual([[0, 12], [1, 6], [2, 12], [3, 6]]);
});

test("an outline's side typed: a point added before it renumbers it, kept; its corner dragged, forgotten; a fence's side typed, kept", async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'bed', 'poly');
  await tapFt(page, 2, 2);
  await tapFt(page, 12, 2);
  await tapFt(page, 12, 8);
  await typed(page).fill('7.5');
  await tapFt(page, 2.3, 8.2);
  await tapFt(page, 2, 2); // (closes it)
  await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  await expect.poll(() => typedSides(page, 'Bed')).toEqual([[2, 7.5]]);
  // Its points: one added on its first side (two sides now, neither typed): the typed side is the fourth now.
  await page.getByTestId('pill-edit-points').click();
  await page.locator('#canvas-svg [data-role=midpoint][data-index="0"]').click();
  await expect(page.locator('#canvas-svg [data-role=vertex]')).toHaveCount(5);
  await expect.poll(() => typedSides(page, 'Bed')).toEqual([[3, 7.5]]);
  // The corner it starts at, dragged 2 ft down: it isn't 7.5 ft any more.
  const k = 24 * (await zoomPct(page)) / 100;
  const c = await centerOf(page.locator('#canvas-svg [data-role=vertex][data-index="3"]'));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y + 2 * k, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await storedShapes(page)).find((s) => s.label === 'Bed') as { measured?: unknown } | undefined).not.toHaveProperty('measured');
  expect(await typedSides(page, 'Bed')).toEqual([]);
  await page.getByTestId('draw-bar').getByRole('button', { name: 'Done' }).click();
  await closeSheet(page); // (its properties, opened by Done)

  // A fence: its first side typed, its second tapped.
  await addKind(page, 'fence');
  await tapFt(page, 2, 14);
  await typed(page).fill('12');
  await tapFt(page, 14.3, 14.2);
  await tapFt(page, 14, 20);
  await page.getByTestId('draw-bar').getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => typedSides(page, 'Fence')).toEqual([[0, 12]]);
});
