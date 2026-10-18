// Reading pages the fetcher saved in catalog-src/.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cacheName } from './fetch-lib.mjs';

/** The newest saved copy of a URL ({ text, fetched, url, type }), or null. */
export function savedPage(source, url, root = 'catalog-src') {
  const dir = join(root, source);
  if (!existsSync(dir)) return null;
  const name = cacheName(url);
  for (const d of readdirSync(dir).sort().reverse()) {
    const f = join(dir, d, name);
    if (!existsSync(f) || !existsSync(f + '.meta.json')) continue;
    const meta = JSON.parse(readFileSync(f + '.meta.json', 'utf8'));
    if (meta.url !== url) continue;
    // Decoded as the server said (Minnesota Wildflowers sends ISO-8859-1), else as the page says, else UTF-8.
    const bytes = readFileSync(f);
    const declared = /charset="?([\w-]+)/i.exec(meta.type ?? '')?.[1] ?? /<meta[^>]+charset="?([\w-]+)/i.exec(bytes.subarray(0, 4096).toString('latin1'))?.[1];
    const latin = /^(iso-8859-1|windows-1252|latin1)$/i.test(declared ?? '');
    return { text: new TextDecoder(latin ? 'windows-1252' : 'utf-8').decode(bytes), fetched: d, url, type: meta.type ?? '' };
  }
  return null;
}

/** What the fetcher recorded for a URL (status, type, location), page or not; or null. */
export function savedMeta(source, url, root = 'catalog-src') {
  const dir = join(root, source);
  if (!existsSync(dir)) return null;
  const name = cacheName(url);
  for (const d of readdirSync(dir).sort().reverse()) {
    const f = join(dir, d, name + '.meta.json');
    if (!existsSync(f)) continue;
    const meta = JSON.parse(readFileSync(f, 'utf8'));
    if (meta.url === url) return meta;
  }
  return null;
}
