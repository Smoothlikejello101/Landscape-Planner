import { test, expect, type Page } from '@playwright/test';
import { openFilters, openFresh } from './helpers';

// Cultivars fold under their species in the picker (decided with Jason, 2026-10-26).
const f = (v: unknown) => ({ v, src: ['ncsu'], check: 'single' });
const rec = (id: string, common: string, botanical: string, facts: Record<string, unknown> = {}, parent?: string) =>
  ({ id, common, botanical, ...(parent ? { parent } : {}), src: ['ncsu'], audited: '2026-10-26', facts });
const kids = (parent: string, species: string, botanical: string, list: [string, string[]][]) =>
  list.map(([c, colors]) => rec(`${parent}-${c.toLowerCase().replace(/\W+/g, '-')}`, `${species} '${c}'`, `${botanical} '${c}'`, { flower_color: f(colors) }, parent));
const catalog = {
  meta: {
    format: 'lp-catalog', version: 2, zones: 'half', title: 'Test catalog', updated: '2026-10-26',
    sources: { ncsu: { title: 'NC State Extension', trust: 'reference' } },
    enums: { form: ['Annual', 'Shrub', 'Tree'] },
  },
  plants: [
    rec('carya-illinoinensis', 'Pecan', 'Carya illinoinensis', { form: f('Tree') }),
    ...['Kanza', 'Lakota', 'Pawnee', 'Desirable'].map((c) => rec(`carya-illinoinensis-${c.toLowerCase()}`, `Pecan '${c}'`, `Carya illinoinensis '${c}'`, {}, 'carya-illinoinensis')),
    rec('hibiscus-syriacus', 'Rose of Sharon', 'Hibiscus syriacus', { form: f('Shrub'), flower_color: f(['pink', 'white', 'purple']) }),
    ...kids('hibiscus-syriacus', 'Rose of Sharon', 'Hibiscus syriacus', [['Aphrodite', ['pink']], ['Minerva', ['pink', 'purple']], ['Lucy', ['pink']], ['Pink Chiffon', ['pink']], ['Diana', ['white']]]),
    rec('hydrangea-arborescens', 'Smooth hydrangea', 'Hydrangea arborescens', { form: f('Shrub'), flower_color: f(['white']) }),
    ...kids('hydrangea-arborescens', 'Smooth hydrangea', 'Hydrangea arborescens', [['Annabelle', ['white']], ['Invincibelle Spirit', ['pink']], ['Invincibelle Ruby', ['pink']], ['Bella Anna', ['pink']], ['Pink Pincushion', ['pink']]]),
    rec('hydrangea-quercifolia', 'Oakleaf hydrangea', 'Hydrangea quercifolia', { form: f('Shrub'), flower_color: f(['white']) }),
    ...kids('hydrangea-quercifolia', 'Oakleaf hydrangea', 'Hydrangea quercifolia', [['Alice', ['white']], ['Ruby Slippers', ['white']]]),
    // Cultivars with no species record: roses (a heading: "Roses"), two camellias (too few to fold).
    rec('rosa-julia-child', "Rose 'Julia Child'", "Rosa 'Julia Child'", { form: f('Shrub'), flower_color: f(['yellow']) }),
    rec('rosa-belindas-dream', "Rose 'Belinda's Dream'", "Rosa 'Belinda's Dream'", { form: f('Shrub'), flower_color: f(['pink']) }),
    rec('rosa-new-dawn', "Climbing rose 'New Dawn'", "Rosa 'New Dawn'", { form: f('Shrub'), flower_color: f(['pink']) }),
    rec('rosa-abraham-darby', "Rosa 'Abraham Darby'", "Rosa 'Abraham Darby'", { form: f('Shrub'), flower_color: f(['pink']) }),
    rec('rosa-carefree-beauty', "Rose 'Carefree Beauty'", "Rosa 'Carefree Beauty'", { form: f('Shrub'), flower_color: f(['pink']) }),
    rec('camellia-winters-charm', "Camellia 'Winter's Charm'", "Camellia 'Winter's Charm'", { form: f('Shrub') }),
    rec('camellia-winters-star', "Camellia 'Winter's Star'", "Camellia 'Winter's Star'", { form: f('Shrub') }),
    rec('zinnia-elegans', 'Zinnia', 'Zinnia elegans', { form: f('Annual'), flower_color: f(['red', 'pink', 'white']) }),
    rec('quercus-alba', 'White oak', 'Quercus alba', { form: f('Tree') }),
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

test('a species\' cultivars fold under it, a tap to open; a search naming one shows it on its own; fewer than four stay rows', async ({ page }) => {
  await openPicker(page);
  // Browsing: a row a species, its cultivars folded; two cultivars stay rows of their own; cultivars with no species
  // record fold under a heading for their genus, at its own name; two don't.
  await expect(names(page)).toHaveText(["Camellia 'Winter's Charm'", "Camellia 'Winter's Star'", 'Oakleaf hydrangea', "Oakleaf hydrangea 'Alice'", "Oakleaf hydrangea 'Ruby Slippers'",
    'Pecan', 'Rose of Sharon', 'Roses', 'Smooth hydrangea', 'White oak', 'Zinnia']);
  const pecans = foldOf(page, 'Pecan');
  await expect(pecans.getByTestId('cultivar-fold')).toHaveText('4 cultivars');
  // One entry with its species (no line between them); its arrow where the rows' colour dots are, to catch the eye.
  const pecan = page.locator('.plant-item', { has: page.locator('.pname', { hasText: /^Pecan$/ }) });
  expect(await pecan.evaluate((e) => getComputedStyle(e).borderBottomWidth)).toBe('0px');
  const dot = (await pecan.locator('.row-toggle > div').first().boundingBox())!;
  const arrow = (await pecans.locator('.fold-chev svg').boundingBox())!;
  expect(Math.abs(arrow.x + arrow.width / 2 - (dot.x + dot.width / 2))).toBeLessThan(2);
  await expect(pecans.getByTestId('cultivar-fold')).toHaveAttribute('aria-expanded', 'false');
  await pecans.getByTestId('cultivar-fold').click();
  await expect(pecans.getByTestId('cultivar-list').locator('.pname')).toHaveText(["Pecan 'Desirable'", "Pecan 'Kanza'", "Pecan 'Lakota'", "Pecan 'Pawnee'"]);
  await expect(page.getByTestId('picker-count')).toContainText('All 29 plants');
  // Each cultivar a plant like any: its details, and Place.
  await pecans.getByTestId('cultivar-list').getByTestId('plant-row').first().click();
  await expect(pecans.getByTestId('plant-details')).toBeVisible();
  await expect(pecans.getByRole('button', { name: "Place Pecan 'Desirable'" })).toBeVisible();
  // The roses' heading: not a plant (nothing to place); tapped, its cultivars.
  const roses = page.getByTestId('cultivar-group');
  await expect(roses.getByTestId('group-count')).toHaveText('Rosa \u00b7 5 cultivars');
  await expect(roses.getByTestId('plant-place')).toHaveCount(0);
  await roses.getByTestId('group-head').click();
  await expect(roses.getByTestId('cultivar-list').locator('.pname')).toHaveText(["Climbing rose 'New Dawn'", "Rosa 'Abraham Darby'", "Rose 'Belinda's Dream'", "Rose 'Carefree Beauty'", "Rose 'Julia Child'"]);
  await expect(roses.getByRole('button', { name: "Place Rose 'Julia Child'" })).toBeVisible();
  // A search for the species: the species, its cultivars folded (as left).
  await page.getByTestId('plant-search').fill('pecan');
  await expect(names(page).first()).toHaveText('Pecan');
  await expect(foldOf(page, 'Pecan').getByTestId('cultivar-fold')).toHaveText('4 cultivars');
  // Naming a cultivar: it, on a row of its own; "rose" names no rose.
  await page.getByTestId('plant-search').fill('kanza');
  await expect(names(page)).toHaveText(["Pecan 'Kanza'"]);
  await expect(page.getByTestId('cultivars')).toHaveCount(0);
  await page.getByTestId('plant-search').fill('pecan lakota');
  await expect(names(page)).toHaveText(["Pecan 'Lakota'"]);
  await page.getByTestId('plant-search').fill('julia');
  await expect(names(page)).toHaveText(["Rose 'Julia Child'"]);
  await page.getByTestId('plant-search').fill('rose');
  await expect(page.getByTestId('cultivar-group').getByTestId('group-head')).toBeVisible();
});

test('filters look inside a fold, and open it to the cultivars that match; a species that doesn\'t match itself still heads them', async ({ page }) => {
  await openPicker(page);
  await openFilters(page);
  await page.locator('[data-testid=flower-colors] label', { hasText: 'Pink' }).click();
  // Rose of Sharon comes in pink among others: above the divider now, for its pink cultivars, and says so.
  const ros = page.locator('.plant-item', { has: page.locator('.pname', { hasText: /^Rose of Sharon$/ }) });
  await expect(ros.getByTestId('comes-in-flag')).toHaveText('Comes in pink among others');
  const rosFold = foldOf(page, 'Rose of Sharon');
  await expect(rosFold.getByTestId('cultivar-fold')).toHaveText('4 of 5 cultivars match your filters');
  await expect(rosFold.getByTestId('cultivar-fold')).toHaveAttribute('aria-expanded', 'true');
  // Smooth hydrangea is white: shown for its pink cultivars, saying it doesn't match itself. Roses: the pink ones.
  const hyd = foldOf(page, 'Smooth hydrangea');
  await expect(hyd.getByTestId('cultivar-fold')).toHaveText('4 of 5 cultivars match your filters; the species itself doesn\u2019t');
  await expect(page.getByTestId('cultivar-group').getByTestId('group-count')).toHaveText('Rosa \u00b7 4 of 5 cultivars match your filters');
  // A species with no cultivar of it in the color: below the divider, as before.
  await expect(page.locator('.plant-item .pname, [data-testid=comes-in-divider]')).toHaveText(['Rose of Sharon', "Rose of Sharon 'Aphrodite'", "Rose of Sharon 'Lucy'", "Rose of Sharon 'Minerva'", "Rose of Sharon 'Pink Chiffon'",
    'Roses', "Climbing rose 'New Dawn'", "Rosa 'Abraham Darby'", "Rose 'Belinda's Dream'", "Rose 'Carefree Beauty'",
    'Smooth hydrangea', "Smooth hydrangea 'Bella Anna'", "Smooth hydrangea 'Invincibelle Ruby'", "Smooth hydrangea 'Invincibelle Spirit'", "Smooth hydrangea 'Pink Pincushion'",
    'Also comes in pink, depending on the plant you buy', 'Zinnia']);
  // Closed by hand: stays closed as the list changes.
  await hyd.getByTestId('cultivar-fold').click();
  await page.getByTestId('plant-search').fill('hydrangea');
  await expect(foldOf(page, 'Smooth hydrangea').getByTestId('cultivar-fold')).toHaveAttribute('aria-expanded', 'false');
  // Fewer than four match: rows of their own (one purple one here), the species below the divider.
  await page.getByTestId('plant-search').fill('');
  await expect(page.getByTestId('picker-count')).toContainText(/^14 of 29 plants match/);
  await page.locator('[data-testid=flower-colors] label', { hasText: 'Pink' }).click();
  await page.locator('[data-testid=flower-colors] label', { hasText: 'Purple' }).click();
  await expect(page.locator('.plant-item .pname, [data-testid=comes-in-divider]')).toHaveText(["Rose of Sharon 'Minerva'", 'Also comes in purple, depending on the plant you buy', 'Rose of Sharon']);
});

test('a search folds a cultivar only where its species answers it too; a fold that\'s the only thing found opens', async ({ page }) => {
  await openPicker(page);
  // "awnee" is in 'Pawnee', not in Pecan: the cultivar, on its own (Jason's "rise", in Glossy abelia 'Sunrise').
  await page.getByTestId('plant-search').fill('awnee');
  await expect(names(page)).toHaveText(["Pecan 'Pawnee'"]);
  await expect(page.getByTestId('cultivars')).toHaveCount(0);
  // "pecan": Pecan and its fold, the only thing found: open.
  await page.getByTestId('plant-search').fill('pecan');
  const pecans = foldOf(page, 'Pecan');
  await expect(pecans.getByTestId('cultivar-fold')).toHaveAttribute('aria-expanded', 'true');
  await expect(pecans.getByTestId('cultivar-list').locator('.pname')).toHaveCount(4);
  // Closed by hand: it stays closed.
  await pecans.getByTestId('cultivar-fold').click();
  await page.getByTestId('plant-search').fill('pecan ');
  await expect(foldOf(page, 'Pecan').getByTestId('cultivar-fold')).toHaveAttribute('aria-expanded', 'false');
  // A heading, the only thing found: open too.
  await page.getByTestId('plant-search').fill('rosa');
  await expect(page.getByTestId('group-head')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('cultivar-group').getByTestId('cultivar-list').locator('.pname')).toHaveCount(5);
});
