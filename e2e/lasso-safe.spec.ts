import { test, expect, type Page } from '@playwright/test';
import { canvasBox, drag, answerAsk } from './helpers';

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
  await openYard(page);
  await lassoAround(page);
  // Only plants (one locked): no question; the locked one stays.
  await page.locator('.multi-bar button[title=Delete]').click();
  await expect(page.locator('.ask-overlay')).toHaveCount(0);
  await expect(page.locator('#toast-action')).toContainText(/Deleted 2 plants; 1 locked shape kept/); // (with an Undo)
  await expect(page.locator('#toast-action').getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(3);
  // A plant and the bed: it says what would go. No keeps them; Yes deletes them.
  await page.locator('button[title=Undo]').click();
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(5);
  await page.keyboard.press('Escape'); // (clear what's selected)
  await page.locator('#canvas-svg [data-shape-id=p1]').click();
  await page.locator('#canvas-svg [data-shape-id=bed]').click();
  await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
  await page.locator('.multi-bar button[title=Delete]').click();
  expect(await answerAsk(page, false)).toBe('Delete 2 shapes: 1 plant, 1 bed?');
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(5);
  await page.locator('.multi-bar button[title=Delete]').click();
  await answerAsk(page, true);
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(3);
});

test('deleting a bed with some of its plants selected asks about the others: those selected go, the rest as chosen (the UI review, 2026-11-01)', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const base = { color: '#16a34a', opacity: 0.65 };
    localStorage.setItem('landscape-planner-v1', JSON.stringify({
      shapes: [
        { ...base, id: 'bed', type: 'rect', x: 0, y: 0, width: 10, height: 6, rotation: 0, label: 'Bed', role: 'bed' },
        { ...base, id: 'p1', type: 'circle', x: 2, y: 2, radius: 1, label: 'One', role: 'plant' },
        { ...base, id: 'p2', type: 'circle', x: 8, y: 2, radius: 1, label: 'Two', role: 'plant' },
        { ...base, id: 'p3', type: 'circle', x: 5, y: 5, radius: 1, label: 'Three', role: 'plant' },
        { ...base, id: 'lawn', type: 'circle', x: -2, y: 2, radius: 1, label: 'On the lawn', role: 'plant' },
      ],
      zoom: 1, offsetX: -4, offsetY: -6,
    }));
  });
  await page.goto('./');
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(5);
  const pick = async () => {
    await page.keyboard.press('Escape'); // (nothing selected)
    if ((await page.getByTestId('select-mode').getAttribute('aria-pressed')) !== 'true') await page.getByTestId('select-mode').click();
    await page.locator('#canvas-svg [data-shape-id=p1]').click();
    await page.locator('#canvas-svg [data-shape-id=bed]').click();
    await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
    await page.locator('.multi-bar button[title=Delete]').click();
  };
  const ask = page.locator('.ask-overlay [role=alertdialog]');
  await pick();
  await expect(ask.locator('.ask-message')).toContainText('Delete 2 shapes: 1 plant, 1 bed?');
  await expect(ask.locator('.ask-message')).toContainText('The bed has 2 plants in it that aren\u2019t selected.');
  await expect(ask.locator('button')).toHaveText(['Delete only the 2 selected (the other 2 plants in the bed stay)', 'Delete the 2 selected and the other 2 plants in the bed', 'Cancel']);
  // Only those selected: the bed and the one plant; the other two stay.
  await ask.getByTestId('ask-selected-only').click();
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(3);
  await expect(page.locator('#canvas-svg [data-shape-id=p2]')).toHaveCount(1);
  await expect(page.locator('#toast-action')).toContainText('Deleted 1 plant, 1 bed; the other 2 plants in the bed stay');
  await page.locator('#toast-action').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(5);
  // The others too: the bed and all three of its plants, one step to undo; the plant on the lawn stays.
  await pick();
  await ask.getByTestId('ask-ok').click();
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(1);
  await expect(page.locator('#canvas-svg [data-shape-id=lawn]')).toHaveCount(1);
  await expect(page.locator('#toast-action')).toContainText('Deleted 3 plants, 1 bed');
  await page.locator('button[title=Undo]').click();
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(5);
  // Cancel: nothing goes.
  await pick();
  await ask.getByTestId('ask-cancel').click();
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(5);
});

test('a plain shape from an older plan (a property line with no role) is asked about too', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const base = { color: '#16a34a', opacity: 0.65 };
    localStorage.setItem('landscape-planner-v1', JSON.stringify({
      shapes: [
        { ...base, id: 'old', type: 'rect', x: -3, y: -60, width: 60, height: 120, rotation: 0, label: 'Lot' },
        { ...base, id: 'p1', type: 'circle', x: -2, y: 0, radius: 1, label: 'One', role: 'plant' },
      ],
      zoom: 1, offsetX: -10, offsetY: -6,
    }));
  });
  await page.goto('./');
  await page.getByTestId('select-mode').click();
  const box = await canvasBox(page);
  // Across the old lot's west edge and the plant.
  await drag(page, { x: box.x + (-5 + 10) * 24, y: box.y + (-2 + 6) * 24 }, { x: box.x + (0 + 10) * 24, y: box.y + (2 + 6) * 24 });
  await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
  await page.locator('.multi-bar button[title=Delete]').click();
  expect(await answerAsk(page, false)).toBe('Delete 2 shapes: 1 plain shape, 1 plant?');
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(2);
});

test('cutting several keeps locked shapes, without asking; the arrow keys leave them where they are', async ({ page }) => {
  await openYard(page);
  await lassoAround(page);
  await expect(page.locator('.multi-bar .count')).toHaveText('3 selected');
  // The locked plant stays put while the other two move.
  const at = async (id: string) => (await page.locator(`#canvas-svg [data-shape-id=${id}]`).boundingBox())!.x;
  const [one, three] = [await at('p1'), await at('p3')];
  await page.keyboard.press('Shift+ArrowRight');
  expect(await at('p1')).toBeGreaterThan(one + 50);
  expect(await at('p3')).toBeCloseTo(three, 0);
  await page.keyboard.press('Control+x');
  await expect(page.locator('.ask-overlay')).toHaveCount(0);
  await expect(page.locator('#toast-action')).toContainText('Cut 2 plants; 1 locked shape kept');
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(3);
  // Only the locked one is left selected: moving it says why not.
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#toast')).toHaveText('It’s locked: unlock it to move it.');
});
