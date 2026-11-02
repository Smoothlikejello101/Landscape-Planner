import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

// Simulates a phone that has the previous version installed (with its
// cache-first service worker) receiving this release from the same URL.

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.map': 'application/json',
};
let mode: 'old' | 'new' | 'next' = 'old';
let server: Server;
let PORT = 0;
// Per worker, so parallel runs never serve a half-written build.
const NEXT_DIR = `test-results/dist-next-${process.env.TEST_WORKER_INDEX ?? 0}`;
const ROOTS = { old: ['e2e/fixtures/legacy-app', 'public'], new: ['dist'], next: [NEXT_DIR] };

// Shared server and mode: run these tests one at a time in one worker.
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // A second build standing in for the next release.
  execSync(`npx vite build --outDir ${NEXT_DIR} --emptyOutDir`, { env: { ...process.env, VERSION_SUFFIX: '-next' }, stdio: 'ignore' });
  // (Its Arkansas records, changed, as a release's catalog build would change them.)
  const ar = join(NEXT_DIR, 'wild', '1', '05.json');
  writeFileSync(ar, JSON.stringify({ ...JSON.parse(readFileSync(ar, 'utf8')), nextRelease: true }));
  server = createServer((req, res) => {
    let path = decodeURIComponent((req.url || '/').split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    for (const root of ROOTS[mode]) {
      const file = normalize(join(root, path));
      if (file.startsWith(normalize(root)) && existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(readFileSync(file));
        return;
      }
    }
    res.writeHead(404); res.end('not found');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  PORT = (server.address() as { port: number }).port;
});
test.afterAll(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

test.use({ serviceWorkers: 'allow' });

test('upgrading from the previous installed version keeps data and works offline', async ({ page, context }) => {
  page.on('dialog', (d) => void d.accept());
  const url = `http://localhost:${PORT}/`;

  // 1. The old version, installed: its service worker controls the page.
  mode = 'old';
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.locator('.tool-btn.circle').click(); // the previous version's toolbar
  await page.locator('.sheet .field input').first().fill('Planted before upgrade');
  await page.waitForTimeout(600);

  // 2. This release is deployed to the same address.
  mode = 'new';
  // First open after the deploy: the old worker still serves the old app from
  // its cache, while the new worker installs and takes over.
  await page.reload();
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('workbox-precache'))),
    { timeout: 15_000 }).toBe(true); // new worker installed
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('landscape-planner-'))),
    { timeout: 15_000 }).toBe(false); // old caches removed

  // 3. Next open: the new app, with the old data migrated.
  await page.reload();
  await expect(page.locator('.project-btn .pname')).toHaveText('My Garden');
  await expect(page.locator('[data-layer]')).toHaveCount(5); // new canvas structure = new version
  await expect(page.locator('#canvas-svg text', { hasText: 'Planted before upgrade' })).toHaveCount(1);

  // 4. Offline: the app and the plant index still load.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#canvas-svg text', { hasText: 'Planted before upgrade' })).toHaveCount(1);
  await page.locator('.tool-btn.plants').click();
  await expect(page.locator('.sheet-header .title')).toContainText(/Plant Picker \(\d,\d{3}\)/);
  await context.setOffline(false);
});

test('a later release offers an Update button and switches only when tapped', async ({ page }) => {
  const url = `http://localhost:${PORT}/`;
  mode = 'new';
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.locator('button[title=More]').click();
  await expect(page.locator('.menu-version')).not.toContainText('-next');
  await page.keyboard.press('Escape');

  mode = 'next';
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
  await expect(page.locator('#update-banner')).toBeVisible({ timeout: 15_000 });
  // Under the top bar, the plan below it: it covers nothing, on a computer or a phone (the UI review, 2026-11-01: over
  // the plan, it covered the Fit and Through-the-year buttons).
  for (const size of [{ width: 1280, height: 720 }, { width: 412, height: 915 }]) {
    await page.setViewportSize(size);
    const banner = (await page.locator('#update-banner').boundingBox())!;
    expect((await page.locator('.topbar').boundingBox())!.y + 1).toBeLessThanOrEqual(banner.y);
    expect((await page.locator('#canvas-wrap').boundingBox())!.y + 1).toBeGreaterThanOrEqual(banner.y + banner.height);
    const fit = (await page.locator('.zoombtns button').first().boundingBox())!;
    expect(fit.y).toBeGreaterThanOrEqual(banner.y + banner.height);
  }
  // Nothing changes until the user agrees.
  await page.locator('button[title=More]').click();
  await expect(page.locator('.menu-version')).not.toContainText('-next');
  await page.keyboard.press('Escape');

  await Promise.all([
    page.waitForEvent('load'), // the app reloads into the new version
    page.locator('#update-banner button', { hasText: 'Update' }).click(),
  ]);
  await page.locator('button[title=More]').click();
  await expect(page.locator('.menu-version')).toContainText('-next', { timeout: 15_000 });
});

test('⋮\'s Check for updates says when it\'s up to date, finds a later release, and switches only on Update now (Jason, the UI review, 2026-11-01)', async ({ page }) => {
  const url = `http://localhost:${PORT}/`;
  mode = 'new';
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.locator('button[title=More]').click();
  // (This app is on its own address, so the tap guard is on here: a menu just opened takes no tap for 0.4 s,
  // src/tap-guard.ts. Wait as a person would.)
  await page.waitForTimeout(450);
  const line = page.getByTestId('update-check');
  await page.getByTestId('check-updates').click();
  await expect(line).toHaveText('You’re up to date.', { timeout: 15_000 });
  await expect(page.getByTestId('check-updates')).toBeVisible({ timeout: 8000 }); // (for a moment)
  mode = 'next';
  await page.getByTestId('check-updates').click();
  await expect(line).toContainText('A new version is ready.', { timeout: 30_000 });
  // Nothing changes until the user agrees.
  await page.waitForTimeout(2000);
  await expect(page.locator('.menu-version')).not.toContainText('-next');
  await Promise.all([
    page.waitForEvent('load'), // the app reloads into the new version
    page.getByTestId('update-now').click(),
  ]);
  await page.locator('button[title=More]').click();
  await expect(page.locator('.menu-version')).toContainText('-next', { timeout: 15_000 });
});

test("a later release brings the kept state records up to date as it installs, so it opens with them", async ({ page }) => {
  const url = `http://localhost:${PORT}/`;
  mode = 'new';
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  // The garden's state file, read once, so kept (src/sw.ts).
  const kept = () => page.evaluate(async () => {
    const name = (await caches.keys()).find((k) => k.startsWith('fullgrown-wild'));
    const res = name ? await (await caches.open(name)).match(new URL('wild/1/05.json', location.href).href) : undefined;
    return res ? ((await res.json()) as { nextRelease?: boolean }).nextRelease ?? false : null;
  });
  await page.evaluate(() => fetch('wild/1/05.json').then((r) => r.json()));
  await expect.poll(kept).toBe(false);

  mode = 'next';
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
  await expect(page.locator('#update-banner')).toBeVisible({ timeout: 15_000 });
  // Fetched again as the new version installed: before it's opened, its first read is the new file.
  expect(await kept()).toBe(true);
});
