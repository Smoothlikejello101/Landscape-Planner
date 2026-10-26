// How a cultivar is named in the catalog (agreed with Jason 2026-10-25): the plant, then the cultivar in quotes,
// or its trade name without them. "Hydrangea 'Limelight'", "Giant Hyssop 'Acapulco Orange'", "Heuchera Berry
// Smoothie" (a trade name: its registered cultivar, a breeder's code, stays in the botanical name).
//
// The words are the sources' own: the plant part is what the name already says around the cultivar ("Limelight
// Hydrangea" → "Hydrangea"), or, where the name is the cultivar alone, its species' name in the catalog, else its
// genus. Only the order and the quotes change. The name it had stays searchable (a synonym).

/**
 * The cultivar in a botanical name: everything between its first quote and its last ("Haas' Halo"). A quote opens
 * after no letter or digit: "Rosa Child's Play 'SAVachild'" is 'SAVachild'.
 */
export function cultivarIn(botanical) {
  const m = /(?<![\p{L}\p{N}])['‘’](.+)['‘’]/u.exec(String(botanical ?? ''));
  return m ? m[1].trim() : null;
}
/**
 * A trade name in a botanical name: the words after the species (and any variety or cross) that aren't the
 * cultivar: "Nandina domestica Flirt 'Murasaki'" → "Flirt". Null for none.
 */
export function tradeIn(botanical) {
  const words = String(botanical ?? '').replace(/(?<![\p{L}\p{N}])['‘’].+['‘’]/u, ' ').replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).slice(1);
  let i = 0;
  if (words[i] === '×' || words[i] === 'x') i++;
  if (/^[a-zë-]+$/.test(words[i] ?? '')) i++; // (the epithet)
  if (/^[x×]$/.test(words[i] ?? '') && /^[a-zë-]+$/.test(words[i + 1] ?? '')) i += 2; // (a cross: "aucheri x bucharica")
  if (/^(var|subsp|ssp|f)\.$/.test(words[i] ?? '')) i += 2; // (a variety or the like)
  const rest = words.slice(i).join(' ').trim();
  return rest || null;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * A record's name by the rule, or null where it already follows it (or isn't a cultivar, or its name doesn't say
 * which cultivar it is: a group such as "Astilbe 'Visions' series (3 cvs)", or a name that never mentions it).
 * `speciesName`: its species' common name in the catalog, if it has one.
 */
export function cultivarName({ common, botanical }, speciesName) {
  // (An intergeneric hybrid's "x" leads its botanical name, "x Pyracomeles Juke Box 'NCXP1'": its genus is next.)
  const bot = String(botanical ?? '').replace(/^[x×]\s+/, '');
  const cultivar = cultivarIn(bot), trade = tradeIn(bot);
  if (!cultivar && !trade) return null;
  if (/\bseries\b|\bcvs?\b|\bgroup\b/i.test(common)) return null;
  // (A trade name is what's sold, so it's the name; a cultivar otherwise.)
  const label = trade ? trade : `'${cultivar}'`;
  const said = [trade, cultivar].filter(Boolean).map((t) => new RegExp(`["'‘’]?${esc(t)}["'‘’]?`, 'i'));
  if (!said.some((re) => re.test(common))) return null; // (its name never says which: left as it is)
  // What's around the cultivar (and trade name) is the plant, but only from one side: "Limelight Hydrangea",
  // "'Deppe' Sunny Boulevard St. John's Wort". A name with words on both sides ("Red Rome Apple": Rome) is left.
  let marked = common;
  for (const re of said) marked = marked.replace(re, '\u0000');
  marked = marked.replace(/\s+/g, ' ').trim();
  if (!/^(\u0000\s*)+[^\u0000]*$|^[^\u0000]*(\s*\u0000)+$/.test(marked)) return null;
  let plant = marked.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[-–,]\s*|\s*[-–,]$/g, '');
  // (No plant left, or only a year or a code: its species' name, else its genus.)
  if (!/[A-Za-z]{3}/.test(plant)) plant = speciesName?.replace(/\s*\([^)]*\)\s*$/, '') || bot.split(/\s+/)[0];
  const name = `${/^[x×]\s/.test(plant) ? plant : cap(plant)} ${label}`;
  return name === common ? null : name;
}

/**
 * Every cultivar in a catalog file named by the rule; its former name kept as a synonym. Returns how many were
 * renamed, and the changes ([id, from, to]).
 */
export function renameCultivars(file) {
  const byId = new Map(file.plants.map((r) => [r.id, r]));
  const changes = [];
  for (const r of file.plants) {
    const name = cultivarName(r, r.parent ? byId.get(r.parent)?.common : undefined);
    if (!name) continue;
    changes.push([r.id, r.common, name]);
    const synonyms = new Set(r.synonyms ?? []);
    synonyms.add(r.common);
    synonyms.delete(name);
    r.common = name;
    r.synonyms = [...synonyms];
  }
  return changes;
}
