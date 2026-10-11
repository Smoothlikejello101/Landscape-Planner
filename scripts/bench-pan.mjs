// Measures time per pointermove while panning a 400-shape plan.
// Usage: node scripts/bench-pan.mjs <url>
import { chromium, devices } from '@playwright/test';
const url = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(url);
await page.waitForSelector('.project-btn .pname');
// Build a 400-shape project by importing a file.
const shapes = Array.from({ length: 400 }, (_, i) => ({
  id: 's' + i, type: i % 2 ? 'circle' : 'rect', x: (i % 20) * 3, y: Math.floor(i / 20) * 3,
  radius: 1.2, width: 2, height: 2, rotation: 0, color: '#16a34a', label: 'Plant ' + i, opacity: 0.65, locked: false,
}));
const file = { format: 'landscape-planner-project', version: 1, exportedAt: '', project: { name: 'Bench', lastModified: 0, data: { shapes, zoom: 1, offsetX: -5, offsetY: -5 } } };
await page.locator('.project-btn').click();
await page.locator('[data-testid=import-file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
await page.waitForFunction(() => document.querySelector('.project-btn .pname')?.textContent === 'Bench');
const ms = await page.evaluate(async () => {
  const fire = (type, x, y) => document.getElementById('canvas-svg').dispatchEvent(
    new PointerEvent(type, { pointerId: 7, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
  // Start on the bare grid in the top-left corner of the canvas.
  const r = document.getElementById('canvas-svg').getBoundingClientRect();
  const x0 = r.left + 5, y0 = r.top + 5;
  const target = document.elementFromPoint(x0, y0);
  target.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: x0, clientY: y0, bubbles: true, pointerType: 'touch' }));
  const t0 = performance.now();
  for (let i = 1; i <= 100; i++) {
    (document.getElementById('canvas-svg')).dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: x0 + i, clientY: y0 + i, bubbles: true, pointerType: 'touch' }));
  }
  const t = performance.now() - t0;
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: x0 + 100, clientY: y0 + 100, bubbles: true }));
  document.getElementById('canvas-svg').dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: x0 + 100, clientY: y0 + 100, bubbles: true }));
  return t / 100;
});
console.log(`average per pan move: ${ms.toFixed(2)} ms (400 shapes)`);
await browser.close();
