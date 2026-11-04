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
