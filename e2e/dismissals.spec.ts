import { test, expect, type Page } from '@playwright/test';
import { closeSheet, openFresh, openSections, openWarnings, shapeCount, tapFromCenter } from './helpers';

// A warning dismissed for one copy of a plant is dismissed for its other copies and the ones added later, in this plan,
// with a toast that says so (Jason, Oct 30). Shown again from Settings → Warnings, and dismissed there too, one at a
// time or a kind all at once (Jason, Nov 1).

const TABLE = {
  v: 1, accessed: '2026-10-17',
  zips: { '71923': ['8a', 0, 3] },
  stations: [{ name: 'Arkadelphia 2 N, AR', chance: 100, spring: '03-24', springLate: '04-08', fall: '11-06', fallEarly: '10-24' }],
};
const badges = (page: Page) => page.locator('#canvas-svg [data-role=hardy-warning]');
async function place(page: Page, name: string, spots: [number, number][]) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  for (const [x, y] of spots) await tapFromCenter(page, x, y);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
}

test('dismissing a hardiness warning on one copy dismisses it for every copy and new ones; Settings shows it again', async ({ page }) => {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Garden location' }).click();
  await page.getByTestId('zip').fill('71923');
  await page.getByTestId('zip-lookup').click();
  await expect(page.getByTestId('location-result')).toContainText('8a');
  await closeSheet(page);
  await place(page, 'Barbados aloe', [[-4, 0], [4, 0]]);
  await expect(badges(page)).toHaveCount(2);
  // (No "Leave it": its ✕ puts the notice away, as it always did. One vocabulary, Nov 1.)
  await expect(page.getByTestId('hardy-notice').getByRole('button')).toHaveText(['Undo', 'Settings', '✕']);
  await page.getByTestId('hardy-notice').getByTestId('notice-close').click();
  // One copy's pane: Dismiss for this one, or for every Barbados aloe, said for both and the ones to come.
  await tapFromCenter(page, -4, 0);
  await page.locator('.sel-pill .edit').click();
  await openSections(page);
  await expect(page.getByTestId('hardy-check').getByRole('button')).toHaveText(['Dismiss for this one', 'Dismiss for every Barbados aloe']);
  await page.getByTestId('hardy-dismiss').click();
  await expect(page.getByTestId('dismiss-notice')).toContainText('Hardiness warning dismissed for all 2 of Barbados aloe in this plan, and any you add later.');
  await expect(page.getByTestId('dismiss-notice').getByRole('button')).toHaveText(['Just these 2', 'OK', '✕']);
  await expect(page.getByTestId('hardy-check')).toContainText('dismissed for every one in this plan');
  await expect(page.getByTestId('hardy-check').getByRole('button')).toHaveText(['Show again']);
  await closeSheet(page);
  await page.keyboard.press('Escape');
  await expect(badges(page)).toHaveCount(0);
  // A third: no notice, no badge.
  await place(page, 'Barbados aloe', [[0, 5]]);
  await expect(page.getByTestId('hardy-notice')).toHaveCount(0);
  await expect(badges(page)).toHaveCount(0);
  // Warnings lists it, dismissed, to show again: every copy's badge is back. (Gray: nothing to look at.)
  await expect(page.getByTestId('warnings-btn')).toHaveAttribute('aria-label', /^Warnings: none found, \d checks? can’t run yet$/);
  await openWarnings(page, 'hardy');
  await expect(page.getByTestId('warnings-head')).toHaveText(/^Nothing to look at yet · 1 dismissed · \d checks? can’t run$/);
  const row = page.getByTestId('warnings-kind-hardy').getByTestId('warning-row');
  await expect(row).toHaveAttribute('data-dismissed', 'true');
  await expect(row.getByTestId('warning-select')).toContainText(/^Barbados aloe \u00d73Too cold for zone 8a: it's rated for zones/);
  await expect(row.getByTestId('warning-scope')).toHaveText('Dismissed for every Barbados aloe in this plan');
  await row.getByRole('button', { name: 'Show again' }).click();
  await expect(row).toHaveAttribute('data-dismissed', 'false');
  await expect(row.getByRole('button', { name: 'Show again' })).toHaveCount(0);
  await closeSheet(page);
  await expect(badges(page)).toHaveCount(3);
  await expect(page.getByTestId('warnings-btn')).toHaveAttribute('aria-label', 'Warnings: 1 to look at');
});

// A plan with every kind of warning, opened as an older version kept it: dogs in the yard; zone 8a.
const base = { color: '#16a34a', opacity: 0.65, locked: false };
const plant = (id: string, plantId: string, label: string, x: number, y: number, radius = 1) => ({ ...base, id, type: 'circle', role: 'plant', plantId, label, x, y, radius });
const sunny = { ...base, id: 'sunny', type: 'rect', role: 'shade', label: 'Sunny strip', x: 20, y: -5, width: 10, height: 10, rotation: 0, sun: { mode: 'hours', hours: 8, periods: [[540, 780]], dappled: false } };
/** Two spicebushes 2 ft apart: crowded. */
const pair = (n: number, y: number) => [plant(`s${n}a`, 'lindera-benzoin', 'Spicebush', 0, y), plant(`s${n}b`, 'lindera-benzoin', 'Spicebush', 2, y)];
async function openPlan(page: Page, shapes: object[], where: { dogs?: boolean; zone?: boolean } = {}) {
  await page.addInitScript(([shapes, where]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    if (where.dogs) localStorage.setItem('lp-yard', JSON.stringify({ kids: false, dogs: 'hideToxic', cats: false, horses: false }));
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes, ...(where.zone ? { location: { zip: '71923', zone: '8a' } } : {}), zoom: 1, offsetX: -20, offsetY: -20 }));
  }, [shapes, where] as const);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
}
const notice = (page: Page) => page.locator('#toast-action');
const putAway = async (page: Page) => { await notice(page).getByTestId('notice-close').click(); await expect(notice(page)).toHaveCount(0); };
const badgesOf = (page: Page, role: string) => page.locator(`#canvas-svg [data-role=${role}-warning]`);

const kind = (page: Page, k: string) => page.getByTestId(`warnings-kind-${k}`);
/** A kind's line, as a screen reader hears it: "Poison, 3 to look at, 1 dismissed". */
const head = (page: Page, k: string) => page.getByTestId(`warnings-kind-head-${k}`);
const all = (page: Page, k: string) => kind(page, k).getByTestId(`warnings-all-${k}`);
const KINDS = ['poison', 'utility', 'hardy', 'sun', 'crowding', 'fruit'];

test('Warnings: each kind\'s warning dismissed from its row, as the plan dismisses it, saying who for, and a kind all at once, with an Undo (Jason, Nov 1)', async ({ page }) => {
  await openPlan(page, [
    ...pair(1, 0), ...pair(2, 10), ...pair(3, 20),
    sunny, plant('tc', 'dicentra-eximia', 'Turkey corn', 25, 0, 0.5),
    plant('al', 'aloe-vera', 'Barbados aloe', 40, 0),
    plant('mw', 'asclepias-tuberosa', 'Butterfly milkweed', 40, 15),
    plant('wr', 'ilex-verticillata-winter-red', "Winterberry 'Winter Red'", 40, 30),
    { ...base, id: 'wire', type: 'line', role: 'utility', utility: 'overhead', label: 'Power line', x: 120, y: 0, rotation: 0, points: [[0, 0], [30, 0]] },
    plant('oak', 'quercus-rubra', 'Northern red oak', 135, 8, 2),
  ], { dogs: true, zone: true });
  await expect(badgesOf(page, 'poison')).toHaveCount(4);
  await expect(page.getByTestId('warnings-btn')).toHaveAttribute('aria-label', 'Warnings: 11 to look at');
  await expect(page.getByTestId('warnings-count')).toHaveText('11');
  await openWarnings(page, ...KINDS);
  // Safety first; a kind with more than one has its Dismiss all under its rows, last in it but How this is worked out;
  // one, only its row's.
  await expect(page.getByTestId('warnings-head')).toHaveText('11 to look at');
  await expect(page.locator('[data-testid^=warnings-kind-head-]')).toHaveText([/^Poison/, /^Utilities/, /^Hardiness/, /^Sun/, /^Crowding/, /^Fruit partners/]);
  await expect(all(page, 'crowding').getByRole('button')).toHaveText(['Dismiss all 3']);
  await expect(kind(page, 'crowding').locator(':scope > *').nth(-2)).toHaveAttribute('data-testid', 'warnings-all-crowding');
  await expect(all(page, 'crowding').locator('.warnings-all-head')).toHaveText('All 3 crowding warnings');
  await expect(all(page, 'poison').getByRole('button')).toHaveText(['Dismiss all 4']);
  for (const k of ['sun', 'hardy', 'utility', 'fruit']) await expect(all(page, k)).toHaveCount(0);
  const scopeOf = (k: string) => kind(page, k).locator('[data-dismissed=true]').getByTestId('warning-scope');

  // Dismiss on a row: each as the plan does it, and said who for. A pair, as the crowding notice's Dismiss does.
  await expect(kind(page, 'crowding').getByTestId('warning-select').first()).toHaveText(/^2 Spicebush, 2 ft apartCrowded: they’ll grow into each other ›$/);
  await kind(page, 'crowding').getByTestId('warning-dismiss').first().click();
  await expect(head(page, 'crowding')).toHaveAttribute('aria-label', 'Crowding, 2 to look at, 1 dismissed');
  await expect(scopeOf('crowding')).toHaveText('Dismissed for this pair');
  await expect(kind(page, 'crowding').getByTestId('warning-row').last().getByTestId('warning-again')).toBeVisible();
  // Sun and utilities: that plant where it stands.
  await expect(kind(page, 'sun').getByTestId('warning-select')).toHaveText(/^Turkey cornGets about 8 h of sun in Sunny strip; it prefers part shade ›$/);
  await kind(page, 'sun').getByTestId('warning-dismiss').click();
  await expect(head(page, 'sun')).toHaveAttribute('aria-label', 'Sun, 1 dismissed');
  await expect(scopeOf('sun')).toHaveText('Dismissed for this one');
  await expect(badgesOf(page, 'sun')).toHaveCount(0);
  await kind(page, 'utility').getByTestId('warning-dismiss').click();
  await expect(head(page, 'utility')).toHaveAttribute('aria-label', 'Utilities, 1 dismissed');
  await expect(scopeOf('utility')).toHaveText('Dismissed for this one');
  await expect(badgesOf(page, 'utility')).toHaveCount(0);
  // Hardiness, poison and fruit partners: the plant across the plan, said as its pane or its notice says it.
  await kind(page, 'hardy').getByTestId('warning-dismiss').click();
  await expect(page.getByTestId('dismiss-notice')).toContainText('Hardiness warning dismissed for Barbados aloe in this plan, and any you add later.');
  await expect(page.getByTestId('dismiss-notice').getByRole('button')).toHaveText(['Just this one', 'OK', '✕']);
  await expect(head(page, 'hardy')).toHaveAttribute('aria-label', 'Hardiness, 1 dismissed');
  await expect(scopeOf('hardy')).toHaveText('Dismissed for every Barbados aloe in this plan');
  await expect(badgesOf(page, 'hardy')).toHaveCount(0);
  await putAway(page);
  // (Poison as its details say it, with its severity.)
  const milkweed = kind(page, 'poison').getByTestId('warning-row').filter({ hasText: 'Butterfly milkweed' });
  await expect(milkweed.getByTestId('warning-select')).toContainText(/A problem for dogs/);
  await milkweed.getByTestId('warning-dismiss').click();
  await expect(page.getByTestId('dismiss-notice')).toContainText('Poison warning dismissed for Butterfly milkweed in this plan, and any you add later.');
  await expect(head(page, 'poison')).toHaveAttribute('aria-label', 'Poison, 3 to look at, 1 dismissed');
  await expect(scopeOf('poison')).toHaveText('Dismissed for every Butterfly milkweed in this plan');
  await expect(badgesOf(page, 'poison')).toHaveCount(3);
  await putAway(page);
  await kind(page, 'fruit').getByTestId('warning-dismiss').click();
  await expect(page.getByTestId('dismiss-notice')).toContainText("Fruit partner warning dismissed for Winterberry 'Winter Red' in this plan, and any you add later.");
  await expect(head(page, 'fruit')).toHaveAttribute('aria-label', 'Fruit partners, 1 dismissed');
  await expect(scopeOf('fruit')).toHaveText("Dismissed for every Winterberry 'Winter Red' in this plan");
  await putAway(page);
  await expect(page.getByTestId('warnings-head')).toHaveText('5 to look at · 6 dismissed');
  await expect(page.getByTestId('warnings-btn')).toHaveAttribute('aria-label', 'Warnings: 5 to look at');

  // Dismiss all: one step, said, and Undo brings it all back.
  await all(page, 'poison').getByRole('button', { name: 'Dismiss all 3' }).click();
  await expect(notice(page)).toContainText('Dismissed 3 poison warnings, for those plants added later too');
  await expect(head(page, 'poison')).toHaveAttribute('aria-label', 'Poison, 4 dismissed');
  await expect(all(page, 'poison').getByRole('button')).toHaveText(['Show all 4 again']);
  await expect(badgesOf(page, 'poison')).toHaveCount(0);
  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect(head(page, 'poison')).toHaveAttribute('aria-label', 'Poison, 3 to look at, 1 dismissed');
  await expect(badgesOf(page, 'poison')).toHaveCount(3);
  // Crowding's: those pairs dismissed, the warnings still on.
  await all(page, 'crowding').getByRole('button', { name: 'Dismiss all 2' }).click();
  await expect(notice(page)).toContainText('Dismissed 2 crowding warnings, for those pairs. Plants placed from now on are still flagged.');
  await expect(head(page, 'crowding')).toHaveAttribute('aria-label', 'Crowding, 3 dismissed');
  await expect(page.getByTestId('crowd-warnings')).toBeChecked();
  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect(head(page, 'crowding')).toHaveAttribute('aria-label', 'Crowding, 2 to look at, 1 dismissed');
  // Show all again: the same, for those dismissed.
  await all(page, 'crowding').getByTestId('warnings-dismiss-all').click();
  await all(page, 'crowding').getByRole('button', { name: 'Show all 3 again' }).click();
  await expect(notice(page)).toContainText('Showing 3 crowding warnings again');
  await expect(head(page, 'crowding')).toHaveAttribute('aria-label', 'Crowding, 3 to look at');
  await expect(all(page, 'crowding').getByRole('button')).toHaveText(['Dismiss all 3']);
  // Every kind as it was left, open; the counts right.
  for (const k of KINDS) await expect(head(page, k)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('warnings-head')).toHaveText('6 to look at · 5 dismissed');
  // Kept: after a reload, the same.
  await page.reload();
  await expect.poll(() => shapeCount(page)).toBe(13);
  await expect(page.getByTestId('warnings-btn')).toHaveAttribute('aria-label', 'Warnings: 6 to look at');
  await openWarnings(page, 'crowding');
  await expect(page.getByTestId('warnings-head')).toHaveText('6 to look at · 5 dismissed');
  // A row selects its plants: beside the plan on a computer, which stays open; on a phone, with the walk's chip.
  await kind(page, 'crowding').getByTestId('warning-select').first().click();
  if (page.viewportSize()!.width >= 900) {
    await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
    await expect(page.getByTestId('warnings-side')).toBeVisible();
  } else await expect(page.getByTestId('walk-chip')).toContainText('Warnings · 4 of 6');
});

test('Warnings: a kind\'s Dismiss all or Show all again only where it does more than one row\'s own (Jason, Nov 1)', async ({ page }) => {
  await openPlan(page, [...pair(1, 0), ...pair(2, 10), sunny, plant('tc', 'dicentra-eximia', 'Turkey corn', 22, 0, 0.5), plant('tc2', 'dicentra-eximia', 'Turkey corn', 27, 0, 0.5)]);
  await openWarnings(page, 'sun', 'crowding');
  await expect(page.getByTestId('warnings-head')).toHaveText('4 to look at');
  const rows = kind(page, 'sun').getByTestId('warning-row');
  await expect(rows).toHaveCount(2);
  await expect(all(page, 'crowding').getByRole('button')).toHaveText(['Dismiss all 2']);
  await expect(all(page, 'sun').getByRole('button')).toHaveText(['Dismiss all 2']);
  // Sun, dismissed all at once: below the active ones, each said who for, its button now to show them again; Undo
  // brings them back.
  await all(page, 'sun').getByTestId('warnings-dismiss-all').click();
  await expect(notice(page)).toContainText('Dismissed 2 sun warnings');
  await expect(page.getByTestId('warnings-head')).toHaveText('2 to look at · 2 dismissed');
  await expect(rows.nth(0)).toHaveAttribute('data-dismissed', 'true');
  await expect(rows.nth(1).getByTestId('warning-scope')).toHaveText('Dismissed for this one');
  await expect(all(page, 'sun').getByRole('button')).toHaveText(['Show all 2 again']);
  await expect(badgesOf(page, 'sun')).toHaveCount(0);
  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('warnings-head')).toHaveText('4 to look at');
  await expect(badgesOf(page, 'sun')).toHaveCount(2);
  // One dismissed from its row: the kind's buttons go (one each way: the rows' own buttons do it).
  await rows.first().getByTestId('warning-dismiss').click();
  await expect(page.getByTestId('warnings-head')).toHaveText('3 to look at · 1 dismissed');
  await expect(rows.last()).toHaveAttribute('data-dismissed', 'true');
  await expect(all(page, 'sun')).toHaveCount(0);
  await expect(badgesOf(page, 'sun')).toHaveCount(1);
  // Crowding all at once, then shown all again.
  await all(page, 'crowding').getByTestId('warnings-dismiss-all').click();
  await expect(notice(page)).toContainText('Dismissed 2 crowding warnings');
  await expect(all(page, 'crowding').getByRole('button')).toHaveText(['Show all 2 again']);
  await all(page, 'crowding').getByTestId('warnings-again-all').click();
  await expect(notice(page)).toContainText('Showing 2 crowding warnings again');
  await expect(page.getByTestId('warnings-head')).toHaveText('3 to look at · 1 dismissed');
});
