// What's new, checked against what testers already have (docs/releasing.md):
//   node scripts/release/whats-new-check.mjs <release branch's src/whats-new.json> [--pr]
// - A release that's out (on the release branch) keeps its lines: a new line in it would never be shown to a device
//   that has seen it. New lines go in the release not yet out (the top one, dated "next"; a new one if that's out).
// - Only the top release may be dated "next".
// - With --pr (a pull request into main): a release that's out has its date written in (it's no longer "next").
import { existsSync, readFileSync } from 'node:fs';

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
    if (now.items.length > s.items.length) out.push(`Release ${s.id} is already out, so its new lines would never be shown: put them in release ${pending}, dated "next".`);
    if (pr && now.date === 'next') out.push(`Release ${s.id} is out: write in the day it went out (the release PR's merge day) in place of "next".`);
  }
  return out;
}

if (process.argv[1]?.endsWith('whats-new-check.mjs')) {
  const shippedPath = process.argv[2];
  const current = JSON.parse(readFileSync('src/whats-new.json', 'utf8'));
  const shipped = shippedPath && existsSync(shippedPath) && readFileSync(shippedPath, 'utf8').trim() ? JSON.parse(readFileSync(shippedPath, 'utf8')) : null;
  const problems = whatsNewProblems(current, shipped, { pr: process.argv.includes('--pr') });
  for (const p of problems) console.error(`What's new: ${p}`);
  if (problems.length) process.exit(1);
  console.log(`What's new: ${current.length} releases; ${shipped ? `${shipped.length} out` : 'none out yet'}; fine.`);
}
