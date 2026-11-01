import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  // (The PWA plugin's module exists only in the app's build: ⋮'s "Check for updates" brings src/pwa.ts into what the
  // tests load, never run there.)
  resolve: { alias: { 'virtual:pwa-register': fileURLToPath(new URL('./src/stubs/unused.ts', import.meta.url)) } },
});
