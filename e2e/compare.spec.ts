import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { openFilters, openFresh, tapFromCenter } from './helpers';

// Compare two or three plants (Jason, Nov 2, from the UI review: "A table of the facts that decide, with how sure each
// is"): chosen in a plant's opened details, held while browsing and filtering, compared in a table over the picker,
// placed (or swapped in) from it; cleared when the picker closes, or with Clear.

/** Search for a plant and open its row (the first, which is it: these names are one record each). */
async function openRow(page: Page, name: string) {
  await page.getByTestId('plant-search').fill(name);
  const item = page.locator('.plant-item').filter({ has: page.getByTestId('plant-row').filter({ hasText: name }) }).first();
  if ((await item.getByTestId('plant-row').getAttribute('aria-expanded')) !== 'true') await item.getByTestId('plant-row').click();
  await expect(item.getByTestId('plant-details')).toBeVisible();
  return item;
}
/** Open a plant's row and choose it to compare. */
async function choose(page: Page, name: string) {
  const item = await openRow(page, name);
  await item.getByTestId('compare-toggle').click();
  await expect(item.getByTestId('compare-toggle')).toHaveAttribute('aria-pressed', 'true');
  return item;
}
const bar = (page: Page) => page.getByTestId('compare-bar');
const columns = (page: Page) => page.getByTestId('compare-col');

test('choosing: in a plant’s details, three at most; the bar; held while browsing and filtering; Clear, and closing the picker, let them go', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await expect(bar(page)).toBeHidden();

  // One: its row says so; the bar names it and says what's next, with no Compare yet.
  const first = await choose(page, 'Spicebush');
  await expect(first.locator('.compare-mark')).toBeVisible();
  await expect(first.locator('.compare-mark')).toHaveText('Comparing');
  await expect(bar(page)).toBeVisible();
  await expect(page.getByTestId('compare-names')).toHaveText('Spicebush');
  await expect(page.getByTestId('compare-status')).toHaveText('Open another plant to compare it too');
  await expect(page.getByTestId('compare-open')).toBeHidden();
  // (Typing still goes to the search: the bar changed in place.)
  await page.getByTestId('plant-search').click();
  await page.getByTestId('plant-search').press('End');
  await page.getByTestId('plant-search').type(' ');
  await expect(page.getByTestId('plant-search')).toBeFocused();

  // Two: Compare 2.
  await choose(page, 'Buttonbush');
  await expect(page.getByTestId('compare-open')).toHaveText('Compare 2');
  await expect(page.getByTestId('compare-names')).toHaveText('Spicebush, Buttonbush');

  // Held while browsing and filtering: the search cleared, a filter on, then off.
  await page.getByTestId('clear-search').click();
  await openFilters(page);
  await page.locator('#all-filters select[aria-label=Sun]').selectOption('Shade');
  await expect(page.getByTestId('active-chip')).toHaveCount(1);
  await expect(page.getByTestId('compare-open')).toHaveText('Compare 2');
  await page.getByTestId('reset-filters').click();
  await expect(page.getByTestId('compare-open')).toHaveText('Compare 2');
  const again = await openRow(page, 'Spicebush');
  await expect(again.locator('.compare-mark')).toBeVisible();
  await expect(again.getByTestId('compare-toggle')).toHaveAttribute('aria-pressed', 'true');

  // Three, and no fourth: its Compare isn't offered, and says why.
  await choose(page, 'Mountain laurel');
  await expect(page.getByTestId('compare-open')).toHaveText('Compare 3');
  const fourth = await openRow(page, 'Turkey corn');
  await expect(fourth.getByTestId('compare-toggle')).toBeDisabled();
  await expect(fourth.getByTestId('compare-full')).toHaveText('3 at most: remove one first');
  // One let go: the fourth can come in.
  const laurel = await openRow(page, 'Mountain laurel');
  await laurel.getByTestId('compare-toggle').click();
  await expect(laurel.getByTestId('compare-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(laurel.locator('.compare-mark')).toBeHidden();
  await expect(page.getByTestId('compare-open')).toHaveText('Compare 2');
  const turkey = await openRow(page, 'Turkey corn');
  await expect(turkey.getByTestId('compare-toggle')).toBeEnabled();

  // Clear: all let go.
  await page.getByTestId('compare-clear').click();
  await expect(bar(page)).toBeHidden();
  await expect(turkey.getByTestId('compare-toggle')).toHaveAttribute('aria-pressed', 'false');

  // Closing the picker lets them go too.
  await choose(page, 'Spicebush');
  await choose(page, 'Buttonbush');
  await page.locator('.sheet-header .iconbtn[aria-label=Close]').click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await page.locator('.tool-btn.plants').click();
  await expect(bar(page)).toBeHidden();
  const back = await openRow(page, 'Spicebush');
  await expect(back.getByTestId('compare-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('the table: the facts where they differ, each with how sure, "Not known" where none; the rest folded; on a phone two plants and a sideways scroll, on a computer all three', async ({ page }, info) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  // (Anise shrub: no growth rate or visitors on record, "Not known".)
  for (const name of ['Spicebush', 'Anise shrub', 'Mountain laurel']) await choose(page, name);
  await page.getByTestId('compare-open').click();
  const sheet = page.getByTestId('compare-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.sheet-header .title')).toHaveText('Compare 3 plants');
  await expect(columns(page)).toHaveText(['Spicebush', 'Anise Shrub', 'Mountain Laurel']);

  // Rows where they differ, in the table; each cell a value and, where there's one, a quiet mark of how sure.
  const differ = page.getByTestId('compare-differ');
  const labels = await differ.locator('th[scope=row]').allInnerTexts();
  expect(labels).toEqual(expect.arrayContaining(['Height', 'Width', 'Sun', 'Toxic to people']));
  const height = differ.locator('tr[data-row=height]');
  await expect(height.getByTestId('compare-cell')).toHaveCount(3);
  for (const c of await height.getByTestId('compare-cell').all()) {
    await expect(c.locator('.compare-value')).toHaveText(/\d.*(ft|in)|Not known/);
  }
  await expect(height.getByTestId('compare-sure').first()).toHaveText(/NC State|USDA|nursery page|Earlier list/);
  await expect(height.getByTestId('compare-sure').first()).toHaveText(/ · (confirmed|one source|nurseries agree|one nursery|sources disagree)|unverified/);
  await expect(differ.locator('tr[data-row=poison] .compare-value').nth(2)).toContainText('severity');
  // (No cell is blank: a fact no source gives says so.)
  for (const v of await sheet.locator('.compare-value').allInnerTexts()) expect(v.trim()).not.toBe('');
  await expect(differ.locator('tr[data-row=growth] .compare-value').nth(1)).toHaveText('Not known');
  await expect(differ.locator('tr[data-row=growth] .compare-value').nth(1)).toHaveClass(/unknown/);

  // What the marks mean, a tap away, in the details' words.
  await page.getByTestId('compare-sure-what').click();
  await expect(page.locator('#compare-sure-more')).toContainText('Second reading');
  await expect(page.locator('#compare-sure-more')).toContainText('From its species');

  // The same for all: folded, then opened.
  const same = page.getByTestId('compare-same');
  if (await page.getByTestId('compare-same-toggle').count()) {
    await expect(same).toBeHidden();
    await expect(page.getByTestId('compare-same-toggle')).toHaveText(/^The same for all · \d+ facts?$/);
    await page.getByTestId('compare-same-toggle').click();
    await expect(same).toBeVisible();
    await expect(page.getByTestId('compare-same-toggle')).toHaveAttribute('aria-expanded', 'true');
  }

  const scroll = page.getByTestId('compare-scroll');
  const box = (await scroll.boundingBox())!;
  const right = box.x + box.width;
  const col = async (i: number) => (await columns(page).nth(i).boundingBox())!;
  if (info.project.name === 'phone') {
    // A 412-wide phone: two plants beside the facts' names; the third a sideways scroll away.
    expect(box.width).toBeLessThanOrEqual(412);
    expect((await col(1)).x + (await col(1)).width).toBeLessThanOrEqual(right + 1);
    expect((await col(2)).x).toBeGreaterThanOrEqual(right - 2);
    const label = differ.locator('th[scope=row]').first();
    const before = (await label.boundingBox())!;
    await scroll.evaluate((e) => { e.scrollLeft = e.scrollWidth; });
    await expect.poll(async () => (await col(2)).x + (await col(2)).width).toBeLessThanOrEqual(right + 1);
    // (The facts' names kept in view, at the left, the third plant beside them, not under them.)
    const after = (await label.boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
    expect((await col(2)).x).toBeGreaterThanOrEqual(after.x + after.width - 1);
    // Scrolled down, the plants' names stay at the top.
    await scroll.evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await expect.poll(async () => Math.round((await col(2)).y)).toBeGreaterThanOrEqual(Math.floor(box.y));
    expect((await col(2)).y).toBeLessThan(box.y + 4);
  } else {
    // A computer: all three, no sideways scroll.
    expect((await col(2)).x + (await col(2)).width).toBeLessThanOrEqual(right + 1);
    expect(await scroll.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
  }

  // Remove: a column goes; with one left, back to the picker, that one still chosen.
  await page.getByRole('button', { name: 'Remove Mountain laurel from the comparison' }).click();
  await expect(columns(page)).toHaveText(['Spicebush', 'Anise Shrub']);
  await expect(sheet.locator('.sheet-header .title')).toHaveText('Compare 2 plants');
  await expect(page.getByTestId('compare-open')).toHaveText('Compare 2'); // (the picker's bar, beneath, in step)
  await page.getByRole('button', { name: 'Remove Anise shrub from the comparison' }).click();
  await expect(page.getByTestId('compare')).toHaveCount(0);
  await expect(page.getByTestId('compare-names')).toHaveText('Spicebush');
  await expect(page.getByTestId('plant-search')).toBeVisible();
});

test('back to the picker from the comparison, by its ←, Esc and the back button, the plants still chosen', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await choose(page, 'Spicebush');
  await choose(page, 'Buttonbush');
  const opened = async () => {
    await page.getByTestId('compare-open').click();
    await expect(page.getByTestId('compare-sheet')).toBeVisible();
  };
  await opened();
  await page.getByTestId('compare-sheet').getByRole('button', { name: 'Back to the plant list' }).click();
  await expect(page.getByTestId('compare')).toHaveCount(0);
  await expect(page.getByTestId('compare-open')).toHaveText('Compare 2');
  // (The picker as it was: the row still open, its search still there.)
  await expect(page.getByTestId('plant-search')).toHaveValue('Buttonbush');
  await expect(page.locator('.plant-item', { hasText: 'Buttonbush' }).first().getByTestId('plant-details')).toBeVisible();
  await opened();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('compare')).toHaveCount(0);
  await expect(page.locator('.picker-sheet')).toBeVisible();
  await opened();
  await page.goBack();
  await expect(page.getByTestId('compare')).toHaveCount(0);
  await expect(page.locator('.picker-sheet')).toBeVisible();
  await expect(page.getByTestId('compare-open')).toHaveText('Compare 2');
});

test('Place from the table: in hand to place, the picker closed, the choice gone; the plan’s own warnings for one already placed', async ({ page }) => {
  await openFresh(page);
  // Turkey corn placed first: its row in the table says what the plan says of it.
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Turkey corn');
  await page.locator('.sheet .proj-row', { hasText: 'Turkey corn' }).first().getByTestId('plant-place').click();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();

  await page.locator('.tool-btn.plants').click();
  await choose(page, 'Turkey corn');
  await choose(page, 'Spicebush');
  await page.getByTestId('compare-open').click();
  const warnings = page.locator('[data-testid=compare-table] tr[data-row=warnings]');
  await expect(warnings.locator('th')).toHaveText('In this plan');
  await expect(warnings.locator('.compare-value').nth(1)).toHaveText('Not in this plan');
  await expect(warnings.locator('.compare-value').nth(0)).toHaveText(/^(None|\d+ warnings?)$/);

  await expect(page.getByTestId('compare-use')).toHaveText(['Place', 'Place']);
  await expect(page.getByTestId('compare-use').nth(1)).toHaveAttribute('aria-label', 'Place Spicebush');
  await page.getByTestId('compare-use').nth(1).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.getByTestId('place-bar')).toContainText('Spicebush');
  // (Back in the picker, from the plant in hand: nothing chosen.)
  await page.getByTestId('place-switch').click();
  await expect(page.locator('.picker-sheet')).toBeVisible();
  await expect(bar(page)).toBeHidden();
});

test('Swap from the table, when the comparison started from Swap', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Turkey corn');
  await page.locator('.sheet .proj-row', { hasText: 'Turkey corn' }).first().getByTestId('plant-place').click();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await tapFromCenter(page, 0, 0);
  await page.locator('.sel-pill button.edit').click();
  await page.getByTestId('swap-plant').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Swap for another plant');

  await choose(page, 'Spicebush');
  await choose(page, 'Buttonbush');
  await page.getByTestId('compare-open').click();
  await expect(page.getByTestId('compare-use')).toHaveText(['Swap', 'Swap']);
  await page.getByRole('button', { name: 'Swap for Buttonbush' }).click();
  await expect(page.locator('#toast, [data-testid=crowd-notice]').filter({ hasText: 'Buttonbush' })).toHaveCount(1);
  // (Swapped: the sheet closes, the plant swapped in selected. Jason, Nov 5.)
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('.sel-pill')).toContainText('Buttonbush');
  await expect(page.getByTestId('compare')).toHaveCount(0);
});

test('the comparison names every control, and its text is dark enough', async ({ page }) => {
  const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await choose(page, 'Spicebush');
  await choose(page, 'Mountain laurel');
  const problems = async (beneath = false) => {
    await page.addScriptTag({ path: AXE });
    return page.evaluate(async (beneath) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axe = (window as any).axe;
      const rules = ['button-name', 'link-name', 'image-alt', 'aria-toggle-field-name', 'color-contrast', 'td-headers-attr', 'th-has-data-cells'];
      // (With the comparison open, the picker beneath it is covered and inert: not the comparison's to judge.)
      const r = await axe.run({ exclude: [['#canvas-svg'], ...(beneath ? [['.picker-sheet']] : [])] }, { runOnly: { type: 'rule', values: rules } });
      return r.violations.flatMap((v: { id: string; nodes: { target: string[] }[] }) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
    }, beneath);
  };
  expect(await problems()).toEqual([]); // (the picker, its toggle and bar)
  await page.getByTestId('compare-open').click();
  await page.getByTestId('compare-sure-what').click();
  if (await page.getByTestId('compare-same-toggle').count()) await page.getByTestId('compare-same-toggle').click();
  expect(await problems(true)).toEqual([]);
  // (The picker beneath is out of reach meanwhile, for a keyboard and a screen reader.)
  await expect(page.locator('.picker-sheet')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('.picker-sheet')).not.toHaveAttribute('inert', '');
});
