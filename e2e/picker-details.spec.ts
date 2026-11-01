import { test, expect, type Page } from '@playwright/test';
import { addPlainShape, autoDialogs, closeSheet, field, openFilters, openFresh } from './helpers';

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
  await expect(details).toContainText('earlier list, unverified');
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
      sources: { ncsu: { title: 'NC State Extension', trust: 'reference' }, shop: { title: 'A nursery', trust: 'nursery' }, grower: { title: 'A grower', trust: 'nursery' }, grower2: { title: 'Another grower', trust: 'nursery' }, compendium: { title: 'Earlier list', trust: 'unverified' } },
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
  await openFilters(page);
  await page.locator('.sheet select').filter({ has: page.locator('option', { hasText: 'Any sun' }) }).selectOption('Full');
  const alumroot = page.locator('.plant-item', { hasText: 'Hairy alumroot' });
  await expect(alumroot.getByTestId('row-flag')).toBeVisible();
  await expect(page.locator('.plant-item', { hasText: 'Sweetspire' }).getByTestId('row-flag')).toHaveCount(0);
  // Each row says how far it's checked: all earlier list, some, or (no badge) every detail sourced.
  await expect(page.locator('.plant-item', { hasText: 'Old-list aster' }).locator('.unverified-badge')).toHaveText('Unverified');
  await expect(page.locator('.plant-item', { hasText: 'Half-checked aster' }).locator('.unverified-badge')).toHaveText('Partly checked');
  await expect(page.locator('.plant-item', { hasText: 'Sweetspire' }).locator('.unverified-badge')).toHaveCount(0);
  // In groups: what its sources say fits; below a divider, what fits by what other sources say (with Hide); below
  // another, what fits only by the earlier list.
  const order = () => page.locator('.list-divider, .plant-item .pname').evaluateAll((els) => els.map((e) => (e.classList.contains('list-divider') ? '|' + e.getAttribute('data-testid') : e.textContent)));
  await expect.poll(order).toEqual(['Bee balm', 'Bristleleaf sedge', 'Sweetspire', '|others-divider', 'Hairy alumroot', '|earlier-divider', 'Half-checked aster', 'Old-list aster']);
  await expect(page.getByTestId('others-divider')).toContainText('Other sources say these take full sun too');
  await expect(page.getByTestId('earlier-divider')).toContainText('These match on sun only by the earlier list (unverified).');
  await page.getByTestId('hide-others').click();
  await expect(page.locator('.plant-item', { hasText: 'Hairy alumroot' })).toHaveCount(0);
  await expect(page.getByTestId('others-hidden')).toContainText('1 more fit by what other sources say.');
  await page.getByTestId('show-others').click();
  await expect(page.locator('.plant-item', { hasText: 'Hairy alumroot' })).toHaveCount(1);
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
  await openFilters(page);
  await page.locator('label', { hasText: 'Where sources disagree, count both values' }).locator('input').uncheck();
  await expect(page.locator('.plant-item', { hasText: 'Hairy alumroot' })).toHaveCount(0);
  // Placing works from the row's button.
  await page.locator('.plant-item', { hasText: 'Sweetspire' }).getByTestId('plant-place').click();
  await expect(page.getByTestId('place-bar')).toBeVisible();
});

test('when a plant blooms and its flowers\' color, each with its source; the earlier list\'s months beside a sourced season', async ({ page }) => {
  const catalog = {
    meta: {
      format: 'lp-catalog', version: 2, zones: 'half', title: 'Test catalog', updated: '2026-10-25',
      sources: { ncsu: { title: 'NC State Extension', trust: 'reference' }, usda: { title: 'USDA PLANTS Database', trust: 'reference' }, compendium: { title: 'Earlier list', trust: 'unverified' } },
      enums: { form: ['Perennial', 'Tree'] },
    },
    plants: [
      { id: 'phlox-paniculata', common: 'Garden phlox', botanical: 'Phlox paniculata', src: ['compendium'], audited: '2026-10-25',
        facts: { form: 'Perennial', bloom: { start: 7, end: 9, color: 'Pink' }, bloom_season: { v: ['summer'], src: ['ncsu', 'usda'], check: 'confirmed' },
          flower_color: { v: ['pink', 'white', 'purple'], src: ['ncsu'], check: 'single' } } },
      { id: 'phlox-david', common: "Garden phlox 'David'", botanical: "Phlox paniculata 'David'", parent: 'phlox-paniculata', src: ['ncsu'], audited: '2026-10-25',
        facts: { flower_color: { v: ['white'], src: ['ncsu'], check: 'single' } } },
      { id: 'quercus-alba', common: 'White oak', botanical: 'Quercus alba', src: ['compendium'], audited: '2026-10-25',
        facts: { form: 'Tree', bloom_season: { v: ['mid spring'], src: ['usda'], check: 'single' }, flower_color: { v: ['yellow', 'insignificant'], src: ['usda'], check: 'single' } } },
      { id: 'aster', common: 'Old-list aster', src: ['compendium'], audited: null, facts: { form: 'Perennial', bloom: { start: 9, end: 10, color: 'Lavender' } } },
    ],
  };
  await page.route('**/plants.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }));
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const open = async (name: string) => {
    const item = page.locator('.plant-item', { hasText: name }).first();
    await item.getByTestId('plant-row').click();
    const details = item.getByTestId('plant-details');
    return (label: string) => details.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
  };
  // Its season, from NC State and USDA; the earlier list's months under it, labeled; its colors from NC State.
  const phlox = await open('Garden phlox');
  await expect(phlox('Bloom').getByTestId('bloom-season')).toHaveText('Summer');
  await expect(phlox('Bloom')).toContainText('NC State Extension, USDA PLANTS Database · confirmed');
  await expect(phlox('Bloom').getByTestId('bloom-months')).toHaveText('Jul–Sep');
  await expect(phlox('Bloom')).toContainText('earlier list, unverified');
  await expect(phlox('Flower color')).toContainText('Pink, white, purple');
  await expect(phlox('Flower color').locator('.details-src')).toHaveText('NC State Extension · one source');
  // A cultivar blooms when its species does (said so), in its own colors. (Found by its name: a cultivar folds
  // under its species otherwise.)
  await page.getByTestId('plant-search').fill('david');
  const david = await open("Garden phlox 'David'");
  await expect(david('Bloom')).toContainText('Summer');
  await expect(david('Bloom')).toContainText('from its species');
  await expect(david('Flower color')).toContainText('White');
  // USDA's finer season, as it writes it; flowers it calls not conspicuous: not showy.
  await page.getByTestId('plant-search').fill('');
  const oak = await open('White oak');
  await expect(oak('Bloom').getByTestId('bloom-season')).toHaveText('Mid spring');
  await expect(oak('Flower color')).toContainText('Yellow; not showy');
  // Only the earlier list: its months and its color, each labeled.
  const aster = await open('Old-list aster');
  await expect(aster('Bloom')).toContainText('Sep–Oct');
  await expect(aster('Flower color')).toContainText('Lavender');
  await expect(aster('Flower color').locator('.details-src')).toHaveText('earlier list, unverified');
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
  // (Both parts read from NC State's description, 2026-10-27: "freely self-seed", "they sucker profusely".)
  await page.getByTestId('plant-search').fill('Trumpet creeper');
  const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Trumpet creeper$/ }) });
  await item.getByTestId('plant-row').click();
  const details = item.getByTestId('plant-details');
  await expect(details.locator('dt', { hasText: 'How it spreads' })).toHaveCount(1);
  const spreads = details.getByTestId('spreads');
  await expect(spreads.locator('.details-part')).toHaveText(['Self-sows freely', 'Spreads aggressively underground or by runners: Suckering colonizer']);
  await expect(spreads.locator('.details-src')).toHaveText(['Prose description, NC State Extension Gardener Plant Toolbox · one source']); // (each part its own source; one line where they share it)
  await expect(details.locator('dt', { hasText: /^Habit$/ })).toHaveCount(0); // (said under "How it spreads")
  // The picker: the ways of spreading you're OK with; a plant shows only if every way it spreads is ticked.
  await openFilters(page);
  const spreading = page.getByTestId('spread-filter');
  await expect(spreading.locator('legend')).toHaveText('Spreading you\u2019re OK with (unverified)');
  const tick = (name: string) => spreading.locator('label', { hasText: name }).locator('input');
  const creeper = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Trumpet creeper$/ }) });
  await tick('Stays put').check();
  await expect(creeper).toHaveCount(0);
  await tick('Spreads aggressively').check(); // (it self-sows freely too: not yet)
  await expect(creeper).toHaveCount(0);
  await tick('Self-sows freely').check();
  await expect(creeper).toHaveCount(1);
  await expect(page.getByTestId('active-chip')).toHaveText(['Spreading OK: stays put', 'Spreading OK: spreads aggressively by runners or underground', 'Spreading OK: self-sows freely']);
});

test('the mature-height slider narrows the list to a range, either end open', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await openFilters(page);
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
  await openFilters(page);
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
  await page.getByTestId('reset-filters').click();
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
  await search.fill('witchhazel'); // ("Hybrid Witchhazel", and the witch hazels after it)
  await expect(rows.first()).toContainText(/witch ?hazel/i);
  await expect(page.getByTestId('near-note')).toHaveCount(0);
  await search.fill('viburnam');
  await expect(page.getByTestId('near-note')).toContainText('Nothing matches “viburnam” as typed. Close spellings:');
  await expect(rows.first()).toContainText(/viburnum/i);
  await expect(page.getByTestId('add-own-plant')).toBeVisible();
  // A search of punctuation alone (the start of a cultivar's name) isn't a search: the list is browsing again.
  await search.fill("'");
  await expect(page.getByTestId('picker-count')).toContainText(/^All \d,\d{3} plants/);
});

test('a plant poisonous to people says so, beside Edible, and the picker can keep only plants with none listed', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Mayapple');
  const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Mayapple$/ }) });
  // (Its row marks only what touching it can do; what eating it does is in its details and the filter.)
  await expect(item.getByTestId('row-skin')).toHaveText('Can irritate skin');
  await expect(item.getByTestId('plant-row')).not.toContainText('poisonous');
  await item.getByTestId('plant-row').click();
  const details = item.getByTestId('plant-details');
  // NC State's words: the parts, how severe, skin irritation, credited to it; and its fruit is edible all the same.
  const row = (label: string) => details.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
  await expect(row('Poisonous to people')).toContainText('Leaves, roots, seeds and stems, high severity; can irritate skin');
  await expect(row('Poisonous to people').locator('.details-src')).toContainText('NC State');
  await expect(row('Edible')).toContainText(/^Fruit, though it's also listed as poisonous to people/); // (the part NC State marks edible)
  // A plant whose NC State page lists none says so, and the filter keeps only such plants.
  await page.getByTestId('plant-search').fill('Autumn Bride');
  const heuchera = page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" });
  await heuchera.getByTestId('plant-row').click();
  await expect(heuchera.getByTestId('plant-details').locator('dt', { hasText: /^Poisonous to people$/ }).locator('xpath=following-sibling::dd[1]')).toContainText('None listed');
  await openFilters(page); // (Poison & pets, among them)
  await page.locator('label', { hasText: 'Not listed as poisonous to people' }).locator('input').check();
  await expect(page.getByTestId('active-chip')).toHaveText(['Not listed as poisonous to people']);
  await expect(heuchera).toHaveCount(1);
  await page.getByTestId('plant-search').fill('Mayapple');
  await expect(page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Mayapple$/ }) })).toHaveCount(0);
});

test('a plant\'s leaves: their colors, what they do in winter, fall color and growth rate; the picker can keep only evergreens', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Red maple');
  const maple = page.locator('.plant-item', { hasText: /^Red maple/ }).first();
  await maple.getByTestId('plant-row').click();
  const details = maple.getByTestId('plant-details');
  const row = (label: string) => details.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
  await expect(row('Leaf colors')).toContainText('Gold, green, orange');
  await expect(row('In winter')).toContainText('Deciduous: loses its leaves');
  await expect(row('In winter').locator('.details-src').first()).toContainText(/NC State.*, USDA.* · confirmed/);
  await expect(row('Fall color')).toContainText('Yes: gold, red');
  await expect(row('Growth rate')).toContainText('Fast');
  // An herb's winter is dying back: Heuchera 'Autumn Bride' keeps its leaves, NC State says.
  await page.getByTestId('plant-search').fill('Autumn Bride');
  const heuchera = page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" });
  await heuchera.getByTestId('plant-row').click();
  await expect(heuchera.getByTestId('plant-details').locator('dt', { hasText: /^In winter$/ }).locator('xpath=following-sibling::dd[1]')).toContainText('Evergreen: keeps its leaves');
  // Evergreens only: the heuchera stays, the maple goes.
  await openFilters(page);
  await page.locator('label', { hasText: /^Evergreen$/ }).locator('input').check();
  await expect(heuchera).toHaveCount(1);
  await page.getByTestId('plant-search').fill('Red maple');
  await expect(page.locator('.plant-item', { hasText: /^Red maple/ })).toHaveCount(0);
});

test('animal toxicity: dogs three ways, and a warning given for one record of a species shows on the others', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const count = page.getByTestId('picker-count');
  await expect(count).toContainText(/^All /);
  const fold = page.getByTestId('filters');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await fold.click();
  await expect(page.getByTestId('dogs-any')).toBeChecked();
  await page.getByTestId('dogs-hideToxic').check();
  await expect(fold).toHaveText('Filters (1 on)');
  await expect(page.getByTestId('active-chip')).toHaveText(['No dog warnings']);
  await expect(page.getByTestId('dogs-note')).toContainText(/Hides the \d+ plants with a warning for dogs; keeps the [\d,]+ not yet rated/);
  await expect(count).toContainText(/^[\d,]+ of [\d,]+ plants match/);
  // NC State lists it as a problem for dogs: hidden; any shows it, saying so.
  await page.getByTestId('plant-search').fill('Butterfly milkweed');
  const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Butterfly milkweed$/ }) });
  await expect(item).toHaveCount(0);
  await openFilters(page); // (typing a search folds them: Jason, Nov 1)
  await page.getByTestId('dogs-any').check();
  await expect(item).toHaveCount(1);
  await item.getByRole('button', { name: /Butterfly milkweed/ }).first().click();
  await expect(item.getByTestId('tox-row')).toContainText('A problem for dogs, cats and horses');
  // The species record carries another record's warning (the earlier list's), so hiding toxic hides it too; any shows
  // it again, saying where the warning came from.
  await page.getByTestId('dogs-hideToxic').check();
  await page.getByTestId('plant-search').fill('Yaupon');
  const yaupon = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Yaupon$/ }) });
  await expect(yaupon).toHaveCount(0);
  await openFilters(page);
  await page.getByTestId('dogs-any').check();
  await expect(yaupon).toHaveCount(1);
  await yaupon.getByRole('button', { name: /Yaupon/ }).first().click();
  await expect(yaupon.getByTestId('tox-row')).toContainText("given for Dwarf yaupon holly 'Schillings', the same species");
  // A plant no source rates says so, rather than nothing (never "safe").
  await page.getByTestId('plant-search').fill("'Acapulco Orange'");
  const unrated = page.locator('.plant-item').first();
  await unrated.getByRole('button', { name: /Acapulco Orange/ }).first().click();
  await expect(unrated.getByTestId('tox-row')).toContainText(/^(Not rated for pets|Not listed as a problem for dogs, cats or horses)/);
  // Cats and horses: NC State's warnings hide it.
  await openFilters(page);
  await page.getByTestId('dogs-any').check();
  await page.getByTestId('plant-search').fill('Butterfly milkweed');
  await openFilters(page);
  await page.locator('label', { hasText: 'Hide plants that are a problem for horses' }).locator('input').check();
  await expect(item).toHaveCount(0);
  await page.getByTestId('plant-search').fill("'Acapulco Orange'");
  // Clearing the filters keeps the search and the open section.
  await openFilters(page);
  await page.getByTestId('dogs-nonToxic').check();
  await page.getByTestId('reset-filters').click();
  await expect(page.getByTestId('dogs-any')).toBeChecked();
  await expect(page.locator('label', { hasText: 'Hide plants that are a problem for horses' }).locator('input')).not.toBeChecked();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('plant-search')).toHaveValue("'Acapulco Orange'");
});

test('the search clears in one tap, and a search the filters empty says which filters hid it', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const search = page.getByTestId('plant-search');
  await expect(search).toHaveAttribute('placeholder', 'Search plants or butterflies…');
  await expect(page.getByTestId('clear-search')).toBeHidden();
  await search.fill('Autumn Bride');
  await page.getByTestId('clear-search').click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused(); // (the keyboard stays)
  await expect(page.getByTestId('clear-search')).toBeHidden();
  // A filter that hides everything the search finds; Show them takes off that one only (Marcus, Oct 30: it cleared all).
  await openFilters(page);
  await page.getByText('Takes wet soil', { exact: true }).click();
  await page.getByText('Clay OK', { exact: true }).click();
  await search.fill('Autumn Bride');
  await expect(page.getByTestId('hidden-by')).toContainText(/plants? match.* “Autumn Bride”, hidden by your filters: Takes wet soil\./);
  await page.getByTestId('show-hidden').click();
  await expect(page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" }).first()).toBeVisible();
  await expect(page.getByTestId('plant-search')).toHaveValue('Autumn Bride'); // (the search stays)
  // Set aside for this search only: every filter stays on, said so, and they're back for the next search.
  await expect(page.getByTestId('set-aside')).toContainText('Showing what your filters hid for “Autumn Bride” (Takes wet soil)');
  await openFilters(page); // (typing the search folded them: Jason, Nov 1)
  await expect(page.getByRole('checkbox', { name: 'Clay OK', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Takes wet soil', exact: true })).toBeChecked();
  await search.fill('Autumn Brid');
  await expect(page.getByTestId('set-aside')).toHaveCount(0);
  await expect(page.getByTestId('hidden-by')).toContainText('hidden by your filters: Takes wet soil');
  await openFilters(page);
  await page.getByRole('checkbox', { name: 'Takes wet soil', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Clay OK', exact: true }).click();
  // Some found, more hidden: said above them (Ruth, Oct 30: "milkweed" with "Not poisonous" on found two).
  await page.getByRole('checkbox', { name: 'Clay OK', exact: true }).click();
  await search.fill('heuchera');
  await expect(page.locator('.plant-item').first()).toBeVisible();
  await expect(page.getByTestId('hidden-by')).toContainText(/\d+ more plants? match.* “heuchera”, hidden by your filters: Clay OK/);
  // Found by what it feeds, in words.
  await page.getByTestId('plant-search').fill('mourning cloak');
  await expect(page.getByTestId('host-match').first()).toContainText(/Its leaves feed the caterpillars of: .*mourning cloak/i);
});

test('flower color: a cultivar or one-color species first, a species that comes in it among others below a divider', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('coneflower');
  await openFilters(page);
  await page.locator('[data-testid=flower-colors] label', { hasText: 'Red' }).click();
  const names = page.locator('.pname, [data-testid=comes-in-divider]');
  await expect(page.getByTestId('comes-in-divider')).toHaveText('Also comes in red, depending on the plant you buy');
  const order = await names.allTextContents();
  const at = (t: string) => order.findIndex((x) => x.startsWith(t));
  expect(at("Coneflower 'Tomato Soup'")).toBeGreaterThanOrEqual(0);
  expect(at("Coneflower 'Tomato Soup'")).toBeLessThan(at('Also comes in red'));
  expect(at('Purple coneflower (species)')).toBeGreaterThan(at('Also comes in red'));
  // What's on, above the list: a chip each; taking one off clears its control too.
  await expect(page.getByTestId('active-chip')).toHaveText(['Red flowers']);
  await page.getByRole('button', { name: 'Remove filter: Red flowers' }).click();
  await expect(page.getByTestId('active-filters')).toBeHidden();
  await expect(page.locator('[data-testid=flower-colors] label', { hasText: 'Red' }).locator('input')).not.toBeChecked();
  await expect(page.getByTestId('comes-in-divider')).toHaveCount(0);
});

test('the filters say what they\'re set to: a dropdown names itself, a month met by season is marked, More filters counts what\'s on', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  // The checking note: one line, the rest a tap away.
  await expect(page.getByTestId('unverified-note')).toContainText('Not every detail is checked yet.');
  await page.getByTestId('unverified-more').click();
  await expect(page.getByTestId('unverified-note')).toContainText('Unverified: all its details are from an earlier list');
  await openFilters(page);
  const water = page.locator('.sheet select[aria-label="Water needs"]');
  await water.selectOption('Low');
  await expect(water.locator('option:checked')).toHaveText('Water needs: low');
  await expect(water.locator('option[value=Moderate]')).toHaveText('Moderate');
  // Blooming in: seasons, then months; a plant with only a season counts for its months, marked.
  const bloom = page.locator('.sheet select[aria-label="Blooming in"]');
  await water.selectOption('');
  await bloom.selectOption('6');
  await expect(bloom.locator('option:checked')).toHaveText('Blooming in June');
  await page.getByTestId('plant-search').fill("Weigela 'Red Prince'");
  const weigela = page.locator('.plant-item', { hasText: "Weigela 'Red Prince'" });
  await expect(weigela.getByTestId('by-season')).toHaveText(/^By season/);
  await expect(weigela.getByTestId('by-season')).toHaveAttribute('title', 'Blooms in spring and summer: counted for June by its season');
  await openFilters(page); // (typing the search folded them)
  await bloom.selectOption('summer');
  await expect(weigela).toHaveCount(1);
  await expect(weigela.getByTestId('by-season')).toHaveCount(0); // (a season asked for: no reading of ours)
  // The Filters button says how many are on, folded.
  await openFilters(page);
  await page.locator('.sheet label', { hasText: /^Bees$/ }).click();
  await page.locator('.sheet label', { hasText: 'Deer resistant' }).locator('input').check();
  await page.getByTestId('filters').click();
  await expect(page.getByTestId('all-filters')).toBeHidden();
  await expect(page.getByTestId('filters')).toHaveText('Filters (3 on)');
  await expect(page.getByTestId('active-chip')).toHaveText(['Blooming in summer', 'Attracts bees', 'Deer resistant']);
  // In this plan, beside the search: nothing placed yet, nothing shown.
  await page.getByTestId('plant-search').fill('');
  await page.getByTestId('reset-filters').click();
  await page.getByTestId('in-plan').click();
  await expect(page.getByTestId('in-plan')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('picker-count')).toContainText(/^No plants placed in this plan yet/);
});

test('typing a search folds the open filters, the results in view; Add as my plant is a plain link below them (Jason, Nov 1)', async ({ page, isMobile }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await openFilters(page);
  await expect(page.getByTestId('all-filters')).toBeVisible();
  const search = page.getByTestId('plant-search');
  await search.fill('aster');
  await expect(page.getByTestId('all-filters')).toBeHidden();
  await expect(page.getByTestId('filters')).toHaveAttribute('aria-expanded', 'false');
  await expect(search).toBeFocused();
  await expect(page.locator('.plant-item').first()).toBeInViewport();
  // The link, after the last result.
  const add = page.getByTestId('add-own-plant');
  await expect(add).toHaveText('Add “aster” as my plant');
  await expect(add).toHaveClass(/link-btn/);
  expect(await add.evaluate((a) => [...document.querySelectorAll('.plant-item')].every((r) => r.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  // Opened again by hand, they stay open while the filters change; the next search folds them again.
  await openFilters(page);
  await page.locator('.sheet label', { hasText: 'Evergreen' }).locator('input').check();
  await expect(page.getByTestId('all-filters')).toBeVisible();
  await search.fill('holly');
  await expect(page.getByTestId('all-filters')).toBeHidden();
  await page.getByTestId('reset-filters').click();
  // Nothing found: the link below the note that says so.
  await search.fill('Aunt Lou’s keeper');
  await expect(page.locator('.sheet-body')).toContainText('No matches. Add it as your own plant, or loosen a filter.');
  await expect(add).toHaveText('Add “Aunt Lou’s keeper” as my plant');
  // Switch plant, while placing: the same.
  await search.fill('Black-eyed Susan');
  await page.locator('.plant-item', { hasText: 'Black-eyed Susan' }).first().getByTestId('plant-place').click();
  await page.getByTestId('place-switch').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Switch plant');
  await openFilters(page);
  await page.getByTestId('plant-search').fill('coneflower');
  await expect(page.getByTestId('all-filters')).toBeHidden();
  await expect(page.locator('.plant-item').first()).toBeInViewport();
  if (isMobile) await expect(page.getByTestId('plant-search')).toBeFocused();
});

test('words of need become filters: "shade flowers" is Part shade and a search for "flowers"; a word of a plant\'s name stays the search (Jason, Nov 1)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const search = page.getByTestId('plant-search');
  const chips = page.getByTestId('active-chip');
  await search.fill('shade flowers');
  await expect(search).toHaveValue('flowers');
  await expect(search).toBeFocused(); // (the keyboard kept: nothing redrawn but the list)
  await expect(chips).toHaveText(['Part shade']);
  await expect(page.locator('.sheet select[aria-label=Sun]')).toHaveValue('Part'); // (its control says so too)
  await chips.first().click();
  await expect(chips).toHaveCount(0);
  // Typed a letter at a time: a word becomes its filter once the next one starts; Enter takes the last.
  await search.fill('');
  await search.pressSequentially('evergreen ho');
  await expect(chips).toHaveText(['Evergreen']);
  await expect(search).toHaveValue('ho');
  await search.pressSequentially('lly shrubs');
  await expect(search).toHaveValue('holly shrubs');
  await search.press('Enter');
  await expect(search).toHaveValue('holly');
  await expect(chips).toHaveText(['Shrub', 'Evergreen']);
  await expect(page.locator('.sheet select[aria-label=Form]')).toHaveValue('Shrub');
  await page.getByTestId('reset-filters').click();
  // Part of a plant's name: stays the search, no filter ("Deer fern"; "Native azaleas"; "Butterfly weed (clay strain)").
  for (const name of ['Deer fern', 'Native azaleas', 'Butterfly weed clay']) {
    await page.getByTestId('plant-search').fill(name);
    await page.getByTestId('plant-search').press('Enter');
    await expect(page.getByTestId('plant-search')).toHaveValue(name);
    await expect(chips).toHaveCount(0);
  }
  await expect(page.locator('.plant-item .pname').first()).toContainText('Butterfly weed (clay strain)');
  // Several at once, with the little words between them; native to North America with no ZIP yet.
  await page.getByTestId('plant-search').fill('native shrubs for wet clay soil ');
  await expect(page.getByTestId('plant-search')).toHaveValue('');
  await expect(chips).toHaveText(['Shrub', 'Native to North America', 'Takes wet soil', 'Clay OK']);
  await expect(page.locator('.sheet-body')).not.toContainText('No matches');
});

test('Blooming in a month: plants with months for it first, those known only by season folded below, saying why (Jason, Nov 1)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await openFilters(page);
  await page.locator('.sheet select[aria-label="Blooming in"]').selectOption('3');
  const fold = page.getByTestId('season-fold');
  // No ZIP: hardly a plant has months for March, and the note says what a ZIP adds.
  await expect(page.getByTestId('season-why')).toHaveText('Their sources give a season, not months, and we count March as spring. Your ZIP adds months from flowering records near the garden, where there are enough.');
  await closeSheet(page);
  await page.getByTestId('first-zip').fill('71923');
  await page.getByTestId('first-zip-lookup').click();
  await expect(page.getByTestId('location-result')).toContainText('Zone');
  await closeSheet(page);
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('season-why')).toHaveText('Their sources give a season, not months, and we count March as spring. There aren’t enough flowering records near the garden to give their months.');
  // Months from flowering records near the garden first; by season after every one of them, folded.
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(fold).toHaveText(/^By season only: [\d,]+ more$/);
  await expect(page.locator('.plant-item').first()).toBeVisible();
  const above = page.locator('.sheet-body .plant-item:not(.cultivar-list .plant-item)'); // (a genus's own fold aside)
  expect(await above.count()).toBeGreaterThan(0);
  await expect(above.getByTestId('by-season')).toHaveCount(0);
  expect(await fold.evaluate((f) => [...document.querySelectorAll('.plant-item')].every((r) => r.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  // Opened: each marked by season, and why on its own row.
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  const inFold = page.getByTestId('season-list').locator('.plant-item');
  await expect(inFold.first().getByTestId('by-season')).toHaveAttribute('title', /counted for March by its season/);
});

test('a row: its bloom months, and a small flower in its flowers\' color in a circle of its leaves\' (Jason, Nov 1, from the UI review)', async ({ page }) => {
  await openFresh(page);
  await page.getByTestId('first-zip').fill('71923');
  await page.getByTestId('first-zip-lookup').click();
  await expect(page.getByTestId('location-result')).toContainText('Zone');
  await closeSheet(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Butterfly milkweed');
  const row = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Butterfly milkweed$/ }) });
  const spot = row.getByTestId('row-dot');
  await expect(spot).toHaveAttribute('role', 'img');
  await expect(spot).toHaveAttribute('aria-label', 'orange flowers, green leaves');
  await expect(spot.getByTestId('spot-flower')).toHaveAttribute('fill', '#f08a24');
  // Its months where the garden is, short, as its details give them; "Blooms" said to a screen reader.
  const months = row.getByTestId('row-bloom');
  await expect(months).toHaveText(/^Blooms [A-Z][a-z]{2}(–[A-Z][a-z]{2})?$/);
  const said = (await months.textContent())!.replace('Blooms ', '');
  await expect(row.getByTestId('plant-row')).toHaveAccessibleName(/^Butterfly milkweed .*Blooms .* orange flowers, green leaves$/);
  await row.getByTestId('plant-row').click();
  await expect(row.getByTestId('plant-details')).toContainText(`${said}, peak`);
  // No showy flowers on record: the circle alone, and no months.
  await page.getByTestId('plant-search').fill('Christmas fern');
  const fern = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Christmas fern$/ }) });
  await expect(fern.getByTestId('row-dot')).toHaveAttribute('aria-label', /^[a-z ]+ leaves$/);
  await expect(fern.getByTestId('row-dot').getByTestId('spot-flower')).toHaveCount(0);
  await expect(fern.getByTestId('row-bloom')).toHaveCount(0);
});

test('a row fits 360 px at every text size: its name, spot, months, Place and copy, nothing pushed off (Jason, Nov 1)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openFresh(page);
  await page.getByTestId('first-zip').fill('71923');
  await page.getByTestId('first-zip-lookup').click();
  await expect(page.getByTestId('location-result')).toContainText('Zone');
  await closeSheet(page);
  for (const size of ['small', 'medium', 'large', 'xlarge']) {
    await page.evaluate((s) => localStorage.setItem('lp-text-size-2', s), size);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-text', size);
    await page.locator('.tool-btn.plants').click();
    await page.getByTestId('plant-search').fill('Purple coneflower');
    const row = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Purple coneflower/ }) }).first();
    await row.scrollIntoViewIfNeeded();
    const box = async (l: ReturnType<typeof row.locator>) => (await l.boundingBox())!;
    const spot = await box(row.getByTestId('row-dot')), name = await box(row.locator('.pname'));
    const place = await box(row.getByTestId('plant-place')), copy = await box(row.locator('.proj-row > .iconbtn'));
    expect([Math.round(spot.width), Math.round(spot.height)], size).toEqual([20, 20]);
    expect(spot.x + spot.width, size).toBeLessThanOrEqual(name.x); // (drawn first, though read last)
    expect(name.width, `${size}: the name keeps the room it had`).toBeGreaterThan(100);
    expect(copy.x + copy.width, size).toBeLessThanOrEqual(360);
    expect(place.x + place.width, size).toBeLessThanOrEqual(copy.x);
    await expect(row.getByTestId('row-bloom')).toBeVisible();
    expect(await row.evaluate((e) => e.scrollWidth <= e.clientWidth), size).toBe(true);
    // The months and their flower kept together on one line.
    const bloom = await box(row.getByTestId('row-bloom'));
    expect(bloom.height, size).toBeLessThan(40);
    await closeSheet(page);
  }
});

test('what makes a plant\'s winter interest, each part with its source: showy bark, fruit into winter', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const open = async (name: string) => {
    await page.getByTestId('plant-search').fill(name);
    const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: new RegExp(`^${name}$`) }) });
    await item.getByTestId('plant-row').click();
    return item.getByTestId('plant-details');
  };
  const birch = await open('River birch');
  await expect(birch.getByTestId('winter-bark')).toHaveText('Showy bark: exfoliating, papery, peeling');
  await expect(birch.getByTestId('winter-listed')).toHaveText('Listed for winter gardens');
  await expect(birch.getByTestId('winter-row').locator('.details-src').nth(1)).toContainText('NC State');
  await expect(birch.locator('dt', { hasText: /^Bark$/ }).locator('xpath=following-sibling::dd[1]')).toContainText('Exfoliating, papery, peeling, ridges, smooth; light brown, orange');
  await expect(birch.locator('dt', { hasText: /^Winter interest$/ })).toHaveCount(0); // (said under In winter)
  const winterberry = await open('Winterberry holly');
  await expect(winterberry.getByTestId('winter-fruit')).toHaveText('Fruit stays into winter: yellow, orange, red');
});

test('a cultivar once grouped with another has a record of its own; one no source sizes takes its species\' size, said so', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const open = async (search: string, name: string) => {
    await page.getByTestId('plant-search').fill(search);
    const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: new RegExp(`^${name}$`) }) });
    await item.getByTestId('plant-row').click();
    const details = item.getByTestId('plant-details');
    return (label: string) => details.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
  };
  const kanza = await open('Kanza', "Pecan 'Kanza'");
  // (Height and spread in one row, Size: Jason, 2026-10-29.)
  await expect(kanza('Size')).toContainText('from its species');
  // The record it was grouped in, now the one cultivar whose size it showed.
  const lakota = await open('Lakota', "Pecan 'Lakota'");
  await expect(lakota('Size')).not.toContainText('from its species');
});

test('how much deer eat it, in plain words', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Buttonbush');
  const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Buttonbush$/ }) }).first();
  await item.getByTestId('plant-row').click();
  const deer = item.getByTestId('plant-details').locator('dt', { hasText: /^Deer$/ }).locator('xpath=following-sibling::dd[1]');
  await expect(deer).toContainText('Sometimes browsed');
  await expect(deer).not.toContainText('Occasional');
});

test('a plant\'s facts fold into groups that open with a tap, stay open until the picker closes, and never fold a warning away', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const open = async (name: string) => {
    await page.getByTestId('plant-search').fill(name);
    const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: new RegExp(`^${name}$`) }) }).first();
    await item.getByTestId('plant-row').click();
    return item.getByTestId('plant-details');
  };
  const hazel = await open('Common witch hazel');
  await expect(hazel.locator('dt', { hasText: /^Size$/ })).toBeVisible();
  await expect(hazel.locator('dt', { hasText: /^Deer$/ })).toBeHidden();
  await expect(hazel.getByTestId('group-growing')).toHaveAttribute('aria-expanded', 'false');
  await expect(hazel.getByTestId('group-growing-sum')).toContainText('Deer resistant');
  await hazel.getByTestId('group-growing').click();
  await expect(hazel.locator('dt', { hasText: /^Deer$/ })).toBeVisible();
  // (Open for the next plant too, while the picker stays open.)
  const buttonbush = await open('Buttonbush');
  await expect(buttonbush.getByTestId('group-growing')).toHaveAttribute('aria-expanded', 'true');
  // A warning: Safety first, open, and its line says it.
  const jessamine = await open('Carolina jessamine');
  await expect(jessamine.locator('.details-group-head').first()).toHaveAttribute('data-testid', 'group-safety');
  await expect(jessamine.getByTestId('group-safety')).toHaveAttribute('aria-expanded', 'true');
  await expect(jessamine.getByTestId('group-safety-sum')).toContainText('Poisonous to people (high severity)');
  // The picker closed and opened again: folded again.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('plant-search')).toHaveCount(0);
  await page.locator('.tool-btn.plants').click();
  const again = await open('Common witch hazel');
  await expect(again.getByTestId('group-growing')).toHaveAttribute('aria-expanded', 'false');
});

test("a plant's spacing, from its sources' spec lines (Oct 29), under Growing", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Buttonbush');
  const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Buttonbush$/ }) }).first();
  await item.getByTestId('plant-row').click();
  const row = item.getByTestId('plant-details').locator('dt', { hasText: /^Spacing$/ }).locator('xpath=following-sibling::dd[1]');
  await expect(row).toContainText('Plant 3–5 ft apart');
  await expect(row).toContainText(/UF|ufl|Prairie Nursery|prairienursery/i);
});

test("a winter no source gives: as its species' USA-NPN records show it, or as expected from its relatives (Oct 29)", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const winter = async (name: string) => {
    await page.getByTestId('plant-search').fill(name);
    const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: new RegExp(`^${name}$`) }) }).first();
    await item.getByTestId('plant-row').click();
    return item.getByTestId('plant-details').locator('dt', { hasText: /^In winter$/ }).locator('xpath=following-sibling::dd[1]');
  };
  const indigo = await winter('Fragrant false indigo');
  await expect(indigo).toContainText('Expected to lose its leaves in winter, like its 2 relatives in the catalog');
  await expect(indigo).toContainText('Not from a source: other species of its genus');
  const grama = await winter('Sideoats grama');
  await expect(grama).toContainText('Goes dormant in winter');
  await expect(grama).toContainText(/USA-NPN observers recorded it bare: \d+ plant-years/);
});

// "Anyone you need to protect?" (Jason, Nov 1, from the UI review: a tester saw "Can irritate skin" on rows but nothing on
// a plant highly poisonous to people, and never learned the picker screens for kids and pets without opening Filters).
// First among the filters until it's answered or dismissed; then under Filters, Poison & pets. Kept on this device.
const protect = (page: Page) => page.getByTestId('protect-line');
/** The line first among the picker's filters, not under Poison & pets. */
const protectAtTop = (page: Page) => page.locator('.picker-filters > [data-testid=protect-line]:first-child');
const protectInGroup = (page: Page) => page.getByTestId('animal-toxicity').getByTestId('protect-line');

test('"Anyone you need to protect?" comes first on a fresh device: Kids, Dogs, Cats and Horses, and why skin irritants are marked for all (Jason, Nov 1)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await expect(protectAtTop(page)).toBeVisible();
  await expect(protect(page)).toHaveCount(1); // (not under Poison & pets too)
  await expect(protect(page).locator('.protect-title')).toHaveText('Anyone you need to protect?');
  await expect(protect(page).locator('.protect-chip')).toHaveText(['Kids', 'Dogs', 'Cats', 'Horses']);
  for (const k of ['kids', 'dogs', 'cats', 'horses']) await expect(page.getByTestId(`protect-${k}`)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('protect-note')).toHaveText("Skin irritants are marked for all: anyone can brush them. Poison if eaten goes by who's in the yard.");
  await expect(protect(page)).not.toContainText(/\b(tap|click)/i);
  await expect(page.getByTestId('protect-dismiss')).toHaveAttribute('aria-label', /^Dismiss/);
  // Above the Filters button, which is folded.
  const line = (await protect(page).boundingBox())!, fold = (await page.getByTestId('filters').boundingBox())!;
  expect(line.y + line.height).toBeLessThanOrEqual(fold.y);
  await expect(page.getByTestId('filters')).toHaveAttribute('aria-expanded', 'false');
  // As the note says: with no one in the yard, a plant poisonous to eat that irritates skin is marked for the skin only.
  await page.getByTestId('plant-search').fill('Mayapple');
  const mayapple = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Mayapple$/ }) });
  await expect(mayapple.getByTestId('row-skin')).toHaveText('Can irritate skin');
  await expect(mayapple.getByTestId('row-poison')).toHaveCount(0);
});

test('"Anyone you need to protect?": Kids hides plants poisonous to people and is kept; it stays till the picker closes, then it\'s under Poison & pets, after a reload too', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('protect-kids').click();
  await expect(page.getByTestId('protect-kids')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('active-chip')).toHaveText(['Not listed as poisonous to people']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lp-yard') ?? 'null'))).toEqual({ kids: true, dogs: '', cats: false, horses: false });
  // Mayapple hidden; shown anyway, it's marked poisonous to people now, and still for the skin.
  await page.getByTestId('plant-search').fill('Mayapple');
  const mayapple = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Mayapple$/ }) });
  await expect(mayapple).toHaveCount(0);
  await page.getByTestId('show-hidden').click();
  await expect(mayapple.getByTestId('row-poison')).toHaveText('Poisonous to people');
  await expect(mayapple.getByTestId('row-skin')).toHaveText('Can irritate skin');
  await page.getByTestId('filters-back').click();
  // In step with Poison & pets, both ways. Dogs is Poison & pets' first dog setting: no dog warnings.
  await expect(protectAtTop(page)).toBeVisible(); // (answered: it stays for now, to see what was set)
  await openFilters(page);
  await expect(page.getByRole('checkbox', { name: 'Not listed as poisonous to people' })).toBeChecked();
  await page.getByTestId('protect-dogs').click();
  await expect(page.getByTestId('dogs-hideToxic')).toBeChecked();
  await page.getByTestId('dogs-any').check();
  await expect(page.getByTestId('protect-dogs')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('checkbox', { name: 'Hide plants that are a problem for cats' }).check();
  await expect(page.getByTestId('protect-cats')).toHaveAttribute('aria-pressed', 'true');
  await expect(protectAtTop(page)).toBeVisible();
  // Closed and opened again: under Poison & pets, as set.
  await closeSheet(page);
  await page.locator('.tool-btn.plants').click();
  await expect(protectAtTop(page)).toHaveCount(0);
  await expect(protectInGroup(page)).toBeVisible(); // (Filters left open)
  await expect(protectInGroup(page).getByTestId('protect-dismiss')).toHaveCount(0);
  await expect(page.getByTestId('protect-kids')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('protect-cats')).toHaveAttribute('aria-pressed', 'true');
  // After a reload too, the Filters fold shut.
  await page.getByTestId('filters').click();
  await page.reload();
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('picker-count')).toBeVisible();
  await expect(protectAtTop(page)).toHaveCount(0);
  await expect(protect(page)).toBeHidden();
  await openFilters(page);
  await expect(protectInGroup(page)).toBeVisible();
  await expect(page.getByTestId('protect-kids')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('lp-protect-line'))).toBe('answered');
});

test('"Anyone you need to protect?" dismissed: under Poison & pets at once, a notice says so, and it stays there after a reload', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('aster');
  await page.getByTestId('protect-dismiss').click();
  await expect(page.locator('#toast')).toHaveText("It's under Filters → Poison & pets.");
  await expect(protectAtTop(page)).toHaveCount(0);
  await expect(page.getByTestId('plant-search')).toHaveValue('aster'); // (moved in place: the search as it was)
  await openFilters(page);
  await expect(protectInGroup(page)).toBeVisible();
  // Who's in the yard is left as it was: no one.
  expect(await page.evaluate(() => [localStorage.getItem('lp-protect-line'), localStorage.getItem('lp-yard')])).toEqual(['dismissed', null]);
  await page.reload();
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('picker-count')).toBeVisible();
  await expect(protectAtTop(page)).toHaveCount(0);
  await expect(protectInGroup(page)).toBeVisible(); // (the Filters fold left open)
});

test('"Anyone you need to protect?" isn\'t asked first on a device that answered step 6 of the introduction, with none ticked', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await page.getByTestId('intro-start').click();
  for (let n = 1; n <= 5; n++) {
    await expect(page.getByTestId('intro-step')).toHaveText(`Step ${n} of 8`);
    await page.getByTestId('intro-skip').click();
  }
  await expect(page.getByTestId('intro-step')).toHaveText('Step 6 of 8');
  await page.getByTestId('intro-done').click(); // (none of the four)
  await expect(page.getByTestId('intro-step')).toHaveText('Step 7 of 8');
  await page.getByTestId('intro-exit').click();
  await page.reload();
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('picker-count')).toBeVisible();
  await expect(protectAtTop(page)).toHaveCount(0);
  await openFilters(page);
  await expect(protectInGroup(page)).toBeVisible();
  for (const k of ['kids', 'dogs', 'cats', 'horses']) await expect(page.getByTestId(`protect-${k}`)).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => [localStorage.getItem('lp-protect-line'), localStorage.getItem('lp-yard')])).toEqual(['answered', null]);
});

test('"Anyone you need to protect?" fits a 360 px phone at every text size: one row of chips, the list still on screen', async ({ page }) => {
  // (360 × 740, a 360-wide phone's screen. At 360 × 640, Extra large starts the first plant just below the screen.)
  await page.setViewportSize({ width: 360, height: 740 });
  await openFresh(page);
  for (const size of ['small', 'medium', 'large', 'xlarge']) {
    await page.evaluate((s) => localStorage.setItem('lp-text-size-2', s), size);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-text', size);
    await page.locator('.tool-btn.plants').click();
    await expect(protectAtTop(page)).toBeVisible();
    const sheet = page.locator('.picker-sheet');
    expect(await sheet.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    const box = (await sheet.boundingBox())!, line = (await protect(page).boundingBox())!;
    expect(line.x).toBeGreaterThanOrEqual(box.x);
    expect(line.x + line.width).toBeLessThanOrEqual(box.x + box.width);
    // One row of chips, inside the line; the × clear of the title.
    const chips = await Promise.all((await protect(page).locator('.protect-chip').all()).map(async (c) => (await c.boundingBox())!));
    for (const c of chips) { expect(c.y).toBeCloseTo(chips[0].y, 0); expect(c.x + c.width).toBeLessThanOrEqual(line.x + line.width); }
    const x = (await page.getByTestId('protect-dismiss').boundingBox())!;
    expect(Math.min(x.width, x.height)).toBeGreaterThanOrEqual(40);
    const title = await protect(page).locator('.protect-title').evaluate((e) => {
      const r = document.createRange(); r.selectNodeContents(e);
      const rects = [...r.getClientRects()];
      return { lines: new Set(rects.map((b) => Math.round(b.top))).size, right: Math.max(...rects.map((b) => b.right)) };
    });
    expect(title.lines).toBe(1);
    expect(title.right).toBeLessThanOrEqual(x.x);
    // The list still starts on the screen.
    const first = (await page.getByTestId('plant-row').first().boundingBox())!;
    expect(first.y).toBeLessThan(740);
  }
});
