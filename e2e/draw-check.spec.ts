import { test, expect, type Page } from '@playwright/test';
import { planPoint, shapeCount } from './helpers';

// The plan drawn again by what changed (Jason, Nov 6: "taps only redraw what changes"): each drawing is made whole apart
// from the page, and what comes out the same as on the page is kept there (src/canvas.ts drawCanvas, keepWhatsSame). In
// every end-to-end test (playwright.config.ts: lp-draw-check), each drawing also checks the plan as kept against the
// plan drawn whole, and counts a difference on the plan (data-draw-mismatch). Here, the usual things done to a plan,
// each checked: never a difference, and a tap that only selects keeps nearly all of the plan as it was.

const base = { opacity: 0.65, locked: false, rotation: 0, color: '#16a34a' };
const plant = (id: string, x: number, y: number, plantId: string, label: string, radius: number, extra: object = {}) =>
  ({ ...base, id, type: 'circle', role: 'plant', plantId, label, x, y, radius, status: 'planned', ...extra });
/** A yard: a house, two beds of plants, a run of one plant, a sun area over part of a bed, a path, a tree over a plant. */
function yard(): object[] {
  const shapes: object[] = [
    { ...base, id: 'house', type: 'rect', x: -20, y: -30, width: 30, height: 18, color: '#57534e', opacity: 0.8, role: 'building', kind: 'building', status: 'existing', label: 'House', locked: true },
    { ...base, id: 'front', type: 'rect', x: -20, y: -8, width: 24, height: 10, color: '#92400e', opacity: 0.3, role: 'bed', kind: 'bed', status: 'planned', label: 'Front bed' },
    { ...base, id: 'side', type: 'rect', x: 8, y: -30, width: 8, height: 30, color: '#92400e', opacity: 0.3, role: 'bed', kind: 'bed', status: 'planned', label: 'Side bed' },
    { ...base, id: 'sun', type: 'rect', x: 8, y: -30, width: 8, height: 12, color: '#334155', opacity: 0.3, role: 'shade', kind: 'shade', label: 'Morning sun', sun: { mode: 'hours', periods: [], hours: 4, dappled: false } },
    { ...base, id: 'walk', type: 'line', x: -22, y: 6, points: [[0, 0], [40, 0]], pathWidth: 3, color: '#a8a29e', opacity: 0.7, role: 'path', kind: 'path', status: 'existing', label: 'Walk' },
    plant('oak', 12, -4, 'quercus-alba', 'White oak', 4, { tree: true, status: 'existing' }),
    plant('under', 12, -4, 'heuchera-villosa', "Heuchera 'Autumn Bride'", 0.75),
  ];
  for (let i = 0; i < 5; i++) shapes.push(plant(`c${i}`, -17 + i * 4, -5, 'echinacea-purpurea', "Coneflower 'Magnus'", 1));
  for (let i = 0; i < 5; i++) shapes.push(plant(`b${i}`, -17 + i * 4, -1, 'rudbeckia-maxima', 'Giant coneflower', 1.5));
  for (let i = 0; i < 6; i++) shapes.push(plant(`s${i}`, 12, -27 + i * 3, 'stokesia-laevis', "Stokes' aster", 0.75));
  return shapes;
}
async function openPlan(page: Page, shapes: object[]) {
  // (The yard in the middle of the screen, whatever its size: 9.6 px a foot. The screen's size from the test: a phone's
  // page says it's 980 px wide till it's laid out.)
  const { width, height } = page.viewportSize()!;
  await page.addInitScript(([s, w, h]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const zoom = 0.4, ppf = 24 * zoom;
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes: s, zoom, offsetX: -2 - w / 2 / ppf, offsetY: -9 - (h - 160) / 2 / ppf }));
  }, [shapes, width, height] as const);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
  await expect.poll(() => page.locator('#canvas-svg [data-role=plant-look]').count()).toBeGreaterThan(10); // (the catalog in)
  await expect(page.getByTestId('warnings-btn')).not.toHaveAttribute('data-state', 'checking');
}
const plan = (page: Page) => page.locator('#canvas-svg');
/** No drawing yet whose plan as kept differed from the plan drawn whole. */
const same = async (page: Page, after: string) => expect(await plan(page).getAttribute('data-draw-mismatch'), after).toBeNull();
/** Where a shape's drawn circle is (px, as drawn). */
const drawnAt = (page: Page, id: string) => page.evaluate((i) => {
  const c = document.querySelector(`#canvas-svg [data-shape-group="${i}"] > circle[data-shape-id]`)!;
  return [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))];
}, id);

test('the plan drawn by what changed is the plan drawn whole, through the usual things done to it; a tap that selects keeps the rest as it was', async ({ page, isMobile }) => {
  test.setTimeout(90_000);
  const shapes = yard();
  await openPlan(page, shapes);
  await same(page, 'opened');
  const groups = await page.locator('#canvas-svg [data-shape-group]').count();
  /** A tap by touch on a phone, a click on a computer. */
  const press = (x: number, y: number) => (isMobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const tap = async (x: number, y: number) => { const p = await planPoint(page, x, y); await press(p.x, p.y); };
  /** A shape's own outline, as drawn (a plant's circle, under its picture's rim). */
  const outline = (id: string) => page.locator(`#canvas-svg [data-shape-group="${id}"] > [data-shape-id]`).first();
  const tapShape = async (id: string) => { const b = (await outline(id).boundingBox())!; await press(b.x + b.width / 2, b.y + b.height / 2); };
  /** Drawn as selected: its edge dark. */
  const selected = (id: string) => expect(outline(id)).toHaveAttribute('stroke', '#0f172a');
  const kept = async () => Number(await plan(page).getAttribute('data-parts-kept'));

  // Selecting: a plant, another, the ground (none). Nearly every shape's group kept each time.
  await tapShape('c0');
  await selected('c0');
  await same(page, 'a plant selected');
  expect(await kept(), 'parts kept as they were').toBeGreaterThan(groups * 0.8);
  await tapShape('b4');
  await selected('b4');
  await expect(outline('c0')).not.toHaveAttribute('stroke', '#0f172a');
  await same(page, 'another selected');
  expect(await kept(), 'parts kept as they were').toBeGreaterThan(groups * 0.8);
  await tap(-10, 12);
  await expect(outline('b4')).not.toHaveAttribute('stroke', '#0f172a');
  await same(page, 'none selected');

  // A bed, the tree over a plant, then nothing: what shows through changes.
  await tap(-19, -7.5);
  await same(page, 'a bed selected');
  await tapShape('oak');
  await same(page, 'the tree selected');
  await tap(-10, 12);
  await same(page, 'none selected again');

  // A plant moved, undone, and moved again: after the undo, the plan's plants are copies, and a press on a kept drawing
  // moves the plant as the plan has it now.
  await tapShape('c2');
  await selected('c2');
  const before = await drawnAt(page, 'c2');
  const drag = async () => {
    const from = await planPoint(page, -9, -5), to = await planPoint(page, -9, -3);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
  };
  await drag();
  await expect.poll(() => drawnAt(page, 'c2')).not.toEqual(before);
  await same(page, 'a plant moved');
  const undo = page.locator('button.iconbtn[title=Undo]'), redo = page.locator('button.iconbtn[title=Redo]');
  await undo.click();
  await expect.poll(() => drawnAt(page, 'c2')).toEqual(before);
  await same(page, 'undone');
  await tap(-9, -5);
  await drag();
  await expect.poll(() => drawnAt(page, 'c2')).not.toEqual(before);
  await same(page, 'moved again, after the undo');
  await undo.click();
  await expect.poll(() => drawnAt(page, 'c2')).toEqual(before);
  if (await redo.isVisible()) { await redo.click(); await expect.poll(() => drawnAt(page, 'c2')).not.toEqual(before); }
  await same(page, 'undone and redone');

  // Names off and on, a zoom, the plant picker opened and closed.
  await page.getByTestId('toggle-names').click();
  await same(page, 'names off');
  await page.getByTestId('toggle-names').click();
  await same(page, 'names on');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await same(page, 'zoomed in');
  await page.locator('.tool-btn.plants').click();
  await expect(page.locator('.picker-sheet .plant-item').first()).toBeVisible();
  await same(page, 'the picker open');
  await page.keyboard.press('Escape');
  await expect(page.locator('.picker-sheet')).toHaveCount(0);
  await same(page, 'the picker closed');
});
