import { test, expect, type Page } from '@playwright/test';
import { closeSheet, openFresh, openSections, openWarnings, shapeCount, tapFromCenter } from './helpers';

// Fix from the problem (Jason's UI review, Nov 2, marked Next): "Smaller forms of the same plant first (Blue Jean Baby
// for Russian sage); 'Nudge apart'; Swap opened already filtered by the rule that failed. No 'plants like this'
// suggestions." From each way a warning is shown: a row in Warnings, a plant's details, the crowding notice.

const base = { color: '#16a34a', opacity: 0.65, locked: false };
const plant = (id: string, plantId: string, label: string, x: number, y: number, radius = 1, extra: object = {}) =>
  ({ ...base, id, type: 'circle', role: 'plant', plantId, label, x, y, radius, ...extra });
const rect = (id: string, role: string, label: string, x: number, y: number, width: number, height: number, extra: object = {}) =>
  ({ ...base, id, type: 'rect', role, label, x, y, width, height, rotation: 0, ...extra });
const sunny = rect('sunny', 'shade', 'Sunny strip', 20, -5, 10, 10, { sun: { mode: 'hours', hours: 8, periods: [[540, 780]], dappled: false } });

/** A plan as an older version kept it (as e2e/warnings-sheet.spec.ts opens one), with dogs in the yard and zone 8a. */
async function openPlan(page: Page, shapes: object[], where: { dogs?: boolean; zone?: boolean; hardy?: boolean } = {}) {
  await page.addInitScript(([shapes, where]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    if (where.hardy) localStorage.setItem('lp-hardy-here', '1');
    if (where.dogs) localStorage.setItem('lp-yard', JSON.stringify({ kids: false, dogs: 'hideToxic', cats: false, horses: false }));
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes, ...(where.zone ? { location: { zip: '71923', zone: '8a' } } : {}), zoom: 1, offsetX: -20, offsetY: -20 }));
  }, [shapes, where] as const);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
  await expect(page.getByTestId('warnings-btn')).not.toHaveAttribute('data-state', 'checking');
}
const kind = (page: Page, k: string) => page.getByTestId(`warnings-kind-${k}`);
const wide = (page: Page) => page.viewportSize()!.width >= 900;
/** The middle of a shape as drawn, on the page. */
async function centerOf(page: Page, id: string) {
  const b = (await page.locator(`#canvas-svg [data-shape-id=${id}]`).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
/** A plant's details: the whole plan in view, the plant pressed, Edit. */
async function details(page: Page, id: string) {
  await page.getByTestId('zoom-fit').click();
  await page.locator(`#canvas-svg [data-shape-id=${id}]`).first().click();
  await page.locator('.sel-pill button.edit').click();
  await openSections(page);
}
const title = (page: Page) => page.locator('.picker-sheet .sheet-header .title');
const swapWhy = (page: Page) => page.getByTestId('swap-why');
const chips = (page: Page) => page.getByTestId('active-chip');

test('Warnings: a crowded pair\'s Nudge apart moves the newer just clear of the other, with Undo; with no room it says so and moves nothing', async ({ page }) => {
  // Two snowberries (4½ ft typical spread) 2 ft apart, free to move; two more in a bed 5 ft wide, against its edge.
  await openPlan(page, [
    plant('a', 'symphoricarpos-albus', 'Snowberry', 0, 0, 2.25), plant('b', 'symphoricarpos-albus', 'Snowberry', 2, 0, 2.25),
    rect('bed', 'bed', 'Narrow bed', -2, 8, 5, 4), plant('c', 'symphoricarpos-albus', 'Snowberry', -0.5, 10, 2.25), plant('d', 'symphoricarpos-albus', 'Snowberry', 1.5, 10, 2.25),
  ]);
  await page.getByTestId('zoom-fit').click();
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(4);
  await openWarnings(page, 'crowding');
  const b0 = await centerOf(page, 'b'), a0 = await centerOf(page, 'a'); // (on a computer, with Warnings beside the plan)
  const rows = kind(page, 'crowding').getByTestId('warning-row');
  await expect(rows).toHaveCount(2);
  const freeRow = kind(page, 'crowding').locator('[data-row-key="crowding:a,b"]'), bedRow = kind(page, 'crowding').locator('[data-row-key="crowding:c,d"]');
  await expect(freeRow.getByTestId('warning-select')).toContainText('2 Snowberry, 2 ft apart');
  await expect(freeRow.getByTestId('warning-fixes').getByRole('button')).toHaveText(['Nudge apart', 'Swap for a smaller plant…']);
  // The pair outside a bed: the newer one, b, moves 2½ ft along the line, to just clear (4½ ft apart).
  await freeRow.getByTestId('warning-nudge').click();
  await expect(page.getByTestId('nudge-notice')).toContainText('Nudged one Snowberry 2.5 ft away from the other.');
  await expect(rows).toHaveCount(1);
  if (!wide(page)) await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);
  const b1 = await centerOf(page, 'b'), a1 = await centerOf(page, 'a');
  expect(a1.x).toBeCloseTo(a0.x, 0); // (a stays)
  expect(b1.y).toBeCloseTo(b0.y, 0); // (along the line)
  // 2½ ft further, at the plan's scale: a was 2 ft from b, now 4½.
  expect((b1.x - a1.x) / (b0.x - a0.x)).toBeCloseTo(4.5 / 2, 1);
  // Undo puts it back, one step.
  await page.getByTestId('nudge-notice').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(4);
  expect((await centerOf(page, 'b')).x).toBeCloseTo(b0.x, 0);
  // The pair in the narrow bed: d would leave the bed. Said, and nothing moves.
  const d0 = await centerOf(page, 'd');
  await openWarnings(page, 'crowding');
  await bedRow.getByTestId('warning-nudge').click();
  await expect(page.locator('#toast')).toHaveText('No room to nudge Snowberry away from the other without leaving Narrow bed.');
  await expect(rows).toHaveCount(2);
  if (!wide(page)) await closeSheet(page);
  expect((await centerOf(page, 'd')).x).toBeCloseTo(d0.x, 0);
});

test('Warnings: Swap from a sun, hardiness or poison row opens filtered for what failed, as chips that come off; the picker\'s own filters are untouched after', async ({ page }) => {
  await openPlan(page, [
    sunny, plant('tc', 'dicentra-eximia', 'Turkey corn', 25, 0, 0.5), // (wants part shade, in 8 h of sun)
    plant('al', 'aloe-vera', 'Barbados aloe', 40, 0), // (too cold for zone 8a)
    plant('mw', 'asclepias-tuberosa', 'Butterfly milkweed', 40, 15), // (a problem for dogs)
  ], { dogs: true, zone: true, hardy: true });
  // Sun: filtered for the sun where it's planted.
  await openWarnings(page, 'sun');
  await kind(page, 'sun').getByTestId('warning-swap').click();
  await expect(title(page)).toHaveText('Swap for another plant');
  await expect(page.getByTestId('swap-banner')).toContainText('swap it for');
  await expect(swapWhy(page)).toHaveText('Filtered for full sun, the sun where it’s planted');
  await expect(chips(page).filter({ hasText: 'Full sun' })).toHaveCount(1);
  await expect(chips(page).filter({ hasText: 'No plants rated toxic to dogs' })).toHaveCount(1); // (who's in the yard, as the picker always has it)
  await expect(page.getByTestId('plant-search')).toHaveValue('');
  // Taken off, as any filter is; the line goes with it.
  await chips(page).filter({ hasText: 'Full sun' }).click();
  await expect(chips(page).filter({ hasText: 'Full sun' })).toHaveCount(0);
  await expect(swapWhy(page)).toBeHidden();
  // Closed: back to its details; the picker opened on its own has none of it.
  await page.locator('.sheet-header').getByRole('button', { name: 'Back to properties' }).click();
  await expect(page.getByTestId('sun-check')).toBeVisible();
  await closeSheet(page);
  await page.keyboard.press('Escape');
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('picker')).toBeVisible();
  await expect(title(page)).toHaveCount(0); // (the picker on its own: no title row, Jason, Nov 4)
  await expect(swapWhy(page)).toHaveCount(0);
  await expect(chips(page).filter({ hasText: 'Full sun' })).toHaveCount(0);
  await expect(page.getByTestId('hardy-here')).toBeChecked(); // (as this device keeps it)
  await closeSheet(page);

  // Hardiness: Hardy in zone 8a, said why. Unticked for this Swap, it's this Swap's alone: not kept on this device.
  await openWarnings(page, 'hardy');
  await kind(page, 'hardy').getByTestId('warning-swap').click();
  await expect(swapWhy(page)).toHaveText('Filtered for plants hardy in zone 8a, the garden’s zone');
  await expect(page.getByTestId('hardy-here')).toBeChecked();
  await page.getByTestId('plant-search').fill('Barbados aloe');
  await expect(page.locator('.sheet .proj-row', { hasText: 'Barbados aloe' })).toHaveCount(0); // (itself, never; and too cold)
  await page.getByTestId('hardy-here').uncheck();
  await expect(swapWhy(page)).toBeHidden();
  await page.locator('.sheet-header').getByRole('button', { name: 'Back to properties' }).click();
  await closeSheet(page);
  await page.keyboard.press('Escape');
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('hardy-here')).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('lp-hardy-here'))).toBe('1');
  await closeSheet(page);

  // Poison: the filters for who's in the yard. One taken off widens this list only: the yard still has its dogs.
  await openWarnings(page, 'poison');
  await kind(page, 'poison').getByTestId('warning-row').filter({ hasText: 'Butterfly milkweed' }).getByTestId('warning-swap').click();
  await expect(swapWhy(page)).toHaveText('Filtered for the dogs in the yard');
  await chips(page).filter({ hasText: 'No plants rated toxic to dogs' }).click();
  await expect(chips(page)).toHaveCount(0);
  await page.locator('.sheet-header').getByRole('button', { name: 'Back to properties' }).click();
  await expect(page.getByTestId('poison-check')).toContainText('You said dogs are in the yard');
  await closeSheet(page);
  await page.keyboard.press('Escape');
  await page.locator('.tool-btn.plants').click();
  await expect(chips(page).filter({ hasText: 'No plants rated toxic to dogs' })).toHaveCount(1);
});

test('a plant\'s details: crowded Russian Sage swaps for a smaller form of itself first, filtered for the width that fits', async ({ page }) => {
  // Russian Sage (3 ft typical spread) 2.4 ft from a New England aster (2 ft): close. 2.8 ft fits there.
  await openPlan(page, [plant('rs', 'salvia-yangii-2', 'Russian Sage', 0, 0, 1.5), plant('as', 'symphyotrichum-novae-angliae', 'New England aster', 2.4, 0)]);
  await details(page, 'rs');
  await page.getByTestId('crowding-line').click();
  await expect(page.getByTestId('crowding-detail').getByRole('button')).toHaveText(['Nudge apart', 'Swap for a smaller plant…', 'Dismiss for this pair']);
  await page.getByTestId('fix-swap-big').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Swap for another plant');
  await expect(swapWhy(page)).toHaveText('Filtered for plants up to 2.5 ft wide, the room it has beside New England Aster');
  await expect(chips(page)).toHaveText(['Width: up to 2.5 ft']);
  // Its own smaller forms first, by their sources' sizes; then the rest.
  await expect(page.getByTestId('smaller-forms')).toHaveText('Smaller forms of Russian Sage');
  const firstRow = page.locator('.sheet .plant-item').first();
  await expect(firstRow.locator('.pname')).toHaveText("Russian Sage 'Denim 'n Lace'");
  await expect(firstRow.getByTestId('smaller-fit')).toHaveText('Typically 2.8 ft wide: fits');
  await expect(page.getByTestId('other-plants')).toBeVisible();
  await firstRow.getByTestId('plant-place').click();
  await expect(page.locator('#toast')).toContainText("Swapped for Russian Sage 'Denim 'n Lace'.");
  await expect(page.getByTestId('crowding')).toHaveCount(0); // (no longer close)
  await closeSheet(page);
  // The picker on its own: no width left on.
  await page.keyboard.press('Escape');
  await page.locator('.tool-btn.plants').click();
  await expect(chips(page)).toHaveCount(0);
});

test('a plant\'s details: Nudge apart moves this one, with Undo; wider than its bed says so, its swap filtered for the bed\'s width', async ({ page }) => {
  await openPlan(page, [
    plant('rs', 'salvia-yangii-2', 'Russian Sage', 0, 0, 1.5), plant('as', 'symphyotrichum-novae-angliae', 'New England aster', 2, 0),
    rect('strip', 'bed', 'Side strip', -10, 9, 20, 2), plant('rs2', 'salvia-yangii-2', 'Russian Sage', 0, 10, 1.5, { label: 'Strip sage' }),
  ]);
  await page.getByTestId('zoom-fit').click();
  const as0 = await centerOf(page, 'as'), rs0 = await centerOf(page, 'rs');
  // The older of the two, chosen: it moves, not the aster.
  await details(page, 'rs');
  await page.getByTestId('crowding-line').click();
  await page.getByTestId('fix-nudge').click();
  await expect(page.getByTestId('nudge-notice')).toContainText('Nudged Russian Sage 0.5 ft away from New England Aster.');
  await expect(page.getByTestId('crowding')).toHaveCount(0);
  await closeSheet(page);
  expect((await centerOf(page, 'as')).x).toBeCloseTo(as0.x, 0);
  expect((await centerOf(page, 'rs')).x).toBeLessThan(rs0.x - 2);
  await page.getByTestId('nudge-notice').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await centerOf(page, 'rs')).x).toBeCloseTo(rs0.x, 0);
  // In a 2 ft strip: wider than its bed, and its smaller form doesn't fit either (said so on its row).
  await page.keyboard.press('Escape');
  await details(page, 'rs2');
  await expect(page.getByTestId('bed-fit')).toContainText('Wider than Side strip: it typically spreads 3 ft, and the bed is 2 ft across at its widest.');
  await page.getByTestId('bed-fit').getByTestId('fix-swap-big').click();
  await expect(swapWhy(page)).toHaveText('Filtered for plants up to 2 ft wide, the width of Side strip');
  await expect(page.locator('.sheet .plant-item').first().getByTestId('smaller-fit')).toHaveText('Typically 2.8 ft wide: wider than the 2 ft there');
});

test('the crowding notice: Nudge apart moves the plant just placed, Undo puts it back; the place bar\'s Undo takes back both', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Snowberry');
  await page.locator('.sheet .proj-row', { hasText: 'Snowberry' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await tapFromCenter(page, 2, 0);
  const notice = page.getByTestId('crowd-notice');
  await expect(notice.getByRole('button')).toHaveText(['Crowding Snowberry', 'Nudge apart', 'Dismiss', 'Move it', '', '✕']);
  // Nothing cut short, by the place bar (on a phone 412 px wide, two rows of two).
  for (const b of await notice.locator('.notice-buttons button').all()) expect(await b.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  await notice.getByRole('button', { name: 'Nudge apart' }).click();
  await expect(page.getByTestId('nudge-notice')).toContainText('Nudged one Snowberry 2.5 ft away from the other.');
  await expect(page.locator('#canvas-svg [data-role=crowded], #canvas-svg [data-role=close]')).toHaveCount(0);
  await page.getByTestId('nudge-notice').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#canvas-svg [data-role=crowded]')).toHaveCount(2);
  // Another placed too close, nudged, then the place bar's Undo: the plant goes, its nudge with it, so the first Undo
  // after Done takes back the one before it, not an empty step.
  await tapFromCenter(page, -2, 0);
  await notice.getByRole('button', { name: 'Nudge apart' }).click();
  await expect(page.getByTestId('nudge-notice')).toBeVisible();
  expect(await shapeCount(page)).toBe(3);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Undo' }).click();
  expect(await shapeCount(page)).toBe(2);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await page.locator('button[title=Undo]').first().click();
  expect(await shapeCount(page)).toBe(1);
});

test('Jason\'s triangle (his note on #214): the third plant, crowding both, is nudged away from both at once, not "no room"', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Snowberry');
  await page.locator('.sheet .proj-row', { hasText: 'Snowberry' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, -2.5, 0);
  await tapFromCenter(page, 2.5, 0); // (5 ft apart: clear of each other)
  await tapFromCenter(page, 0, 1.5); // (2.9 ft from each: crowding both)
  const notice = page.getByTestId('crowd-notice');
  await expect(notice.getByTestId('notice-line')).toHaveText('Crowding Snowberry (+1 more)');
  await notice.getByRole('button', { name: 'Nudge apart' }).click();
  await expect(page.getByTestId('nudge-notice')).toContainText(/^Nudged one Snowberry \d+(\.\d)? ft away from the other two\./);
  await expect(page.locator('#canvas-svg [data-role=crowded], #canvas-svg [data-role=close]')).toHaveCount(0);
  await expect(page.locator('#toast')).not.toContainText('No room');
});
