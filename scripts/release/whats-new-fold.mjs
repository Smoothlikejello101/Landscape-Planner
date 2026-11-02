// Moves the What's new lines waiting in src/whats-new/next/ into src/whats-new.json, and empties the folder:
//   node scripts/release/whats-new-fold.mjs 2026-11-02   right after a release: the day it went out, written in
//   node scripts/release/whats-new-fold.mjs              before one, to put its lines in order by hand (still "next")
// The lines join the release not yet out as the app shows them (src/whats-new-pending.ts). Then commit
// src/whats-new.json and the removed files (docs/releasing.md).
import { rmSync, writeFileSync } from 'node:fs';
import { joined, NEXT, readHere } from './whats-new-check.mjs';

const date = process.argv[2];
if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error(`"${date}" isn't a day, YYYY-MM-DD.`); process.exit(1); }
const here = readHere();
const { releases, problems } = joined(here);
if (problems.length) { for (const p of problems) console.error(`What's new: ${p}`); process.exit(1); }
const top = releases[0];
if (date) {
  if (top?.date !== 'next') { console.error(`No release is waiting for its date: the top one, ${top?.id}, is dated ${top?.date}.`); process.exit(1); }
  top.date = date;
}
writeFileSync('src/whats-new.json', JSON.stringify(releases, null, 2) + '\n');
for (const [name] of here.pending) rmSync(`${NEXT}/${name}`);
console.log(`What's new: ${here.pending.length} file${here.pending.length === 1 ? '' : 's'} moved in; release ${top?.id}, ${top?.items.length} lines, dated ${top?.date}.`);
