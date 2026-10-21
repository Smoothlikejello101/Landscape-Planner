import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Relative base so the build works under a GitHub Pages subpath.
  base: './',
  build: { target: 'es2020', sourcemap: true },
  resolve: {
    alias: Object.fromEntries(['html2canvas', 'dompurify', 'canvg'].map((m) => [m, fileURLToPath(new URL('./src/stubs/unused.ts', import.meta.url))])),
  },
  define: {
    // (APP_VERSION: set by the deploy from the pull request's number, 0.2.049 for #49; else package.json's.)
    __APP_VERSION__: JSON.stringify((process.env.APP_VERSION || pkg.version) + (process.env.VERSION_SUFFIX ?? '')),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false, // registered in src/pwa.ts so we control updates
      manifest: false,       // public/manifest.webmanifest is used as-is
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,json,webmanifest}'],
        // The ZIP code tables are fetched one at a time when a ZIP is looked up (the plan keeps the answer);
        // the wild records by state when the garden's in or next to that state (kept by src/sw.ts once fetched).
        globIgnores: ['climate/**', 'wild/*/[0-9][0-9].json'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // plants.json is ~650 KB
      },
      devOptions: { enabled: false },
    }),
  ],
  // e2e only: serve the old app under /legacy/ on the same origin so the
  // migration test can hand its localStorage data to the new version.
  preview: {
    proxy: {
      '/legacy': { target: 'http://127.0.0.1:4181', rewrite: (p) => p.replace(/^\/legacy/, '') },
    },
  },
});
