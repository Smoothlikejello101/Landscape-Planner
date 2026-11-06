import { test, expect, type Page } from '@playwright/test';
import { autoDialogs, shapeCount } from './helpers';

// Two tabs or windows of the app on one plan (Jason, Nov 6, from the bug hunt: a bed drawn in one tab was lost when the
// tab opened first saved its older copy over it). Each takes in the other's saves as they're made (src/tabs.ts); the
// second is told once that both are open; nothing is kept apart or lost. (A save over a newer copy, by a tab that missed
// the news: tests/storage.test.ts.)

const base = { opacity: 0.65, locked: false, rotation: 0, color: '#16a34a', type: 'circle', role: 'plant', status: 'planned' };
const SHAPES = [
  { ...base, type: 'rect', role: 'bed', kind: 'bed', id: 'bed', x: -12, y: -6, width: 24, height: 12, color: '#92400e', opacity: 0.3, label: 'Front bed' },
  ...[0, 1, 2, 3].map((i) => ({ ...base, id: `p${i}`, x: -9 + i * 6, y: 0, plantId: 'echinacea-purpurea', label: "Coneflower 'Magnus'", radius: 1.5 })),
];
/** The plan, put in the first page only (a second would put it in again, over what the first saved). */
async function openSeeded(page: Page) {
  const { width, height } = page.viewportSize()!;
  await page.addInitScript(([s, w, h]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const zoom = 0.8, ppf = 24 * zoom;
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes: s, zoom, offsetX: -w / 2 / ppf, offsetY: -(h - 160) / 2 / ppf }));
  }, [SHAPES, width, height] as const);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(SHAPES.length);
}
/** A plant on the plan selected, then deleted with the Delete key. */
async function deletePlant(page: Page, id: string, isMobile: boolean) {
  await page.bringToFront();
  const b = (await page.locator(`#canvas-svg [data-shape-group="${id}"] > [data-shape-id]`).first().boundingBox())!;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  if (isMobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await expect(page.locator('.sel-pill')).toBeVisible();
  await page.keyboard.press('Delete');
}
const plansStored = (page: Page) => page.evaluate(() => new Promise<string[]>((resolve) => {
  const open = indexedDB.open('landscape-planner');
  open.onsuccess = () => {
    const r = open.result.transaction('meta').objectStore('meta').getAll();
    r.onsuccess = () => { resolve((r.result as { name: string }[]).map((m) => m.name)); open.result.close(); };
  };
}));

test("two tabs on one plan: each shows the other's changes as they're saved, the second is told once, and nothing is lost or kept apart (Jason, Nov 6)", async ({ page, context, isMobile }) => {
  autoDialogs(page);
  await openSeeded(page);
  const second = await context.newPage();
  autoDialogs(second);
  await second.goto('./');
  await expect.poll(() => shapeCount(second)).toBe(SHAPES.length);
  // The second is told, once, after the notices of the start (its second visit's "saved here" card, put away); the first
  // isn't.
  await second.getByTestId('saved-here').getByTestId('notice-close').click();
  const told = second.getByTestId('also-open');
  await expect(told).toContainText('FullGrown is open in another tab or window on this device too.');
  await expect(page.getByTestId('also-open')).toHaveCount(0);
  await told.getByRole('button', { name: 'OK' }).click();
  await expect(told).toHaveCount(0);
  // A plant deleted in the second: gone from the first too, without a reload.
  await deletePlant(second, 'p0', isMobile);
  await expect.poll(() => shapeCount(second)).toBe(SHAPES.length - 1);
  await expect.poll(() => shapeCount(page)).toBe(SHAPES.length - 1);
  // And the other way: one deleted in the first, gone from the second; nothing of the first's put back over it.
  await deletePlant(page, 'p1', isMobile); // (left of the side buttons on a phone)
  await expect.poll(() => shapeCount(page)).toBe(SHAPES.length - 2);
  await expect.poll(() => shapeCount(second)).toBe(SHAPES.length - 2);
  // Both opened again: the same plan, with both changes; one plan, none kept apart.
  await page.reload();
  await expect.poll(() => shapeCount(page)).toBe(SHAPES.length - 2);
  await second.reload();
  await expect.poll(() => shapeCount(second)).toBe(SHAPES.length - 2);
  await expect(page.locator('#canvas-svg [data-shape-group="p0"]')).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-shape-group="p1"]')).toHaveCount(0);
  expect(await plansStored(page)).toEqual(['My Garden']);
  await expect(second.getByTestId('tab-change')).toHaveCount(0); // (nothing to say: no change was ever behind)
});
