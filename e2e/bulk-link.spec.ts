import { test, expect, type Page } from '@playwright/test';
import { field, openSections } from './helpers';

// A plan drawn before the catalog: labeled circles, linked to plants many at a time.
async function openLegacyPlan(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const c = (id: string, x: number, label: string, role?: string) => ({ id, type: 'circle', x, y: 0, radius: 1, color: '#16a34a', label, ...(role ? { role } : {}) });
    localStorage.setItem('landscape-planner-v1', JSON.stringify({
      shapes: [c('a', -6, 'Bergamot'), c('b', -3, 'bergamot '), c('c', 0, 'Bergamot'), c('d', 3, 'Monarda'), c('e', 6, 'Bergamot', 'water')],
      zoom: 1, offsetX: -10, offsetY: -6,
    }));
  });
  await page.goto('./');
  await expect(page.locator('#canvas-svg text', { hasText: /bergamot/i })).toHaveCount(4);
}
const circle = (page: Page, label: RegExp | string) => page.locator('[data-shape-group]', { has: page.locator('text', { hasText: label }) }).locator('circle[data-shape-id]');

test('link one circle, then every other circle with its label in one tap', async ({ page }) => {
  await openLegacyPlan(page);
  await circle(page, 'Monarda').click();
  await page.locator('.sel-pill .edit').click();
  await openSections(page);
  // The picker opens searching for the circle's label.
  await page.getByTestId('plant-link').getByRole('button', { name: 'Link to a plant…' }).click();
  await expect(page.getByTestId('plant-search')).toHaveValue('Monarda');
  await page.getByTestId('plant-search').fill('Wild bergamot');
  await page.locator('.proj-row', { hasText: 'Wild bergamot' }).first().locator('[data-testid=plant-place]').click();
  // Only one circle was labeled "Monarda": nothing more to offer.
  await expect(page.getByTestId('link-offer')).toHaveCount(0);
  await page.locator('.sheet-header button.iconbtn').last().click();

  // Now a "Bergamot": the other two plant circles labeled so (case and spaces aside) are offered; the pond isn't.
  await page.locator('circle[data-shape-id=a]').click();
  await page.locator('.sel-pill .edit').click();
  await openSections(page);
  await page.getByTestId('plant-link').getByRole('button', { name: 'Link to a plant…' }).click();
  await expect(page.getByTestId('plant-search')).toHaveValue('Bergamot');
  await page.locator('.proj-row', { hasText: 'Wild bergamot' }).first().locator('[data-testid=plant-place]').click();
  await expect(page.getByTestId('link-offer')).toContainText('2 other circles are labeled “Bergamot”');
  await page.getByTestId('link-offer-yes').click();
  await expect(page.locator('#toast')).toContainText('2 more circles linked to Wild bergamot');
  await expect(page.getByTestId('link-offer')).toHaveCount(0);
  await expect(page.locator('#canvas-svg text', { hasText: 'Wild bergamot' })).toHaveCount(4);
  await expect(page.locator('#canvas-svg text', { hasText: /^Bergamot$/ })).toHaveCount(1); // (the pond)

  // One undo takes back the three linked together.
  await page.locator('.sheet-header button.iconbtn').last().click();
  await page.locator('button[title=Undo]').click();
  await expect(page.locator('#canvas-svg text', { hasText: 'Wild bergamot' })).toHaveCount(2);
});

test('select several circles and link them all to one plant', async ({ page }) => {
  await openLegacyPlan(page);
  await page.getByTestId('select-mode').click();
  for (const label of ['Monarda', /^bergamot\s*$/]) await circle(page, label).click();
  await page.locator('.multi-bar button', { hasText: 'Edit' }).click();
  await page.getByTestId('link-all').click();
  await expect(page.locator('.sheet .banner').first()).toContainText('these 2 circles');
  await expect(page.getByTestId('plant-search')).toHaveValue(''); // (their labels differ)
  await page.getByTestId('plant-search').fill('Wild bergamot');
  await page.locator('.proj-row', { hasText: 'Wild bergamot' }).first().locator('[data-testid=plant-place]').click();
  await expect(page.locator('#toast')).toContainText('2 circles linked to Wild bergamot');
  await expect(page.locator('#canvas-svg text', { hasText: 'Wild bergamot' })).toHaveCount(2);
});

test('the picker keeps its search in view while the list scrolls', async ({ page }) => {
  await page.goto('./');
  await page.locator('.tool-btn.plants').click();
  const sheet = page.locator('.sheet');
  await sheet.evaluate((n) => { n.scrollTop = n.scrollHeight; });
  const search = page.getByTestId('plant-search');
  await expect(search).toBeInViewport();
  // Typing there brings the start of the results back into view, keyboard and all.
  await search.fill('oak');
  await expect(search).toBeFocused();
  await expect(page.locator('.proj-row').first()).toBeInViewport();
});

test('the offer is checked again: a circle relabeled since, or undone, drops out', async ({ page }) => {
  await openLegacyPlan(page);
  await page.locator('circle[data-shape-id=a]').click();
  await page.locator('.sel-pill .edit').click();
  await openSections(page);
  await page.getByTestId('plant-link').getByRole('button', { name: 'Link to a plant…' }).click();
  await page.locator('.proj-row', { hasText: 'Wild bergamot' }).first().locator('[data-testid=plant-place]').click();
  await expect(page.getByTestId('link-offer')).toContainText('2 other circles');
  // Relabel one of them, then come back to the linked circle: only the other is offered.
  await page.locator('.sheet-header button.iconbtn').last().click();
  await page.locator('circle[data-shape-id=b]').click();
  await page.locator('.sel-pill .edit').click();
  await field(page, 'Label').fill('Sedum');
  await page.locator('.sheet-header button.iconbtn').last().click();
  await page.locator('circle[data-shape-id=a]').click();
  await page.locator('.sel-pill .edit').click();
  await expect(page.getByTestId('link-offer')).toContainText('1 other circle is labeled');
  // Undo forgets the offer.
  await page.locator('.sheet-header button.iconbtn').last().click();
  await page.locator('button[title=Undo]').click();
  await expect(page.locator('#canvas-svg text', { hasText: /^bergamot$/ })).toHaveCount(1); // (the relabel, undone)
  await page.locator('circle[data-shape-id=a]').click();
  const edit = page.locator('.sel-pill .edit');
  if (await edit.isVisible()) await edit.click(); // (a second tap on the selected circle opens its properties itself)
  await expect(page.getByTestId('plant-link')).toBeVisible();
  await expect(page.getByTestId('link-offer')).toHaveCount(0);
});

test('Link all says what changes: circles linked already, and locked ones left alone', async ({ page }) => {
  await openLegacyPlan(page);
  await page.getByTestId('select-mode').click();
  for (const id of ['a', 'b', 'c']) await page.locator(`circle[data-shape-id=${id}]`).click();
  await page.locator('.multi-bar button', { hasText: 'Edit' }).click();
  await page.getByRole('button', { name: 'Lock all' }).click();
  await expect(page.getByTestId('link-all')).toHaveCount(0); // (all locked: nothing to link)
  await page.getByRole('button', { name: 'Unlock all' }).click();
  await expect(page.getByTestId('link-all')).toHaveText('Link all 3 to a plant…');
  await expect(page.getByTestId('link-all-note')).toHaveCount(0);
});
