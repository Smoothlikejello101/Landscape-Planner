// What a plant shows in each month where the garden is: its leaves (coming out, on, coloring, gone), their colors,
// its flowers and its fruit (docs/seasons.md). For drawing the garden through the year and coloring plants by their
// leaves and flowers. It only arranges the catalog's sourced facts and the records near the garden by month: it never
// adds or infers a fact. Where nothing places a part in a month, it says so (`basis: 'unknown'`) rather than guess.
//
// The rules:
// - Leaves. Evergreen: on all year. Semi-evergreen: on all year, thin in winter (Dec–Feb). Deciduous: out from the
//   month the plant leafs out where the garden is, coloring from the day its first leaves color there, gone from the
//   day its last leaves are (USA-NPN's records, src/wild.ts); a month takes the state its middle day is in, except the
//   month it leafs out in, which is "emerging". Where there are no records near the garden, the meteorological
//   seasons place them (`basis: 'season'`): out in March, coloring September to November, gone December to February.
//   An herb, grass, fern or bulb that's deciduous dies back: "dormant" rather than "off". No foliage fact: no state.
// - Leaf colors. The catalog's leaf colors are NC State's list across the seasons and the leaves' undersides (red
//   maple: green, gold, orange), so the summer colors are those less the fall colors, unless that leaves nothing (a
//   purple-leaved smokebush whose fall color is purple too); green first when it's there. "Variegated" is a flag, not
//   a color (variegated alone: green, variegated). Coloring leaves carry the fall colors too, and how far through
//   fall the month is (0 to 1).
// - Flowers. The months it flowers where the garden is (GBIF's records), else the earlier list's months, else its
//   bloom seasons (spring: Mar–May; early spring: Mar; mid: Apr; late: May; and so on). A season its sources give
//   beats the earlier list's unverified months: the season's months, those the list names among them sure, the rest
//   "around" (Jason, Oct 31: pink muhly, Fall by two sources, was in bloom in October alone). Colors: its flower
//   colors, "insignificant" left out (and the flowers not showy where that's all there is).
// - Fruit. Its fruit seasons by the same months, and its fruit colors.
import type { Plant } from './plants';
import { localBloom, localLeafFall, localLeafOut, type LocalBloom, type LocalLeafFall, type LocalLeafOut } from './wild';

/**
 * What placed a part in a month: `records`, observations near the garden (USA-NPN, GBIF), or of its species
 * anywhere where no source gives its foliage; `source`, a source saying so outright (evergreen; the earlier list's
 * bloom months); `season`, a season word or the season convention; `relatives`, its winter taken from its relatives in
 * the catalog, no source giving its foliage (an expectation: scripts/catalog/winter.mjs); or `unknown`, nothing.
 */
export type Basis = 'records' | 'source' | 'season' | 'relatives' | 'unknown';
export type LeafState = 'emerging' | 'on' | 'turning' | 'off' | 'dormant';

export interface MonthLeaves {
  /** Null where no foliage fact says whether the leaves stay. */
  state: LeafState | null;
  /** Summer leaf colors (catalog words, src/catalog.ts LEAF_COLORS), dominant first; empty where unknown or gone. */
  colors: string[];
  variegated?: boolean;
  /** Coloring: its fall colors (src/catalog.ts FALL_COLORS; empty where none are known), and how far through fall (0–1). */
  fall?: string[];
  progress?: number;
  /** Semi-evergreen in winter. */
  thin?: boolean;
  basis: Basis;
}
export interface MonthFlowers {
  state: 'bloom' | 'none' | 'unknown';
  /** Flower colors (src/catalog.ts FLOWER_COLORS, "insignificant" left out); empty where none are known. */
  colors: string[];
  /** The earlier list's color words, where the catalog has no flower colors ("White-pink"). */
  colorText?: string;
  /** False where its sources call its flowers insignificant (showyFlowers). */
  showy: boolean;
  basis: Basis;
}
export interface MonthFruit { state: 'showing' | 'none' | 'unknown'; colors: string[]; basis: Basis }
export interface MonthLook { month: number; leaves: MonthLeaves; flowers: MonthFlowers; fruit: MonthFruit }

/** The records near the garden (src/wild.ts), passed in so monthLook stays pure; `hereFor` reads them. */
export interface Here { leafOut?: LocalLeafOut | null; fall?: LocalLeafFall | null; bloom?: LocalBloom | null }
export const hereFor = (p: { id: string; parent?: string }): Here => ({ leafOut: localLeafOut(p), fall: localLeafFall(p), bloom: localBloom(p) });

/** Meteorological seasons: the convention used where no records place a plant (docs/seasons.md). */
export const SEASON_MONTHS: Record<string, number[]> = { spring: [3, 4, 5], summer: [6, 7, 8], fall: [9, 10, 11], winter: [12, 1, 2] };
/** A season word's months: "spring" all three, "early spring" the first, "mid spring" the second, "late spring" the third. */
export function seasonMonths(word: string): number[] {
  const m = /^(?:(early|mid|late)\s+)?(spring|summer|fall|autumn|winter)$/.exec(word.trim().toLowerCase());
  if (!m) return [];
  const months = SEASON_MONTHS[m[2] === 'autumn' ? 'fall' : m[2]];
  return m[1] ? [months[['early', 'mid', 'late'].indexOf(m[1])]] : [...months];
}

// Days of the year (not a leap year) each month starts after.
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
/** The month (1–12) a day of the year falls in. */
export function monthOfDay(doy: number): number {
  const d = Math.max(1, Math.min(365, Math.round(doy)));
  let m = 1;
  while (m < 12 && d > MONTH_START[m]) m++;
  return m;
}
/** A month's middle day of the year (the 15th or so). */
export const midDay = (month: number) => Math.round((MONTH_START[month - 1] + 1 + MONTH_START[month]) / 2);

/** Herbs, grasses, ferns, bulbs and water plants die back rather than drop their leaves. */
const DIES_BACK = new Set(['Perennial', 'Grass/Sedge', 'Fern', 'Bulb', 'Annual', 'Aquatic/Emergent']);

/** Its summer leaf colors, dominant first, and whether they're variegated (the rules above). */
export function summerLeafColors(p: Pick<Plant, 'leaf_color' | 'fall_colors'>): { colors: string[]; variegated: boolean } {
  const all = p.leaf_color ?? [];
  const variegated = all.includes('variegated');
  const words = all.filter((c) => c !== 'variegated');
  if (!words.length) return { colors: variegated ? ['green'] : [], variegated };
  const fall = new Set(p.fall_colors ?? []);
  const rest = words.filter((c) => !fall.has(c));
  const colors = rest.length ? rest : words;
  return { colors: colors.includes('green') ? ['green', ...colors.filter((c) => c !== 'green')] : colors, variegated };
}

/**
 * The months it flowers in, what places them (the rules above), and which are `sure`: by records or listed months,
 * drawn in full and counted as in bloom; the rest by its season, drawn faint, "around now".
 */
export function bloomWindow(p: Plant, here: Here = {}): { months: number[]; basis: Basis; sure: number[] } {
  const b = here.bloom;
  if (b) { const months = monthRange(b.start, b.end); return { months, basis: 'records', sure: months }; }
  const fromSeasons = [...new Set((p.bloom_season ?? []).flatMap(seasonMonths))].sort((a, c) => a - c);
  if (p.bloom?.start) {
    const listed = monthRange(p.bloom.start, p.bloom.end || p.bloom.start);
    // (A plant of the user's own: its months are theirs, not the earlier list's.)
    if (!fromSeasons.length || p.id.startsWith('u-')) return { months: listed, basis: 'source', sure: listed };
    return { months: fromSeasons, basis: 'season', sure: fromSeasons.filter((m) => listed.includes(m)) };
  }
  return fromSeasons.length ? { months: fromSeasons, basis: 'season', sure: [] } : { months: [], basis: 'unknown', sure: [] };
}
/**
 * Whether NC State's flower form says its flowers aren't showy: "insignificant" for how they're borne, and no shape
 * given. With a shape, what it describes is the showy part: a flowering dogwood's true flowers are tiny
 * ("insignificant"), but its bracts are cross-shaped, 4 of them, 3–6 in across (the bug hunt, Nov 1: it was drawn
 * and filtered as having no flowers, though its details list white ones). As a plant's details say it
 * (src/ui/plant-details.ts flowerFormText).
 */
export const insignificantForm = (f: Plant['flower_form'] | undefined): boolean => !!f?.inflorescence?.includes('insignificant') && !f.shape?.length;
/**
 * Whether its flowers are worth counting: not where its sources call them insignificant and nothing else, as its only
 * flower color, or as its flower form (insignificantForm). The one rule for whether it has showy flowers: a picker
 * row's spot and bloom months, Has flowers and the flower colors (src/plants.ts), its picture (src/looks.ts), and the
 * bloom calendar's and the month slider's counts.
 */
export const showyFlowers = (p: Plant | undefined): boolean => {
  const w = p?.flower_color ?? [];
  return !(w.length && w.every((c) => c === 'insignificant')) && !insignificantForm(p?.flower_form);
};
/** Flowers borne in catkins: not drawn as flowers, nor counted by Has flowers (a birch's, a willow's). */
export const catkins = (p: Plant): boolean => (p.flower_form?.inflorescence ?? []).includes('catkin');
/** Months start to end, wrapping the year's end (Nov–Jan). */
export function monthRange(start: number, end: number): number[] {
  const out: number[] = [];
  for (let m = start, i = 0; i < 12; i++, m = (m % 12) + 1) { out.push(m); if (m === end) break; }
  return out;
}

function leavesIn(p: Plant, month: number, here: Here): MonthLeaves {
  const { colors, variegated } = summerLeafColors(p);
  const v = variegated ? { variegated: true } : {};
  // (No source's foliage: its winter as winter.mjs took it, from its species' records or its relatives.)
  const expected = p.foliage ? undefined : p.winter_leaves;
  const foliage = p.foliage ?? expected?.leaves;
  if (!foliage) return { state: null, colors, ...v, basis: 'unknown' };
  const said: Basis = !expected ? 'source' : expected.basis === 'records' ? 'records' : 'relatives';
  if (foliage === 'evergreen') return { state: 'on', colors, ...v, basis: said };
  if (foliage === 'semi-evergreen') {
    return SEASON_MONTHS.winter.includes(month) ? { state: 'on', colors, ...v, thin: true, basis: said === 'relatives' ? said : 'season' } : { state: 'on', colors, ...v, basis: said };
  }
  if (expected?.basis === 'relatives') {
    // (Deciduous by its relatives: when it's bare is theirs too, by the season convention, and said as expected.)
    const out = deciduousIn(p, month, here, colors, v);
    return { ...out, basis: 'relatives' };
  }
  return deciduousIn(p, month, here, colors, v);
}
function deciduousIn(p: Plant, month: number, here: Here, colors: string[], v: { variegated?: boolean }): MonthLeaves {
  const off: LeafState = DIES_BACK.has(p.form ?? '') ? 'dormant' : 'off';
  const fallColors = p.fall_colors ?? [];
  const out = here.leafOut?.med, turn = here.fall?.turn?.med, bare = here.fall?.bare?.med;
  const day = midDay(month);
  // Spring: the month it leafs out in near the garden, else March.
  const outMonth = out !== undefined ? monthOfDay(out) : 3;
  const springBasis: Basis = out !== undefined ? 'records' : 'season';
  // Fall: coloring from its first colored leaves, gone after its last leaves, near the garden; else Sep–Nov, gone in December.
  const fallFrom = turn ?? midDay(9), goneAfter = bare ?? MONTH_START[11];
  const fallBasis: Basis = turn !== undefined || bare !== undefined ? 'records' : 'season';
  if (month < outMonth) return { state: off, colors: [], basis: springBasis };
  if (month === outMonth) return { state: 'emerging', colors, ...v, basis: springBasis };
  if (day > goneAfter) return { state: off, colors: [], basis: bare !== undefined ? 'records' : 'season' };
  if (day >= fallFrom) {
    const progress = Math.max(0, Math.min(1, goneAfter > fallFrom ? (day - fallFrom) / (goneAfter - fallFrom) : 1));
    return { state: 'turning', colors, ...v, fall: fallColors, progress: Math.round(progress * 100) / 100, basis: fallBasis };
  }
  return { state: 'on', colors, ...v, basis: springBasis === 'records' || fallBasis === 'records' ? 'records' : 'season' };
}

function flowersIn(p: Plant, month: number, here: Here): MonthFlowers {
  const words = p.flower_color ?? [];
  const colors = words.filter((c) => c !== 'insignificant');
  const showy = showyFlowers(p);
  const text = !words.length && p.bloom?.color ? { colorText: p.bloom.color } : {};
  const w = bloomWindow(p, here);
  if (w.basis === 'unknown') return { state: 'unknown', colors, ...text, showy, basis: 'unknown' };
  const basis: Basis = w.basis === 'season' && w.sure.includes(month) ? 'source' : w.basis;
  return { state: w.months.includes(month) ? 'bloom' : 'none', colors, ...text, showy, basis };
}

function fruitIn(p: Plant, month: number): MonthFruit {
  const months = new Set((p.fruit_season ?? []).flatMap(seasonMonths));
  const colors = p.fruit_color ?? [];
  if (!months.size) return { state: 'unknown', colors, basis: 'unknown' };
  return { state: months.has(month) ? 'showing' : 'none', colors, basis: 'season' };
}

/** What a plant shows in a month (1–12) where the garden is (`here`: the records near it; none: the seasons alone). */
export function monthLook(p: Plant, month: number, here: Here = {}): MonthLook {
  return { month, leaves: leavesIn(p, month, here), flowers: flowersIn(p, month, here), fruit: fruitIn(p, month) };
}
/** Its whole year, January first. */
export const yearLook = (p: Plant, here: Here = {}): MonthLook[] => Array.from({ length: 12 }, (_, i) => monthLook(p, i + 1, here));
