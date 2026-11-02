import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { autoDialogs, canvasBox, closeSheet, openFresh, shapeCount, tapFromCenter, zoomPct } from './helpers';

// Welcome back (Jason, Nov 2, from the UI review, marked Next: "The whole plan and a small card after a gap or an
// update; on the second visit, 'Saved on this phone; back it up'"). src/welcome.ts has the rules and their order.

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Oct 28", as the card says a day this year (the year too, if not). */
function day(t: number): string {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}` + (d.getFullYear() === new Date().getFullYear() ? '' : `, ${d.getFullYear()}`);
}

const welcome = (page: Page) => page.getByTestId('welcome-back');
const savedHere = (page: Page) => page.getByTestId('saved-here');
const opened = (page: Page) => expect(page.locator('.project-btn .pname')).toBeVisible();

/** The screenshots for the review, on the phone, when asked for (WELCOME_SHOTS: the folder). */
async function shot(page: Page, name: string, isMobile: boolean) {
  const dir = process.env.WELCOME_SHOTS;
  if (dir && isMobile) await page.screenshot({ path: `${dir}/${name}.png` });
}

const bed = (id: string, label: string, x: number, y: number) => ({ id, type: 'rect', x, y, width: 6, height: 4, rotation: 0, color: '#92400e', label, opacity: 0.65, locked: false, role: 'bed' });
/** A plan with two beds 60 ft apart, last changed `changed` (ms), opened from a file; then zoomed in between them. */
async function twoBeds(page: Page, changed: number) {
  const file = { format: 'landscape-planner-project', version: 1, project: { name: 'Back yard', lastModified: changed, data: { shapes: [bed('a', 'Front bed', 0, 0), bed('b', 'Far bed', 60, 30)] } } };
  await page.locator('.project-btn').click();
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'b.fullgrown.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('.project-btn .pname')).toHaveText('Back yard');
  await page.getByTestId('zoom-fit').click();
  const fitted = await zoomPct(page);
  for (let i = 0; i < 4; i++) await page.locator('.zoombtn[aria-label="Zoom in"]').click();
  expect(await zoomPct(page)).toBeGreaterThan(fitted * 2);
  await expect.poll(() => inView(page, 'a')).toBe(false);
  // (Written before the page goes: a new view alone isn't kept in a journal, src/storage.ts writeJournalIfDirty.)
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
}
/** Whether the shape is wholly on the plan, and below `top` (page px) if given. */
async function inView(page: Page, id: string, top = 0, bottom = Infinity): Promise<boolean> {
  const plan = await canvasBox(page);
  const s = await page.locator(`#canvas-svg [data-shape-id="${id}"]`).first().boundingBox();
  if (!s) return false;
  return s.x >= plan.x && s.x + s.width <= plan.x + plan.width && s.y >= Math.max(plan.y, top) && s.y + s.height <= Math.min(plan.y + plan.height, bottom);
}
/**
 * Away `days` days at the next start (when the app was last on screen, set as the page starts: leaving counts too): of
 * this window, or, given the context, of the next window opened.
 */
async function awayFor(page: Page | BrowserContext, days: number) {
  await page.addInitScript(([t, key]) => {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    localStorage.setItem('lp-last-visit', String(t));
  }, [Date.now() - days * DAY, `away-${Math.random()}`] as const);
}
/** The second visit's card had, so a test of the welcome-back card isn't its second visit (a reload past midnight). */
const pastSecondVisit = (page: Page) => page.evaluate(() => localStorage.setItem('lp-saved-here', 'shown'));
/** The app closed and opened again on this device: a new window, the old one gone. */
async function reopen(context: BrowserContext, page: Page): Promise<Page> {
  await page.close();
  const again = await context.newPage();
  await again.goto('./');
  await opened(again);
  return again;
}

test('back after a gap: the whole plan, under a small card saying when it last changed, with a quiet Back up; gone at the first action', async ({ page, isMobile }) => {
  await openFresh(page);
  const changed = Date.now() - 5 * DAY;
  await twoBeds(page, changed);
  await pastSecondVisit(page);
  // Two days away: the same stretch of work, opened where it was left.
  await awayFor(page, 2);
  const zoomed = await zoomPct(page);
  await page.reload();
  await opened(page);
  await expect(welcome(page)).toHaveCount(0);
  expect(await zoomPct(page)).toBe(zoomed);
  // Four days away: the whole plan, under the card.
  await awayFor(page, 4);
  await page.reload();
  await opened(page);
  const card = welcome(page);
  await expect(card).toBeVisible();
  await expect(card).toContainText('Welcome back.');
  await expect(card.locator('.notice-sub')).toHaveText(`Last changed ${day(changed)}.`);
  await expect(card.getByRole('button', { name: 'Back up' })).toHaveClass(/notice-quiet/); // (never backed up)
  await expect(card.getByRole('button', { name: 'See what’s new' })).toHaveCount(0);
  await expect(page.getByTestId('whats-new-notice')).toHaveCount(0);
  const under = (await card.boundingBox())!;
  for (const id of ['a', 'b']) await expect.poll(() => inView(page, id, under.y + under.height)).toBe(true);
  await shot(page, 'welcome-back-gap', isMobile);
  // Still there after a moment: it waits for the person, not a timer.
  await page.waitForTimeout(1500);
  await expect(card).toBeVisible();
  // The first thing done anywhere else (a press on the plan): gone, and nothing else changed by it.
  const plan = await canvasBox(page);
  await page.mouse.click(plan.x + 20, plan.y + plan.height - 20);
  await expect(card).toHaveCount(0);
  // Opened again soon after: no card, the whole plan as it was left.
  const whole = await zoomPct(page);
  await page.reload();
  await opened(page);
  await expect(welcome(page)).toHaveCount(0);
  expect(await zoomPct(page)).toBe(whole);
});

test('the card’s ✕ puts it away; a key or the wheel does too, Tab only moves to its buttons', async ({ page, isMobile }) => {
  await openFresh(page);
  await twoBeds(page, Date.now() - DAY);
  await pastSecondVisit(page);
  await awayFor(page, 3);
  await page.reload();
  await opened(page);
  const zoom = await zoomPct(page);
  await welcome(page).getByTestId('notice-close').click();
  await expect(welcome(page)).toHaveCount(0);
  expect(await zoomPct(page)).toBe(zoom); // (the plan left as it was)
  if (isMobile) return; // (keys and the wheel: a computer's)
  await awayFor(page, 3);
  await page.reload();
  await opened(page);
  await expect(welcome(page).locator('.notice-sub')).toHaveText('Last changed yesterday.');
  await page.keyboard.press('Tab');
  await expect(welcome(page)).toBeVisible();
  await page.keyboard.press('Shift+1'); // (the whole plan, its key)
  await expect(welcome(page)).toHaveCount(0);
  await awayFor(page, 3);
  await page.reload();
  await opened(page);
  const plan = await canvasBox(page);
  await page.mouse.move(plan.x + plan.width / 2, plan.y + plan.height / 2);
  await page.mouse.wheel(0, 100);
  await expect(welcome(page)).toHaveCount(0);
});

test('after an update: the card says so, with What’s new on it in place of its own notice; said once', async ({ page, isMobile }) => {
  await openFresh(page);
  await twoBeds(page, Date.now() - 2 * DAY);
  await pastSecondVisit(page);
  // (A device last on an older version, that had seen none of What's new.)
  await page.evaluate(() => { localStorage.setItem('lp-app-version', '0.0.1'); localStorage.setItem('lp-whats-new', '0'); });
  await page.reload();
  await opened(page);
  const card = welcome(page);
  await expect(card).toContainText(/^FullGrown was updated: \d+ new things\./);
  await expect(card.locator('.notice-sub')).toHaveText(`Last changed ${day(Date.now() - 2 * DAY)}.`);
  await expect(page.getByTestId('whats-new-notice')).toHaveCount(0); // (never two things at once)
  // The whole plan, though it was seen yesterday.
  const under = (await card.boundingBox())!;
  for (const id of ['a', 'b']) await expect.poll(() => inView(page, id, under.y + under.height)).toBe(true);
  await shot(page, 'welcome-back-update', isMobile);
  await card.getByRole('button', { name: 'See what’s new' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('release-1').getByTestId('whats-new-fresh')).toHaveText('New');
  await closeSheet(page);
  await page.reload();
  await opened(page);
  await expect(welcome(page)).toHaveCount(0);
  await expect(page.getByTestId('whats-new-notice')).toHaveCount(0);
});

test('Back up on the card saves a backup file, and the next card doesn’t offer it', async ({ page }) => {
  await openFresh(page);
  await twoBeds(page, Date.now() - DAY);
  await pastSecondVisit(page);
  await awayFor(page, 3);
  await page.reload();
  await opened(page);
  const [download] = await Promise.all([page.waitForEvent('download'), welcome(page).getByRole('button', { name: 'Back up' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^fullgrown-backup-\d{4}-\d{2}-\d{2}\.fullgrown\.json$/);
  const file = JSON.parse(readFileSync((await download.path())!, 'utf8')) as { projects: { name: string }[] };
  expect(file.projects.map((p) => p.name)).toContain('Back yard');
  await expect(welcome(page)).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText(/Backed up 2 projects/);
  await awayFor(page, 3);
  await page.reload();
  await opened(page);
  await expect(welcome(page)).toContainText('Welcome back.');
  await expect(welcome(page).getByRole('button')).toHaveText(['✕']); // (backed up just now: only its ✕)
});

test('the second visit: "Saved on this phone. It opens right here next time." once; OK, and never again', async ({ page, context, isMobile }) => {
  await openFresh(page);
  await twoBeds(page, Date.now());
  // Reloaded: the same visit.
  await page.reload();
  await opened(page);
  await expect(savedHere(page)).toHaveCount(0);
  // Closed and opened again: the second visit.
  const again = await reopen(context, page);
  const card = savedHere(again);
  await expect(card).toContainText(`Saved on ${isMobile ? 'this phone' : 'this computer'}. It opens right here next time.`);
  await expect(card.locator('.notice-buttons button')).toHaveText(['Back up to a file', 'OK']);
  await expect(welcome(again)).toHaveCount(0);
  // Where it was left, not refitted: it isn't a gap.
  await expect.poll(() => inView(again, 'a')).toBe(false);
  await shot(again, 'saved-here', isMobile);
  await card.getByRole('button', { name: 'OK' }).click();
  await expect(card).toHaveCount(0);
  const third = await reopen(context, again);
  await expect(savedHere(third)).toHaveCount(0);
  // Not even after a gap, which has its own card.
  await awayFor(context, 5);
  const fourth = await reopen(context, third);
  await expect(welcome(fourth)).toContainText('Welcome back.');
  await expect(savedHere(fourth)).toHaveCount(0);
});

test('the second visit’s Back up to a file saves a backup, and it isn’t shown again; backed up already, it never is', async ({ page, context, browser }) => {
  await openFresh(page);
  await twoBeds(page, Date.now());
  const again = await reopen(context, page);
  const [download] = await Promise.all([again.waitForEvent('download'), savedHere(again).getByRole('button', { name: 'Back up to a file' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^fullgrown-backup-.*\.fullgrown\.json$/);
  await expect(savedHere(again)).toHaveCount(0);
  await expect(again.locator('#toast')).toContainText(/Backed up 2 projects/);
  const third = await reopen(context, again);
  await expect(savedHere(third)).toHaveCount(0);
  // Another device, backed up on its first visit: never.
  const other = await browser.newContext();
  const first = await other.newPage();
  await openFresh(first);
  await twoBeds(first, Date.now());
  await first.locator('.project-btn').click();
  await Promise.all([first.waitForEvent('download'), first.locator('.backup-section button', { hasText: 'Back up all projects' }).click()]);
  await closeSheet(first);
  const second = await reopen(other, first);
  await expect(second.locator('#canvas-svg [data-shape-id="a"]')).toHaveCount(1);
  await expect(savedHere(second)).toHaveCount(0);
  expect(await second.evaluate(() => localStorage.getItem('lp-saved-here'))).toBe('skipped');
  await other.close();
});

test('the order: an update’s card first, the second visit’s on the next; an empty plan and the tour get neither, What’s new as ever', async ({ page, context }) => {
  await openFresh(page);
  // Nothing drawn (the first screen), after an update: What's new's own notice, and no card.
  await page.evaluate(() => { localStorage.setItem('lp-app-version', '0.0.1'); localStorage.setItem('lp-whats-new', '0'); });
  await awayFor(page, 5);
  await page.reload();
  await opened(page);
  await expect(page.getByTestId('first-card')).toBeVisible();
  await expect(page.getByTestId('whats-new-notice')).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
  await page.getByTestId('whats-new-notice').getByTestId('notice-close').click();
  // A plan, then the second visit with an update: the update's card; the second visit's waits for the next.
  await twoBeds(page, Date.now());
  await page.evaluate(() => localStorage.setItem('lp-app-version', '0.0.1'));
  const again = await reopen(context, page);
  await expect(welcome(again)).toContainText('FullGrown was updated.'); // (its news told already)
  await expect(savedHere(again)).toHaveCount(0);
  const third = await reopen(context, again);
  await expect(savedHere(third)).toBeVisible();
  await expect(welcome(third)).toHaveCount(0);
  // The guided introduction under way: its card alone, after a gap and an update.
  await third.locator('button[title=More]').click();
  await third.getByTestId('menu-intro').click();
  await expect(third.getByTestId('intro-card')).toBeVisible();
  await third.evaluate(() => { localStorage.setItem('lp-app-version', '0.0.1'); localStorage.setItem('lp-whats-new', '0'); });
  await awayFor(third, 5);
  await third.reload();
  await opened(third);
  await expect(third.getByTestId('intro-card')).toBeVisible();
  await expect(welcome(third)).toHaveCount(0);
  await expect(third.getByTestId('whats-new-notice')).toHaveCount(0);
});

/** A photo of the yard, set to scale at `feet` across its middle half (as e2e/yard-in.spec.ts does). */
async function photoToScale(page: Page, feet = 60) {
  await page.getByTestId('start-photo').click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await expect(page.locator('.mode-banner')).toContainText('Calibrating');
  const img = (await page.locator('#canvas-svg image').boundingBox())!;
  await page.mouse.click(img.x + img.width * 0.25, img.y + img.height * 0.5);
  await page.mouse.click(img.x + img.width * 0.75, img.y + img.height * 0.5);
  await page.getByTestId('scale-distance').fill(String(feet));
  await page.getByTestId('scale-set').click();
  await closeSheet(page);
}

test('with "Now trace" up, the card is at the top and it at the foot, the plan fitted between them', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await photoToScale(page);
  await page.getByTestId('first-card').getByTestId('trace-building').click();
  await tapFromCenter(page, -15, -10); await tapFromCenter(page, 15, -10); await tapFromCenter(page, 15, 8);
  await expect.poll(() => shapeCount(page)).toBe(1);
  await page.getByTestId('pill-deselect').click();
  await expect(page.getByTestId('trace-card')).toBeVisible();
  await pastSecondVisit(page);
  await awayFor(page, 4);
  await page.reload();
  await opened(page);
  const card = (await welcome(page).boundingBox())!, trace = (await page.getByTestId('trace-card').boundingBox())!;
  expect(card.y + card.height).toBeLessThanOrEqual(trace.y);
  const house = (await page.locator('#canvas-svg [data-shape-id]').first().getAttribute('data-shape-id'))!;
  await expect.poll(() => inView(page, house, card.y + card.height, trace.y)).toBe(true);
  // The photo too: all of it between them.
  const photo = (await page.locator('#canvas-svg image').boundingBox())!;
  expect(photo.y).toBeGreaterThanOrEqual(card.y + card.height - 1);
  expect(photo.y + photo.height).toBeLessThanOrEqual(trace.y + 1);
});

test('a photo not to scale yet: its notice waits for the card to go, then says so', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await page.getByTestId('start-photo').click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await expect(page.locator('.mode-banner')).toContainText('Calibrating');
  await page.locator('.mode-banner .banner-close').click(); // (left not to scale)
  if (await page.locator('.sheet').count()) await closeSheet(page);
  await page.locator('.tool-btn.bed').click();
  await page.locator('[data-testid=draw-bar] [data-method=rect]').click();
  await tapFromCenter(page, -3, -2); await tapFromCenter(page, 3, -2); await tapFromCenter(page, 3, 2);
  await expect.poll(() => shapeCount(page)).toBe(1);
  await pastSecondVisit(page);
  await awayFor(page, 4);
  await page.reload();
  await opened(page);
  await expect(welcome(page)).toBeVisible();
  await expect(page.getByTestId('calibrate-notice')).toHaveCount(0);
  const plan = await canvasBox(page);
  await page.mouse.click(plan.x + 10, plan.y + plan.height - 10);
  await expect(welcome(page)).toHaveCount(0);
  await expect(page.getByTestId('calibrate-notice')).toBeVisible();
});
