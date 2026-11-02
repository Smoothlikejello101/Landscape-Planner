import { test, expect, type Page } from '@playwright/test';
import { closeSheet, openWarnings, shapeCount } from './helpers';

// A fruit-partner warning dismissed for one plant alone, as hardiness and poison warnings are (Jason, Nov 1): the
// warnings bug hunt's bug 1, where "Just this one" brought the warning back, the plan keeping no fruit-partner
// dismissal copy by copy; and a plant's details' "Dismiss for this one". Kept with the plan (fruitDismissed).

const base = { color: '#16a34a', opacity: 0.65, locked: false };
const plant = (id: string, plantId: string, label: string, x: number, y: number) => ({ ...base, id, type: 'circle', role: 'plant', plantId, label, x, y, radius: 1 });
const HOLLY = "American holly 'Clarendon Spreading'";
const holly = (id: string, x: number, y = 0) => plant(id, 'ilex-opaca-clarendon-spreading', HOLLY, x, y);
const winterberry = plant('wr', 'ilex-verticillata-winter-red', "Winterberry 'Winter Red'", 40, 0);
/** A plan as an older version kept it (no fruitDismissed anywhere). */
async function openPlan(page: Page, shapes: object[]) {
  await page.addInitScript((shapes) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes, zoom: 1, offsetX: -20, offsetY: -20 }));
  }, shapes);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
  await expect(button(page)).not.toHaveAttribute('data-state', 'checking');
}
const button = (page: Page) => page.getByTestId('warnings-btn');
const head = (page: Page) => page.getByTestId('warnings-kind-head-fruit');
const rows = (page: Page) => page.getByTestId('warnings-kind-fruit').getByTestId('warning-row');
const hollyRows = (page: Page) => rows(page).filter({ hasText: HOLLY });
const notice = (page: Page) => page.getByTestId('dismiss-notice');
const wide = (page: Page) => page.viewportSize()!.width >= 900;
/** A plant's details, from the plan. */
async function details(page: Page, id: string) {
  await page.keyboard.press('Escape'); // (nothing selected: another's chip can't cover it)
  await page.getByTestId('zoom-fit').click();
  await page.locator(`#canvas-svg [data-shape-id=${id}]`).first().click();
  await page.locator('.sel-pill .edit').click();
}

test("the bug hunt's bug 1: Dismiss on a holly in Warnings, then Just this one: dismissed for this one, the count stays down, after a reload too", async ({ page }) => {
  await openPlan(page, [holly('h', 0), winterberry]);
  await expect(button(page)).toHaveAttribute('aria-label', 'Warnings: 2 to look at');
  await openWarnings(page, 'fruit');
  await expect(head(page)).toHaveAttribute('aria-label', 'Fruit partners, 2 to look at');
  await hollyRows(page).getByTestId('warning-dismiss').click();
  await expect(notice(page)).toContainText(`Fruit partner warning dismissed for ${HOLLY} in this plan, and any you add later.`);
  await expect(notice(page).getByRole('button')).toHaveText(['Just this one', 'Undo', 'OK', '✕']);
  await expect(hollyRows(page).getByTestId('warning-scope')).toHaveText(`Dismissed for every ${HOLLY} in this plan`);
  await expect(button(page)).toHaveAttribute('aria-label', 'Warnings: 1 to look at');
  // Just this one: still dismissed, for this one now (before, the warning came back, the count 13 → 14).
  await notice(page).getByRole('button', { name: 'Just this one' }).click();
  await expect(notice(page)).toHaveCount(0);
  await expect(hollyRows(page)).toHaveCount(1);
  await expect(hollyRows(page)).toHaveAttribute('data-dismissed', 'true');
  await expect(hollyRows(page).getByTestId('warning-scope')).toHaveText('Dismissed for this one');
  await expect(hollyRows(page).getByTestId('warning-again')).toBeVisible();
  await expect(head(page)).toHaveAttribute('aria-label', 'Fruit partners, 1 to look at, 1 dismissed');
  await expect(page.getByTestId('warnings-head')).toContainText('1 to look at · 1 dismissed');
  await expect(button(page)).toHaveAttribute('aria-label', 'Warnings: 1 to look at');
  // Kept: after a reload, the same.
  await page.reload();
  await expect.poll(() => shapeCount(page)).toBe(2);
  await expect(button(page)).toHaveAttribute('aria-label', 'Warnings: 1 to look at');
  await openWarnings(page, 'fruit');
  await expect(hollyRows(page)).toHaveAttribute('data-dismissed', 'true');
  await expect(hollyRows(page).getByTestId('warning-scope')).toHaveText('Dismissed for this one');
  // Shown again: active, and the count back up.
  await hollyRows(page).getByTestId('warning-again').click();
  await expect(hollyRows(page)).toHaveAttribute('data-dismissed', 'false');
  await expect(button(page)).toHaveAttribute('aria-label', 'Warnings: 2 to look at');
});

test("a plant's details: Dismiss for this one, as hardiness and poison have it; Undo; Show again for it alone; kept after a reload", async ({ page }) => {
  await openPlan(page, [holly('h', 0), holly('h2', 0, 20)]);
  await expect(button(page)).toHaveAttribute('aria-label', 'Warnings: 1 to look at'); // (one row for both)
  await details(page, 'h');
  const banner = page.getByTestId('fruit-check');
  await expect(banner).toContainText(`⚠ ${HOLLY} is a female`);
  await expect(banner.getByRole('button')).toHaveText(['Dismiss for this one', `Dismiss for every ${HOLLY}`]);
  await banner.getByTestId('fruit-dismiss-one').click();
  await expect(banner).toContainText('Dismissed for this one.');
  await expect(banner).toHaveClass(/muted/);
  await expect(banner.getByRole('button')).toHaveText(['Show again']);
  await expect(notice(page)).toHaveCount(0); // (no notice: only this one, as for hardiness and poison)
  await closeSheet(page);
  // In Warnings: the other one still to look at, this one apart.
  await openWarnings(page, 'fruit');
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toHaveAttribute('data-dismissed', 'false');
  await expect(rows(page).nth(0).getByTestId('warning-select')).toContainText(HOLLY);
  await expect(rows(page).nth(0).getByTestId('warning-select')).not.toContainText('×2');
  await expect(rows(page).nth(1)).toHaveAttribute('data-dismissed', 'true');
  await expect(rows(page).nth(1).getByTestId('warning-scope')).toHaveText('Dismissed for this one');
  if (!wide(page)) await closeSheet(page);
  // Undo at the top takes it back; Redo, again.
  await page.locator('button[title=Undo]').click();
  await openWarnings(page, 'fruit');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).getByTestId('warning-select')).toContainText(`${HOLLY} ×2`);
  if (!wide(page)) await closeSheet(page);
  await page.getByTestId('float-redo').click();
  await openWarnings(page, 'fruit');
  await expect(rows(page)).toHaveCount(2);
  // Kept: after a reload, its details say so, and Show again is for it alone.
  await page.reload();
  await expect.poll(() => shapeCount(page)).toBe(2);
  await details(page, 'h');
  await expect(banner).toContainText('Dismissed for this one.');
  await banner.getByTestId('fruit-dismiss').click();
  await expect(banner.getByRole('button')).toHaveText(['Dismiss for this one', `Dismiss for every ${HOLLY}`]);
  await closeSheet(page);
  await openWarnings(page, 'fruit');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toHaveAttribute('data-dismissed', 'false');
  if (!wide(page)) await closeSheet(page);
  // Dismiss for every holly, from its details, then Just these 2: both dismissed, each its own.
  await details(page, 'h2');
  await banner.getByTestId('fruit-dismiss').click();
  await expect(notice(page).getByRole('button')).toHaveText(['Just these 2', 'Undo', 'OK', '✕']);
  await expect(banner).toContainText('Dismissed for every one in this plan.');
  await notice(page).getByRole('button', { name: 'Just these 2' }).click();
  await expect(banner).toContainText('Dismissed for this one.');
  await closeSheet(page);
  await openWarnings(page, 'fruit');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).getByTestId('warning-scope')).toHaveText('Dismissed for these 2');
  await expect(button(page)).not.toHaveAttribute('aria-label', /to look at/);
});
