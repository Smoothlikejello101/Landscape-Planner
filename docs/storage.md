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
  written without them, is kept apart from a plan saved at 4, not put over it. (Sync: `withBedConditions`, below.) Sync
  records gain `marks` (Nov 4: where a cleared mark may go, below), which no page before it writes or reads.
- 5 (Nov 4): no store or record changed. A photo's rough scale (`roughScale`) and the sides of a shape typed as
  numbers (`measured`), which a version-4 page would drop, saving or syncing a plan. A version-4 page's journal, written
  without them, is kept apart from a plan saved at 5, not put over it (checked: at 4 it went in place, both lost).
  (Sync: `withRoughScale` and `withMeasuredSides`, below.)
- 6 (Nov 4): no store or record changed. A plan's print choice for the plants under taller ones (`print.under`, until
  then kept per device), which a version-5 page would drop, saving or syncing a plan. A version-5 page's journal,
  written without it, is kept apart from a plan saved at 6, not put over it (checked: at 5 it went in place, the choice
  lost). (Sync: `withPrintUnder`, below.)

When raising it:
1. Add a line to the history beside `DB_VERSION`: the version, the day, what changed.
2. `onupgradeneeded` only adds stores that are missing. It never deletes, clears or rewrites a store or a record. A
   change that must rewrite records does it after the open, in one transaction (`KV.changeAllOnce`, as
   `takeFromDevice` does), so nothing another tab saves meanwhile is put back as it was read.
3. Test the upgrade from the version before, with real data in it (tests/storage.test.ts: "the upgrade from 1 keeps
   every store and record", "the upgrade from 2 keeps every store and record", "the upgrade from 3 keeps every store
   and record", "the upgrade from 4 keeps every store and record", "the upgrade from 5 keeps every store and record"),
   the page of the version before told (tests/fixtures/db-v2.ts, db-v3.ts, db-v4.ts, db-v5.ts: that version's
   src/db.ts, verbatim), and the migration spec against e2e/fixtures/legacy-app.
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
to `''` still is, and goes up. Since Nov 4, `''` goes only where the server's copy had a dismissal on that copy when
this device last sent or took the plan (src/marks.ts `mayMark`, the same rule as a bed's `{}`, below). Dismissed here
and taken away before it was ever sent, it goes, as it was.

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
- **Where `{}` goes** (src/marks.ts `mayMark`): taking answers away (clearing them, or Undo or Redo) leaves `{}` only
  on a bed whose answers the server's copy had when this device last sent or took the plan. Each sync record keeps
  those beds' ids (its `marks`, src/sync/engine.ts `marksOf`, from the server's copy only, not this device's own parts
  filled in), so it holds across restarts and goes with the records when the account changes. Anywhere else (set here
  and taken away before they were ever sent, a plan that doesn't sync) they're none again, as they were: a `{}` would go
  up with the next edit and take away, everywhere, answers another device has that this one never got, an older version
  having dropped them on the way. Where it does go, the clear reaches every device, as it should. Saying no only ever
  lets answers come back from another device's copy, never erases them: an upload whose answer was lost (a dropped
  connection) isn't recorded, so a clear right after leaves none and the answers come back once from the server. So
  does an edit from a device on release 3 between this device's send and its clear: the server's copy it then takes
  has none, so the clear leaves none, and another device of this version brings the answers back with its next edit;
  a second clear sticks. (The
  independent review, Nov 4, in three rounds: through Undo, through clearing, and across a restart.) A fruit-partner
  dismissal taken away follows the same rule (`''`).
- **Undo or Redo** taking them away leaves `{}` by that rule (src/history.ts `conditionsCleared`).
- A bed **made something else** loses them, in that step; a shape **made a bed** starts with `{}` (src/mutations.ts
  `setRoleForIds`), so conditions it had as a bed before, still on a device offline through both changes, aren't
  filled back in.
- `setBedConditions` (src/mutations.ts) sets this version's answers as one step, the whole set of them (a question
  left out, false or null is no answer: drip unticked), keeping a later version's questions on the bed as they are.
  Nothing answered clears them, by the rule above; on a bed with none it does nothing. It takes only the questions this
  version asks (`BedAnswers`), so a typo isn't kept as a later version's question.
- **A rule for later versions:** a question they add must have a word or true as its answer, or a sync guard of its
  own (like `withBedConditions`). This version keeps those and drops anything else, and its next upload would then lose
  it everywhere. The same goes for a new form of an answer this version asks (a sun with hours, soil as a list).

Versions of database version 3 and before (release 3 is at 1, Next at 3 until this change) drop them: on this device the
database version stops such a page saving over a plan saved at 4, and its journals are kept apart. Through sync, each
device of this version keeps its own when the server's copy of that bed (its id, still a bed) has no `conditions` at all
(src/sync/engine.ts `withBedConditions`), `{}` included, so a device that cleared them says so again with its next edit.
The server's copy goes without them until a device that has them sends the plan again: until then they're only on the
devices of this version that had them, and a device reset or signed out meanwhile takes its copy with it.

The windows left, as for `fruitDismissed` and wider, all only while one of the account's devices is on database version
3 or before and syncs: Next never signs in, so in practice a device still on release 3 (database version 1), until it
updates:
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

## A photo's rough scale, and sides typed as numbers (database version 5, Nov 4)

Two optional fields, in one change (Jason, Nov 4: "one"). Nothing in a plan from before has either, and nothing is
worked out for one: an old photo has no rough scale, an old shape no sides typed. Opening a plan from before writes
nothing new into it; a plan without them reads, saves and syncs exactly as before (the same fingerprints).

### What's stored

- **`BgImage.roughScale?: true`** (src/types.ts): the photo's scale was set from a length said to be a rough guess (the
  checkbox in the box asking how far A is from B). Read as src/storage.ts `migrateBgImage` has it: kept when it's `true`
  and the photo isn't also `uncalibrated` (a scale not set yet isn't rough; that one wins); anything else is none.
  Setting the scale sets it (ticked) or takes it away (not ticked); nothing else touches it, so it always goes with a
  scale. It goes with the photo everywhere the photo goes: the plan record's `bgImage`, the journal, backups and plan
  files, the support file, Undo steps (a calibration undone takes it back with the scale), and sync's photo reference
  (`PhotoRef`, src/storage.ts `photoRefOf`, `sanitizePhotoRef`).
- **`measured?: { side: number; ft: number }[]`** on a rectangle, an outline or a line (src/types.ts `MeasuredSide`):
  the sides whose lengths were typed as numbers, and the feet typed. An outline's or a line's side `side` runs from
  point `side` to the next (an outline's last, back to its first); a rectangle's sides are 0 top, 1 right, 2 bottom, 3
  left, as it is before it's turned, which is the order its outline has once it's made one, and a typed Width is both 0
  and 2. Read as src/measured.ts `sanitizeMeasured` has it, from src/storage.ts `migrateShape`: each entry a whole
  number from 0 to one less than the shape's sides, each side once (the first kept), `ft` a number above 0 and at most
  5,000; anything else in an entry, or an entry that isn't one, is dropped and the rest kept; none left, no field. Kept
  on a rectangle, an outline or a line only (an oval, a triangle, a circle or a note is left without it). On an outline
  or a line, kept only while every point came through (a point that can't be read is dropped, and the sides after it
  would shift: then none is kept). Never the plan or the shape: whatever the field holds, the shape is read as it would
  be without it. Typed from: the drawing bar's length for the next side (an outline, a line, a path, a rectangle's two
  sides) and a rectangle's Width and Length in its edit pane. Not from an outline's or a line's Width and Length (they
  stretch its box, not a side), an oval's, an older plan's triangle's, a circle's size, a path's width or a door's.

### When a side typed is forgotten (the rule)

A remembered side counts while that side is the length typed, within 0.05 ft, and only then (src/measured.ts
`measuredSides`, which Rescale will use, returns only those). A step that leaves it at another length takes it off the
shape as the step is recorded (src/history.ts `pushHistory`, with the change that records sides typed); adding or
taking out a point renumbers the sides after it, and forgets the sides it split or joined, so a number never moves onto
another side. A side changed and changed back may count again: another device's copy that still has it brings it back
(the shape side for side as there), and so does this device's own plan as saved, after a restart (the save, a quarter
second after an edit, comes before the step that takes it off, at 0.6 s). That's harmless: the side is the length typed
again. Examples:

- A house drawn 30 by 20 ft, both typed: sides 0 and 2 are 30, 1 and 3 are 20. Moved, turned 12°, nudged, copied, pasted
  or duplicated: all four kept. Made an outline: all four, the same sides of the outline.
- Its Width typed 32 in the edit pane: 0 and 2 are 32 now (typed again), 1 and 3 still 20. Its width dragged with a
  handle to 31: 0 and 2 forgotten; dragged back to 32, they stay off here, but may come back from another device's
  copy, or the plan as saved (above): it's 32 again. Undo brings them back with the size they were typed for; Redo
  takes them away again.
- An outline with side 2 typed 7.5: a point added on side 0 (two sides now, neither typed) makes side 2 side 3, still
  7.5. A point added on side 2 forgets it, even if the new point is dragged so one half is 7.5 ft. Point 2 taken out
  (where sides 1 and 2 met): side 2 is forgotten, the sides after it move down one.
- A corner dragged: the two sides at it forgotten (unless the drag leaves them their length, within 0.05 ft), the rest
  kept. An outline stretched taller: its upright sides forgotten, its level ones kept.
- A typed side that closed an outline at its first point is kept only if it came out that long (closing moves its end
  onto the first point). Squaring after drawing leaves a typed side's ends where they are; setting a rectangle level
  turns it whole: both keep their typed sides.

Older versions can't break the rule: they read a shape into a new object of the fields they know, so they drop
`measured` whole whenever they save or sync the shape; they never keep a stale one on a side they've reshaped.

### Older versions, and sync

What a version without them does (read from the release's code, `origin/release` at bdeb911, and tested with it:
tests/fixtures/release-migrate-shape.ts and release-photo.ts, verbatim): it **drops them, and nothing else**. Its
`migrateShape` builds each shape from the fields it knows, its `migrateBgImage` the photo; it doesn't refuse the plan,
or any shape, or the photo. So the worst it can do is lose the new fields: on this device, the database version stops it
saving at all (a version-4 page is told and lets go; one opened later is refused), and its journals are kept apart from
a plan saved at 5. Through sync (a device still on the release: Next never signs in):
- It takes a plan with them and sends nothing back for that alone (its record is of the copy as it keeps it).
- Its own edit (anything: a tick in the Plant list, the photo moved) sends the plan without them. Each device of this
  version keeps its own where the server's copy says nothing of them (src/sync/engine.ts). A shape's sides typed, side
  by side (`withMeasuredSides`): the server's copy's own entries stand, and one here for a side they don't name is kept
  only where it's provably the same side and still the length typed: a rectangle with that dimension the same (its
  Width for sides 0 and 2, its Length for 1 and 3), an outline or a line with as many points and both ends of that side
  where they are here. Moved or turned there, kept; that side changed there, or a point added or taken out (the sides
  perhaps renumbered), not. So a typed Length here stays beside a Width typed on a device that never had them (the
  review's R4: a release device's tick had sent the plan without them, and a tablet took it then). The photo's
  `roughScale` when the server's is the same photo at exactly the same scale, and says neither rough nor not to scale
  yet (`withRoughScale`). The server's copy goes without them until a device that has them sends the plan again (any
  edit).
- The fingerprints leave them out (`planHash`, `coreHash`: `measured`; `photoKey`: `roughScale`). This version changes
  them only with the sides, or the scale, they're about, which the fingerprints see anyway; seen, a release device's
  tick or photo move would read here as a change to the plan or the photo there, and a copy would be made against a
  shape reshaped, or a scale set again, here (tested: both copies, without it). So a side typed again at the length it
  already has, alone, goes up with the next edit, not by itself. On this device, though, a download that brings or
  changes them is a change to the plan (its "last modified": src/storage.ts replaceProjectContent), so an older tab's
  unsaved edit from before it is kept apart, not put over it (the review's J1).
- Reshaped on the release device, a shape's sides typed are lost (the honest rule: this device can't tell what changed).
  Its scale set again there (no checkbox there), the rough scale is gone too.

Found on the way, and fixed here (src/storage.ts `placePhoto`): a synced placement of the same photo was laid over this
device's own, so a field the incoming one didn't have stayed: a scale set on another device left "Not to scale yet" here
(`uncalibrated`), and this device's next sync pass sent it back (its photo no longer what its record says), so for
every device. Now the incoming placement is the whole of how the photo sits, `uncalibrated` and `roughScale` included.
Its one cost: a build from before Oct 30, which has no word for "not to scale yet", sending the same photo (moved, say)
now clears it here, where before it stayed. Builds from release 3 on send it, so that's accepted.

The release still does it (tested with its own engine: tests/sync-release.test.ts). A scale set here, while a device on
the release holds that photo as "not to scale yet": the release takes the new scale and keeps its own "not to scale
yet", and its next sync pass, with no edit there, sends that back. Here, the flag flips back ("Not to scale yet" in
Layers again) and the rough scale goes with it (never both); the scale set here stays, and it settles there. Setting it
again here does the same, until that device updates.

The windows left, both between devices of this version (no release device needed), and both only about the marks:
- A rough scale taken away on purpose (the scale set again, the box not ticked) at exactly the same scale as before (the
  same image pixels, the same length) changes nothing the fingerprints see, and looks like a release device's copy:
  another device that had it keeps it, and sends it again with its next edit. Setting the scale again almost never gives
  exactly the same number.
- A side typed again at the length it already has changes nothing the fingerprints see, so it waits for this device's
  next edit to go up. If another device's edit comes down first, it's kept side by side (above), unless the server's
  copy names that side too: then the server's stands.

## A plan's print choice for the plants under taller ones (database version 6, Nov 4)

Print and Export's "Plants under taller ones: Show through / As on screen" (#228) was kept per device, in localStorage
`lp-print-under`; since Nov 4 it's kept with the plan, beside its other print settings (Jason: "Add the storage to keep
this print option to the plan"). Nothing in a plan from before has it, and nothing is worked out for one: opening a plan
from before writes nothing new into it, and a plan without it reads, saves and syncs exactly as before (the same
fingerprints).

### What's stored

- **`PrintSettings.under?: 'windows' | 'screen'`** (src/types.ts), in the plan's `print`: Show through (each taller
  plant faded where it covers a shorter one) or As on screen (solid, the plants under them numbered dots with a key).
  Read as src/storage.ts `sanitizePrint` has it: either word kept; anything else is none, and the rest of the print
  settings kept, never the plan.
- **Absent: never picked in this plan.** It prints Show through, the default, except on a device that had As on screen
  before plans kept it (below). Nothing is written for it until someone picks one in Print or Export
  (src/view-settings.ts `setPrintUnder`, an edit of the plan); picking the one already shown does nothing. Once picked,
  Show through too, it's kept as picked (`'windows'`), so sync can tell it from a copy an older version sent without it.
- It goes wherever the print settings go: the plan record, the journal, backups and plan files, the support file, and
  sync's content. (Print settings aren't in Undo steps, and nor is it.)

### The device's earlier choice (`lp-print-under`)

Devices that ran #228's build (Next, from its merge to this change's) may hold it. A plan never picked starts from it on
that device: src/view-settings.ts `underFromThisDevice`, read once as the app starts (the first time it's asked for, and
again at `loadViewSettings`). Only `'screen'` changes anything (anything else is Show through, as before). It's never
written to the plan for that, not even when the plan is saved for another edit (the plan's print settings keep none);
picking one in Print or Export writes the plan's. Nothing writes the device's key any more: it stays as #228 left it,
read only for this, and stays listed in src/support.ts. So on such a device, every plan never picked (one made since, or
come from a file or another device, too) prints As on screen there until one is picked for it; anywhere else, Show
through.

### Compared

- **The sync fingerprints** (src/sync/engine.ts `forHash`) read Show through picked as none picked: they print the same.
  So As on screen and back before the plan synced isn't a change of its own (no conflict copy against another device's
  edit), while As on screen to Show through still is, and goes up. Unlike database version 5's fields, a pick is in the
  fingerprints: it changes nothing else they see, so left out it would never go up by itself, and another device's next
  edit would put the server's copy over it.
- **A journal against its plan, an imported plan against one already here** (src/storage.ts `contentKey`,
  src/backup.ts `planContent`) compare it as this device prints it (src/view-settings.ts `underOf`): Show through
  picked and none picked are the same, except on a device that had As on screen before, where they aren't.
- **A download** that changes what's stored for it, picked or not, is a change to the plan (its "last modified":
  src/storage.ts replaceProjectContent), as for sides typed.

### Older versions, and sync

What a version without it does (read from the release's code, `origin/release` at bdeb911, and Next's before this
change, `origin/main` at f563063: the same function; tested with it: tests/fixtures/release-print.ts, verbatim): its
`sanitizePrint` builds the print settings from the fields it knows, so it **drops this choice, and nothing else**; it
doesn't refuse the plan, or its print settings. On this device, the database version stops a version-5 page saving at
all (one open is told and lets go, its unsaved edits written first; one opened later is refused), and a journal of one,
written without it, is kept apart from a plan saved at 6, both whole. (Rarely: a version-5 page told of the newer version
writes nothing more, not even a journal, and one it wrote before is replayed at the newer version's first start, against
the plan as that page left it, so it goes in place as before.) Through sync (a device still on the release: Next never
signs in):
- It takes a plan with it and sends nothing back for that alone (its record is of the copy as it keeps it).
- Its own edit (anything: a tick, the photo moved) sends the plan without it. Each device of this version keeps its own
  where the server's copy's print settings say nothing of it at all (src/sync/engine.ts `withPrintUnder`); where they
  have one, it stands. The server's copy goes without it until a device that has it sends the plan again (any edit).
- **No conflict copy from it.** Kept from here, the choice picked again here would make the server's copy read as
  changed there, and a copy would be made against any other edit of the plan here. So the merge also checks the
  server's copy as this device's record has it with the choice put back as it was, none or As on screen
  (`asRecordedButUnder`): only the field dropped, and nothing else in the plan changed there, isn't a change there
  (tested: without it, a copy). Found on the way, and not changed here: a bed's conditions (`withBedConditions`) have
  that flaw still. A bed's conditions changed here with any other edit of the plan, while a device on the release ticks
  a plant, makes a conflict copy (both kept, nothing lost).

The windows left, both only while one of the account's devices is on the release and syncs:
- A device offline through another device's pick, with the release sending the plan in between, still has its own,
  which the server's copy no longer contradicts. It keeps it, and whichever of the two sends the plan first (any edit)
  decides for everyone.
- A device of this version that took the plan only after the release sent it without the choice prints Show through
  until a device that has it sends the plan again; picked on it meanwhile, its pick goes up and stands.

A rule for later versions: a third way of drawing them would be dropped by this version (anything but the two words is
none), and its next upload would lose it everywhere; it needs a guard of its own.

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
