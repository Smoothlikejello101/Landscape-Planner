// The release's print settings as stored and synced (what testers run, and what an old tab or another device may still
// be running): copied verbatim from `origin/release` at bdeb911 (release 3, Nov 1), src/storage.ts lines 94-95 and
// 349-367, renamed release*; its DEFAULT_PRINT (src/state.ts there) and isStatus (src/status.ts) are imported from this
// version, unchanged since. Every version before Nov 4's database version 6 (Next's, `origin/main` at f563063, too)
// reads print settings this way: a new object built from the fields it knows, so one it doesn't know (`under`, the
// plants under taller ones) is left out and nothing else changes. Tests read what such a version makes of print settings
// this one saves and syncs (tests/storage.test.ts, tests/sync-engine.test.ts, tests/sync-release.test.ts). Not to be
// edited: it stands for code already out.
import type { PrintSettings } from '../../src/types';
import { DEFAULT_PRINT } from '../../src/state';
import { isStatus } from '../../src/status';

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
/** Validate printable-plan options; anything missing or odd gets the default. */
export function releaseSanitizePrint(raw: unknown): PrintSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PRINT;
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  return {
    paper: o.paper === 'tabloid' || o.paper === 'a4' || o.paper === 'a3' ? o.paper : 'letter',
    orientation: o.orientation === 'portrait' || o.orientation === 'landscape' ? o.orientation : 'auto',
    title: str(o.title).slice(0, 120),
    subtitle: str(o.subtitle).slice(0, 200),
    includeBackground: bool(o.includeBackground, d.includeBackground),
    includeGrid: bool(o.includeGrid, d.includeGrid),
    includePlantList: bool(o.includePlantList, d.includePlantList),
    includeFullRings: bool(o.includeFullRings, d.includeFullRings),
    northDeg: ((num(o.northDeg, 0) % 360) + 360) % 360,
    statusFilter: isStatus(o.statusFilter) ? o.statusFilter : '',
    phaseFilter: str(o.phaseFilter).slice(0, 40),
  };
}
