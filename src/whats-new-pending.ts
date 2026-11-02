// What's new lines waiting for the release not yet out: a file a pull request, src/whats-new/next/<name>.json, each a
// JSON list of lines, so pull requests open side by side never change the same lines (they did when each added its
// lines to src/whats-new.json, and every merge of main had to settle it). The app joins them to the releases in
// src/whats-new.json; right after a release, scripts/release/whats-new-fold.mjs moves them in, with its date.
//
// No imports and only plain TypeScript, so the check (scripts/release/whats-new-check.mjs, run by Node, which reads
// .ts files whose types it can strip) joins them by this same code.

export interface Release {
  /** One more than the release below it: what this device has seen is kept by it. */
  id: number;
  /** The day it shipped, YYYY-MM-DD; "next" for the one not yet out (a release build shows its build day). */
  date: string;
  /** What's new, a line each. */
  items: string[];
}

/** A waiting file: its name (e.g. "pins-sooner.json") and its lines. */
export type Pending = [name: string, lines: string[]];

/**
 * The releases with the waiting lines added, by file name: to the top release if it's dated "next", else to a new
 * one, dated "next". (Within a release, its lines from src/whats-new.json come first.)
 */
export function withPending(dated: Release[], pending: Pending[]): Release[] {
  const lines = [...pending].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).flatMap(([, l]) => l);
  if (!lines.length) return dated;
  const [top, ...rest] = dated;
  if (top?.date === 'next') return [{ ...top, items: [...top.items, ...lines] }, ...rest];
  return [{ id: (top?.id ?? 0) + 1, date: 'next', items: lines }, ...dated];
}

/** What's wrong with a waiting file, in words; none: []. */
export function pendingProblems(name: string, lines: unknown): string[] {
  if (!/^[a-z0-9][a-z0-9-]*\.json$/.test(name)) return [`src/whats-new/next/${name}: name it like the branch, in small letters, digits and hyphens (e.g. pins-sooner.json).`];
  if (!Array.isArray(lines) || !lines.length || !lines.every((l) => typeof l === 'string' && l.trim())) return [`src/whats-new/next/${name}: it must be a JSON list of lines, at least one, e.g. ["The pins shrink sooner as you zoom out."].`];
  return [];
}
