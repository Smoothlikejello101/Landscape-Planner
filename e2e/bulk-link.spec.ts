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
  await expect(page.getByTestId('section-plant')).toBeVisible(); // (its pane, open on the plant)
  await expect(page.getByTestId('link-offer')).toHaveCount(0);
});

test('Link all leaves locked circles alone unless asked to include them', async ({ page }) => {
  await openLegacyPlan(page);
  await page.getByTestId('select-mode').click();
  for (const id of ['a', 'b', 'c']) await page.locator(`circle[data-shape-id=${id}]`).click();
  await page.locator('.multi-bar button', { hasText: 'Edit' }).click();
  await page.getByTestId('lock-all').click(); // (in the header, as for one shape)
  // All locked: only asked, never assumed.
  await expect(page.getByTestId('link-all')).toHaveCount(0);
  await page.getByTestId('link-all-locked').click();
  await page.getByTestId('plant-search').fill('Wild bergamot');
  await page.locator('.proj-row', { hasText: 'Wild bergamot' }).first().locator('[data-testid=plant-place]').click();
  await expect(page.locator('#toast')).toContainText('3 circles linked to Wild bergamot');
  await expect(page.locator('#canvas-svg text', { hasText: 'Wild bergamot' })).toHaveCount(3);
});

test('linking a circle to a tree keeps it the size it was drawn, as an existing tree', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('landscape-planner-v1', JSON.stringify({
      shapes: [{ id: 't', type: 'circle', x: 0, y: 0, radius: 3, color: '#16a34a', label: 'Big oak' }, { id: 'u', type: 'circle', x: 8, y: 0, radius: 2, color: '#16a34a', label: 'Big oak', locked: true }],
      zoom: 1, offsetX: -10, offsetY: -6,
    }));
  });
  await page.goto('./');
  await page.locator('circle[data-shape-id=t]').click();
  await page.locator('.sel-pill .edit').click();
  await openSections(page);
  await page.getByTestId('plant-link').getByRole('button', { name: 'Link to a plant…' }).click();
  await page.getByTestId('plant-search').fill('Quercus rubra');
  await page.locator('.proj-row', { hasText: 'Quercus rubra' }).first().locator('[data-testid=plant-place]').click();
  await expect(page.locator('circle[data-shape-id=t]')).toHaveAttribute('r', '72'); // (3 ft at 24 px a foot: as drawn)
  await expect(page.locator('#canvas-svg [data-role=full-ring]')).toHaveCount(1);
  await expect(page.getByTestId('plant-size-note')).toContainText('the dashed ring'); // (in Size and position since Oct 30)
  // The other "Big oak" is locked: asked about, not linked unless chosen.
  await expect(page.getByTestId('link-offer')).toContainText('and it’s locked');
  await expect(page.getByTestId('link-offer-yes')).toHaveCount(0);
  await page.getByTestId('link-offer-locked').click();
  await expect(page.locator('#canvas-svg text', { hasText: 'Big oak' })).toHaveCount(0);
});
