// Fetch pages for the catalog audit, politely (docs/catalog-sources.md):
//   node scripts/catalog/fetch.mjs <list.json> [--refresh]
// <list.json>: [{ "source": "ncsu", "url": "https://…" }, …] (optional "pace"
// in seconds, never below the source's own). The rules live in fetch-lib.mjs.
//
// Pages are kept in catalog-src/ (not committed):
//   <source>/<date>/<name>        the page, and <name>.meta.json beside it
//   robots/<host>-<date>.txt      every robots.txt read, with its status
//   refused.json                  sites that refused us; left alone until
//                                 their entry is removed by hand
// --refresh fetches again into today's folder; earlier copies stay.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { USER_AGENT, dnsVerdict, fileStore, noAnswer, runFetch } from './fetch-lib.mjs';

const ROOT = 'catalog-src';
const today = new Date().toISOString().slice(0, 10);
const [listPath, ...flags] = process.argv.slice(2);
if (!listPath) { console.error('usage: node scripts/catalog/fetch.mjs <list.json> [--refresh]'); process.exit(1); }
const list = JSON.parse(readFileSync(listPath, 'utf8'));

/** One request with curl (it goes through this machine's proxy setup). -q first: no ~/.curlrc. */
function get(url) {
  const tmp = join(ROOT, 'tmp');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const body = join(tmp, 'body'), head = join(tmp, 'head');
  let status = 0;
  try {
    status = Number(execFileSync('curl', ['-q', '-sS', '--proto', '=https', '--max-time', '60', '-A', USER_AGENT,
      '-D', head, '-o', body, '-w', '%{http_code}', '--', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    const error = String(e.stderr ?? e.message).trim().split('\n')[0];
    return { status: 0, type: '', location: '', body: Buffer.alloc(0), error, reach: noAnswer(lookUp(new URL(url).hostname)) };
  }
  // (The header file can hold a proxy's CONNECT answer or early hints first: only the last block is the page's.)
  const blocks = (existsSync(head) ? readFileSync(head, 'latin1') : '').split(/\r?\n\r?\n/).filter((b) => b.trim());
  const headers = blocks[blocks.length - 1] ?? '';
  return {
    status,
    type: /^content-type:\s*(.+)$/im.exec(headers)?.[1].trim() ?? '',
    location: /^location:\s*(.+)$/im.exec(headers)?.[1].trim() ?? '',
    body: existsSync(body) ? readFileSync(body) : Buffer.alloc(0), // (bytes, as sent: PDFs too)
  };
}

/**
 * Whether a host exists, asked of a DNS-over-HTTPS resolver: behind this
 * machine's proxy, curl's own errors can't tell a missing host from a slow
 * one, and local DNS isn't available.
 */
function lookUp(host) {
  const answers = [];
  for (const type of ['A', 'AAAA']) {
    try {
      answers.push(JSON.parse(execFileSync('curl', ['-q', '-sS', '--proto', '=https', '--max-time', '20', '-H', 'accept: application/dns-json',
        '--', `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })));
    } catch { answers.push(null); }
  }
  return dnsVerdict(answers);
}

const store = fileStore(ROOT, today);

const result = await runFetch(list, {
  get, store, today,
  sleep: (s) => new Promise((r) => setTimeout(r, s * 1000)),
  now: () => Date.now(),
  refresh: flags.includes('--refresh'),
  log: (l) => console.log(l),
});
console.log(`${result.saved} fetched, ${result.cached} already here, ${result.skipped} skipped.`);
