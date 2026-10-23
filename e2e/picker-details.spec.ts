import { test, expect } from '@playwright/test';
import { addPlainShape, field, openFresh } from './helpers';

// Plant picker rows open to show a plant's details; Place uses it.

test('a plant row opens to its details, and stays open while the list changes', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const search = page.getByTestId('plant-search');
  await search.fill('Autumn Bride');
  const item = page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" });
  await item.getByTestId('plant-row').click();
  const details = item.getByTestId('plant-details');
  await expect(details).toContainText('Hardiness');
  await expect(details).toContainText('older list, unverified');
  await expect(item.getByTestId('plant-row')).toHaveAttribute('aria-expanded', 'true');
  // Typing again rebuilds the list in place: the row stays open, and the search keeps the keyboard.
  await search.click();
  await search.press('End');
  await search.type(' ');
  await expect(search).toBeFocused();
  await expect(page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" }).getByTestId('plant-details')).toBeVisible();
  // A tap inside the details neither closes the row nor places the plant.
  await page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" }).getByTestId('plant-details').click();
  await expect(page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" }).getByTestId('plant-details')).toBeVisible();
  await expect(page.getByTestId('place-bar')).toHaveCount(0);
  // The row opens from the keyboard too, and its name (with its summary) is what's announced.
  const toggle = page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" }).getByTestId('plant-row');
  await expect(toggle).toHaveAccessibleName(/Heuchera 'Autumn Bride'.*Heuchera villosa/);
  // Tap again: closed. Nothing was placed.
  await page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" }).getByTestId('plant-row').click();
  await expect(page.getByTestId('plant-details')).toHaveCount(0);
  await expect(page.getByTestId('place-bar')).toHaveCount(0);
});

test('a plant shown only because of what other sources say is marked, and says so, naming who', async ({ page }) => {
  const catalog = {
    meta: {
      format: 'lp-catalog', version: 2, zones: 'half', title: 'Test catalog', updated: '2026-10-18',
      sources: { ncsu: { title: 'NC State Extension', trust: 'reference' }, shop: { title: 'A nursery', trust: 'nursery' }, grower: { title: 'A grower', trust: 'nursery' }, grower2: { title: 'Another grower', trust: 'nursery' }, compendium: { title: 'Older list', trust: 'unverified' } },
      enums: { form: ['Perennial', 'Shrub'] },
    },
    plants: [
      { id: 'heuchera-villosa', common: 'Hairy alumroot', botanical: 'Heuchera villosa', src: ['ncsu'], audited: '2026-10-18',
        facts: { form: 'Perennial', sun_most: { v: 'Part', src: ['ncsu'], check: 'single', alt: { v: 'Full', src: ['shop'], check: 'reported' } }, sun_least: { v: 'Shade', src: ['ncsu'], check: 'single' } } },
      // (No source gives both ends of its zones: each end says its own.)
      { id: 'itea', common: 'Sweetspire', botanical: 'Itea virginica', src: ['ncsu'], audited: '2026-10-18',
        facts: { form: 'Shrub', sun_most: 'Full', sun_least: 'Shade', zone_min: { v: 5, src: ['grower'], check: 'reported' }, zone_max: { v: 9.5, src: ['ncsu'], check: 'single' } } },
      { id: 'carex-eburnea', common: 'Bristleleaf sedge', src: ['ncsu'], audited: '2026-10-18',
        facts: { form: 'Perennial', sun_most: 'Full', sun_least: 'Part', zone_min: { v: 2, src: ['grower'], check: 'reported' }, zone_max: { v: 7.5, src: ['grower'], check: 'reported' } } },
      // (Two nurseries that agree outrank NC State alone: theirs is shown, NC State's beside it, by name. On sun,
      // only the shady end: NC State agrees it takes full sun, and says it needs it.)
      { id: 'bee-balm', common: 'Bee balm', src: ['ncsu'], audited: '2026-10-18',
        facts: { form: 'Perennial', sun_most: { v: 'Full', src: ['ncsu', 'grower', 'grower2'], check: 'confirmed' }, sun_least: { v: 'Part', src: ['grower', 'grower2'], check: 'likely', alt: { v: 'Full', src: ['ncsu'], check: 'single' } },
          zone_min: { v: 3, src: ['grower', 'grower2'], check: 'likely', alt: { v: 4, src: ['ncsu'], check: 'single' } }, zone_max: { v: 9, src: ['grower', 'grower2'], check: 'likely', alt: { v: 8, src: ['ncsu'], check: 'single' } } } },
      { id: 'old', common: 'Old-list aster', src: ['compendium'], audited: null, facts: { form: 'Perennial', sun_most: 'Full', sun_least: 'Part' } },
      { id: 'half', common: 'Half-checked aster', src: ['compendium'], audited: '2026-10-18', facts: { form: { v: 'Perennial', src: ['ncsu'], check: 'single' }, sun_most: 'Full', sun_least: 'Part' } },
    ],
  };
  await page.route('**/plants.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }));
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.locator('.sheet select').filter({ has: page.locator('option', { hasText: 'Any sun' }) }).selectOption('Full');
  const alumroot = page.locator('.plant-item', { hasText: 'Hairy alumroot' });
  await expect(alumroot.getByTestId('row-flag')).toBeVisible();
  await expect(page.locator('.plant-item', { hasText: 'Sweetspire' }).getByTestId('row-flag')).toHaveCount(0);
  // Each row says how far it's checked: all older list, some, or (no badge) every detail sourced.
  await expect(page.locator('.plant-item', { hasText: 'Old-list aster' }).locator('.unverified-badge')).toHaveText('Unverified');
  await expect(page.locator('.plant-item', { hasText: 'Half-checked aster' }).locator('.unverified-badge')).toHaveText('Partly checked');
  await expect(page.locator('.plant-item', { hasText: 'Sweetspire' }).locator('.unverified-badge')).toHaveCount(0);
  await alumroot.getByTestId('plant-row').click();
  await expect(alumroot.getByTestId('reported-flag')).toContainText('what other sources say for its sun');
  await expect(alumroot.getByTestId('plant-details')).toContainText('Nurseries report: Full sun to shade (A nursery)');
  const beeBalm = page.locator('.plant-item', { hasText: 'Bee balm' });
  await beeBalm.getByTestId('plant-row').click();
  const details = beeBalm.getByTestId('plant-details');
  await expect(details).toContainText('NC State lists: Full sun');
  // The sun range is credited to the sources behind both its ends, as sure as the less sure end.
  await expect(details).toContainText('Full sun to part shadeA grower, Another grower · nurseries agree');
  await expect(details).not.toContainText('NC State Extension, A grower');
  // Nurseries lead its hardiness, a reference's range beside it; the range shown is nurseries' only, and says so.
  await expect(details).toContainText('NC State lists: zones 4–8a');
  const onlyNurseries = 'This range is from nurseries only, and a grower\'s range can stop where it sells.';
  await expect(beeBalm.getByTestId('nursery-only')).toHaveText(onlyNurseries);
  // Hardiness only a nursery gives says so; one a reference gives doesn't.
  await expect(alumroot.getByTestId('nursery-only')).toHaveCount(0);
  const sedge = page.locator('.plant-item', { hasText: 'Bristleleaf sedge' });
  await sedge.getByTestId('plant-row').click();
  await expect(sedge.getByTestId('nursery-only')).toHaveText(onlyNurseries);
  // Ends from different sources: each named for its own.
  const itea = page.locator('.plant-item', { hasText: 'Sweetspire' });
  await itea.getByTestId('plant-row').click();
  await expect(itea.getByTestId('plant-details')).toContainText('A grower for the cold limit (one nursery); NC State Extension for the warm limit (one source)');
  await expect(itea.getByTestId('nursery-only')).toHaveText('Its cold limit is from nurseries only.');
  // Only the references: it's gone.
  await page.getByRole('button', { name: '+ More filters' }).click();
  await page.locator('label', { hasText: 'Include where sources differ' }).locator('input').uncheck();
  await expect(page.locator('.plant-item', { hasText: 'Hairy alumroot' })).toHaveCount(0);
  // Placing works from the row's button.
  await page.locator('.plant-item', { hasText: 'Sweetspire' }).getByTestId('plant-place').click();
  await expect(page.getByTestId('place-bar')).toBeVisible();
});

test('linking a circle to a catalog plant uses the Link button', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'circle');
  await page.getByTestId('plant-link').getByRole('button', { name: 'Link to a plant…' }).click();
  await page.getByTestId('plant-search').fill('Autumn Bride');
  const item = page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" });
  await expect(item.getByTestId('plant-place')).toHaveText('Link');
  await item.getByTestId('plant-place').click();
  await expect(field(page, 'Label')).toHaveValue("Heuchera 'Autumn Bride'");
});
