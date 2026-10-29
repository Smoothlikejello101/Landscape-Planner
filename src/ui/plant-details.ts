// A plant's full details, shown when its row in the picker is opened: the
// facts the catalog has, where it came from and how sure it is, and what
// other sources say where they differ from the value shown.
import { el } from '../dom';
import type { Plant, PoisonParent } from '../plants';
import { MONTH_NAMES, PLANT_META, formsOf, oldDogWarning, ownCopies, parentRated, tenderWoody, zoneNote } from '../plants';
import { isMine } from '../my-plants';
import { rootSpread, rootText, seedText } from '../spread';
import { butterflyCaps } from '../search';
import { zoneRange } from '../climate';
import type { Provenance } from '../catalog';
import { dayOfYear, escapeHere, escapeText, hostsHere, localBloom, localLeafOut, nativeHere, nativeText, regulatedHere, wildHere, wildText } from '../wild';

const SURE: Record<string, string> = {
  agree: 'confirmed', confirmed: 'confirmed', single: 'one source', likely: 'nurseries agree', reported: 'one nursery', disputed: 'sources disagree',
};
const sourceName = (id: string) => PLANT_META?.sources?.[id]?.title ?? id;

/**
 * How much deer eat it, in plain words (Jason, 2026-10-27: "candy", gardeners' slang, says it to some and not others):
 * the catalog's three ratings, or a plant of mine's own word as it was entered.
 */
const DEER_WORDS: Record<string, string> = { Candy: 'A favorite: heavily browsed', Occasional: 'Sometimes browsed', Resistant: 'Resistant: seldom browsed' };
export const deerWords = (v: string | undefined): string => (v ? DEER_WORDS[v] ?? v : '');
/** A source in a few words, for a label: "NC State", "USDA", else its title (a website's domain). */
const SHORT: Record<string, string> = { ncsu: 'NC State', usda: 'USDA', arkatlas: 'the Arkansas atlas', mnwild: 'Minnesota Wildflowers' };
/**
 * Who gives the other value, and it, in words: "Nurseries report: Full sun (a.com, b.com)" where only nurseries
 * do; else by name, "NC State lists: 4b to 9b", "NC State and ufl.edu list: …".
 */
export function otherValue(src: string[], value: string): string {
  if (src.every((s) => PLANT_META?.sources?.[s]?.trust === 'nursery')) return `Nurseries report: ${value} (${src.map(sourceName).join(', ')})`;
  const names = src.map((s) => SHORT[s] ?? sourceName(s));
  return `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} list` : `${names[0]} lists`}: ${value}`;
}
const ft = (r?: { min?: number; max?: number; med?: number }) => {
  if (!r) return '';
  const f = (x: number) => (x >= 1 ? `${+x.toFixed(1)} ft` : `${Math.round(x * 12)} in`);
  return r.min != null && r.max != null && r.min !== r.max ? `${f(r.min).replace(' ft', '')}–${f(r.max)}` : r.med != null ? f(r.med) : r.min != null ? f(r.min) : '';
};
const SUN_WORDS: Record<string, string> = { Full: 'full sun', Part: 'part shade', Shade: 'shade' };
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
/** "dogs", "dogs and cats", "dogs, cats and horses". */
const andList = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l.at(-1)}` : l[0] ?? '');
const sun = (most?: unknown, least?: unknown) => (!most ? '' : cap(most === least || !least ? SUN_WORDS[most as string] ?? String(most) : `${SUN_WORDS[most as string] ?? most} to ${SUN_WORDS[least as string] ?? least}`));
const yes = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : '');
/** "Apr–Jun"; "May". */
const months = (b: { start?: number; end?: number }) => (b.start ? `${MONTH_NAMES[b.start]}${b.end && b.end !== b.start ? `–${MONTH_NAMES[b.end]}` : ''}` : '');
/** "Spring, summer"; "Mid spring" (USDA's finer seasons, as it writes them). */
const seasonText = (l?: string[]) => (l?.length ? cap(l.join(', ')) : '');
/** Its flowers' colors: "White, pink"; "Green; not showy"; "Not showy" (NC State's "Insignificant"). */
export function flowerText(l?: string[]): string {
  if (!l?.length) return '';
  const colors = l.filter((c) => c !== 'insignificant');
  const plain = colors.length < l.length;
  return colors.length ? cap(colors.join(', ')) + (plain ? '; not showy' : '') : 'Not showy';
}
/**
 * Poisonous to people, in its source's words: "Leaves and stems, medium severity; can irritate skin"; listed with
 * nothing more said: "Yes; no part or severity given".
 */
export function poisonText(x?: Plant['poison']): string {
  if (!x) return '';
  const parts = x.parts?.length ? (x.parts.length > 1 ? `${x.parts.slice(0, -1).join(', ')} and ${x.parts[x.parts.length - 1]}` : x.parts[0]) : '';
  const head = [parts && cap(parts), x.severity && `${parts ? x.severity : cap(x.severity)} severity`].filter(Boolean).join(', ');
  const skin = x.skin ? (head ? 'can irritate skin' : 'Can irritate skin') : '';
  return [head, skin].filter(Boolean).join('; ') || 'Yes; no part or severity given';
}
/**
 * The row's value for any plant: what its source lists; "None listed" where NC State's page was read and says nothing
 * of poison (a weak no: not "safe"); or, where no source we read rates it for people, "Not known", so a missing
 * warning isn't taken for a safe plant.
 */
export function poisonRow(p: Plant): string {
  if (parentRated(p)) return parentsPoisonText(p.poison_parents!);
  return p.poison ? poisonText(p.poison) : p.prov?.poison?.unknown ? 'None listed' : 'Not known: no source we read rates it for people';
}
/**
 * A hybrid no source rates, by its parents (Jason, 2026-10-29): "No rating available for this hybrid. Both parents are
 * rated. Morus alba: Fruits, leaves, sap and stems, low severity. Red mulberry (Morus rubra): Sap, low severity; can
 * irritate skin." A parent not rated, or listing none, is said too.
 */
export function parentsPoisonText(pp: NonNullable<Plant['poison_parents']>): string {
  const name = (x: PoisonParent) => (x.common ? `${x.common} (${x.name})` : x.name);
  const rated = pp.parents.filter((x) => x.poison), n = rated.length, all = n === pp.parents.length;
  const count = all ? (n === 2 ? 'Both parents are' : `All ${n} parents are`) : n === 1 ? '1 parent is' : `${n} parents are`;
  const each = pp.parents.map((x) => `${name(x)}: ${x.poison ? poisonText(x.poison) : x.poison === null ? 'none listed' : 'not rated'}.`);
  return [`No rating available for this hybrid. ${count} rated.`, ...each].join(' ');
}
/** "Green, silver"; "Variegated". */
const leafText = (l?: string[]) => (l?.length ? cap(l.join(', ')) : '');
/** Forms whose stems die back in winter, where "deciduous" means that, not bare branches. */
const HERB_FORMS = new Set(['Perennial', 'Grass/Sedge', 'Fern', 'Bulb', 'Aquatic/Emergent', 'Annual']);
/**
 * Its leaves in winter, in plain words: evergreen (with needles, said; a tender shrub's only where winters are
 * mild, `tenderWoody`); semi-evergreen; deciduous, which for an herb is dying back (a grass goes dormant, often
 * standing), and for a plant listed as both woody and herb (or a vine and a perennial) either. An annual's
 * winter isn't asked (it lives one season).
 */
export function winterText(p: Plant): string {
  const forms = formsOf(p);
  if (!p.foliage || (forms.length && forms.every((f) => f === 'Annual'))) return '';
  if (p.foliage === 'evergreen') return p.needles ? 'Evergreen, with needles' : tenderWoody(p) ? 'Evergreen where winters are mild; may die back in a cold one' : 'Evergreen: keeps its leaves';
  if (p.foliage === 'semi-evergreen') return 'Semi-evergreen: keeps some of its leaves, by the winter';
  const herb = forms.filter((f) => HERB_FORMS.has(f));
  if (forms.length && herb.length === forms.length) return forms.includes('Grass/Sedge') ? 'Goes dormant in winter' : 'Dies back in winter';
  return herb.length ? 'Deciduous: loses its leaves, or dies back to the ground' : 'Deciduous: loses its leaves';
}
/** NC State's color groups, said plainly ("Red/Burgundy": red). */
const COLOR_SAID: Record<string, string> = { 'red/burgundy': 'red', 'gold/yellow': 'yellow', 'purple/lavender': 'purple', 'brown/copper': 'brown', 'gray/silver': 'gray', 'cream/tan': 'cream' };
const colorsSaid = (cs?: string[]) => [...new Set((cs ?? []).map((c) => COLOR_SAID[c] ?? c))].join(', ');
/** Its bark, as NC State lists it, and the bark's colors: "Exfoliating, peeling; red, light brown". */
export function barkText(p: Plant): string {
  const looks = (p.bark ?? []).join(', '), colors = colorsSaid(p.bark_color);
  return looks && colors ? `${cap(looks)}; ${colors}` : looks || colors ? cap(looks || colors) : '';
}
/** Bark that shows, that a winter garden is made of (NC State's words for it). */
const SHOWY_BARK = ['exfoliating', 'peeling', 'shredding', 'papery', 'shaggy', 'patchy'];
/** Stems whose color shows once the leaves are down (not green, brown or gray). */
const SHOWY_STEMS = ['red/burgundy', 'orange', 'gold/yellow', 'purple/lavender', 'white', 'blue', 'pink'];
/**
 * What it's like in winter, each part with its source (Jason, 2026-10-25: "call out exfoliating bark"): its leaves;
 * then what makes winter interest, as its sources give it: showy bark, fruit that stays into winter, colored stems on a
 * deciduous tree or shrub it's listed for winter interest for, winter flowers; last, that it's listed for winter
 * interest. Each `[text, source, testid]`.
 */
export function winterParts(p: Plant): [string, string, string][] {
  const parts: [string, string, string][] = [];
  const leaves = winterText(p);
  if (leaves) parts.push([leaves, sourceLine(p.prov?.foliage), 'winter-leaves']);
  const bark = (p.bark ?? []).filter((b) => SHOWY_BARK.includes(b));
  if (bark.length) parts.push([`Showy bark: ${bark.join(', ')}`, sourceLine(p.prov?.bark), 'winter-bark']);
  if (p.fruit_season?.includes('winter')) {
    const colors = colorsSaid(p.fruit_color);
    parts.push([`Fruit stays into winter${colors ? `: ${colors}` : ''}`, sourceLine(p.prov?.fruit_season), 'winter-fruit']);
  }
  const woody = formsOf(p).some((f) => f === 'Tree' || f === 'Shrub');
  const stems = (p.stem_color ?? []).filter((c) => SHOWY_STEMS.includes(c));
  if (p.winter_interest && woody && p.foliage === 'deciduous' && stems.length) parts.push([`Colored stems: ${colorsSaid(stems)}`, sourceLine(p.prov?.stem_color), 'winter-stems']);
  if (p.bloom_season?.some((x) => x.endsWith('winter'))) parts.push(['Blooms in winter', sourceLine(p.prov?.bloom_season), 'winter-bloom']);
  if (p.winter_interest) parts.push([p.prov?.winter_interest?.src.includes('ncsu') ? 'Listed for winter gardens' : 'Has winter interest', sourceLine(p.prov?.winter_interest), 'winter-listed']);
  return parts;
}
/** The In winter row: winterParts, each with its source. Null: nothing to say. */
function winterRow(p: Plant): HTMLElement | null {
  const parts = winterParts(p);
  if (!parts.length) return null;
  const dd = el('dd', { 'data-testid': 'winter-row' });
  for (const [text, src, testid] of parts) {
    dd.appendChild(el('span', { className: 'details-part', 'data-testid': testid }, text));
    if (src) dd.appendChild(el('span', { className: 'details-src' }, src));
  }
  return dd;
}
/** "Yes: gold, red"; "No"; or, with colors and no yes or no, the colors. */
export const fallText = (p: Plant): string => {
  const colors = p.fall_colors?.length ? p.fall_colors.join(', ') : '';
  if (p.fall_color === false) return 'No';
  if (p.fall_color === true) return colors ? `Yes: ${colors}` : 'Yes';
  return colors ? cap(colors) : '';
};
const tox = (t?: Plant['tox']) => (!t ? '' : [t.dog && `dogs: ${t.dog}`, t.cat && `cats: ${t.cat}`, t.horse && `horses: ${t.horse}`, t.people && `people: ${t.people}`].filter(Boolean).join('; '));

/** Each row: label, the catalog's value, the facts it rests on, and how to write the other value where sources differ. */
type Row = [label: string, value: string, facts: string[], reported?: (r: Record<string, unknown>) => string];
function rows(p: Plant): Row[] {
  return [
    ['Form', formsOf(p).join(', '), ['form'], (r) => [r.form].flat().filter(Boolean).join(', ')],
    ['Height', ft(p.height), ['height'], (r) => ft(r.height as Plant['height'])],
    ['Spread', ft(p.width), ['width'], (r) => ft(r.width as Plant['width'])],
    ['Hardiness', (zoneRange(p) ?? '') + (zoneRange(p) ? zoneNote(p) : ''), ['zone_min', 'zone_max'],
      (r) => zoneRange({ zone_min: (r.zone_min ?? p.zone_min) as number, zone_max: (r.zone_max ?? p.zone_max) as number }) ?? ''],
    ['Sun', sun(p.sun_most, p.sun_least), ['sun_most', 'sun_least'], (r) => sun(r.sun_most ?? p.sun_most, r.sun_least ?? p.sun_least)],
    ['Water', p.water ?? '', ['water'], (r) => String(r.water ?? '')],
    // (Its months here, its season and the earlier list's months, each with its source: drawn by bloomRow.)
    ['Bloom', '', ['bloom_season', 'bloom']],
    // (Its sources' colors; else the earlier list's, or a plant of mine's own words.)
    ['Flower color', flowerText(p.flower_color) || p.bloom?.color || '', p.flower_color?.length ? ['flower_color'] : ['bloom']],
    ['Native', p.native ?? '', ['native']],
    ['Nectar for pollinators', p.nectar ?? '', ['nectar']],
    ['For birds', p.bird ?? '', ['bird']],
    // (Who visits, as NC State lists them: "Butterflies, bees, hummingbirds".)
    ['Attracts', p.attracts?.length ? cap(p.attracts.join(', ')) : '', ['attracts']],
    // (The caterpillars its sources name; its genus's, where the garden is; the earlier list's: drawn by hostRow.)
    ['Caterpillar host', '', ['hosts', 'host_genus', 'host']],
    ['Deer', deerWords(p.deer), ['deer'], (r) => deerWords(r.deer as string | undefined)],
    // (What it takes, as NC State lists it: "Drought, heat, rabbits, black walnut"; deer has its own row.)
    ['Tolerates', p.tolerates?.some((x) => x !== 'deer') ? cap(p.tolerates.filter((x) => x !== 'deer').join(', ')) : '', ['tolerates']],
    // (Drawn by toxRow: never left out for a catalog plant, since no line about pets reads as safe.)
    ['Toxicity', '', ['tox', 'dog']],
    // (Beside Edible: a plant can be both, its fruit eaten and its seeds poisonous.)
    ['Poisonous to people', poisonRow(p), parentRated(p) ? ['poison_parents'] : ['poison']],
    ['Edible', p.edible === true && p.poison ? 'Yes, though it\'s also listed as poisonous to people (above)' : yes(p.edible), ['edible']],
    ['Thorns', yes(p.thorns), ['thorns']],
    // (As its source lists them: NC State's take in the seasons and the undersides.)
    ['Leaf colors', leafText(p.leaf_color), ['leaf_color']],
    // (Where the garden is, from USA-NPN's records of plants leafing out: drawn by leafOutRow.)
    ['Leafs out', '', ['leaf_out']],
    // (Its leaves, then what makes winter interest, each with its source: drawn by winterRow.)
    ['In winter', '', ['foliage', 'bark', 'fruit_season', 'stem_color', 'winter_interest']],
    // (As NC State lists it, with its colors: "Exfoliating, peeling; red, light brown".)
    ['Bark', barkText(p), ['bark', 'bark_color']],
    ['Fall color', fallText(p), ['fall_color', 'fall_colors']],
    ['Growth rate', p.growth_rate ? cap(p.growth_rate) : '', ['growth_rate']],
    ['Takes clay', yes(p.clay_ok), ['clay_ok']],
    ['Takes wet feet', yes(p.wet_feet), ['wet_feet']],
    ['Takes dry shade', yes(p.dry_shade), ['dry_shade']],
    // (By seed, and underground or by runners: two facts, one question, "will it spread?"; drawn by spreadRow.)
    ['How it spreads', '', ['self_seed', 'habit']],
    // (NC State's level where it gives one; else the earlier list's task.)
    ['Maintenance', p.maintenance_level ? cap(p.maintenance_level) : p.maintenance ?? '', p.maintenance_level ? ['maintenance_level'] : ['maintenance']],
    ['Taproot (hard to move)', yes(p.taproot), ['taproot']],
    ['Humidity', p.humidity === 'humid' ? 'Likes humid summers' : p.humidity === 'dry' ? 'Likes dry air' : p.humidity === 'either' ? 'Either' : '', ['humidity']],
    // (A habit that speaks to spreading is under "How it spreads"; one that doesn't, a vine's twining, stays here.)
    ['Habit', rootSpread(p.habit) && rootSpread(p.habit) !== 'shape' ? '' : p.habit ?? '', ['habit']],
    ['Trunk', p.trunk ? `${p.trunk} in across` : '', ['trunk']],
    ['Nativar', p.nativar ? 'A cultivar of a native species' : '', ['nativar']],
  ];
}
/** How sure, strongest first: the weaker of two halves of a range is how sure the range is. */
const STRENGTH = ['agree', 'confirmed', 'single', 'likely', 'reported', 'disputed'];
/** The two ends of a range, in words, for a range whose ends come from different sources. */
const ENDS: Record<string, [string, string]> = { zone_min: ['cold limit', 'warm limit'], sun_most: ['most sun', 'least sun'] };
/**
 * Where a range came from (zones, sun: two facts): the sources that gave both ends, as sure as the less sure end.
 * Sources can decide each end apart (nurseries outnumbering NC State on one end only), so a source behind one
 * end isn't named for the range; where no source gave both, each end says its own.
 */
function rangeLine(facts: string[], prov: Record<string, Provenance> | undefined): string {
  const [a, b] = facts.map((f) => prov?.[f]);
  if (!a || !b || a.unknown || b.unknown) return sourceLine(a && !a.unknown ? a : b);
  const weaker = [a.check, b.check].sort((x, y) => STRENGTH.indexOf(x ?? 'disputed') - STRENGTH.indexOf(y ?? 'disputed'))[1];
  const both = a.src.filter((s) => b.src.includes(s));
  // (Fewer sources behind the whole range than behind either end: how sure, by those sources.)
  const ref = both.some((s) => PLANT_META?.sources?.[s]?.trust === 'reference');
  const fewer = both.length < a.src.length || both.length < b.src.length;
  const check = !fewer ? weaker : ref ? (both.length > 1 ? 'confirmed' : 'single') : both.length > 1 ? 'likely' : 'reported';
  if (both.length) return sourceLine({ ...a, src: both, check, inherited: a.inherited || b.inherited });
  const [ea, eb] = ENDS[facts[0]] ?? [facts[0], facts[1]];
  const names = (pv: Provenance) => (pv.src.length === 1 && PLANT_META?.sources?.[pv.src[0]]?.trust === 'unverified' ? 'earlier list, unverified' : pv.src.map(sourceName).join(', '));
  const how = (pv: Provenance) => (pv.check && SURE[pv.check] ? ` (${SURE[pv.check]})` : '');
  return [`${names(a)} for the ${ea}${how(a)}; ${names(b)} for the ${eb}${how(b)}`, a.inherited || b.inherited ? 'from its species' : ''].filter(Boolean).join(' · ');
}
/**
 * "How it spreads": by seed, and underground or by runners, each with its own source (they come from separate
 * sources). Self-sowing looked up and not found is said so; a part not looked up is left out. Null: nothing to say.
 */
function spreadRow(p: Plant): HTMLElement | null {
  const seed = seedText(p) || (p.prov?.self_seed?.unknown ? 'Self-sowing not known: none of the sources say' : '');
  const parts: [string, string][] = [];
  if (seed) parts.push([seed, sourceLine(p.prov?.self_seed)]);
  const roots = rootText(p);
  if (roots) parts.push([roots, sourceLine(p.prov?.habit)]);
  if (!parts.length) return null;
  const dd = el('dd', { 'data-testid': 'spreads' });
  // (One source line under both where they share it: "earlier list, unverified" once, not twice.)
  const same = parts.length === 2 && parts[0][1] === parts[1][1];
  parts.forEach(([text, src], i) => {
    dd.appendChild(el('span', { className: 'details-part' }, text));
    if (src && !(same && i === 0)) dd.appendChild(el('span', { className: 'details-src' }, src));
  });
  return dd;
}
/**
 * When it blooms, each part with its own source: where the garden is, the months its flowering records there give
 * (src/wild.ts); its season, as its sources say; and, with no records here, the earlier list's months (a plant of
 * mine: its own). Null: nothing to say.
 */
function bloomRow(p: Plant): HTMLElement | null {
  const parts: [text: string, src: string, testid?: string][] = [];
  const local = localBloom(p);
  if (local) parts.push([`${months(local)}, peak ${MONTH_NAMES[local.peak]}`,
    `${local.species ? 'its species: ' : ''}${local.n} flowering records in ${local.stateName}${local.area === 'region' ? ' and neighboring states' : ''} · ${local.source}`, 'local-bloom']);
  if (p.bloom_season?.length) parts.push([seasonText(p.bloom_season), sourceLine(p.prov?.bloom_season), 'bloom-season']);
  if (!local && p.bloom?.start) parts.push([months(p.bloom), sourceLine(p.prov?.bloom), 'bloom-months']);
  if (!parts.length) return null;
  const dd = el('dd', { 'data-testid': 'bloom-row' });
  for (const [text, src, testid] of parts) {
    dd.appendChild(el('span', { className: 'details-part', ...(testid ? { 'data-testid': testid } : {}) }, text));
    if (src) dd.appendChild(el('span', { className: 'details-src' }, src));
  }
  return dd;
}
/**
 * When it leafs out where the garden is: the middle day of its plant-years there, and the middle half of them
 * ("Around Mar 28 (most Mar 16 to Apr 4)"), with how many and where, and the source. Null: too few records.
 */
function leafOutRow(p: Plant): HTMLElement | null {
  const l = localLeafOut(p);
  if (!l) return null;
  const dd = el('dd', { 'data-testid': 'leaf-out-row' });
  dd.appendChild(el('span', { className: 'details-part' }, `Around ${dayOfYear(l.med)} (most ${dayOfYear(l.q1)} to ${dayOfYear(l.q3)})`));
  dd.appendChild(el('span', { className: 'details-src' },
    `${l.species ? 'its species: ' : ''}${l.n} plant-years in ${l.stateName}${l.area === 'region' ? ' and neighboring states' : ''} · ${l.source}`));
  return dd;
}
/** Butterflies' common names, for a line, with field-guide capitals: "Monarch, Gray Hairstreak" (the binomials are in the source). */
const commonNames = (names: string[]) => names.map((n) => butterflyCaps(n.replace(/\s*\([^)]*\)\s*$/, ''))).join(', ');
const countWords = (n: number) => n.toLocaleString('en-US');
/**
 * Caterpillar host, each part with its own source: the caterpillars its sources name it a host for; its genus's
 * count of native caterpillar species (Shropshire & Tallamy), where the garden is in that state, with the butterflies
 * among them; and, where no source names any, the earlier list's sentence. Null: nothing to say.
 */
function hostRow(p: Plant): HTMLElement | null {
  const parts: [text: string, src: string, testid: string][] = [];
  if (p.hosts?.length) parts.push([commonNames(p.hosts), sourceLine(p.prov?.hosts), 'hosts-named']);
  if (p.host_genus) {
    const here = hostsHere(p), g = p.host_genus;
    const text = here
      ? `Its genus, ${g.genus}: ${countWords(here.n)} kinds of native caterpillars in ${here.stateName} (${countWords(g.species)} in North America)`
        + (here.butterflies.length ? `. Butterflies among them: ${commonNames(here.butterflies)}` : '')
      : `Its genus, ${g.genus}: ${countWords(g.species)} kinds of native caterpillars in North America`;
    parts.push([text, [here?.source ?? sourceLine(p.prov?.host_genus), 'counted for the genus'].filter(Boolean).join(' \u00b7 '), 'hosts-genus']);
  }
  if (!p.hosts?.length && p.host) parts.push([butterflyCaps(p.host), sourceLine(p.prov?.host), 'hosts-earlier']);
  if (!parts.length) return null;
  const dd = el('dd', { 'data-testid': 'host-row' });
  for (const [text, src, testid] of parts) {
    dd.appendChild(el('span', { className: 'details-part', 'data-testid': testid }, text));
    if (src) dd.appendChild(el('span', { className: 'details-src' }, src));
  }
  return dd;
}
/**
 * Toxicity to animals, never left blank on a catalog plant (no line reads as "safe"): NC State's "Problem for"; its
 * own rating; else the earlier list's warning for another record of its species; else not listed by NC State, or not
 * rated. Null for a plant of mine with no species to go by (one linked to its species is said as for the catalog's).
 */
export function toxRow(p: Plant): { value: string; line: string } | null {
  // NC State's "Problem for Dogs" (cats, horses) first, with its source; the earlier list's word on dogs beside it where
  // NC State says nothing of dogs.
  const nc = p.problem_for?.length ? ['dogs', 'cats', 'horses'].filter((a) => p.problem_for!.includes(a)) : null; // (in one order)
  const earlier = p.tox?.dog ? '' : p.dog && p.dog !== 'Unverified' ? `dogs: ${p.dog}` : '';
  if (nc) {
    const also = !nc.includes('dogs') && earlier ? earlier : '';
    return { value: `A problem for ${andList(nc)}` + (also ? `; ${also}` : ''), line: sourceLine(p.prov?.problem_for) + (also ? ' · dogs: earlier list, unverified' : '') };
  }
  const warnsHere = p.tox?.dog === 'toxic' || !!oldDogWarning(p);
  if (p.dogVia && !warnsHere) {
    return { value: `dogs: ${p.dogVia.dog}`, line: `earlier list, unverified · given for ${p.dogVia.common}, the same species` + (p.dog === 'Safe' ? '; the earlier list calls this one safe' : '') };
  }
  const own = tox(p.tox) || (p.dog && p.dog !== 'Unverified' ? `dogs: ${p.dog}` : '');
  if (own) return { value: own, line: sourceLine(p.prov?.tox ?? p.prov?.dog) };
  if (isMine(p) && !p.parent) return null; // (one of mine linked to its species: said as for the catalog's)
  // (NC State's page read, and it lists no animal: said so, and that it isn't the same as safe.)
  if (p.prov?.poison?.src.includes('ncsu')) return { value: 'Not listed as a problem for dogs, cats or horses', line: 'NC State · a plant not listed isn\u2019t necessarily safe' };
  return { value: 'Not rated for pets', line: 'No source we\u2019ve read rates it for dogs, cats or horses' };
}
/** Where a value came from, in a few words: "NC State, USDA · confirmed", "earlier list, unverified". */
function sourceLine(prov: Provenance | undefined): string {
  if (!prov) return '';
  if (prov.src.length === 1 && PLANT_META?.sources?.[prov.src[0]]?.trust === 'unverified') return 'earlier list, unverified';
  // (A value read from a page's text, not its fields, credits that: "Prose description, NC State …" (Jason, 2026-10-27:
  // credit it, don't quote it).)
  const who = (prov.from === 'description' ? 'Prose description, ' : '') + prov.src.map(sourceName).join(', ');
  const how = prov.check ? SURE[prov.check] ?? '' : '';
  return [who, how, prov.inherited ? 'from its species' : '', prov.at ? `for ${prov.at}` : ''].filter(Boolean).join(' · ');
}

/**
 * The opened row. `flagged`: what this plant matches the filters on only by
 * what other sources say (said first, in words).
 */
export function plantDetails(p: Plant, flagged: string[] | undefined): HTMLElement {
  const box = el('div', { className: 'plant-details', 'data-testid': 'plant-details' });
  if (flagged?.length) {
    box.appendChild(el('div', { className: 'details-flag', 'data-testid': 'reported-flag' },
      `Shown because of what other sources say for its ${flagged.join(' and ')}; the value shown first says otherwise (below).`));
  }
  if (p.botanical) box.appendChild(el('div', { className: 'details-bot' }, p.botanical));
  const dl = el('dl', { className: 'details-list' });
  for (const [label, value, facts, reportedText] of rows(p)) {
    if (label === 'How it spreads') { const dd = spreadRow(p); if (dd) { dl.appendChild(el('dt', {}, label)); dl.appendChild(dd); } continue; }
    if (label === 'Bloom') { const dd = bloomRow(p); if (dd) { dl.appendChild(el('dt', {}, label)); dl.appendChild(dd); } continue; }
    if (label === 'Leafs out') { const dd = leafOutRow(p); if (dd) { dl.appendChild(el('dt', {}, label)); dl.appendChild(dd); } continue; }
    if (label === 'In winter') { const dd = winterRow(p); if (dd) { dl.appendChild(el('dt', {}, label)); dl.appendChild(dd); } continue; }
    if (label === 'Caterpillar host') { const dd = hostRow(p); if (dd) { dl.appendChild(el('dt', {}, label)); dl.appendChild(dd); } continue; }
    if (label === 'Toxicity') {
      const t = toxRow(p);
      if (t) { dl.appendChild(el('dt', {}, label)); dl.appendChild(el('dd', { 'data-testid': 'tox-row' }, t.value, ...(t.line ? [el('span', { className: 'details-src' }, t.line)] : []))); }
      continue;
    }
    const prov = facts.map((f) => p.prov?.[f]).find(Boolean);
    const reported = p.reported && facts.some((f) => f in p.reported!) && reportedText ? reportedText(p.reported) : '';
    if (!value && !reported) {
      // Looked up, and none of the sources say: shown as such, so it isn't mistaken for "not looked at".
      if (facts.some((f) => p.prov?.[f]?.unknown)) { dl.appendChild(el('dt', {}, label)); dl.appendChild(el('dd', { className: 'details-unknown' }, 'Not known: none of the sources say')); }
      continue;
    }
    const dd = el('dd', label === 'Flower color' ? { 'data-testid': 'flower-color' } : {}, value || '—');
    const line = ENDS[facts[0]] ? rangeLine(facts, p.prov) : sourceLine(prov); // (a range: hardiness, sun; not toxicity's two facts)
    if (line) dd.appendChild(el('span', { className: 'details-src' }, line));
    // Hardiness shown from nurseries only: say so, since a grower's range can stop where it sells, not where the
    // plant grows. (Said of the value shown: a reference giving another range is beside it, by name.)
    const nurseryOnly = (pv?: Provenance) => !!pv && !pv.unknown && pv.src.length > 0 && pv.src.every((s) => PLANT_META?.sources?.[s]?.trust === 'nursery');
    if (label === 'Hardiness') {
      const [cold, warm] = [nurseryOnly(p.prov?.zone_min), nurseryOnly(p.prov?.zone_max)];
      const which = cold && warm ? 'This range is from nurseries only, and a grower\'s range can stop where it sells.'
        : cold ? 'Its cold limit is from nurseries only.'
        : warm ? 'Its warm limit is from nurseries only.' : '';
      if (which) dd.appendChild(el('span', { className: 'details-alt', 'data-testid': 'nursery-only' }, which));
    }
    if (reported && reported !== value) {
      const alt = facts.map((f) => p.prov?.[f]?.alt).find(Boolean);
      dd.appendChild(el('span', { className: 'details-alt' }, alt ? otherValue(alt.src, reported) : `Also reported: ${reported}`));
    }
    dl.appendChild(el('dt', {}, label));
    dl.appendChild(dd);
  }
  // What the law says of it where the garden is (a state's list, the federal one), each with its rule: first,
  // above the catalog's facts, where it can't be missed.
  const localRows = document.createDocumentFragment();
  const notesShown = new Set<string>();
  for (const rule of regulatedHere(p)) {
    const dd = el('dd', { 'data-testid': 'regulated-here', className: `details-law${rule.tier === 'listed' ? ' listed' : ''}` }, rule.says);
    // (Native here and covered anyway: why, in plain words, under the rule's own.)
    if (rule.native) dd.appendChild(el('span', { className: 'details-law-native', 'data-testid': 'law-native' }, rule.native));
    const src = el('span', { className: 'details-src' });
    src.appendChild(el('a', { href: rule.url, target: '_blank', rel: 'noopener' }, rule.title));
    src.appendChild(document.createTextNode(`; ${rule.edition}; read ${rule.read}`));
    dd.appendChild(src);
    // (And, after the rule and its source, a documented fact about the plants it names, to help a gardener see why a
    // list might include them; with its own source. Once a plant: the same note from two rules isn't said twice.)
    if (rule.background && !notesShown.has(rule.background.note)) {
      notesShown.add(rule.background.note);
      const bg = el('span', { className: 'details-law-native details-law-bg', 'data-testid': 'law-background' }, `${rule.background.note} (`);
      bg.appendChild(el('a', { href: rule.background.url, target: '_blank', rel: 'noopener', className: 'details-src-inline' }, rule.background.title));
      bg.appendChild(document.createTextNode(')'));
      dd.appendChild(bg);
    }
    localRows.appendChild(el('dt', {}, 'By law'));
    localRows.appendChild(dd);
  }
  // Native to the garden's state or not (Kew's checklist): the catalog's "native" is North America-wide. With the
  // law's lines, above the catalog's facts: whether it belongs here, and whether it's recorded wild here, matter first.
  const native = nativeHere(p);
  if (native) {
    // (Not native, and recorded growing wild here all the same: said with the counties, and their sources.)
    const escape = escapeHere(p);
    const dd = el('dd', { 'data-testid': 'native-here', ...(native.status === 'I' ? { className: 'details-introduced' } : {}) }, escape ? escapeText(escape) : nativeText(native));
    dd.appendChild(el('span', { className: 'details-src' }, [native.source, ...(escape?.sources ?? [])].join(' · ')));
    localRows.appendChild(el('dt', {}, `In ${native.stateName}`));
    localRows.appendChild(dd);
  }
  dl.insertBefore(localRows, dl.firstChild);
  // Where it grows wild near the garden (the state's county records): shown after the catalog's facts.
  const wild = wildHere(p);
  if (wild) {
    const dd = el('dd', { 'data-testid': 'wild-here' }, wildText(wild));
    dd.appendChild(el('span', { className: 'details-src' }, wild.sources.join('; ')));
    dl.appendChild(el('dt', {}, 'Wild near you'));
    dl.appendChild(dd);
  }
  box.appendChild(dl);
  if (p.notes) box.appendChild(el('div', { className: 'details-notes' }, p.notes));
  // (A plant of mine switched to this one: its notes come along.)
  else if (ownCopies[p.id]?.notes) box.appendChild(el('div', { className: 'details-notes', 'data-testid': 'own-notes' }, 'Your notes: ' + ownCopies[p.id].notes));
  // (Once it's on the page, where a line's width can be told.)
  requestAnimationFrame(() => clipCitations(box));
  return box;
}

/** A source's short name in a citation cut to a line ("NC State" for NC State Extension Gardener Plant Toolbox). */
const CITE_SHORT: Record<string, string> = { ncsu: 'NC State', usda: 'USDA', arkatlas: 'Arkansas atlas', mnwild: 'Minnesota Wildflowers' };
/** A citation with each source it names by its short name. */
export function shortSources(text: string): string {
  let out = text;
  for (const [id, short] of Object.entries(CITE_SHORT)) {
    const title = PLANT_META?.sources?.[id]?.title;
    if (title && title !== short) out = out.split(title).join(short);
  }
  return out;
}
/**
 * Each citation that would take more than a line, cut to one ending "…", opened in full with a tap (Jason,
 * 2026-10-27: a long one pushed the details apart). Closed, a tap on it opens it, a link in it too; open, a link
 * is followed, and a tap elsewhere on it closes it. Only one that doesn't fit: measured once it's laid out.
 */
export function clipCitations(root: HTMLElement) {
  for (const s of root.querySelectorAll<HTMLElement>('.details-src:not(.clipped)')) {
    s.classList.add('one-line');
    const over = s.scrollWidth > s.clientWidth + 1;
    s.classList.remove('one-line');
    if (!over) continue;
    s.classList.add('clipped');
    s.setAttribute('role', 'button');
    s.tabIndex = 0;
    s.setAttribute('aria-expanded', 'false');
    const full = s.textContent ?? '';
    s.title = full;
    // (Shut, the sources it names go by their short names, so how sure it is still shows: "NC State, USDA ·
    // confirmed", drawn by the style from `data-short`. Only on a line of plain text: one with a link stays as it is.
    // The whole of it stays the line's text, hidden while shut, for a screen reader and a search of the page.)
    const short = s.children.length ? null : shortSources(full);
    if (short && short !== full) { s.dataset.short = short; s.replaceChildren(el('span', { className: 'cite-full' }, full)); }
    const toggle = (e: Event) => {
      e.stopPropagation();
      const open = s.getAttribute('aria-expanded') === 'true';
      if (!open) e.preventDefault();
      else if ((e.target as HTMLElement).closest('a')) return;
      s.setAttribute('aria-expanded', String(!open));
    };
    s.addEventListener('click', toggle);
    s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } });
  }
}
