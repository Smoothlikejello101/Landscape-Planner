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

test('how a plant spreads, by seed and underground, in one row with a source each; the picker can show only plants that stay put', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Blue mistflower');
  const item = page.locator('.plant-item', { hasText: 'Blue mistflower' });
  await item.getByTestId('plant-row').click();
  const details = item.getByTestId('plant-details');
  await expect(details.locator('dt', { hasText: 'How it spreads' })).toHaveCount(1);
  const spreads = details.getByTestId('spreads');
  await expect(spreads.locator('.details-part')).toHaveText(['Self-sows freely', 'Spreads aggressively underground or by runners: Aggressive rhizome']);
  await expect(spreads.locator('.details-src')).toHaveText(['older list, unverified']); // (each part its own source; one line where they share it)
  await expect(details.locator('dt', { hasText: /^Habit$/ })).toHaveCount(0); // (said under "How it spreads")
  await page.getByRole('button', { name: '+ More filters' }).click();
  await expect(page.getByTestId('spread-filter').locator('option[value="stays"]')).toHaveText('Stays put (unverified)');
  await page.getByTestId('spread-filter').selectOption('stays');
  await expect(page.locator('.plant-item', { hasText: 'Blue mistflower' })).toHaveCount(0);
  await page.getByTestId('spread-filter').selectOption('aggressive');
  await expect(page.locator('.plant-item', { hasText: 'Blue mistflower' })).toHaveCount(1);
});

test('the mature-height slider narrows the list to a range, either end open', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByRole('button', { name: '+ More filters' }).click();
  // (Set a handle as a drag would: its value, then input and change.)
  const set = async (id: string, stop: number) => page.getByTestId(id).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, stop);
  await expect(page.getByTestId('height-readout')).toHaveText('Any height');
  await page.getByTestId('plant-search').fill('oak');
  await expect(page.locator('.plant-item', { hasText: 'Bur oak' })).toHaveCount(1);
  await set('height-max', 7); // (10 ft)
  await expect(page.getByTestId('height-readout')).toHaveText('Up to 10 ft');
  await expect(page.locator('.plant-item', { hasText: 'Bur oak' })).toHaveCount(0);
  await set('height-max', 14); // (no tallest)
  await set('height-min', 9); // (20 ft)
  await expect(page.getByTestId('height-readout')).toHaveText('20 ft and taller');
  await expect(page.locator('.plant-item', { hasText: 'Bur oak' })).toHaveCount(1);
  await page.getByTestId('plant-search').fill('heuchera');
  await expect(page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" })).toHaveCount(0);
  await set('height-min', 1); // (1 ft)
  await set('height-max', 2); // (2 ft)
  await expect(page.getByTestId('height-readout')).toHaveText('1–2 ft');
  await expect(page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" })).toHaveCount(1);
});

test('the height slider\'s handles can be dragged, and settle in order a step apart', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByRole('button', { name: '+ More filters' }).click();
  const max = page.getByTestId('height-max'), min = page.getByTestId('height-min');
  await max.scrollIntoViewIfNeeded();
  // (A real drag: from the tallest handle's spot at the right end to the middle stop, 10 ft.)
  const box = (await max.boundingBox())!;
  const thumb = 40, xAt = (i: number) => box.x + thumb / 2 + (i / 14) * (box.width - thumb);
  await page.mouse.move(xAt(14), box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(xAt(7), box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('height-readout')).toHaveText('Up to 10 ft');
  // Dragged all the way left, the tallest stays a step above the shortest: up to 1 ft, never "up to 0".
  await page.mouse.move(xAt(7), box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('height-readout')).toHaveText('Up to 1 ft');
  await expect(min).toHaveValue('0');
  await expect(max).toHaveValue('1');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByTestId('height-readout')).toHaveText('Any height');
});

test('search matches word by word, in any order, and forgives a slip when nothing matches exactly', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const search = page.getByTestId('plant-search');
  const rows = page.locator('.plant-item [data-testid=plant-row]');
  await search.fill('Bradford pear'); // ("Bradford/Callery pear")
  await expect(rows.first()).toContainText('Bradford/Callery pear');
  await search.fill('Winterthur viburnum'); // ("Witherod viburnum 'Winterthur'")
  await expect(rows.first()).toContainText("Witherod viburnum 'Winterthur'");
  await search.fill('witchhazel');
  await expect(rows.first()).toContainText('witch hazel');
  await expect(page.getByTestId('near-note')).toHaveCount(0);
  await search.fill('viburnam');
  await expect(page.getByTestId('near-note')).toContainText('Nothing matches “viburnam” as typed. Close spellings:');
  await expect(rows.first()).toContainText('viburnum');
  await expect(page.getByTestId('add-own-plant')).toBeVisible();
  // A search of punctuation alone (the start of a cultivar's name) isn't a search: no invasives slip in.
  await search.fill("'");
  await expect(page.locator('.plant-item', { hasText: 'Chinese privet' })).toHaveCount(0);
});
