import { test, expect, type Page } from '@playwright/test';
import { addKind, closeSheet, openFresh } from './helpers';

// The plant picker with more room for results at its default height (Jason's notes of Nov 4, 9:02 PM: 1, 3, 8, 9):
// "People mostly use the default setup ... we need to reconsider how it's set up so they see results sooner." No title
// row (the search, or the For row, beside the ✕); no "Planting a bed? …", Recent, "Place a plant …" or "Not every
// detail is checked"; the hardiness citation a small Source opening a little pane; in a plant's details, a single "In
// winter" fact on its label's line, See photos on its own line, and the earlier list's facts marked. The height (60%),
// the handle's swipe and a tap on the plan: e2e/plan-in-view.spec.ts. The For row only with beds:
// e2e/plant-this-bed.spec.ts.

const sheet = (page: Page) => page.locator('.picker-sheet');
const search = (page: Page) => page.getByTestId('plant-search');
async function openPicker(page: Page) {
  await page.locator('.tool-btn.plants').click();
  await expect(sheet(page)).toBeVisible();
  await expect(page.locator('.picker-sheet .plant-item').first()).toBeVisible();
}
/** Jason's own: two beds, two plants placed, a ZIP (zone 8a), Hardy in zone ticked, a dog in the yard. */
async function seedJason(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const bed = { color: '#b45309', opacity: 0.65, rotation: 0, role: 'bed', type: 'rect' };
    const plant = { color: '#16a34a', opacity: 0.65, type: 'circle', radius: 1, role: 'plant' };
    localStorage.setItem('landscape-planner-v1', JSON.stringify({
      shapes: [
        { ...bed, id: 'bed', x: 0, y: 0, width: 12, height: 6, label: 'Front bed' },
        { ...bed, id: 'back', x: -2, y: -14, width: 16, height: 8, label: 'Back bed' },
        { ...plant, id: 'p1', x: 3, y: 3, label: 'Butterfly milkweed', plantId: 'asclepias-tuberosa' },
        { ...plant, id: 'p2', x: 9, y: 3, label: 'Wild columbine', plantId: 'aquilegia-canadensis' },
      ],
      location: { zip: '71923', zone: '8a' }, household: { kids: false, dogs: 'hideToxic', cats: false, horses: false, answered: true },
      zoom: 1, offsetX: -3, offsetY: -16,
    }));
    localStorage.setItem('lp-hardy-here', '1');
  });
  await page.goto('./');
  await expect(page.locator('.project-btn .pname')).toBeVisible();
}
/** How many result rows are wholly in view in the picker, under its top (src: the brief's measure). */
const rowsInView = (page: Page) => sheet(page).evaluate((s) => {
  const top = s.querySelector('.sheet-top')!.getBoundingClientRect().bottom, bottom = s.getBoundingClientRect().bottom;
  return [...s.querySelectorAll('.plant-item > .proj-row')].filter((r) => { const b = r.getBoundingClientRect(); return b.height > 0 && b.top >= top - 0.5 && b.bottom <= bottom + 0.5; }).length;
});

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phones only');

  test('on Jason\'s 412 × 915 phone, the picker at rest shows whole result rows without scrolling: no title row, the For row beside the ✕, the count line just how many', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await seedJason(page);
    await openPicker(page);
    // ("If we do most or all of that, I think we might see 1 plant on my phone without scrolling": it was none.)
    expect(await rowsInView(page)).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.picker-sheet .sheet-header .title')).toHaveCount(0);
    await expect(sheet(page)).not.toContainText('Plant Picker (');
    await expect(page.locator('.picker-sheet .sheet-header [data-testid=plant-for]')).toBeVisible();
    for (const gone of ['Planting a bed?', 'Recent', 'Place a plant', 'Not every detail is checked', 'PRISM Group']) await expect(sheet(page)).not.toContainText(gone);
    await expect(page.getByTestId('picker-count')).toHaveText(/^[\d,]+ of [\d,]+ plants match · \d+ plants? banned in Arkansas shows? only when searched by name$/);
    // (Still a heading for a screen reader.)
    await expect(page.getByRole('heading', { name: 'Plant Picker' })).toBeAttached();
  });

  test('a new plan: the search beside the ✕, the first results in view', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await openFresh(page);
    await openPicker(page);
    await expect(page.locator('.picker-sheet .sheet-header [data-testid=plant-search]')).toBeVisible();
    await expect(page.getByTestId('plant-for')).toHaveCount(0);
    const s = (await search(page).boundingBox())!, x = (await page.locator('.picker-sheet .sheet-header button[aria-label=Close]').boundingBox())!;
    expect(Math.abs((s.y + s.height / 2) - (x.y + x.height / 2))).toBeLessThan(6);
    expect(s.x + s.width).toBeLessThan(x.x);
    expect(await rowsInView(page)).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('picker-count')).toHaveText(/^All [\d,]+ plants$/);
  });
});

test.describe('on a computer', () => {
  test.skip(({ isMobile }) => isMobile, 'laptops and desktops only');

  test('the panel beside the plan: no title row, the search or For row beside its ✕, the count line just how many', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 820 });
    await seedJason(page);
    await openPicker(page);
    await expect(page.locator('.picker-sheet .sheet-header .title')).toHaveCount(0);
    await expect(page.locator('.picker-sheet .sheet-header [data-testid=plant-for]')).toBeVisible();
    await expect(search(page)).toBeFocused(); // (the cursor in it, as before)
    await expect(page.getByTestId('picker-count')).toHaveText(/^[\d,]+ of [\d,]+ plants match · /);
    expect(await rowsInView(page)).toBeGreaterThanOrEqual(4);
  });
});

test('Swap, Link and Which tree keep a title saying what they\'re for', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'tree');
  await expect(page.locator('.picker-sheet .sheet-header .title')).toHaveText('Which tree?');
  await expect(search(page)).toBeVisible();
  await closeSheet(page);
});

test('Hardy in zone\'s Source opens a little pane with the citation; a press outside, Escape or Source again closes it, the picker as it was', async ({ page }) => {
  await seedJason(page);
  await openPicker(page);
  const src = page.getByRole('button', { name: 'Source of the hardiness zones' });
  await expect(src).toHaveAttribute('data-testid', 'zone-source');
  const pane = page.getByTestId('zone-source-pane');
  await expect(src).toHaveText('Source');
  await expect(src).toHaveAttribute('aria-expanded', 'false');
  await expect(pane).toBeHidden();
  // Beside "Hardy in zone 8a", on its line.
  const hardy = (await page.locator('.hardy-check').boundingBox())!, s = (await src.boundingBox())!;
  expect(Math.abs((hardy.y + hardy.height / 2) - (s.y + s.height / 2))).toBeLessThan(8);
  // Opened: the citation in full, the list where it was.
  const first = page.locator('.plant-item > .proj-row').first();
  const at = (await first.boundingBox())!.y;
  await src.click();
  await expect(src).toHaveAttribute('aria-expanded', 'true');
  await expect(pane).toBeVisible();
  await expect(pane).toHaveText('Zones: USDA Plant Hardiness Zone Map 2023 (PRISM Group, Oregon State University, prism.oregonstate.edu).');
  expect((await first.boundingBox())!.y).toBeCloseTo(at, 0);
  const vw = page.viewportSize()!.width, p = (await pane.boundingBox())!;
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(vw);
  await expect(page.getByTestId('hardy-here')).toBeChecked(); // (not a press on its box)
  // A press outside it (the count line, at its start, clear of the pane): closed, and nothing else.
  await page.getByTestId('picker-count').click({ position: { x: 4, y: 4 } });
  await expect(pane).toBeHidden();
  await expect(src).toHaveAttribute('aria-expanded', 'false');
  // Source again closes it.
  await src.click();
  await expect(pane).toBeVisible();
  await src.click();
  await expect(pane).toBeHidden();
  // Escape: closed, the focus back on Source, the picker still open; Escape again closes the picker.
  await src.focus();
  await page.keyboard.press('Enter');
  await expect(pane).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pane).toBeHidden();
  await expect(src).toBeFocused();
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  // Unticked, no Source.
  await openPicker(page);
  await page.getByTestId('hardy-here').uncheck();
  await expect(page.getByTestId('zone-source')).toBeHidden();
});

test('a plant\'s details: a single "In winter" fact on its label\'s line, several on lines of their own; See photos on a line of its own; the earlier list\'s facts marked Unverified', async ({ page }) => {
  await openFresh(page);
  await openPicker(page);
  const open = async (q: string, name: RegExp) => {
    await search(page).fill(q);
    const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: name }) }).first();
    await item.getByTestId('plant-row').click();
    // (A group opened stays open for the next plant while the picker's open.)
    const looks = item.getByTestId('group-looks');
    if ((await looks.getAttribute('aria-expanded')) !== 'true') await looks.click();
    return item;
  };
  const tea = await open('New Jersey tea', /^New Jersey Tea$/);
  const winter = tea.getByTestId('winter-row');
  await expect(winter).toBeVisible();
  // One fact: on the label's line.
  const label = winter.locator('xpath=preceding-sibling::dt[1]');
  await expect(label).toHaveText('In winter');
  const fact = tea.getByTestId('winter-leaves');
  await expect(fact).toHaveText('Deciduous: loses its leaves');
  const l = (await label.boundingBox())!, f = (await fact.boundingBox())!;
  expect(Math.abs(l.y - f.y)).toBeLessThan(4);
  expect(f.x).toBeGreaterThan(l.x + l.width - 1);
  // See photos: its own line, under the botanical name and Compare, with its icon.
  const photos = tea.getByTestId('see-photos');
  await expect(photos).toHaveText('See photos ↗');
  await expect(photos.locator('.details-photos-icon svg')).toBeVisible();
  const bot = (await tea.locator('.details-bot').boundingBox())!, cmp = (await tea.getByTestId('compare-toggle').boundingBox())!, ph = (await photos.boundingBox())!;
  expect(ph.y).toBeGreaterThanOrEqual(Math.max(bot.y + bot.height, cmp.y + cmp.height) - 1);
  // The earlier list's facts: marked on themselves.
  await tea.getByTestId('group-wildlife').click();
  const nectar = tea.locator('dt', { hasText: 'Nectar for pollinators' }).locator('xpath=following-sibling::dd[1]');
  await expect(nectar.getByTestId('unverified-chip')).toHaveText('Unverified');
  await expect(nectar.locator('.details-src')).toHaveText('Source: earlier list, unverified');
  const form = tea.locator('dt', { hasText: /^Form$/ }).locator('xpath=following-sibling::dd[1]');
  await expect(form.getByTestId('unverified-chip')).toHaveCount(0);
  // Several winter facts: each on a line of its own, under the label.
  await tea.getByTestId('plant-row').click();
  const holly = await open('Winterberry holly', /^Winterberry Holly$/);
  const parts = holly.getByTestId('winter-row').locator('.details-part');
  expect(await parts.count()).toBeGreaterThanOrEqual(2);
  const hl = (await holly.getByTestId('winter-row').locator('xpath=preceding-sibling::dt[1]').boundingBox())!, p0 = (await parts.first().boundingBox())!;
  expect(p0.y).toBeGreaterThan(hl.y + hl.height / 2);
});
