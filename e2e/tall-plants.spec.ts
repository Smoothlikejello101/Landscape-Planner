import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { closeSheet, field, openExport, shapeCount } from './helpers';

// Tall plants (Jason, Nov 4, answering the options page: "1) D 2) C by default, but with a printing option for same as
// on screen with numbered dots. 3) yes, maybe with a few height options as long as it doesn't confuse the layers page too
// much"). On the screen every plant is solid, tall ones like any other; a plant under one is pinned, and selecting it
// makes what covers it see-through until it's let go. Layers can see through every tall plant at once, from a height.
// On paper and in pictures, a tall plant is faded only where it covers a shorter one, or, chosen in Print, drawn as on
// the screen with the plants under it numbered dots and a key: a choice kept with the plan since Nov 4 (Jason: "Add the
// storage to keep this print option to the plan"), as its other print settings are.

const base = { color: '#16a34a', opacity: 0.65, locked: false };
const plant = (id: string, plantId: string, label: string, x: number, y: number, radius: number) => ({ ...base, id, type: 'circle', role: 'plant', plantId, label, x, y, radius });
// A buttonbush (a shrub, 5 ft and up) with a creeping phlox under its middle; a mountain mint (3½ ft) beside it.
const BED = [
  { ...base, id: 'bed', type: 'rect', role: 'bed', label: 'Back bed', x: -4, y: -4, width: 14, height: 8, rotation: 0, color: '#92400e' },
  plant('bb', 'cephalanthus-occidentalis', 'Buttonbush', 0, 0, 2.5), plant('ph', 'phlox-stolonifera', 'Creeping phlox', 0.5, 0.3, 0.75),
  plant('mint', 'pycnanthemum-muticum', 'Mountain mint', 6, 0, 1.25),
];

/** The plan, put in place before the app opens, at 125% (pins at their full size), the buttonbush in the middle. */
async function openPlan(page: Page, shapes: object[] = BED) {
  await page.addInitScript((shapes) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes, zoom: 1.25, offsetX: -6, offsetY: -8 }));
  }, shapes);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
  // (The catalog in, and the plan drawn again with the plants' heights: as e2e/badges.spec.ts waits.)
  await expect(page.getByTestId('warnings-btn')).not.toHaveAttribute('data-state', 'checking');
}
const look = (page: Page, id: string) => page.locator(`#canvas-svg [data-shape-group="${id}"] [data-role=plant-look]`);
const mark = (page: Page, id: string) => page.locator(`#canvas-svg g[data-role=hidden-over] [data-rim-of="${id}"]`);
const seeThrough = async (page: Page, id: string) => (await look(page, id).getAttribute('data-see-through')) === 'true';
async function tapAt(page: Page, p: { x: number; y: number }) {
  await page.waitForTimeout(450); // (not a double tap)
  await page.mouse.click(p.x, p.y);
}
async function middle(page: Page, selector: string) {
  const b = (await page.locator(selector).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('a tall plant is solid like any other; a plant under it is pinned, and selecting it sees through what covers it until it\'s let go', async ({ page }) => {
  await openPlan(page);
  await expect(look(page, 'bb')).toHaveCount(1);
  expect(await seeThrough(page, 'bb')).toBe(false);
  expect(await seeThrough(page, 'mint')).toBe(false);
  await expect(mark(page, 'ph')).toHaveAttribute('data-mark', 'pin');
  // Its pin, tapped: the phlox selected, the buttonbush over it see-through, the phlox ringed as selected (white and
  // black, over everything: Jason, Nov 6).
  await tapAt(page, await middle(page, '#canvas-svg [data-pin-of="ph"]'));
  await expect(page.locator('.sel-pill .name')).toHaveText('Creeping Phlox');
  await expect(look(page, 'bb')).toHaveAttribute('data-see-through', 'true');
  await expect(mark(page, 'ph')).toHaveAttribute('data-mark', 'selected');
  // Let go: solid again, the pin back.
  await page.keyboard.press('Escape');
  await expect(page.locator('.sel-pill')).toHaveCount(0);
  await expect.poll(() => seeThrough(page, 'bb')).toBe(false);
  await expect(mark(page, 'ph')).toHaveAttribute('data-mark', 'pin');
  // The buttonbush itself selected (away from the phlox): it stays solid, what's under it outlined, as before.
  const bb = await middle(page, '#canvas-svg [data-shape-id="bb"]');
  await tapAt(page, { x: bb.x - 40, y: bb.y - 30 });
  await expect(page.locator('.sel-pill .name')).toHaveText('Buttonbush');
  expect(await seeThrough(page, 'bb')).toBe(false);
  // (The buttonbush ringed white and black, as selected; the phlox under it in black alone, Jason, Nov 6.)
  await expect(mark(page, 'bb')).toHaveAttribute('data-mark', 'selected');
  await expect(mark(page, 'ph')).toHaveAttribute('data-mark', 'outline');
  await expect(mark(page, 'ph').locator('circle')).toHaveCount(1);
  await expect(mark(page, 'ph').locator('circle')).toHaveAttribute('stroke', '#292524');
  await page.keyboard.press('Escape');
  // By its name in Layers' list: the same.
  await page.locator('button[title=Layers]').click();
  await page.locator('.layer-row', { hasText: 'Creeping Phlox' }).click();
  await expect(page.locator('.sel-pill .name')).toHaveText('Creeping Phlox');
  await expect(look(page, 'bb')).toHaveAttribute('data-see-through', 'true');
});

test("placing a plant on a hidden plant's pin or name places it: they let taps through while placing, as the plants do (CI, Nov 4)", async ({ page }) => {
  // (A name lifted beside its pin took the tap: e2e/my-plants.spec.ts, a peony placed by a coneflower under a cypress.)
  await openPlan(page);
  const pin = await middle(page, '#canvas-svg [data-pin-of="ph"]');
  const name = page.locator('#canvas-svg g[data-role=hidden-over] [data-label-of="ph"]');
  await expect(name).toHaveCount(1);
  const named = await middle(page, '#canvas-svg g[data-role=hidden-over] [data-label-of="ph"]');
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Wild ginger');
  await page.locator('.sheet .proj-row', { hasText: 'Wild ginger' }).first().locator('[data-testid=plant-place]').click();
  await expect(page.getByTestId('place-bar')).toBeVisible();
  await expect(page.locator('#canvas-svg [data-pin-of]')).toHaveCount(0);
  await expect(name).toHaveAttribute('pointer-events', 'none');
  await page.mouse.click(pin.x, pin.y);
  await expect.poll(() => shapeCount(page)).toBe(BED.length + 1);
  await page.mouse.click(named.x + 30, named.y);
  await expect.poll(() => shapeCount(page)).toBe(BED.length + 2);
  // Done: the pin takes taps again.
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#canvas-svg [data-pin-of="ph"]')).toHaveCount(1);
});

test('Layers: "See through tall plants", off to start, sees through every plant from 3, 5 or 10 ft, on this device', async ({ page }) => {
  await openPlan(page);
  await page.locator('button[title=Layers]').click();
  const sw = page.getByTestId('see-through-tall'), heights = page.getByTestId('see-through-from');
  await expect(sw).not.toBeChecked();
  await expect(heights).toHaveCount(0); // (no heights while it's off: the page stays as it was)
  await sw.check();
  await expect(heights.getByRole('button', { name: '5 ft' })).toHaveAttribute('aria-pressed', 'true');
  await expect(heights.getByRole('button')).toHaveText(['3 ft', '5 ft', '10 ft']);
  // From 5 ft, as tall plants were drawn until now: the buttonbush see-through, the phlox under it seen, not pinned; the
  // mint solid.
  await expect(look(page, 'bb')).toHaveAttribute('data-see-through', 'true');
  expect(await seeThrough(page, 'mint')).toBe(false);
  await expect(mark(page, 'ph')).toHaveCount(0);
  // From 3 ft, the mint too; from 10, not.
  await heights.getByRole('button', { name: '3 ft' }).click();
  await expect(look(page, 'mint')).toHaveAttribute('data-see-through', 'true');
  await page.getByTestId('see-through-from').getByRole('button', { name: '10 ft' }).click();
  await expect(page.getByTestId('see-through-from').getByRole('button', { name: '10 ft' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => seeThrough(page, 'mint')).toBe(false);
  // Kept on this device: still on, from 10 ft, after a reload.
  await page.reload();
  await expect.poll(() => shapeCount(page)).toBe(BED.length);
  await page.locator('button[title=Layers]').click();
  await expect(page.getByTestId('see-through-tall')).toBeChecked();
  await expect(page.getByTestId('see-through-from').getByRole('button', { name: '10 ft' })).toHaveAttribute('aria-pressed', 'true');
  // Off: every plant solid again, the phlox pinned.
  await page.getByTestId('see-through-tall').uncheck();
  await expect(page.getByTestId('see-through-from')).toHaveCount(0);
  await expect.poll(() => seeThrough(page, 'bb')).toBe(false);
  await expect(mark(page, 'ph')).toHaveAttribute('data-mark', 'pin');
});

test("a hidden plant's name stays on or beside its pin, not moved off past its outline", async ({ page }) => {
  // (A big mountain mint under a bigger buttonbush, its middle by the buttonbush's: its name can't go on its pin, where
  // "Buttonbush" is. It went past the mint's outline, 50 px off; on the options page, "Giant coneflower" ended up over
  // the house.)
  await openPlan(page, [plant('bb', 'cephalanthus-occidentalis', 'Buttonbush', 0, 0, 3.5), plant('mint', 'pycnanthemum-muticum', 'Mountain mint', 0.3, 0.2, 1.75)]);
  await expect(mark(page, 'mint')).toHaveAttribute('data-mark', 'pin');
  const name = page.locator('#canvas-svg g[data-role=hidden-over] [data-label-of="mint"]');
  await expect(name).toHaveCount(1);
  const pin = await middle(page, '#canvas-svg [data-rim-of="mint"]');
  const b = (await name.boundingBox())!;
  // (Its nearest edge within a fingertip of the pin's middle: src/canvas.ts HIDDEN_NAME_NEAR, 20 px.)
  const nx = Math.max(b.x, Math.min(pin.x, b.x + b.width)), ny = Math.max(b.y, Math.min(pin.y, b.y + b.height));
  expect(Math.hypot(nx - pin.x, ny - pin.y)).toBeLessThan(22);
  // (And clear of the buttonbush's own name: a text's box here has its line's spacing round its letters, a few px.)
  const own = (await page.locator('#canvas-svg [data-shape-group="bb"] [data-role=plant-label]').boundingBox())!;
  const overlap = Math.max(0, Math.min(b.y + b.height, own.y + own.height) - Math.max(b.y, own.y));
  expect(overlap).toBeLessThan(5);
  expect(b.y).toBeGreaterThan(own.y); // (under it, by its pin)
});

/** The words a PDF draws, line by line as it writes them, joined with spaces: its compressed streams opened. */
function pdfWords(pdf: Buffer): string {
  const text = pdf.toString('latin1');
  const out: string[] = [];
  for (const m of text.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length, end = text.indexOf('endstream', start);
    try { out.push(inflateSync(pdf.subarray(start, end)).toString('latin1')); } catch { out.push(text.slice(start, end)); }
  }
  return [...out.join('\n').matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((m) => m[1].replace(/\\(.)/g, '$1')).join(' ');
}
async function makePdf(page: Page): Promise<string> {
  await page.getByTestId('create-pdf').click();
  await expect(page.getByTestId('print-result')).toContainText('page');
  const download = page.waitForEvent('download');
  await page.getByTestId('download-pdf').click();
  return pdfWords(readFileSync((await (await download).path())!));
}
async function openPrint(page: Page) {
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Print or save as PDF' }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Printable plan');
}
const pickUnder = (page: Page, name: string) => page.getByTestId('print-under').getByRole('button', { name });

test('print: windows over the plants under tall ones to start; "As on screen" prints numbered dots with a key, kept with the plan; the picture follows', async ({ page }) => {
  await openPlan(page);
  await openPrint(page);
  await expect(pickUnder(page, 'Show through')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('print-under-says')).toContainText('faded just where it covers');
  await page.locator('.check-row', { hasText: 'Plant list, grouped by bed' }).locator('input').uncheck();
  // Windows: the phlox shows through the buttonbush, so nothing is marked or keyed.
  const windows = await makePdf(page);
  expect(windows).not.toContain('Plants under taller ones');
  expect(windows).not.toContain('Plant under a taller one');
  // As on screen: the phlox a numbered dot, in the legend and a key of its own.
  await pickUnder(page, 'As on screen').click();
  await expect(pickUnder(page, 'As on screen')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('download-pdf')).toHaveCount(0); // (the PDF made before let go)
  await expect(page.getByTestId('print-under-says')).toContainText('numbered dot');
  const screen = await makePdf(page);
  expect(screen).toContain('Plants under taller ones (1)');
  expect(screen).toContain('Numbers match the numbered dots on the plan.');
  expect(screen).toMatch(/Creeping [Pp]hlox/);
  expect(screen).toContain('Plant under a taller one, numbered (see the key)');
  // With the plant list's numbers on the sheet, the list is the key.
  await page.locator('.check-row', { hasText: 'Plant list, grouped by bed' }).locator('input').check();
  const listed = await makePdf(page);
  expect(listed).not.toContain('Plants under taller ones');
  expect(listed).toContain('Plant under a taller one, numbered as in the plant list');
  // Kept with the plan, and the picture follows: numbered dots, and their key under the drawing.
  await page.reload();
  await expect.poll(() => shapeCount(page)).toBe(BED.length);
  await openExport(page);
  await expect(pickUnder(page, 'As on screen')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Download SVG' }).click();
  const svg = await page.locator('details textarea').inputValue();
  expect(svg).toContain('data-role="numbered-dot"');
  expect(svg).toContain('Under taller plants:');
  expect(svg).not.toContain('tall-window');
  await page.getByRole('button', { name: 'Done' }).click();
  await openExport(page);
  await pickUnder(page, 'Show through').click();
  await page.getByRole('button', { name: 'Download SVG' }).click();
  const shown = await page.locator('details textarea').inputValue();
  expect(shown).toContain('data-role="tall-window"');
  expect(shown).not.toContain('Under taller plants:');
});

/**
 * Plans put in place before the app opens (as a version before Oct 11 kept them: copied in at the first start), the first
 * one open; `device`: this device's own choice for the plants under taller ones, as #228 kept it (Nov 4, on Next).
 */
async function openPlans(page: Page, plans: { id: string; name: string; shapes: object[] }[], device?: string) {
  await page.addInitScript(({ plans, device }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('lp-projects', JSON.stringify(plans.map((p, i) => ({ id: p.id, name: p.name, lastModified: 1000 - i }))));
    for (const p of plans) localStorage.setItem('lp-project-' + p.id, JSON.stringify({ shapes: p.shapes, zoom: 1.25, offsetX: -6, offsetY: -8 }));
    localStorage.setItem('lp-current', plans[0].id);
    if (device) localStorage.setItem('lp-print-under', device);
  }, { plans, device: device ?? null });
  await page.goto('./');
  await expect(page.locator('.project-btn .pname')).toHaveText(plans[0].name);
  await expect.poll(() => shapeCount(page)).toBe(plans[0].shapes.length);
  await expect(page.getByTestId('warnings-btn')).not.toHaveAttribute('data-state', 'checking');
}
const TWO = [{ id: 'p1', name: 'Back Yard', shapes: BED }, { id: 'p2', name: 'Front', shapes: BED }];
/** Each plan's print settings as stored, by name. */
const storedPrint = (page: Page) => page.evaluate(() => new Promise<Record<string, Record<string, unknown>>>((resolve) => {
  const open = indexedDB.open('landscape-planner');
  open.onsuccess = () => {
    const db = open.result, tx = db.transaction(['meta', 'projects']);
    const metas = tx.objectStore('meta').getAll(), plans = tx.objectStore('projects').getAll(), ids = tx.objectStore('projects').getAllKeys();
    tx.oncomplete = () => {
      const byId = Object.fromEntries((ids.result as string[]).map((k, i) => [k, (plans.result[i] as { print: Record<string, unknown> }).print]));
      resolve(Object.fromEntries((metas.result as { id: string; name: string }[]).map((m) => [m.name, byId[m.id]])));
      db.close();
    };
  };
}));
const storedUnder = async (page: Page) => Object.fromEntries(Object.entries(await storedPrint(page)).map(([n, p]) => [n, 'under' in p ? p.under : 'none']));
const deviceKey = (page: Page) => page.evaluate(() => localStorage.getItem('lp-print-under'));
async function switchTo(page: Page, name: string) {
  await page.locator('.project-btn').click();
  await page.locator('.proj-row', { hasText: name }).click();
  await expect(page.locator('.project-btn .pname')).toHaveText(name);
  await expect.poll(() => shapeCount(page)).toBe(BED.length);
}
const noPlantList = (page: Page) => page.locator('.check-row', { hasText: 'Plant list, grouped by bed' }).locator('input').uncheck();

test('the choice is kept with the plan: after a reload and switching plans, each plan its own; a plan never picked prints "Show through"; nothing kept on the device', async ({ page }) => {
  await openPlans(page, TWO);
  await openPrint(page);
  await expect(pickUnder(page, 'Show through')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(600); // (Print opened, nothing picked: nothing written for it)
  expect(await storedUnder(page)).toEqual({ 'Back Yard': 'none', Front: 'none' });
  await pickUnder(page, 'As on screen').click();
  await expect.poll(() => storedUnder(page)).toEqual({ 'Back Yard': 'screen', Front: 'none' });
  expect(await deviceKey(page)).toBeNull();
  await closeSheet(page);
  // The other plan, never picked: Show through, and it prints so.
  await switchTo(page, 'Front');
  await openPrint(page);
  await expect(pickUnder(page, 'Show through')).toHaveAttribute('aria-pressed', 'true');
  await noPlantList(page);
  const front = await makePdf(page);
  expect(front).not.toContain('Plants under taller ones');
  expect(front).not.toContain('Plant under a taller one');
  await closeSheet(page);
  await switchTo(page, 'Back Yard');
  await openPrint(page);
  await expect(pickUnder(page, 'As on screen')).toHaveAttribute('aria-pressed', 'true');
  await closeSheet(page);
  // After a reload, each its own still, in Print and in Export.
  await page.reload();
  await expect.poll(() => shapeCount(page)).toBe(BED.length);
  await openExport(page);
  await expect(pickUnder(page, 'As on screen')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await switchTo(page, 'Front');
  await openPrint(page);
  await expect(pickUnder(page, 'Show through')).toHaveAttribute('aria-pressed', 'true');
  // Show through picked, after As on screen: kept as picked.
  await pickUnder(page, 'As on screen').click();
  await pickUnder(page, 'Show through').click();
  await expect.poll(() => storedUnder(page)).toEqual({ 'Back Yard': 'screen', Front: 'windows' });
  expect(await deviceKey(page)).toBeNull();
});

test("a plan never picked starts from this device's earlier choice (as #228 kept it), and nothing is written to the plan for it; picked, it's the plan's, and the device's is never written", async ({ page }) => {
  await openPlans(page, TWO, 'screen');
  await openPrint(page);
  await expect(pickUnder(page, 'As on screen')).toHaveAttribute('aria-pressed', 'true');
  await noPlantList(page);
  expect(await makePdf(page)).toContain('Plants under taller ones (1)');
  // Another print setting changed, and saved: still none picked in the plan.
  await field(page, 'Title').fill('Back yard plan');
  await expect.poll(async () => (await storedPrint(page))['Back Yard'].title).toBe('Back yard plan');
  expect(await storedUnder(page)).toEqual({ 'Back Yard': 'none', Front: 'none' });
  // Picked: the plan's, Show through too; the device's as it was.
  await pickUnder(page, 'Show through').click();
  await expect.poll(() => storedUnder(page)).toEqual({ 'Back Yard': 'windows', Front: 'none' });
  expect(await makePdf(page)).not.toContain('Plants under taller ones');
  expect(await deviceKey(page)).toBe('screen');
  await closeSheet(page);
  await page.reload();
  await expect.poll(() => shapeCount(page)).toBe(BED.length);
  await openPrint(page);
  await expect(pickUnder(page, 'Show through')).toHaveAttribute('aria-pressed', 'true');
  await closeSheet(page);
  // The other plan, never picked, still starts from the device's.
  await switchTo(page, 'Front');
  await openExport(page);
  await expect(pickUnder(page, 'As on screen')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await storedUnder(page)).toEqual({ 'Back Yard': 'windows', Front: 'none' });
  expect(await deviceKey(page)).toBe('screen');
});
