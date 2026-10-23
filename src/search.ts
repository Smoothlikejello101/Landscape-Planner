import type { Plant } from './plants';

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

/** A search, read once: its words, each with its singular forms ("asters" → "aster"; "grasses" → "grass"). */
export interface Query { text: string; words: string[][] }
let lastRead: { q: string; read: Query | null } = { q: '', read: null };
/** The search as typed, or null when it has no words (empty, or only punctuation: "'" isn't a search). */
export function readQuery(q: string): Query | null {
  if (q === lastRead.q) return lastRead.read;
  const words = wordsOf(q);
  const read = words.length ? { text: words.join(' '), words: words.map(forms) } : null;
  lastRead = { q, read };
  return read;
}
function forms(w: string): string[] {
  const out = [w];
  if (w.length >= 4 && w.endsWith('s') && !w.endsWith('ss')) out.push(w.slice(0, -1));
  if (w.length >= 5 && w.endsWith('es')) out.push(w.slice(0, -2));
  return out;
}

/** A plant's names as words, read once (and again if they change: a plant of mine edited). */
interface Indexed { key: string; name: string[]; bot: string[]; host: string; nameText: string }
const index = new WeakMap<Plant, Indexed>();
function indexed(p: Plant): Indexed {
  const key = p.common + '\n' + (p.botanical ?? '') + '\n' + (p.host ?? '');
  const had = index.get(p);
  if (had && had.key === key) return had;
  const name = wordsOf(p.common);
  const made = { key, name, bot: wordsOf(p.botanical), host: p.host ? searchText(p.host) : '', nameText: name.join(' ') };
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
 * `order` sorts within a rank: its exact name, then a name starting with the search, then one holding it as a
 * phrase, then by how near (ranks 4 and 5).
 */
export interface Hit { rank: number; order: number }
export function matchPlant(p: Plant, q: Query, near: boolean): Hit | null {
  const x = indexed(p);
  const order = x.nameText === q.text ? 0 : x.nameText.startsWith(q.text) ? 1 : (' ' + x.nameText).includes(' ' + q.text) ? 2 : 3;
  const any = (test: (f: string) => boolean) => (alts: string[]) => alts.some(test);
  if (q.words.every(any((f) => startsIn(f, x.name)))) return { rank: 0, order };
  const inName = (f: string) => startsIn(f, x.name) || inside(f, x.name);
  if (q.words.every(any(inName))) return { rank: 1, order };
  const inBoth = (f: string) => inName(f) || startsIn(f, x.bot);
  if (q.words.every(any(inBoth))) return { rank: 2, order };
  if (x.host && q.words.every(any((f) => x.host.includes(f)))) return { rank: 3, order };
  if (!near) return null;
  // Near: every word matches as above, or nearly (in the name: rank 4; any in the botanical name: rank 5).
  let rank = 4, off = 0;
  for (const alts of q.words) {
    if (alts.some(inBoth)) continue;
    const n = Math.min(...alts.map((f) => nearIn(f, x.name) ?? Infinity));
    if (n !== Infinity) { off += n; continue; }
    const b = Math.min(...alts.map((f) => nearIn(f, x.bot) ?? Infinity));
    if (b === Infinity) return null;
    off += b; rank = 5;
  }
  return { rank, order: off };
}
/** Whether anything in these lists matches the search closer than a near spelling (if not, near spellings show). */
export function closeMatchIn(q: Query, ...lists: Plant[][]): boolean {
  return lists.some((ps) => ps.some((p) => matchPlant(p, q, false)));
}
/** Hits sorted best first, then alphabetically. */
export function byMatch<T extends { plant: Plant; hit: Hit }>(a: T, b: T): number {
  return a.hit.rank - b.hit.rank || a.hit.order - b.hit.order || a.plant.common.localeCompare(b.plant.common);
}
