import { test, expect, type Page } from '@playwright/test';
import { addPlainShape, closeSheet, drag, field, openFresh, openSections, openWarnings, placeOnceAtCenter, setRole, shapeCount, openSettings } from './helpers';

async function addRect(page: Page, label: string, role: string, size?: [number, number]) {
  await addPlainShape(page, 'rect');
  await field(page, 'Label').fill(label);
  await setRole(page, role);
  if (size) {
    await field(page, 'Width (ft)').fill(String(size[0]));
    await field(page, 'Length (ft)').fill(String(size[1]));
  }
}
async function addPlant(page: Page, name: string) {
  await page.locator('.tool-btn.plants').click();
  await expect(page.locator('.sheet-header .title')).toContainText(/Plant Picker \(\d,\d{3}\)/);
  await page.locator('.sheet input[type=text]').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);
}
const shapeEl = (page: Page, label: string) =>
  page.locator('[data-shape-group]', { has: page.locator('text', { hasText: label }) }).locator('[data-shape-id]');
async function openProps(page: Page, label: string) {
  await page.locator('button[title=Layers]').click();
  await page.locator('.layer-row', { hasText: label }).click();
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
}

test('a bed carries the plants inside it, unless that is turned off', async ({ page }) => {
  await openFresh(page);
  await addRect(page, 'Front bed', 'Bed', [10, 6]);
  await expect(page.locator('[data-testid=measure]')).toHaveText('Area: 60 sq ft');
  await closeSheet(page);
  await addPlant(page, "Heuchera 'Autumn Bride'");
  await openProps(page, 'Front bed');
  await expect(page.locator('.plant-list')).toHaveText("1 plant: Heuchera 'Autumn Bride'");
  await closeSheet(page);

  const plant = shapeEl(page, 'Autumn Bride');
  const p0 = (await plant.boundingBox())!;
  const bed = (await shapeEl(page, 'Front bed').boundingBox())!;
  const grab = { x: bed.x + 30, y: bed.y + 30 }; // near a corner of the bed, clear of the plant (and of its corner handle)
  await drag(page, grab, { x: grab.x + 48, y: grab.y });
  const p1 = (await plant.boundingBox())!;
  expect(Math.round(p1.x - p0.x)).toBe(48);

  await openProps(page, 'Front bed');
  await page.locator('.check-row', { hasText: 'move with the bed' }).locator('input').uncheck();
  await closeSheet(page);
  const bed2 = (await shapeEl(page, 'Front bed').boundingBox())!;
  const p2 = (await plant.boundingBox())!; // the view re-centered on the bed
  await drag(page, { x: bed2.x + 30, y: bed2.y + 30 }, { x: bed2.x + 78, y: bed2.y + 30 });
  expect(Math.round((await shapeEl(page, 'Front bed').boundingBox())!.x - bed2.x)).toBe(48); // bed moved
  expect(Math.round((await plant.boundingBox())!.x - p2.x)).toBe(0); // plant stayed
});

test('deleting a bed with plants in it asks whether they go too, its locked ones as well; either way one Undo brings everything back (the UI review and Jason, 2026-11-01)', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const base = { color: '#16a34a', opacity: 0.65 };
    localStorage.setItem('landscape-planner-v1', JSON.stringify({
      shapes: [
        { ...base, id: 'bed', type: 'rect', x: 0, y: 0, width: 10, height: 6, rotation: 0, label: 'Front bed', role: 'bed' },
        { ...base, id: 'p1', type: 'circle', x: 2, y: 2, radius: 1, label: 'One', role: 'plant' },
        { ...base, id: 'p2', type: 'circle', x: 8, y: 2, radius: 1, label: 'Two', role: 'plant' },
        { ...base, id: 'p3', type: 'circle', x: 5, y: 5, radius: 1, label: 'Three', role: 'plant', locked: true },
        { ...base, id: 'lawn', type: 'circle', x: -6, y: 2, radius: 1, label: 'On the lawn', role: 'plant' },
        { ...base, id: 'empty', type: 'rect', x: -8, y: 8, width: 4, height: 3, rotation: 0, label: 'Empty bed', role: 'bed' },
        { ...base, id: 'back', type: 'rect', x: 0, y: 10, width: 6, height: 4, rotation: 0, label: 'Back bed', role: 'bed' },
        { ...base, id: 'p4', type: 'circle', x: 3, y: 12, radius: 1, label: 'Four', role: 'plant' },
      ],
      zoom: 1, offsetX: -10, offsetY: -6,
    }));
  });
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(8);
  const ask = page.locator('.ask-overlay [role=alertdialog]');
  const deleteBed = async (label: string) => {
    await openProps(page, label);
    await page.locator('.sheet .action-row button', { hasText: 'Delete' }).click();
  };
  // With a locked plant in it: the bed only, the bed and its unlocked plants, or everything (Jason, Nov 1: a bed can
  // be deleted though it's locked, so its locked plants can go too). It asks in the app's own question.
  await deleteBed('Front bed');
  await expect(ask.locator('.ask-message')).toHaveText('“Front bed” has 3 plants in it, 1 of them locked.');
  await expect(ask.locator('button')).toHaveText(['Delete the bed only (its 3 plants stay)', 'Delete the bed and its 2 unlocked plants (the 1 locked plant stays)',
    'Delete the bed and all 3 plants, the 1 locked plant too', 'Cancel']);
  await expect(ask.getByTestId('ask-cancel')).toBeFocused();
  await ask.getByTestId('ask-cancel').click();
  await expect.poll(() => shapeCount(page)).toBe(8);
  // The bed only: its plants stay where they are; the notice says so, and its Undo brings the bed back.
  await page.locator('.sheet .action-row button', { hasText: 'Delete' }).click();
  await ask.getByTestId('ask-bed-only').click();
  await expect.poll(() => shapeCount(page)).toBe(7);
  await expect(page.locator('#canvas-svg [data-shape-id=bed]')).toHaveCount(0);
  await expect(page.locator('#toast-action')).toContainText('Deleted Front bed; its 3 plants stay');
  await page.locator('#toast-action').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => shapeCount(page)).toBe(8);
  // The bed and its unlocked plants: the locked one stays.
  await deleteBed('Front bed');
  await ask.getByTestId('ask-bed-unlocked').click();
  await expect.poll(() => shapeCount(page)).toBe(5);
  for (const id of ['bed', 'p1', 'p2']) await expect(page.locator(`#canvas-svg [data-shape-id=${id}]`)).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-shape-id=p3]')).toHaveCount(1);
  await expect(page.locator('#toast-action')).toContainText('Deleted Front bed and its 2 unlocked plants; the 1 locked plant stays');
  await page.locator('button[title=Undo]').click();
  await expect.poll(() => shapeCount(page)).toBe(8);
  // Everything: the locked plant too, in one step, which the top bar's Undo brings back whole.
  await deleteBed('Front bed');
  await ask.getByTestId('ask-ok').click();
  await expect.poll(() => shapeCount(page)).toBe(4);
  for (const id of ['bed', 'p1', 'p2', 'p3']) await expect(page.locator(`#canvas-svg [data-shape-id=${id}]`)).toHaveCount(0);
  await expect(page.locator('#toast-action')).toContainText('Deleted Front bed and its 3 plants');
  await page.locator('button[title=Undo]').click();
  await expect.poll(() => shapeCount(page)).toBe(8);
  await expect(page.locator('#canvas-svg [data-shape-id=p3]')).toHaveCount(1);
  // No locked plants in it: the bed only, or the bed and its plants.
  await deleteBed('Back bed');
  await expect(ask.locator('.ask-message')).toHaveText('“Back bed” has 1 plant in it.');
  await expect(ask.locator('button')).toHaveText(['Delete the bed only (its 1 plant stays)', 'Delete the bed and its 1 plant', 'Cancel']);
  await ask.getByTestId('ask-ok').click();
  await expect.poll(() => shapeCount(page)).toBe(6);
  await expect(page.locator('#toast-action')).toContainText('Deleted Back bed and its 1 plant');
  // A bed with no plants in it goes as before, nothing asked.
  await deleteBed('Empty bed');
  await expect(page.locator('#toast-action')).toContainText('Deleted Empty bed');
  await expect(ask).toHaveCount(0);
  await expect.poll(() => shapeCount(page)).toBe(5);
});

test('shade sun can be recorded as times or hours, and is saved', async ({ page }) => {
  await openFresh(page);
  await addRect(page, 'Oak shade', 'Sun exposure', [8, 8]);
  await page.getByTestId('record-sun').click();
  await expect(page.locator('[data-testid=sun-summary]')).toHaveText('☀ 4 h of direct sun · part sun / part shade');
  // Move the end handle 2 hours later with the keyboard (30-minute steps).
  const end = page.locator('[data-testid=sun-period] input[aria-label="Sun ends"]');
  await end.focus();
  const handle = await end.elementHandle();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid=sun-summary]')).toHaveText('☀ 6 h of direct sun · full sun');
  await expect(page.locator('.tr-readout').first()).toHaveText('9 am – 3 pm');
  expect(await handle!.evaluate((n) => n.isConnected)).toBe(true); // panel not rebuilt mid-drag
  await expect(page.locator('#canvas-svg [data-role=sun-label]')).toHaveText('☀ 6 h');

  await page.locator('button', { hasText: '+ Another sunny period' }).click();
  await expect(page.locator('[data-testid=sun-period]')).toHaveCount(2);
  await page.locator('[data-testid=sun-section] input[type=text]').fill('after leaf-out');
  await page.locator('.seg button', { hasText: 'Just hours' }).click();
  await expect(page.locator('[data-testid=sun-section] input[type=range]')).toHaveCount(1);
  await closeSheet(page);

  await page.waitForTimeout(600);
  await page.reload();
  await page.locator('button[title=Layers]').click();
  await expect(page.locator('.layer-row', { hasText: 'Oak shade' })).toContainText(/sun · seen \w+ \d+, \d{4}/);
  await page.locator('.layer-row', { hasText: 'Oak shade' }).click();
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await expect(page.locator('.seg button.sel')).toHaveText('Just hours');
  await expect(page.locator('[data-testid=sun-section] input[type=text]')).toHaveValue('after leaf-out');
});

test('a plant in the wrong light gets a warning', async ({ page }) => {
  await openFresh(page);
  await addRect(page, 'Sunny strip', 'Sun exposure', [8, 8]);
  await page.getByTestId('record-sun').click();
  await page.locator('.seg button', { hasText: 'Just hours' }).click();
  const hours = page.locator('[data-testid=sun-section] input[type=range]');
  await hours.fill('8');
  await closeSheet(page);
  await addPlant(page, 'Turkey corn'); // part sun (NC State, Chicago Botanic Garden)
  await expect(page.locator('#canvas-svg [data-role=sun-warning]')).toHaveCount(1);
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await expect(page.locator('[data-testid=sun-check]')).toContainText('prefers part shade'); // (as its details say it: round 3)

  // Dismiss it for this plant: the badge goes, the note stays in properties.
  await page.getByTestId('sun-dismiss').click();
  await expect(page.locator('#canvas-svg [data-role=sun-warning]')).toHaveCount(0);
  await expect(page.locator('[data-testid=sun-check]')).toContainText('dismissed');
  await page.getByTestId('sun-dismiss').click(); // and back
  await expect(page.locator('#canvas-svg [data-role=sun-warning]')).toHaveCount(1);
  await page.getByTestId('sun-dismiss').click();
  await closeSheet(page);

  // It comes back when the light changes.
  await page.locator('button[title=Layers]').click();
  await page.locator('.layer-row', { hasText: 'Sunny strip' }).click();
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await page.locator('[data-testid=sun-section] input[type=range]').fill('7'); // still too sunny, but the warning now reads differently
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=sun-warning]')).toHaveCount(1);

  // Or turn badges off for the whole plan.
  await openSettings(page);
  await openWarnings(page);
  await page.getByTestId('sun-warnings').uncheck();
  await closeSheet(page);
  await expect(page.locator('#canvas-svg [data-role=sun-warning]')).toHaveCount(0);
});

test('boundaries show their length; deleting from properties closes the panel', async ({ page }) => {
  await openFresh(page);
  await addRect(page, 'Fence', 'Boundary');
  await expect(page.locator('[data-testid=measure]')).toHaveText('Length around: 14 ft');
  await page.locator('.sheet button', { hasText: 'Delete' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  expect(await shapeCount(page)).toBe(0);
});

test('hiding names hides lengths, sun hours and plant badges too, a selected shape keeping its own', async ({ page }) => {
  await openFresh(page);
  await addRect(page, 'Sunny strip', 'Sun exposure', [8, 8]);
  await page.getByTestId('record-sun').click();
  await page.locator('.seg button', { hasText: 'Just hours' }).click();
  await page.locator('[data-testid=sun-section] input[type=range]').fill('8');
  await closeSheet(page);
  await addPlant(page, 'Turkey corn'); // part sun: a warning badge here
  await page.keyboard.press('Escape');
  await expect(page.locator('.sel-pill')).toHaveCount(0);
  const strip = page.locator('#canvas-svg text', { hasText: 'Sunny strip' });
  const hours = page.locator('#canvas-svg [data-role=sun-label]');
  const badge = page.locator('#canvas-svg [data-role=sun-warning]');
  const plant = page.locator('#canvas-svg text', { hasText: 'Turkey corn' });
  await expect(strip).toHaveCount(1); await expect(hours).toHaveCount(1); await expect(badge).toHaveCount(1);
  await expect(plant).toHaveCount(1);

  const toggle = page.getByTestId('toggle-names');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toast')).toContainText('Names and badges hidden');
  for (const gone of [strip, hours, badge, plant]) await expect(gone).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-shape-id]')).toHaveCount(2); // (the shapes stay)
  await expect(page.locator('#canvas-svg text', { hasText: "10'" }).first()).toBeVisible(); // (and the grid's feet)

  // A selected shape shows its own, the others staying hidden.
  await page.locator('button[title=Layers]').click();
  await expect(page.getByTestId('show-names')).not.toBeChecked();
  await page.locator('.layer-row', { hasText: 'Sunny strip' }).click();
  await expect(strip).toHaveCount(1); await expect(hours).toHaveCount(1);
  await expect(plant).toHaveCount(0); await expect(badge).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('button[title=Layers]').click();
  await page.locator('.layer-row', { hasText: 'Turkey corn' }).click();
  await expect(plant).toHaveCount(1); await expect(badge).toHaveCount(1);
  await expect(strip).toHaveCount(0); await expect(hours).toHaveCount(0);

  // Back on, from Layers this time.
  await page.keyboard.press('Escape');
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('show-names').check();
  await closeSheet(page);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  for (const back of [strip, hours, badge, plant]) await expect(back).toHaveCount(1);

  // A view only: hidden from the button, they're back on the next visit.
  await page.getByRole('button', { name: 'Hide names and badges' }).click();
  await expect(strip).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('toggle-names')).toHaveAttribute('aria-pressed', 'false');
  await expect(strip).toHaveCount(1);
});
