import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DB_VERSION } from '../src/db';
import { dbVersionFile, dbVersionOf } from '../scripts/release/db-version';

// Never a deploy that would lock devices out of their plans (the review of the old-tab guard, Nov 1; docs/storage.md):
// each build publishes its database version as db-version.txt, and CI (scripts/release/deploy-guard.sh, before `deploy`
// and `next`) refuses a build with a lower one than the live site's, or any commit but the branch's head (a re-run of
// an older run would redeploy its older commit).

const run = promisify(execFile);
let live: { status: number; body: string } = { status: 200, body: '2\n' };
let server: Server;
let url = '';
let repo = '';
const sha: Record<string, string> = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    if (!req.url?.startsWith('/db-version.txt')) { res.writeHead(404); res.end(); return; }
    res.writeHead(live.status, { 'Content-Type': 'text/plain' });
    res.end(live.body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // (The branch's head, read as CI reads it from GitHub: here a repository of its own, an older commit and the head.)
  repo = mkdtempSync(join(tmpdir(), 'deploy-guard-'));
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'release');
  git('commit', '-q', '--allow-empty', '-m', 'older');
  sha.older = git('rev-parse', 'HEAD');
  git('commit', '-q', '--allow-empty', '-m', 'head');
  sha.head = git('rev-parse', 'HEAD');
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(repo, { recursive: true, force: true });
});

/** The guard as CI runs it: deployed (true) or refused, and what it said. */
async function guard(env: Record<string, string> = {}): Promise<{ deployed: boolean; said: string }> {
  try {
    const { stdout, stderr } = await run('bash', ['scripts/release/deploy-guard.sh'], {
      env: { ...process.env, LIVE_URL: url, BRANCH: 'release', SHA: sha.head, REPO_URL: repo, BUILD_DB_VERSION: '2', ...env },
    });
    return { deployed: true, said: stdout + stderr };
  } catch (e) {
    const x = e as { stdout?: string; stderr?: string };
    return { deployed: false, said: (x.stdout ?? '') + (x.stderr ?? '') };
  }
}

describe('the deploy guard (scripts/release/deploy-guard.sh)', () => {
  it('deploys a build at the live version or higher; refuses one lower, saying why', async () => {
    live = { status: 200, body: '2\n' };
    expect((await guard({ BUILD_DB_VERSION: '2' })).deployed).toBe(true);
    expect((await guard({ BUILD_DB_VERSION: '3' })).deployed).toBe(true);
    live = { status: 200, body: '3\n' };
    const lower = await guard({ BUILD_DB_VERSION: '2' });
    expect(lower.deployed).toBe(false);
    expect(lower.said).toContain("this build's database version (2) is lower than the live site's (3)");
  });

  it(`this build (database version ${DB_VERSION}: beds' conditions, Nov 2) deploys over the live sites as they are (no db-version.txt yet), or at 2 or 3; never under a higher one`, async () => {
    expect(DB_VERSION).toBe(4);
    for (const l of [{ status: 404, body: 'not found' }, { status: 200, body: '2\n' }, { status: 200, body: '3\n' }, { status: 200, body: '4\n' }]) {
      live = l;
      expect((await guard({ BUILD_DB_VERSION: String(DB_VERSION) })).deployed, l.body).toBe(true);
    }
    live = { status: 200, body: '5\n' };
    expect((await guard({ BUILD_DB_VERSION: String(DB_VERSION) })).deployed).toBe(false);
    // (A revert of this change, a build at 3, is refused once a site has 4: fix forward. docs/releasing.md)
    live = { status: 200, body: '4\n' };
    const reverted = await guard({ BUILD_DB_VERSION: '3' });
    expect(reverted.deployed).toBe(false);
    expect(reverted.said).toContain("this build's database version (3) is lower than the live site's (4)");
  });

  it("deploys where the live site has no db-version.txt yet (the first deploy with one); refuses where it can't be read, or makes no sense", async () => {
    live = { status: 404, body: 'not found' };
    const first = await guard();
    expect([first.deployed, first.said]).toEqual([true, expect.stringContaining('the first deploy with one')]);
    live = { status: 500, body: 'oops' };
    expect(await guard()).toEqual({ deployed: false, said: expect.stringContaining('HTTP 500') });
    live = { status: 200, body: '<!doctype html>' };
    expect((await guard()).deployed).toBe(false);
    // (Nothing answering at all.)
    expect((await guard({ LIVE_URL: 'http://127.0.0.1:9' })).deployed).toBe(false);
  }, 30_000);

  it("refuses any commit but the branch's head (a re-run of an older run), a branch it can't read, a build whose version isn't known", async () => {
    live = { status: 200, body: '2\n' };
    const older = await guard({ SHA: sha.older });
    expect([older.deployed, older.said]).toEqual([false, expect.stringContaining(`${sha.older} isn't the head of release (${sha.head})`)]);
    expect((await guard({ BRANCH: 'nowhere' })).deployed).toBe(false);
    expect((await guard({ REPO_URL: join(repo, 'missing') })).deployed).toBe(false);
    for (const v of ['', 'two', '2a']) expect((await guard({ BUILD_DB_VERSION: v })).deployed).toBe(false);
    // (The repository's address, which in CI holds a token, is never said.)
    expect((await guard({ SHA: sha.older })).said).not.toContain(repo);
  });
});

describe("the build's db-version.txt", () => {
  it('is src/db.ts DB_VERSION, emitted at the root of every build', () => {
    expect(dbVersionOf(readFileSync('src/db.ts', 'utf8'))).toBe(DB_VERSION);
    expect(() => dbVersionOf('const DB_VERSION = 2;')).toThrow(/DB_VERSION/);
    const emitted: { fileName: string; source: string }[] = [];
    const plugin = dbVersionFile('src/db.ts');
    (plugin.generateBundle as unknown as (this: unknown) => void).call({ emitFile: (f: { fileName: string; source: string }) => { emitted.push(f); } });
    expect(emitted).toEqual([expect.objectContaining({ fileName: 'db-version.txt', source: `${DB_VERSION}\n` })]);
  });

  it('is checked in CI before each deploy: app.fullgrown.garden from release, next.fullgrown.garden from main', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const deploy = ci.slice(ci.indexOf('\n  deploy:\n'), ci.indexOf('\n  next:\n'));
    const next = ci.slice(ci.indexOf('\n  next:\n'));
    expect(deploy).toMatch(/LIVE_URL: https:\/\/app\.fullgrown\.garden\n\s+BRANCH: release\n/);
    expect(deploy.indexOf('deploy-guard.sh')).toBeGreaterThan(-1);
    expect(deploy.indexOf('deploy-guard.sh')).toBeLessThan(deploy.indexOf('actions/deploy-pages'));
    expect(deploy).toContain('BUILD_DB_VERSION: ${{ needs.test.outputs.db_version }}');
    // (The guard's checkout keeps no token in its git config: the second review, Nov 1.)
    expect(deploy).toMatch(/sparse-checkout: scripts\/release\n(\s+#.*\n)*\s+persist-credentials: false\n/);
    expect(next).toMatch(/LIVE_URL: https:\/\/next\.fullgrown\.garden\n\s+BRANCH: main\n/);
    expect(next.indexOf('deploy-guard.sh')).toBeGreaterThan(next.indexOf('npm run build'));
    expect(next.indexOf('deploy-guard.sh')).toBeLessThan(next.indexOf('git push'));
    expect(ci).toContain('echo "db_version=$(cat dist/db-version.txt)" >> "$GITHUB_OUTPUT"');
    // (A re-run of a run from before the guard uses that commit's workflow, with no guard: said where releases are.)
    expect(readFileSync('docs/releasing.md', 'utf8')).toContain('**Never use "Re-run" on a CI run from before the deploy guard**');
  });
});
