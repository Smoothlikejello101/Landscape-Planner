import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { canvasBox, closeSheet, openExport, shapeCount } from './helpers';

// "Print what you're looking at" (Jason, Nov 2, marked Next in the UI review): "Whole plan, what's on screen, or one
// bed, scaled to fill the page; the picture follows." Print, and the picture, frame the area chosen; its plant list
// lists only the plants in it, and the page says what's included ("Front bed: 4 plants"). The choice is kept for the
// session (the plan's print settings have no place for it: src/print-area.ts).

const base = { opacity: 0.65, locked: false };
const box = (id: string, role: string, label: string, x: number, y: number, width: number, height: number, color = '#92400e') =>
  ({ ...base, color, id, type: 'rect', role, label, x, y, width, height, rotation: 0 });
const plant = (id: string, label: string, x: number, y: number) => ({ ...base, color: '#16a34a', id, type: 'circle', role: 'plant', label, x, y, radius: 1 });
// Front bed (12 × 4 ft, four plants) near the start; a house; Back bed (three plants) far off, the one on screen.
const SHAPES = [
  box('front', 'bed', 'Front bed', 0, 0, 12, 4), plant('c1', 'Coneflower', 2, 2), plant('c2', 'Coneflower', 5, 2), plant('a1', 'Aster', 8, 2), plant('c3', 'Coneflower', 11, 2),
  box('house', 'building', 'House', 30, 30, 40, 30, '#78716c'),
  box('back', 'bed', 'Back bed', 100, 100, 10, 6), plant('b1', 'Aster', 102, 103), plant('b2', 'Hosta', 105, 103), plant('b3', 'Hosta', 108, 103),
];

async function openPlan(page: Page) {
  await page.addInitScript((shapes) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes, zoom: 1, offsetX: 98, offsetY: 98 }));
  }, SHAPES);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(SHAPES.length);
  await expect(page.locator('#canvas-svg')).toHaveAttribute('data-view', /^98 98 1\b/);
}
async function openPrint(page: Page) {
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Print or save as PDF' }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Printable plan');
}
/** Create the PDF and download it: its bytes. */
async function makePdf(page: Page, name: string): Promise<Buffer> {
  await page.getByTestId('create-pdf').click();
  await expect(page.getByTestId('print-result')).toContainText('1 page');
  const download = page.waitForEvent('download');
  await page.getByTestId('download-pdf').click();
  const pdf = readFileSync((await (await download).path())!);
  writeFileSync(test.info().outputPath(name), pdf);
  return pdf;
}
/** The words a PDF draws, its compressed streams opened. */
function pdfWords(pdf: Buffer): string {
  const text = pdf.toString('latin1');
  const out: string[] = [];
  for (const m of text.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length, end = text.indexOf('endstream', start);
    try { out.push(inflateSync(pdf.subarray(start, end)).toString('latin1')); } catch { out.push(text.slice(start, end)); }
  }
  return out.join('\n');
}
/** The first page's size, in points, as its MediaBox gives it: [width, height]. */
function pageSize(pdf: Buffer): [number, number] {
  const m = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf.toString('latin1'))!;
  return [Math.round(+m[1]), Math.round(+m[2])];
}
const area = (page: Page, name: string) => page.getByTestId('print-area').getByRole('button', { name });

test('Print: the whole plan as before, or what\'s on screen, scaled to fill the page and saying so', async ({ page }) => {
  await openPlan(page);
  await openPrint(page);
  // The whole plan to start: both beds, nothing said about a part.
  await expect(area(page, 'Whole plan')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('print-area-says')).toHaveCount(0);
  const all = pdfWords(await makePdf(page, 'whole.pdf'));
  expect(all).toContain('(Front bed)');
  expect(all).toContain('(Back bed)');
  expect(all).toContain('(Plant list \\(7\\))'); // (a PDF's string escapes its parentheses)
  expect(all).not.toContain('Part of the plan');
  expect(all).not.toMatch(/bed: \d+ plants/);

  // What's on screen: the plan's part on the screen as Print opened, at 100%: Back bed and its three plants.
  const plan = await canvasBox(page);
  await area(page, 'What’s on screen').click();
  await expect(area(page, 'What’s on screen')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('print-area-says')).toHaveText('Part of the plan: 3 plants');
  await expect(page.getByTestId('print-result')).not.toContainText('Ready'); // (the whole plan's PDF let go)
  const summary = (await page.getByTestId('print-summary').textContent())!;
  expect(summary).toContain(`the drawing shows ${Math.round(plan.width / 24)} ft across, ${Math.round(plan.height / 24)} ft down`);
  const pdf = await makePdf(page, 'on-screen.pdf');
  const words = pdfWords(pdf);
  expect(words).toContain('(Part of the plan: 3 plants)');
  expect(words).toContain('(Plant list: Part of the plan \\(3\\))');
  expect(words).toContain('(Back bed)');
  expect(words).toContain('(Hosta)');
  expect(words).not.toContain('Front bed');
  expect(words).not.toContain('Coneflower');
  // On letter paper, turned as the summary says, at its scale.
  const landscape = summary.startsWith('Landscape');
  expect(pageSize(pdf)).toEqual(landscape ? [792, 612] : [612, 792]);
  expect(words).toContain(`(Scale ${/scale (1 in = [\d.]+ ft)/.exec(summary)![1]}`);
});

test('Print: one bed, picked from the list or the one selected, its plants only, the page turned to suit', async ({ page }) => {
  await openPlan(page);
  await openPrint(page);
  await area(page, 'One bed').click();
  // None selected: pick one first.
  await expect(page.getByTestId('print-bed')).toHaveValue('');
  await expect(page.getByTestId('print-area-says')).toHaveText('Pick a bed to print.');
  await expect(page.getByTestId('create-pdf')).toBeDisabled();
  await expect(page.getByTestId('print-bed').locator('option')).toHaveText(['Pick a bed…', 'Back bed', 'Front bed']);
  await page.getByTestId('print-bed').selectOption({ label: 'Front bed' });
  await expect(page.getByTestId('print-area-says')).toHaveText('Front bed: 4 plants');
  // 12 × 4 ft and a foot round it, 14 × 6: across a portrait page at 1 in = 2 ft (a landscape one, its legend down the
  // side, has 7 in across for it: 1 in = 2.5 ft).
  await expect(page.getByTestId('print-summary')).toHaveText('Portrait · scale 1 in = 2 ft (1/2 in = 1 ft) · the drawing shows 14 ft across, 6 ft down');
  const pdf = await makePdf(page, 'front-bed.pdf');
  expect(pageSize(pdf)).toEqual([612, 792]);
  const words = pdfWords(pdf);
  expect(words).toContain('(Front bed: 4 plants)');
  expect(words).toContain('(Plant list: Front bed \\(4\\))');
  expect(words).toContain('(Scale 1 in = 2 ft');
  expect(words).toContain('(Coneflower)');
  expect(words).not.toContain('Back bed');
  expect(words).not.toContain('Hosta');
  await closeSheet(page);

  // The bed selected on the plan is the one picked.
  await page.locator('button[title=Layers]').click();
  await page.locator('.layer-row', { hasText: 'Back bed' }).click();
  await expect(page.locator('.sel-pill')).toBeVisible();
  await openPrint(page);
  await expect(area(page, 'One bed')).toHaveAttribute('aria-pressed', 'true'); // (kept)
  await expect(page.getByTestId('print-bed')).toHaveValue('back');
  await expect(page.getByTestId('print-area-says')).toHaveText('Back bed: 3 plants');
  // 10 × 6 ft and a foot round it, 12 × 8: 1 in = 2 ft on either page (at 1.5, 8 in across, more than either has
  // room for), and a wide area on a landscape page.
  await expect(page.getByTestId('print-summary')).toHaveText('Landscape · scale 1 in = 2 ft (1/2 in = 1 ft) · the drawing shows 12 ft across, 8 ft down');
  const back = await makePdf(page, 'back-bed.pdf');
  expect(pageSize(back)).toEqual([792, 612]);
  const backWords = pdfWords(back);
  expect(backWords).toContain('(Back bed: 3 plants)');
  expect(backWords).not.toContain('Front bed');
});

test('the picture follows: the same choice, framing the same area, kept for the session only', async ({ page }) => {
  await openPlan(page);
  const plan = await canvasBox(page);
  const picture = async (kind: 'PNG' | 'SVG') => {
    await page.locator('.modal button', { hasText: `Download ${kind}` }).click();
    const img = page.locator('.preview-img');
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    const out = { src: (await img.getAttribute('src'))!, w: await img.evaluate((i: HTMLImageElement) => i.naturalWidth), h: await img.evaluate((i: HTMLImageElement) => i.naturalHeight) };
    await page.locator('.modal').getByRole('button', { name: 'Done' }).click();
    return out;
  };
  // One bed, picked in Print: the picture's choice too.
  await openPrint(page);
  await area(page, 'One bed').click();
  await page.getByTestId('print-bed').selectOption({ label: 'Back bed' });
  await closeSheet(page);
  await openExport(page);
  await expect(area(page, 'One bed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('print-bed')).toHaveValue('back');
  await expect(page.getByTestId('print-area-says')).toHaveText('Back bed: 3 plants');
  const bed = await picture('SVG');
  const svg = decodeURIComponent(bed.src.slice(bed.src.indexOf(',') + 1));
  writeFileSync(test.info().outputPath('back-bed.svg'), svg);
  // 10 × 6 ft and a foot round it: 12 × 8, 1200 px across.
  expect([bed.w, bed.h]).toEqual([1200, 800]);
  expect(svg).toContain('Back bed: 3 plants');
  expect(svg).toContain('>Hosta<');
  expect(svg).not.toContain('Coneflower');

  // What's on screen, chosen for the picture: the plan's part on the screen, its size (twice it, in a PNG).
  await openExport(page);
  await area(page, 'What’s on screen').click();
  await expect(page.getByTestId('print-area-says')).toHaveText('Part of the plan: 3 plants');
  await expect(page.getByTestId('print-bed')).toHaveCount(0);
  const shot = await picture('PNG');
  expect(Math.abs(shot.w - 2 * plan.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(shot.h - 2 * plan.height)).toBeLessThanOrEqual(2);
  writeFileSync(test.info().outputPath('on-screen.png'), Buffer.from(shot.src.slice(shot.src.indexOf(',') + 1), 'base64'));
  // ...and Print's, now.
  await openPrint(page);
  await expect(area(page, 'What’s on screen')).toHaveAttribute('aria-pressed', 'true');
  await closeSheet(page);

  // For the session only: opened again, the whole plan.
  await page.reload();
  await expect.poll(() => shapeCount(page)).toBe(SHAPES.length);
  await openExport(page);
  await expect(area(page, 'Whole plan')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('print-area-says')).toHaveCount(0);
  const whole = await picture('SVG');
  expect(decodeURIComponent(whole.src.slice(whole.src.indexOf(',') + 1))).toContain('>Coneflower<');
});
