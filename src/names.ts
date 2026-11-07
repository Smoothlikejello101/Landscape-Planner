// Names of things in Title Case (Jason, Nov 4, from the first beta testers: "why are some of the plants capitalized &
// some aren't?" "I lean title case for everything. It's essentially a section header"): the catalog's plant names
// wherever they show, and the names of kinds of things ("Arbor or Pergola"). Sentences, buttons and section labels stay
// sentence case; a name a person typed stays exactly as typed.
//
// A plan keeps the label a plant was given when placed, as it was then ("Black-eyed susan"): shown in Title Case when
// it's the catalog's name in any case, and left as it is when the person changed it (`labelShown`). Stored labels are
// never rewritten.

import type { Shape } from './types';

/** Words kept small inside a name (unless first or last): "Jack-in-the-Pulpit", "Lily of the Valley". */
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'with']);
/** Marks that open and close a quoted cultivar name ('Goldsturm', ‘Goldsturm’, "Goldsturm"). */
const OPEN = /^[(\[]*['‘"“]/;
const CLOSE = /['’"”][)\],.;:!?]*$/;
/** A botanical rank, after which a name is botanical: "(subsp. multicaule)", "subsp bulbosum". */
const RANK = /^(subsp|ssp|var|f|forma|cvs?)\.?$/;
/** A word's letters, without what's around it ("(subsp." → "subsp"; "'Duet'," → "Duet"). */
const bare = (w: string) => w.replace(/^[^\p{L}\p{N}×]+|[^\p{L}\p{N}.×]+$/gu, '');

/**
 * A name in Title Case: each word capitalized, after a hyphen or slash too ("Black-Eyed Susan", "Bradford/Callery
 * Pear"), not after an apostrophe ("St. John's Wort") except an O' ("Four O'Clock"); a, an, and, as, at, but, by, for, in, nor, of, on, or, the,
 * to and with kept small unless first or last ("Rose of Sharon"). Left as they are: a quoted cultivar name ("'Lady in
 * Red'"), a word with a capital inside it ("McKana's") or all in capitals ("RED ROCKET"), and any word of the plant's
 * botanical name, when it's given ("Hemionitis rotundifolia", "(subsp. multicaule)"); an "x" or "×" of a hybrid.
 */
export function titleCase(name: string, botanical?: string): string {
  if (!name) return name;
  const tokens = name.split(/(\s+)/);
  // (Its botanical name's words count only where the name says its genus ("Acca sellowiana", "Echinacea Cone-fections
  // series"): "Biennial gaura" (Oenothera gaura) and "Cabbage palmetto" (Sabal palmetto) use the word in English.)
  const botWords = (botanical ?? '').split(/\s+/).map(bare).filter(Boolean);
  const genus = botWords.find((w) => w !== 'x' && w !== '×');
  const bot = new Set(genus && tokens.some((t) => bare(t) === genus) ? botWords : []);
  let rank = false; // (after "subsp.", "var.": a botanical word, as it is)
  // Each word's parts (split at hyphens and slashes), numbered across the name, for "first or last".
  type Part = { t: number; i: number; text: string };
  const parts: Part[] = [];
  const keep = new Set<number>(); // (tokens left as they are)
  let quoted = false;
  tokens.forEach((tok, t) => {
    if (!tok || /^\s+$/.test(tok)) return;
    if (quoted || OPEN.test(tok)) {
      keep.add(t);
      // (Open till a word ends the quote; "'Duet'" opens and closes in one.)
      const rest = OPEN.test(tok) && !quoted ? tok.replace(OPEN, '') : tok;
      quoted = !CLOSE.test(rest) || rest.length === 0;
      return;
    }
    const b = bare(tok), after = rank;
    rank = RANK.test(b);
    if (rank || after || b === 'x' || b === '×' || bot.has(b)) { keep.add(t); return; }
    tok.split(/([-/])/).forEach((text, i) => { if (i % 2 === 0) parts.push({ t, i, text }); });
  });
  const words = parts.filter((p) => /\p{L}/u.test(p.text));
  const first = words[0], last = words[words.length - 1];
  const done = new Map<string, string>();
  for (const p of words) {
    const letters = p.text.replace(/[^\p{L}]/gu, '');
    let out = p.text;
    const allCaps = letters.length >= 2 && letters === letters.toUpperCase();
    const inner = /\p{Lu}/u.test(p.text.slice(p.text.search(/\p{L}/u) + 1));
    // (A small word as written: "Rose The Countryman", a rose's own name, keeps its The.)
    const small = SMALL.has(bare(p.text)) && p !== first && p !== last;
    if (!allCaps && !inner && !small) out = p.text.replace(/\p{L}/u, (c) => c.toUpperCase());
    // (An O' word is two: "Four O'Clock", as it's written in titles.)
    if (!allCaps && !inner) out = out.replace(/^(\W*O['’])(\p{Ll})/u, (_m, o: string, c: string) => o + c.toUpperCase());
    done.set(`${p.t}:${p.i}`, out);
  }
  return tokens.map((tok, t) => {
    if (keep.has(t) || !tok || /^\s+$/.test(tok)) return tok;
    return tok.split(/([-/])/).map((text, i) => (i % 2 ? text : done.get(`${t}:${i}`) ?? text)).join('');
  }).join('');
}

/** A name inside a sentence: lowercase, but for a word all in capitals ("Garage Door" → "garage door", "AC Unit" → "AC unit"). */
export const inSentence = (name: string): string => name.replace(/[\p{L}']+/gu, (w) => (w.length >= 2 && w === w.toUpperCase() ? w : w.toLowerCase()));

/** Two names the same words, whatever their case or spacing ("Black-eyed susan", "Black-Eyed Susan"). */
export function sameName(a: string | undefined, b: string | undefined): boolean {
  const k = (s: string | undefined) => (s ?? '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  return !!k(a) && k(a) === k(b);
}

/**
 * Two of the app's warnings the same, whatever the case of the names in them: a warning dismissed when a plant's name
 * read "Black-eyed susan" is still dismissed now it reads "Black-Eyed Susan" (a plan keeps what it said).
 */
export const sameSaid = (a: string | undefined, b: string | undefined): boolean => a != null && b != null && a.toLowerCase() === b.toLowerCase();

/**
 * The catalog's names as its sources write them, by plant id ("Black-eyed Susan 'American Gold Rush'"), where a name's
 * case still says something: its last word lowercase is the kind of plant ("Smooth hydrangea 'Haas' Halo'"), a capital
 * a name ("Susan"). Kept apart from the plants (src/labels.ts shortNames).
 */
const written = new Map<string, string>();
export function setWrittenName(id: string, name: string): void { written.set(id, name); }
export const writtenName = (id: string): string | undefined => written.get(id);

/** The catalog's name for a placed plant, by its id (set once the catalog is in: src/plants.ts). */
let catalogName: (plantId: string) => string | undefined = () => undefined;
export function setCatalogNames(fn: (plantId: string) => string | undefined): void { catalogName = fn; }

/**
 * A shape's label as shown: a placed plant labeled with its catalog name, in any case, shows the catalog's name in
 * Title Case; any other label, as typed.
 */
export function labelShown(s: Pick<Shape, 'label'> & { plantId?: string }): string {
  const label = s.label ?? '';
  if (!s.plantId || !label.trim()) return label;
  const name = catalogName(s.plantId);
  return name && sameName(label, name) ? name : label;
}
