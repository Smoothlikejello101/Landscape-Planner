// Reading pages the fetcher saved in catalog-src/.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cacheName } from './fetch-lib.mjs';

/** A JSON file, or null if it's missing or damaged (a run cut off mid-write). */
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

/** The newest saved copy of a URL ({ text, fetched, url, type }), or null. */
export function savedPage(source, url, root = 'catalog-src') {
  const dir = join(root, source);
  if (!existsSync(dir)) return null;
  const name = cacheName(url);
  for (const d of readdirSync(dir).sort().reverse()) {
    const f = join(dir, d, name);
    if (!existsSync(f) || !existsSync(f + '.meta.json')) continue;
    const meta = readJson(f + '.meta.json');
    if (!meta) continue;
    if (meta.url !== url) continue;
    // Decoded as the server said (Minnesota Wildflowers sends ISO-8859-1), else as the page says, else UTF-8.
    const bytes = readFileSync(f);
    const declared = /charset="?([\w-]+)/i.exec(meta.type ?? '')?.[1] ?? /<meta[^>]+charset="?([\w-]+)/i.exec(bytes.subarray(0, 4096).toString('latin1'))?.[1];
    const latin = /^(iso-8859-1|windows-1252|latin1)$/i.test(declared ?? '');
    return { text: new TextDecoder(latin ? 'windows-1252' : 'utf-8').decode(bytes), fetched: d, url, type: meta.type ?? '' };
  }
  return null;
}

/** The file holding the newest saved copy of a URL (a PDF, a spreadsheet), or null. */
export function savedFile(source, url, root = 'catalog-src') {
  const dir = join(root, source);
  if (!existsSync(dir)) return null;
  const name = cacheName(url);
  for (const d of readdirSync(dir).sort().reverse()) {
    const f = join(dir, d, name);
    if (existsSync(f) && readJson(f + '.meta.json')?.url === url) return f;
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
    const meta = readJson(f);
    if (meta?.url === url) return meta;
  }
  return null;
}

/**
 * Claim catalog-src/ for this process, so two runs never share it (their
 * paces would add up, and their files could cross). A lock left by a run
 * that was stopped is cleared by hand (the message says how).
 */
export function lockCatalogSrc(root = 'catalog-src') {
  mkdirSync(root, { recursive: true });
  const lock = `${root}/.lock`;
  try { writeFileSync(lock, String(process.pid), { flag: 'wx' }); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    // Never taken over: a run that is still going would be doubled. If none is, the lock is left from one that was stopped.
    console.error(`catalog-src/ is locked (${lock}, by process ${readFileSync(lock, 'utf8').trim() || '?'}). If no catalog run is going, delete that file and start again.`);
    process.exit(1);
  }
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(130)); // (so the lock goes with a stopped run)
  process.on('exit', () => { try { if (readFileSync(lock, 'utf8') === String(process.pid)) rmSync(lock); } catch { /* gone already */ } });
}
