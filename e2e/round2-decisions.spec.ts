import { test, expect, type Page } from '@playwright/test';
import { addKind, closeSheet, field, openFilters, openFresh, openSections, openWarnings, shapeCount, tapFromCenter, openSettings, tapping } from './helpers';

// Round 2's decisions (Jason, Oct 30, in the findings doc): each as a tester met what it changes.

async function oneRect(page: Page, dx = 0) {
  await addKind(page, 'plain', 'rect');
  for (const [x, y] of [[dx - 2, -1.5], [dx + 2, -1.5], [dx, 1.5]]) await tapFromCenter(page, x, y);
  await expect(page.getByTestId('draw-bar')).toHaveCount(0);
}
const rects = (page: Page) => page.locator('#canvas-svg rect[data-shape-id]');
async function openProps(page: Page) {
  await page.locator('.sel-pill .edit').click();
  await expect(page.locator('.sheet .lockbtn')).toBeVisible();
  await openSections(page);
}
/** Pick a plant in the picker by name, place it once at the middle of the plan, and finish. */
async function placeOne(page: Page, name: string) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
}

test('by touch, dragging a shape that isn\'t selected moves the plan, and says how to move the shape (1A: Ruth)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'a finger, not a mouse');
  await openFresh(page);
  await oneRect(page, -4);
  await oneRect(page, 4);
  await page.keyboard.press('Escape');
  const before = await Promise.all([0, 1].map(async (i) => (await rects(page).nth(i).boundingBox())!));
  await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y)!;
    const fire = (el: EventTarget, type: string, cx: number) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: cx, clientY: y, bubbles: true, isPrimary: true, pointerType: 'touch' }));
    fire(target, 'pointerdown', x);
    for (let i = 1; i <= 8; i++) fire(window, 'pointermove', x + i * 10);
    fire(window, 'pointerup', x + 80);
  }, { x: before[0].x + before[0].width / 2, y: before[0].y + before[0].height / 2 });
  // (Both moved together: the plan panned; neither shape moved on it.)
  const after = await Promise.all([0, 1].map(async (i) => (await rects(page).nth(i).boundingBox())!));
  expect(Math.round(after[0].x - before[0].x)).toBe(80);
  expect(Math.round(after[1].x - before[1].x)).toBe(80);
  await expect(page.locator('#toast')).toContainText(tapping('To move a shape, tap it first, then drag it'));
  await expect(page.locator('.sel-pill')).toHaveCount(0);
});

test('a locked shape\'s size and position boxes are shut too, and say why (4A: Alex typed a new width into one)', async ({ page }) => {
  await openFresh(page);
  await oneRect(page);
  await openProps(page);
  await expect(field(page, 'Width')).toBeEnabled();
  await page.locator('.sheet .lockbtn').click();
  await expect(field(page, 'Width')).toBeDisabled();
  await expect(page.getByTestId('locked-fields').first()).toContainText('unlock it to change this');
  // (In the Size section, first, by the boxes it shuts: Jason, Oct 30, a locked plant's spread "not editable, but nothing
  // tells you that".)
  await expect(page.getByTestId('section-size').getByTestId('locked-fields')).toBeVisible();
  await page.locator('.sheet .lockbtn').click();
  await expect(field(page, 'Width')).toBeEnabled();
});

test('sizes stop at 5,000 ft and never go to nothing or below (Sam made a bed 1e9 ft wide)', async ({ page }) => {
  await openFresh(page);
  await oneRect(page);
  await openProps(page);
  const w = field(page, 'Width');
  await w.fill('99999');
  await w.press('Tab');
  await expect(w).toHaveValue('5000');
  await w.fill('-3');
  await w.press('Tab');
  await expect(w).toHaveValue('0.1');
});

test('Clear all keeps what it took: the empty plan offers it back, after a reload too, until something new is drawn (5A: Sam)', async ({ page }) => {
  await openFresh(page);
  await oneRect(page);
  await oneRect(page, 6);
  await page.keyboard.press('Escape');
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Clear all shapes in project' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Clear all' }).click();
  await expect.poll(() => shapeCount(page)).toBe(0);
  await page.reload();
  await expect(page.getByTestId('bring-back')).toHaveText('Bring back what Clear all took (2 shapes)');
  await page.getByTestId('bring-back').click();
  await expect.poll(() => shapeCount(page)).toBe(2);
  // Cleared again, then something new drawn: nothing to bring back any more.
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Clear all shapes in project' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Clear all' }).click();
  await expect(page.getByTestId('bring-back')).toBeVisible();
  await oneRect(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect.poll(() => shapeCount(page)).toBe(0);
  await expect(page.getByTestId('bring-back')).toHaveCount(0);
});

test('Warnings, one place for every kind, a switch for each; poison follows the household (2A, and Jason\'s warning settings)', async ({ page }) => {
  await openFresh(page);
  await placeOne(page, 'Butterfly milkweed');
  await expect(page.locator('#canvas-svg [data-role=poison-warning]')).toHaveCount(0); // (no one in the yard yet)
  // Kids in the yard (the picker's "Not listed as poisonous to people"): flagged in the list and on the plan.
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('');
  await openFilters(page);
  await page.getByRole('checkbox', { name: 'Not listed as poisonous to people' }).check();
  await page.getByTestId('in-plan').click();
  await expect(page.locator('.plant-item', { hasText: 'Butterfly milkweed' }).first().getByTestId('row-poison')).toHaveText('Poisonous to people');
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=poison-warning]')).toHaveCount(1);
  // (Settings keeps one row to it; the header counts warnings, not switches: the review, Nov 1.)
  await openSettings(page);
  await expect(page.getByTestId('settings-warnings')).toHaveText('Warnings: what’s checked→');
  await openWarnings(page, 'poison', 'utility', 'hardy', 'sun', 'crowding', 'fruit');
  await expect(page.getByTestId('warnings-head')).toHaveText(/^1 to look at$/);
  for (const id of ['show-crowding', 'crowd-warnings', 'sun-warnings', 'hardy-warnings', 'poison-warnings', 'fruit-warnings']) await expect(page.getByTestId(id)).toBeChecked();
  await expect(page.getByTestId('warnings-switch-poison')).toContainText('Plants poisonous to the kids in the yard');
  await expect(page.getByTestId('warnings-yard-kids')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('poison-warnings').uncheck();
  await expect(page.getByTestId('warnings-kind-head-poison')).toHaveAttribute('aria-label', 'Poison, Off');
  await expect(page.getByTestId('warnings-head')).toHaveText(/^Nothing to look at yet · \d checks? can’t run$/);
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=poison-warning]')).toHaveCount(0);
  await page.locator('.tool-btn.plants').click();
  await expect(page.locator('.plant-item', { hasText: 'Butterfly milkweed' }).first()).toBeVisible();
  await expect(page.locator('.plant-item', { hasText: 'Butterfly milkweed' }).first().getByTestId('row-poison')).toHaveCount(0);
  // (Kept: a reload shows it off still.)
  await page.reload();
  await openWarnings(page, 'poison');
  await expect(page.getByTestId('poison-warnings')).not.toBeChecked();
});

test('the picker\'s "up to N ft" goes by the tallest a plant grows; those that typically fit come below (3A)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await openFilters(page);
  await page.getByTestId('height-max').evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = '5'; // (6 ft)
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByTestId('height-readout')).toHaveText('Up to 6 ft');
  await expect(page.getByTestId('taller-divider')).toContainText('Typically 6 ft or less, but they can grow taller');
  // Width the same way, below it (Jason, Oct 31); with both, the divider says both.
  await page.getByTestId('width-max').evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = '3'; // (3 ft)
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByTestId('width-readout')).toHaveText('Up to 3 ft');
  await expect(page.getByTestId('taller-divider')).toContainText('Typically up to 6 ft tall and 3 ft wide, but they can grow larger');
  await expect(page.getByTestId('active-filters')).toContainText('Width: up to 3 ft');
});

const TABLE = {
  v: 1, accessed: '2026-10-17',
  zips: { '71923': ['8a', 0, 3] },
  stations: [{ name: 'Arkadelphia 2 N, AR', chance: 100, spring: '03-24', springLate: '04-08', fall: '11-06', fallEarly: '10-24' }],
};

test('a plant too cold for the garden: a warning as it\'s placed, with Undo, and a ❄ badge on it (Jason: on by default)', async ({ page }) => {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Garden location' }).click();
  await page.getByTestId('zip').fill('71923');
  await page.getByTestId('zip-lookup').click();
  await expect(page.getByTestId('location-result')).toContainText('8a');
  await closeSheet(page);
  await placeOne(page, 'Barbados aloe');
  await expect(page.getByTestId('hardy-notice')).toContainText('Too cold for zone 8a');
  await expect(page.locator('#canvas-svg [data-role=hardy-warning]')).toHaveCount(1);
  await page.getByTestId('hardy-notice').getByRole('button', { name: 'Undo' }).click(); // (after Done: deleted)
  await expect.poll(() => shapeCount(page)).toBe(0);
  await placeOne(page, 'Barbados aloe');
  await page.getByTestId('hardy-notice').getByTestId('notice-close').click();
  // Turned off in Warnings: its badge goes, and the next is placed without a word.
  await openWarnings(page, 'hardy');
  await page.getByTestId('hardy-warnings').uncheck();
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=hardy-warning]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await placeOne(page, 'Barbados aloe');
  await expect.poll(() => shapeCount(page)).toBe(2);
  await expect(page.getByTestId('hardy-notice')).toHaveCount(0);
});

test('a plant\'s dot in the picker is its flowers\' color; a placed one can be drawn in another color its sources list (Jason)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Butterfly milkweed');
  const row = page.locator('.plant-item', { hasText: 'Butterfly milkweed' }).first();
  // (Orange, most of its sources' color: a flower in a circle of its leaves' color since the UI review, Nov 1.)
  await expect(row.getByTestId('row-dot').getByTestId('spot-flower')).toHaveAttribute('fill', '#f08a24');
  await expect(row.getByTestId('row-dot')).toHaveAttribute('aria-label', 'orange flowers, green leaves');
  await closeSheet(page);
  await placeOne(page, 'Butterfly milkweed');
  const look = page.locator('#canvas-svg [data-role=plant-look]');
  await expect(look.locator('[fill="#f08a24"]').first()).toBeAttached();
  await tapFromCenter(page, 0, 0);
  await openProps(page);
  const chips = page.getByTestId('flower-chip');
  await expect(chips).toHaveText(['Orange', 'Yellow', 'Red']);
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await chips.nth(2).click();
  await expect(page.getByTestId('flower-chip').nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(look.locator('[fill="#d7263d"]').first()).toBeAttached();
  await expect(look.locator('[fill="#f08a24"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#canvas-svg [data-role=plant-look] [fill="#d7263d"]').first()).toBeAttached();
});
