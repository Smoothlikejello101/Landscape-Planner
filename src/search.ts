import type { Plant } from './plants';
import { hostsHere } from './wild';

// Plant search: the picker's search box, for the catalog and "My plants".
//
// A search matches word by word, in any order, so "Bradford pear" finds "Bradford/Callery pear" and "Winterthur
// viburnum" finds "Witherod viburnum 'Winterthur'". Punctuation and accents don't count; apostrophes are dropped
// ("Wood's sedge" is "woods sedge"). A word may run on across the name's next words ("witchhazel" finds "witch
// hazel") or sit inside one ("bee balm" finds "beebalm", "flower" finds "coneflower"), and a plural finds its
// singular ("asters"). Botanical names match from a word's start ("rubra", not "brich" in "hubrichtii").
//
// When nothing anywhere matches so, a word spelled a little differently does ("viburnam", "corepsis"). That's
// decided over everything searched, before any filter: a search for "pear" isn't padded with "pea", and "holly"
// with a filter that leaves no hollies says so rather than showing "Hollow Joe Pye weed".

/** Text for searching: lower case, no accents or apostrophes, other punctuation as spaces. */
export const searchText = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’‘`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const wordsOf = (s: string | undefined): string[] => { const t = s ? searchText(s) : ''; return t ? t.split(' ') : []; };

/**
 * A search, read once: its words, each with what it might be the plural of. A singular counts only as a whole word
 * ("roses" finds "rose", not "rosemary"; "pines" finds "pine", not "pink"), or for "-ies" as a word's end too
 * ("berries" finds "elderberry").
 */
export interface Word { w: string; one: string[]; oneAtEnd: string[] }
export interface Query { text: string; words: Word[]; /** The search, and as its singulars: for the order. */ texts: string[] }
const reads = new Map<string, Query | null>();
/** The search as typed, or null when it has no words (empty, or only punctuation: "'" isn't a search). */
export function readQuery(q: string): Query | null {
  const had = reads.get(q);
  if (had !== undefined) return had;
  const words = wordsOf(q);
  const ws = words.map(plurals);
  const read = words.length ? { text: words.join(' '), words: ws, texts: [words.join(' '), ...singularTexts(ws)] } : null;
  if (reads.size > 16) reads.clear(); // (a few kept: a filter check reads '' between two reads of the search)
  reads.set(q, read);
  return read;
}
/** The search read as singulars ("climbing roses" → "climbing rose"), each way a plural reads. */
function singularTexts(ws: Word[]): string[] {
  if (!ws.some((x) => x.one.length || x.oneAtEnd.length)) return [];
  let out = [''];
  for (const x of ws) {
    const alts = x.one.length || x.oneAtEnd.length ? [...x.one, ...x.oneAtEnd] : [x.w];
    out = out.flatMap((pre) => alts.map((a) => (pre ? pre + ' ' : '') + a)).slice(0, 8);
  }
  return out;
}
function plurals(w: string): Word {
  const one: string[] = [], oneAtEnd: string[] = [];
  if (w.length >= 5 && w.endsWith('ies')) oneAtEnd.push(w.slice(0, -3) + 'y'); // lilies, berries
  else if (w.length >= 5 && /(s|x|z|ch|sh)es$/.test(w)) one.push(w.slice(0, -2), w.slice(0, -1)); // grasses, bushes; roses
  else if (w.length >= 4 && w.endsWith('s') && !/(ss|is|us)$/.test(w)) one.push(w.slice(0, -1)); // asters, oaks; not iris, cactus
  return { w, one, oneAtEnd };
}

/**
 * A plant's names as words, read once (and again if they change: a plant of mine edited). `base`: its name without
 * a cultivar or a note in brackets ("Black-eyed Susan 'Goldsturm'" → "black eyed susan").
 */
interface Indexed { key: string; name: string[]; bot: string[]; host: string; nameText: string; base: string; baseWords: string[]; botBase: string; also: string[][] }
/**
 * The caterpillars a plant feeds, as searched: those its sources name, the earlier list's sentence, and, where the
 * garden is, the butterflies recorded on its genus there ("monarch" finds milkweed).
 */
export function hostWords(p: Plant): string {
  return [p.host ?? '', ...(p.hosts ?? []), ...(hostsHere(p)?.butterflies ?? [])].filter(Boolean).join('; ');
}
const index = new WeakMap<Plant, Indexed>();
const baseOf = (s: string | undefined) => (s ? searchText(s.replace(/['‘’][^'‘’]*['‘’]|\([^)]*\)/g, ' ')) : '');
function indexed(p: Plant): Indexed {
  const hosts = hostWords(p);
  const key = p.common + '\n' + (p.botanical ?? '') + '\n' + hosts + '\n' + (p.synonyms ?? []).join('\n');
  const had = index.get(p);
  if (had && had.key === key) return had;
  const name = wordsOf(p.common);
  const made = {
    key, name, bot: wordsOf(p.botanical), host: hosts ? searchText(hosts) : '', nameText: name.join(' '),
    base: baseOf(p.common), baseWords: baseOf(p.common).split(' '), botBase: baseOf(p.botanical),
    also: (p.synonyms ?? []).map((n) => wordsOf(n)),
  };
  index.set(p, made);
  return made;
}

/** A word starting a word of `ws`, or running on from one across the next ("witchhazel" over "witch", "hazel"). */
function startsIn(q: string, ws: string[]): boolean {
  for (let k = 0; k < ws.length; k++) {
    if (ws[k].startsWith(q)) return true;
    if (!q.startsWith(ws[k])) continue;
    let run = ws[k];
    for (let j = k + 1; j < ws.length && run.length < q.length; j++) {
      run += ws[j];
      if (run.startsWith(q)) return true;
      if (!q.startsWith(run)) break;
    }
  }
  return false;
}
const inside = (q: string, ws: string[]) => ws.some((w) => w.includes(q));

/** Edits (a letter added, dropped, changed, or two swapped) from a to b; anything over `most` is reported as most + 1. */
export function edits(a: string, b: string, most: number): number {
  if (Math.abs(a.length - b.length) > most) return most + 1;
  let prev2: number[] = [], prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], prev2[j - 2] + 1);
    }
    if (Math.min(...row) > most) return most + 1;
    prev2 = prev; prev = row;
  }
  return Math.min(prev[b.length], most + 1);
}
/**
 * How near a searched word comes to a word of `ws`, in edits, or null: one slip in five to eight letters, two from
 * nine ("viburnam", "corepsis", "croeopsis"); and from seven letters, one in the start of a longer word ("echinsc").
 */
function nearIn(q: string, ws: string[]): number | null {
  if (q.length < 5) return null;
  const most = q.length >= 9 ? 2 : 1;
  let best: number | null = null;
  for (const w of ws) {
    let d = edits(q, w, most);
    // (The start of a longer word: one slip at most, whatever the length.)
    if (q.length >= 7 && w.length > q.length && edits(q, w.slice(0, q.length), 1) <= 1) d = Math.min(d, 1);
    if (d <= most && (best === null || d < best)) best = d;
  }
  return best;
}

/**
 * How a plant matches, best first: rank 0 every word starts a word of its name; 1 its name has every word (inside
 * a word, or run together); 2 its name and botanical name together do; 3 only what it hosts ("monarch" finds
 * milkweed); 4 a word is spelled a little differently from one in its name, 5 from one in its botanical name.
 * `order` sorts within a rank: 0 its exact name or botanical name (a cultivar's or not); 1 a name ending with the
 * search, as plant names end with what they are ("Bur oak" for "oak"); 2 one starting with it as whole words ("Oak
 * fern"); 3 holding it as a phrase; 4 the rest. Ranks 4 and 5: by how near.
 */
export interface Hit { rank: number; order: number; /** Found by another name it goes by: that name. */ also?: string }
export function matchPlant(p: Plant, q: Query, near: boolean): Hit | null {
  const x = indexed(p);
  const orderFor = (t: string) => (x.nameText === t || x.base === t || x.botBase === t ? 0 : x.base.endsWith(' ' + t) ? 1
    : x.base.startsWith(t + ' ') || x.nameText.startsWith(t + ' ') ? 2 : (' ' + x.nameText + ' ').includes(' ' + t + ' ') ? 3 : 4);
  const order = Math.min(...q.texts.map(orderFor));
  // A word, or what it's the plural of: as a whole word, or for "-ies" the end of a word of the name itself (not a
  // cultivar's: "berries" finds elderberry, not Beebalm 'Raspberry Wine').
  const asOne = (q: Word, ws: string[]) => q.one.some((f) => ws.includes(f)) || q.oneAtEnd.some((f) => ws.includes(f) || (ws === x.name && x.baseWords.some((w) => w.endsWith(f))));
  const startsName = (q: Word) => startsIn(q.w, x.name) || asOne(q, x.name);
  if (q.words.every(startsName)) return { rank: 0, order };
  const inName = (q: Word) => startsName(q) || inside(q.w, x.name);
  if (q.words.every(inName)) return { rank: 1, order };
  // (Another name it goes by, or had: "chiggerflower", "Limelight Hydrangea" for Hydrangea 'Limelight'.)
  const also = x.also.findIndex((ws) => q.words.every((w) => startsIn(w.w, ws) || asOne(w, ws)));
  if (also >= 0) return { rank: 1, order: order + 1, also: p.synonyms![also] };
  const inBoth = (q: Word) => inName(q) || startsIn(q.w, x.bot) || asOne(q, x.bot);
  if (q.words.every(inBoth)) return { rank: 2, order };
  // (Inside a word too, "oak" in "mourning cloak", kept for the butterflies' sake, after those starting a word.)
  if (x.host && q.words.every((q) => x.host.includes(q.w))) {
    const hostWords = x.host.split(' ');
    return { rank: 3, order: q.words.every((w) => startsIn(w.w, hostWords) || asOne(w, hostWords)) ? 0 : 1 };
  }
  if (!near) return null;
  // Near: every word matches as above, or nearly (in the name: rank 4; any in the botanical name: rank 5).
  let rank = 4, off = 0;
  for (const word of q.words) {
    if (inBoth(word)) continue;
    const n = nearIn(word.w, x.name);
    if (n !== null) { off += n; continue; }
    const b = nearIn(word.w, x.bot);
    if (b === null) return null;
    off += b; rank = 5;
  }
  return { rank, order: off };
}
/**
 * Why a search found a plant by what it hosts, in words: the caterpillars that match, those its sources name ("Its
 * leaves feed the caterpillars of: Monarch (Danaus plexippus)") or recorded on its genus where the garden is ("Its
 * genus feeds the caterpillars of: …"); else the earlier list's sentence. Null where none matches.
 */
export function hostMatchText(p: Plant, q: Query): string | null {
  const has = (name: string) => { const t = searchText(name); return q.words.every((w) => t.includes(w.w)); };
  const named = (p.hosts ?? []).filter(has);
  if (named.length) return 'Its leaves feed the caterpillars of: ' + named.join(', ');
  const genus = (hostsHere(p)?.butterflies ?? []).filter(has);
  if (genus.length) return `Its genus feeds the caterpillars of: ${genus.join(', ')}`;
  return p.host && has(p.host) ? 'Its leaves feed the caterpillars of: ' + p.host : null;
}
/** Whether anything in these lists matches the search closer than a near spelling (if not, near spellings show). */
export function closeMatchIn(q: Query, ...lists: Plant[][]): boolean {
  return lists.some((ps) => ps.some((p) => matchPlant(p, q, false)));
}
/** Whether a plant of mine's notes have every searched word (or its singular), each starting a word of them. */
export function inNotes(p: Plant, q: Query): boolean {
  if (typeof p.notes !== 'string') return false;
  const ws = wordsOf(p.notes);
  return q.words.every((word) => [word.w, ...word.one].some((f) => ws.some((w) => w.startsWith(f))));
}
/**
 * Whether close spellings show: nothing in the catalog or my plants matches as typed, by name or (mine) by notes.
 * Decided before any filter.
 */
export function nearShows(q: Query | null, catalog: Plant[], mine: Plant[]): boolean {
  return !!q && !closeMatchIn(q, catalog, mine) && !mine.some((p) => inNotes(p, q));
}
/** Hits sorted best first, then alphabetically. */
export function byMatch<T extends { plant: Plant; hit: Hit }>(a: T, b: T): number {
  return a.hit.rank - b.hit.rank || a.hit.order - b.hit.order || a.plant.common.localeCompare(b.plant.common);
}
