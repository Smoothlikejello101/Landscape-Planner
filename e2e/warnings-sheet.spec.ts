import { test, expect, type Page } from '@playwright/test';
import { closeSheet, openKind, openSettings, openWarnings, shapeCount } from './helpers';

// Warnings as a plan tool of its own (Jason approved the mock-ups, Nov 1, from the review of Settings → Warnings): a
// button among the plan's side buttons with its count; ⋮ "Warnings (12)…"; one row in Settings; a notice's Settings.
// One fold per kind, safety first, each saying what it checks, or why it can't run with a button to fix that. On a
// computer it stays open beside the plan while its rows select plants; on a phone a row zooms to its plants and leaves a
// chip on the plan, "‹ Warnings · 3 of 12 ›".

const TABLE = {
  v: 1, accessed: '2026-10-17',
  zips: { '71923': ['8a', 0, 3] },
  stations: [{ name: 'Arkadelphia 2 N, AR', chance: 100, spring: '03-24', springLate: '04-08', fall: '11-06', fallEarly: '10-24' }],
};
const base = { color: '#16a34a', opacity: 0.65, locked: false };
const plant = (id: string, plantId: string, label: string, x: number, y: number, extra: object = {}) => ({ ...base, id, type: 'circle', role: 'plant', plantId, label, x, y, radius: 1, ...extra });
const sunny = { ...base, id: 'sunny', type: 'rect', role: 'shade', label: 'Sunny strip', x: 20, y: -5, width: 10, height: 10, rotation: 0, sun: { mode: 'hours', hours: 8, periods: [[540, 780]], dappled: false } };
const wire = { ...base, id: 'wire', type: 'line', role: 'utility', utility: 'overhead', label: 'Power line', x: 120, y: 0, rotation: 0, points: [[0, 0], [30, 0]] };
/** A plan as an older version kept it, with who's in the yard and its ZIP on this device as that version kept them. */
async function openPlan(page: Page, shapes: object[], where: { dogs?: boolean; zone?: boolean } = {}) {
  await page.addInitScript(([shapes, where]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    if (where.dogs) localStorage.setItem('lp-yard', JSON.stringify({ kids: false, dogs: 'hideToxic', cats: false, horses: false }));
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes, ...(where.zone ? { location: { zip: '71923', zone: '8a' } } : {}), zoom: 1, offsetX: -20, offsetY: -20 }));
  }, [shapes, where] as const);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
  await expect(button(page)).not.toHaveAttribute('data-state', 'checking');
}
const button = (page: Page) => page.getByTestId('warnings-btn');
const kind = (page: Page, k: string) => page.getByTestId(`warnings-kind-${k}`);
const head = (page: Page, k: string) => page.getByTestId(`warnings-kind-head-${k}`);
const wide = (page: Page) => page.viewportSize()!.width >= 900;
/** Every kind of warning: a crowded pair, too much sun, too cold, poison to dogs, under a power line, no partner. */
const EVERY = [
  plant('s1', 'lindera-benzoin', 'Spicebush', 0, 0), plant('s2', 'lindera-benzoin', 'Spicebush', 2, 0),
  sunny, plant('tc', 'dicentra-eximia', 'Turkey corn', 25, 0, { radius: 0.5 }),
  plant('al', 'aloe-vera', 'Barbados aloe', 40, 0), plant('al2', 'aloe-vera', 'Barbados aloe', 44, 0),
  plant('mw', 'asclepias-tuberosa', 'Butterfly milkweed', 40, 15),
  plant('wr', 'ilex-verticillata-winter-red', "Winterberry 'Winter Red'", 40, 30),
  wire, plant('oak', 'quercus-rubra', 'Northern red oak', 135, 8, { radius: 2 }),
];

test('the button: none found with checks that can\'t run, all clear in gray, some to look at in amber with the count', async ({ page }) => {
  // One plant, nothing set up: no ZIP, nobody chosen, no sun area, no utility. Gray, a check, and how many can't run.
  await openPlan(page, [plant('as', 'symphyotrichum-novae-angliae', 'New England aster', 0, 0)]);
  await expect(button(page)).toHaveAttribute('aria-label', 'Warnings: none found, 4 checks can’t run yet');
  await expect(button(page)).toHaveAttribute('data-state', 'cant-run');
  await expect(button(page).getByTestId('warnings-count')).toHaveText('4');
  await expect(button(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)'); // (gray: not green, not amber)
  // First among the plan's side buttons, as big as the rest.
  await expect(page.locator('.zoombtns > button').first()).toHaveAttribute('data-testid', 'warnings-btn');
  expect((await button(page).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await button(page).click();
  await expect(page.getByTestId('warnings-head')).toHaveText('Nothing to look at yet · 4 checks can’t run');
  await expect(page.getByTestId('warnings')).toContainText('Each needs something from you first.');
  await expect(page.locator('[data-testid^=warnings-kind-]').filter({ has: page.locator('.warn-kind-head') })).toHaveCount(6);
  await expect(page.getByTestId('kind-sub')).toHaveText([
    'Off until you choose kids or pets', 'None drawn. Checked once you draw a line or a septic field', 'Needs your ZIP', 'No sun areas yet', 'On · none', 'On · none']);
  // Each that can't run has a button that fixes it, but Utilities (nothing to draw from here).
  await expect(page.locator('[data-testid^=warnings-fix-]')).toHaveText(['Choose', 'Set location', 'Add a sun area']);
  // Choose: Poison opens on who's in the yard; Kids, and it runs.
  await page.getByTestId('warnings-fix-poison').click();
  await expect(head(page, 'poison')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('warnings-yard')).toBeVisible();
  await page.getByTestId('warnings-yard-kids').click();
  await expect(page.getByTestId('warnings-yard-kids')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('warnings-switch-poison')).toContainText('Plants poisonous to the kids in the yard');
  await expect(head(page, 'poison')).toHaveAttribute('aria-label', 'Poison, On · none');
  await expect(page.getByTestId('warnings-head')).toHaveText('Nothing to look at yet · 3 checks can’t run');
  // (Kept with the plan, as the picker's own chips keep it.)
  await closeSheet(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('filters').click();
  await expect(page.getByRole('checkbox', { name: 'Not listed as poisonous to people' })).toBeChecked();
  await closeSheet(page);
  await expect(button(page)).toHaveAttribute('aria-label', 'Warnings: none found, 3 checks can’t run yet');
});

test('all clear: every check ran and found none, the button gray with a check and no count', async ({ page }) => {
  await openPlan(page, [sunny, wire, plant('as', 'symphyotrichum-novae-angliae', 'New England aster', 0, 0)], { dogs: true, zone: true });
  await expect(button(page)).toHaveAttribute('aria-label', 'Warnings: all clear');
  await expect(button(page)).toHaveAttribute('data-state', 'clear');
  await expect(button(page).getByTestId('warnings-count')).toHaveCount(0);
  await button(page).click();
  await expect(page.getByTestId('warnings-head')).toHaveText('All clear');
  await expect(page.locator('[data-testid^=warnings-fix-]')).toHaveCount(0);
});

test('the ways in: the button, ⋮ "Warnings (12)…", Settings\' one row, a notice\'s Settings at its kind', async ({ page }) => {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  await openPlan(page, EVERY, { dogs: true, zone: true });
  await expect(button(page)).toHaveAttribute('aria-label', 'Warnings: 10 to look at');
  await expect(button(page).getByTestId('warnings-count')).toHaveText('10');
  // ⋮
  await page.locator('button[title=More]').click();
  await expect(page.getByTestId('menu-warnings')).toHaveText('Warnings (10)…');
  await page.getByTestId('menu-warnings').click();
  await expect(page.getByTestId('warnings-head')).toHaveText('10 to look at');
  await closeSheet(page);
  // Settings: one row, no switches of its own.
  await openSettings(page);
  await expect(page.getByTestId('settings').locator('input[type=checkbox][data-testid$=-warnings]')).toHaveCount(0);
  await page.getByTestId('settings-warnings').click();
  await expect(page.getByTestId('settings')).toHaveCount(0);
  await expect(page.getByTestId('warnings-head')).toHaveText('10 to look at');
  await closeSheet(page);
  // A hardiness notice's Settings: Warnings at Hardiness, opened. (The notice has no "Leave it": its ✕.)
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Barbados aloe');
  await page.locator('.sheet .proj-row', { hasText: 'Barbados aloe' }).first().locator('[data-testid=plant-place]').click();
  await page.locator('#canvas-svg').click({ position: { x: 60, y: 300 } });
  const notice = page.getByTestId('hardy-notice');
  await expect(notice.getByRole('button')).toHaveText(['Undo', 'Settings', '✕']);
  await notice.getByRole('button', { name: 'Settings' }).click();
  await expect(head(page, 'hardy')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('hardy-warnings')).toBeInViewport();
  // The ZIP's Change: the garden's location, and back.
  await expect(page.getByTestId('warnings-switch-hardy')).toContainText('Plants too cold or too warm for zone 8a');
  await expect(page.getByTestId('warnings-switch-hardy')).toContainText('ZIP 71923 ·');
  await page.getByTestId('warnings-zip').click();
  await expect(page.getByTestId('zip')).toBeVisible();
  if (!wide(page)) {
    await page.getByRole('button', { name: 'Back to Warnings' }).click();
    await expect(page.getByTestId('warnings-head')).toBeVisible();
  }
});

test('a check that can\'t run says why, with its fix: the ZIP, a sun area', async ({ page }) => {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  await openPlan(page, [plant('al', 'aloe-vera', 'Barbados aloe', 0, 0)]);
  await openWarnings(page);
  await expect(head(page, 'hardy')).toHaveAttribute('aria-label', 'Hardiness, Needs your ZIP');
  await page.getByTestId('warnings-fix-hardy').click();
  await page.getByTestId('zip').fill('71923');
  await page.getByTestId('zip-lookup').click();
  await expect(page.getByTestId('location-result')).toContainText('8a');
  // Back to Warnings on a phone (the ZIP's sheet came from it: ←); beside the plan on a computer, still open.
  if (wide(page)) await closeSheet(page);
  else await page.getByRole('button', { name: 'Back to Warnings' }).click();
  await expect(page.getByTestId('warnings-head')).toHaveText(/^1 to look at/);
  await expect(head(page, 'hardy')).toHaveAttribute('aria-label', 'Hardiness, 1 to look at');
  // Add a sun area: Warnings makes way on a phone, and a sun exposure area is drawn.
  await page.getByTestId('warnings-fix-sun').click();
  await expect(page.getByTestId('draw-banner')).toContainText('Sun exposure');
});

test('the false all-clear: with Layers showing only some plants, Warnings says only those are checked, and shows them all', async ({ page }) => {
  await openPlan(page, [plant('al', 'aloe-vera', 'Barbados aloe', 0, 0, { status: 'planned' }), plant('as', 'symphyotrichum-novae-angliae', 'New England aster', 20, 0, { status: 'planted' })], { zone: true });
  await expect(button(page)).toHaveAttribute('aria-label', /^Warnings: 1 to look at$/);
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('filter-status').selectOption('planted');
  await closeSheet(page);
  // Not "all clear": none found in the plants shown.
  await expect(button(page)).toHaveAttribute('aria-label', /^Warnings: none found in the plants shown/);
  await button(page).click();
  await expect(page.getByTestId('warnings-head')).toHaveText(/^Nothing to look at (yet )?in the plants shown/);
  await expect(page.getByTestId('warnings-hidden')).toContainText('Only the plants shown are checked (Layers: Planted).');
  await page.getByTestId('warnings-show-all').click();
  await expect(page.getByTestId('warnings-hidden')).toHaveCount(0);
  await expect(page.getByTestId('warnings-head')).toHaveText(/^1 to look at/);
  await expect(page.getByTestId('filter-banner')).toHaveCount(0);
});

test('Dismiss and Show again on a row, Dismiss all and Show all again under a kind\'s rows, its rule under How this is worked out', async ({ page }) => {
  await openPlan(page, EVERY, { dogs: true, zone: true });
  await openWarnings(page, 'poison', 'utility');
  // Poison as its details say it; the dismissed one says who for.
  const rows = kind(page, 'poison').getByTestId('warning-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: 'Barbados aloe ×2' }).getByTestId('warning-select')).toHaveAttribute('aria-label', /^Barbados aloe ×2: .*\. Show on the plan$/);
  await expect(page.getByTestId('warnings-switch-poison')).toContainText('Plants poisonous to the dogs in the yard');
  await rows.first().getByTestId('warning-dismiss').click();
  await page.locator('#toast-action').getByTestId('notice-close').click();
  await expect(head(page, 'poison')).toHaveAttribute('aria-label', 'Poison, 3 to look at, 1 dismissed');
  await expect(rows.last().getByTestId('warning-scope')).toHaveText(/^Dismissed for every .* in this plan$/);
  await expect(kind(page, 'poison').getByTestId('warnings-all-poison').getByRole('button')).toHaveText(['Dismiss all 3']);
  await kind(page, 'poison').getByTestId('warnings-dismiss-all').click();
  await expect(kind(page, 'poison').getByTestId('warnings-all-poison').getByRole('button')).toHaveText(['Show all 4 again']);
  await kind(page, 'poison').getByTestId('warnings-again-all').click();
  await expect(head(page, 'poison')).toHaveAttribute('aria-label', 'Poison, 4 to look at');
  await rows.first().getByTestId('warning-dismiss').click();
  await page.locator('#toast-action').getByTestId('notice-close').click();
  await rows.last().getByTestId('warning-again').click();
  await expect(head(page, 'poison')).toHaveAttribute('aria-label', 'Poison, 4 to look at');
  // Utilities: counted, with its rule (no switch: always checked); heights in whole feet.
  await expect(page.getByTestId('warnings-switch-utility')).toContainText('1 drawn on this plan · always checked');
  await expect(kind(page, 'utility').getByTestId('warning-select')).toHaveText(/^Northern red oakGrows to \d+ ft, [\d.]+ ft from a power line ›$/);
  await page.getByTestId('warnings-how-utility').click();
  await expect(page.getByTestId('warnings-rule-utility')).toContainText('UF/IFAS Extension');
  await expect(page.getByTestId('warnings-rule-utility')).toContainText('UGA Extension');
});

test('on a phone, a row zooms to its plants and leaves a chip: ‹ Warnings · 6 of 10 ›, with Dismiss, and back to the list', async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 900, 'a phone');
  await openPlan(page, EVERY, { dogs: true, zone: true });
  await openWarnings(page, 'hardy');
  // Hardiness is the 6th: 4 poison, 1 utility before it.
  await kind(page, 'hardy').getByTestId('warning-select').click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  const chip = page.getByTestId('walk-chip');
  await expect(chip.getByTestId('walk-list')).toContainText('Warnings · 6 of 10');
  await expect(chip.getByTestId('walk-list')).toContainText('Barbados aloe ×2: too cold for zone 8a');
  await expect(page.locator('.sel-pill, .multi-bar')).toHaveCount(0); // (the chip in their place)
  // Both aloes on screen, above the chip, filling a good part of it (zoomed to them, not just centered).
  const plan = (await page.locator('#canvas-svg').boundingBox())!;
  const boxes = await Promise.all(['al', 'al2'].map(async (id) => (await page.locator(`#canvas-svg [data-shape-id=${id}]`).first().boundingBox())!));
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(plan.x); expect(b.x + b.width).toBeLessThanOrEqual(plan.x + plan.width);
    expect(b.y).toBeGreaterThanOrEqual(plan.y); expect(b.y + b.height).toBeLessThanOrEqual(plan.y + plan.height - 80);
  }
  expect(boxes[1].x + boxes[1].width - boxes[0].x).toBeGreaterThan(plan.width * 0.3);
  // › and ‹ step through them; ‹ from the first goes round to the last.
  await chip.getByTestId('walk-next').click();
  await expect(chip.getByTestId('walk-list')).toContainText('Warnings · 7 of 10');
  await expect(chip.getByTestId('walk-list')).toContainText('Turkey corn');
  await chip.getByTestId('walk-prev').click();
  await chip.getByTestId('walk-prev').click();
  await expect(chip.getByTestId('walk-list')).toContainText('Warnings · 5 of 10');
  await expect(chip.getByTestId('walk-list')).toContainText('Northern red oak');
  // Dismiss: the next takes its place, one fewer to look at.
  await chip.getByTestId('walk-dismiss').click();
  await expect(chip.getByTestId('walk-list')).toContainText('Warnings · 5 of 9');
  await expect(chip.getByTestId('walk-list')).toContainText('Barbados aloe ×2');
  await expect(button(page)).toHaveAttribute('aria-label', 'Warnings: 9 to look at');
  // Back to the list: where it was, that row in view.
  await chip.getByTestId('walk-list').click();
  await expect(page.getByTestId('warnings-head')).toHaveText('9 to look at · 1 dismissed');
  await expect(kind(page, 'hardy').getByTestId('warning-row')).toBeInViewport();
  // Closed and opened again: the kinds as they were left.
  await closeSheet(page);
  await expect(chip).toHaveCount(1);
  await button(page).click();
  await expect(head(page, 'hardy')).toHaveAttribute('aria-expanded', 'true');
  // A tap elsewhere on the plan ends the walk.
  await closeSheet(page);
  await page.keyboard.press('Escape');
  await expect(chip).toHaveCount(0);
});

test('on a computer, Warnings stays open beside the plan while its rows select plants', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 900, 'a computer');
  await openPlan(page, EVERY, { dogs: true, zone: true });
  const planW = (await page.locator('#canvas-svg').boundingBox())!.width;
  await button(page).click();
  const side = page.getByTestId('warnings-side');
  await expect(side).toBeVisible();
  await expect(page.locator('.overlay')).toHaveCount(0); // (no dimming: the plan is there to work on)
  await expect(button(page)).toHaveAttribute('aria-pressed', 'true');
  expect((await page.locator('#canvas-svg').boundingBox())!.width).toBeLessThan(planW - 300);
  await openKind(page, 'crowding');
  await kind(page, 'crowding').getByTestId('warning-select').click();
  await expect(side).toBeVisible();
  await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
  await expect(kind(page, 'crowding').getByTestId('warning-row')).toHaveClass(/current/);
  await expect(page.getByTestId('walk-chip')).toHaveCount(0);
  // Another: the panel still there, the selection that row's.
  await openKind(page, 'hardy');
  await kind(page, 'hardy').getByTestId('warning-select').click();
  await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
  await expect(kind(page, 'hardy').getByTestId('warning-row')).toHaveClass(/current/);
  await expect(kind(page, 'crowding').getByTestId('warning-row')).not.toHaveClass(/current/);
  // Edit opens over it; closed, it's still beside the plan.
  await page.locator('.multi-bar button[title=Edit]').click();
  await closeSheet(page);
  await expect(side).toBeVisible();
  // Esc from inside it closes it, and the plan has its room back.
  await head(page, 'hardy').focus();
  await page.keyboard.press('Escape');
  await expect(side).toHaveCount(0);
  await expect.poll(async () => (await page.locator('#canvas-svg').boundingBox())!.width).toBeGreaterThan(planW - 2);
  await expect(button(page)).not.toHaveAttribute('aria-pressed', 'true');
});
