import { test, expect, type Page } from '@playwright/test';
import { autoDialogs, closeSheet, openFresh, shapeCount, tapFromCenter } from './helpers';

// The guided introduction (src/intro.ts, src/ui/intro-card.ts): offered on an empty plan, eight short steps that each
// end when they're done, Skip, Back and Exit on the way, kept per device.

const TABLE = {
  v: 1, accessed: '2026-10-17', zips: { '71923': ['8a', 0, 3] },
  stations: [{ name: 'Arkadelphia 2 N, AR', chance: 100, spring: '03-24', springLate: '04-08', fall: '11-06', fallEarly: '10-24' }],
};
const card = (page: Page) => page.getByTestId('intro-card');
const step = (page: Page) => page.getByTestId('intro-step');
const drawBar = (page: Page) => page.getByTestId('draw-bar');

async function start(page: Page) {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  autoDialogs(page);
  await openFresh(page);
  await page.getByTestId('intro-start').click();
  await expect(step(page)).toHaveText('Step 1 of 8');
}
/** Step 1: the ZIP, through the card's own button. */
async function zip(page: Page) {
  await page.getByTestId('intro-go').click();
  // The field pulses till a ZIP is in it, then Look up (the UI review: Look up pulsing over an empty field read as
  // the focus being there).
  await expect(page.getByTestId('zip')).toHaveClass(/intro-pulse/);
  await expect(page.getByTestId('zip-lookup')).not.toHaveClass(/intro-pulse/);
  await expect(card(page)).toHaveClass(/at-top/); // (clear of the sheet)
  await page.getByTestId('zip').fill('71923');
  await expect(page.getByTestId('zip-lookup')).toHaveClass(/intro-pulse/);
  await expect(page.getByTestId('zip')).not.toHaveClass(/intro-pulse/);
  await page.getByTestId('zip-lookup').click();
  // (The zone stays to be read: step 2 waits for the sheet to close (testers, Oct 30).)
  // (Closed with its ×: on a phone the sheet hides all but a sliver of the plan (round 3).)
  await expect(page.getByTestId('intro-text')).toContainText('Your zone and frost dates are below. Close this with its × to go on.');
  await expect(step(page)).toHaveText('Step 1 of 8');
  await closeSheet(page);
}
/** Step 3: a house, from Add → Building (three taps: a corner, the next, the far side). */
async function house(page: Page) {
  await page.getByTestId('intro-go').click();
  await expect(page.locator('.kind-chip[data-kind=building]').first()).toHaveClass(/intro-pulse/);
  await page.locator('.kind-chip[data-kind=building]').first().click();
  await expect(card(page)).toHaveClass(/compact/); // (drawing: the plan's own banner says what to tap)
  await tapFromCenter(page, -4, -6); await tapFromCenter(page, 4, -6); await tapFromCenter(page, 4, -2);
}
/** Step 4: a bed, an outline of four corners (`go`: the card's button opens the bed tool; false, it's open). */
async function bed(page: Page, go = true) {
  if (go) await page.getByTestId('intro-go').click();
  await expect(drawBar(page)).toBeVisible();
  const outline = drawBar(page).locator('[data-method=poly]');
  if (await outline.count()) await outline.click();
  await tapFromCenter(page, -5, 1); await tapFromCenter(page, 5, 1); await tapFromCenter(page, 5, 5); await tapFromCenter(page, -5, 5);
  await drawBar(page).getByRole('button', { name: 'Done' }).click();
}

test('an empty plan offers it; "I\'ll explore" puts it away for good, and ⋮ still has it', async ({ page }) => {
  await openFresh(page);
  await expect(page.getByTestId('intro-start')).toHaveText('New here? Show me around');
  await page.getByTestId('intro-decline').click();
  await expect(page.getByTestId('intro-start')).toHaveCount(0);
  await expect(page.getByTestId('start-photo')).toBeVisible(); // (the rest of the empty plan's card stays)
  await page.reload();
  await expect(page.locator('.project-btn .pname')).toBeVisible();
  await expect(page.getByTestId('intro-start')).toHaveCount(0);
  await page.locator('button[title=More]').click();
  await page.getByTestId('menu-intro').click();
  await expect(step(page)).toHaveText('Step 1 of 8');
});

test('from an empty plan to a first plant: each step ends when it\'s done, the plant step names a shrub the yard allows, and the ring ends it', async ({ page, isMobile }) => {
  await start(page);
  await expect(card(page)).toHaveClass(isMobile ? /intro-card(?! corner)/ : /corner/);
  await zip(page);
  await expect(step(page)).toHaveText('Step 2 of 8'); // (the ZIP set: on to the photo)
  await page.getByTestId('intro-skip').click();
  await expect(step(page)).toHaveText('Step 3 of 8'); // (no photo: no turning it)
  await house(page);
  await expect(step(page)).toHaveText('Step 4 of 8');
  // Locking taught on the house just drawn (Oct 29).
  await expect(page.getByTestId('intro-text')).toContainText('Lock your house, so it stays put while you draw around it.');
  await page.getByTestId('intro-lock-house').click();
  await expect(page.locator('#toast')).toContainText('Locked: it stays put.');
  await expect(page.getByTestId('intro-text')).not.toContainText('Lock your house');
  // Read, then the bed tool opened: the notice goes, off the house's front wall where the bed's corners go (the UI
  // review, 2026-11-01).
  await page.waitForTimeout(450);
  await page.getByTestId('intro-go').click();
  await expect(drawBar(page)).toBeVisible();
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await bed(page, false);
  await expect(step(page)).toHaveText('Step 5 of 8'); // (no photo: no fading it)
  // Sun and shade: a circle of shade, sun recorded on it, the sheet closed.
  await page.getByTestId('intro-go').click();
  await drawBar(page).locator('[data-method=circle]').click();
  await tapFromCenter(page, 3, 3); await tapFromCenter(page, 5, 3);
  await expect(page.getByTestId('sun-empty')).toHaveClass(/intro-pulse/);
  await page.getByTestId('record-sun').click();
  await expect(step(page)).toHaveText('Step 5 of 8'); // (not until the sheet is closed)
  await closeSheet(page);
  await expect(step(page)).toHaveText('Step 6 of 8');
  // Who's in the yard: kids and dogs.
  await page.getByTestId('intro-kids').click();
  await page.getByTestId('intro-dogs').click();
  await expect(page.getByTestId('intro-dogs-note')).toBeVisible();
  await page.getByTestId('intro-done').click();
  await expect(step(page)).toHaveText('Step 7 of 8');
  // Find a plant: the shrub named isn't a hydrangea (a problem for kids and dogs), and the picker opens hardy here.
  const text = page.getByTestId('intro-text');
  await expect(text).toContainText('Find something for the bed');
  await expect(text).toContainText("it's hardy here");
  await expect(text).not.toContainText('hydrangea');
  await page.getByTestId('intro-go').click();
  await expect(page.getByTestId('hardy-here')).toBeChecked();
  await expect(page.locator('.sheet')).toContainText('Not listed as poisonous to people');
  await expect(page.locator('.sheet')).toContainText('No dog warnings');
  await expect(page.getByTestId('plant-search')).toHaveClass(/intro-pulse/);
  await page.getByTestId('plant-search').fill('Forsythia');
  await page.locator('.sheet .proj-row').first().getByTestId('plant-place').click();
  await tapFromCenter(page, -2, 3);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await expect(step(page)).toHaveText('Step 8 of 8');
  await expect(page.getByTestId('intro-text')).toContainText('The dashed ring is how big it gets full-grown');
  await expect(page.locator('#toast', { hasText: 'dashed ring is full size' })).toHaveCount(0); // (the card says it: no hint too)
  await page.getByTestId('intro-done').click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText("That's the tour");
  expect(await shapeCount(page)).toBe(4);
  // Finished: not offered again, and kids and dogs are still in the picker's filters after a reload.
  await page.reload();
  await expect(page.locator('.project-btn .pname')).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await page.locator('.tool-btn.plants').click();
  await expect(page.locator('.sheet')).toContainText('Not listed as poisonous to people');
  await expect(page.locator('.sheet')).toContainText('No dog warnings');
  // "Clear filters" is for the search at hand: the yard is still kept on this device.
  await page.locator('.sheet').getByText('Clear filters').click();
  await expect(page.locator('.sheet')).not.toContainText('No dog warnings');
  await page.reload();
  await expect(page.locator('.project-btn .pname')).toBeVisible();
  await page.locator('.tool-btn.plants').click();
  await expect(page.locator('.sheet')).toContainText('No dog warnings');
});

test('Back and Skip; Exit keeps the step, and "Show me around" offers to pick up there or start over', async ({ page }) => {
  await start(page);
  await page.getByTestId('intro-skip').click();
  await expect(step(page)).toHaveText('Step 2 of 8');
  await page.getByTestId('intro-back').click();
  await expect(step(page)).toHaveText('Step 1 of 8');
  await expect(page.getByTestId('intro-back')).toHaveCount(0); // (none on the first step)
  await zip(page);
  await page.getByTestId('intro-skip').click();
  await house(page);
  await expect(step(page)).toHaveText('Step 4 of 8');
  await page.getByTestId('intro-exit').click();
  await expect(card(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.project-btn .pname')).toBeVisible();
  await expect(card(page)).toHaveCount(0); // (exited: it waits in ⋮)
  await page.locator('button[title=More]').click();
  await page.getByTestId('menu-intro').click();
  await expect(page.getByTestId('intro-resume')).toHaveText('Pick up at step 4, A bed');
  await page.getByTestId('intro-resume').click();
  await expect(step(page)).toHaveText('Step 4 of 8');
  await page.getByTestId('intro-exit').click();
  await page.locator('button[title=More]').click();
  await page.getByTestId('menu-intro').click();
  await page.getByTestId('intro-over').click();
  await expect(step(page)).toHaveText('Step 1 of 8');
  // (Starting over on a plan with a ZIP: step 1 says so, and goes on.)
  await expect(page.getByTestId('intro-text')).toHaveText("This plan's garden is at ZIP 71923. Change it if that's not where the garden is.");
  await page.getByTestId('intro-done').click();
  await expect(step(page)).toHaveText('Step 2 of 8');
});
