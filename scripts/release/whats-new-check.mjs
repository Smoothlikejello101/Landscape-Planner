// What's new, checked against what testers already have (docs/releasing.md):
//   node scripts/release/whats-new-check.mjs [<the release branch's commit, e.g. origin/release>] [--pr]
// The releases are read as the app builds them: src/whats-new.json's, with the lines waiting in src/whats-new/next/
// (src/whats-new-pending.ts), here and at the release branch's commit.
// - A release that's out (on the release branch) keeps its lines: a new line in it would never be shown to a device
//   that has seen it. New lines go in the release not yet out (the top one, dated "next"; a new one if that's out).
// - Only the top release may be dated "next".
// - With --pr (a pull request into main): a release that's out has its date written in (it's no longer "next").
// - Each waiting file is a JSON list of lines, named like its branch.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { pendingProblems, withPending } from '../../src/whats-new-pending.ts';

export const NEXT = 'src/whats-new/next';

/** The problems, in words; none: []. `shipped`: the release branch's releases (null: it has none yet). */
export function whatsNewProblems(current, shipped, { pr = false } = {}) {
  const out = [];
  const ids = current.map((r) => r.id);
  current.forEach((r, i) => {
    if (r.id !== current.length - i) out.push(`Release ${r.id}: ids must run down to 1, newest first.`);
    if (r.date === 'next' && i > 0) out.push(`Release ${r.id} is dated "next" but isn't the top one: only the release not yet out is.`);
    if (r.date !== 'next' && !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) out.push(`Release ${r.id}: date "${r.date}" isn't YYYY-MM-DD or "next".`);
    if (!r.items?.length) out.push(`Release ${r.id} has no lines.`);
  });
  // (The release not yet out: the top one if it's dated "next" and not on the release branch, else a new one.)
  const pending = current[0]?.date === 'next' && !(shipped ?? []).some((x) => x.id === current[0].id) ? current[0].id : Math.max(0, ...ids) + 1;
  for (const s of shipped ?? []) {
    const now = current.find((r) => r.id === s.id);
    if (!now) { out.push(`Release ${s.id} is out but missing here.`); continue; }
    if (now.items.length > s.items.length) out.push(`Release ${s.id} is already out, so its new lines would never be shown: put them in release ${pending}, dated "next" (lines waiting in ${NEXT}/ go there once release ${s.id}'s date is written in: scripts/release/whats-new-fold.mjs).`);
    if (pr && now.date === 'next') out.push(`Release ${s.id} is out: write in the day it went out (the release PR's merge day) in place of "next": node scripts/release/whats-new-fold.mjs <that day>.`);
  }
  return out;
}

/** The releases as the app builds them, from src/whats-new.json and the waiting files' [name, lines]. */
export function joined({ dated, pending }) {
  const problems = pending.flatMap(([name, lines]) => pendingProblems(name, lines));
  return { releases: withPending(dated, problems.length ? [] : pending), problems };
}

/** src/whats-new.json and the waiting files, in this working copy. */
export function readHere(root = '.') {
  const dir = `${root}/${NEXT}`;
  const names = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')) : [];
  return {
    dated: JSON.parse(readFileSync(`${root}/src/whats-new.json`, 'utf8')),
    pending: names.map((n) => [n, JSON.parse(readFileSync(`${dir}/${n}`, 'utf8'))]),
  };
}

/** The same at a git commit (the release branch's); null where it has no src/whats-new.json (no release yet). */
export function readAt(ref) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let dated;
  try { dated = JSON.parse(git('show', `${ref}:src/whats-new.json`)); } catch { return null; }
  const paths = git('ls-tree', '--name-only', ref, `${NEXT}/`).split('\n').filter((p) => p.endsWith('.json'));
  return { dated, pending: paths.map((p) => [p.slice(p.lastIndexOf('/') + 1), JSON.parse(git('show', `${ref}:${p}`))]) };
}

if (process.argv[1]?.endsWith('whats-new-check.mjs')) {
  const ref = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const here = joined(readHere());
  const atRelease = ref ? readAt(ref) : null;
  const shipped = atRelease ? joined(atRelease).releases : null;
  const problems = [...here.problems, ...whatsNewProblems(here.releases, shipped, { pr: process.argv.includes('--pr') })];
  for (const p of problems) console.error(`What's new: ${p}`);
  if (problems.length) process.exit(1);
  const waiting = readHere().pending.length;
  console.log(`What's new: ${here.releases.length} releases (${waiting} file${waiting === 1 ? '' : 's'} waiting in ${NEXT}); ${shipped ? `${shipped.length} out` : 'none out yet'}; fine.`);
}
