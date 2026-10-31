import { test, expect, type Page } from '@playwright/test';
import { addKind, addPlainShape, closeSheet, openFresh, tapFromCenter, zoomPct } from './helpers';

// Round 3's rough edges that testers meet first (Jason, Oct 31: "Go ahead on rough edges").

async function startPlacing(page: Page, name: string) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
}
const done = (page: Page) => page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();

test('a prompt says "Click" on a computer and "Tap" on a phone (Alex)', async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'note');
  const desktop = test.info().project.name === 'desktop';
  await expect(page.getByTestId('draw-banner')).toContainText(desktop ? 'Click where the note goes' : 'Tap where the note goes');
  await expect(page.getByTestId('draw-banner')).not.toContainText(desktop ? 'Tap' : 'Click');
});

test("after Create, Print's last options stay above its bar when it's scrolled to the end (Kim)", async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'rect');
  await closeSheet(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Print or save as PDF' }).click();
  const sheet = page.locator('.sheet').filter({ has: page.getByTestId('create-pdf') });
  await sheet.evaluate((s) => { s.scrollTop = s.scrollHeight; });
  await page.getByTestId('create-pdf').click();
  await expect(page.getByTestId('pdf-ready')).toBeVisible();
  // (The options' last line ends above the bar holding Create and its result.)
  const last = (await sheet.locator(':scope > :nth-child(2) > :last-child').boundingBox())!;
  const foot = (await sheet.locator('.sheet-foot').boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(foot.y + 1);
});

test("a row of what's in bloom selects those plants on the plan, the month kept (Bea)", async ({ page }) => {
  await openFresh(page);
  await startPlacing(page, 'Buttonbush');
  await tapFromCenter(page, -3, 0);
  await tapFromCenter(page, 3, 0);
  await done(page);
  await page.getByTestId('multi-bar').getByRole('button', { name: 'Deselect' }).click();
  await page.getByTestId('year-open').click();
  await page.getByTestId('year-slider').fill('7');
  await page.getByTestId('year-count').click();
  const row = page.getByTestId('year-list-row').filter({ hasText: 'Buttonbush' });
  await expect(row).toContainText('×2');
  await row.click();
  await expect(page.getByTestId('multi-bar').locator('.count')).toHaveText('2 selected');
  await expect(page.getByTestId('year-bar')).toBeVisible(); // (still in July)
  await expect(page.getByTestId('year-month')).toHaveText(/^Jul/);
});

test('the bar for plants just placed fits a small phone: closer, shorter, then its buttons as icons (round 3)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openFresh(page);
  await startPlacing(page, 'Tennessee coneflower');
  for (const x of [-3, 0, 3]) await tapFromCenter(page, x, 0);
  await done(page);
  const bar = page.getByTestId('multi-bar');
  await expect(bar).toBeVisible();
  await expect.poll(() => bar.evaluate((b) => b.scrollWidth <= b.clientWidth + 1)).toBe(true);
  // (Every button inside the bar, none cut off at its edge; their words still there for a screen reader.)
  const box = (await bar.boundingBox())!;
  for (const b of await bar.locator('button').all()) {
    const bb = (await b.boundingBox())!;
    expect(bb.x).toBeGreaterThanOrEqual(box.x - 1);
    expect(bb.x + bb.width).toBeLessThanOrEqual(box.x + box.width + 1);
  }
  await expect(bar.getByRole('button', { name: 'Edit' })).toBeVisible();
});

test('Layers counts shapes locked with their layer, and a layer says "1 locked shape" when one is locked on its own (Alex, Jordan)', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'rect');
  await page.getByRole('button', { name: /^Unlocked/ }).click(); // (lock this shape on its own)
  await closeSheet(page);
  await page.locator('button[title=Layers]').click();
  const found = page.locator('.role-row', { has: page.locator('.count', { hasText: 'locked shape' }) });
  await expect(found.locator('.count')).toHaveText(/· 1 · 1 locked shape$/);
  const row = page.locator(`.role-row[data-role-key=${await found.getAttribute('data-role-key')}]`);
  await expect(row.locator('[data-action=toggle-locked]')).toHaveAttribute('aria-pressed', 'false'); // (the layer's own lock: open)
  await expect(page.locator('.sheet-header .title')).toHaveText('Layers · 1 shape, 1 locked');
  // The layer locked: its row says nothing of the shape's own lock, and the count is the same.
  await row.locator('[data-action=toggle-locked]').click();
  await expect(row.locator('.count')).toHaveText(/· 1$/);
  await expect(page.locator('.sheet-header .title')).toHaveText('Layers · 1 shape, 1 locked');
});

test("a vine's band is hidden with what it climbs; its spot and name stay (Kim)", async ({ page }) => {
  await openFresh(page);
  await addKind(page, 'fence');
  for (const [x, y] of [[-6, -5], [6, -5]]) await tapFromCenter(page, x, y);
  await page.getByTestId('draw-bar').getByRole('button', { name: 'Done' }).click();
  await startPlacing(page, 'Carolina jessamine');
  const line = (await page.locator('#canvas-svg [data-role=line-hit]').first().boundingBox())!;
  const ppf = 24 * (await zoomPct(page)) / 100;
  await page.mouse.click(line.x + line.width / 2, line.y + line.height / 2 + ppf);
  await page.getByTestId('vine-offer').getByRole('button', { name: 'Climb it' }).click();
  await done(page);
  const band = page.locator('#canvas-svg [data-role=vine-band]');
  await expect(band).toHaveCount(1);
  await page.locator('button[title=Layers]').click();
  await page.locator('.role-row[data-role-key=boundary] [data-action=toggle-hidden]').click();
  await closeSheet(page);
  await expect(band).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=vine-reach]')).toHaveCount(0);
  await expect(page.locator('#canvas-svg [data-role=vine-spot]')).toHaveCount(1);
  // Shown again: the band too.
  await page.locator('button[title=Layers]').click();
  await page.locator('.role-row[data-role-key=boundary] [data-action=toggle-hidden]').click();
  await closeSheet(page);
  await expect(band).toHaveCount(1);
});
