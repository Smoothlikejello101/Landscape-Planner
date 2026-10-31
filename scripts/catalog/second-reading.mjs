// A second reading of every value read from a page's text (decided with Jason, 2026-10-27, after a check found about one
// value in seven read from text wrong or debatable). The rules (prose.mjs) read a page; a second reader, reading the same
// sentences blind (it isn't told what the rules found), says what they say of each fact, in the same values. Only what
// both readings agree on is written: where they differ only in degree, the part they share (both say it spreads by
// rhizomes, one slowly: "Spreading rhizome"; one aggressively: "Spreading rhizome, maybe aggressive", Jason
// 2026-10-30); otherwise nothing, and the review lists it.
//
// The second reader only ever gates: it never adds a value the rules didn't read, and it reads only the page's text (its
// instructions forbid anything else). Its readings are kept in scripts/catalog/second-reading.json, by page, with a hash
// of the text it read: a page whose text has changed is read again. How the readings are made: docs/catalog-sources.md,
// "A second reading".
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AGGRESSIVE_HABITS, FRUIT_SET, LEAD_VALUES, MAYBE_AGGRESSIVE, PROSE_HABITS, SEXES } from './prose.mjs';

export const READINGS = 'scripts/catalog/second-reading.json';
/** The facts a second reading covers (a cleome's zones, read from text in two places, were checked by hand instead). */
export const GATED = new Set(['foliage', 'deer', 'self_seed', 'habit', 'fruit_set', 'sex', 'flower_lead', 'partners']);

/** The text a reading is of, as a short hash: its sentences, in order. */
export const textHash = (sentences) => createHash('sha256').update((sentences ?? []).join('\n')).digest('hex').slice(0, 16);
/** The readings saved: { page key: { text, read: { fact: value or null }, at } }. */
export const loadReadings = (path = READINGS) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {});

const FAMILY = {
  habit: { 'Spreading rhizome': 'Spreading rhizome', 'Slow-spreading rhizome': 'Spreading rhizome', 'Aggressive rhizome': 'Spreading rhizome',
    'Runner (stolons)': 'Runner (stolons)', 'Aggressive runner (stolons)': 'Runner (stolons)',
    Suckering: 'Suckering', 'Suckering (slow)': 'Suckering', 'Suckering colonizer': 'Suckering', 'Suckering thicket': 'Suckering' },
  // (Both say deer eat it: how often, unsettled, so the weaker of the two.)
  deer: { Occasional: 'Occasional', Candy: 'Occasional' },
  // (Both say it self-sows: how freely, unsettled.)
  self_seed: { Prolific: 'Unrated', Modest: 'Unrated', Unrated: 'Unrated' },
};
/**
 * What the two readings agree on, or null: the value where they match; where they differ only in degree, the part they
 * share (a rhizome's speed, deer's appetite, how freely it self-sows); otherwise null. A habit only one calls aggressive
 * keeps that it may be ("Spreading rhizome, maybe aggressive": Jason, 2026-10-30). Leaves in winter, a sterile plant,
 * clumping and mats agree only exactly.
 */
export function agreed(fact, rules, reader) {
  if (reader == null || rules == null) return null;
  if (JSON.stringify(rules) === JSON.stringify(reader)) return rules;
  // (Partners named: the names both readings give, in the rules' order.)
  if (fact === 'partners' && Array.isArray(rules) && Array.isArray(reader)) {
    const both = rules.filter((n) => reader.some((m) => sameName(n, m)));
    return both.length ? both : null;
  }
  const fam = FAMILY[fact];
  if (!fam || !fam[rules] || fam[rules] !== fam[reader]) return null;
  if (fact === 'habit' && AGGRESSIVE_HABITS.includes(rules) !== AGGRESSIVE_HABITS.includes(reader)) return MAYBE_AGGRESSIVE[fam[rules]];
  return fam[rules];
}

/**
 * The claims, gated: a claim read from a page's text (`prose`, with its `page`: { key, names, sentences }) stays only where
 * the second reading agrees, with the value both agree on. Returns { claims, held, tasks }: `held`, the claims not
 * written ({ fact, src, rules, reader, why: 'unread' | 'disagree' }); `tasks`, the pages to read again (or for the first
 * time), by key. Claims leave without their `page`, a kept one with its key (`pageKey`). A claim that changed a field's value by its text (NC State's deer
 * field lowered: prose.mjs ncsuDeer) carries the field's claim as `fallback`; held, the field's claim stands instead
 * (the held item says so, `kept`).
 */
export function gateProse(claims, readings) {
  const kept = [], held = [], tasks = new Map();
  for (const c of claims) {
    if (!c.prose || !c.page || !GATED.has(c.fact)) { kept.push(c); continue; }
    const { page, fallback, ...claim } = c;
    const back = fallback ? { kept: fallback.v } : {};
    const r = readings[page.key];
    const fresh = r && r.text === textHash(page.sentences) && Object.hasOwn(r.read ?? {}, c.fact);
    if (!fresh) {
      const t = tasks.get(page.key) ?? { key: page.key, names: page.names, sentences: page.sentences, text: textHash(page.sentences), facts: [] };
      if (!t.facts.includes(c.fact)) t.facts.push(c.fact);
      tasks.set(page.key, t);
      held.push({ fact: c.fact, src: c.src, rules: c.v, why: 'unread', ...back });
      if (fallback) kept.push(fallback);
      continue;
    }
    const v = agreed(c.fact, c.v, r.read[c.fact]);
    if (v == null) {
      held.push({ fact: c.fact, src: c.src, rules: c.v, reader: r.read[c.fact], why: 'disagree', ...back });
      if (fallback) kept.push(fallback);
      continue;
    }
    // (With the page it was read on, so a value can be checked against its page: catalog-src/build/combined.json.)
    kept.push({ ...claim, v, ...(JSON.stringify(v) !== JSON.stringify(c.v) ? { read: c.v } : {}), pageKey: page.key });
  }
  return { claims: kept, held, tasks };
}

/**
 * A degree the two readings left open, settled by another source: where a page's readings agreed only on the shared part
 * (`read`, the rules' value, kept beside it) and another source gives exactly the value the rules read, settled there
 * (its own readings agreeing, or a field), that value stands for this page too (`degree`, the source that settled it).
 * Prairie sage: NC State's text, aggressive to the rules and not to the second reading, beside a nursery's page both
 * readings agree says it spreads aggressively by rhizomes: Aggressive rhizome, not the less specific value outvoting
 * the nursery's.
 */
export function settleDegree(claims) {
  return claims.map((c) => {
    if (c.read === undefined) return c;
    const by = claims.find((o) => o !== c && o.fact === c.fact && o.src !== c.src && o.read === undefined && JSON.stringify(o.v) === JSON.stringify(c.read));
    if (!by) return c;
    const { read, ...rest } = c;
    return { ...rest, v: read, degree: by.src };
  });
}

/** Two names as the same cultivar's: letters and digits alike, case aside ("Southern Gentleman", "southern gentleman"). */
const sameName = (a, b) => String(a).toLowerCase().replace(/[^a-z0-9]/g, '') === String(b).toLowerCase().replace(/[^a-z0-9]/g, '');
/** A partners reading: names, one to eight, each a few words. */
const partnerNames = (v) => Array.isArray(v) && v.length >= 1 && v.length <= 8 && v.every((x) => typeof x === 'string' && x.trim().length >= 2 && x.length <= 40);
/** The values a reading may give, by fact (docs/second-reading.md): a list of values, or a check. */
export const READ_VALUES = {
  foliage: ['evergreen', 'deciduous', 'semi-evergreen'],
  deer: ['Resistant', 'Occasional', 'Candy'],
  self_seed: ['Prolific', 'Modest', 'Unrated', 'Sterile'],
  habit: PROSE_HABITS,
  fruit_set: FRUIT_SET,
  sex: SEXES,
  flower_lead: LEAD_VALUES,
  partners: partnerNames,
};
const allowed = (fact, v) => { const r = READ_VALUES[fact]; return typeof r === 'function' ? r(v) : !!r?.includes(v); };
/**
 * A reader's answers ([{ key, text, read }], docs/second-reading.md) merged into the readings, each checked against its
 * task: a task's page, the same text, exactly the facts asked, only the values allowed (or null). An answer that fails
 * isn't merged; a task with no answer stays to read. Returns { readings, problems }.
 */
export function mergeReadings(readings, tasks, answers, at) {
  const out = { ...readings }, problems = [];
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const seen = new Set();
  for (const a of answers) {
    const t = byKey.get(a.key);
    if (!t) { problems.push(`${a.key}: not a page to read`); continue; }
    if (seen.has(a.key)) { problems.push(`${a.key}: answered twice`); continue; }
    seen.add(a.key);
    if (a.text !== t.text) { problems.push(`${a.key}: read another text`); continue; }
    const read = a.read ?? {};
    const facts = Object.keys(read);
    if (facts.length !== t.facts.length || !t.facts.every((f) => facts.includes(f))) { problems.push(`${a.key}: answered ${facts.join(', ')}, asked ${t.facts.join(', ')}`); continue; }
    const bad = facts.filter((f) => read[f] !== null && !allowed(f, read[f]));
    if (bad.length) { problems.push(`${a.key}: values not allowed (${bad.map((f) => `${f}: ${JSON.stringify(read[f])}`).join(', ')})`); continue; }
    // (A page read before for other facts, its text the same, keeps those readings: a new fact adds to them.)
    const had = readings[a.key]?.text === t.text ? readings[a.key].read : {};
    out[a.key] = { text: t.text, read: { ...had, ...Object.fromEntries(t.facts.map((f) => [f, read[f]])) }, at };
  }
  for (const t of tasks) if (!seen.has(t.key)) problems.push(`${t.key}: no answer`);
  return { readings: out, problems };
}
/** The readings file as written: one page per line, by key. */
export const readingsText = (readings) => `{\n${Object.keys(readings).sort().map((k) => `${JSON.stringify(k)}: ${spaced(readings[k])}`).join(',\n')}\n}\n`;
/** One value as JSON with a space after each colon and comma, as the file has always been written. */
const spaced = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? `[${v.map(spaced).join(', ')}]` : `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${spaced(x)}`).join(', ')}}`) : JSON.stringify(v));

// Merge readers' answers into the readings:
//   node scripts/catalog/second-reading.mjs <tasks.json> <answers.json>... --at YYYY-MM-DD
// <tasks.json>: the build's catalog-src/build/second-reading-tasks.json (or the part a reader was given).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--at');
  const at = i >= 0 ? args.splice(i, 2)[1] : null;
  const [tasksPath, ...answerPaths] = args;
  if (!tasksPath || !answerPaths.length || !/^\d{4}-\d{2}-\d{2}$/.test(at ?? '')) { console.error('usage: node scripts/catalog/second-reading.mjs <tasks.json> <answers.json>... --at YYYY-MM-DD'); process.exit(1); }
  const tasks = JSON.parse(readFileSync(tasksPath, 'utf8'));
  const answers = answerPaths.flatMap((p) => JSON.parse(readFileSync(p, 'utf8')));
  const { readings, problems } = mergeReadings(loadReadings(), tasks, answers, at);
  writeFileSync(READINGS, readingsText(readings));
  for (const p of problems) console.log(p);
  console.log(`${answers.length - problems.filter((p) => !p.endsWith('no answer')).length} pages read; ${problems.length} problems; ${Object.keys(readings).length} pages in ${READINGS}`);
}
