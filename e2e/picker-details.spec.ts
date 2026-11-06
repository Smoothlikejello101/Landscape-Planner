import { test, expect, type Page } from '@playwright/test';
import { addPlainShape, autoDialogs, closeSheet, field, openFilters, openFresh, placeOnceAtCenter } from './helpers';

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

test('with ten or more sure matches, the less-sure groups fold into one line that says how many and opens them; fewer, or a search, and they show as before (Jason, Nov 4)', async ({ page }) => {
  const sure = (i: number, form = 'Perennial') => ({ id: `sure-${i}`, common: `Sure plant ${String(i).padStart(2, '0')}`, botanical: `Surea plantus ${i}`, src: ['ncsu'], audited: '2026-10-18', facts: { form, sun_most: 'Full', sun_least: 'Part' } });
  const catalog = {
    meta: {
      format: 'lp-catalog', version: 2, zones: 'half', title: 'Test catalog', updated: '2026-10-18',
      sources: { ncsu: { title: 'NC State Extension', trust: 'reference' }, shop: { title: 'A nursery', trust: 'nursery' }, compendium: { title: 'Earlier list', trust: 'unverified' } },
      enums: { form: ['Perennial', 'Shrub'] },
    },
    plants: [
      ...Array.from({ length: 9 }, (_, i) => sure(i + 1)), sure(10, 'Shrub'),
      { id: 'heuchera-villosa', common: 'Hairy alumroot', botanical: 'Heuchera villosa', src: ['ncsu'], audited: '2026-10-18',
        facts: { form: 'Perennial', sun_most: { v: 'Part', src: ['ncsu'], check: 'single', alt: { v: 'Full', src: ['shop'], check: 'reported' } }, sun_least: { v: 'Shade', src: ['ncsu'], check: 'single' } } },
      { id: 'old', common: 'Old-list aster', src: ['compendium'], audited: null, facts: { form: 'Perennial', sun_most: 'Full', sun_least: 'Part' } },
    ],
  };
  await page.route('**/plants.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }));
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await openFilters(page);
  await page.locator('.sheet select').filter({ has: page.locator('option', { hasText: 'Any sun' }) }).selectOption('Full');
  const order = () => page.locator('.list-divider, .plant-item .pname').evaluateAll((els) => els.map((e) => (e.classList.contains('list-divider') ? '|' + e.getAttribute('data-testid') : e.textContent)));
  const sureNames = Array.from({ length: 10 }, (_, i) => `Sure Plant ${String(i + 1).padStart(2, '0')}`);
  // Ten sure: the other two fold into one line, last, saying how many and why.
  await expect.poll(order).toEqual([...sureNames, '|less-sure']);
  const line = page.getByTestId('less-sure');
  await expect(line).toHaveText('Show 2 more that other sources or the earlier list say fit');
  await expect(line).toHaveAttribute('aria-expanded', 'false');
  // Opened: the two groups, as worded before, with Hide these.
  await line.click();
  await expect.poll(order).toEqual([...sureNames, '|others-divider', 'Hairy Alumroot', '|earlier-divider', 'Old-List Aster']);
  await expect(page.getByTestId('others-divider')).toContainText('Other sources say these take full sun too');
  await expect(page.getByTestId('hide-others')).toBeVisible();
  // Nine sure (Perennials only): no line, the groups shown as before.
  await closeSheet(page);
  await page.locator('.tool-btn.plants').click();
  await openFilters(page);
  await page.locator('.sheet select').filter({ has: page.locator('option', { hasText: 'Any sun' }) }).selectOption('Full');
  await expect.poll(order).toEqual([...sureNames, '|less-sure']); // (opened by hand last time: folded again, a new look)
  await page.locator('.sheet select').filter({ has: page.locator('option', { hasText: 'Any form' }) }).selectOption('Perennial');
  await expect.poll(order).toEqual([...sureNames.slice(0, 9), '|others-divider', 'Hairy Alumroot', '|earlier-divider', 'Old-List Aster']);
  // Other sources' put away with Hide these, then ten sure again: the line says only the other one.
  await page.getByTestId('hide-others').click();
  await page.locator('.sheet select').filter({ has: page.locator('option', { hasText: 'Any form' }) }).selectOption('');
  await expect(line).toHaveText('Show 1 more that only the earlier list (unverified) says fit');
  await expect(page.getByTestId('others-hidden')).toContainText('1 more fit by what other sources say.');
  await page.getByTestId('show-others').click();
  await expect(line).toHaveText('Show 2 more that other sources or the earlier list say fit');
  // A search by name finds every plant as before: with ten sure matches too, nothing folded.
  await page.getByTestId('plant-search').fill('plant');
  await expect(page.locator('.plant-item', { hasText: 'Sure plant 10' })).toHaveCount(1);
  await page.getByTestId('plant-search').fill('a');
  await expect(line).toHaveCount(0);
  await expect(page.locator('.plant-item', { hasText: 'Hairy Alumroot' })).toHaveCount(1);
  await expect(page.locator('.plant-item', { hasText: 'Old-List Aster' })).toHaveCount(1);
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
  const alumroot = page.locator('.plant-item', { hasText: 'Hairy Alumroot' });
  await expect(alumroot.getByTestId('row-flag')).toBeVisible();
  await expect(page.locator('.plant-item', { hasText: 'Sweetspire' }).getByTestId('row-flag')).toHaveCount(0);
  // Each row says how far it's checked: all earlier list, some, or (no badge) every detail sourced.
  await expect(page.locator('.plant-item', { hasText: 'Old-List Aster' }).locator('.unverified-badge')).toHaveText('Unverified');
  await expect(page.locator('.plant-item', { hasText: 'Half-Checked Aster' }).locator('.unverified-badge')).toHaveText('Partly checked');
  await expect(page.locator('.plant-item', { hasText: 'Sweetspire' }).locator('.unverified-badge')).toHaveCount(0);
  // In groups: what its sources say fits; below a divider, what fits by what other sources say (with Hide); below
  // another, what fits only by the earlier list.
  const order = () => page.locator('.list-divider, .plant-item .pname').evaluateAll((els) => els.map((e) => (e.classList.contains('list-divider') ? '|' + e.getAttribute('data-testid') : e.textContent)));
  await expect.poll(order).toEqual(['Bee Balm', 'Bristleleaf Sedge', 'Sweetspire', '|others-divider', 'Hairy Alumroot', '|earlier-divider', 'Half-Checked Aster', 'Old-List Aster']);
  await expect(page.getByTestId('others-divider')).toContainText('Other sources say these take full sun too');
  await expect(page.getByTestId('earlier-divider')).toContainText('These match on sun only by the earlier list (unverified).');
  await page.getByTestId('hide-others').click();
  await expect(page.locator('.plant-item', { hasText: 'Hairy Alumroot' })).toHaveCount(0);
  await expect(page.getByTestId('others-hidden')).toContainText('1 more fit by what other sources say.');
  await page.getByTestId('show-others').click();
  await expect(page.locator('.plant-item', { hasText: 'Hairy Alumroot' })).toHaveCount(1);
  await alumroot.getByTestId('plant-row').click();
  await expect(alumroot.getByTestId('reported-flag')).toContainText('what other sources say for its sun');
  await expect(alumroot.getByTestId('plant-details')).toContainText('Nurseries report: Full sun to shade (A nursery)');
  const beeBalm = page.locator('.plant-item', { hasText: 'Bee Balm' });
  await beeBalm.getByTestId('plant-row').click();
  const details = beeBalm.getByTestId('plant-details');
  await expect(details).toContainText('NC State lists: Full sun');
  // The sun range is credited to the sources behind both its ends, as sure as the less sure end.
  await expect(details).toContainText('Full sun to part shadeSources: A grower, Another grower (nurseries)');
  await expect(details).not.toContainText('NC State Extension, A grower');
  // Nurseries lead its hardiness, a reference's range beside it; the range shown is nurseries' only, and says so.
  await expect(details).toContainText('NC State lists: zones 4–8a');
  const onlyNurseries = 'This range is from nurseries only, and a grower\'s range can stop where it sells.';
  await expect(beeBalm.getByTestId('nursery-only')).toHaveText(onlyNurseries);
  // Hardiness only a nursery gives says so; one a reference gives doesn't.
  await expect(alumroot.getByTestId('nursery-only')).toHaveCount(0);
  const sedge = page.locator('.plant-item', { hasText: 'Bristleleaf Sedge' });
  await sedge.getByTestId('plant-row').click();
  await expect(sedge.getByTestId('nursery-only')).toHaveText(onlyNurseries);
  // Ends from different sources: each named for its own.
  const itea = page.locator('.plant-item', { hasText: 'Sweetspire' });
  await itea.getByTestId('plant-row').click();
  await expect(itea.getByTestId('plant-details')).toContainText('Sources: A grower (a nursery) for the cold limit; NC State for the warm limit');
  await expect(itea.getByTestId('nursery-only')).toHaveText('Its cold limit is from nurseries only.');
  // Only the references: it's gone.
  await openFilters(page);
  await page.locator('label', { hasText: 'Where sources disagree, count both values' }).locator('input').uncheck();
  await expect(page.locator('.plant-item', { hasText: 'Hairy Alumroot' })).toHaveCount(0);
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
  const phlox = await open('Garden Phlox');
  await expect(phlox('Bloom').getByTestId('bloom-season')).toHaveText('Summer');
  await expect(phlox('Bloom')).toContainText('Sources: NC State, USDA');
  // (From the earlier list: marked on it, Jason, Nov 4.)
  await expect(phlox('Bloom').getByTestId('bloom-months')).toHaveText('Jul–Sep Unverified');
  await expect(phlox('Bloom').getByTestId('bloom-months').getByTestId('unverified-chip')).toHaveText('Unverified');
  await expect(phlox('Bloom').getByTestId('bloom-season').getByTestId('unverified-chip')).toHaveCount(0);
  await expect(phlox('Bloom')).toContainText('earlier list, unverified');
  await expect(phlox('Flower color')).toContainText('Pink, white, purple');
  await expect(phlox('Flower color').locator('.details-src')).toHaveText('Source: NC State');
  // A cultivar blooms when its species does (said so), in its own colors. (Found by its name: a cultivar folds
  // under its species otherwise.)
  await page.getByTestId('plant-search').fill('david');
  const david = await open("Garden Phlox 'David'");
  await expect(david('Bloom')).toContainText('Summer');
  await expect(david('Bloom')).toContainText('from its species');
  await expect(david('Flower color')).toContainText('White');
  // USDA's finer season, as it writes it; flowers it calls not conspicuous: not showy.
  await page.getByTestId('plant-search').fill('');
  const oak = await open('White Oak');
  await expect(oak('Bloom').getByTestId('bloom-season')).toHaveText('Mid spring');
  await expect(oak('Flower color')).toContainText('Yellow; not showy');
  // Only the earlier list: its months and its color, each labeled.
  const aster = await open('Old-List Aster');
  await expect(aster('Bloom')).toContainText('Sep–Oct');
  await expect(aster('Flower color')).toContainText('Lavender');
  await expect(aster('Flower color').locator('.details-src')).toHaveText('Source: earlier list, unverified');
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
  const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Trumpet Creeper$/ }) });
  await item.getByTestId('plant-row').click();
  const details = item.getByTestId('plant-details');
  await expect(details.locator('dt', { hasText: 'How it spreads' })).toHaveCount(1);
  const spreads = details.getByTestId('spreads');
  await expect(spreads.locator('.details-part')).toHaveText(['Self-sows freely', 'Spreads aggressively underground or by runners: Suckering colonizer']);
  await expect(spreads.locator('.details-src')).toHaveText(['Source: NC State (its description)']); // (each part its own source; one line where they share it)
  await expect(details.locator('dt', { hasText: /^(Habit|How it grows)$/ })).toHaveCount(0); // (said under "How it spreads")
  // The picker: the ways of spreading you're OK with; a plant shows only if every way it spreads is ticked.
  await openFilters(page);
  const spreading = page.getByTestId('spread-filter');
  await expect(spreading.locator('legend')).toHaveText('Spreading you\u2019re OK with (unverified)');
  const tick = (name: string) => spreading.locator('label', { hasText: name }).locator('input');
  const creeper = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Trumpet Creeper$/ }) });
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
  await expect(rows.first()).toContainText('Bradford/Callery Pear');
  await search.fill('Winterthur viburnum'); // ("Witherod viburnum 'Winterthur'")
  await expect(rows.first()).toContainText("Witherod Viburnum 'Winterthur'");
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

test('a plant poisonous to people says so, beside Edible; People hides it, and not a plant listing none, nor one no source rates (Jason, Nov 5)', async ({ page }) => {
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
  await expect(row('Toxic to people')).toContainText('Leaves, roots, seeds and stems, high severity; can irritate skin');
  await expect(row('Toxic to people').locator('.details-src')).toContainText('NC State');
  await expect(row('Edible')).toContainText(/^Fruit, though it's also listed as toxic to people/); // (the part NC State marks edible)
  // A plant whose NC State page lists none says so; People keeps it.
  await page.getByTestId('plant-search').fill('Autumn Bride');
  const heuchera = page.locator('.plant-item', { hasText: "Heuchera 'Autumn Bride'" });
  await heuchera.getByTestId('plant-row').click();
  await expect(heuchera.getByTestId('plant-details').locator('dt', { hasText: /^Toxic to people$/ }).locator('xpath=following-sibling::dd[1]')).toContainText('None listed');
  await page.getByTestId('clear-search').click(); // ("Hide plants rated toxic to:" folds away while a search is typed)
  await page.getByTestId('protect-kids').click();
  await expect(page.getByTestId('active-chip')).toHaveText(['No plants rated toxic to people']);
  await page.getByTestId('plant-search').fill('Autumn Bride');
  await expect(heuchera).toHaveCount(1);
  await page.getByTestId('plant-search').fill('Mayapple');
  await expect(page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Mayapple$/ }) })).toHaveCount(0);
  // One no source rates for people still shows, said so in its details (until Nov 5 People hid it too, which read as
  // "what's left is safe").
  await page.getByTestId('plant-search').fill('Sideoats grama');
  const grama = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Sideoats Grama$/ }) });
  await expect(grama).toHaveCount(1);
  await grama.getByTestId('plant-row').click();
  await expect(grama.getByTestId('plant-details').locator('dt', { hasText: /^Toxic to people$/ }).locator('xpath=following-sibling::dd[1]')).toContainText(/^Not known/);
});

test('a plant\'s leaves: their colors, what they do in winter, fall color and growth rate; the picker can keep only evergreens', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Red maple');
  const maple = page.locator('.plant-item', { hasText: /^Red Maple/ }).first();
  await maple.getByTestId('plant-row').click();
  const details = maple.getByTestId('plant-details');
  const row = (label: string) => details.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
  await expect(row('Leaf colors')).toContainText('Gold, green, orange');
  await expect(row('In winter')).toContainText('Deciduous: loses its leaves');
  await expect(row('In winter').locator('.details-src').first()).toContainText(/^Sources: NC State, USDA/);
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
  await expect(page.locator('.plant-item', { hasText: /^Red Maple/ })).toHaveCount(0);
});

test('animal toxicity: a chip each, hiding only what\'s rated toxic to them; a warning given for one record of a species shows on the others (Jason, Nov 5)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const count = page.getByTestId('picker-count');
  await expect(count).toContainText(/^All /);
  // (Dismissed, the line is in Filters, where it stays in view while a search is typed.)
  await page.getByTestId('protect-dismiss').click();
  const fold = page.getByTestId('filters');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await fold.click();
  const dogs = page.getByTestId('protect-dogs');
  await expect(dogs).toHaveAttribute('aria-pressed', 'false');
  // One line: no "Show all", no "rated safe" (the only safe ratings were the earlier list's, unverified).
  await expect(page.getByTestId('all-filters')).not.toContainText(/rated safe|Show all|Poison & pets/);
  await dogs.click();
  await expect(dogs).toHaveAttribute('aria-pressed', 'true');
  await expect(fold).toHaveText('Filters (1 on)');
  await expect(page.getByTestId('active-chip')).toHaveText(['No plants rated toxic to dogs']);
  await expect(page.getByTestId('protect-note')).toHaveText(/^Hides plants NC State or an earlier list rates toxic to them\. Not rated toxic isn’t the same as safe: [\d,]+ plants have no rating yet\.$/);
  await expect(count).toContainText(/^[\d,]+ of [\d,]+ plants match/);
  // NC State lists it as a problem for dogs: hidden; Dogs off shows it, saying so.
  await page.getByTestId('plant-search').fill('Butterfly milkweed');
  const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Butterfly Milkweed$/ }) });
  await expect(item).toHaveCount(0);
  await openFilters(page); // (typing a search folds them: Jason, Nov 1)
  await dogs.click();
  await expect(item).toHaveCount(1);
  await item.getByRole('button', { name: /Butterfly Milkweed/ }).first().click();
  await expect(item.getByTestId('tox-row')).toContainText('Toxic to dogs, cats and horses');
  // The species record carries another record's warning (the earlier list's), so Dogs hides it too; off shows it
  // again, saying where the warning came from.
  await dogs.click();
  await page.getByTestId('plant-search').fill('Yaupon');
  const yaupon = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Yaupon$/ }) });
  await expect(yaupon).toHaveCount(0);
  await openFilters(page);
  await dogs.click();
  await expect(yaupon).toHaveCount(1);
  await yaupon.getByRole('button', { name: /Yaupon/ }).first().click();
  await expect(yaupon.getByTestId('tox-row')).toContainText("given for Dwarf Yaupon Holly 'Schillings', the same species");
  // A plant no source rates says so, rather than nothing (never "safe").
  await page.getByTestId('plant-search').fill("'Acapulco Orange'");
  const unrated = page.locator('.plant-item').first();
  await unrated.getByRole('button', { name: /Acapulco Orange/ }).first().click();
  await expect(unrated.getByTestId('tox-row')).toContainText(/^(Not rated for pets|Not listed as toxic to dogs, cats or horses)/);
  // Cats and horses: NC State's warnings hide it.
  await page.getByTestId('plant-search').fill('Butterfly milkweed');
  await openFilters(page);
  await page.getByTestId('protect-horses').click();
  await expect(item).toHaveCount(0);
  await page.getByTestId('plant-search').fill("'Acapulco Orange'");
  // Clearing the filters keeps the search and the open section, and who's in the yard: not a filter for the search at
  // hand, kept with the plan (the bug hunt, Nov 6: cleared here, they came back the next time the list opened).
  await openFilters(page);
  await dogs.click();
  await expect(page.getByTestId('reset-filters')).toHaveCount(0); // (the people and pets alone: nothing to clear)
  await page.locator('.sheet select').filter({ has: page.locator('option', { hasText: 'Any form' }) }).selectOption('Perennial');
  await page.getByTestId('reset-filters').click();
  await expect(page.locator('.sheet select').filter({ has: page.locator('option', { hasText: 'Any form' }) })).toHaveValue('');
  await expect(page.getByTestId('protect-dogs')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('protect-horses')).toHaveAttribute('aria-pressed', 'true');
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
  // Nothing found: "or loosen a filter" only with one on (the bug hunt, Nov 1: said with none).
  await page.getByTestId('plant-search').fill('qqxzv');
  await expect(page.getByTestId('no-matches')).toHaveText('No matches. Add it as your own plant, or loosen a filter.');
  await page.getByTestId('reset-filters').click();
  await expect(page.getByTestId('active-chip')).toHaveCount(0);
  await expect(page.getByTestId('no-matches')).toHaveText('No matches. Add it as your own plant.');
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
  expect(at('Purple Coneflower (Species)')).toBeGreaterThan(at('Also comes in red'));
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
  // No note on checking over the list: a plant's details mark what isn't checked (Jason, Nov 4, note 1).
  await expect(page.getByTestId('picker-count')).toBeVisible();
  await expect(page.getByTestId('unverified-note')).toHaveCount(0);
  await expect(page.getByTestId('picker')).not.toContainText('Not every detail is checked');
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
  // Nothing found: the link below the note that says so (with no filter on, nothing about loosening one).
  await search.fill('Aunt Lou’s keeper');
  await expect(page.getByTestId('no-matches')).toHaveText('No matches. Add it as your own plant.');
  await expect(add).toHaveText('Add “Aunt Lou’s keeper” as my plant');
  // Switch plant, while placing: the same.
  await search.fill('Black-eyed Susan');
  await page.locator('.plant-item', { hasText: 'Black-eyed Susan' }).first().getByTestId('plant-place').click();
  await page.getByTestId('place-switch').click();
  // (Switch plant: the picker itself while placing, its rows' buttons saying Switch; no title row, Jason, Nov 4.)
  await expect(page.locator('.picker-sheet [data-testid=plant-place]').first()).toHaveText(/^Switch/);
  await openFilters(page);
  await page.getByTestId('plant-search').fill('coneflower');
  await expect(page.getByTestId('all-filters')).toBeHidden();
  await expect(page.locator('.plant-item').first()).toBeInViewport();
  if (isMobile) await expect(page.getByTestId('plant-search')).toBeFocused();
});

// The picker bug hunt, Nov 1: typing on a 360 × 640 phone, Recent and "Anyone you need to protect?" (since Nov 5, "Hide
// plants toxic to:") stayed above the results, one row of them in view at most, at Extra large none. The question folds
// away while a search is typed, as the filters do, and comes back when it's cleared. (Recent went with Jason's notes of
// Nov 4: "In this plan" finds the plants placed.)
test('typing a search folds "Hide plants rated toxic to:" away, results in view on a 360 × 640 phone; cleared, it\'s back; no Recent (the picker bug hunt, Nov 1; Jason, Nov 4)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Wild columbine');
  await page.locator('.plant-item', { hasText: 'Wild columbine' }).first().getByTestId('plant-place').click();
  await placeOnceAtCenter(page);
  for (const size of ['medium', 'xlarge']) {
    await page.evaluate((s) => localStorage.setItem('lp-text-size-2', s), size);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-text', size);
    await page.locator('.tool-btn.plants').click();
    const ask = page.getByTestId('protect-line').first();
    const search = page.getByTestId('plant-search');
    await search.fill('');
    await expect(ask).toBeVisible();
    // (A plant placed, and no Recent.)
    await expect(page.getByTestId('recent-field')).toHaveCount(0);
    await expect(page.getByTestId('recent-plants')).toHaveCount(0);
    const first = () => page.locator('.plant-item > .proj-row').first().evaluate((r) => { const b = r.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; });
    const folds = (await ask.boundingBox())!.height;
    const before = await first();
    await search.pressSequentially('aster');
    await expect(ask, size).toBeHidden();
    // The results up where it was: the first in view, whole at Medium (it was below the screen at Extra large).
    const after = await first();
    expect(after.top, size).toBeLessThan(before.top - folds + 40);
    expect(after.top + 60, size).toBeLessThan(640);
    if (size === 'medium') expect(after.bottom).toBeLessThanOrEqual(640);
    // A word of need made a filter empties the box: still folded, the search going on.
    await search.fill('');
    await expect(ask).toBeVisible();
    await search.pressSequentially('evergreen');
    await search.press('Enter');
    await expect(search).toHaveValue('');
    await expect(page.getByTestId('active-chip').first()).toBeVisible();
    await expect(ask).toBeHidden();
    // Cleared by hand: back, by the ×, or by deleting what's typed.
    await search.pressSequentially('aster');
    await page.getByTestId('clear-search').click();
    await expect(ask).toBeVisible();
    await search.pressSequentially('fern');
    await expect(ask).toBeHidden();
    for (let i = 0; i < 4; i++) await search.press('Backspace');
    await expect(search).toHaveValue('');
    await expect(ask).toBeVisible();
    await page.getByTestId('reset-filters').click();
    await closeSheet(page);
  }
});

test('words of need become filters: "shade flowers" is Part shade and Has flowers; a word of a plant\'s name stays the search (Jason, Nov 1)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const search = page.getByTestId('plant-search');
  const chips = page.getByTestId('active-chip');
  await search.fill('shade flowers');
  // (Its last word still being typed, "flowers…" perhaps: the search till it's finished.)
  await expect(search).toHaveValue('flowers');
  await expect(search).toBeFocused(); // (the keyboard kept: nothing redrawn but the list)
  await expect(chips).toHaveText(['Part shade']);
  await expect(page.locator('.sheet select[aria-label=Sun]')).toHaveValue('Part'); // (its control says so too)
  // Finished (Enter): Has flowers too, its box ticked, the search empty.
  await search.press('Enter');
  await expect(search).toHaveValue('');
  await expect(chips).toHaveText(['Part shade', 'Has flowers']);
  await expect(page.locator('.sheet label', { hasText: 'Has flowers' }).locator('input')).toBeChecked();
  await expect(page.locator('.plant-item').first()).toBeVisible();
  await chips.first().click();
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
  await expect(page.locator('.plant-item .pname').first()).toContainText('Butterfly Weed (Clay Strain)');
  // Its old name, "Butterfly weed 'for Clay'", is another name, not its own: "clay" is Clay OK, and it's still found.
  await search.fill('butterfly weed for clay');
  await search.press('Enter');
  await expect(chips).toHaveText(['Clay OK']);
  await expect(page.locator('.plant-item .pname').first()).toContainText('Butterfly Weed (Clay Strain)');
  await page.getByTestId('reset-filters').click();
  // "wet " and "shrubs ", typed, are filters on the space, as with Enter (the bug hunt, Nov 1: "wet" stayed a search,
  // for Goldenclub's other name "Never Wet", and "shrubs" for Shrubby cinquefoil and the rest). The "soil" typed
  // after "wet " goes too, its filter on.
  await search.fill('');
  await search.pressSequentially('native wet ');
  await expect(search).toHaveValue('');
  await expect(chips).toHaveText(['Native to North America', 'Takes wet soil']);
  await search.pressSequentially('soil ');
  await expect(search).toHaveValue('');
  await expect(chips).toHaveText(['Native to North America', 'Takes wet soil']);
  await page.getByTestId('reset-filters').click();
  await search.pressSequentially('clay shrubs ');
  await expect(search).toHaveValue('');
  await expect(chips).toHaveText(['Shrub', 'Clay OK']);
  await page.getByTestId('reset-filters').click();
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
  const row = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Butterfly Milkweed$/ }) });
  const spot = row.getByTestId('row-dot');
  await expect(spot).toHaveAttribute('role', 'img');
  await expect(spot).toHaveAttribute('aria-label', 'orange flowers, green leaves');
  await expect(spot.getByTestId('spot-flower')).toHaveAttribute('fill', '#f08a24');
  // Its months where the garden is, short, as its details give them; "Blooms" said to a screen reader.
  const months = row.getByTestId('row-bloom');
  await expect(months).toHaveText(/^Blooms [A-Z][a-z]{2}(–[A-Z][a-z]{2})?$/);
  const said = (await months.textContent())!.replace('Blooms ', '');
  await expect(row.getByTestId('plant-row')).toHaveAccessibleName(/^Butterfly Milkweed .*Blooms .* orange flowers, green leaves$/);
  await row.getByTestId('plant-row').click();
  await expect(row.getByTestId('plant-details')).toContainText(`${said}, peak`);
  // No showy flowers on record: the circle alone, and no months.
  await page.getByTestId('plant-search').fill('Christmas fern');
  const fern = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Christmas Fern$/ }) });
  await expect(fern.getByTestId('row-dot')).toHaveAttribute('aria-label', /^[a-z ]+ leaves$/);
  await expect(fern.getByTestId('row-dot').getByTestId('spot-flower')).toHaveCount(0);
  await expect(fern.getByTestId('row-bloom')).toHaveCount(0);
  // Flowering dogwood: tiny true flowers ("insignificant") in showy bracts (a shape, petals and a size), so a flower in
  // its spot, its months, and Has flowers and White flowers keep it, as its details list white flowers (the bug hunt,
  // Nov 1: a plain circle, left out by both).
  await page.getByTestId('plant-search').fill('Flowering dogwood');
  const dogwood = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Flowering Dogwood$/ }) });
  await expect(dogwood.getByTestId('row-dot')).toHaveAttribute('aria-label', 'white flowers, green leaves');
  await expect(dogwood.getByTestId('row-bloom')).toBeVisible();
  for (const need of ['flowers', 'white flowers']) {
    await page.getByTestId('plant-search').fill(`${need} flowering dogwood`);
    await page.getByTestId('plant-search').press('Enter');
    await expect(page.getByTestId('active-chip')).toHaveText([need === 'flowers' ? 'Has flowers' : 'White flowers']);
    await expect(dogwood).toBeVisible();
    await page.getByTestId('reset-filters').click();
  }
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
    const row = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Purple Coneflower/ }) }).first();
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

// The picker bug hunt, Nov 1 (B11): "Bradford/Callery pear" broke as "Bradford/Call" and "ery pear" beside the wide
// "Place (banned)". A name wraps between its words, or after a slash; never in a word.
test('a name wraps between words or after its slash, never mid-word, beside "Place (banned)" on a 360 px phone at every text size (the picker bug hunt, Nov 1)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openFresh(page);
  await page.getByTestId('first-zip').fill('29201');
  await page.getByTestId('first-zip-lookup').click();
  await expect(page.getByTestId('location-result')).toContainText('Zone');
  await closeSheet(page);
  for (const size of ['small', 'medium', 'large', 'xlarge']) {
    await page.evaluate((s) => localStorage.setItem('lp-text-size-2', s), size);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-text', size);
    await page.locator('.tool-btn.plants').click();
    await page.getByTestId('plant-search').fill('callery pear');
    const row = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: 'Bradford/Callery pear' }) }).first();
    await expect(row.getByTestId('plant-place')).toHaveText('Place (banned)');
    const name = row.locator('.pname');
    await expect(name).toHaveText('Bradford/Callery Pear');
    // Where each line starts: only after a space or a slash.
    const midWord = await name.evaluate((e) => {
      const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      let prev: { ch: string; top: number } | null = null, gap = false;
      const bad: string[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent ?? '';
        for (let i = 0; i < t.length; i++) {
          if (/\s/.test(t[i])) { gap = true; continue; }
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
          const top = r.getBoundingClientRect().top;
          if (prev && top > prev.top + 2 && !gap && prev.ch !== '/') bad.push(prev.ch + t[i]);
          prev = { ch: t[i], top }; gap = false;
        }
      }
      return bad;
    });
    expect(midWord, size).toEqual([]);
    const place = (await row.getByTestId('plant-place').boundingBox())!;
    expect(place.x + place.width, size).toBeLessThanOrEqual(360);
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
  const birch = await open('River Birch');
  await expect(birch.getByTestId('winter-bark')).toHaveText('Showy bark: exfoliating, papery, peeling');
  await expect(birch.getByTestId('winter-listed')).toHaveText('Listed for winter gardens');
  await expect(birch.getByTestId('winter-row').locator('.details-src').nth(1)).toContainText('NC State');
  await expect(birch.locator('dt', { hasText: /^Bark$/ }).locator('xpath=following-sibling::dd[1]')).toContainText('Exfoliating, papery, peeling, ridges, smooth; light brown, orange');
  await expect(birch.locator('dt', { hasText: /^Winter interest$/ })).toHaveCount(0); // (said under In winter)
  const winterberry = await open('Winterberry Holly');
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
  const hazel = await open('Common Witch Hazel');
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
  const jessamine = await open('Carolina Jessamine');
  await expect(jessamine.locator('.details-group-head').first()).toHaveAttribute('data-testid', 'group-safety');
  await expect(jessamine.getByTestId('group-safety')).toHaveAttribute('aria-expanded', 'true');
  await expect(jessamine.getByTestId('group-safety-sum')).toContainText('Toxic to people (high severity)');
  // The picker closed and opened again: folded again.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('plant-search')).toHaveCount(0);
  await page.locator('.tool-btn.plants').click();
  const again = await open('Common Witch Hazel');
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
  const indigo = await winter('Fragrant False Indigo');
  await expect(indigo).toContainText('Expected to lose its leaves in winter, like its 2 relatives in the catalog');
  await expect(indigo).toContainText('Not from a source: other species of its genus');
  const grama = await winter('Sideoats Grama');
  await expect(grama).toContainText('Goes dormant in winter');
  await expect(grama).toContainText(/USA-NPN observers, who recorded it bare: \d+ plant-years/);
});

// "Hide plants rated toxic to:" (Jason, Nov 5: "the whole poison filter could be reduced to 'hide plants toxic to …' with
// chips. Maybe replace 'kids' with 'people.'"), in place of "Anyone you need to protect?" (Jason, Nov 1, from the UI
// review: a tester saw "Can irritate skin" on rows but nothing on a plant highly poisonous to people, and never learned
// the picker screens for kids and pets without opening Filters) and the Poison & pets group. First among the filters
// until it's answered for the plan or dismissed on this device; then in Filters, where Poison & pets was. Who's in the
// yard, and the answer, are kept with the plan (Jason, Nov 1); the × is the device's. People is kept as `kids`.
const protect = (page: Page) => page.getByTestId('protect-line');
/** Who's in the open plan's yard, as stored with it (its time left out). */
const planHousehold = (page: Page) => page.evaluate(() => new Promise<unknown>((resolve) => {
  const open = indexedDB.open('landscape-planner');
  open.onsuccess = () => {
    const db = open.result;
    const cur = db.transaction('kv').objectStore('kv').get('current');
    cur.onsuccess = () => {
      const req = db.transaction('projects').objectStore('projects').get(cur.result as string);
      req.onsuccess = () => { const h = req.result?.household; if (h) delete h.at; resolve(h ?? null); db.close(); };
    };
  };
}));
/** What the device keeps of it: the × ('lp-protect-line'), and who was in the yard before plans kept it ('lp-yard'). */
const deviceKept = (page: Page) => page.evaluate(() => [localStorage.getItem('lp-protect-line'), localStorage.getItem('lp-yard')]);
const NONE = { kids: false, dogs: '', cats: false, horses: false };
/** The line first among the picker's filters, not in Filters. */
const protectAtTop = (page: Page) => page.locator('.picker-filters > [data-testid=protect-line]:first-child');
const protectInGroup = (page: Page) => page.getByTestId('toxic-filters').getByTestId('protect-line');
/** The line's note: what it hides, by whose word, and how many plants aren't rated for those chosen. */
const NOTE = /^Hides plants NC State or an earlier list rates toxic to them\. Not rated toxic isn’t the same as safe: ([\d,]+) plants have no rating yet\.$/;
const unratedSaid = async (page: Page) => Number((NOTE.exec((await page.getByTestId('protect-note').textContent()) ?? '') ?? ['', 'NaN'])[1].replace(/,/g, ''));

test('"Hide plants rated toxic to:" comes first on a fresh device: People, Dogs, Cats and Horses, its note counting the plants not rated; skin irritants marked for all (Jason, Nov 5)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await expect(protectAtTop(page)).toBeVisible();
  await expect(protect(page)).toHaveCount(1); // (not in Filters too)
  await expect(protect(page).locator('.protect-title')).toHaveText('Hide plants rated toxic to:');
  await expect(protect(page).locator('.protect-chip')).toHaveText(['People', 'Dogs', 'Cats', 'Horses']);
  for (const k of ['kids', 'dogs', 'cats', 'horses']) await expect(page.getByTestId(`protect-${k}`)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('protect-note')).toHaveText(NOTE);
  await expect(protect(page)).not.toContainText(/\b(tap|click|kids)\b/i);
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
  // The note counts the plants not rated for those chosen: all four with none; fewer for dogs alone (the earlier list
  // rates some NC State doesn't).
  await page.getByTestId('clear-search').click();
  const any = await unratedSaid(page);
  expect(any).toBeGreaterThan(0);
  await page.getByTestId('protect-dogs').click();
  await expect.poll(() => unratedSaid(page)).toBeLessThan(any);
  // Nothing of it in Filters while it's first among them: one line, in place of Poison & pets.
  await openFilters(page);
  await expect(page.getByTestId('toxic-filters')).toBeHidden();
  await expect(page.getByTestId('all-filters')).not.toContainText(/Poison & pets|toxic to|rated safe/i);
});

test('"Hide plants rated toxic to:": People hides plants rated toxic to people, not one no source rates, and is kept; it stays till the picker closes, then it\'s in Filters, after a reload too', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('protect-kids').click();
  await expect(page.getByTestId('protect-kids')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('active-chip')).toHaveText(['No plants rated toxic to people']);
  await expect.poll(() => planHousehold(page)).toEqual({ ...NONE, kids: true, answered: true });
  expect(await deviceKept(page)).toEqual([null, null]); // (with the plan, not the device)
  // Mayapple hidden; shown anyway, it's marked poisonous to people now, and still for the skin.
  await page.getByTestId('plant-search').fill('Mayapple');
  const mayapple = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Mayapple$/ }) });
  await expect(mayapple).toHaveCount(0);
  await page.getByTestId('show-hidden').click();
  await expect(mayapple.getByTestId('row-poison')).toHaveText('Toxic to people');
  await expect(mayapple.getByTestId('row-skin')).toHaveText('Can irritate skin');
  await page.getByTestId('filters-back').click();
  // Not rated for people: shown (Jason, Nov 5; hidden before, which read as "what's left is safe").
  await page.getByTestId('plant-search').fill('Speckled alder');
  await expect(page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Speckled Alder$/ }) })).toHaveCount(1);
  // (Folded away while there's a search, back once it's cleared: the picker bug hunt, Nov 1.)
  await expect(protectAtTop(page)).toBeHidden();
  await page.getByTestId('clear-search').click();
  await expect(protectAtTop(page)).toBeVisible(); // (answered: it stays for now, to see what was set)
  // In step with the filters' own chips, both ways: Dogs on and off; Cats on, its chip's × takes it off, on again.
  await page.getByTestId('protect-dogs').click();
  await expect(page.getByTestId('active-chip')).toHaveText(['No plants rated toxic to people', 'No plants rated toxic to dogs']);
  await page.getByTestId('protect-dogs').click();
  await expect(page.getByTestId('protect-dogs')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('protect-cats').click();
  await page.getByTestId('active-chip').filter({ hasText: 'No plants rated toxic to cats' }).click();
  await expect(page.getByTestId('protect-cats')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('protect-cats').click();
  await expect(page.getByTestId('protect-cats')).toHaveAttribute('aria-pressed', 'true');
  await expect(protectAtTop(page)).toBeVisible();
  // (Nothing of it in Filters while it's first among them.)
  await openFilters(page);
  await expect(page.getByTestId('toxic-filters')).toBeHidden();
  // Closed and opened again: in Filters, as set.
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
  expect(await planHousehold(page)).toEqual({ ...NONE, kids: true, cats: true, answered: true });
});

test('"Hide plants rated toxic to:" dismissed: into Filters at once, a notice says so, and it stays there after a reload', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  // (Moved in place, the picker not drawn again: its search box the same one after. A search typed folds the question
  // away, so it isn't dismissed while one is: the picker bug hunt, Nov 1.)
  const search = page.getByTestId('plant-search');
  // (Marked once the list is in: the picker is drawn again as the catalog comes in, and CI on #209 marked the box
  // before that, so the mark went with it.)
  await expect(page.locator('.plant-item').first()).toBeVisible();
  await search.evaluate((e) => { (e as HTMLElement & { kept?: boolean }).kept = true; });
  await page.getByTestId('protect-dismiss').click();
  await expect(page.locator('#toast')).toHaveText("It's under Filters.");
  await expect(protectAtTop(page)).toHaveCount(0);
  expect(await search.evaluate((e) => (e as HTMLElement & { kept?: boolean }).kept)).toBe(true);
  await openFilters(page);
  await expect(protectInGroup(page)).toBeVisible();
  // Who's in the yard is left as it was: no one, not answered. Dismissed on this device.
  await page.waitForTimeout(400); // (a save would have happened)
  expect(await planHousehold(page)).toEqual({ ...NONE, answered: false });
  expect(await deviceKept(page)).toEqual(['dismissed', null]);
  await page.reload();
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('picker-count')).toBeVisible();
  await expect(protectAtTop(page)).toHaveCount(0);
  await expect(protectInGroup(page)).toBeVisible(); // (the Filters fold left open)
});

test('"Hide plants rated toxic to:" isn\'t asked first on a device that answered step 6 of the introduction, with none ticked', async ({ page }) => {
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
  expect(await planHousehold(page)).toEqual({ ...NONE, answered: true });
  expect(await deviceKept(page)).toEqual([null, null]);
});

test('step 6\'s "None of these": the four off and the question answered for the plan, so the picker asks it under Filters; one of the four unselects it (Jason, Nov 4)', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await page.getByTestId('intro-start').click();
  for (let n = 1; n <= 5; n++) {
    await expect(page.getByTestId('intro-step')).toHaveText(`Step ${n} of 8`);
    await page.getByTestId('intro-skip').click();
  }
  await expect(page.getByTestId('intro-step')).toHaveText('Step 6 of 8');
  const none = page.getByTestId('intro-none');
  await expect(none).toHaveText('None of these');
  await expect(none).toHaveAttribute('aria-pressed', 'false'); // (not answered yet)
  await page.getByTestId('intro-kids').click();
  await none.click();
  await expect(none).toHaveAttribute('aria-pressed', 'true');
  for (const k of ['kids', 'dogs', 'cats', 'horses']) await expect(page.getByTestId(`intro-${k}`)).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => planHousehold(page)).toEqual({ ...NONE, answered: true });
  // One of the four: no longer "none"; the picker's note, under the chips.
  await page.getByTestId('intro-dogs').click();
  await expect(none).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('intro-who-note')).toHaveText(NOTE);
  await none.click();
  await expect(page.getByTestId('intro-dogs')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('intro-who-note')).toBeHidden();
  await expect(none).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => planHousehold(page)).toEqual({ ...NONE, answered: true });
  // Answered for the plan by the chip itself (left before Next): the picker asks it under Filters, not first.
  await page.getByTestId('intro-exit').click();
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('picker-count')).toBeVisible();
  await expect(protectAtTop(page)).toHaveCount(0);
  await openFilters(page);
  await expect(protectInGroup(page)).toBeVisible();
  for (const k of ['kids', 'dogs', 'cats', 'horses']) await expect(page.getByTestId(`protect-${k}`)).toHaveAttribute('aria-pressed', 'false');
  // Taken up again from Help: shown chosen, the plan's answer being no one.
  await closeSheet(page);
  await page.locator('button[title=More]').click();
  await page.getByTestId('menu-help').click();
  await page.getByTestId('help-tour').click();
  await page.getByTestId('intro-resume').click();
  await expect(page.getByTestId('intro-step')).toHaveText('Step 6 of 8');
  await expect(page.getByTestId('intro-none')).toHaveAttribute('aria-pressed', 'true');
});

// One of the four set after Clear filters changes that one alone: Cats ticked after clearing keeps the kids and the dog in
// the yard (the review of the storage change, Nov 1: taken whole from the filters, the yard lost them, on every device).
// Clear filters leaves the four as they are since the bug hunt, Nov 6 (cleared from the list, they came back the next
// time it opened).
test("one of the four set after Clear filters keeps the others in the yard: Cats joins the kids and the dog", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('protect-kids').click();
  await page.getByTestId('protect-dogs').click();
  await expect.poll(() => planHousehold(page)).toEqual({ ...NONE, kids: true, dogs: 'hideToxic', answered: true });
  await openFilters(page);
  await page.locator('.sheet select').filter({ has: page.locator('option', { hasText: 'Any form' }) }).selectOption('Perennial');
  await page.getByTestId('reset-filters').click();
  await expect(page.locator('.sheet select').filter({ has: page.locator('option', { hasText: 'Any form' }) })).toHaveValue('');
  await expect(page.getByTestId('protect-kids')).toHaveAttribute('aria-pressed', 'true'); // (the yard left as it was)
  await expect(page.getByTestId('protect-dogs')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400); // (a save would have happened)
  expect(await planHousehold(page)).toEqual({ ...NONE, kids: true, dogs: 'hideToxic', answered: true });
  await page.getByTestId('protect-cats').click();
  await expect.poll(() => planHousehold(page)).toEqual({ ...NONE, kids: true, dogs: 'hideToxic', cats: true, answered: true });
  // After a reload, the picker's filters are the plan's yard: all three.
  await page.reload();
  await page.locator('.tool-btn.plants').click();
  await openFilters(page);
  for (const k of ['kids', 'dogs', 'cats']) await expect(page.getByTestId(`protect-${k}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('protect-horses')).toHaveAttribute('aria-pressed', 'false');
});

test("who's in the yard is the plan's: a new plan asks again, \"Same garden?\" copies it, and each plan keeps its own (Jason, Nov 1)", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('protect-dogs').click();
  await closeSheet(page);
  const newPlan = async (name: string, same: boolean | null) => {
    await page.locator('.project-btn').click();
    await page.getByRole('button', { name: /New project/ }).click();
    const check = page.locator('.ask-overlay label', { hasText: 'Same garden?' }).locator('input');
    if (same === null) await expect(page.getByTestId('ask-check')).toHaveCount(0);
    else { await expect(check).toBeChecked(); if (!same) await check.uncheck(); }
    await page.getByTestId('ask-input').fill(name);
    await page.getByTestId('ask-ok').click();
    await expect(page.locator('.project-btn .pname')).toHaveText(name);
  };
  // Another yard: asked again, no one in it, and no dog filter in the picker.
  await newPlan('Grandma’s', false);
  await page.locator('.tool-btn.plants').click();
  await expect(protectAtTop(page)).toBeVisible();
  for (const k of ['kids', 'dogs', 'cats', 'horses']) await expect(page.getByTestId(`protect-${k}`)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('active-chip')).toHaveCount(0);
  await closeSheet(page);
  // (Not answered here, and no ZIP: nothing to offer for the next one.)
  await newPlan('Lot 2', null);
  // Back on the first plan: its dog, in the picker's filters too.
  await page.locator('.project-btn').click();
  await page.locator('.proj-row', { hasText: 'My Garden' }).click();
  await expect(page.locator('.project-btn .pname')).toHaveText('My Garden');
  await page.locator('.tool-btn.plants').click();
  await expect(protectAtTop(page)).toHaveCount(0);
  await openFilters(page);
  await expect(page.getByTestId('protect-dogs')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('active-chip')).toHaveText(['No plants rated toxic to dogs']);
  await closeSheet(page);
  // The same garden: its dog comes along, answered.
  await newPlan('Back corner', true);
  await page.locator('.tool-btn.plants').click();
  await expect(protectAtTop(page)).toHaveCount(0);
  await expect(page.getByTestId('protect-dogs')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => planHousehold(page)).toEqual({ ...NONE, dogs: 'hideToxic', answered: true });
  // After a reload, each as it was.
  await page.reload();
  await page.locator('.project-btn').click();
  await page.locator('.proj-row', { hasText: 'Grandma’s' }).click();
  await page.locator('.tool-btn.plants').click();
  await expect(protectAtTop(page)).toBeVisible();
  await expect(page.getByTestId('protect-dogs')).toHaveAttribute('aria-pressed', 'false');
});

// What a plan kept before Nov 5 reads as the line has it now, with nothing stored changed: `kids` is People, and Dogs
// kept as "only plants rated safe" ('nonToxic') is Dogs on, hiding only what's rated toxic to dogs.
test('a plan kept before Nov 5 with kids and "only plants rated safe for dogs": People and Dogs on, a plant neither rates shown, the plan as it was till Dogs is changed', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes: [], household: { kids: true, dogs: 'nonToxic', cats: false, horses: false, answered: true }, zoom: 1, offsetX: 0, offsetY: 0 }));
  });
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('picker-count')).toBeVisible();
  await expect(protectAtTop(page)).toHaveCount(0); // (answered)
  await openFilters(page);
  await expect(page.getByTestId('protect-kids')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('protect-dogs')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('active-chip')).toHaveText(['No plants rated toxic to people', 'No plants rated toxic to dogs']);
  // Speckled alder: no source rates it for people, and the earlier list says "Unverified" for dogs. Both filters hid it
  // before; neither does now. Butterfly milkweed, rated toxic to both, is hidden as before.
  await page.getByTestId('plant-search').fill('Speckled alder');
  await expect(page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Speckled Alder$/ }) })).toHaveCount(1);
  await page.getByTestId('plant-search').fill('Butterfly milkweed');
  await expect(page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Butterfly Milkweed$/ }) })).toHaveCount(0);
  // Nothing stored changed by reading it; Dogs turned off and on again is kept as it's said now.
  await page.waitForTimeout(400); // (a save would have happened)
  expect(await planHousehold(page)).toEqual({ ...NONE, kids: true, dogs: 'nonToxic', answered: true });
  await openFilters(page);
  await page.getByTestId('protect-dogs').click();
  await page.getByTestId('protect-dogs').click();
  await expect.poll(() => planHousehold(page)).toEqual({ ...NONE, kids: true, dogs: 'hideToxic', answered: true });
});

test('"Hide plants rated toxic to:" fits a 360 px phone at every text size: one row of chips, the list still on screen', async ({ page }) => {
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
    // The list still starts on the screen, at full height. (The picker opens at half, the plan above it; its handle takes
    // it to full: Jason, Nov 2, the plan in view while choosing, src/ui/picker-view.ts.)
    await page.getByTestId('picker-handle').click();
    await expect.poll(async () => (await page.getByTestId('plant-row').first().boundingBox())!.y).toBeLessThan(740);
  }
});
