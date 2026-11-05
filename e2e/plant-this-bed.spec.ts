import { test, expect, type Page } from '@playwright/test';
import { addKind, openFresh, planPoint, shapeCount, tapping } from './helpers';

// Plant this bed (Jason, Nov 2: the proposal "Plant this bed" and his answers). A bed's chip opens the picker For it;
// the For row at the picker's top picks Anywhere, a bed, or one on the plan; the bed's conditions filter the list as a
// layer of their own; placing For a bed, the bed is outlined and a plant placed outside it ringed red.
// src/bed-plant.ts, src/ui/plant-for.ts, src/ui/bed-conditions.ts.

const base = { color: '#a16207', opacity: 0.65 };
/**
 * Front bed, 12 × 6 ft, under two sun areas: the front yard (7 h) and, wholly inside it, an oak's shade (3.5 h) over
 * its lower left; an unnamed bed behind it, 16 × 8 ft, with no sun area over it.
 */
const SHAPES = [
  { ...base, id: 'yard', type: 'rect', x: -10, y: -2, width: 40, height: 22, rotation: 0, label: 'Front yard', role: 'shade', color: '#fbbf24', sun: { mode: 'hours', hours: 7, periods: [], dappled: false, observedOn: '2026-06-14' } },
  { ...base, id: 'oak', type: 'circle', x: 2, y: 7, radius: 5, label: 'Under the oak', role: 'shade', color: '#64748b', sun: { mode: 'hours', hours: 3.5, periods: [], dappled: false } },
  { ...base, id: 'bed', type: 'rect', x: 0, y: 0, width: 12, height: 6, rotation: 0, label: 'Front bed', role: 'bed' },
  { ...base, id: 'back', type: 'rect', x: -2, y: -14, width: 16, height: 8, rotation: 0, label: '', role: 'bed' },
];
async function seed(page: Page, shapes: object[] = SHAPES, view = { x: -3, y: -16 }) {
  await page.addInitScript(([s, o]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes: s, zoom: 1, offsetX: o.x, offsetY: o.y }));
  }, [shapes, view] as const);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
}
/** A tap at a spot on the plan (feet). */
async function tapPlan(page: Page, x: number, y: number) {
  const p = await planPoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}
const picker = (page: Page) => page.getByTestId('picker');
/** The plan's plain ground, #ede0c8 (src/constants.ts BG_COLOR), as [r, g, b]. */
const GROUND = [0xed, 0xe0, 0xc8];
/** The average color in a 6 px square (CSS px) around a point of the plan (feet), as drawn: [r, g, b]. */
async function colorAt(page: Page, x: number, y: number): Promise<number[]> {
  const p = await planPoint(page, x, y);
  const png = await page.screenshot({ clip: { x: Math.round(p.x) - 3, y: Math.round(p.y) - 3, width: 6, height: 6 }, scale: 'css' });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
    return sum.map((v) => v / (d.length / 4));
  }, png.toString('base64'));
}
const forRow = (page: Page) => page.getByTestId('plant-for');
const pressed = (page: Page) => forRow(page).locator('[aria-pressed=true]');

test('a bed\'s chip says Plant this bed, in place of Another bed, and opens the picker For it', async ({ page }) => {
  await seed(page);
  await tapPlan(page, 9, 1.5); // (the Front bed, clear of the oak's shade)
  await expect(page.locator('.sel-pill .name')).toHaveText('Front bed');
  await expect(page.getByTestId('pill-place-more')).toHaveCount(0);
  await page.getByTestId('pill-plant-bed').click();
  await expect(picker(page)).toBeVisible();
  await expect(pressed(page)).toHaveText('Front bed');
  // (Anywhere, each bed by name, an unnamed one by its size, then Pick on the plan.)
  await expect(forRow(page).locator('button')).toHaveText(['Anywhere', 'Front bed', 'Bed, 16 × 8 ft', 'Pick on the plan']);
  // Anywhere, and back.
  await forRow(page).getByTestId('for-anywhere').click();
  await expect(pressed(page)).toHaveText('Anywhere');
  await expect(page.getByTestId('for-hint')).toContainText('Planting a bed? Pick it');
  await forRow(page).getByTestId('for-bed').first().click();
  await expect(pressed(page)).toHaveText('Front bed');
  await expect(page.getByTestId('for-hint')).toHaveCount(0);
});

test('the Plant button starts at Anywhere, or at the bed selected; Pick on the plan closes the list for a tap on a bed', async ({ page }) => {
  await seed(page);
  await page.locator('.tool-btn.plants').click();
  await expect(pressed(page)).toHaveText('Anywhere');
  await forRow(page).getByTestId('for-pick').click();
  await expect(picker(page)).toHaveCount(0);
  await expect(page.getByTestId('pick-bed-banner')).toHaveText(tapping('Tap the bed to plant for'));
  // Not a bed: said, and still picking.
  await tapPlan(page, 8, -3); // (between the beds)
  await expect(page.locator('#toast')).toContainText(tapping('That isn’t a bed'));
  await expect(page.getByTestId('pick-bed-banner')).toBeVisible();
  await tapPlan(page, 6, -10); // (the unnamed bed)
  await expect(picker(page)).toBeVisible();
  await expect(pressed(page)).toHaveText('Bed, 16 × 8 ft');
  // Cancel goes back as it was.
  await forRow(page).getByTestId('for-pick').click();
  await page.getByTestId('pick-bed-cancel').click();
  await expect(pressed(page)).toHaveText('Bed, 16 × 8 ft');
  // Closed, and opened again from the Plant button: Anywhere (the bed isn't selected).
  await page.locator('.picker-sheet .sheet-header button.iconbtn').last().click();
  await expect(picker(page)).toHaveCount(0);
  await page.locator('.tool-btn.plants').click();
  await expect(pressed(page)).toHaveText('Anywhere');
  await page.locator('.picker-sheet .sheet-header button.iconbtn').last().click();
  // A bed selected: the Plant button opens the picker For it (Jason's answer 9).
  await tapPlan(page, 9, 1.5);
  await expect(page.locator('.sel-pill .name')).toHaveText('Front bed');
  await page.locator('.tool-btn.plants').click();
  await expect(pressed(page)).toHaveText('Front bed');
});

test('a plan with no beds: For Anywhere, and how to get a bed; not in Which tree', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await expect(forRow(page)).toHaveText('For:Anywhere · Draw a bed to plant for it');
  // (Nothing to choose: it heads the list, folded away while a search is typed, as Recent is.)
  await expect(page.locator('.sheet-top [data-testid=plant-for]')).toHaveCount(0);
  await search(page).fill('aster');
  await expect(forRow(page)).toBeHidden();
  await page.getByTestId('clear-search').click();
  await expect(forRow(page)).toBeVisible();
  await page.locator('.picker-sheet .sheet-header button.iconbtn').last().click();
  await addKind(page, 'tree');
  await expect(picker(page)).toBeVisible();
  await expect(forRow(page)).toHaveCount(0);
});

/** The bed's panel (Edit on its chip), its Conditions section open. */
async function openConditions(page: Page, x: number, y: number) {
  await tapPlan(page, x, y);
  await page.locator('.sel-pill .edit').click();
  const head = page.locator('.sheet [data-section=conditions]');
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  return page.getByTestId('bed-conditions');
}

test('a bed\'s Conditions: its sun worked out from the sun areas over it; soil and moisture asked, each answered in place', async ({ page }) => {
  await seed(page);
  const c = await openConditions(page, 9, 1.5);
  await expect(c.getByTestId('cond-sun')).toContainText('3.5 to 7 h of direct sun');
  await expect(c.getByTestId('cond-sun')).toContainText('Part shade to full sun: the shade varies across the bed');
  await expect(c.getByTestId('cond-sun-from')).toHaveText('From the 2 sun areas over it: Under the oak, 3.5 h; Front yard, 7 h (seen Jun 14). All of the bed is covered.');
  await expect(c.getByTestId('cond-sun-asked')).toHaveCount(0); // (worked out, not asked)
  await expect(page.locator('.sheet [data-section=conditions] .prop-summary')).toHaveText('3.5 to 7 h sun');
  // (Answered in place: the bed's name, being typed, keeps its box, and so its keyboard.)
  const name = page.locator('.sheet .field', { hasText: 'Label' }).locator('input');
  await name.evaluate((e) => { (e as HTMLElement).dataset.kept = '1'; });
  await c.getByTestId('cond-soil-clay').click();
  await c.getByTestId('cond-moisture-average').click();
  await expect(c.getByTestId('cond-soil-clay')).toHaveAttribute('aria-pressed', 'true');
  await expect(name).toHaveAttribute('data-kept', '1');
  await expect(c.getByTestId('cond-moisture-says')).toHaveText('Average hides plants with high water needs, and those that need wet soil or standing water.');
  await expect(c.getByTestId('conditions-sum')).toHaveText('When you plant this bed, the picker lists only plants that fit: Takes part shade to full sun · Clay OK · Water needs: low or moderate. Nothing is ranked.');
  await expect(page.locator('.sheet [data-section=conditions] .prop-summary')).toHaveText('3.5 to 7 h sun · Clay · Average');
  await c.getByTestId('cond-drip').check();
  await expect(c.getByTestId('cond-moisture-says')).toHaveText('Average and drip irrigated: any water need fits.');
  await expect(c.getByTestId('conditions-sum')).toHaveText('When you plant this bed, the picker lists only plants that fit: Takes part shade to full sun · Clay OK. Nothing is ranked.');
  // (Each answer an undo step of its own, named.)
  await page.locator('.sheet-header button.iconbtn').last().click();
  await expect(page.getByTestId('undo-says')).toHaveAttribute('title', 'Undo: set the conditions of Front bed');
  // Kept: open again, as answered.
  await page.locator('.sel-pill .edit').click();
  await expect(page.getByTestId('bed-conditions').getByTestId('cond-soil-clay')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('bed-conditions').getByTestId('cond-drip')).toBeChecked();
});

test('a bed no sun area touches is asked its sun, and Not sure is kept as an answer', async ({ page }) => {
  await seed(page);
  const c = await openConditions(page, 6, -10);
  await expect(c.getByTestId('cond-sun')).toHaveCount(0);
  await expect(c.getByTestId('cond-sun-asked')).toContainText('No sun area covers this bed');
  await c.getByTestId('cond-sun-most-Part').click();
  // (The same for a bed that doesn't vary, until its shadiest part is said.)
  await expect(c.getByTestId('cond-sun-least-Part')).toHaveAttribute('aria-pressed', 'true');
  await c.getByTestId('cond-sun-least-Shade').click();
  await expect(c.getByTestId('conditions-sum')).toContainText('Takes shade to part shade');
  await expect(page.locator('.sheet [data-section=conditions] .prop-summary')).toHaveText('Shade to part shade');
  await c.getByTestId('cond-soil-unsure').click();
  await c.getByTestId('cond-moisture-wet').click();
  await expect(c.getByTestId('conditions-sum')).toHaveText('When you plant this bed, the picker lists only plants that fit: Takes shade to part shade · Takes wet soil. Not sure leaves one out. Nothing is ranked.');
  await c.getByTestId('cond-sun-unsure').click();
  await expect(c.getByTestId('cond-sun-unsure')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sheet [data-section=conditions] .prop-summary')).toHaveText('Sun not sure · Soil not sure · Wet');
  // Plant this bed, from the section: the picker For it.
  await page.getByTestId('conditions-plant').click();
  await expect(pressed(page)).toHaveText('Bed, 16 × 8 ft');
});

/** The plan, its Front bed answered: clay, average moisture. */
const ANSWERED = SHAPES.map((s) => (s.id === 'bed' ? { ...s, conditions: { soil: 'clay', moisture: 'average' } } : s));
const chips = (page: Page) => page.getByTestId('bed-box').getByTestId('bed-cond');
const count = (page: Page) => page.getByTestId('picker-count');
const search = (page: Page) => page.getByTestId('plant-search');
const rowNamed = (page: Page, name: string) => page.locator('.picker-sheet .plant-item', { has: page.locator('.pname', { hasText: name }) }).first();

test('For a bed, its conditions filter the list as a layer of their own: the box, the count, "Set by", and the person\'s own filters untouched', async ({ page }) => {
  await seed(page, ANSWERED);
  // The person's own filters first, Anywhere: Shade, and Drought tolerant.
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('filters').click();
  await page.getByRole('combobox', { name: 'Sun' }).selectOption('Shade');
  await page.locator('.filter-check', { hasText: 'Drought tolerant' }).locator('input').check();
  const mine = page.getByTestId('active-filters').getByTestId('active-chip');
  await expect(mine).toHaveText(['Shade', 'Drought tolerant']);
  const anywhereCount = await count(page).innerText();
  // For Front bed: its box, its count; the person's own set aside, the bed's "Set by".
  await forRow(page).getByTestId('for-bed').first().click();
  await expect(page.getByTestId('bed-box')).toContainText('Front bed’s conditions');
  await expect(chips(page)).toHaveText(['Takes part shade to full sun', 'Clay OK', 'Water needs: low or moderate']);
  await expect(page.getByTestId('bed-box-note')).toHaveText('Sun from the 2 sun areas over it (3.5 to 7 h). Only plants whose facts fit are listed; nothing is ranked.');
  await expect(count(page)).toHaveText(tapping(' plants fit Front bed · Place a plant, then tap inside the bed; tap a plant for its details'));
  await expect(count(page)).toHaveText(/^[\d,]+ of [\d,]+ plants fit Front bed/);
  await expect(page.getByTestId('active-filters')).toBeHidden();
  await expect(page.getByTestId('filters')).toHaveText(/^Filters$/);
  await expect(page.getByRole('combobox', { name: 'Sun' })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Sun' }).locator('option:checked')).toHaveText('Set by Front bed');
  await expect(page.getByRole('combobox', { name: 'Water needs' }).locator('option:checked')).toHaveText('Set by Front bed');
  await expect(page.getByTestId('set-by-note')).toHaveText('Sun, Water needs, Drought tolerant, Takes wet soil and Clay OK are set by Front bed while you plant it. Yours are kept for Anywhere.');
  const drought = page.locator('.filter-check', { hasText: 'Drought tolerant' });
  await expect(drought.locator('input')).toBeDisabled();
  await expect(drought.locator('input')).not.toBeChecked(); // (the bed's: average, not dry)
  await expect(drought.getByTestId('set-by')).toHaveText('Set by Front bed');
  await expect(page.locator('.filter-check', { hasText: 'Clay OK' }).locator('input')).toBeChecked();
  // Hardy in zone and the rest still add to it.
  await expect(page.getByTestId('hardy-here')).toBeEnabled();
  // Back to Anywhere: the person's own filters as they were left.
  await forRow(page).getByTestId('for-anywhere').click();
  await expect(mine).toHaveText(['Shade', 'Drought tolerant']);
  await expect(page.getByRole('combobox', { name: 'Sun' })).toHaveValue('Shade');
  await expect(drought.locator('input')).toBeChecked();
  await expect(drought.locator('input')).toBeEnabled();
  await expect(count(page)).toHaveText(anywhereCount);
  await expect(page.getByTestId('set-by-note')).toBeHidden();
});

test('For a clay bed: what no source rates for clay is listed below a divider; a part taken off with × and put back; Edit and back', async ({ page }) => {
  await seed(page, ANSWERED);
  await tapPlan(page, 9, 1.5);
  await page.getByTestId('pill-plant-bed').click();
  await search(page).fill('Silverleaf hydrangea');
  await expect(page.getByTestId('no-clay-divider')).toContainText('No source we\'ve read says how these do in clay');
  await expect(page.locator('[data-testid=no-clay-divider] ~ .plant-item .pname', { hasText: 'Silverleaf hydrangea' })).toBeVisible();
  // A plant that takes only part of the bed's sun says where.
  await search(page).fill('Narrow-leaved coneflower');
  await expect(rowNamed(page, 'Narrow-Leaved Coneflower').getByTestId('sun-end')).toHaveText('Sunny end only');
  await search(page).fill('Climbing hydrangea');
  await expect(rowNamed(page, 'Climbing Hydrangea').getByTestId('sun-end')).toHaveText('Shady end only');
  // Nothing hidden silently: what the bed hid of a search, by name, and a way to see them.
  await search(page).fill('cardinal flower');
  await expect(page.getByTestId('hidden-by')).toHaveText('1 plant matches “cardinal flower”, hidden by Front bed: Moisture. Show them');
  await page.getByTestId('show-hidden').click();
  await expect(rowNamed(page, 'Cardinal flower')).toBeVisible();
  await expect(page.getByTestId('set-aside')).toContainText('Showing what Front bed\'s conditions hid for “cardinal flower” (Moisture)');
  await page.getByTestId('clear-search').click();
  // Clay taken off for now: no divider, and its chip to put back; the bed itself unchanged.
  await search(page).fill('Silverleaf hydrangea');
  await page.getByTestId('bed-box').getByRole('button', { name: 'Take off for now: Clay OK' }).click();
  await expect(page.getByTestId('no-clay-divider')).toHaveCount(0);
  await expect(page.getByTestId('bed-cond-off')).toHaveText('Clay OK');
  await expect(chips(page)).toHaveText(['Takes part shade to full sun', 'Water needs: low or moderate']);
  await page.getByTestId('bed-cond-off').click();
  await expect(page.getByTestId('no-clay-divider')).toBeVisible();
  // Edit: the bed's conditions as a sheet; back to the picker For it, the search as it was.
  await page.getByTestId('bed-edit').click();
  await expect(page.getByTestId('conditions-sheet')).toBeVisible();
  await expect(page.locator('.sheet-header .title')).toHaveText('Front bed: conditions');
  await page.getByTestId('cond-moisture-wet').click();
  await page.getByTestId('conditions-back').click();
  await expect(pressed(page)).toHaveText('Front bed');
  await expect(search(page)).toHaveValue('Silverleaf hydrangea');
  await expect(chips(page)).toHaveText(['Takes part shade to full sun', 'Clay OK', 'Takes wet soil']);
});

test('placing For a bed: the bed outlined, the rest dimmed; one placed outside it is placed, ringed red, with Undo', async ({ page }) => {
  await seed(page, ANSWERED);
  // (Inside the Front bed, clear of the oak's shade, as the plan rests.)
  const inBed = await colorAt(page, 10.5, 4.5);
  await tapPlan(page, 9, 1.5);
  await page.getByTestId('pill-plant-bed').click();
  // (The bed outlined on the plan while the picker is For it.)
  await expect(page.locator('#canvas-svg [data-role=bed-outline]')).toHaveAttribute('data-bed', 'bed');
  await search(page).fill('Arkansas bluestar');
  await rowNamed(page, 'Arkansas bluestar').getByTestId('plant-place').click();
  const banner = page.getByTestId('place-banner');
  await expect(banner).toHaveText(tapping('Tap to place Arkansas Bluestar in Front bed · 0 placed'));
  await expect(page.locator('#canvas-svg [data-role=bed-outline]')).toHaveCount(1);
  await expect(page.locator('#canvas-svg [data-role=bed-veil]')).toHaveCount(1);
  // Outside the bed, dimmed and not tinted (Jason, Nov 4, his note 2: a red wash over his reddish brown beds left only
  // the ring to tell the bed by): darker by about a third, its red, green and blue in the same proportions. Inside, as
  // it was: the bright, clear part of the plan.
  // (Plain ground in view, between grid lines: between the beds; on a phone, where the plan moved to show the bed, below
  // the yard.)
  const box = (await page.locator('#canvas-svg').boundingBox())!;
  let spot: [number, number] | null = null;
  for (const [x, y] of [[8.5, -3.5], [8.5, 23.5]] as [number, number][]) {
    const p = await planPoint(page, x, y);
    if (p.x > box.x + 20 && p.x < box.x + box.width - 20 && p.y > box.y + 20 && p.y < box.y + box.height - 20) { spot = [x, y]; break; }
  }
  expect(spot).not.toBeNull();
  const dimmed = await colorAt(page, ...spot!);
  expect(dimmed[0] + dimmed[1] + dimmed[2]).toBeLessThan(0.8 * (GROUND[0] + GROUND[1] + GROUND[2]));
  expect(Math.abs(dimmed[0] / dimmed[1] - GROUND[0] / GROUND[1])).toBeLessThan(0.02);
  expect(Math.abs(dimmed[1] / dimmed[2] - GROUND[1] / GROUND[2])).toBeLessThan(0.03);
  const bright = await colorAt(page, 10.5, 4.5);
  for (let k = 0; k < 3; k++) expect(Math.abs(bright[k] - inBed[k])).toBeLessThan(4);
  const shapes = await shapeCount(page);
  await tapPlan(page, 9, 2); // inside
  await expect(banner).toHaveText(tapping('Tap to place Arkansas Bluestar in Front bed · 1 placed'));
  await expect(page.locator('#canvas-svg [data-role=outside-bed]')).toHaveCount(0);
  await tapPlan(page, 8, 8); // outside (below it): placed all the same, ringed, said with Undo
  await expect.poll(() => shapeCount(page)).toBe(shapes + 2);
  await expect(banner).toHaveText('Placed outside Front bed · 2 placedUndo');
  await expect(page.locator('#canvas-svg [data-role=outside-bed]')).toHaveCount(1);
  await banner.getByTestId('place-outside-undo').click();
  await expect.poll(() => shapeCount(page)).toBe(shapes + 1);
  await expect(page.locator('#canvas-svg [data-role=outside-bed]')).toHaveCount(0);
  await expect(banner).toHaveText(tapping('Tap to place Arkansas Bluestar in Front bed · 1 placed'));
  await tapPlan(page, 8, 8); // (again at once, where the one undone was: placed)
  await tapPlan(page, 6, 2); // (another inside: the one outside stays ringed, the banner as before)
  await expect(page.locator('#canvas-svg [data-role=outside-bed]')).toHaveCount(1);
  await expect(banner).toHaveText(tapping('Tap to place Arkansas Bluestar in Front bed · 3 placed'));
  // Switching plants keeps it For the bed; a full-sun plant placed in the bed's shady end gets the sun badge.
  await page.getByTestId('place-switch').click();
  await expect(pressed(page)).toHaveText('Front bed');
  await search(page).fill('Narrow-leaved coneflower');
  await expect(rowNamed(page, 'Narrow-Leaved Coneflower').getByTestId('sun-end')).toHaveText('Sunny end only');
  await rowNamed(page, 'Narrow-leaved coneflower').getByTestId('plant-place').click();
  await tapPlan(page, 2, 4.5); // (in the bed, under the oak: 3.5 h)
  await expect.poll(() => shapeCount(page)).toBe(shapes + 4);
  await expect(page.locator('#canvas-svg [data-role=sun-warning]')).toHaveCount(1);
  // Done: For the bed no more, the outline, veil and rings gone.
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('#canvas-svg [data-role=bed-outline]')).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=bed-veil]')).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=outside-bed]')).toHaveCount(0);
  await page.locator('.tool-btn.plants').click();
  await expect(pressed(page)).toHaveText('Anywhere');
});
