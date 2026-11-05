import { test, expect, type Page } from '@playwright/test';
import { planPoint, shapeCount } from './helpers';
import type { BgImage, CircleShape, PolyShape, RectShape, Shape } from '../src/types';

// Rescale with the photo (Jason's answers to the design, Nov 2): its scale set again over a plan drawn on it, the app
// asks whether the plan was drawn over the photo, the plan shown as Move would leave it; and when the photo's dragged,
// whether to move the plan with it. src/ui/rescale-card.ts, its rules src/rescale.ts (tests/rescale.test.ts).
// A plan seeded like the design's example: a photo whose first scale was 8% small, traced at it. SHOTS_DIR, if set:
// where to save pictures of the card, its list, the plan moved, and the question after a drag (a phone, 412 px wide).

/** The design's example yard as the photo shows it: 1040 × 880 px, a tenth of a foot each (104 × 88 ft). */
const PHOTO = 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="880" viewBox="0 0 1040 880">
<rect width="1040" height="880" fill="#6f8f3f"/><rect x="20" y="40" width="1000" height="840" fill="#7d9c48"/>
<path d="M0 860h1040v20H0z" fill="#9b958c"/>
<rect x="720" y="380" width="120" height="500" fill="#c9c2b6"/>
<rect x="280" y="300" width="400" height="280" fill="#7a6f66"/><path d="M280 440h400" stroke="#5d544d" stroke-width="6"/>
<circle cx="180" cy="700" r="90" fill="#2f5d2a"/><circle cx="160" cy="680" r="40" fill="#3d7034"/>
<path d="M80 80h880" stroke="#8b6b43" stroke-width="6"/>
<rect x="420" y="660" width="100" height="120" fill="#8a6a3d" opacity="0.5"/>
</svg>`).toString('base64');
const K = 104 / 96;
const old = (v: number) => v / K;
const base = { color: '#57534e', opacity: 0.6, locked: false };
const rect = (id: string, x: number, y: number, width: number, height: number, extra: object) => ({ ...base, id, type: 'rect', x, y, width, height, rotation: 0, ...extra });
/** The example yard, as traced at the photo's first scale (see tests/rescale.test.ts). */
const YARD = [
  { ...base, id: 'lot', type: 'poly', x: -50, y: old(2) - 42, points: [[0, 0], [100, 0], [100, 84], [0, 84]], rotation: 0, color: '#44403c', opacity: 1,
    role: 'boundary', kind: 'property', status: 'existing', label: 'Lot line', measured: [{ side: 0, ft: 100 }, { side: 1, ft: 84 }, { side: 2, ft: 100 }, { side: 3, ft: 84 }] },
  { ...base, id: 'fence', type: 'line', x: old(-44), y: old(-36), points: [[0, 0], [old(88), 0]], rotation: 0, color: '#78350f', opacity: 1, role: 'boundary', kind: 'fence', status: 'existing', label: 'Fence' },
  rect('house', old(-24), old(-14), old(40), old(28), { role: 'building', kind: 'building', status: 'existing', label: 'House', opacity: 0.8 }),
  rect('drive', old(20), old(-6), old(12), old(48), { role: 'path', kind: 'driveway', status: 'existing', label: 'Driveway', color: '#a8a29e', opacity: 0.7 }),
  rect('back-bed', old(-24), old(-14) - 5, old(40), 5, { role: 'bed', kind: 'bed', status: 'planned', label: 'Back bed', color: '#92400e', opacity: 0.3 }),
  ...Array.from({ length: 7 }, (_, i) => ({ ...base, id: `p${i}`, type: 'circle', x: old(-24) + (i + 0.5) * old(40) / 7, y: old(-14) - 2.5, radius: 1.25, color: '#16a34a', opacity: 0.65, role: 'plant', status: 'planned', label: 'Plant' })),
  rect('side-bed', old(16), old(-4), old(4), 12, { role: 'bed', kind: 'bed', status: 'planned', label: 'Side bed', color: '#92400e', opacity: 0.3 }),
  { ...base, id: 'shrub', type: 'circle', x: old(10), y: old(14) + 6, radius: 2, color: '#15803d', opacity: 0.65, role: 'plant', status: 'planned', label: 'Shrub' },
  rect('island', old(-12), old(22), 10, 12, { role: 'bed', kind: 'bed', status: 'planned', label: 'Island bed', color: '#92400e', opacity: 0.3 }),
  rect('fence-bed', old(-30), old(-36), old(40), 3, { role: 'bed', kind: 'bed', status: 'planned', label: 'Fence bed', color: '#92400e', opacity: 0.3 }),
  { ...base, id: 'oak', type: 'circle', x: old(-34), y: old(26), radius: old(9), color: '#166534', opacity: 0.5, role: 'plant', tree: true, sizeFrom: 'manual', status: 'existing', label: 'Oak' },
];
const PLACED = { dataUrl: PHOTO, naturalWidth: 1040, naturalHeight: 880, ftPerPx: 96 / 1040, cx: 0, cy: 0, rotation: 0, opacity: 0.75, visible: true };

async function seed(page: Page, shapes: object[] = YARD, photo: object = PLACED) {
  await page.addInitScript(([s, bg]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes: s, bgImage: bg, zoom: 0.2, offsetX: -60, offsetY: -60 }));
  }, [shapes, photo] as const);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
  await page.getByTestId('zoom-fit').click();
}
/** The open plan as stored (its save waited for): shapes and the photo's placement. */
const stored = (page: Page) => page.evaluate(() => new Promise<{ shapes: Shape[]; bgImage: BgImage | null }>((resolve) => {
  const open = indexedDB.open('landscape-planner');
  open.onsuccess = () => {
    const db = open.result;
    const cur = db.transaction('kv').objectStore('kv').get('current');
    cur.onsuccess = () => {
      const p = db.transaction('projects').objectStore('projects').get(cur.result as string);
      p.onsuccess = () => { const r = p.result as { shapes?: Shape[]; bgImage?: BgImage } | undefined; resolve({ shapes: r?.shapes ?? [], bgImage: r?.bgImage ?? null }); db.close(); };
    };
  };
}));
const storedShape = async <T extends Shape>(page: Page, id: string) => (await stored(page)).shapes.find((s) => s.id === id) as T;
const scaleNow = async (page: Page) => (await stored(page)).bgImage?.ftPerPx ?? 0;
const saved = (page: Page) => expect(page.locator('.project-btn')).not.toContainText('Saving');
const shot = async (page: Page, name: string) => {
  const dir = process.env.SHOTS_DIR;
  if (dir && test.info().project.name === 'phone') await page.screenshot({ path: `${dir}/${name}.png` });
};
const card = (page: Page) => page.getByTestId('rescale-card');
/** The zoom the plan is drawn at (src/canvas.ts redrawCanvas: exact, as the readout isn't). */
const drawnZoom = async (page: Page) => Number((await page.locator('#canvas-svg').getAttribute('data-view'))!.split(' ')[2]);
/** How wide a shape is drawn (feet), at the view drawn: its box less its outline's stroke. */
async function drawnWidth(page: Page, id: string) {
  const b = (await page.locator(`#canvas-svg [data-shape-id="${id}"]`).first().boundingBox())!;
  return (b.width - 1) / (24 * (await drawnZoom(page)));
}
/** The plan as stored, -0 and 0 alike (as a save leaves them). */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * The photo's scale set again from the house's front, its true 40 ft: A and B tapped at its corners as the photo shows
 * them (image pixels 280 and 680 across, 580 down). `rough`: said to be a rough guess. The scale it came to (ft a px).
 */
async function setScale(page: Page, ft = 40, opts: { rough?: boolean; start?: boolean } = {}) {
  if (opts.start !== false) {
    await page.locator('button[title=More]').click();
    await page.locator('.menu-item', { hasText: 'Background image' }).click();
    await page.locator('.sheet button', { hasText: 'Calibrate scale' }).click();
  }
  await expect(page.locator('.mode-banner')).toContainText('first known point');
  const bg = (await stored(page)).bgImage!;
  const at = (px: number, py: number) => planPoint(page, bg.cx + (px - 520) * bg.ftPerPx, bg.cy + (py - 440) * bg.ftPerPx);
  const a = await at(280, 580);
  await page.mouse.click(a.x, a.y);
  await expect(page.locator('.mode-banner')).toContainText('second known point');
  const b = await at(680, 580);
  await page.mouse.click(b.x, b.y);
  await page.getByTestId('scale-distance').fill(String(ft));
  if (opts.rough) await page.getByTestId('scale-rough').check();
  await page.getByTestId('scale-set').click();
  await saved(page);
}

test('the scale set again over a traced plan: the card shows the plan moved, dashed where it was; Move it is one step, the plan fitted, with Undo; a second Undo takes the scale back', async ({ page }) => {
  await seed(page);
  const before = await stored(page);
  await setScale(page);
  const k = (await scaleNow(page)) / (96 / 1040);
  expect(k).toBeGreaterThan(1.06); expect(k).toBeLessThan(1.11); // (40 ft from taps on a phone's plan: within a pixel or two)
  const c = card(page);
  await expect(c).toBeVisible();
  await expect(c).toContainText('Was your plan drawn over the photo?');
  await expect(c).toContainText(`The photo is ${Math.round((k - 1) * 100)}% larger at its new scale. If you traced it over the photo, it can move with it.`);
  await expect(page.locator('.sheet')).toHaveCount(0); // (the plan, not the background sheet)
  await expect(page.getByTestId('rescale-view')).toHaveText('Shown moved with it. Dashed lines: where things are now.');
  await expect(page.getByTestId('rescale-show-moved')).toHaveAttribute('aria-pressed', 'true');
  // The plan above shows what Move would do: the house at its new size; dashed outlines where things are now.
  expect(await drawnWidth(page, 'house')).toBeCloseTo(old(40) * k, 0);
  await expect(page.locator('#canvas-svg [data-role=rescale-was] [data-was]')).toHaveCount(YARD.length); // (the lot line too: kept, its middle moves)
  // (The card clear of the plan's foot: the house shows above it.)
  const houseBox = (await page.locator('#canvas-svg [data-shape-id="house"]').first().boundingBox())!, cardBox = (await c.boundingBox())!;
  expect(houseBox.y + houseBox.height).toBeLessThan(cardBox.y);
  await expect(page.getByTestId('rescale-list-said')).toHaveText('5 things already there · 1 kept as measured');
  await expect(page.getByTestId('rescale-list')).toBeHidden();
  // The plan behind it only pans and zooms: a tap on the house picks nothing.
  const h = await planPoint(page, 0, 0);
  await page.mouse.click(h.x, h.y);
  await expect(page.locator('.sel-pill')).toHaveCount(0);
  await expect(c).toBeVisible();
  await shot(page, '1-card-with-preview');
  await page.getByTestId('rescale-list-open').click();
  await expect(page.getByTestId('rescale-list')).toBeVisible();
  await shot(page, '2-tick-list-open');

  await page.getByTestId('rescale-move').click();
  await expect(c).toHaveCount(0);
  await expect(page.getByTestId('plan-moved')).toContainText('Moved the plan with the photo.');
  await saved(page);
  const house = await storedShape<RectShape>(page, 'house'), bed = await storedShape<RectShape>(page, 'back-bed');
  expect(house.width).toBeCloseTo(old(40) * k, 2);
  expect(house.x).toBeCloseTo(old(-24) * k, 2);
  expect(bed.height).toBe(5); // (against the house at its depth, the house's length)
  expect(bed.y + bed.height).toBeCloseTo(house.y, 2);
  expect(bed.width).toBeCloseTo(house.width, 2);
  expect((await storedShape<CircleShape>(page, 'p0')).radius).toBe(1.25);
  expect((await storedShape<PolyShape>(page, 'lot')).points).toEqual(before.shapes.find((s) => s.id === 'lot')!.type === 'poly' ? (before.shapes.find((s) => s.id === 'lot') as PolyShape).points : null);
  // The plan fitted on screen: the lot line, the largest, all in view.
  const lot = (await page.locator('#canvas-svg [data-shape-id="lot"]').first().boundingBox())!, plan = (await page.locator('#canvas-svg').boundingBox())!;
  expect(lot.x).toBeGreaterThanOrEqual(plan.x - 1); expect(lot.x + lot.width).toBeLessThanOrEqual(plan.x + plan.width + 1);
  await shot(page, '3-moved-with-notice');

  // One Undo: the plan back, the photo at its new scale. A second: the scale back too.
  await page.locator('button[title=Undo]').click();
  await saved(page);
  expect((await storedShape<RectShape>(page, 'house')).width).toBeCloseTo(old(40), 3);
  expect(await scaleNow(page)).toBeCloseTo(k * 96 / 1040, 6);
  await expect(card(page)).toHaveCount(0); // (not asked again)
  await page.locator('button[title=Undo]').click();
  await saved(page);
  expect(await scaleNow(page)).toBeCloseTo(96 / 1040, 8);
  expect(plain((await stored(page)).shapes)).toEqual(plain(before.shapes));
});

test('As it was shows the plan unmoved; a tick changed redraws only the plan; a typed side starts unticked; Move keeps what\'s unticked as measured', async ({ page }) => {
  await seed(page);
  await setScale(page);
  const k = (await scaleNow(page)) / (96 / 1040);
  const c = card(page);
  await expect(c).toBeVisible();
  await page.getByTestId('rescale-as-was').click();
  await expect(page.getByTestId('rescale-as-was')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('rescale-view')).toHaveText('Shown as it is now, not moved.');
  expect(await drawnWidth(page, 'house')).toBeCloseTo(old(40), 0);
  await expect(page.locator('#canvas-svg [data-role=rescale-was]')).toHaveCount(0);
  await page.getByTestId('rescale-show-moved').click();
  expect(await drawnWidth(page, 'house')).toBeCloseTo(old(40) * k, 0);

  // The list: the lot line typed from a survey, unticked, saying so; the rest ticked.
  await page.getByTestId('rescale-list-open').click();
  const row = (id: string) => page.locator(`[data-tick-of="${id}"]`);
  await expect(page.getByTestId('rescale-list').locator('label')).toHaveText(['Lot line · typed as 100 ft and 84 ft', 'Fence', 'House', 'Driveway', 'Oak']);
  await expect(row('lot').locator('input')).not.toBeChecked();
  for (const id of ['fence', 'house', 'drive', 'oak']) await expect(row(id).locator('input')).toBeChecked();
  // The house unticked: kept as it was drawn, its middle where it was over the photo; the card not drawn again.
  await c.evaluate((e) => { (e as HTMLElement & { mark?: number }).mark = 1; });
  await row('house').locator('input').uncheck();
  await expect(page.getByTestId('rescale-list-said')).toHaveText('5 things already there · 2 kept as measured');
  expect(await drawnWidth(page, 'house')).toBeCloseTo(old(40), 0);
  expect(await c.evaluate((e) => (e as HTMLElement & { mark?: number }).mark)).toBe(1);
  await page.getByTestId('rescale-move').click();
  await saved(page);
  const house = await storedShape<RectShape>(page, 'house');
  expect(house.width).toBeCloseTo(old(40), 6); expect(house.height).toBeCloseTo(old(28), 6);
  expect(house.x + house.width / 2).toBeCloseTo(old(-4) * k, 2); // (its middle, 4 ft left of the photo's, where it was over it)
  const lot = await storedShape<PolyShape>(page, 'lot');
  expect(lot.points).toEqual([[0, 0], [100, 0], [100, 84], [0, 84]]);
  expect(lot.measured).toEqual([{ side: 0, ft: 100 }, { side: 1, ft: 84 }, { side: 2, ft: 100 }, { side: 3, ft: 84 }]); // (still typed)
  // The driveway, ticked, followed.
  expect((await storedShape<RectShape>(page, 'drive')).width).toBeCloseTo(old(12) * k, 2);
});

test('on a photo\'s first scale, a rough one too: the card comes first, "Now trace" after; Leave the plan and its ✕ change nothing', async ({ page }) => {
  const shapes = YARD.filter((s) => ['house', 'back-bed', 'p0', 'p1'].includes(s.id));
  await seed(page, shapes, { ...PLACED, uncalibrated: true });
  const before = (await stored(page)).shapes;
  await page.getByTestId('calibrate-notice').getByRole('button', { name: 'Calibrate' }).click();
  await setScale(page, 40, { rough: true, start: false });
  await expect(card(page)).toBeVisible();
  await expect(page.getByTestId('trace-card')).toHaveCount(0);
  await expect(page.getByTestId('rescale-list-said')).toHaveText('1 thing already there · all follow the photo');
  await page.getByTestId('rescale-leave').click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByTestId('trace-card')).toBeVisible(); // (next: trace the rest)
  await saved(page);
  expect(plain((await stored(page)).shapes)).toEqual(plain(before));
  expect((await stored(page)).bgImage?.roughScale).toBe(true);

  // Set again, from a guess 10% longer: asked again. Set again before it's answered, 20% longer: asked about the whole
  // change since the plan was drawn, not the step between (9%). Its ✕ leaves the plan too.
  await setScale(page, 44);
  await expect(card(page)).toContainText(/The photo is (9|10|11)% larger/);
  await setScale(page, 48);
  await expect(card(page)).toContainText(/The photo is (19|20|21)% larger/);
  await page.getByTestId('rescale-close').click();
  await expect(card(page)).toHaveCount(0);
  await saved(page);
  expect(plain((await stored(page)).shapes)).toEqual(plain(before));
});

test('the photo dragged after tracing: asked whether to move the plan with it; Leave it changes nothing; Move it moves it just as far, one step', async ({ page }) => {
  await seed(page);
  const before = await stored(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Background image' }).click();
  await page.getByTestId('bg-edit').click();
  const ppf = 24 * (await drawnZoom(page));
  /** The photo dragged 6 ft right, from a spot on it. */
  const dragSix = async () => {
    const p = await planPoint(page, -40, -10);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 6 * ppf, p.y, { steps: 8 });
    await page.mouse.up();
  };
  await dragSix();
  const ask = page.getByTestId('photo-moved');
  await expect(ask).toContainText('Move the plan with the photo?');
  await expect(ask.getByRole('button', { name: 'Move it' })).toBeVisible();
  await shot(page, '4-photo-drag-question');
  await ask.getByRole('button', { name: 'Leave it' }).click();
  await expect(ask).toHaveCount(0);
  await saved(page);
  expect((await stored(page)).bgImage!.cx).toBeCloseTo(6, 0);
  expect(plain((await stored(page)).shapes)).toEqual(plain(before.shapes));

  // Again: Move it, by this drag's 6 ft (the first was left), the house and its bed's plants with it.
  await dragSix();
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Move it' }).click();
  await expect(page.getByTestId('plan-moved')).toContainText('Moved the plan with the photo.');
  await saved(page);
  const cx = (await stored(page)).bgImage!.cx;
  expect(cx).toBeCloseTo(12, 0);
  const was = (id: string) => before.shapes.find((s) => s.id === id)!;
  expect((await storedShape<RectShape>(page, 'house')).x).toBeCloseTo(was('house').x + cx - 6, 3);
  expect((await storedShape<CircleShape>(page, 'p3')).x).toBeCloseTo(was('p3').x + cx - 6, 3);
  expect((await storedShape<RectShape>(page, 'house')).width).toBe((was('house') as RectShape).width);
  // One step: Undo puts the plan back, the photo where it was dragged.
  await page.getByTestId('plan-moved').getByRole('button', { name: 'Undo' }).click();
  await saved(page);
  expect(plain((await stored(page)).shapes)).toEqual(plain(before.shapes));
  expect((await stored(page)).bgImage!.cx).toBeCloseTo(cx, 6);
});
