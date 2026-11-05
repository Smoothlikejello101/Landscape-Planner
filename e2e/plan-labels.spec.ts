import { test, expect, type Page } from '@playwright/test';
import { closeSheet, shapeCount, zoomPct } from './helpers';

// The plan's labels by zoom, from Jason's notes of Nov 4, 9:02 PM: a run of one plant named once ("Creeping liriope
// ×12") all the way out to where plants' names go (his note 4); a bed's name quiet, under its plants, while plants are
// shown (5); zoomed far out, no name bigger than what it names (6). The placing look for a bed (2) is in
// e2e/plant-this-bed.spec.ts.

const base = { opacity: 0.65, locked: false, rotation: 0 };
async function openPlan(page: Page, shapes: object[], view: { zoom: number; x: number; y: number }) {
  // (The view by its middle, whatever the screen: the offsets from the screen's size.)
  await page.addInitScript(([shapes, view]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const w = innerWidth, h = innerHeight - 120, ppf = 24 * view.zoom;
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes, zoom: view.zoom, offsetX: view.x - w / 2 / ppf, offsetY: view.y - h / 2 / ppf }));
  }, [shapes, view] as const);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
  // (The catalog in, and the plan drawn again with it: plants' heights set what's drawn over what. A plan with plants.)
  if (shapes.some((s) => (s as { role?: string }).role === 'plant')) await expect(page.getByTestId('warnings-btn')).not.toHaveAttribute('data-state', 'checking');
}
/** A shape's name as drawn, in its own group or lifted over the plants. */
const nameOf = (page: Page, id: string) => page.locator(`#canvas-svg [data-shape-group="${id}"] > text, #canvas-svg [data-name-of="${id}"] text`);

// Jason's plan of Nov 1, where it stacked: twelve creeping liriope 1.5 ft apart down the 1.5 ft Carport bed, two
// Callery pears' 25 ft crowns to their west.
const liriope = (i: number) => ({ ...base, id: `l${i}`, type: 'circle', role: 'plant', plantId: 'liriope-spicata', label: 'Creeping liriope', color: '#16a34a', x: 1, y: -27.5 + i * 1.5, radius: 0.75 });
const pear = (id: string, y: number) => ({ ...base, id, type: 'circle', role: 'plant', plantId: 'pyrus-calleryana', label: 'Bradford/Callery pear', color: '#16a34a', x: -12, y, radius: 12.5, tree: true, status: 'planted' });
const CARPORT = [
  { ...base, id: 'carport', type: 'rect', role: 'bed', label: 'Carport', color: '#92400e', opacity: 0.3, x: 0, y: -28.5, width: 1.5, height: 18.5 },
  ...Array.from({ length: 12 }, (_, i) => liriope(i)), pear('pear1', -11.5), pear('pear2', -28),
];

test('a run of one plant is named once at every zoom out to where plants\' names go, never a stack (Jason, Nov 4, note 4)', async ({ page }) => {
  await openPlan(page, CARPORT, { zoom: 0.7, x: 1, y: -19.25 });
  const plantNames = page.locator('#canvas-svg [data-role=plant-label]');
  const run = plantNames.filter({ hasText: 'Creeping liriope ×12' });
  const lone = plantNames.filter({ hasText: /^Creeping liriope$/i });
  // 70%, 56% (where it stacked from 54%: ten "Creeping liriope" down the bed), 45%, 36%, 29%, 23%: one name.
  for (let i = 0; i < 6; i++) {
    const pct = await zoomPct(page);
    await expect(run, `at ${pct}%`).toHaveCount(1);
    await expect(lone, `at ${pct}%`).toHaveCount(0);
    await page.getByRole('button', { name: 'Zoom out' }).click();
  }
  // Past 20%: no plant's name (PLANT_NAMES_MIN_ZOOM, Nov 4).
  expect(await zoomPct(page)).toBeLessThan(20);
  await expect(plantNames).toHaveCount(0);
});

// A bed with three asters across it, as e2e/area-names.spec.ts has it, and a sun area with one.
const aster = (id: string, x: number, y: number) => ({ ...base, id, type: 'circle', role: 'plant', plantId: 'symphyotrichum-novae-angliae', label: 'New England aster', color: '#16a34a', x, y, radius: 1.2 });
const BEDS = [
  { ...base, id: 'bed', type: 'rect', role: 'bed', label: 'Front bed', color: '#92400e', opacity: 0.3, x: 0, y: 0, width: 8, height: 4 },
  aster('p1', 2, 2), aster('p2', 4, 2), aster('p3', 6, 2),
  { ...base, id: 'ms', type: 'rect', role: 'shade', label: 'Morning sun', color: '#facc15', opacity: 0.3, x: 1, y: 7, width: 6, height: 4, sun: { mode: 'hours', hours: 6, periods: [], dappled: false } },
  aster('p4', 4, 9),
];

test("a bed's name is quiet and under its plants while plants are shown; with plants hidden, as before (Jason, Nov 4, note 5)", async ({ page }) => {
  await openPlan(page, BEDS, { zoom: 1.2, x: 4, y: 5 });
  // In the bed's own group, where the bed puts it (its middle), not lifted over the plants or moved clear of them.
  const name = nameOf(page, 'bed');
  await expect(name).toHaveText('Front bed');
  await expect(page.locator('#canvas-svg [data-shape-group=bed] > text[data-quiet]')).toHaveCount(1);
  await expect(page.locator('#canvas-svg g[data-role=area-names] [data-name-of=bed]')).toHaveCount(0);
  // Under the plants: its group drawn before theirs.
  const order = await page.locator('#canvas-svg g[data-layer=shapes] > g[data-shape-group]').evaluateAll((gs) => gs.map((g) => g.getAttribute('data-shape-group')));
  for (const p of ['p1', 'p2', 'p3']) expect(order.indexOf('bed')).toBeLessThan(order.indexOf(p));
  const nb = (await name.boundingBox())!, bed = (await page.locator('#canvas-svg [data-shape-id=bed]').boundingBox())!;
  expect(Math.abs(nb.x + nb.width / 2 - (bed.x + bed.width / 2))).toBeLessThan(1.5);
  expect(Math.abs(nb.y + nb.height / 2 - (bed.y + bed.height / 2))).toBeLessThan(2);
  // Low-contrast: a darker shade of the bed's own color (src/canvas.ts quietInk), see-through, no halo; not near-black.
  await expect(name).toHaveAttribute('fill', '#5d2e12');
  await expect(name).toHaveAttribute('fill-opacity', '0.7');
  expect(await name.getAttribute('stroke')).toBeNull();
  // The sun area's name as it was: lifted over the plants, clear of its aster.
  await expect(page.locator('#canvas-svg g[data-role=area-names] > [data-name-of=ms]')).toContainText('Morning sun');

  // Plants hidden (Layers): the bed's name over everything, dark, at its middle (no plants to keep clear of), as before.
  await page.locator('button[title=Layers]').click();
  await page.getByRole('button', { name: 'Hide Plant' }).click();
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-shape-id=p1]')).toHaveCount(0);
  const lifted = page.locator('#canvas-svg g[data-role=area-names] > [data-name-of=bed] text');
  await expect(lifted).toHaveText('Front bed');
  await expect(lifted).toHaveAttribute('fill', '#0f172a');
  await expect(page.locator('#canvas-svg text[data-quiet]')).toHaveCount(0);
  const lb = (await lifted.boundingBox())!;
  expect(Math.abs(lb.x + lb.width / 2 - (bed.x + bed.width / 2))).toBeLessThan(1.5);
});

// Jason's plan's kinds of label (Nov 1): a house, his path (2.5 ft wide, turning a corner), a driveway, a 4.5 × 10 ft
// bed, a buried line, a trellis, a fence; and a note.
const YARD = [
  { ...base, id: 'house', type: 'poly', role: 'building', label: 'House', color: '#57534e', opacity: 0.8, x: 0, y: -40, points: [[0, 0], [40, 0], [40, 30], [24, 30], [24, 36], [16, 36], [16, 30], [0, 30]] },
  { ...base, id: 'path', type: 'line', role: 'path', label: 'Path', color: '#a8a29e', opacity: 0.7, x: 1.5, y: -4, pathWidth: 2.5, points: [[2, 0], [0, 2.5], [0, 11], [0, 23], [0.5, 23.5], [24.5, 23.5]] },
  { ...base, id: 'drive', type: 'poly', role: 'path', label: 'Driveway', color: '#a8a29e', opacity: 0.7, x: 45, y: -60, points: [[0, 0], [18, 0], [18, 70], [0, 70]] },
  { ...base, id: 'bed', type: 'rect', role: 'bed', label: 'Bed', color: '#92400e', opacity: 0.3, x: -14, y: 30, width: 4.5, height: 10 },
  { ...base, id: 'buried', type: 'line', role: 'utility', utility: 'buried', label: 'Buried line', color: '#a16207', opacity: 1, x: -8, y: -60, points: [[0, 0], [5, 30], [10, 60]] },
  { ...base, id: 'trellis', type: 'line', role: 'structure', label: 'Trellis', color: '#8b5a2b', opacity: 1, x: 30, y: 10, points: [[0, 0], [12, 0]] },
  { ...base, id: 'fence', type: 'line', role: 'boundary', label: 'Fence', color: '#44403c', opacity: 1, x: -16, y: 12, points: [[0, 0], [60, 0]] },
  { ...base, id: 'note', type: 'text', label: 'Compost here', color: '#1c1917', opacity: 1, x: 10, y: 40, fontSize: 1.5 },
];

test("zoomed far out, no name is bigger than what it names: \"Path\" isn't 21 ft across at 5% (Jason, Nov 4, note 6)", async ({ page }) => {
  // 100%: every name at its size, "Path" too (12 px, 26 px long).
  await openPlan(page, YARD, { zoom: 1, x: 3, y: 8 });
  const path = nameOf(page, 'path');
  await expect(path).toHaveText('Path');
  const at100 = (await path.boundingBox())!;
  expect(at100.height).toBeLessThan(18);
  expect(at100.width).toBeLessThan(32);

  // 5%: "Path" gone (it would be 26 px over a band 3 px wide); the house's name, inside it, stays; the bed's, its lines'
  // and the driveway's (across an 18 ft drive, 37 ft long) gone too.
  for (let i = 0; i < 14; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  expect(await zoomPct(page)).toBe(5);
  await expect(path).toHaveCount(0);
  await expect(nameOf(page, 'house')).toHaveText('House');
  for (const id of ['drive', 'bed', 'buried', 'trellis', 'fence']) await expect(nameOf(page, id), id).toHaveCount(0);
  // Every name drawn inside its shape's box on the screen (the note is its own shape, drawn to the plan's scale).
  const screen = (await page.locator('#canvas-svg').boundingBox())!;
  for (const id of ['house', 'path', 'drive', 'bed', 'buried', 'trellis', 'fence']) {
    for (const t of await nameOf(page, id).all()) {
      const b = (await t.boundingBox())!, s = (await page.locator(`#canvas-svg [data-shape-id="${id}"]`).first().boundingBox())!;
      expect(b.x, id).toBeGreaterThanOrEqual(s.x - 0.5);
      expect(b.x + b.width, id).toBeLessThanOrEqual(s.x + s.width + 0.5);
      expect(b.width / screen.width, `${id}: its share of the screen`).toBeLessThan(0.1);
    }
  }
  const note = page.locator('#canvas-svg [data-role=text-note]');
  expect((await note.boundingBox())!.height).toBeLessThan(6); // (1.5 ft: 1.8 px, with its halo and line)

  // 20%: the bed's name (inside its 4.5 ft, 22 px) back; "Path" not (12 px over a 12 px band, across its corner).
  for (let i = 0; i < 8 && (await zoomPct(page)) < 20; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(await zoomPct(page)).toBeGreaterThanOrEqual(20);
  expect(await zoomPct(page)).toBeLessThan(25);
  await expect(nameOf(page, 'bed')).toHaveText('Bed');
  await expect(path).toHaveCount(0);
  // 25% and closer, as it always was: every name, whatever its shape's size.
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(await zoomPct(page)).toBeGreaterThanOrEqual(25);
  await expect(path).toHaveText('Path');
  for (const id of ['drive', 'buried', 'trellis', 'fence']) await expect(nameOf(page, id), id).toHaveCount(1);
});
