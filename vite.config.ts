import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works under a GitHub Pages subpath.
  base: './',
  build: { target: 'es2020', sourcemap: true },
  // e2e only: serve the old app under /legacy/ on the same origin so the
  // migration test can hand its localStorage data to the new version.
  preview: {
    proxy: {
      '/legacy': { target: 'http://127.0.0.1:4181', rewrite: (p) => p.replace(/^\/legacy/, '') },
    },
  },
});
