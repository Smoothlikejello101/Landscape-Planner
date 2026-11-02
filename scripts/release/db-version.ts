// The database version each build is made with (src/db.ts DB_VERSION), published with the build as db-version.txt at
// the site's root, and read before each deploy (scripts/release/deploy-guard.sh): a build with a lower one than the
// live site's is never deployed (docs/storage.md).
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/** DB_VERSION, as src/db.ts sets it. */
export function dbVersionOf(source: string): number {
  const m = /^export const DB_VERSION = (\d+);$/m.exec(source);
  if (!m) throw new Error('src/db.ts: no "export const DB_VERSION = <n>;" to publish as db-version.txt');
  return Number(m[1]);
}

/** The build's db-version.txt (not in the offline copy: vite.config.ts's globPatterns take no .txt). */
export function dbVersionFile(dbTs: string): Plugin {
  return {
    name: 'db-version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'db-version.txt', source: `${dbVersionOf(readFileSync(dbTs, 'utf8'))}\n` });
    },
  };
}
