import { test, expect, type Page } from '@playwright/test';
import { addPlainShape, autoDialogs, closeSheet, field, openFilters, openFresh, placeOnceAtCenter } from './helpers';

const circleR = async (page: Page, label: string) =>
  Number(await page.locator('[data-shape-group]', { has: page.locator('text', { hasText: label }) }).locator('circle[data-shape-id]').getAttribute('r'));

test('add a plant from its tag, place it, and switch to full size', async ({ page }) => {
  const dialogs = autoDialogs(page);
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Limelight');
  const add = page.getByTestId('add-own-plant');
  await expect(add).toHaveText('+ Add “Limelight” as my plant');
  await add.click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Add a plant');
  await expect(page.getByTestId('pf-name')).toHaveValue('Limelight');
  await page.getByTestId('pf-name').fill("Hydrangea 'Limelight'");
  const spread = page.getByTestId('pf-spread');
  const spreadLabel = page.locator('.field', { has: spread }).locator('label');
  await expect(spreadLabel).toContainText('Spread (width), required');
  await page.getByTestId('pf-save').click();
  // What's missing shows on the field's own label, above it, where the keyboard that opens doesn't cover it.
  await expect(page.getByTestId('pf-spread-missing')).toContainText('enter one number or a range like 6-8');
  await expect(spread).toBeFocused();
  await expect(spread).toHaveAttribute('aria-invalid', 'true');
  await spread.fill('x');
  await expect(page.getByTestId('pf-spread-missing')).toHaveText(''); // (typing clears it)
  await page.getByTestId('pf-save').click();
  await expect(page.getByTestId('pf-spread-missing')).toContainText('couldn’t read that (see below)');
  await page.getByTestId('pf-spread-in').click();
  await expect(page.getByTestId('pf-spread-missing')).toHaveText(''); // (a unit switch reads it again: Save checks)
  await expect(spread).not.toHaveAttribute('aria-invalid', 'true');
  // The name, too: on its label, with the cursor.
  await page.getByTestId('pf-name').fill('');
  await page.getByTestId('pf-save').click();
  await expect(page.getByTestId('pf-name-missing')).toContainText('give the plant a name');
  await expect(page.getByTestId('pf-name')).toBeFocused();
  await expect(page.getByLabel(/Name, required/)).toHaveAttribute('aria-required', 'true'); // (the label names its field)
  await page.getByTestId('pf-name').fill("Hydrangea 'Limelight'");
  await expect(page.getByTestId('pf-name-missing')).toHaveText('');
  await page.getByTestId('pf-spread-ft').click();
  await expect(spread).toHaveAttribute('inputmode', 'decimal'); // number pad on phones
  // Inches: the number, then "in".
  await spread.fill('36');
  await page.getByTestId('pf-spread-in').click();
  await expect(page.locator('.field', { has: spread }).locator('.hint')).toContainText('Read as 3 ft');
  await page.getByTestId('pf-spread-ft').click();
  await spread.fill('6-8');
  await expect(spread).toBeFocused(); // typing never rebuilds the form (Android keyboard)
  await expect(page.locator('.field', { has: spread }).locator('.hint')).toContainText('Read as 6 ft to 8 ft');
  await page.locator('.role-chip', { hasText: 'Full sun' }).click();
  await page.locator('.role-chip', { hasText: 'Part sun' }).click();
  await page.getByTestId('pf-save').click();
  await placeOnceAtCenter(page);

  // Placed at typical size (7 ft spread = 3.5 ft radius = 84 px at 100%), selected, with its full-size ring.
  await expect(page.locator('.sel-pill .name')).toHaveText("Hydrangea 'Limelight'");
  expect(await circleR(page, 'Limelight')).toBe(84);
  await expect(page.locator('#canvas-svg [data-role=full-ring]')).toHaveAttribute('r', '96');
  await expect(page.locator('#toast')).toContainText('dashed ring is full size');
  // (Above the chip, clear of its Edit and More.)
  const toastBox = (await page.locator('#toast').boundingBox())!, pillBox = (await page.locator('.sel-pill').boundingBox())!;
  expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(pillBox.y);

  // It's in the picker under My plants.
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('lime');
  await expect(page.locator('.list-heading').first()).toHaveText(/^My plants \(1\)/);
  await expect(page.locator('.proj-row', { hasText: 'Limelight' }).locator('.mine-badge')).toHaveText('Mine');
  // Without a search, My plants starts folded away; opened, it stays open; a search shows its matches anyway.
  await page.getByTestId('plant-search').fill('');
  await expect(page.getByTestId('my-plants-fold')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.proj-row .mine-badge')).toHaveCount(0);
  await page.getByTestId('my-plants-fold').click();
  await expect(page.locator('.proj-row', { hasText: 'Limelight' }).filter({ has: page.locator('.mine-badge') })).toBeVisible(); // (the catalog's Limelight hydrangea shows too)
  await closeSheet(page);
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('my-plants-fold')).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId('my-plants-fold').click();
  await page.getByTestId('plant-search').fill('lime');
  await expect(page.locator('.proj-row', { hasText: 'Limelight' }).filter({ has: page.locator('.mine-badge') })).toBeVisible();
  // Filters apply to it too: it takes full sun and part shade, so asked for shade, it's left out.
  await openFilters(page);
  const sun = page.locator('.sheet select').filter({ has: page.locator('option', { hasText: 'Any sun' }) });
  await sun.selectOption('Shade');
  await expect(page.locator('.proj-row', { hasText: 'Limelight' }).filter({ has: page.locator('.mine-badge') })).toHaveCount(0);
  await sun.selectOption('Part');
  await expect(page.locator('.proj-row', { hasText: 'Limelight' }).filter({ has: page.locator('.mine-badge') })).toBeVisible();
  await sun.selectOption('');
  await page.getByTestId('plant-search').fill('');
  await closeSheet(page);

  // Layers: draw plants at full size.
  await page.locator('button[title=Layers]').click();
  await page.getByTestId('plant-size').getByRole('button', { name: 'Full size' }).click();
  await expect.poll(() => dialogs.at(-1)).toContain('Redraw 1 plant at full size?');
  await closeSheet(page);
  expect(await circleR(page, 'Limelight')).toBe(96);
  await expect(page.locator('#canvas-svg [data-role=full-ring]')).toHaveCount(0);

  // The library survives a reload.
  await page.waitForTimeout(600);
  await page.reload();
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('lime');
  await expect(page.locator('.proj-row', { hasText: 'Limelight' }).filter({ has: page.locator('.mine-badge') })).toHaveCount(1);
});

test('copy a catalog plant as your own cultivar', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill("Heuchera 'Autumn Bride'");
  await page.locator('.proj-row', { hasText: "Heuchera 'Autumn Bride'" }).first().getByRole('button', { name: /Copy as my plant/ }).click();
  await expect(page.locator('.sheet .banner')).toContainText("Starting from Heuchera 'Autumn Bride'");
  await expect(page.getByTestId('pf-botanical')).toHaveValue('Heuchera villosa');
  await expect(page.getByTestId('pf-species')).toBeChecked(); // (a cultivar of it: the same species)
  await expect(page.getByTestId('pf-spread')).not.toHaveValue('');
  await page.getByTestId('pf-name').fill("Heuchera 'Caramel'");
  await page.getByTestId('pf-save').click();
  await expect(page.locator('.sheet-header .title')).toContainText('Plant Picker');
  await page.getByTestId('plant-search').fill('Caramel');
  await page.locator('.proj-row', { hasText: 'Caramel' }).locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);
  await expect(page.locator('.sel-pill .name')).toHaveText("Heuchera 'Caramel'");
});

test("a copy of a catalog plant starts with its name empty and no flower colors ticked, its size, sun, type and bloom filled in; one of your own copied, or edited, as it was (Jason, Nov 1, the UI review)", async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill("Heuchera 'Autumn Bride'"); // (white flowers, September to October)
  await page.locator('.proj-row', { hasText: "Heuchera 'Autumn Bride'" }).first().getByRole('button', { name: /Copy as my plant/ }).click();
  const name = page.getByTestId('pf-name');
  await expect(name).toHaveValue('');
  await expect(name).toHaveAttribute('placeholder', 'e.g. Grandma’s peony');
  await expect(page.getByTestId('pf-from-banner')).toContainText('Name it, and change what differs');
  await expect(page.locator('[data-testid=pf-flower].on')).toHaveCount(0);
  await expect(page.getByTestId('pf-spread')).not.toHaveValue('');
  await expect(page.getByTestId('pf-form')).toHaveValue('Perennial');
  await expect(page.locator('.sheet details select').first()).toHaveValue('9');
  // Named and given a color, it's the person's own: copied, or edited, both kept.
  await name.fill("Heuchera 'Caramel'");
  await page.locator('[data-testid=pf-flower][data-color=pink]').click();
  await page.getByTestId('pf-save').click();
  await page.getByTestId('add-own-plant').click();
  await name.fill(''); // (the picker's search, put in as its name)
  await page.getByTestId('pf-from').fill('Caramel');
  await page.getByTestId('pf-from-hit').filter({ hasText: 'Mine' }).first().click();
  await expect(name).toHaveValue("Heuchera 'Caramel'");
  await expect(page.locator('[data-testid=pf-flower].on')).toHaveAttribute('data-color', 'pink');
  await page.locator('.sheet-header').getByRole('button', { name: 'Back to the plant list' }).click();
  await page.getByTestId('plant-search').fill('Caramel');
  await page.locator('.proj-row', { hasText: 'Caramel' }).first().getByRole('button', { name: /Edit/ }).click();
  await expect(name).toHaveValue("Heuchera 'Caramel'");
  await expect(page.locator('[data-testid=pf-flower].on')).toHaveAttribute('data-color', 'pink');
});

test('a plant copied from the catalog isn\'t offered as "now in the catalog" as the plant it came from (the UI review)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('peony');
  await page.locator('.proj-row', { hasText: 'Paeonia – Herbaceous Types' }).first().getByRole('button', { name: /Copy as my plant/ }).click();
  // (Its name starts empty, to type: here, the catalog's own, as someone might.)
  await expect(page.getByTestId('pf-name')).toHaveValue('');
  await page.getByTestId('pf-name').fill('Paeonia – Herbaceous Types');
  await page.getByTestId('pf-save').click();
  await expect(page.locator('.sheet-header .title')).toContainText('Plant Picker');
  const mine = page.locator('.proj-row', { hasText: 'Paeonia – Herbaceous Types' }).filter({ has: page.locator('.mine-badge') });
  for (const reload of [false, true]) {
    if (reload) { await page.waitForTimeout(600); await page.reload(); await page.locator('.tool-btn.plants').click(); } // (kept with the plant)
    await page.getByTestId('plant-search').fill('Herbaceous');
    await expect(mine).toHaveCount(1);
    await expect(page.getByTestId('my-plants-fold')).toHaveText(/^My plants \(1\)$/);
    await expect(page.getByTestId('now-in-catalog')).toHaveCount(0);
  }
});

test('closing Add a plant or a copy with its × goes back to the picker, the search as it was (the UI review; Owen)', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('shade flowers');
  await page.getByTestId('add-own-plant').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Add a plant');
  await page.locator('.sheet-header').getByRole('button', { name: 'Back to the plant list' }).click();
  await expect(page.locator('.sheet-header .title')).toContainText('Plant Picker');
  await expect(page.getByTestId('plant-search')).toHaveValue('shade flowers');
  await expect(page.getByTestId('add-own-plant')).toBeVisible();
  // A copy of a catalog plant, likewise.
  await page.getByTestId('plant-search').fill('Buttonbush');
  await page.locator('.proj-row', { hasText: 'Buttonbush' }).first().getByRole('button', { name: /Copy as my plant/ }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Add a plant');
  await page.locator('.sheet-header').getByRole('button', { name: 'Back to the plant list' }).click();
  await expect(page.getByTestId('plant-search')).toHaveValue('Buttonbush');
});

test('turn a labeled circle into a plant, then edit the plant', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await addPlainShape(page, 'circle');
  await field(page, 'Label').fill('Mystery shrub');
  await page.getByTestId('plant-link').getByRole('button', { name: 'Link to a plant…' }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Link to a plant');
  await page.getByTestId('plant-search').fill('Ninebark');
  await page.getByTestId('add-own-plant').click();
  // Its spread starts as the circle's width (4 ft), so linking keeps the size drawn; the tag's can replace it.
  await expect(page.getByTestId('pf-spread')).toHaveValue('4');
  await expect(page.locator('.field', { has: page.getByTestId('pf-spread') }).locator('.hint')).toContainText('From the circle you’re linking');
  await page.getByTestId('pf-spread').fill('5 ft');
  await expect(page.getByTestId('pf-save')).toHaveText('Save and use for this circle');
  await page.getByTestId('pf-save').click();
  // The circle is now that plant, at its size, its properties open (as after picking from the list).
  await expect(page.getByTestId('plant-size-note')).toContainText('Its spread: 5 ft');
  await expect(field(page, 'Label')).toHaveValue('Ninebark');
  await expect(field(page, 'Spread (ft)')).toHaveValue('5');

  // Editing the library plant offers to resize it on the plan.
  await page.getByRole('button', { name: 'Edit "Ninebark" in My plants' }).click();
  await page.getByTestId('pf-spread').fill('8 ft');
  await page.getByTestId('pf-save').click();
  await page.locator('.sel-pill button.edit').click();
  await expect(field(page, 'Spread (ft)')).toHaveValue('8');

  // Sized by hand: a reset button appears.
  await field(page, 'Spread (ft)').fill('6');
  await closeSheet(page);
  await page.locator('.sel-pill button.edit').click();
  await page.getByTestId('reset-size').click();
  await expect(field(page, 'Spread (ft)')).toHaveValue('8');
});

test('a new plant made for a circle keeps the circle\'s size, as the form shows it', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await addPlainShape(page, 'circle');
  await field(page, 'Label').fill('Camellia');
  await field(page, 'Diameter (ft)').fill('3.25'); // (measured by hand: not on the half foot)
  await page.getByTestId('plant-link').getByRole('button', { name: 'Link to a plant…' }).click();
  await page.getByTestId('plant-search').fill('Rose camellia');
  await page.getByTestId('add-own-plant').click();
  const spread = page.getByTestId('pf-spread');
  await expect(spread).toHaveValue('3.5'); // (as linking draws it: the radius to the quarter foot)
  const hint = page.locator('.field', { has: spread }).locator('.hint');
  await expect(hint).toContainText('From the circle you’re linking');
  await page.getByTestId('pf-spread-in').click();
  await expect(hint).not.toContainText('From the circle'); // (3.5 inches isn't the circle)
  await page.getByTestId('pf-spread-ft').click();
  await page.getByTestId('pf-save').click();
  await expect(field(page, 'Spread (ft)')).toHaveValue('3.5');
});

test('a plant of mine the catalog now has: compare, switch (placed plants follow), undo', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill("Hydrangea 'Limelight'");
  await page.getByTestId('add-own-plant').click();
  await page.getByTestId('pf-spread').fill('5');
  await page.getByTestId('pf-save').click();
  await placeOnceAtCenter(page);
  await expect(page.locator('.sel-pill .name')).toHaveText("Hydrangea 'Limelight'");
  // The picker says it's in the catalog now, on its row.
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('my-plants-fold').click(); // (My plants starts folded)
  const offer = page.getByTestId('now-in-catalog');
  await expect(offer).toContainText("Now in the catalog as Hydrangea 'Limelight'");
  await expect(page.getByTestId('my-plants-fold')).toContainText('1 now in the catalog');
  await offer.getByTestId('switch-offer').click();
  const sheet = page.getByTestId('switch-sheet');
  await expect(sheet.locator('.sheet-header .title')).toHaveText('Now in the catalog');
  await expect(sheet.locator('.switch-row.differs', { hasText: 'Spread' })).toContainText('5 ft');
  await expect(sheet).toContainText('1 placed in this plan');
  await expect(sheet.getByTestId('switch-resize')).toBeChecked();
  await sheet.getByTestId('switch-go').click();
  await expect(page.locator('#toast-action')).toContainText("Switched to Hydrangea 'Limelight' (1 placed here)");
  // No longer listed as mine; the catalog's plant is.
  await page.getByTestId('plant-search').fill('limelight');
  await expect(page.locator('.proj-row .mine-badge')).toHaveCount(0);
  await expect(page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Hydrangea 'Limelight'$/ }) })).toHaveCount(1);
  // Undo: mine again, the placed plant back to it.
  await page.locator('#toast-action').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.proj-row .mine-badge')).toHaveCount(1);
});

test('a plant of mine: its flower colors as chips, kept without bloom months, the first chosen drawn (Jason, Oct 30)', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await addPlainShape(page, 'circle');
  await page.getByTestId('plant-link').getByRole('button', { name: 'Link to a plant…' }).click();
  await page.getByTestId('plant-search').fill('Mystery rose');
  await page.getByTestId('add-own-plant').click();
  const chip = (c: string) => page.locator(`[data-testid=pf-flower][data-color=${c}]`);
  const hint = page.getByTestId('pf-flowers-hint');
  await expect(page.getByTestId('pf-flowers').locator('.color-chip.on')).toHaveCount(0);
  await chip('pink').click();
  await chip('white').click();
  await expect(chip('pink')).toHaveAttribute('aria-pressed', 'true');
  // (No bloom months yet: said beside the chips, and saved all the same.)
  await expect(hint).toContainText('only in its bloom months');
  await page.getByTestId('pf-save').click();
  await expect(page.locator('.sheet-header .title')).not.toHaveText('Add a plant');

  // Edited again: both kept; with a bloom month, the hint says which is drawn.
  await page.getByRole('button', { name: 'Edit "Mystery rose" in My plants' }).click();
  await expect(chip('pink')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip('white')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip('blue')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.sheet details summary', { hasText: 'Bloom and notes' }).click();
  await page.locator('.sheet details select').first().selectOption('5');
  await expect(hint).toContainText('Drawn in pink, the first chosen');
  await chip('pink').click(); // (off: white is the one drawn)
  await expect(hint).toHaveText('');
  await page.getByTestId('pf-save').click();
  await page.locator('.sel-pill button.edit').click();
  await page.getByRole('button', { name: 'Edit "Mystery rose" in My plants' }).click();
  await expect(page.getByTestId('pf-flowers').locator('.color-chip.on')).toHaveText(['White']);
});
