import { defineConfig, devices } from '@playwright/test';

// Tests run against the production build served by `vite preview`.
const port = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}/`,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    // The guard against a stray second tap (src/tap-guard.ts) is off: tests click faster than a person sees what
    // changed. e2e/tap-guard.spec.ts tests it, with it on. The zoom buttons are on, phone too, where tests use them to
    // zoom (off on a phone to start: e2e/zoom-buttons.spec.ts).
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${port}`, localStorage: [{ name: 'lp-tap-guard', value: 'off' }, { name: 'lp-zoom-buttons', value: 'on' }] }] },
  },
  projects: [
    // The upgrade tests run their own server; one browser profile is enough.
    { name: 'phone', use: { ...devices['Pixel 7'] }, testIgnore: /upgrade\.spec/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: `npm run build && npx vite preview --port ${port} --strictPort`,
      url: `http://localhost:${port}/`,
      reuseExistingServer: !!process.env.REUSE_SERVER,
      timeout: 120_000,
    },
    {
      // The previous production version, proxied at /legacy/ (see vite.config.ts).
      command: 'python3 -m http.server 4181 --bind 127.0.0.1 --directory e2e/fixtures/legacy-app',
      url: 'http://127.0.0.1:4181/index.html',
      reuseExistingServer: !!process.env.REUSE_SERVER,
    },
  ],
});
