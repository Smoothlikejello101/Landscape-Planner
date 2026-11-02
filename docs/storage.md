# Storage, and older versions of the app

Plans live in the browser's IndexedDB, in the database `landscape-planner` (src/db.ts), in four stores: `meta`,
`projects`, `images` and `kv` (src/storage.ts lists what's kept where). localStorage holds the unsaved-edit journals
(`lp-journal:<plan id>`), this device's own settings, and the copy made by versions before Oct 11, which used it for
plans.

## The database version: the rule

`DB_VERSION` (src/db.ts) goes up whenever what's stored changes in a way an older version of the app would lose data
saving over it. That's nearly every change to what's stored: a new field in a plan or a shape (an older version reads a
plan through its own `sanitizeProjectData` and drops what it doesn't know, then saves that), a new part of a plan, a
new record an older version would read wrongly. When in doubt, raise it: it costs nothing but the old tabs reloading.

It guards because once a page opens the database at a higher version, no page of an older version can use it:

- **A page open already** (another tab or window, on the phone or the computer) is told. Every version since Oct 11
  closes the database and says "FullGrown was updated in another tab or window", then reloads when the person
  agrees. From version 2 on, it writes its unsaved edits first (in before the newer version's upgrade, which waits for
  it), then saves nothing more, not even a journal.
- **A page that opens after** (a stale cached copy, a tab restored from long ago) is refused with a `VersionError`. It
  says a newer version saved the plans, and offers Reload; it reads and writes nothing, and never falls back to memory.
  Reload puts in a newer version the service worker has found or has waiting (the person asked for it), and never
  happens by itself, so a page that still can't get one shows the message again rather than looping.
- **A page that can't answer** (frozen in the background, stopped in a debugger) holds the newer page's open. That page
  says to close FullGrown's other tabs or windows, and goes on once it's closed.

Left at the same version, an older page goes on saving its copy of a plan over the newer one. That's what happened on
Nov 1: release 3 changed what's stored (each plan's ticks, yard and switches; sync records' `core` and `parts`) at
version 1, and a buried line lost its role and became a plain shape. Version 2 (Nov 1) changes no store or record; it
was raised so older pages can't save over release 3's plans.

When raising it:
1. Add a line to the history beside `DB_VERSION`: the version, the day, what changed.
2. `onupgradeneeded` only adds stores that are missing. It never deletes, clears or rewrites a store or a record. A
   change that must rewrite records does it after the open, in one transaction (`KV.changeAllOnce`, as
   `takeFromDevice` does), so nothing another tab saves meanwhile is put back as it was read.
3. Test the upgrade from the version before, with real data in it (tests/storage.test.ts: "the upgrade from 1 keeps
   every store and record"), and the migration spec against e2e/fixtures/legacy-app.
4. A storage change gets a pull request of its own (CLAUDE.md).

**Never lower it, and never deploy a build with a lower one** (a rollback): every device that opened the newer build
would refuse to open its plans until a build at least that new is deployed again. Fix forward instead.

## Journals (unsaved edits)

When a page is hidden or closed with edits not yet saved, it writes them to localStorage, synchronously; the next start
puts them in place (src/storage.ts `replayJournals`), unless the plan was saved after the journal. Each journal, and
each plan record, carries the database version that wrote it (`dbVersion`; none means 1). A journal is never put over
its plan when that would lose something: when it's from an older version than the one that last wrote the plan, or it
lacks a part the stored plan has and every save keeps once set (location, dismissed warnings, the Plant list's ticks,
who's in the yard, the warning switches). It's kept instead as a plan of its own, "<name> (from an older tab)", both
left whole, and the app says so. A journal from a newer version than the running one is left alone.

## Two tabs on the same version

Both can edit the same plan, and the last save wins: there's no check that the plan changed since a page read it. A
fix would compare, at each save, the stored plan's change count (or `lastModified`) with the one the page read, and keep
the page's copy apart (as journals are) or merge, when another page saved in between.

## Versions before Oct 11

They kept plans in localStorage and never opened IndexedDB, so the database version doesn't stop them. Every start
copies in what such a page saved since the last start (`migrateFromLocalStorage`): a plan changed on both sides is kept
twice ("(from older version)"); one changed only by the old page replaces the IndexedDB copy.
