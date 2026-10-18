// The network side of the fetcher: one request with curl, and asking DNS
// whether a host exists. (The rules for what may be fetched live in
// fetch-lib.mjs; this file only talks to the network.)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { USER_AGENT, dnsVerdict, noAnswer } from './fetch-lib.mjs';

const ROOT = 'catalog-src';

/** One request with curl (it goes through this machine's proxy setup). -q first: no ~/.curlrc. */
export function get(url) {
  // Its own folder for each request: two runs at once must never read each other's answers.
  mkdirSync(join(ROOT, 'tmp'), { recursive: true });
  const tmp = mkdtempSync(join(ROOT, 'tmp', 'get-'));
  const body = join(tmp, 'body'), head = join(tmp, 'head');
  try { return request(url, body, head); } finally { rmSync(tmp, { recursive: true, force: true }); }
}
function request(url, body, head) {
  let status = 0;
  try {
    status = Number(execFileSync('curl', ['-q', '-sS', '--proto', '=https', '--max-time', '60', '-A', USER_AGENT,
      '-D', head, '-o', body, '-w', '%{http_code}', '--', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    const error = String(e.stderr ?? e.message).trim().split('\n')[0];
    return { status: 0, type: '', location: '', body: Buffer.alloc(0), error, reach: noAnswer(lookUp(new URL(url).hostname), e.status, error) };
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
export function lookUp(host) {
  const answers = [];
  for (const type of ['A', 'AAAA']) {
    try {
      answers.push(JSON.parse(execFileSync('curl', ['-q', '-sS', '--proto', '=https', '--max-time', '20', '-H', 'accept: application/dns-json',
        '--', `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })));
    } catch { answers.push(null); }
  }
  return dnsVerdict(answers);
}

