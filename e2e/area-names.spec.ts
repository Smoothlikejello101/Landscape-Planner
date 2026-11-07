import { test, expect, type Page } from '@playwright/test';
import { shapeCount } from './helpers';

// On the plan itself, plants no longer hide the names of the sun area under them (the general bug hunt, Nov 1: "Morning
// sun" showed only a stray "n"). They're placed as a printout places them (src/area-names.ts): where the shape puts
// them, or with a plant there, just above it, below it, to its right or left; and drawn over the plants. A bed's name,
// lifted so too from Nov 1 to Nov 4, is quiet and under its plants while plants are shown (Jason, Nov 4: "I'm happy to
// have bed names be low-contrast and get buried under plants unless plants are hidden"): e2e/plan-labels.spec.ts.

const base = { color: '#a16207', opacity: 0.65, locked: false };
const box = (id: string, role: string, label: string, x: number, y: number, width: number, height: number, extra: object = {}) =>
  ({ ...base, id, type: 'rect', role, label, x, y, width, height, rotation: 0, ...extra });
const plant = (id: string, x: number, y: number) => ({ ...base, color: '#16a34a', id, type: 'circle', role: 'plant', plantId: 'symphyotrichum-novae-angliae', label: 'New England aster', x, y, radius: 1.2 });
const SHAPES = [
  box('bed', 'bed', 'Bed', 0, 0, 8, 4), plant('p1', 2, 2), plant('p2', 4, 2), plant('p3', 6, 2),
  box('ms', 'shade', 'Morning sun', 1, 7, 6, 4, { color: '#facc15', opacity: 0.3, sun: { mode: 'hours', hours: 6, periods: [], dappled: false } }), plant('p4', 4, 9),
  box('lawn', 'lawn', 'Lawn', 0, 13, 8, 3, { color: '#86efac' }),
];

async function openPlan(page: Page) {
  await page.addInitScript((shapes) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes, zoom: 1.2, offsetX: -2, offsetY: -6 }));
  }, SHAPES);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(SHAPES.length);
  await expect(page.getByTestId('warnings-btn')).not.toHaveAttribute('data-state', 'checking'); // (the catalog in)
  for (const id of ['p1', 'p2', 'p3', 'p4']) await expect(page.locator(`#canvas-svg [data-shape-id=${id}]`).first()).toBeVisible();
}
type Box = { x: number; y: number; width: number; height: number };
/** How far a box is from a circle's edge, in (negative: over it). */
const clearOf = (b: Box, c: Box) => {
  const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
  return Math.hypot(Math.max(b.x, Math.min(cx, b.x + b.width)) - cx, Math.max(b.y, Math.min(cy, b.y + b.height)) - cy) - c.width / 2;
};

test('a sun area\'s name is drawn clear of the plants in it, over them all (the general bug hunt, Nov 1); a bed\'s, under them', async ({ page }) => {
  await openPlan(page);
  const plants = await Promise.all(['p1', 'p2', 'p3', 'p4'].map(async (id) => (await page.locator(`#canvas-svg [data-shape-id=${id}]`).first().boundingBox())!));
  const plan = (await page.locator('#canvas-svg').boundingBox())!;
  for (const [id, words] of [['ms', 'Morning sun']]) {
    const name = page.locator(`#canvas-svg g[data-role=area-names] > [data-name-of=${id}]`);
    await expect(name).toContainText(words);
    const b = (await name.boundingBox())!;
    for (const p of plants) expect(clearOf(b, p), `${words} clear of the plants`).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(plan.y);
    // (Just above its shape, as a printout has it: its own middle has a plant on it.)
    const shape = (await page.locator(`#canvas-svg [data-shape-id=${id}]`).boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(shape.y + 1);
  }
  // A sun area's hours go with its name.
  await expect(page.locator('#canvas-svg [data-name-of=ms] [data-role=sun-label]')).toHaveText('☀ 6 h');
  // Over the plants: drawn after every shape.
  const last = await page.locator('#canvas-svg g[data-layer=shapes] > *').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-role') ?? 'shape'));
  expect(last.indexOf('area-names')).toBeGreaterThan(last.lastIndexOf('shape'));
  // A name with no plant on it stays where it was, in its shape's middle.
  await expect(page.locator('#canvas-svg [data-name-of=lawn]')).not.toHaveAttribute('transform', /./);
  // The bed's name in its own group, quiet, under its plants (Jason, Nov 4).
  await expect(page.locator('#canvas-svg [data-name-of=bed]')).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-shape-group=bed] > text[data-quiet]')).toHaveText('Bed');
  // Dragging the bed takes its name along.
  const name = page.locator('#canvas-svg [data-shape-group=bed] > text');
  const before = (await name.boundingBox())!;
  const bed = (await page.locator('#canvas-svg [data-shape-id=bed]').boundingBox())!;
  await page.mouse.move(bed.x + 6, bed.y + bed.height - 6);
  await page.mouse.down();
  await page.mouse.move(bed.x + 66, bed.y + bed.height - 6, { steps: 6 });
  await page.mouse.up();
  const moved = (await page.locator('#canvas-svg [data-shape-id=bed]').boundingBox())!.x - bed.x;
  expect(moved).toBeGreaterThan(40);
  await expect.poll(async () => Math.abs((await name.boundingBox())!.x - before.x - moved)).toBeLessThan(1.5);
});
