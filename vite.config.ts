import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works under a GitHub Pages subpath.
  base: './',
  build: { target: 'es2020', sourcemap: true },
});
