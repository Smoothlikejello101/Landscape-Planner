import { test, expect, type Page } from '@playwright/test';
import { openFresh, placeOnceAtCenter } from './helpers';

// The Plant list (Jason, Nov 1, from the UI review: no way to get a shopping list out of the app, and recording what
// got planted took a lasso and five taps per group, with no date). A row a kind, To buy · Planted · Existing, a tick per
// kind kept with the plan, Mark planted with Undo, Share as text and a big-type page to print.

const base = { opacity: 0.65, locked: false };
const bed = (id: string, label: string, x: number) => ({ ...base, id, type: 'rect', x, y: 0, width: 20, height: 10, rotation: 0, color: '#92400e', label, role: 'bed' });
let n = 0;
const plant = (plantId: string, label: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  ({ ...base, id: `p${++n}`, type: 'circle', x, y, radius: 1, color: '#16a34a', label, role: 'plant', plantId, status: 'planned', ...extra });
const shapes = [
  bed('front', 'Front bed', 0), bed('side', 'Side bed', 30),
  ...[2, 5, 8, 11].map((x) => plant('aquilegia-canadensis', 'Wild columbine', x, 3)),
  plant('aquilegia-canadensis', 'Wild columbine', 33, 3),
  ...[14, 17].map((x) => plant('ilex-vomitoria-dwarf', "Yaupon 'Dwarf'", x, 7)),
  ...[34, 38, 42].map((x) => plant('symphyotrichum-lateriflorum', 'Calico aster', x, 7)),
  ...[2, 5, 8].map((x) => plant('asclepias-tuberosa', 'Butterfly milkweed', x, 7, { status: 'planted', plantedOn: '2026-10-30' })),
  plant('ilex-vomitoria', 'Yaupon', 60, 20, { status: 'existing' }),
  plant('symphyotrichum-lateriflorum', 'Calico aster', 45, 3, { status: 'gone' }),
  plant('buxus-green-velvet-microphylla-types', "Boxwood 'Green Velvet'", 46, 8),
  plant('buxus-green-velvet-microphylla-types', "Boxwood 'Green Velvet'", 48, 8),
];
const file = { format: 'landscape-planner-project', version: 1, project: { name: 'Front garden', lastModified: 1, data: { shapes } } };

async function openPlan(page: Page) {
  await openFresh(page);
  await page.locator('.project-btn').click();
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'front.fullgrown.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('.project-btn .pname')).toHaveText('Front garden');
}
const list = (page: Page) => page.getByTestId('plant-list');
const row = (page: Page, group: string, name: string) => list(page).locator(`[data-testid=pl-row][data-group=${group}]`).filter({ has: page.getByTestId('pl-name').getByText(name, { exact: true }) });

test('the Plant list: a row a kind, To buy · Planted · Existing, with totals; opened beside Through the year and from ⋮ (Jason, Nov 1)', async ({ page }) => {
  await openPlan(page);
  // One tap from the plan: beside Through the year.
  const open = page.getByTestId('plant-list-open');
  await expect(open).toHaveAttribute('aria-label', 'Plant list');
  const year = (await page.getByTestId('year-open').boundingBox())!, btn = (await open.boundingBox())!;
  expect(btn.y).toBeGreaterThanOrEqual(year.y + year.height);
  expect(btn.y).toBeLessThan(year.y + year.height + 12); // (next below it)
  await open.click();
  await expect(list(page).locator('.sheet-header .title')).toHaveText('Plant list');
  await expect(page.getByTestId('pl-totals')).toHaveText('12 plants to buy, 4 kinds');
  await expect(page.getByTestId('pl-group-buy').locator('.pl-head')).toHaveText('To buy (12)');
  await expect(list(page).locator('[data-group=buy] [data-testid=pl-name]')).toHaveText(["Boxwood 'Green Velvet'", 'Calico aster', 'Wild columbine', "Yaupon 'Dwarf'"]);
  const columbine = row(page, 'buy', 'Wild columbine');
  await expect(columbine.getByTestId('pl-count')).toHaveText(/^×\s5$/);
  await expect(columbine.getByTestId('pl-bot')).toHaveText('Aquilegia canadensis');
  await expect(columbine.getByTestId('pl-facts')).toHaveText(/ft tall.* · Front bed, Side bed$/);
  await expect(row(page, 'buy', "Yaupon 'Dwarf'").getByTestId('pl-bot')).toHaveText("Ilex vomitoria 'Dwarf'");
  // Planted, with its date; Existing; the gone aster left out.
  await expect(page.getByTestId('pl-group-planted').locator('.pl-head')).toHaveText('Planted (3)');
  await expect(row(page, 'planted', 'Butterfly milkweed').getByTestId('pl-planted-on')).toHaveText('Planted Oct 30');
  await expect(row(page, 'existing', 'Yaupon').getByTestId('pl-facts')).toHaveText(/Not in a bed$/);
  await expect(row(page, 'buy', 'Calico aster').getByTestId('pl-count')).toHaveText(/^×\s3$/);
  // No "tap" or "click" in what phones and computers both show.
  await expect(list(page)).not.toContainText(/\b(tap|click)/i);
  await list(page).locator('.sheet-header .iconbtn').click();
  // And from ⋮, by name.
  await page.locator('button[title=More]').click();
  await page.getByTestId('menu-plant-list').click();
  await expect(page.getByTestId('pl-totals')).toBeVisible();
});

test('a tick per kind is kept with the plan: after a reload, in its file, and the totals say what is bought (Jason, Nov 1)', async ({ page }) => {
  await openPlan(page);
  await page.getByTestId('plant-list-open').click();
  const yaupon = row(page, 'buy', "Yaupon 'Dwarf'");
  await yaupon.getByTestId('pl-tick').click();
  await expect(yaupon.getByTestId('pl-tick')).toHaveAttribute('aria-checked', 'true');
  await expect(yaupon.getByTestId('pl-bought')).toHaveText('Bought');
  await expect(page.getByTestId('pl-totals')).toHaveText('12 plants to buy, 4 kinds · 2 bought');
  await page.waitForTimeout(400);
  await page.reload();
  await page.getByTestId('plant-list-open').click();
  await expect(yaupon.getByTestId('pl-tick')).toHaveAttribute('aria-checked', 'true');
  // In the plan's file, by kind.
  await list(page).locator('.sheet-header .iconbtn').click();
  await page.locator('.project-btn').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.proj-row', { hasText: 'Front garden' }).getByRole('button', { name: /^Save Front garden/ }).click()]);
  const saved = JSON.parse(await (await download.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8')));
  expect(saved.project.data.bought).toEqual({ 'ilex-vomitoria-dwarf': { n: 2, at: expect.any(Number) } });
  // Unticked: none.
  await page.locator('.sheet-header .iconbtn').click();
  await page.getByTestId('plant-list-open').click();
  await yaupon.getByTestId('pl-tick').click();
  await expect(yaupon.getByTestId('pl-tick')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('pl-totals')).toHaveText('12 plants to buy, 4 kinds');
});

test("Mark planted, once bought: the kind's plants go to Planted with today's date, as one step Undo brings back (Jason, Nov 1)", async ({ page }) => {
  await openPlan(page);
  await page.getByTestId('plant-list-open').click();
  // Nothing bought yet: no Mark planted, and a line says what the ticks are for.
  await expect(page.getByTestId('pl-mark-planted')).toHaveCount(0);
  await expect(page.getByTestId('pl-how')).toHaveText('Tick each kind as you buy it. Mark planted then records the day it goes in.');
  await row(page, 'buy', 'Wild columbine').getByTestId('pl-tick').click();
  await expect(page.getByTestId('pl-how')).toHaveCount(0);
  await row(page, 'buy', 'Wild columbine').getByTestId('pl-mark-planted').click();
  const day = await page.evaluate(() => new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  await expect(row(page, 'planted', 'Wild columbine').getByTestId('pl-planted-on')).toHaveText(`Planted ${day}`);
  await expect(row(page, 'buy', 'Wild columbine')).toHaveCount(0);
  await expect(page.getByTestId('pl-totals')).toHaveText('7 plants to buy, 3 kinds');
  await expect(page.locator('#toast-action')).toContainText('Wild columbine: 5 planted today.');
  await page.locator('#toast-action').getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'buy', 'Wild columbine').getByTestId('pl-count')).toHaveText(/^×\s5$/);
  await expect(row(page, 'buy', 'Wild columbine').getByTestId('pl-bought')).toHaveText('Bought'); // (the tick back as it was)
  await expect(row(page, 'planted', 'Wild columbine')).toHaveCount(0);
  await expect(page.getByTestId('pl-totals')).toHaveText('12 plants to buy, 4 kinds · 5 bought');
  // Done again, and the sheet closed: the plan's own Undo takes it back too.
  await row(page, 'buy', 'Wild columbine').getByTestId('pl-mark-planted').click();
  await list(page).locator('.sheet-header .iconbtn').click();
  await page.locator('button[title=Undo]').click();
  await page.getByTestId('plant-list-open').click();
  await expect(row(page, 'buy', 'Wild columbine').getByTestId('pl-bought')).toHaveText('Bought');
  await list(page).locator('.sheet-header .iconbtn').click();
  // One more placed since it was ticked: 5 of 6 bought, and Mark 5 planted leaves one to buy.
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Wild columbine');
  await page.locator('.sheet .proj-row', { hasText: 'Wild columbine' }).first().locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);
  await page.getByTestId('plant-list-open').click();
  await expect(row(page, 'buy', 'Wild columbine').getByTestId('pl-bought')).toHaveText('5 of 6 bought');
  await expect(row(page, 'buy', 'Wild columbine').getByTestId('pl-tick')).toHaveAttribute('aria-checked', 'mixed');
  await row(page, 'buy', 'Wild columbine').getByTestId('pl-mark-planted').filter({ hasText: 'Mark 5 planted' }).click();
  await expect(row(page, 'buy', 'Wild columbine').getByTestId('pl-count')).toHaveText(/^×\s1$/);
  await expect(row(page, 'buy', 'Wild columbine').getByTestId('pl-tick')).toHaveAttribute('aria-checked', 'false');
  await expect(row(page, 'planted', 'Wild columbine').getByTestId('pl-count')).toHaveText(/^×\s5$/);
});

test('Share as text on a phone, Copy as text on a computer: the plan, its totals and a line a kind (Jason, Nov 1)', async ({ page }, info) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: unknown; __copied?: string };
    if (navigator.maxTouchPoints > 0) {
      Object.defineProperty(navigator, 'share', { value: async (d: unknown) => { w.__shared = d; }, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    }
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => { w.__copied = t; } }, configurable: true });
  });
  await openPlan(page);
  await page.getByTestId('plant-list-open').click();
  await row(page, 'buy', "Yaupon 'Dwarf'").getByTestId('pl-tick').click();
  const phone = info.project.name === 'phone';
  await expect(page.getByTestId('pl-share')).toHaveText(phone ? 'Share as text' : 'Copy as text');
  await page.getByTestId('pl-share').click();
  let text: string;
  if (phone) {
    const d = await (await page.waitForFunction(() => (window as unknown as { __shared?: { title: string; text: string } }).__shared)).jsonValue() as { title: string; text: string };
    expect(d.title).toBe('Front garden: plant list');
    text = d.text;
  } else text = await (await page.waitForFunction(() => (window as unknown as { __copied?: string }).__copied)).jsonValue() as string;
  if (!phone) await expect(page.locator('#toast')).toContainText('The list is copied');
  const lines = text.split('\n');
  expect(lines.slice(0, 4)).toEqual(['Front garden: plant list', '12 plants to buy, 4 kinds · 2 bought', '', 'To buy']);
  expect(lines.find((l) => l.startsWith("☑ Yaupon 'Dwarf' × 2 · Ilex vomitoria 'Dwarf' · "))).toMatch(/ · Front bed$/);
  expect(lines.find((l) => l.startsWith('☐ Wild columbine × 5 · Aquilegia canadensis'))).toMatch(/Front bed, Side bed$/);
  expect(lines).toContain('Planted');
  expect(lines.find((l) => l.startsWith('• Butterfly milkweed × 3 (Oct 30)'))).toBeTruthy();
});

test('Print list: one Letter page in big type, to download (Jason, Nov 1)', async ({ page }) => {
  await openPlan(page);
  await page.getByTestId('plant-list-open').click();
  await page.getByTestId('pl-print').click();
  await expect(page.getByTestId('pl-pdf-ready')).toHaveText(/^Ready: front-garden-plant-list-\d{4}-\d{2}-\d{2}\.pdf · 1 page$/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pl-download-pdf').click()]);
  expect(download.suggestedFilename()).toMatch(/^front-garden-plant-list-\d{4}-\d{2}-\d{2}\.pdf$/);
  const pdf = Buffer.concat(await (await download.createReadStream()).toArray());
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  // A tick after: the PDF made before is let go, not offered as ready.
  await row(page, 'buy', 'Calico aster').getByTestId('pl-tick').click();
  await expect(page.getByTestId('pl-pdf-ready')).toHaveCount(0);
});

test('the Plant list reads on a 360 × 640 phone and on a computer: nothing cut or off the side, ticks finger-sized, counts in a column (Jason, Nov 1)', async ({ page }) => {
  await openPlan(page);
  for (const size of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    await page.reload();
    await expect(page.locator('.project-btn .pname')).toHaveText('Front garden');
    // The button sits in the plan's column, clear of the bar at the bottom.
    const btn = (await page.getByTestId('plant-list-open').boundingBox())!;
    const bar = await page.locator('.bottom-toolbar').first().boundingBox();
    if (bar) expect(btn.y + btn.height).toBeLessThanOrEqual(bar.y);
    await page.getByTestId('plant-list-open').click();
    const sheet = list(page);
    await expect(sheet.locator('[data-testid=pl-row]').first()).toBeVisible();
    expect(await sheet.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    const box = (await sheet.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(Math.min(size.width, 640) + 1);
    for (const r of await sheet.locator('[data-testid=pl-row][data-group=buy]').all()) {
      const tick = (await r.getByTestId('pl-tick').boundingBox())!;
      expect(Math.min(tick.width, tick.height)).toBeGreaterThanOrEqual(44);
      const name = (await r.getByTestId('pl-name').boundingBox())!, count = (await r.getByTestId('pl-count').boundingBox())!;
      expect(count.x).toBeGreaterThanOrEqual(name.x + name.width - 1); // (right of the name)
      expect(count.x + count.width).toBeLessThanOrEqual(box.x + box.width);
      // (Names whole: wrapped, never cut.)
      expect(await r.getByTestId('pl-name').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    }
    // The counts line up, down a column.
    const xs = await sheet.locator('[data-group=buy] [data-testid=pl-count]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
    expect(new Set(xs).size).toBe(1);
    // Share and Print in view at the bottom.
    for (const id of ['pl-share', 'pl-print']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(size.height);
    }
    await page.screenshot({ path: `test-results/plant-list-${size.width}x${size.height}.png` });
  }
});

test('"In this plan" counts the plan\'s plants, "× 5" a row, and the bloom calendar shows a variety\'s whole name (the UI review, quick win #22)', async ({ page }) => {
  await openPlan(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('in-plan').click();
  await expect(page.locator('.sheet')).toContainText('16 plants, 6 kinds in this plan');
  const columbine = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Wild columbine/ }) });
  await expect(columbine.getByTestId('in-plan-count')).toHaveText(/^\s*×\s5$/);
  await page.getByTestId('in-plan').click();
  await expect(page.getByTestId('in-plan-count')).toHaveCount(0); // (only in "In this plan")
  await page.locator('.sheet-header .iconbtn').first().click();
  await page.setViewportSize({ width: 360, height: 640 });
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Bloom calendar' }).click();
  const boxwood = page.locator('.bloom-name').filter({ hasText: "Boxwood 'Green Velvet'" }).first();
  await expect(boxwood).toBeVisible();
  // Whole: no part of it cut off, ×2 with it.
  expect(await boxwood.evaluate((e) => e.scrollWidth <= e.clientWidth + 1 && e.textContent!.includes("Boxwood 'Green Velvet' ×2"))).toBe(true);
});
