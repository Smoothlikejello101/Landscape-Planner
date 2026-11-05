import { test, expect, type Page } from '@playwright/test';
import { openFresh, shapeCount, tapFromCenter, zoomPct } from './helpers';

// Plants drawn as pictures (src/looks.ts; Jason, Oct 27–29: R5c, every plant in bloom), or as plain circles from
// Layers, on this device.

test('a placed plant is drawn as a picture in bloom; Layers turns pictures off on this device, and back on', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Buttonbush');
  await page.locator('.sheet .proj-row', { hasText: 'Buttonbush' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  const look = page.locator('#canvas-svg [data-role=plant-look]');
  await expect(look).toHaveCount(1);
  // (Its blooms, in its first flower color: white.)
  await expect(look.locator('[fill="#f7f4ec"]').first()).toBeAttached();
  await page.locator('button[title=Layers]').click();
  const sw = page.getByTestId('plant-looks');
  await expect(sw).toBeChecked();
  await sw.uncheck();
  await expect(look).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#canvas-svg [data-shape-group]')).toHaveCount(1);
  await expect(look).toHaveCount(0);
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('plant-looks').check();
  await expect(look).toHaveCount(1);
});

test("a color picked for a plant draws its picture's leaves, and Default color brings back its own colors", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Buttonbush');
  await page.locator('.sheet .proj-row', { hasText: 'Buttonbush' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await tapFromCenter(page, 0, 0);
  await page.locator('.sel-pill button.edit').click();
  const look = page.locator('#canvas-svg [data-role=plant-look]');
  // (Its own colors: green leaves, no Default color to go back to.)
  await expect(look.locator('[fill="#6f9a4a"]').first()).toBeAttached();
  await expect(page.getByTestId('default-color')).toHaveCount(0);
  await page.locator('[data-section=look]').click();
  // (Its leaf color behind a link: Jason, Oct 30, Look demoted for plants drawn as pictures; no opacity there.)
  await expect(page.locator('.sheet .field', { hasText: 'Opacity' })).toHaveCount(0);
  await page.getByTestId('leaf-color-toggle').click();
  await page.locator('.sheet .swatches .swatch').nth(8).click(); // #ef4444
  await expect(look.locator('[fill="#ef4444"]').first()).toBeAttached();
  await expect(look.locator('[fill="#f7f4ec"]').first()).toBeAttached(); // (its blooms keep their color)
  await page.getByTestId('default-color').click();
  await expect(look.locator('[fill="#ef4444"]')).toHaveCount(0);
  await expect(look.locator('[fill="#6f9a4a"]').first()).toBeAttached();
  await expect(page.getByTestId('default-color')).toHaveCount(0);
});

test('a plant under a shorter, solid one: a pin and its name over it, outlined while that one is selected; a press near its middle picks it (Jason, Oct 30)', async ({ page }) => {
  await openFresh(page);
  const place = async (name: string, dx: number) => {
    await page.locator('.tool-btn.plants').click();
    await page.getByTestId('plant-search').fill(name);
    await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
    await tapFromCenter(page, dx, 0);
    await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
    await page.keyboard.press('Escape');
  };
  await place('Creeping phlox', 0);
  await place('Mountain mint', 0.5); // (3½ ft: solid, under the canopy height; its middle over the phlox's)
  await expect(page.locator('#canvas-svg [data-see-through=true]')).toHaveCount(0);
  const over = page.locator('#canvas-svg g[data-role=hidden-over]');
  await expect(over.locator('[data-role=hidden-rim][data-mark=pin]')).toHaveCount(1);
  await expect(over.locator('text')).toContainText('Creeping Phlox');
  await page.waitForTimeout(450); // (not a double tap)
  await tapFromCenter(page, 0, 0);
  await expect(page.locator('.sel-pill .name')).toHaveText('Creeping Phlox');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  await tapFromCenter(page, 1.5, 0);
  await expect(page.locator('.sel-pill .name')).toHaveText('Mountain Mint');
  // (The mint selected: the phlox under it outlined, to see how far it reaches.)
  await expect(over.locator('[data-role=hidden-rim][data-mark=outline]')).toHaveCount(1);
});

test("a hidden plant's pin shrinks as the plan zooms out and goes below 85%, and goes with the names hidden; zoomed back in, it's back (Jason, Oct 31 and Nov 1)", async ({ page }) => {
  await openFresh(page);
  const place = async (name: string, dx: number) => {
    await page.locator('.tool-btn.plants').click();
    await page.getByTestId('plant-search').fill(name);
    await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
    await tapFromCenter(page, dx, 0);
    await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
    await page.keyboard.press('Escape');
  };
  await place('Creeping phlox', 0);
  await place('Mountain mint', 0.5);
  const pins = page.locator('#canvas-svg g[data-role=hidden-over] [data-role=hidden-rim][data-mark=pin]');
  const zoomIn = page.getByRole('button', { name: 'Zoom in' }), zoomOut = page.getByRole('button', { name: 'Zoom out' });
  // (Full size from 125% in.)
  for (let i = 0; i < 20 && (await zoomPct(page)) < 125; i++) await zoomIn.click();
  await expect(pins).toHaveCount(1);
  const radius = async () => Number(await pins.locator('circle').first().getAttribute('r'));
  let last = await radius();
  expect(last).toBe(4.5);
  // (Smaller with each step out, until the plan's below 85%: then none.)
  let lastZoom = await zoomPct(page);
  for (let i = 0; i < 20; i++) {
    await zoomOut.click();
    if (!(await pins.count())) break;
    lastZoom = await zoomPct(page);
    const r = await radius();
    expect(r).toBeLessThanOrEqual(last);
    last = r;
  }
  expect(last).toBeLessThan(4.5); // (smaller before it went)
  expect(lastZoom).toBeGreaterThanOrEqual(85); // (the last with a pin)
  expect(await zoomPct(page)).toBeLessThan(85);
  await expect(pins).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=pin-hit]')).toHaveCount(0);
  for (let i = 0; i < 20 && (await zoomPct(page)) < 100; i++) await zoomIn.click();
  await expect(pins).toHaveCount(1);
  // Names and badges hidden: no pins, as no names; shown again, they're back.
  await page.getByRole('button', { name: 'Hide names and badges' }).click();
  await expect(pins).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=pin-hit]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide names and badges' }).click();
  await expect(pins).toHaveCount(1);
});

test('the tallest plant is drawn on top, see-through as a canopy over a plant growing under it (Jason, Oct 30)', async ({ page }) => {
  await openFresh(page);
  const place = async (name: string, dx: number) => {
    await page.locator('.tool-btn.plants').click();
    await page.getByTestId('plant-search').fill(name);
    await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
    await tapFromCenter(page, dx, 0);
    await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  };
  await place('Creeping phlox', 0); // (placed first, then the shrub over it: the shrub still on top)
  await page.keyboard.press('Escape');
  await place('Buttonbush', 1);
  const groups = page.locator('#canvas-svg [data-shape-group]');
  const names = await groups.evaluateAll((gs) => gs.map((g) => g.querySelector('text')?.textContent ?? ''));
  expect(names.findIndex((n) => /Buttonbush/.test(n))).toBeGreaterThan(names.findIndex((n) => /phlox/i.test(n)));
  await expect(page.locator('#canvas-svg [data-role=plant-look][data-see-through=true]')).toHaveCount(1);
  // A tap on the phlox, through the shrub, picks the phlox; elsewhere on the shrub, the shrub.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450); // (not a double tap)
  await tapFromCenter(page, 0, 0);
  await expect(page.locator('.sel-pill .name')).toHaveText('Creeping Phlox');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  await tapFromCenter(page, 3, 0);
  await expect(page.locator('.sel-pill .name')).toHaveText('Buttonbush');
});

test('a run of the same small plant is named once, at its middle (Jason, Oct 30: a column of "Creeping liriope")', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Creeping phlox');
  await page.locator('.sheet .proj-row', { hasText: 'Creeping phlox' }).first().locator('[data-testid=plant-place]').click();
  for (let i = 0; i < 6; i++) await tapFromCenter(page, -4 + i, 0); // (1 ft apart, on the snap steps)
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await page.keyboard.press('Escape');
  const labels = page.locator('#canvas-svg [data-role=plant-label]');
  await expect(labels.filter({ hasText: 'Creeping phlox' })).toHaveCount(1);
  await expect(labels.filter({ hasText: 'Creeping Phlox' })).toHaveText('Creeping Phlox ×6');
});

// A plan put in place before the app opens: its shapes, at a zoom and view (as e2e/badges.spec.ts does).
const base = { color: '#16a34a', opacity: 0.65, locked: false };
const plant = (id: string, plantId: string, label: string, x: number, y: number, radius: number) => ({ ...base, id, type: 'circle', role: 'plant', plantId, label, x, y, radius });
async function openPlan(page: Page, shapes: object[], view: { zoom: number; offsetX: number; offsetY: number }) {
  await page.addInitScript(([shapes, view]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes, ...view }));
  }, [shapes, view] as const);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
  // (The catalog in, and the plan drawn again with it: as e2e/badges.spec.ts waits.)
  await expect(page.getByTestId('warnings-btn')).not.toHaveAttribute('data-state', 'checking');
}
const ROW = [1, 2.5, 4, 5.5, 7].map((x, i) => plant(`c${i + 1}`, 'lobelia-cardinalis', 'Cardinal flower', x, 0, 0.75));

test("a run's name is never under the plants beside it: drawn over every plant, and kept off a taller one (Jason, Nov 4)", async ({ page }) => {
  // (A buttonbush, taller, just below the row and right of its middle: drawn after the cardinal flowers, it covered
  // their name.)
  await openPlan(page, [...ROW, plant('bb', 'cephalanthus-occidentalis', 'Buttonbush', 6.5, 1.6, 2)], { zoom: 1, offsetX: -4, offsetY: -6 });
  const name = page.locator('#canvas-svg [data-role=plant-label]', { hasText: 'Cardinal flower ×5' });
  await expect(name).toHaveCount(1);
  // Over every plant: in the names' group after them all.
  await expect(page.locator('#canvas-svg g[data-role=plant-names] [data-role=plant-label]', { hasText: 'Cardinal flower ×5' })).toHaveCount(1);
  // Off the buttonbush (all but its rim), on the row nearer its other end. (Measured once both are there: the plan is
  // drawn again as the catalog comes in.)
  await expect.poll(async () => {
    const label = await name.boundingBox(), bush = await page.locator('#canvas-svg [data-shape-id=bb]').boundingBox();
    if (!label || !bush) return -1;
    const c = { x: bush.x + bush.width / 2, y: bush.y + bush.height / 2 }, r = bush.width / 2;
    const nx = Math.max(label.x, Math.min(label.x + label.width, c.x)), ny = Math.max(label.y, Math.min(label.y + label.height, c.y));
    return Math.hypot(nx - c.x, ny - c.y) / r; // (its share of the bush's radius from its middle)
  }).toBeGreaterThanOrEqual(0.85);
});

test("zoomed out past 20%, plants' names and runs' names aren't drawn, but a selected plant's is; a bed keeps its name (Jason, Nov 4)", async ({ page }) => {
  const bed = { ...base, id: 'bed', type: 'rect', role: 'bed', label: 'Front bed', x: -10, y: -10, width: 40, height: 20, rotation: 0, color: '#a16207' };
  const oak = plant('oak', 'quercus-alba', 'White oak', 60, 0, 30);
  await openPlan(page, [bed, ...ROW, plant('bb', 'cephalanthus-occidentalis', 'Buttonbush', 12, 0, 4), oak], { zoom: 0.15, offsetX: -40, offsetY: -60 });
  const names = page.locator('#canvas-svg [data-role=plant-label]');
  await expect(page.locator('#canvas-svg text', { hasText: 'Front bed' })).toHaveCount(1);
  await expect(names).toHaveCount(0); // (the oak's would fit inside it; none, all the same)
  // A plant tapped: its name shows.
  const bush = (await page.locator('#canvas-svg [data-shape-id=bb]').boundingBox())!;
  await page.mouse.click(bush.x + bush.width / 2, bush.y + bush.height / 2);
  await expect(page.locator('.sel-pill .name')).toHaveText('Buttonbush');
  await expect(page.locator('#canvas-svg text', { hasText: 'Buttonbush' })).toHaveCount(1);
  await expect(names.filter({ hasText: 'Cardinal flower' })).toHaveCount(0);
  // Zoomed in to 20% and past: back.
  await page.keyboard.press('Escape');
  for (let i = 0; i < 3 && (await zoomPct(page)) < 20; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(await zoomPct(page)).toBeGreaterThanOrEqual(20);
  await expect(page.locator('#canvas-svg text', { hasText: 'White oak' })).toHaveCount(1);
});
