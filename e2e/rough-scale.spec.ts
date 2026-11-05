import { test, expect, type Page } from '@playwright/test';
import { autoDialogs, closeSheet, openFresh } from './helpers';

// The "rough" checkbox when a photo's scale is set (Jason on #209, Nov 4: "We should still build the 'rough' checkbox
// during calibration so they get a reminder about it later"): kept with the photo (BgImage.roughScale), and said in
// Layers, by the same dot on its button and a flag beside the photo, with the way to set it again. On a phone and a
// computer. SHOTS_DIR, if set: where to save pictures of the box and of Layers (a phone, 412 px wide).

/** The open plan's photo as stored (the save waited for). */
const storedPhoto = (page: Page) => page.evaluate(() => new Promise<Record<string, unknown> | null>((resolve) => {
  const open = indexedDB.open('landscape-planner');
  open.onsuccess = () => {
    const db = open.result;
    const cur = db.transaction('kv').objectStore('kv').get('current');
    cur.onsuccess = () => {
      const p = db.transaction('projects').objectStore('projects').get(cur.result as string);
      p.onsuccess = () => { resolve(((p.result as { bgImage?: Record<string, unknown> } | undefined)?.bgImage) ?? null); db.close(); };
    };
  };
}));
const flagOf = async (page: Page) => (await storedPhoto(page))?.roughScale ?? 'none';
const shot = async (page: Page, name: string) => {
  const dir = process.env.SHOTS_DIR;
  if (dir && test.info().project.name === 'phone') await page.screenshot({ path: `${dir}/${name}.png` });
};

/** A and B tapped a quarter of the way in from the photo's sides: the box asking how far apart they are, up. */
async function tapAandB(page: Page) {
  const img = (await page.locator('#canvas-svg image').boundingBox())!;
  await page.mouse.click(img.x + img.width * 0.25, img.y + img.height * 0.5);
  await expect(page.locator('.mode-banner')).toContainText('second known point');
  await page.mouse.click(img.x + img.width * 0.75, img.y + img.height * 0.5);
  await expect(page.getByTestId('scale-box')).toBeVisible();
}

test('a scale set from a rough guess: the box asks, unticked; ticked, it\'s kept with the photo and Layers says "Rough scale", with the way to set it again; Undo takes it back with the scale', async ({ page }) => {
  autoDialogs(page);
  await openFresh(page);
  await page.getByTestId('start-photo').click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await expect(page.locator('.mode-banner')).toContainText('Calibrating');
  await tapAandB(page);
  const box = page.getByTestId('scale-box');
  const rough = box.getByTestId('scale-rough');
  await expect(rough).not.toBeChecked();
  await expect(box).toContainText('This length is a rough guess');
  await expect(box).toContainText('Layers will remind you to set the scale again once you’ve measured.');
  await page.getByTestId('scale-distance').fill('60');
  await box.getByText('This length is a rough guess').click(); // (its words tick it too)
  await expect(rough).toBeChecked();
  await expect(page.getByTestId('scale-distance')).toHaveValue('60'); // (ticking it redraws nothing: the length stays)
  // (Nothing in the box runs off a phone, and A and B still show below it.)
  const b = (await box.boundingBox())!, vw = page.viewportSize()!.width;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(vw);
  const a = (await page.locator('#canvas-svg [data-role=scale-point-a]').boundingBox())!;
  expect(a.y).toBeGreaterThan(b.y + b.height);
  await shot(page, 'calibration-checkbox');
  await page.getByTestId('scale-set').click();

  // The background sheet says so, beside its scale.
  await expect(page.getByTestId('bg-rough')).toHaveText('Rough scale');
  await expect(page.getByTestId('bg-scale')).toContainText('Set from a rough guess at a length: set it again once you’ve measured.');
  await shot(page, 'background-sheet');
  await closeSheet(page);
  // A dot on Layers, said to screen readers; in Layers, the flag and the way to set it again.
  await expect(page.getByTestId('layers-scale-dot')).toBeVisible();
  await expect(page.getByTestId('layers-btn')).toHaveAttribute('aria-label', 'Layers: the photo’s scale is a rough guess');
  await page.locator('button[title=Layers]').click();
  const layers = page.getByTestId('layers-bg');
  await expect(layers.getByTestId('layers-bg-rough')).toHaveText('Rough scale');
  await expect(layers.getByTestId('layers-bg-not-to-scale')).toHaveCount(0); // (never both)
  await expect(layers).toContainText('Its scale was set from a length you guessed.');
  await expect(layers.getByTestId('layers-bg-set-scale')).toHaveText('Set its scale again');
  await expect.poll(() => flagOf(page)).toBe(true);
  await expect(page.locator('.project-btn')).not.toContainText('Saving');
  await shot(page, 'layers-reminder');
  await closeSheet(page);
  // Nothing more: no notice about it.
  await expect(page.getByTestId('calibrate-notice')).toHaveCount(0);
  await expect(page.locator('#toast-action')).toHaveCount(0);

  // Undo takes it back with the scale: the photo's scale not set again, "Not to scale yet". Redo, rough again.
  await page.locator('button[title=Undo]').click();
  await expect(page.getByTestId('layers-btn')).toHaveAttribute('aria-label', 'Layers: the photo isn’t to scale yet');
  await expect.poll(() => flagOf(page)).toBe('none');
  await page.locator('button[title=Layers]').click();
  await expect(layers.getByTestId('layers-bg-not-to-scale')).toHaveText('Not to scale yet');
  await expect(layers.getByTestId('layers-bg-rough')).toHaveCount(0);
  await closeSheet(page);
  await page.locator('[title=Redo]').first().click();
  await expect(page.getByTestId('layers-btn')).toHaveAttribute('aria-label', 'Layers: the photo’s scale is a rough guess');
  await expect.poll(() => flagOf(page)).toBe(true);

  // Kept after a reload, and said nowhere else.
  await page.reload();
  await expect(page.getByTestId('layers-scale-dot')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('calibrate-notice')).toHaveCount(0);

  // Set again from Layers, not ticked (the box starts unticked again): gone, the dot too.
  await page.locator('button[title=Layers]').click();
  await layers.getByTestId('layers-bg-set-scale').click();
  await expect(page.locator('.mode-banner')).toContainText('first known point');
  await tapAandB(page);
  await expect(page.getByTestId('scale-rough')).not.toBeChecked();
  await page.getByTestId('scale-distance').fill('64');
  await page.getByTestId('scale-distance').press('Enter');
  await expect(page.getByTestId('bg-scale')).toContainText('Current scale:');
  await expect(page.getByTestId('bg-rough')).toHaveCount(0);
  await closeSheet(page);
  await expect(page.getByTestId('layers-scale-dot')).toHaveCount(0);
  await expect(page.getByTestId('layers-btn')).toHaveAttribute('aria-label', 'Layers');
  await expect.poll(() => flagOf(page)).toBe('none');
  await page.locator('button[title=Layers]').click();
  await expect(layers).toBeVisible();
  await expect(layers.getByTestId('layers-bg-rough')).toHaveCount(0);
  await expect(layers.getByTestId('layers-bg-set-scale')).toHaveCount(0);
});
