import { defineConfig, devices } from '@playwright/test';

// BASELINE=1 serves the legacy single-file app from the repo root (used to pin
// down behavior before the refactor). Otherwise tests run against the
// production build served by `vite preview`.
const baseline = !!process.env.BASELINE;
const port = baseline ? 4180 : 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}/`,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: baseline
      ? `python3 -m http.server ${port} --bind 127.0.0.1`
      : `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
