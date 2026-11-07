import { test, expect, type Page } from '@playwright/test';
import { shapeCount } from './helpers';

// Warning badges on the plant itself (Jason's notes after release 3: "flags show up on names, I guess? I would expect
// them on the plant itself, so the flagged cardinal flower and milkweed made me think a plant was out of place"): at the
// top right of its own circle, on its edge, stacked when there are several; still hidden with the names.

const base = { color: '#16a34a', opacity: 0.65, locked: false };
const plant = (id: string, plantId: string, label: string, x: number, y: number, radius: number) => ({ ...base, id, type: 'circle', role: 'plant', plantId, label, x, y, radius });
/** Four cardinal flowers in a row, too small for their names at 100%: named once, "Cardinal flower ×4", at the row's middle. */
const ROW = [1, 2.5, 4, 5.5].map((x, i) => plant(`c${i + 1}`, 'lobelia-cardinalis', 'Cardinal flower', x, 0, 0.75));
const ALOE = plant('al', 'aloe-vera', 'Barbados aloe', 12, 0, 1.5); // (poisonous, and too cold for zone 8a)

async function openPlan(page: Page, shapes: object[]) {
  await page.addInitScript((shapes) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('lp-yard', JSON.stringify({ kids: true, dogs: '', cats: false, horses: false }));
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes, location: { zip: '71923', zone: '8a' }, zoom: 1, offsetX: -2, offsetY: -6 }));
  }, shapes);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
  await expect(page.getByTestId('warnings-btn')).not.toHaveAttribute('data-state', 'checking');
}
const middle = async (page: Page, sel: string) => {
  const b = (await page.locator(`#canvas-svg ${sel}`).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.width / 2 };
};

test('a plant\'s badges sit on its own circle, at its top right, not by its name; several stacked (Jason, after release 3)', async ({ page }) => {
  await openPlan(page, [...ROW, ALOE]);
  await expect(page.locator('#canvas-svg text', { hasText: 'Cardinal flower ×4' })).toHaveCount(1);
  // Each cardinal flower's poison badge on its own edge, at its top right: the one its row's name is drawn with too
  // (before, its badge sat by the name, between plants).
  for (const id of ['c1', 'c2', 'c3', 'c4']) {
    const p = await middle(page, `[data-shape-id=${id}]`), b = await middle(page, `[data-badges-of=${id}] [data-role=poison-warning]`);
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    expect(d, id).toBeGreaterThan(p.r - 3);
    expect(d, id).toBeLessThan(Math.max(p.r, 12) + 3);
    expect(b.x, id).toBeGreaterThan(p.x);
    expect(b.y, id).toBeLessThan(p.y);
  }
  // The aloe's two, poison and hardiness, in one stack: poison on its edge, hardiness just above it.
  const a = await middle(page, '[data-shape-id=al]');
  const poison = await middle(page, '[data-badges-of=al] [data-role=poison-warning]'), hardy = await middle(page, '[data-badges-of=al] [data-role=hardy-warning]');
  expect(Math.abs(Math.hypot(poison.x - a.x, poison.y - a.y) - a.r)).toBeLessThan(3);
  expect(Math.abs(hardy.x - poison.x)).toBeLessThan(1);
  expect(poison.y - hardy.y).toBeGreaterThan(15);
  expect(poison.y - hardy.y).toBeLessThan(23);
  await expect(page.locator('[data-badges-of=al]')).toHaveAttribute('data-corner', 'top-right');
  // Over every plant: in one group drawn after them all.
  await expect(page.locator('#canvas-svg g[data-role=badges-over] > [data-role=plant-badges]')).toHaveCount(5);
  // Still hidden with the names, a selected plant's own showing.
  await page.getByTestId('toggle-names').click();
  await expect(page.locator('#canvas-svg [data-role=plant-badges]')).toHaveCount(0);
  await page.locator('#canvas-svg [data-shape-id=al]').first().click();
  await expect(page.locator('#canvas-svg [data-role=plant-badges]')).toHaveCount(1);
  await expect(page.locator('#canvas-svg [data-badges-of=al] > *')).toHaveCount(2);
});

test('a neighbor\'s badges and the full-size ring are kept clear of, where they can be', async ({ page }) => {
  // Two aloes overlapping, up and to the right of each other: the second's top right would be on the first.
  // (And a third drawn far smaller than its full size, its full-size ring just beyond its edge once selected.)
  await openPlan(page, [plant('a1', 'aloe-vera', 'Barbados aloe', 4, 0, 1.5), plant('a2', 'aloe-vera', 'Barbados aloe', 2, 2, 1.5), plant('a3', 'aloe-vera', 'Barbados aloe', 12, 0, 0.3)]);
  const boxes = async (id: string) => Promise.all((await page.locator(`#canvas-svg [data-badges-of=${id}] > *`).all()).map(async (l) => (await l.boundingBox())!));
  const meet = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const [one, two] = [await boxes('a1'), await boxes('a2')];
  expect(one.length + two.length).toBe(4);
  for (const x of one) for (const y of two) expect(meet(x, y)).toBe(false);
  // Selected, its dashed full-size ring shows: its badges are inside it or outside, never across it.
  await page.locator('#canvas-svg [data-shape-id=a3]').first().click();
  const ring = page.locator('#canvas-svg [data-shape-group=a3] [data-role=full-ring]');
  await expect(ring).toHaveCount(1);
  const r = await middle(page, '[data-shape-group=a3] [data-role=full-ring]');
  const three = await boxes('a3');
  expect(three).toHaveLength(2);
  for (const b of three) {
    const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => Math.hypot(x - r.x, y - r.y));
    const inside = corners.every((d) => d <= r.r), outside = Math.hypot(Math.max(b.x, Math.min(r.x, b.x + b.width)) - r.x, Math.max(b.y, Math.min(r.y, b.y + b.height)) - r.y) >= r.r;
    expect(inside || outside).toBe(true);
  }
});
