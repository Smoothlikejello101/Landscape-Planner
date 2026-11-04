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
