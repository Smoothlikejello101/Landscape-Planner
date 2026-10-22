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

test('a plant shown only because of what nurseries report is marked, and says so', async ({ page }) => {
  const catalog = {
    meta: {
      format: 'lp-catalog', version: 2, zones: 'half', title: 'Test catalog', updated: '2026-10-18',
      sources: { ncsu: { title: 'NC State Extension', trust: 'reference' }, shop: { title: 'A nursery', trust: 'reference' }, grower: { title: 'A grower', trust: 'nursery' }, compendium: { title: 'Older list', trust: 'unverified' } },
      enums: { form: ['Perennial', 'Shrub'] },
    },
    plants: [
      { id: 'heuchera-villosa', common: 'Hairy alumroot', botanical: 'Heuchera villosa', src: ['ncsu'], audited: '2026-10-18',
        facts: { form: 'Perennial', sun_most: { v: 'Part', src: ['ncsu'], check: 'single', alt: { v: 'Full', src: ['shop'], check: 'reported' } }, sun_least: { v: 'Shade', src: ['ncsu'], check: 'single' } } },
      { id: 'itea', common: 'Sweetspire', botanical: 'Itea virginica', src: ['ncsu'], audited: '2026-10-18', facts: { form: 'Shrub', sun_most: 'Full', sun_least: 'Shade' } },
      { id: 'carex-eburnea', common: 'Bristleleaf sedge', src: ['ncsu'], audited: '2026-10-18',
        facts: { form: 'Perennial', sun_most: 'Full', sun_least: 'Part', zone_min: { v: 2, src: ['grower'], check: 'reported' }, zone_max: { v: 7.5, src: ['grower'], check: 'reported' } } },
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
  await expect(alumroot.getByTestId('reported-flag')).toContainText('what nurseries report for its sun');
  await expect(alumroot.getByTestId('plant-details')).toContainText('Nurseries report: Full sun to shade (A nursery)');
  // Hardiness only a nursery gives says so; one a reference gives doesn't.
  await expect(alumroot.getByTestId('nursery-only')).toHaveCount(0);
  const sedge = page.locator('.plant-item', { hasText: 'Bristleleaf sedge' });
  await sedge.getByTestId('plant-row').click();
  await expect(sedge.getByTestId('nursery-only')).toHaveText('Only nurseries rate this; no published reference gives a range.');
  // Only the references: it's gone.
  await page.getByRole('button', { name: '+ More filters' }).click();
  await page.locator('label', { hasText: 'Include what nurseries report' }).locator('input').uncheck();
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

test('how a plant spreads, by seed and by roots, in one row; the picker can show only plants that stay put', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Blue mistflower');
  const item = page.locator('.plant-item', { hasText: 'Blue mistflower' });
  await item.getByTestId('plant-row').click();
  const details = item.getByTestId('plant-details');
  await expect(details.locator('dt', { hasText: 'Spreads' })).toHaveCount(1);
  await expect(details).toContainText('Self-sows freely; spreads aggressively by roots (aggressive rhizome)');
  await expect(details.locator('dt', { hasText: /^Habit$/ })).toHaveCount(0); // (said under "Spreads")
  // "Stays put": no runners, and self-sows no more than a little.
  await page.getByRole('button', { name: '+ More filters' }).click();
  await page.getByTestId('spread-filter').selectOption('stays');
  await expect(page.locator('.plant-item', { hasText: 'Blue mistflower' })).toHaveCount(0);
  await page.getByTestId('spread-filter').selectOption('aggressive');
  await expect(page.locator('.plant-item', { hasText: 'Blue mistflower' })).toHaveCount(1);
});
