// Compare two or three plants (Jason, Nov 2, from the UI review, marked Next: "A table of the facts that decide, with
// how sure each is"). The plants chosen in the picker, and the comparison's rows: each fact that decides, a cell a
// plant, each value with where it's from and how sure, in the plant details' words (src/ui/plant-details.ts). Only
// what's stored, as stored: nothing is ranked or recommended (Jason: the app isn't placed to say which is better
// without knowing what the gardener is after). Drawn by src/ui/compare-sheet.ts.

import type { Check, Provenance } from './catalog';
import { zoneRange } from './climate';
import { formsOf, hardinessSaid, MONTH_NAMES, oldDogWarning, parentRated, PLANT_META, plantsById, poisonRating, poisonousToPeople, sizeSaid, sunSaid, toxicToDogs, type Plant } from './plants';
import { butterflyCaps } from './search';
import { state } from './state';
import { isMine } from './my-plants';
import { deerWords, flowerText, poisonText, rangeProvenance, shortSources, SURE, toxRow, winterText } from './ui/plant-details';
import { planWarnings, WARNING_KINDS } from './warnings-list';
import { gardenStateName, hostsHere, localBloom, nativeHere } from './wild';
import { household, type Yard } from './yard';

// ---------- The plants chosen ----------
/** Two or three: a table wider than three is no longer a comparison a phone can show. */
export const MAX_COMPARE = 3;
/** The plants chosen to compare, by id, in the order chosen. Held while the picker is open (src/ui/render.ts clears it). */
let chosen: string[] = [];
export const comparing = (): readonly string[] => chosen;
export const isComparing = (id: string): boolean => chosen.includes(id);
/** Chosen, or no longer: whether it changed (a fourth isn't taken). */
export function toggleCompare(id: string): boolean {
  if (isComparing(id)) { chosen = chosen.filter((x) => x !== id); return true; }
  if (chosen.length >= MAX_COMPARE) return false;
  chosen = [...chosen, id];
  return true;
}
export function dropCompare(id: string) { chosen = chosen.filter((x) => x !== id); }
export function clearCompare() { chosen = []; }
/** The plants chosen, as the picker has them now (a plant of mine deleted meanwhile is left out). */
export const comparePlants = (): Plant[] => chosen.map((id) => plantsById[id]).filter((p): p is Plant => !!p);

// ---------- How sure ----------
/**
 * How sure a value is, for a quiet mark under it: `text` in the details' words ("NC State, USDA · confirmed",
 * "Nursery page · one nursery", "NC State, second reading · one source", "Earlier list, unverified"); `level` for its
 * look; `title` the sources by their full names.
 */
export type SureLevel = 'confirmed' | 'one' | 'nursery' | 'disputed' | 'earlier' | 'other' | 'yours';
export interface Sure { text: string; level: SureLevel; title?: string }
/** A source by a name short enough for a table's cell (the details' short names: "NC State" for its Plant Toolbox). */
const SHORT: Record<string, string> = { ncsu: 'NC State', usda: 'USDA', arkatlas: 'Arkansas atlas', mnwild: 'Minnesota Wildflowers', riis: 'USGS US-RIIS', wcvp: 'Kew' };
const STRENGTH: Check[] = ['agree', 'confirmed', 'single', 'likely', 'reported', 'disputed'];
const LEVEL: Record<Check, SureLevel> = { agree: 'confirmed', confirmed: 'confirmed', single: 'one', likely: 'nursery', reported: 'nursery', disputed: 'disputed' };
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
/** The catalog's sources by id (its `meta.sources`): a title, and how far each is trusted. */
type Sources = Record<string, { title: string; trust?: string }>;
const metaSources = (): Sources => PLANT_META?.sources ?? {};
/**
 * Who says it, in a few words: references by name, in the order given ("NC State, USDA"); nursery pages counted, not
 * named ("Nursery page", "NC State, 3 nursery pages": who they are is in the details); the first compendium as the
 * earlier list.
 */
export function whoSays(src: string[], sources: Sources = metaSources()): string {
  const names: string[] = [];
  let nurseries = 0;
  for (const s of src) {
    const trust = sources[s]?.trust;
    if (trust === 'nursery') nurseries++;
    else if (trust === 'unverified') names.push('earlier list');
    else names.push(SHORT[s] ?? sources[s]?.title ?? s);
  }
  if (nurseries) names.push(nurseries === 1 ? 'nursery page' : `${nurseries} nursery pages`);
  return cap([...new Set(names)].join(', '));
}
/** One fact's provenance, or a range's two (zones, sun) made one: their sources together, as sure as the less sure. */
function oneProv(prov: Provenance | undefined | [Provenance, Provenance]): Provenance | undefined {
  if (!Array.isArray(prov)) return prov;
  const [a, b] = prov;
  const check = [a.check, b.check].filter((c): c is Check => !!c).sort((x, y) => STRENGTH.indexOf(x) - STRENGTH.indexOf(y)).at(-1);
  return { src: [...new Set([...a.src, ...b.src])], ...(check ? { check } : {}), ...(a.inherited || b.inherited ? { inherited: true } : {}),
    ...(a.from || b.from ? { from: 'description' as const } : {}) };
}
/**
 * How sure a value is, from what the catalog stores with it: its sources (`src`), its `check`, whether it was read from
 * a page's description (written only where a second, blind reading agrees: docs/catalog-sources.md, "A second
 * reading"), and whether a cultivar has it from its species. A plant of mine's own value: "Your entry". Null: nothing
 * to say.
 */
export function sureOf(prov: Provenance | undefined | [Provenance, Provenance], mine = false, sources: Sources = metaSources()): Sure | null {
  const pv = oneProv(prov);
  if (!pv) return mine ? { text: 'Your entry', level: 'yours' } : null;
  const title = pv.src.map((s) => sources[s]?.title ?? s).join(', ') || undefined;
  if (pv.src.length && pv.src.every((s) => sources[s]?.trust === 'unverified')) {
    return { text: ['Earlier list, unverified', pv.inherited ? 'from its species' : ''].filter(Boolean).join(' · '), level: 'earlier', title };
  }
  const who = whoSays(pv.src, sources) + (pv.from === 'description' ? ', second reading' : '');
  const how = pv.check ? SURE[pv.check] ?? '' : '';
  const text = [who, how, pv.inherited ? 'from its species' : '', pv.at ? `for ${pv.at}` : ''].filter(Boolean).join(' · ');
  return { text, level: pv.check ? LEVEL[pv.check] : 'other', ...(title ? { title } : {}) };
}

// ---------- The rows ----------
/**
 * A plant's cell: its value ("Not known" where none is stored, never blank), lines under it (`more`: a size's typical
 * one, the plan's warnings), what other sources say where they differ (`alt`), how sure (`sure`), and a `tone` where
 * it matters to who's in the yard (`bad`) or to anyone (`warn`: a skin irritant, too cold here).
 */
export interface Cell { text: string; known: boolean; sure: Sure | null; more?: string[]; alt?: string; tone?: 'bad' | 'warn' }
export interface CompareRow { key: string; label: string; cells: Cell[]; differ: boolean }
export const NOT_KNOWN = 'Not known';
/** No value: "Not known", and, where its sources were read and none say, that. */
function notKnown(prov?: Provenance | [Provenance, Provenance]): Cell {
  const pv = Array.isArray(prov) ? undefined : prov;
  return { text: NOT_KNOWN, known: false, sure: pv?.unknown ? { text: 'None of its sources say', level: 'other', title: pv.src.map((s) => metaSources()[s]?.title ?? s).join(', ') || undefined } : null };
}
/** A value with how sure it is; "Not known" without one. */
function cell(p: Plant, text: string, prov: Provenance | undefined | [Provenance, Provenance], extra: Partial<Cell> = {}): Cell {
  if (!text) return notKnown(prov);
  return { text, known: true, sure: sureOf(prov, isMine(p)), ...extra };
}
/** What other sources say where they differ, short ("Nurseries report: 3–4 ft", "NC State lists: Full sun"). */
function altSaid(prov: Provenance | undefined, value: string): string | undefined {
  const alt = prov?.alt;
  if (!alt || !value) return undefined;
  const src = metaSources();
  if (alt.src.every((s) => src[s]?.trust === 'nursery')) return `Nurseries report: ${value}`;
  return `${whoSays(alt.src)} list${alt.src.length > 1 ? '' : 's'}: ${value}`;
}
/** Where a reportable fact's other value differs: said, by who. */
function reported(p: Plant, keys: string[], value: string, shown: string): string | undefined {
  if (!p.reported || !keys.some((k) => k in p.reported!) || value === shown) return undefined;
  return altSaid(keys.map((k) => p.prov?.[k]).find((pv) => pv?.alt), value);
}

const feet = (x: number) => (x >= 1 ? `${+x.toFixed(1)} ft` : `${Math.round(x * 12)} in`);
/** A size: its range, as the picker's rows give it ("3–6 ft"), and under it the typical size the plan draws it at. */
function sizeCell(p: Plant, key: 'height' | 'width'): Cell {
  const r = p[key], text = sizeSaid(r);
  const typical = r?.med != null && r.min != null && r.max != null && r.min !== r.max ? `typically ${feet(r.med)}` : '';
  const other = p.reported?.[key] as Plant['height'] | undefined;
  return cell(p, text, p.prov?.[key], { ...(typical ? { more: [typical] } : {}), alt: reported(p, [key], sizeSaid(other), text) });
}
const range = (p: Plant, a: string, b: string) => rangeProvenance([a, b], p.prov);
function sunCell(p: Plant): Cell {
  const text = sunSaid(p.sun_most, p.sun_least), r = p.reported ?? {};
  const other = sunSaid((r.sun_most ?? p.sun_most) as string | undefined, (r.sun_least ?? p.sun_least) as string | undefined);
  return cell(p, text, range(p, 'sun_most', 'sun_least'), { alt: reported(p, ['sun_most', 'sun_least'], other, text) });
}
function zonesCell(p: Plant): Cell {
  const text = cap(zoneRange(p) ?? ''), r = p.reported ?? {};
  const other = cap(zoneRange({ zone_min: (r.zone_min ?? p.zone_min) as number | undefined, zone_max: (r.zone_max ?? p.zone_max) as number | undefined }) ?? '');
  return cell(p, text, range(p, 'zone_min', 'zone_max'), { alt: reported(p, ['zone_min', 'zone_max'], other, text) });
}
/** Hardy where the garden is: the picker row's words ("Hardy here", "Too cold here"), in amber where it isn't. */
function hardyCell(p: Plant): Cell {
  const h = hardinessSaid(p);
  return h ? cell(p, h.text, range(p, 'zone_min', 'zone_max'), h.ok ? {} : { tone: 'warn' }) : notKnown(range(p, 'zone_min', 'zone_max'));
}
const monthsSaid = (b: { start?: number; end?: number }) => (b.start ? `${MONTH_NAMES[b.start]}${b.end && b.end !== b.start ? `–${MONTH_NAMES[b.end]}` : ''}` : '');
/**
 * When it blooms, as the details give it first: its months where the garden is, from flowering records; else its
 * season, as its sources say; else the earlier list's months (a plant of mine: its own).
 */
function bloomCell(p: Plant): Cell {
  const local = localBloom(p);
  if (local) {
    return { text: monthsSaid(local) + (local.start !== local.end ? `, peak ${MONTH_NAMES[local.peak]}` : ''), known: true, sure: {
      text: [`${local.n.toLocaleString('en-US')} flowering records in ${local.stateName}${local.area === 'region' ? ' and nearby' : ''}`, local.species ? 'from its species' : ''].filter(Boolean).join(' · '),
      level: 'other', title: local.source } };
  }
  if (p.bloom_season?.length) return cell(p, cap(p.bloom_season.join(', ')), p.prov?.bloom_season);
  return cell(p, p.bloom?.start ? monthsSaid(p.bloom) : '', p.prov?.bloom);
}
/** Its flowers' colors (its sources'; else the earlier list's word, or a plant of mine's own). */
function flowerCell(p: Plant): Cell {
  const text = flowerText(p.flower_color);
  return text ? cell(p, text, p.prov?.flower_color) : cell(p, p.bloom?.color ? cap(p.bloom.color) : '', p.prov?.bloom ?? p.prov?.flower_color);
}
/** Its leaves in winter, short ("Evergreen", "Dies back in winter"); where no source says, what's expected, and why. */
function winterCell(p: Plant): Cell {
  const forms = formsOf(p);
  if (forms.length && forms.every((f) => f === 'Annual')) return cell(p, 'Lives one season (annual)', p.prov?.form);
  if (p.foliage) return cell(p, winterText(p).split(/[:;]/)[0], p.prov?.foliage);
  const w = p.winter_leaves;
  if (!w) return notKnown(p.prov?.foliage);
  const species = p.prov?.winter_leaves?.inherited ? ' · from its species' : '';
  return w.basis === 'records'
    ? { text: winterText(p), known: true, sure: { text: `USA-NPN records, ${w.n} plant-year${w.n === 1 ? '' : 's'}${species}`, level: 'other' } }
    : { text: winterText(p).replace(/, like its .*$/, ''), known: true, sure: { text: `Like ${w.n} relatives; not from a source${species}`, level: 'other' } };
}
/**
 * Native: to the garden's state, by Kew's checklist, where its records are in; a plant Kew doesn't list there is not
 * known, never "not native" (Kew leaves states out: docs/wild-records.md). Else to North America, by Kew, or by the
 * earlier list.
 */
function nativeCell(p: Plant): Cell {
  const here = gardenStateName();
  if (here) {
    const n = nativeHere(p);
    if (!n) return { text: NOT_KNOWN, known: false, sure: { text: `Kew doesn’t list it for ${here}, which isn’t the same as not native`, level: 'other' } };
    return { text: n.status === 'N' ? 'Yes' : 'No: introduced there', known: true, sure: { text: `Kew${n.species ? ' · from its species' : ''}`, level: 'other', title: n.source } };
  }
  if (p.native_na) return cell(p, 'Yes', p.prov?.native_na);
  return cell(p, p.native ? cap(p.native) : '', p.prov?.native);
}
/**
 * Poisonous to people, in its source's words (a hybrid no source rates: its parents'); "None listed" where NC State's
 * page says nothing of poison (a weak no, not "safe"). Red with People chosen, as its row's mark is; amber for a skin
 * irritant, which anyone can brush (src/plants.ts householdFlags, rowFlags).
 */
function poisonCell(p: Plant, y: Yard): Cell {
  const tone: Cell['tone'] = state.poisonWarnings && y.kids && poisonousToPeople(p) ? 'bad' : poisonRating(p)?.skin ? 'warn' : undefined;
  const extra = tone ? { tone } : {};
  if (parentRated(p)) return cell(p, 'Not rated itself; a parent is', p.prov?.poison_parents, extra);
  if (p.poison) return cell(p, poisonText(p.poison), p.prov?.poison, extra);
  if (p.prov?.poison?.unknown) return { text: 'None listed', known: true, sure: sureOf({ ...p.prov.poison, unknown: undefined }) };
  return notKnown();
}
type Pet = 'dogs' | 'cats' | 'horses';
const PET_LABEL: Record<Pet, string> = { dogs: 'Dogs', cats: 'Cats', horses: 'Horses' };
/** The pets in the yard (src/yard.ts): a row each. */
const petsIn = (y: Yard): Pet[] => (['dogs', 'cats', 'horses'] as Pet[]).filter((k) => (k === 'dogs' ? y.dogs !== '' : y[k]));
/**
 * One pet in the yard: NC State's "Problem for"; else its own rating; else (dogs) the earlier list's word, its own or
 * its species'; else NC State's page read and not listing it, which isn't the same as safe; else not known. In red
 * where it warns, as the row's mark does.
 */
function petCell(p: Plant, pet: Pet): Cell {
  const bad = state.poisonWarnings ? { tone: 'bad' as const } : {};
  if (p.problem_for?.includes(pet)) return cell(p, `Toxic to ${pet}`, p.prov?.problem_for, bad);
  const animal = pet.slice(0, -1) as 'dog' | 'cat' | 'horse', t = p.tox?.[animal];
  if (t) return cell(p, t === 'toxic' ? 'Toxic' : t === 'nontoxic' ? 'Not toxic' : 'Not listed', p.prov?.tox, t === 'toxic' ? bad : {});
  if (pet === 'dogs' && p.dog && p.dog !== 'Unverified') return cell(p, cap(p.dog), p.prov?.dog, oldDogWarning(p) ? bad : {});
  if (pet === 'dogs' && p.dogVia) {
    return { text: `${cap(p.dogVia.dog)} (given for ${p.dogVia.common})`, known: true, sure: { text: 'Earlier list, unverified', level: 'earlier' }, ...(toxicToDogs(p) ? bad : {}) };
  }
  if (p.prov?.poison?.src.includes('ncsu')) return { text: 'Not listed', known: true, sure: { text: 'NC State · not listed isn’t the same as safe', level: 'other' } };
  return notKnown();
}
/** No pets said to be in the yard: dogs, cats and horses in one row, as the details' Toxicity row says them. */
function petsCell(p: Plant): Cell {
  const t = toxRow(p);
  if (!t || t.value.startsWith('Not rated')) return notKnown();
  // (Its source as the comparison says them, without the details' "Source:".)
  const line = cap(shortSources(t.line.replace(/^Sources?: /, '')));
  return { text: cap(t.value), known: true, sure: line ? { text: line, level: /^Earlier list/.test(line) ? 'earlier' : 'other' } : null };
}
/** Butterflies' common names, with field-guide capitals, the binomial left to the details: "Monarch, Gray Hairstreak". */
const commonNames = (names: string[]) => names.map((n) => butterflyCaps(n.replace(/\s*\([^)]*\)\s*$/, '')));
/** The caterpillars its sources name; its genus's count (where the garden is, else North America's); the earlier list's. */
function hostCell(p: Plant): Cell {
  const g = p.host_genus, here = g ? hostsHere(p) : null;
  const genus = g ? `Its genus: ${(here?.n ?? g.species).toLocaleString('en-US')} native caterpillar${(here?.n ?? g.species) === 1 ? '' : 's'} in ${here ? here.stateName : 'North America'}` : '';
  const genusSure: Sure = { text: 'Counted for the genus · Shropshire & Tallamy', level: 'other', ...(here ? { title: here.source } : {}) };
  if (p.hosts?.length) {
    const names = commonNames(p.hosts), shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '');
    return cell(p, `Host to ${shown}`, p.prov?.hosts, genus ? { more: [`${genus} (Shropshire & Tallamy)`] } : {});
  }
  if (g) return { text: genus, known: true, sure: genusSure };
  return cell(p, p.host ? butterflyCaps(p.host) : '', p.prov?.host);
}
/** Who visits, as NC State lists them; else the earlier list's nectar rating. */
function attractsCell(p: Plant): Cell {
  if (p.attracts?.length) return cell(p, cap(p.attracts.join(', ')), p.prov?.attracts);
  return cell(p, p.nectar ? `Nectar: ${p.nectar}` : '', p.prov?.nectar);
}
function deerCell(p: Plant): Cell {
  const text = deerWords(p.deer);
  return cell(p, text, p.prov?.deer, { alt: reported(p, ['deer'], deerWords(p.reported?.deer as string | undefined), text) });
}
/** Placed in this plan (not gone): the plan's own warnings for it apply. */
const placedHere = (p: Plant) => state.shapes.some((s) => s.role === 'plant' && s.plantId === p.id && s.status !== 'gone');
const KIND_NAME = new Map(WARNING_KINDS.map((k) => [k.kind, k.name]));
/** The plan's warnings now for a plant placed in it, each by its kind ("Sun: Gets 8 h of sun…"), as Warnings lists them. */
function warningsCell(p: Plant, rows: ReturnType<typeof planWarnings>): Cell {
  if (!placedHere(p)) return { text: 'Not in this plan', known: true, sure: null };
  const ids = new Set(state.shapes.filter((s) => s.plantId === p.id).map((s) => s.id));
  const its = rows.filter((r) => !r.dismissed && r.ids.some((id) => ids.has(id)));
  if (!its.length) return { text: 'None', known: true, sure: null };
  return { text: `${its.length} warning${its.length === 1 ? '' : 's'}`, known: true, sure: null, tone: 'warn',
    more: its.map((r) => `${KIND_NAME.get(r.kind) ?? r.kind}: ${r.kind === 'crowding' ? `${r.said} (${r.name})` : r.said}`) };
}

/** What a cell says, for telling whether the plants differ (how sure isn't the value). */
const saysKey = (c: Cell) => [c.text, ...(c.more ?? [])].join('\n').trim().toLowerCase();
/** Whether the cells say different things ("Not known" in each says the same). */
export const cellsDiffer = (cells: Cell[]): boolean => new Set(cells.map(saysKey)).size > 1;

/**
 * The facts that decide, a row each, in this order (Jason's list, from the UI review): size, sun, water, hardiness and
 * whether it's hardy here, bloom and flower color, form and winter leaves, native here, poison to the people and pets
 * in the yard, wildlife, deer, growth rate, and, where one of them is placed, the plan's own warnings for it. Each row
 * says whether the plants differ in it.
 */
export function compareRows(plants: Plant[], y: Yard = household()): CompareRow[] {
  const defs: [key: string, label: string, cellOf: (p: Plant) => Cell][] = [
    ['height', 'Height', (p) => sizeCell(p, 'height')],
    ['width', 'Width', (p) => sizeCell(p, 'width')],
    ['sun', 'Sun', sunCell],
    ['water', 'Water', (p) => cell(p, p.water ?? '', p.prov?.water, { alt: reported(p, ['water'], String(p.reported?.water ?? ''), p.water ?? '') })],
    ['zones', 'Hardiness', zonesCell],
  ];
  if (state.location) defs.push(['hardy', `Hardy in zone ${state.location.zone}`, hardyCell]);
  defs.push(
    ['bloom', 'Bloom', bloomCell],
    ['flowers', 'Flower color', flowerCell],
    ['form', 'Form', (p) => cell(p, formsOf(p).join(', '), p.prov?.form)],
    ['winter', 'In winter', winterCell],
    ['native', gardenStateName() ? `Native to ${gardenStateName()}` : 'Native to North America', nativeCell],
    ['poison', 'Toxic to people', (p) => poisonCell(p, y)],
  );
  const pets = petsIn(y);
  if (pets.length) for (const pet of pets) defs.push([pet, PET_LABEL[pet], (p) => petCell(p, pet)]);
  else defs.push(['pets', 'Pets', petsCell]);
  defs.push(
    ['host', 'Caterpillar host', hostCell],
    ['attracts', 'Attracts', attractsCell],
    ['deer', 'Deer', deerCell],
    ['growth', 'Growth rate', (p) => cell(p, p.growth_rate ? cap(p.growth_rate) : '', p.prov?.growth_rate)],
  );
  if (plants.some(placedHere)) {
    const rows = planWarnings();
    defs.push(['warnings', 'In this plan', (p) => warningsCell(p, rows)]);
  }
  return defs.map(([key, label, cellOf]) => {
    const cells = plants.map(cellOf);
    return { key, label, cells, differ: cellsDiffer(cells) };
  });
}
