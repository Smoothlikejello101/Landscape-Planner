# What's new, waiting for the next release

A pull request with a change people will notice adds its What's new lines here, in a file of its own named like its
branch: `pins-sooner.json`, a JSON list of lines.

```json
["The pins marking plants hidden under bigger ones shrink sooner as you zoom out."]
```

The app adds them to the release not yet out (`src/whats-new-pending.ts`), after its lines in `src/whats-new.json`,
file by file in name order. Right after a release, `node scripts/release/whats-new-fold.mjs <its date>` moves them
into `src/whats-new.json`, dated, and empties this folder ([docs/releasing.md](../../../docs/releasing.md)).

Say what people will see, in plain words, not how it was built; no "tap" or "click" (a phone and a computer both
read it).
