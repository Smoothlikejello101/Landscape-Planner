import { test, expect, type Page } from '@playwright/test';
import { openSections } from './helpers';

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
