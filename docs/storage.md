# Storage, and older versions of the app

Plans live in the browser's IndexedDB, in the database `landscape-planner` (src/db.ts), in four stores: `meta`,
`projects`, `images` and `kv` (src/storage.ts lists what's kept where). localStorage holds the unsaved-edit journals
(`lp-journal:<plan id>@<page>`; release 3 and before, `lp-journal:<plan id>`), this device's own settings, and the copy
made by versions before Oct 11, which used it for plans.

## The database version: the rule

`DB_VERSION` (src/db.ts) goes up whenever what's stored changes in a way an older version of the app would lose data
saving over it. That's nearly every change to what's stored: a new field in a plan or a shape (an older version reads a
plan through its own `sanitizeProjectData` and drops what it doesn't know, then saves that), a new part of a plan, a
new record an older version would read wrongly. When in doubt, raise it: it costs nothing but the old tabs reloading.

It guards because once a page opens the database at a higher version, no page of an older version can use it:

- **A page open already** (another tab or window, on the phone or the computer) is told, and closes the database at
  once: every version since Oct 11 does. What it says, and what it does first, depends on its version:
  - version 2 on: it writes its unsaved edits first (in before the newer version's upgrade, which waits for it), then
    saves nothing more, not even a journal, and says "FullGrown was updated in another tab or window. This page will
    reload into the new version." Its Reload puts in a newer version the service worker has waiting (the person asked
    for it); putting the message away (Esc, Back, a tap beside it, another question over it) only reloads the page;
  - release 3 and before (Oct 11 to Nov 1): "The app was updated in another tab. This page will reload." (an alert
    until Oct 30), then a reload. An edit still waiting for its save (a quarter second) isn't written to the database:
    its failed save, or the page going, writes it to a journal (below).
- **A page that opens after** (a stale cached copy, a tab restored from long ago) is refused with a `VersionError`:
  - version 2 on: it says a newer version of FullGrown saved the plans on this device, and offers Reload; it reads and
    writes nothing, and never falls back to memory. Reload puts in a newer version the service worker has found or has
    waiting, and never happens by itself, so a page that still can't get one shows the message again rather than
    looping. "Save a raw copy as a file" saves every record, as stored, without changing anything: for when no version
    can open the plans (it isn't a backup Import reads);
  - release 3 and before: they try again, then fall back to memory. On a device that has used IndexedDB (localStorage
    keeps `lp-idb-in-use`), they stop with "Your projects couldn't be opened: the browser's storage didn't respond",
    writing nothing. If localStorage was cleared but not IndexedDB, they run on memory with an empty "My Garden": the
    plans look gone, and nothing done there is kept on the device (nothing is written to IndexedDB or to journals).
    But signed in, with sync on, that page syncs: it sends its empty "My Garden" up to the account as a new plan, which
    every device then gets. (It deletes nothing there: it knows no plans to delete.)
- **A page that can't answer** (frozen in the background, stopped in a debugger) holds the newer page's open. That page
  says to close FullGrown's other tabs or windows, and goes on once it's closed.

Left at the same version, an older page goes on saving its copy of a plan over the newer one. That's what happened on
Nov 1: release 3 changed what's stored (each plan's ticks, yard and switches; sync records' `core` and `parts`) at
version 1, and a buried line lost its role and became a plain shape. Version 2 (Nov 1) changes no store or record; it
was raised so older pages can't save over release 3's plans.

The history (src/db.ts keeps it beside `DB_VERSION`):
- 1 (Oct 11): the four stores.
- 2 (Nov 1): no store or record changed. Raised for release 3's plans (each plan's ticks, yard and switches; sync
  records' `core` and `parts`), and from it each plan record and journal carries the version that wrote it.
- 3 (Nov 2): no store or record changed. Plant shapes' `fruitDismissed` (a fruit-partner warning dismissed for one
  plant), which a version-2 page would drop, saving or syncing a plan. A version-2 page's journal, written without it,
  is kept apart from a plan saved at 3, not put over it. (Sync has its own guard for versions before the field: a
  device that has it keeps it when the server's copy has none, src/sync/engine.ts `withFruitDismissals`.)
- 4 (Nov 2): no store or record changed. Beds' `conditions` (Plant this bed: soil, moisture, drip, and sun where no
  sun area covers the bed), which a version-3 page would drop, saving or syncing a plan. A version-3 page's journal,
  written without them, is kept apart from a plan saved at 4, not put over it. (Sync: `withBedConditions`, below.)

When raising it:
1. Add a line to the history beside `DB_VERSION`: the version, the day, what changed.
2. `onupgradeneeded` only adds stores that are missing. It never deletes, clears or rewrites a store or a record. A
   change that must rewrite records does it after the open, in one transaction (`KV.changeAllOnce`, as
   `takeFromDevice` does), so nothing another tab saves meanwhile is put back as it was read.
3. Test the upgrade from the version before, with real data in it (tests/storage.test.ts: "the upgrade from 1 keeps
   every store and record", "the upgrade from 2 keeps every store and record", "the upgrade from 3 keeps every store
   and record"), the page of the version before told (tests/fixtures/db-v2.ts, db-v3.ts: that version's src/db.ts,
   verbatim), and the migration spec against e2e/fixtures/legacy-app.
4. A storage change gets a pull request of its own (CLAUDE.md).

**Never lower it, and never deploy a build with a lower one** (a rollback, a revert, a re-run of an older CI run):
every device that opened the newer build would refuse to open its plans until a build at least that new is deployed
again. Fix forward instead. CI enforces it (scripts/release/deploy-guard.sh, before `deploy` and `next`): each build
publishes its version as `db-version.txt` at the site's root, and a deploy fails if the build's is lower than the live
site's (a site without the file, the first deploy with one, is allowed; one that can't be read is not), or if the
commit isn't the head of the branch being deployed.

## Journals (unsaved edits)

When a page is hidden or closed with edits not yet saved, it writes them to localStorage, synchronously, under its own
key (`lp-journal:<plan>@<page>`, the page new each time the app opens), and clears only its own once the edits are
saved: never another tab's, nor one an older version wrote (keyed by the plan alone), which may hold the only copy of an
edit. Each journal, and each plan record, carries the database version and the page that wrote it (`dbVersion`, none
meaning 1; `page` and `savedByPage`), and that page's edit count then (`seq` and `savedSeq`: a count, not a time, so a
clock set back can't make a journal look older than it is).

The next start goes through them (src/storage.ts `replayJournals`), one page at a time where the browser has Web
Locks (waiting at most 5 seconds for its turn, then going on without), newest first, by when each was written. For
each:
- the same as its plan as stored (what it holds, and which photo where): removed, nothing written;
- written after the plan last changed: put in place, stamped with the journal's own version and page (so an older
  tab's next journal, more of the same edits, goes in place too), unless that would lose something: when it's from an
  older version than the one that last wrote the plan, or it lacks a part the stored plan has and every save keeps once
  set (location, dismissed warnings, the Plant list's ticks, who's in the yard, the warning switches);
- written before the plan last changed: removed only when the page that wrote it saved the plan since with at least
  as many edits (that save holds everything the journal had); otherwise (an older version's, another page's, or the
  plan renamed or synced since) never dropped.
Newest first, so of two journals for one plan from pages that never saw each other's edit, the newer is put in place
and the older, now from before the plan's last change, is kept apart.
A journal not put in place is kept as a plan of its own, "<name> (from an older tab)", both left whole, and the app
says so. Its id comes from the journal, so two pages starting together make one such plan, not two; and none is made
when a plan already kept apart from the same plan holds the same (a release 3 tab left open with an unsaved edit
writes its journal again each time it's hidden). A journal from a newer version than the running one is left alone.

The limit: localStorage holds about 5 MB for the site. While saves keep failing (a full disk), each page that closes
leaves its own journal, and they stay until a start can write them in; after many such closes, a new journal may not
fit, and then it isn't written (a journal too big with its photo's bytes is written without them first). The warning
bar says the changes aren't saved all along.

## `fruitDismissed` through sync, while a device is still on the release

The release (and any version before Nov 1) sends plans without `fruitDismissed`, even over a newer one: its merge can't
see it. So each device of this version keeps its own when the server's copy of that plant's shape has none at all:
words (dismissed for that plant alone), or `''` (shown again on purpose: Show again, or Undo taking one away), which
is never filled back from another device's words. A `''` reads as none in the plan's fingerprint, so a dismissal taken
back before the plan synced isn't a change of its own (no conflict copy against another device's edit), while words
to `''` still is, and goes up.

The window left: a device offline through another device's Show again, with a device on the release sending the plan
in between, still has the words, and the server's copy no longer says otherwise. It keeps them; if it sends the plan
(any edit) before the device that showed it again does, the dismissal comes back for everyone; if that one sends
first, its `''` goes up and the offline one takes it. Only while one of the account's devices is on the release.

## A bed's `conditions`, and older versions

A bed's conditions (Plant this bed, Nov 2: src/types.ts `BedConditions`) are stored on the bed shape, answers only:
its soil, its moisture, drip irrigated, and its sun where no sun area covers it (the sun worked out from sun areas is
never stored). `migrateShape` keeps them on a bed only, each part checked: a word a later version adds is kept as it
came, and so is a question a later version adds whose answer is a word or true (dropped, it would be lost for everyone
the next time this device sent the plan); a part that isn't one is dropped and the rest kept, never the plan. `{}` is
cleared on purpose, kept, and read as none wherever two copies are compared for what they hold (the sync fingerprints,
a journal against its plan, an imported plan against one already here: src/sync/engine.ts `withoutClearedMarks`), as a
`''` dismissal is.

How they travel within a plan:
- **Duplicate** copies them with the bed; **Copy and Paste** carry them (pasted as a stored plan's shapes are read).
- **Undo or Redo** taking them away leaves `{}` (src/history.ts `conditionsCleared`), so another device's copy isn't
  filled back in, but only on a bed that had them in the plan's first undo step (as it was opened, or replaced by
  sync). Answers set here for the first time and undone are none again, as they were: a `{}` would go up with the next
  edit and take away, everywhere, answers another device has that this one never got, an older version having dropped
  them on the way (the review, Nov 4). The cost: answers set, sent, then undone here come back from another device's
  copy, rather than being lost everywhere. A fruit-partner dismissal undone follows the same rule (`fruitShownAgain`).
- A bed **made something else** loses them, in that step; a shape **made a bed** starts with `{}` (src/mutations.ts
  `setRoleForIds`), so conditions it had as a bed before, still on a device offline through both changes, aren't
  filled back in.
- `setBedConditions` (src/mutations.ts) sets them as one step, the whole set: a question given as false or null is no
  answer (drip unticked); nothing answered on a bed with some clears them to `{}`; on a bed with none it does nothing (a
  `{}` there would take away, everywhere, answers another device has that this one never got).

Versions of database version 3 and before (release 3 is at 1, Next at 3 until this change) drop them: on this device the
database version stops such a page saving over a plan saved at 4, and its journals are kept apart. Through sync, each
device of this version keeps its own when the server's copy of that bed (its id, still a bed) has no `conditions` at all
(src/sync/engine.ts `withBedConditions`), `{}` included, so a device that cleared them says so again with its next edit.
The server's copy goes without them until a device that has them sends the plan again: until then they're only on the
devices of this version that had them, and a device reset or signed out meanwhile takes its copy with it.

The windows left, as for `fruitDismissed` and wider, all only while one of the account's devices is on database version
3 or before:
- A device offline through another device's change to a bed's conditions (set, changed or cleared), with a device on an
  older version sending the plan in between, still has its own, which the server's copy no longer contradicts. It keeps
  them, and whichever of the two sends the plan first (any edit) decides for everyone: the offline one's older answers
  can replace the newer ones.
- A device on an older version turns the bed into something else and back (a bed, then lawn, then a bed). A device of
  this version that missed both changes still has the answers, sees a bed with none on the server, and keeps them; its
  next edit brings them back for everyone. (The `{}` a shape made a bed starts with covers this only when a device of
  this version makes the change.)
- A device of this version that never had them (it took the plan only after an older version had sent it without them)
  shows none until a device that has them sends the plan again; answers set on it in the meantime go up and stand.

## Two tabs on the same version

Both can edit the same plan, and the last save wins: there's no check that the plan changed since a page read it. A
fix would compare, at each save, the stored plan's change count (or `lastModified`) with the one the page read, and keep
the page's copy apart (as journals are) or merge, when another page saved in between.

## Versions before Oct 11

They kept plans in localStorage and never opened IndexedDB, so the database version doesn't stop them. Every start
copies in what such a page saved since the last start (`migrateFromLocalStorage`). A plan changed on both sides is kept
twice ("(from older version)"), and so is one whose stored copy has a part the older copy can't have (its ticks, yard,
switches, dismissed warnings, location: on every device since release 3's first start, the yard and switches): the
older copy put over it would take them away. Otherwise the older page's copy replaces the IndexedDB one.
