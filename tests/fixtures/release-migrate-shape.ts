// The release's migrateShape (what testers run, and what an old tab may still be running): copied verbatim from
// `origin/release` at bdeb911 (release 3, Nov 1), src/storage.ts lines 94-95, 105-110 and 112-220, renamed
// releaseMigrateShape. Its helpers are imported from this version, unchanged since (`git diff bdeb911 --
// src/features.ts src/status.ts src/roles.ts src/utility-kinds.ts src/geometry.ts src/constants.ts src/util.ts` is
// empty; in src/storage.ts, safeColor and sanitizeSun are as they were). Every older version reads a shape this way: a
// new object built from the fields it knows, so one it doesn't know (fruitDismissed, Nov 1) is left out and nothing
// else changes. Tests read what such a version makes of a plan this one saves (tests/storage.test.ts,
// tests/sync-engine.test.ts). Not to be edited: it stands for code already out.
import { MAX_POINTS, MAX_TREE_HEIGHT, MAX_TRUNK, MIN_POINTS, MIN_TRUNK } from '../../src/constants';
import { sanitizeSubFeatures } from '../../src/features';
import { isStoredUtilityKind } from '../../src/utility-kinds';
import { isRole } from '../../src/roles';
import { cleanPhaseName, isStatus } from '../../src/status';
import { safeColor, sanitizeSun } from '../../src/storage';
import type { PathShape, Shape, UtilityKind } from '../../src/types';
import { setWorldPoints } from '../../src/geometry';
import { uid } from '../../src/util';

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

/** The plants a plant's been left close to on purpose: ids, each once (at most 200); null for none. */
function crowdOk(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const ids = [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 100))].slice(0, 200);
  return ids.length ? ids : null;
}

/** Fill defaults and drop anything that would break rendering. Returns null for unusable input. */
export function releaseMigrateShape(raw: unknown): Shape | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const base = {
    id: str(s.id) || uid(),
    x: num(s.x, 0), y: num(s.y, 0),
    color: safeColor(s.color),
    label: str(s.label),
    opacity: num(s.opacity, 0.65),
    locked: s.locked === true,
    ...(typeof s.plantId === 'string' ? { plantId: s.plantId } : {}),
    // Shapes placed from the plant picker are plants; others stay unassigned until tagged.
    ...(isRole(s.role) ? { role: s.role } : typeof s.plantId === 'string' ? { role: 'plant' as const } : {}),
    ...(s.carryPlants === false ? { carryPlants: false } : {}),
    ...(sanitizeSun(s.sun) ? { sun: sanitizeSun(s.sun)! } : {}),
    ...(typeof s.sunDismissed === 'string' && s.sunDismissed ? { sunDismissed: s.sunDismissed.slice(0, 300) } : {}),
    ...(typeof s.hardyDismissed === 'string' && s.hardyDismissed ? { hardyDismissed: s.hardyDismissed.slice(0, 300) } : {}),
    ...(typeof s.poisonDismissed === 'string' && s.poisonDismissed ? { poisonDismissed: s.poisonDismissed.slice(0, 300) } : {}),
    // (What it was added as; older shapes have none. A word only: src/kinds.ts reads it, and ignores one it doesn't know.)
    ...(typeof s.kind === 'string' && /^[a-z]{2,12}$/.test(s.kind) ? { kind: s.kind } : {}),
    // (A utility's kind: a power line, a buried line, a septic field; kept on one made something else since, which is
    // that again if turned back. Older versions had neither.)
    // (One a later version adds, a short word, is kept as it came: not checked here, but not taken away.)
    ...(s.type !== 'circle' && s.type !== 'text' && isStoredUtilityKind(s.utility) ? { utility: s.utility as UtilityKind } : {}),
    // ('' is a warning shown again on purpose: kept, so sync doesn't fill it back from an older copy.)
    ...(typeof s.utilityDismissed === 'string' && s.utilityDismissed.length <= 2000 ? { utilityDismissed: s.utilityDismissed } : {}),
    // (Before Existing was a status of its own, a house, a fence or a tree drawn as one already there was "planted":
    // read as Existing. A tree with a planting date was planted, and stays so. Jason, Oct 31.)
    ...(isStatus(s.status) ? { status: s.status === 'planted' && ((isRole(s.role) && s.role !== 'plant') || (s.tree === true && typeof s.plantedOn !== 'string')) ? 'existing' as const : s.status } : {}),
    ...(typeof s.plantedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.plantedOn) ? { plantedOn: s.plantedOn } : {}),
    // (Only on a gone shape: a date left from before it was marked otherwise isn't kept.)
    // ('' is a date cleared on purpose: kept, so sync doesn't fill it back from an older copy.)
    ...(s.status === 'gone' && typeof s.goneOn === 'string' && /^(\d{4}-\d{2}-\d{2})?$/.test(s.goneOn) ? { goneOn: s.goneOn } : {}),
    ...(typeof s.phase === 'string' && cleanPhaseName(s.phase) ? { phase: cleanPhaseName(s.phase) } : {}),
  };
  const size = (v: unknown, d: number) => Math.max(0.1, num(v, d));
  // (Doors, windows, gates and the like, on a shape with edges; [] kept: they were all taken off. Older versions had none.)
  const subs = sanitizeSubFeatures(s.features);
  const featured = subs ? { features: subs } : {};
  switch (s.type) {
    case 'circle': {
      // Trees: a trunk size set by hand, and an outline for a canopy pruned into a shape.
      const canopy: [number, number][] = [];
      if (Array.isArray(s.canopy)) {
        for (const p of s.canopy.slice(0, MAX_POINTS)) {
          if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 1000 && Math.abs(p[1]) <= 1000) canopy.push([p[0], p[1]]);
        }
      }
      const shaped = canopy.length >= 3;
      // The outline must fit inside the radius used for sizes and spacing.
      const reach = shaped ? Math.max(...canopy.map(([x, y]) => Math.hypot(x, y))) : 0;
      const radius = size(s.radius, 2);
      return {
        ...base, type: 'circle', radius: reach > radius + 0.01 ? Math.ceil(reach * 4) / 4 : radius,
        ...(s.sizeFrom === 'plant' || s.sizeFrom === 'manual' ? { sizeFrom: s.sizeFrom } : {}),
        ...(s.tree === true ? { tree: true } : {}),
        ...(typeof s.trunk === 'number' && s.trunk >= MIN_TRUNK && s.trunk <= MAX_TRUNK ? { trunk: s.trunk } : {}),
        // (Trees: a height and lowest branches set by hand; older versions stored neither.)
        ...(typeof s.treeHeight === 'number' && s.treeHeight >= 1 && s.treeHeight <= MAX_TREE_HEIGHT ? { treeHeight: s.treeHeight } : {}),
        ...(typeof s.lowestBranch === 'number' && s.lowestBranch >= 0 && s.lowestBranch <= MAX_TREE_HEIGHT ? { lowestBranch: s.lowestBranch } : {}),
        ...(shaped ? { canopy } : {}),
        // (Plants left close to others on purpose, by id; older versions had none.)
        ...(crowdOk(s.crowdOk) ? { crowdOk: crowdOk(s.crowdOk)! } : {}),
        // (Vines: what it climbs, by id, or '' for none set by hand; older versions had neither: a groundcover.)
        ...(typeof s.climbsOn === 'string' && s.climbsOn.length <= 100 ? { climbsOn: s.climbsOn } : {}),
        // (A color chosen by hand, which pictures draw its leaves in; older versions had none: the catalog's colors.)
        ...(s.colorSet === true ? { colorSet: true } : {}),
        // (A flower color chosen among its sources' (a word, which the picture draws only where they list it); older
        // versions had none: the one its sources give most.)
        ...(typeof s.flowerColor === 'string' && /^[a-z]{3,12}$/.test(s.flowerColor) ? { flowerColor: s.flowerColor } : {}),
      };
    }
    case 'rect':
    case 'oval':
      return { ...base, type: s.type, width: size(s.width, 4), height: size(s.height, 3), rotation: num(s.rotation, 0), ...featured };
    case 'triangle': {
      const ra = s.rightAngle;
      return {
        ...base, type: 'triangle', width: size(s.width, 4), height: size(s.height, 3), rotation: num(s.rotation, 0),
        rightAngle: ra === 'br' || ra === 'tl' || ra === 'tr' ? ra : 'bl', ...featured,
      };
    }
    case 'poly':
    case 'line': {
      // Points must be finite pairs; too few to make the shape means it's unusable.
      const pts: { x: number; y: number }[] = [];
      if (Array.isArray(s.points)) {
        for (const p of s.points.slice(0, MAX_POINTS)) {
          if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) pts.push({ x: num(base.x, 0) + p[0], y: num(base.y, 0) + p[1] });
        }
      }
      if (pts.length < MIN_POINTS[s.type]) return null;
      const shape = {
        ...base, type: s.type, points: [], rotation: num(s.rotation, 0),
        ...(s.type === 'line' && s.showLength === true ? { showLength: true } : {}),
        // Paths: a width in feet (a quarter foot to 50 ft); anything else draws as a thin line.
        ...(s.type === 'line' && typeof s.pathWidth === 'number' && s.pathWidth >= 0.25 && s.pathWidth <= 50 ? { pathWidth: s.pathWidth } : {}),
        ...featured,
      } as PathShape;
      setWorldPoints(shape, pts); // re-normalize, whatever the file said
      return shape;
    }
    case 'text':
      return { ...base, type: 'text', fontSize: Math.min(50, Math.max(0.25, num(s.fontSize, 1))), rotation: num(s.rotation, 0) };
    default:
      return null;
  }
}
