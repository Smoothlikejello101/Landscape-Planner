import { test, expect, type Page } from '@playwright/test';
import { openFresh } from './helpers';

// Cultivars fold under their species in the picker (decided with Jason, 2026-10-26).
const f = (v: unknown) => ({ v, src: ['ncsu'], check: 'single' });
const catalog = {
  meta: {
    format: 'lp-catalog', version: 2, zones: 'half', title: 'Test catalog', updated: '2026-10-26',
    sources: { ncsu: { title: 'NC State Extension', trust: 'reference' } },
    enums: { form: ['Annual', 'Shrub', 'Tree'] },
  },
  plants: [
    { id: 'carya-illinoinensis', common: 'Pecan', botanical: 'Carya illinoinensis', src: ['ncsu'], audited: '2026-10-26', facts: { form: f('Tree') } },
    ...['Kanza', 'Lakota', 'Pawnee'].map((c) => ({ id: `carya-illinoinensis-${c.toLowerCase()}`, common: `Pecan '${c}'`, botanical: `Carya illinoinensis '${c}'`, parent: 'carya-illinoinensis', src: ['ncsu'], audited: '2026-10-26', facts: {} })),
    { id: 'hibiscus-syriacus', common: 'Rose of Sharon', botanical: 'Hibiscus syriacus', src: ['ncsu'], audited: '2026-10-26', facts: { form: f('Shrub'), flower_color: f(['pink', 'white', 'purple']) } },
    { id: 'hibiscus-syriacus-diana', common: "Rose of Sharon 'Diana'", botanical: "Hibiscus syriacus 'Diana'", parent: 'hibiscus-syriacus', src: ['ncsu'], audited: '2026-10-26', facts: { flower_color: f(['white']) } },
    { id: 'hibiscus-syriacus-aphrodite', common: "Rose of Sharon 'Aphrodite'", botanical: "Hibiscus syriacus 'Aphrodite'", parent: 'hibiscus-syriacus', src: ['ncsu'], audited: '2026-10-26', facts: { flower_color: f(['pink']) } },
    { id: 'hydrangea-arborescens', common: 'Smooth hydrangea', botanical: 'Hydrangea arborescens', src: ['ncsu'], audited: '2026-10-26', facts: { form: f('Shrub'), flower_color: f(['white']) } },
    { id: 'hydrangea-arborescens-annabelle', common: "Smooth hydrangea 'Annabelle'", botanical: "Hydrangea arborescens 'Annabelle'", parent: 'hydrangea-arborescens', src: ['ncsu'], audited: '2026-10-26', facts: { flower_color: f(['white']) } },
    { id: 'hydrangea-arborescens-invincibelle-spirit', common: "Smooth hydrangea 'Invincibelle Spirit'", botanical: "Hydrangea arborescens 'Invincibelle Spirit'", parent: 'hydrangea-arborescens', src: ['ncsu'], audited: '2026-10-26', facts: { flower_color: f(['pink']) } },
    { id: 'zinnia-elegans', common: 'Zinnia', botanical: 'Zinnia elegans', src: ['ncsu'], audited: '2026-10-26', facts: { form: f('Annual'), flower_color: f(['red', 'pink', 'white']) } },
    { id: 'quercus-alba', common: 'White oak', botanical: 'Quercus alba', src: ['ncsu'], audited: '2026-10-26', facts: { form: f('Tree') } },
  ],
};
async function openPicker(page: Page) {
  await page.route('**/plants.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }));
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
}
const names = (page: Page) => page.locator('.plant-item .pname');
const foldOf = (page: Page, species: string) => page.locator('.plant-item', { has: page.locator('.pname', { hasText: new RegExp(`^${species}$`) }) })
  .locator('xpath=following-sibling::*[1][@data-testid="cultivars"]');

test('a species\' cultivars fold under it, a tap to open; a search naming one shows it on its own', async ({ page }) => {
  await openPicker(page);
  // Browsing: a row a species, its cultivars folded.
  await expect(names(page)).toHaveText(['Pecan', 'Rose of Sharon', 'Smooth hydrangea', 'White oak', 'Zinnia']);
  const pecans = foldOf(page, 'Pecan');
  await expect(pecans.getByTestId('cultivar-fold')).toHaveText('3 cultivars');
  await expect(pecans.getByTestId('cultivar-fold')).toHaveAttribute('aria-expanded', 'false');
  await pecans.getByTestId('cultivar-fold').click();
  await expect(pecans.getByTestId('cultivar-list').locator('.pname')).toHaveText(["Pecan 'Kanza'", "Pecan 'Lakota'", "Pecan 'Pawnee'"]);
  await expect(page.getByTestId('picker-count')).toContainText('All 12 plants');
  // Each cultivar a plant like any: its details, and Place.
  await pecans.getByTestId('cultivar-list').getByTestId('plant-row').first().click();
  await expect(pecans.getByTestId('plant-details')).toBeVisible();
  await expect(pecans.getByRole('button', { name: "Place Pecan 'Kanza'" })).toBeVisible();
  // A search for the species: the species, its cultivars folded (as left).
  await page.getByTestId('plant-search').fill('pecan');
  await expect(names(page).first()).toHaveText('Pecan');
  await expect(foldOf(page, 'Pecan').getByTestId('cultivar-fold')).toHaveText('3 cultivars');
  // Naming a cultivar: it, on a row of its own.
  await page.getByTestId('plant-search').fill('kanza');
  await expect(names(page)).toHaveText(["Pecan 'Kanza'"]);
  await expect(page.getByTestId('cultivars')).toHaveCount(0);
  await page.getByTestId('plant-search').fill('pecan lakota');
  await expect(names(page)).toHaveText(["Pecan 'Lakota'"]);
});

test('filters look inside a fold, and open it to the cultivars that match; a species that doesn\'t match itself still heads them', async ({ page }) => {
  await openPicker(page);
  await page.locator('[data-testid=flower-colors] label', { hasText: 'Pink' }).click();
  // Rose of Sharon comes in pink among others: above the divider now, for its pink cultivar, and says so.
  const ros = page.locator('.plant-item', { has: page.locator('.pname', { hasText: /^Rose of Sharon$/ }) });
  await expect(ros.getByTestId('comes-in-flag')).toHaveText('Comes in pink among others');
  const rosFold = foldOf(page, 'Rose of Sharon');
  await expect(rosFold.getByTestId('cultivar-fold')).toHaveText('1 of 2 cultivars match your filters');
  await expect(rosFold.getByTestId('cultivar-fold')).toHaveAttribute('aria-expanded', 'true');
  await expect(rosFold.getByTestId('cultivar-list').locator('.pname')).toHaveText(["Rose of Sharon 'Aphrodite'"]);
  // A species with no cultivar of it in the color: below the divider, as before.
  await expect(page.getByTestId('comes-in-divider')).toHaveText('Also comes in pink, depending on the plant you buy');
  await expect(page.locator('.plant-item .pname, [data-testid=comes-in-divider]')).toHaveText(['Rose of Sharon', "Rose of Sharon 'Aphrodite'", 'Smooth hydrangea', "Smooth hydrangea 'Invincibelle Spirit'", 'Also comes in pink, depending on the plant you buy', 'Zinnia']);
  // Smooth hydrangea is white: shown for its pink cultivar, saying it doesn't match itself.
  const hyd = foldOf(page, 'Smooth hydrangea');
  await expect(hyd.getByTestId('cultivar-fold')).toHaveText('1 of 2 cultivars match your filters; the species itself doesn’t');
  await expect(hyd.getByTestId('cultivar-list').locator('.pname')).toHaveText(["Smooth hydrangea 'Invincibelle Spirit'"]);
  // Closed by hand: stays closed as the list changes.
  await hyd.getByTestId('cultivar-fold').click();
  await page.getByTestId('plant-search').fill('hydrangea');
  await expect(foldOf(page, 'Smooth hydrangea').getByTestId('cultivar-fold')).toHaveAttribute('aria-expanded', 'false');
  // The count is of plants that match, cultivars too.
  await page.getByTestId('plant-search').fill('');
  await expect(page.getByTestId('picker-count')).toContainText(/^4 of 12 plants match/);
});
