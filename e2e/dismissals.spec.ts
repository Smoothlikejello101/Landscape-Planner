import { test, expect, type Page } from '@playwright/test';
import { closeSheet, openFresh, openSections, openWarnings, shapeCount, tapFromCenter, openSettings } from './helpers';

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
  await page.getByTestId('hardy-notice').getByRole('button', { name: 'Leave it' }).click();
  // One copy's pane: Dismiss, said for both and the ones to come.
  await tapFromCenter(page, -4, 0);
  await page.locator('.sel-pill .edit').click();
  await openSections(page);
  await page.getByTestId('hardy-dismiss').click();
  await expect(page.getByTestId('dismiss-notice')).toContainText('Hardiness warning dismissed for all 2 of Barbados aloe in this plan, and any you add later.');
  await expect(page.getByTestId('hardy-check')).toContainText('dismissed for every one in this plan');
  await closeSheet(page);
  await page.keyboard.press('Escape');
  await expect(badges(page)).toHaveCount(0);
  // A third: no notice, no badge.
  await place(page, 'Barbados aloe', [[0, 5]]);
  await expect(page.getByTestId('hardy-notice')).toHaveCount(0);
  await expect(badges(page)).toHaveCount(0);
  // Settings → Warnings lists it, dismissed, to show again: every copy's badge is back.
  await openSettings(page);
  await openWarnings(page);
  await expect(page.getByTestId('warnings-now').locator('summary')).toHaveText('In this plan now \u00b7 1 dismissed');
  await page.getByTestId('warnings-now').locator('summary').click();
  const row = page.getByTestId('warning-row');
  await expect(row).toHaveAttribute('data-dismissed', 'true');
  await expect(row).toContainText(/^Barbados aloe \u00d73: Too cold for zone/);
  await row.getByRole('button', { name: 'Show again' }).click();
  await expect(row).toHaveAttribute('data-dismissed', 'false');
  await expect(row.getByRole('button', { name: 'Show again' })).toHaveCount(0);
  await closeSheet(page);
  await expect(badges(page)).toHaveCount(3);
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
async function openList(page: Page) {
  await openSettings(page);
  await openWarnings(page);
  const now = page.getByTestId('warnings-now');
  if ((await now.getAttribute('open')) === null) await now.locator(':scope > summary').click();
  return now;
}
const notice = (page: Page) => page.locator('#toast-action');
const putAway = async (page: Page) => { await notice(page).getByTestId('notice-close').click(); await expect(notice(page)).toHaveCount(0); };
const badgesOf = (page: Page, role: string) => page.locator(`#canvas-svg [data-role=${role}-warning]`);

test('Settings → Warnings: each kind\'s warning dismissed from its row, as the plan dismisses it, saying who for, and a kind all at once, with an Undo (Jason, Nov 1)', async ({ page }) => {
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
  const now = await openList(page);
  // More than a handful: by kind. A kind with more than one has its Dismiss all under its rows; one, only its row's.
  await expect(now.locator(':scope > summary')).toHaveText('In this plan now · 11 active');
  const kind = (k: string) => page.getByTestId(`warnings-kind-${k}`);
  const head = (k: string) => kind(k).locator(':scope > summary');
  const all = (k: string) => kind(k).getByTestId(`warnings-all-${k}`);
  for (const k of ['crowding', 'sun', 'hardy', 'poison', 'utility', 'fruit']) await head(k).click();
  await expect(all('crowding').getByRole('button')).toHaveText(['Dismiss all 3']);
  await expect(kind('crowding').locator(':scope > *').last()).toHaveAttribute('data-testid', 'warnings-all-crowding');
  await expect(all('poison').getByRole('button')).toHaveText(['Dismiss all 4']);
  for (const k of ['sun', 'hardy', 'utility', 'fruit']) await expect(all(k)).toHaveCount(0);
  const scopeOf = (k: string) => kind(k).locator('[data-dismissed=true]').getByTestId('warning-scope');

  // Dismiss on a row: each as the plan does it, and said who for. A pair, left close on purpose, as Leave it does.
  await kind('crowding').getByTestId('warning-dismiss').first().click();
  await expect(head('crowding')).toHaveText('Crowding · 2 active, 1 dismissed');
  await expect(scopeOf('crowding')).toHaveText('Dismissed for this pair, left close on purpose');
  await expect(kind('crowding').getByTestId('warning-row').last().getByTestId('warning-again')).toBeVisible();
  // Sun and utilities: that plant where it stands.
  await kind('sun').getByTestId('warning-dismiss').click();
  await expect(head('sun')).toHaveText('Sun · 1 dismissed');
  await expect(scopeOf('sun')).toHaveText('Dismissed for this one');
  await expect(badgesOf(page, 'sun')).toHaveCount(0);
  await kind('utility').getByTestId('warning-dismiss').click();
  await expect(head('utility')).toHaveText('Utilities · 1 dismissed');
  await expect(scopeOf('utility')).toHaveText('Dismissed for this one');
  await expect(badgesOf(page, 'utility')).toHaveCount(0);
  // Hardiness, poison and fruit partners: the plant across the plan, said as its pane or its notice says it.
  await kind('hardy').getByTestId('warning-dismiss').click();
  await expect(page.getByTestId('dismiss-notice')).toContainText('Hardiness warning dismissed for Barbados aloe in this plan, and any you add later.');
  await expect(head('hardy')).toHaveText('Hardiness · 1 dismissed');
  await expect(scopeOf('hardy')).toHaveText('Dismissed for every Barbados aloe in this plan');
  await expect(badgesOf(page, 'hardy')).toHaveCount(0);
  await putAway(page);
  await kind('poison').getByTestId('warning-row').filter({ hasText: 'Butterfly milkweed' }).getByTestId('warning-dismiss').click();
  await expect(page.getByTestId('dismiss-notice')).toContainText('Poison warning dismissed for Butterfly milkweed in this plan, and any you add later.');
  await expect(head('poison')).toHaveText('Poison · 3 active, 1 dismissed');
  await expect(scopeOf('poison')).toHaveText('Dismissed for every Butterfly milkweed in this plan');
  await expect(badgesOf(page, 'poison')).toHaveCount(3);
  await putAway(page);
  await kind('fruit').getByTestId('warning-dismiss').click();
  await expect(page.getByTestId('dismiss-notice')).toContainText("Fruit partner reminders off for Winterberry 'Winter Red' in this plan, and any you add later.");
  await expect(head('fruit')).toHaveText('Fruit partners · 1 dismissed');
  await expect(scopeOf('fruit')).toHaveText("Dismissed for every Winterberry 'Winter Red' in this plan");
  await putAway(page);
  await expect(now.locator(':scope > summary')).toHaveText('In this plan now · 5 active, 6 dismissed');

  // Dismiss all: one step, said, and Undo brings it all back.
  await all('poison').getByRole('button', { name: 'Dismiss all 3' }).click();
  await expect(notice(page)).toContainText('Dismissed 3 poison warnings, for those plants added later too');
  await expect(head('poison')).toHaveText('Poison · 4 dismissed');
  await expect(all('poison').getByRole('button')).toHaveText(['Show all 4 again']);
  await expect(badgesOf(page, 'poison')).toHaveCount(0);
  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect(head('poison')).toHaveText('Poison · 3 active, 1 dismissed');
  await expect(badgesOf(page, 'poison')).toHaveCount(3);
  // Crowding's is what Leave all flagged now was: those pairs left close on purpose, the warnings still on.
  await all('crowding').getByRole('button', { name: 'Dismiss all 2' }).click();
  await expect(notice(page)).toContainText('Dismissed 2 crowding warnings, the pairs left close on purpose. Plants placed from now on are still flagged.');
  await expect(head('crowding')).toHaveText('Crowding · 3 dismissed');
  await expect(page.getByTestId('crowd-warnings')).toBeChecked();
  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect(head('crowding')).toHaveText('Crowding · 2 active, 1 dismissed');
  // Show all again: the same, for those dismissed.
  await all('crowding').getByTestId('warnings-dismiss-all').click();
  await all('crowding').getByRole('button', { name: 'Show all 3 again' }).click();
  await expect(notice(page)).toContainText('Showing 3 crowding warnings again');
  await expect(head('crowding')).toHaveText('Crowding · 3 active');
  await expect(all('crowding').getByRole('button')).toHaveText(['Dismiss all 3']);
  // Every fold as it was left, open; the counts right.
  for (const k of ['crowding', 'sun', 'hardy', 'poison', 'utility', 'fruit']) await expect(kind(k)).toHaveAttribute('open', '');
  await expect(now.locator(':scope > summary')).toHaveText('In this plan now · 6 active, 5 dismissed');
  // Kept: after a reload, the same.
  await page.reload();
  await expect.poll(() => shapeCount(page)).toBe(13);
  await openList(page);
  await expect(page.getByTestId('warnings-now').locator(':scope > summary')).toHaveText('In this plan now · 6 active, 5 dismissed');
  // A row's words still select its plants.
  await head('crowding').click();
  await kind('crowding').getByTestId('warning-select').first().click();
  await expect(page.getByTestId('settings')).toHaveCount(0);
  await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
});

test('Settings → Warnings, a handful: one list, and under it a kind\'s Dismiss all or Show all again where it does more than one row\'s own (Jason, Nov 1)', async ({ page }) => {
  await openPlan(page, [...pair(1, 0), ...pair(2, 10), sunny, plant('tc', 'dicentra-eximia', 'Turkey corn', 22, 0, 0.5), plant('tc2', 'dicentra-eximia', 'Turkey corn', 27, 0, 0.5)]);
  const now = await openList(page);
  await expect(now.locator(':scope > summary')).toHaveText('In this plan now · 4 active');
  await expect(page.locator('[data-testid^=warnings-kind-]')).toHaveCount(0); // (not folded by kind)
  const rows = now.getByTestId('warning-row');
  await expect(rows).toHaveCount(4);
  const all = (k: string) => now.getByTestId(`warnings-all-${k}`);
  await expect(all('crowding')).toHaveText(/^Crowding:\s*Dismiss all 2$/);
  await expect(all('sun')).toHaveText(/^Sun:\s*Dismiss all 2$/);
  // Sun, dismissed all at once: below the active ones, each said who for, its line now to show them again; Undo brings
  // them back.
  await all('sun').getByTestId('warnings-dismiss-all').click();
  await expect(notice(page)).toContainText('Dismissed 2 sun warnings');
  await expect(now.locator(':scope > summary')).toHaveText('In this plan now · 2 active, 2 dismissed');
  await expect(rows.nth(2)).toHaveAttribute('data-dismissed', 'true');
  await expect(rows.nth(3)).toHaveAttribute('data-dismissed', 'true');
  await expect(rows.nth(3).getByTestId('warning-scope')).toHaveText('Dismissed for this one');
  await expect(all('sun').getByRole('button')).toHaveText(['Show all 2 again']);
  await expect(badgesOf(page, 'sun')).toHaveCount(0);
  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect(now.locator(':scope > summary')).toHaveText('In this plan now · 4 active');
  await expect(badgesOf(page, 'sun')).toHaveCount(2);
  // One dismissed from its row: the kind's line goes (one each way: the rows' own buttons do it).
  await rows.filter({ hasText: 'Turkey corn' }).first().getByTestId('warning-dismiss').click();
  await expect(now.locator(':scope > summary')).toHaveText('In this plan now · 3 active, 1 dismissed');
  await expect(rows.last()).toHaveAttribute('data-dismissed', 'true');
  await expect(all('sun')).toHaveCount(0);
  await expect(badgesOf(page, 'sun')).toHaveCount(1);
  // Crowding all at once, then shown all again.
  await all('crowding').getByTestId('warnings-dismiss-all').click();
  await expect(notice(page)).toContainText('Dismissed 2 crowding warnings');
  await expect(all('crowding').getByRole('button')).toHaveText(['Show all 2 again']);
  await all('crowding').getByTestId('warnings-again-all').click();
  await expect(notice(page)).toContainText('Showing 2 crowding warnings again');
  await expect(now.locator(':scope > summary')).toHaveText('In this plan now · 3 active, 1 dismissed');
  await expect(now).toHaveAttribute('open', '');
  // A row's words still select its plants.
  await rows.first().getByTestId('warning-select').click();
  await expect(page.getByTestId('settings')).toHaveCount(0);
  await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
});
