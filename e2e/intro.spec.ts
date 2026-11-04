import { test, expect, type Page } from '@playwright/test';
import { addKind, autoDialogs, closeSheet, openFresh, shapeCount, tapFromCenter } from './helpers';

// The guided introduction (src/intro.ts, src/ui/intro-card.ts): offered on an empty plan, eight short steps that each
// end when they're done, Skip, Back and Exit on the way, kept per device.

const TABLE = {
  v: 1, accessed: '2026-10-17', zips: { '71923': ['8a', 0, 3] },
  stations: [{ name: 'Arkadelphia 2 N, AR', chance: 100, spring: '03-24', springLate: '04-08', fall: '11-06', fallEarly: '10-24' }],
};
const card = (page: Page) => page.getByTestId('intro-card');
const step = (page: Page) => page.getByTestId('intro-step');
const drawBar = (page: Page) => page.getByTestId('draw-bar');

/** ⋮ → Help → Guided start (it was ⋮ → Show me around: Jason, Nov 2; Take the tour till Nov 4). */
async function takeTour(page: Page) {
  await page.locator('button[title=More]').click();
  await page.getByTestId('menu-help').click();
  await page.getByTestId('help-tour').click();
  await expect(page.getByTestId('help-sheet')).toHaveCount(0);
}
async function start(page: Page, answerAll = true) {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  if (answerAll) autoDialogs(page);
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
  await expect(card(page)).toHaveCount(0); // (drawing: the strip above the plan says what to tap; the card steps aside)
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

test('an empty plan offers Guided start; after "I\'ll explore" it\'s small, in its place, while the plan is blank and it isn\'t under way; ⋮ → Help has it too (Jason, Nov 4)', async ({ page }) => {
  await openFresh(page);
  await expect(page.getByTestId('intro-start')).toHaveText('New here? Guided start');
  await expect(page.getByTestId('guided-start')).toHaveCount(0); // (one offer at a time)
  await page.getByTestId('intro-decline').click();
  await expect(page.getByTestId('intro-start')).toHaveCount(0);
  await expect(page.getByTestId('guided-start')).toHaveText('Guided start');
  await expect(page.getByTestId('start-photo')).toBeVisible(); // (the rest of the empty plan's card stays)
  await page.reload();
  await expect(page.locator('.project-btn .pname')).toBeVisible();
  await expect(page.getByTestId('intro-start')).toHaveCount(0);
  await expect(page.getByTestId('guided-start')).toBeVisible();
  // Started from there: under way, the blank plan's card steps aside for its own.
  await page.getByTestId('guided-start').click();
  await expect(step(page)).toHaveText('Step 1 of 8');
  await expect(page.getByTestId('first-screen')).toHaveCount(0);
  // Closed part way: offered small again (to pick up, or start over).
  await page.getByTestId('intro-exit').click();
  await expect(page.locator('#toast')).toContainText('Guided start closed. To pick it up again: ⋮ → Help → Guided start.');
  await expect(page.getByTestId('guided-start')).toBeVisible();
  await takeTour(page);
  await expect(step(page)).toHaveText('Step 1 of 8'); // (left at step 1: nothing to pick up, so it starts)
});

// The first screen (Jason, Nov 1, from the UI review): what FullGrown does, the garden's ZIP right there, the tour,
// and a backup's way back in.
const rect = (id: string, label: string) => ({ id, type: 'rect', x: 0, y: 0, width: 4, height: 3, rotation: 0, color: '#78716c', label, opacity: 0.65, locked: false });
const backupFile = (names: string[]) => ({
  name: 'fullgrown-backup.fullgrown.json', mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(names.length === 1
    ? { format: 'landscape-planner-project', version: 1, project: { name: names[0], lastModified: 1, data: { shapes: [rect('a', 'Shed')] } } }
    : { format: 'landscape-planner-backup', version: 1, projects: names.map((name, i) => ({ name, lastModified: i + 1, data: { shapes: [rect(`s${i}`, 'Shed')] } })) })),
});

test('the first screen says what FullGrown does, takes the ZIP right there, and restores a backup', async ({ page, isMobile }) => {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  await openFresh(page);
  await expect(page.getByTestId('first-line')).toHaveText('Plan your garden to scale, with plants that suit it.');
  await expect(page.getByTestId('first-zip-box')).toContainText('For its hardiness zone, frost dates and your state’s plant laws. Privacy');
  await expect(page.getByTestId('intro-start')).toHaveText('New here? Guided start'); // (Guided start still offered)
  // Not focused by itself: on a phone its keyboard would come up unasked for, and with a keyboard the plan's own
  // keys would go into it.
  await expect(page.getByTestId('first-zip')).not.toBeFocused();
  await page.keyboard.press('b');
  await expect(page.getByTestId('draw-bar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('first-screen')).toBeVisible();
  // A ZIP that isn't one: said there, the cursor kept in the field with a keyboard.
  await page.getByTestId('first-zip').fill('719');
  await page.getByTestId('first-zip').press('Enter');
  await expect(page.getByTestId('first-zip-problem')).toHaveText('A ZIP code is five digits.');
  if (!isMobile) await expect(page.getByTestId('first-zip')).toBeFocused();
  // Looked up: the zone and frost dates, with their sources, in the location sheet; closed, the zone stays said.
  await page.getByTestId('first-zip').fill('71923');
  await page.getByTestId('first-zip-lookup').click();
  await expect(page.getByTestId('location-result')).toContainText('Zone 8a');
  await expect(page.getByTestId('location-sources')).toBeVisible();
  await expect(page.getByTestId('zip')).toHaveCount(1); // (the sheet's field alone: the first screen's isn't under it)
  await closeSheet(page);
  await expect(page.getByTestId('first-zip')).toHaveCount(0);
  await expect(page.getByTestId('first-zone')).toHaveText('Your garden: zone 8a, ZIP 71923');
  await page.getByTestId('first-zone').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Garden location');
  await closeSheet(page);
  // Already have a plan: a backup of two, listed in Projects to choose from.
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('restore-backup').click();
  await (await chooser).setFiles(backupFile(['Front yard', 'Back yard']));
  await expect(page.locator('.sheet-header .title')).toHaveText('Projects (3)');
  await expect(page.locator('.proj-row', { hasText: 'Back yard' })).toBeVisible();
  await closeSheet(page);
  // Not the only plan now: the empty one still asks where it is, without introducing the app again.
  await expect(page.getByTestId('first-zone')).toBeVisible();
  await expect(page.getByTestId('first-line')).toHaveCount(0);
  await expect(page.getByTestId('restore-backup')).toHaveCount(0);
});

test('restoring one plan\'s file from the first screen opens it', async ({ page }) => {
  await openFresh(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('restore-backup').click();
  await (await chooser).setFiles(backupFile(['Side yard']));
  await expect(page.locator('.project-btn .pname')).toHaveText('Side yard');
  await expect.poll(() => shapeCount(page)).toBe(1);
  await expect(page.getByTestId('first-screen')).toHaveCount(0);
});

test('the first screen fits a 360 × 640 phone at every text size, clear of the zoom buttons (Jason, Nov 1), with Guided start offered at its top or small (Nov 4)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.addInitScript(() => localStorage.setItem('lp-zoom-buttons', 'off')); // (as a phone starts)
  await openFresh(page);
  const offers = [['intro-start', 'intro-decline'], ['guided-start']];
  for (const offer of offers) {
    if (offer[0] === 'guided-start') await page.getByTestId('intro-decline').click(); // ("I'll explore": small from now on)
    for (const size of ['small', 'medium', 'large', 'xlarge']) {
      await page.evaluate((s) => localStorage.setItem('lp-text-size-2', s), size);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-text', size);
      const canvas = (await page.locator('#canvas-wrap').boundingBox())!;
      const column = (await page.locator('.zoombtns').boundingBox())!;
      for (const id of ['first-line', 'first-zip', 'first-zip-lookup', ...offer, 'start-photo', 'restore-backup']) {
        const b = (await page.getByTestId(id).boundingBox())!;
        expect(b, `${id} at ${size}`).toBeTruthy();
        expect(b.y, `${id} at ${size}`).toBeGreaterThanOrEqual(canvas.y);
        expect(b.y + b.height, `${id} at ${size}`).toBeLessThanOrEqual(canvas.y + canvas.height);
        const clear = b.x + b.width <= column.x || b.y >= column.y + column.height;
        expect(clear, `${id} at ${size} clear of the zoom buttons`).toBe(true);
      }
    }
  }
});

test('at Extra large on a 360 × 640 phone, a two-line ZIP message keeps the card above the buttons, the rest a scroll away; its words still let presses through to the plan (the bug hunt, Nov 1)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.addInitScript(() => { localStorage.setItem('lp-zoom-buttons', 'off'); localStorage.setItem('lp-text-size-2', 'xlarge'); });
  await page.route('**/climate/000.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...TABLE, zips: {} }) }));
  await openFresh(page);
  await expect(page.locator('html')).toHaveAttribute('data-text', 'xlarge');
  await page.getByTestId('first-zip').fill('00000');
  await page.getByTestId('first-zip-lookup').click();
  await expect(page.getByTestId('first-zip-problem')).toHaveText('That ZIP isn’t in the zone tables (they cover the 50 states and Puerto Rico).');
  const wrap = (await page.locator('#canvas-wrap').boundingBox())!;
  const cardBox = page.getByTestId('first-card');
  const inPlan = async (id: string) => {
    const b = (await page.getByTestId(id).boundingBox())!;
    return b.y >= wrap.y && b.y + b.height <= wrap.y + wrap.height;
  };
  // The card ends above the bottom bar (it ran under it, "Restore a backup" with it, at y 610).
  const c = (await cardBox.boundingBox())!;
  expect(c.y + c.height).toBeLessThanOrEqual(wrap.y + wrap.height);
  // The card itself still takes no presses: on its words, a press is the plan's.
  await expect(cardBox).toHaveCSS('pointer-events', 'none');
  const line = (await page.getByTestId('first-line').boundingBox())!;
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#canvas-svg'), [line.x + line.width / 2, line.y + line.height / 2])).toBe(true);
  // What didn't fit scrolls into view, from a button on the card, and takes a press there.
  expect(await inPlan('restore-backup')).toBe(false);
  const go = (await page.getByTestId('intro-start').boundingBox())!;
  await page.mouse.move(go.x + go.width / 2, go.y + go.height / 2);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => inPlan('restore-backup')).toBe(true);
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('restore-backup').click();
  await chooser;
});

// The picker bug hunt, Nov 1 (B9): at Extra large the tour's titles read "Where's the g…" and "A photo from …", and with
// the ZIP sheet open the step's own instruction was cut: "Close this with its × to go…".
test('at Extra large on a 360 × 640 phone, the tour\'s titles and words are whole, at the foot of the plan and over a sheet (the picker bug hunt, Nov 1)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.addInitScript(() => { localStorage.setItem('lp-zoom-buttons', 'off'); localStorage.setItem('lp-text-size-2', 'xlarge'); });
  await start(page);
  await expect(page.locator('html')).toHaveAttribute('data-text', 'xlarge');
  /** Whether all of it shows: nothing cut off to the side or below, nor an ellipsis in its place. */
  const whole = async (l: ReturnType<Page['locator']>, what: string) => {
    await expect(l, what).toBeVisible();
    expect(await l.evaluate((e) => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1 && getComputedStyle(e).textOverflow !== 'ellipsis'), what).toBe(true);
    const box = (await l.boundingBox())!, c = (await card(page).boundingBox())!;
    expect(box.x + box.width, what).toBeLessThanOrEqual(c.x + c.width);
  };
  const title = card(page).locator('.intro-title'), text = page.getByTestId('intro-text');
  await expect(title).toHaveText("Where's the garden?");
  await whole(title, 'step 1 title');
  await whole(text, 'step 1 words');
  // Over the ZIP sheet, at the top, short.
  await page.getByTestId('intro-go').click();
  await expect(card(page)).toHaveClass(/at-top/);
  await whole(title, 'step 1 title over the sheet');
  await whole(text, 'step 1 words over the sheet');
  await page.getByTestId('zip').fill('71923');
  await page.getByTestId('zip-lookup').click();
  await expect(text).toHaveText('Your zone and frost dates are below. Close this with its × to go on.');
  await whole(text, 'step 1 words, looked up');
  // The sheet keeps clear of the card.
  const sheet = (await page.locator('.overlay .sheet').boundingBox())!, top = (await card(page).boundingBox())!;
  expect(sheet.y).toBeGreaterThanOrEqual(top.y + top.height);
  await closeSheet(page);
  await expect(step(page)).toHaveText('Step 2 of 8');
  await whole(title, 'step 2 title');
  await whole(text, 'step 2 words');
});

test('from an empty plan to a first plant: each step ends when it\'s done, the plant step names a shrub the yard allows, and the ring ends it', async ({ page, isMobile }) => {
  await start(page);
  await expect(card(page)).toHaveClass(isMobile ? /intro-card(?! corner)/ : /corner/);
  await zip(page);
  await expect(step(page)).toHaveText('Step 2 of 8'); // (the ZIP set: on to the photo)
  await page.getByTestId('intro-skip').click();
  await expect(step(page)).toHaveText('Step 3 of 8'); // (no photo: no turning it)
  await house(page);
  // Locking the house just drawn, a step of its own (3b, not counted in the eight), taught from its panel (Jason,
  // Nov 4; it was a chip on the bed's card that locked it for them).
  await expect(step(page)).toHaveText('Step 3b of 8');
  await expect(card(page).locator('.intro-title')).toHaveText('Lock the house');
  await expect(page.getByTestId('intro-text')).toContainText('Lock your house, so it stays put while you draw around it:');
  await expect(page.getByTestId('intro-go')).toHaveCount(0); // (nothing done for them: they open it and lock it)
  // Not selected: the house itself pulses, on the plan.
  if (await page.getByTestId('pill-deselect').count()) await page.getByTestId('pill-deselect').click();
  const houseShape = page.locator('#canvas-svg [data-shape-group]').first();
  await expect(houseShape).toHaveClass(/shape-pulse/);
  // Selected: Edit pulses; opened, the toggle at the top of its panel.
  const h = (await page.locator('#canvas-svg [data-shape-id]').first().boundingBox())!;
  await page.mouse.click(h.x + h.width / 2, h.y + h.height / 2);
  await expect(page.locator('.sel-pill .edit')).toHaveClass(/intro-pulse/);
  await expect(page.locator('#canvas-svg .shape-pulse')).toHaveCount(0);
  await page.locator('.sel-pill .edit').click();
  const toggle = page.getByTestId('lock-toggle');
  await expect(toggle).toHaveText('Unlocked');
  await expect(toggle).toHaveClass(/intro-pulse/);
  await expect(page.getByTestId('intro-text')).toHaveText(isMobile ? 'Tap Unlocked at the top, so it reads Locked.' : 'Click Unlocked at the top, so it reads Locked.');
  await toggle.click();
  await expect(toggle).toHaveText('Locked');
  // (The panel's note says what its button says: "Locked", pressed to unlock. It said "Tap Unlock above".)
  await expect(page.locator('.sheet .banner').first()).toContainText(isMobile ? 'To move it, tap Locked above to unlock it.' : 'To move it, click Locked above to unlock it.');
  // Done: on to the bed, which says what's next over the panel.
  await expect(step(page)).toHaveText('Step 4 of 8');
  await expect(page.getByTestId('intro-text')).toHaveText('Locked: it stays put. Close this with its ×, then draw a bed.');
  await closeSheet(page);
  await expect(page.getByTestId('intro-text')).toContainText("Now a bed, where you'd like plants.");
  await expect(page.getByTestId('intro-text')).not.toContainText('Lock');
  // (The house's lock isn't kept with the tour's record: it's read as the steps go.)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lp-intro') ?? '{}').base)).not.toHaveProperty('houseLocked');
  await page.getByTestId('intro-go').click();
  await expect(drawBar(page)).toBeVisible();
  await bed(page, false);
  await expect(step(page)).toHaveText('Step 5 of 8'); // (no photo: no fading it)
  // Sun and shade: a circle of shade, sun recorded on it, the sheet closed.
  await page.getByTestId('intro-go').click();
  await drawBar(page).locator('[data-method=circle]').click();
  // (4 ft across: the house was drawn at the house's scale, and the view stays there; 2 ft read as one tap, twice.)
  await tapFromCenter(page, 3, 3); await tapFromCenter(page, 7, 3);
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
  await expect(page.locator('#toast')).toContainText("That's the end of the guided start. Add more plants, or open Add for paths, lawn, fences and the rest. To go through it again: ⋮ → Help → Guided start.");
  expect(await shapeCount(page)).toBe(4);
  // Finished: not offered again, and kids and dogs are still in the picker's filters after a reload.
  await page.reload();
  await expect(page.locator('.project-btn .pname')).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await page.locator('.tool-btn.plants').click();
  await expect(page.locator('.sheet')).toContainText('Not listed as poisonous to people');
  await expect(page.locator('.sheet')).toContainText('No dog warnings');
  // "Clear filters" is for the search at hand: the yard is still kept with the plan.
  await page.locator('.sheet').getByText('Clear filters').click();
  await expect(page.locator('.sheet')).not.toContainText('No dog warnings');
  await page.reload();
  await expect(page.locator('.project-btn .pname')).toBeVisible();
  await page.locator('.tool-btn.plants').click();
  await expect(page.locator('.sheet')).toContainText('No dog warnings');
});

test('Back and Skip; Exit keeps the step, and Guided start (⋮ → Help) offers to pick up there or start over', async ({ page }) => {
  await start(page);
  await page.getByTestId('intro-skip').click();
  await expect(step(page)).toHaveText('Step 2 of 8');
  await page.getByTestId('intro-back').click();
  await expect(step(page)).toHaveText('Step 1 of 8');
  await expect(page.getByTestId('intro-back')).toHaveCount(0); // (none on the first step)
  await zip(page);
  await page.getByTestId('intro-skip').click();
  await house(page);
  // Lock the house (3b): skipped, the house left unlocked; Back from the bed comes back to it.
  await expect(step(page)).toHaveText('Step 3b of 8');
  await page.getByTestId('intro-skip').click();
  await expect(step(page)).toHaveText('Step 4 of 8');
  await page.getByTestId('intro-back').click();
  await expect(step(page)).toHaveText('Step 3b of 8');
  await page.getByTestId('intro-skip').click();
  await expect(step(page)).toHaveText('Step 4 of 8');
  await page.getByTestId('intro-exit').click();
  await expect(card(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.project-btn .pname')).toBeVisible();
  await expect(card(page)).toHaveCount(0); // (exited: it waits in ⋮ → Help)
  await takeTour(page);
  await expect(card(page).locator('.intro-title')).toHaveText('Guided start');
  await expect(page.getByTestId('intro-resume')).toHaveText('Pick up at step 4, A bed');
  await page.getByTestId('intro-resume').click();
  await expect(step(page)).toHaveText('Step 4 of 8');
  await page.getByTestId('intro-exit').click();
  await expect(page.locator('#toast')).toContainText('Guided start closed. To pick it up again: ⋮ → Help → Guided start.');
  await takeTour(page);
  await page.getByTestId('intro-over').click();
  await expect(step(page)).toHaveText('Step 1 of 8');
  // (Starting over on a plan with a ZIP: step 1 says so, and goes on.)
  await expect(page.getByTestId('intro-text')).toHaveText("This plan's garden is at ZIP 71923. Change it if that's not where the garden is.");
  await page.getByTestId('intro-done').click();
  await expect(step(page)).toHaveText('Step 2 of 8');
});

/** Projects → New project, named (the open plan's garden offered for it, ticked, as it comes). */
async function newPlan(page: Page, name: string) {
  await page.locator('.project-btn').click();
  await page.getByRole('button', { name: /New project/ }).click();
  await page.getByTestId('ask-input').fill(name);
  await page.getByTestId('ask-ok').click();
  await expect(page.locator('.project-btn .pname')).toHaveText(name);
}
async function openPlan(page: Page, name: string) {
  await page.locator('.project-btn').click();
  await page.locator('.proj-row', { hasText: name }).click();
  await expect(page.locator('.project-btn .pname')).toHaveText(name);
}

test('the guided start stays with the plan it\'s on: another plan opened, its card waits there, said once; back, it\'s at its step (Jason, Nov 4)', async ({ page }) => {
  await start(page, false); // (New project's name typed here)
  await zip(page);
  await page.getByTestId('intro-skip').click();
  await expect(step(page)).toHaveText('Step 3 of 8');
  // Another plan: no card on it, and a notice says where it waits.
  await newPlan(page, 'Side yard');
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#toast')).toHaveText('Guided start waits on “My Garden”. Switch back to it to go on.');
  await expect(page.getByTestId('first-screen')).toBeVisible(); // (the empty plan's own card, as on any empty plan)
  // A house drawn here doesn't count toward step 3 there, and the notice isn't said again as the plan redraws.
  await addKind(page, 'building');
  await tapFromCenter(page, -4, -6); await tapFromCenter(page, 4, -6); await tapFromCenter(page, 4, -2);
  await expect.poll(() => shapeCount(page)).toBe(1);
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#toast', { hasText: 'Guided start waits' })).toHaveCount(0);
  // Back on its plan: there, at its step.
  await openPlan(page, 'My Garden');
  await expect(step(page)).toHaveText('Step 3 of 8');
  await expect(page.locator('#toast', { hasText: 'Guided start waits' })).toHaveCount(0);
  // Started from Help on the other plan: pick up at its step here, or start over (as before).
  await openPlan(page, 'Side yard');
  await expect(page.locator('#toast')).toHaveText('Guided start waits on “My Garden”. Switch back to it to go on.');
  await takeTour(page);
  await expect(page.getByTestId('intro-resume')).toHaveText('Pick up at step 3, Your house');
  await page.getByTestId('intro-resume').click();
  await expect(step(page)).toHaveText('Step 3 of 8');
  // Now it's this plan's: the first one has no card, and says it waits on this one.
  await openPlan(page, 'My Garden');
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#toast')).toHaveText('Guided start waits on “Side yard”. Switch back to it to go on.');
});

test('the first screen is a card whose ✕ puts it away for this plan, with Undo; a new plan still has it; its ZIP note ends in Privacy (Jason, Nov 1)', async ({ page }) => {
  await openFresh(page);
  await expect(page.getByTestId('first-card')).toBeVisible();
  // Privacy: what happens to the ZIP, in the ZIP sheet.
  await page.getByTestId('zip-privacy').click();
  const note = page.getByTestId('zip-privacy-note');
  await expect(note).toContainText('Looking it up fetches only its first three digits');
  await expect(note).toContainText('if you sign in to sync, in your account');
  await closeSheet(page);
  // ✕: gone, with Undo; gone again, and still gone after a reload.
  await page.getByTestId('first-hide').click();
  await expect(page.getByTestId('first-screen')).toHaveCount(0);
  const notice = page.getByTestId('first-hidden-notice');
  await expect(notice).toContainText('Hidden for this plan.');
  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('first-card')).toBeVisible();
  await page.getByTestId('first-hide').click();
  await expect(page.getByTestId('first-screen')).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.locator('.project-btn .pname')).toBeVisible();
  await expect(page.getByTestId('first-screen')).toHaveCount(0);
  // The garden's ZIP is still a menu away.
  await page.locator('button[title=More]').click();
  await expect(page.locator('.menu-item', { hasText: 'Garden location' })).toBeVisible();
  await page.keyboard.press('Escape');
  // A new plan: its own first screen (no introduction: not the only plan).
  await page.locator('.project-btn').click();
  await page.getByRole('button', { name: /New project/ }).click();
  await page.getByTestId('ask-input').fill('Front yard');
  await page.getByTestId('ask-ok').click();
  await expect(page.locator('.project-btn .pname')).toHaveText('Front yard');
  await expect(page.getByTestId('first-card')).toBeVisible();
  await expect(page.getByTestId('first-zip')).toBeVisible();
});

test('with a photo in, the first screen sits at the bottom over the buttons, its words on a card, the photo clear above it (Jason, Nov 1)', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'background image' }).click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await page.locator('.mode-banner button').click();
  const hint = page.getByTestId('first-screen');
  await expect(hint).toHaveClass(/docked/);
  await expect(page.getByTestId('first-line')).toHaveText('Your photo is in. Next: trace the house over it with the buttons below.');
  await expect(page.getByTestId('start-photo')).toHaveCount(0);
  await expect(page.getByTestId('first-zip')).toBeVisible();
  await expect(page.getByTestId('zip-privacy')).toBeVisible();
  // Docked: its bottom by the plan's bottom edge, its top below the plan's middle.
  const wrap = (await page.locator('#canvas-wrap').boundingBox())!;
  const cardBox = (await page.getByTestId('first-card').boundingBox())!;
  expect(wrap.y + wrap.height - (cardBox.y + cardBox.height)).toBeLessThanOrEqual(16);
  expect(cardBox.y).toBeGreaterThan(wrap.y + wrap.height / 2);
  // Put away, the photo is all there is.
  await page.getByTestId('first-hide').click();
  await expect(hint).toHaveCount(0);
  await expect(page.locator('#canvas-svg image')).toHaveCount(1);
});

test('on a phone with room, the first screen\'s card sits in the middle, clear of the side buttons (Jason, Nov 1: it sat off to the left)', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  await page.addInitScript(() => localStorage.setItem('lp-zoom-buttons', 'off'));
  await openFresh(page);
  const card = page.getByTestId('first-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('first-screen')).not.toHaveClass(/beside-column/);
  const wrap = (await page.locator('#canvas-wrap').boundingBox())!;
  const c = (await card.boundingBox())!;
  const z = (await page.locator('.zoombtns').boundingBox())!;
  expect(Math.abs((c.x - wrap.x) - (wrap.x + wrap.width - (c.x + c.width)))).toBeLessThanOrEqual(2);
  expect(c.y).toBeGreaterThanOrEqual(z.y + z.height);
  // Made too short for that, it moves beside the buttons, and back.
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.getByTestId('first-screen')).toHaveClass(/beside-column/);
  const c2 = (await card.boundingBox())!, z2 = (await page.locator('.zoombtns').boundingBox())!;
  expect(c2.x + c2.width).toBeLessThanOrEqual(z2.x);
  await page.setViewportSize({ width: 412, height: 860 });
  await expect(page.getByTestId('first-screen')).not.toHaveClass(/beside-column/);
});
