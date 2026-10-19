import { test, expect, type Page } from '@playwright/test';
import { canvasBox, drag } from './helpers';

// Zoomed in within the property: the property line all around, plants inside, a bed nearby.
async function openYard(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const base = { color: '#16a34a', opacity: 0.65 };
    localStorage.setItem('landscape-planner-v1', JSON.stringify({
      shapes: [
        { ...base, id: 'line', type: 'rect', x: -60, y: -60, width: 120, height: 120, rotation: 0, label: 'Property', role: 'boundary' },
        { ...base, id: 'bed', type: 'rect', x: 1, y: 8, width: 4, height: 3, rotation: 0, label: 'Bed', role: 'bed' },
        { ...base, id: 'p1', type: 'circle', x: -2, y: 0, radius: 1, label: 'One', role: 'plant' },
        { ...base, id: 'p2', type: 'circle', x: 2, y: 0, radius: 1, label: 'Two', role: 'plant' },
        { ...base, id: 'p3', type: 'circle', x: 0, y: 3, radius: 1, label: 'Three', role: 'plant', locked: true },
      ],
      zoom: 1, offsetX: -10, offsetY: -6,
    }));
  });
  await page.goto('./');
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(5);
}
async function lassoAround(page: Page) {
  await page.getByTestId('select-mode').click();
  const box = await canvasBox(page);
  const ppf = 24; // (zoom 100%)
  const at = (x: number, y: number) => ({ x: box.x + (x + 10) * ppf, y: box.y + (y + 6) * ppf });
  await drag(page, at(-4, -2), at(4, 5));
}

test('a lasso inside the property line picks the plants, not the line around them', async ({ page }) => {
  await openYard(page);
  await lassoAround(page);
  await expect(page.locator('.multi-bar .count')).toHaveText('3 selected');
});

test('deleting several keeps locked shapes, and asks first when it would take more than plants', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await (dialogs.length === 1 ? d.dismiss() : d.accept()); });
  await openYard(page);
  await lassoAround(page);
  // Only plants (one locked): no question; the locked one stays.
  await page.locator('.multi-bar button[title=Delete]').click();
  expect(dialogs).toEqual([]);
  await expect(page.locator('#toast')).toContainText('2 deleted; 1 locked shape kept');
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(3);
  // A plant and the bed: it says what would go. No keeps them; Yes deletes them.
  await page.locator('button[title=Undo]').click();
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(5);
  await page.keyboard.press('Escape'); // (clear what's selected)
  await page.locator('#canvas-svg [data-shape-id=p1]').click();
  await page.locator('#canvas-svg [data-shape-id=bed]').click();
  await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
  await page.locator('.multi-bar button[title=Delete]').click();
  expect(dialogs[0]).toBe('Delete 2 shapes: 1 plant, 1 bed?');
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(5);
  await page.locator('.multi-bar button[title=Delete]').click();
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(3);
});
