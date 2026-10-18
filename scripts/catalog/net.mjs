// The network side of the fetcher: one request with curl, and asking DNS
// whether a host exists. (The rules for what may be fetched live in
// fetch-lib.mjs; this file only talks to the network.)
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { USER_AGENT, dnsVerdict, noAnswer } from './fetch-lib.mjs';

const ROOT = 'catalog-src';
/** Run a program without blocking (so several sites can be fetched at once): its stdout, or a thrown error with `status` and `stderr`. */
const run = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) { reject(Object.assign(err, { status: typeof err.code === 'number' ? err.code : null, stderr })); return; }
    resolve(stdout);
  });
});

/** One request with curl (it goes through this machine's proxy setup). -q first: no ~/.curlrc. */
export async function get(url) {
  // Its own folder for each request: two runs at once must never read each other's answers.
  mkdirSync(join(ROOT, 'tmp'), { recursive: true });
  const tmp = mkdtempSync(join(ROOT, 'tmp', 'get-'));
  const body = join(tmp, 'body'), head = join(tmp, 'head');
  try { return await request(url, body, head); } finally { rmSync(tmp, { recursive: true, force: true }); }
}
async function request(url, body, head) {
  let status = 0;
  try {
    status = Number(await run('curl', ['-q', '-sS', '--proto', '=https', '--max-time', '60', '-A', USER_AGENT,
      '-D', head, '-o', body, '-w', '%{http_code}', '--', url]));
  } catch (e) {
    const error = String(e.stderr ?? e.message).trim().split('\n')[0];
    return { status: 0, type: '', location: '', body: Buffer.alloc(0), error, reach: noAnswer(await lookUp(new URL(url).hostname), e.status, error) };
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
export async function lookUp(host) {
  const answers = [];
  for (const type of ['A', 'AAAA']) {
    try {
      answers.push(JSON.parse(await run('curl', ['-q', '-sS', '--proto', '=https', '--max-time', '20', '-H', 'accept: application/dns-json',
        '--', `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`])));
    } catch { answers.push(null); }
  }
  return dnsVerdict(answers);
}

