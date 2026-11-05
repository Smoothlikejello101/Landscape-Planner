import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { closeSheet, openExport, openSections, planPoint, shapeCount } from './helpers';

// Sun areas drawn by their hours (Jason, Nov 4, answering the sun-areas page: "1)ramp plus hatch. 2) no, keep the
// separation 3)no"): a sun area with hours recorded is washed from a lemon gold (8 h or more) through a light gray
// (4 to 5 h) to a slate blue (2 h or less); ground with nothing recorded stays plain; inside a bed, the parts with no
// sun recorded are faintly hatched while the Sun Exposure layer is shown, on the screen only. Layers and the printed
// legend have the key.

const BG = '#ede0c8'; // the plan's ground (src/constants.ts BG_COLOR)
const base = { label: '', opacity: 0.3, locked: false, rotation: 0 };
const hours = (h: number) => ({ mode: 'hours', periods: [], hours: h, dappled: false });
const area = (id: string, x: number, y: number, w: number, h: number, sun?: number, color = '#334155') =>
  ({ ...base, id, type: 'rect', role: 'shade', label: id, color, x, y, width: w, height: h, ...(sun === undefined ? {} : { sun: hours(sun) }) });
// A bed 0–14 × 0–5 ft, its left part under a 6.5 h area; below it, three areas over plain ground: 8 h, 1.5 h (given a
// yellow of its own, which gives way) and 4.5 h. Plain ground below them. At 100%, in a phone's width.
const PLAN = [
  { ...base, id: 'bed', type: 'rect', role: 'bed', label: 'Back bed', color: '#92400e', x: 0, y: 0, width: 14, height: 5 },
  area('Morning sun', -1, -1, 7, 7, 6.5),
  area('Full sun', 0, 8, 4, 4, 8),
  area('Side yard', 5, 8, 4, 4, 1.5, '#facc15'),
  area('Middle', 10, 8, 4, 4, 4.5),
];

async function openPlan(page: Page, extra: object = {}) {
  await page.addInitScript((data) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('landscape-planner-v1', JSON.stringify(data));
  }, { shapes: PLAN, zoom: 1, offsetX: -1, offsetY: -1.5, ...extra });
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(PLAN.length);
}
const fillOf = (page: Page, id: string) => page.locator(`#canvas-svg [data-shape-group="${id}"] > [data-shape-id="${id}"]`);
const hatch = (page: Page) => page.locator('#canvas-svg g[data-role=sun-hatch]');

/** The colors in a 16 px square (CSS px) around a point of the plan (feet), as drawn: their average and spread. */
async function sample(page: Page, x: number, y: number): Promise<{ hex: string; spread: number }> {
  const p = await planPoint(page, x, y);
  const png = await page.screenshot({ clip: { x: Math.round(p.x) - 8, y: Math.round(p.y) - 8, width: 16, height: 16 }, scale: 'css' });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const sum = [0, 0, 0];
    let lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 4) {
      for (let k = 0; k < 3; k++) sum[k] += d[i + k];
      lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]);
    }
    const n = d.length / 4;
    return { hex: '#' + sum.map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join(''), spread: hi - lo };
  }, png.toString('base64'));
}
const near = (hex: string, want: string, by = 3) => {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)), b = [1, 3, 5].map((i) => parseInt(want.slice(i, i + 2), 16));
  return a.every((v, i) => Math.abs(v - b[i]) <= by);
};

test('sun areas are washed by their hours, warm to cool, whatever color they were given; plain ground stays plain', async ({ page }) => {
  await openPlan(page);
  await expect(fillOf(page, 'Full sun')).toHaveAttribute('fill', '#ffe614');
  await expect(fillOf(page, 'Full sun')).toHaveAttribute('fill-opacity', '0.42');
  await expect(fillOf(page, 'Morning sun')).toHaveAttribute('fill', '#e0d68c');
  await expect(fillOf(page, 'Morning sun')).toHaveAttribute('fill-opacity', '0.4');
  await expect(fillOf(page, 'Middle')).toHaveAttribute('fill', '#c3c3c3');
  await expect(fillOf(page, 'Middle')).toHaveAttribute('fill-opacity', '0.38');
  await expect(fillOf(page, 'Side yard')).toHaveAttribute('fill', '#2f5597'); // (its own yellow gives way)
  await expect(fillOf(page, 'Side yard')).toHaveAttribute('fill-opacity', '0.4');
  // As drawn, over the plan's ground: the colors the page's table gives "on the plan"; plain ground its own tan.
  const seen = {
    full: await sample(page, 0.5, 8.5), morning: await sample(page, 5.5, 5.5), middle: await sample(page, 10.5, 8.5),
    side: await sample(page, 5.5, 8.5), plain: await sample(page, 12.5, 14.5),
  };
  expect(near(seen.full.hex, '#f5e37c'), seen.full.hex).toBe(true);
  expect(near(seen.morning.hex, '#e8dcb0'), seen.morning.hex).toBe(true);
  expect(near(seen.middle.hex, '#ddd5c6'), seen.middle.hex).toBe(true);
  expect(near(seen.side.hex, '#a1a8b4'), seen.side.hex).toBe(true);
  expect(near(seen.plain.hex, BG), seen.plain.hex).toBe(true);
  // The hours shown on each, as before.
  await expect(page.locator('#canvas-svg [data-name-of="Full sun"] [data-role=sun-label]')).toHaveText('☀ 8 h');
  await expect(page.locator('#canvas-svg [data-name-of="Morning sun"] [data-role=sun-label]')).toHaveText('☀ 6.5 h');

  // Its edit pane: no color to pick (it would show nowhere), but where its color comes from. The hours, dragged, wash it
  // afresh without rebuilding the pane (the keyboard and the finger stay put).
  await page.locator('button[title=Layers]').click();
  // (Its row's swatch in its ramp color as it looks on the plan, not its own yellow.)
  await expect(page.locator('.layer-row', { hasText: 'Side yard' }).locator('.layer-sw')).toHaveCSS('background-color', 'rgb(161, 168, 180)');
  await page.locator('.layer-row', { hasText: 'Side yard' }).click();
  await page.locator('.sel-pill button.edit').click();
  await openSections(page);
  await expect(page.getByTestId('sun-look')).toHaveText('Colored by its hours of sun, warm for sun and cool for shade. The key is in Layers, under Sun Exposure.');
  await expect(page.locator('[data-testid=section-look] .swatches')).toHaveCount(0);
  await expect(page.locator('[data-section=look] .sw-dot')).toHaveCSS('background-color', 'rgb(161, 168, 180)');
  const slider = page.locator('[data-testid=sun-section] input[type=range]');
  const handle = await slider.elementHandle();
  await slider.fill('8');
  await expect(fillOf(page, 'Side yard')).toHaveAttribute('fill', '#ffe614');
  await expect(page.locator('[data-section=look] .sw-dot')).toHaveCSS('background-color', 'rgb(245, 227, 124)');
  expect(await handle!.evaluate((n) => n.isConnected)).toBe(true);
  await closeSheet(page);
});

test('the parts of a bed with no sun recorded are hatched, nothing outside beds; only while sun areas are shown; a dragged bed takes its hatch along', async ({ page }) => {
  await openPlan(page);
  await expect(hatch(page)).toHaveCount(1);
  await expect(hatch(page)).toHaveAttribute('pointer-events', 'none');
  // Drawn over the beds and the sun areas, under what's drawn over them.
  const order = await page.locator('#canvas-svg [data-layer=shapes] > g').evaluateAll((gs) => gs.map((g) => g.getAttribute('data-shape-group') ?? g.getAttribute('data-role')));
  expect(order.indexOf('sun-hatch')).toBe(order.indexOf('Middle') + 1);
  // In the bed, outside the 6.5 h area: lines. In the bed under it, and on plain ground beside the bed: none.
  const hatched = await sample(page, 11.5, 3.5), inSun = await sample(page, 0.5, 4.5), ground = await sample(page, 12.5, 6.5);
  expect(hatched.spread, 'hatched').toBeGreaterThan(12);
  expect(inSun.spread, 'in sun').toBeLessThan(5);
  expect(ground.spread, 'ground').toBeLessThan(5);
  expect(near(ground.hex, BG), ground.hex).toBe(true);

  // A bed dragged: the hatch moves with it as it goes, not only on release.
  const bedOutline = hatch(page).locator('g[mask] > rect');
  const x0 = Number(await bedOutline.getAttribute('x'));
  const from = await planPoint(page, 11.5, 1.5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 48, from.y, { steps: 8 });
  await expect.poll(async () => Number(await bedOutline.getAttribute('x')) - x0).toBe(48);
  await page.mouse.up();
  await expect.poll(async () => Number(await bedOutline.getAttribute('x')) - x0).toBe(48);
  await page.keyboard.press('Escape');

  // The Sun Exposure layer hidden: no hatch (it's a statement about the sun data).
  await page.locator('button[title=Layers]').click();
  await page.locator('.role-row[data-role-key=shade] [data-action=toggle-hidden]').click();
  await closeSheet(page);
  await expect(hatch(page)).toHaveCount(0);
  const hidden = await sample(page, 11.5, 3.5); // (the bed moved 2 ft right: still in it, outside the sun area)
  expect(hidden.spread, 'layer hidden').toBeLessThan(5);
});

test('Layers has the key under the Sun Exposure row, lined up with its name, while the layer is shown', async ({ page }) => {
  await openPlan(page);
  await page.locator('button[title=Layers]').click();
  const key = page.locator('.role-row[data-role-key=shade] + [data-testid=sun-key]');
  await expect(key).toHaveCount(1);
  await expect(key.locator('.sun-key-line')).toHaveText(['☀ 8 h or more2 h or less', 'Plain: no sun recorded', 'Hatched in a bed: no sun recorded']);
  // The bar, as the colors look on the plan's ground: gold to slate.
  const bar = await key.locator('.sun-key-bar').evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(bar).toContain('rgb(245, 227, 124)');
  expect(bar).toContain('rgb(161, 168, 180)');
  // Lined up with the row's name, past its eye and lock.
  const name = (await page.locator('.role-row[data-role-key=shade] .name').boundingBox())!;
  const first = (await key.locator('.sun-key-line').first().locator('span').first().boundingBox())!;
  expect(Math.abs(first.x - name.x)).toBeLessThan(2);
  // A sun area's row: its swatch in its ramp color, no opacity said.
  await expect(page.locator('.layer-row', { hasText: 'Full sun' })).not.toContainText('opacity');
  // Hidden, the layer has nothing on the plan to explain.
  await page.locator('.role-row[data-role-key=shade] [data-action=toggle-hidden]').click();
  await expect(page.getByTestId('sun-key')).toHaveCount(0);
  await page.locator('.role-row[data-role-key=shade] [data-action=toggle-hidden]').click();
  await expect(page.getByTestId('sun-key')).toHaveCount(1);
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

test('on paper and in a picture: the ramp, the key in the printed legend, and no hatch', async ({ page }) => {
  await openPlan(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Print or save as PDF' }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Printable plan');
  await page.getByTestId('create-pdf').click();
  await expect(page.getByTestId('print-result')).toContainText('page');
  const download = page.waitForEvent('download');
  await page.getByTestId('download-pdf').click();
  const words = pdfWords(readFileSync((await (await download).path())!));
  expect(words).toContain('Sun Exposure: hours of direct sun 8 h+ 2 h or less Plain: no sun recorded');
  expect(words).not.toContain('Hatched');
  expect(words).not.toMatch(/Sun Exposure (?!:)/); // (the one swatch it was is gone)
  await closeSheet(page);

  await openExport(page);
  await page.getByRole('button', { name: 'Download SVG' }).click();
  const svg = await page.locator('details textarea').inputValue();
  expect(svg).toContain('fill="#ffe614" fill-opacity="0.42"');
  expect(svg).toContain('fill="#2f5597" fill-opacity="0.4"');
  expect(svg).not.toMatch(/hatch|<pattern/);
});
