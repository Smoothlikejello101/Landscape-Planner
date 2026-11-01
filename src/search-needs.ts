import { FLOWER_CHOICES } from './flower-colors';
import { searchText } from './search';

// Words of need in the picker's search (Jason, Nov 1, from the UI review): "shade flowers" asks for flowering plants
// that take shade, not for a plant named so. A word that says what one of the picker's own filters asks about becomes that
// filter, its chip shown with the others, and the rest of the text stays the search: "shade flowers" is Part shade and
// Has flowers; "shade aster" is Part shade and a search for "aster". The words are a small table, kept by hand, and
// only of filters the picker has.
//
// A word that's part of a plant's name stays in the search: "Deer fern", "Native azaleas", "Evergreen wisteria", by
// the catalog's names and other names and the gardener's own plants'. A word becomes a filter once it's finished:
// another word after it, a space, or Enter. Until then it may still be the start of a name ("deer f…") or of a longer
// need ("deer resistant"), and typing goes on undisturbed.

/** What a word of need sets: a filter's value, or a color added to the flower colors asked for. */
export type NeedSet =
  | { key: 'sun'; value: 'Full' | 'Part' | 'Shade' }
  | { key: 'form'; value: string }
  /** Native to the garden's state where its ZIP is known, else to North America (the picker's native filter). */
  | { key: 'native'; value: 'here' }
  | { key: 'evergreen' | 'deerResistant' | 'wetFeet' | 'drought' | 'clayOk' | 'flowers'; value: true }
  | { key: 'flowerColors'; add: string };

const SUN = (value: 'Full' | 'Part' | 'Shade'): NeedSet => ({ key: 'sun', value });
const FORM = (value: string): NeedSet => ({ key: 'form', value });
const ON = (key: 'evergreen' | 'deerResistant' | 'wetFeet' | 'drought' | 'clayOk' | 'flowers'): NeedSet => ({ key, value: true });

/** The words, as searched (lower case, no punctuation: "deer-resistant" is "deer resistant"), and what each sets. */
export const NEED_WORDS: { says: string[]; sets: NeedSet[] }[] = [
  // Sun and shade. "Shade" alone is part shade, as the review has it; full or deep shade is Shade.
  { says: ['sun', 'full sun', 'sunny'], sets: [SUN('Full')] },
  { says: ['shade', 'shady', 'part shade', 'partial shade', 'part sun', 'partial sun'], sets: [SUN('Part')] },
  { says: ['full shade', 'deep shade'], sets: [SUN('Shade')] },
  // (Dry shade as the picker's own advice says it, under Site & care: Drought tolerant, with Shade under Sun.)
  { says: ['dry shade'], sets: [ON('drought'), SUN('Shade')] },
  { says: ['evergreen', 'evergreens'], sets: [ON('evergreen')] },
  { says: ['native', 'natives'], sets: [{ key: 'native', value: 'here' }] },
  { says: ['deer', 'deer resistant', 'deer proof'], sets: [ON('deerResistant')] },
  { says: ['wet', 'wet soil', 'wet feet'], sets: [ON('wetFeet')] },
  { says: ['dry', 'dry soil', 'drought', 'drought tolerant'], sets: [ON('drought')] },
  { says: ['clay', 'clay soil'], sets: [ON('clayOk')] },
  // The catalog's forms. (Not groundcover: the catalog has no such form, and the picker no filter for it.)
  { says: ['tree', 'trees'], sets: [FORM('Tree')] },
  { says: ['shrub', 'shrubs', 'bush', 'bushes'], sets: [FORM('Shrub')] },
  { says: ['perennial', 'perennials'], sets: [FORM('Perennial')] },
  { says: ['annual', 'annuals'], sets: [FORM('Annual')] },
  { says: ['vine', 'vines'], sets: [FORM('Vine')] },
  { says: ['fern', 'ferns'], sets: [FORM('Fern')] },
  { says: ['grass', 'grasses', 'sedge', 'sedges'], sets: [FORM('Grass/Sedge')] },
  { says: ['bulb', 'bulbs'], sets: [FORM('Bulb')] },
  { says: ['cactus', 'cacti'], sets: [FORM('Cactus')] },
  // Flowers: Has flowers (showy ones on record), as the review has it ("shade flowers": Part shade and Has flowers). Of
  // a color, as the color chips ask ("blue flowers"), which says it has them.
  { says: ['flowers', 'flower', 'flowering'], sets: [ON('flowers')] },
  ...FLOWER_CHOICES.map((c) => ({ says: [`${c} flowers`, `${c} flower`], sets: [{ key: 'flowerColors' as const, add: c }] })),
];
/**
 * Little words that only join needs ("plants for shade", "shade tolerant"): dropped with them, once a need is taken,
 * unless they're part of a plant's name ("Jack in the pulpit").
 */
export const FILLER = ['plant', 'plants', 'for', 'in', 'with', 'and', 'that', 'the', 'a', 'of', 'to', 'tolerant', 'loving'];

/**
 * A word as names and searches are compared: its singular, roughly, the same way for both ("roses" and "rose",
 * "grasses" and "grass", "lilies" and "lily").
 */
export function wordKey(w: string): string {
  if (w.length >= 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  let k = w.length >= 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w;
  if (k !== w && /(s|x|z|ch|sh)e$/.test(k)) k = k.slice(0, -1);
  else if (k === w && /(s|x|z|ch|sh)e$/.test(k) && k.length >= 4) k = k.slice(0, -1);
  return k;
}
const PHRASES = NEED_WORDS.flatMap((n) => n.says.map((s) => ({ words: s.split(' '), sets: n.sets })));
const NEED_VOCAB = [...new Set(PHRASES.flatMap((p) => p.words).map(wordKey))];
/** Every word the table and the little words use (as keys): the only names indexed are those holding one. */
const VOCAB = new Set([...NEED_VOCAB, ...FILLER.map(wordKey)]);
const LONGEST = Math.max(...PHRASES.map((p) => p.words.length));
/** A name's word holding a need's word: the word itself, or one run together with it ("Sweetshade", "Nightshade"). */
const holdsVocab = (w: string) => VOCAB.has(w) || NEED_VOCAB.some((v) => v.length >= 3 && w.length > v.length && (w.startsWith(v) || w.endsWith(v)));

/**
 * Plant names, as far as words of need are concerned: each run of up to five words of a name that holds one of the
 * table's words, joined (as keys, without spaces, so "Sweetshade" and "Sweet shade" are the same); and each such
 * name's first words, up to all but its last, as `leads` (a need's word that may be starting a name: "Deer fern").
 */
export interface NameIndex { runs: Set<string>; leads: Set<string>; sorted: string[] }
export function nameIndex(names: Iterable<string>): NameIndex {
  const runs = new Set<string>(), leads = new Set<string>();
  for (const name of names) {
    const ws = searchText(name).split(' ').filter(Boolean).map(wordKey);
    const at = ws.flatMap((w, i) => (holdsVocab(w) ? [i] : []));
    if (!at.length) continue;
    for (const i of at) {
      for (let s = Math.max(0, i - 4); s <= i; s++) {
        for (let e = i; e < Math.min(ws.length, s + 5); e++) runs.add(ws.slice(s, e + 1).join(''));
      }
    }
    for (let e = 0; e < Math.min(ws.length - 1, 5); e++) leads.add(ws.slice(0, e + 1).join(''));
  }
  return { runs, leads, sorted: [...runs].sort() };
}
/** Whether some run starts with `pre` (a word still being typed at its end). */
function runStarts(ix: NameIndex, pre: string): boolean {
  let lo = 0, hi = ix.sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ix.sorted[mid] < pre) lo = mid + 1; else hi = mid; }
  return lo < ix.sorted.length && ix.sorted[lo].startsWith(pre);
}

/** The search with its words of need taken out, where the cursor goes in it, and what they set. */
export interface NeedReading { text: string; caret: number; sets: NeedSet[]; taken: string[] }
interface Word { w: string; key: string; tok: number }

/**
 * The words of need in a search, as typed so far: null where there are none to take. `final`: the search is done
 * (Enter), so its last word counts as finished. `can`: whether a need's filter can be set here (a form the catalog
 * has); one that can't stays a word of the search.
 */
export function readNeeds(text: string, names: NameIndex, o: { caret?: number; final?: boolean; can?: (s: NeedSet) => boolean } = {}): NeedReading | null {
  const toks = [...text.matchAll(/\S+/g)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, text: m[0] }));
  const words: Word[] = toks.flatMap((t, tok) => searchText(t.text).split(' ').filter(Boolean).map((w) => ({ w, key: wordKey(w), tok })));
  if (!words.length) return null;
  // The word being typed: the last, with nothing after it, till Enter.
  const open = !o.final && !/\s$/.test(text) ? toks.length - 1 : -1;
  const partial = open >= 0 ? words.filter((x) => x.tok === open) : [];
  const done = words.filter((x) => x.tok !== open);
  const startsTok = (i: number) => i === 0 || done[i - 1].tok !== done[i].tok;
  const endsTok = (i: number) => i === done.length - 1 || done[i + 1].tok !== done[i].tok;
  const join = (ws: Word[]) => ws.map((x) => x.key).join('');
  const typing = partial.map((x) => x.w).join('');
  /**
   * Whether done[a..b), with words beside it, is part of a plant's name: beside it, a word of the name that isn't one of
   * the little words ("for clay" is no name of its own), and none already taken (`gone`).
   */
  const inName = (a: number, b: number, gone: Set<number> = new Set()): boolean => {
    for (let s = Math.max(0, a - 3); s <= a; s++) {
      for (let e = b; e <= Math.min(done.length, b + 3); e++) {
        const beside = [...done.slice(s, a), ...done.slice(b, e)];
        if (beside.some((x) => gone.has(x.tok))) continue;
        const real = beside.some((x) => !FILLER.includes(x.w));
        if (real && names.runs.has(join(done.slice(s, e)))) return true;
        // (Up to the word being typed: the start of a name that goes on with it, "deer f" for Deer fern.)
        if (e === done.length && typing && (real || !FILLER.includes(typing))
          && (runStarts(names, join(done.slice(s, e)) + typing) || runStarts(names, join(done.slice(s, e)) + partial.map((x) => x.key).join('')))) return true;
      }
    }
    return false;
  };
  /** Whether, typing still, the words up to done[b) may be the start of a name or a longer need: wait for the next. */
  const mayGoOn = (a: number, b: number, phrase: string[]): boolean => {
    if (o.final || b < done.length) return false;
    const next = partial.map((x) => x.w);
    if (PHRASES.some((p) => p.words.length > phrase.length && phrase.every((w, i) => p.words[i] === w) && (!next.length || p.words[phrase.length].startsWith(next[0])))) return true;
    if (next.length) return false; // (a word under way that starts no name with it: inName said so)
    for (let s = Math.max(0, a - 3); s <= a; s++) if (names.leads.has(join(done.slice(s, b)))) return true;
    return false;
  };
  const drop = new Set<number>();
  const sets: NeedSet[] = [], taken: string[] = [];
  for (let i = 0; i < done.length;) {
    if (!startsTok(i)) { i++; continue; }
    let took = 0;
    for (let n = Math.min(LONGEST, done.length - i); n >= 1 && !took; n--) {
      if (!endsTok(i + n - 1)) continue;
      const phrase = done.slice(i, i + n).map((x) => x.w);
      const p = PHRASES.find((x) => x.words.length === n && x.words.every((w, k) => w === phrase[k]));
      if (!p || (o.can && !p.sets.every(o.can))) continue;
      if (inName(i, i + n) || mayGoOn(i, i + n, phrase)) break;
      for (let k = i; k < i + n; k++) drop.add(done[k].tok);
      sets.push(...p.sets);
      taken.push(text.slice(toks[done[i].tok].start, toks[done[i + n - 1].tok].end));
      took = n;
    }
    i += took || 1;
  }
  if (!sets.length) return null;
  // The little words joining them go too, unless they're part of a name.
  for (let i = 0; i < done.length; i++) {
    const t = done[i].tok;
    if (drop.has(t) || !startsTok(i) || !endsTok(i) || !FILLER.includes(done[i].w)) continue;
    if (!inName(i, i + 1, drop)) drop.add(t);
  }
  // The text without them: each taken with the spaces after it, so a space before it stays, for the next word. (At the
  // very end, with nothing after it, the space before it goes instead.)
  let out = '', from = 0, caret = o.caret ?? text.length;
  const at = caret;
  for (const t of [...drop].sort((x, y) => x - y)) {
    const tk = toks[t];
    let a = tk.start, b = tk.end;
    while (b < text.length && /\s/.test(text[b])) b++;
    if (b === text.length && b === tk.end) while (a > from && /\s/.test(text[a - 1])) a--;
    a = Math.max(a, from);
    out += text.slice(from, a);
    if (at >= b) caret -= b - a; else if (at > a) caret -= at - a;
    from = b;
  }
  out += text.slice(from);
  if (from === text.length && !/\s$/.test(text)) out = out.trimEnd(); // (the words at its end taken: no space left after)
  return { text: out, caret: Math.max(0, Math.min(out.length, caret)), sets, taken };
}
