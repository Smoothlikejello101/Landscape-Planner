import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { agreed, gateProse, mergeReadings, settleDegree, textHash } from '../scripts/catalog/second-reading.mjs';

// A second reading of every value read from a page's text (Jason, 2026-10-27): only what both readings agree on is
// written; where they differ only in degree, the part they share.
describe('what two readings agree on', () => {
  it('a value where they match', () => {
    expect(agreed('foliage', 'deciduous', 'deciduous')).toBe('deciduous');
    expect(agreed('habit', 'Clumping', 'Clumping')).toBe('Clumping');
  });
  it('the part they share where they differ only in degree', () => {
    expect(agreed('habit', 'Aggressive rhizome', 'Slow-spreading rhizome')).toBe('Spreading rhizome');
    expect(agreed('habit', 'Suckering thicket', 'Suckering')).toBe('Suckering');
    expect(agreed('habit', 'Aggressive runner (stolons)', 'Runner (stolons)')).toBe('Runner (stolons)');
    expect(agreed('deer', 'Candy', 'Occasional')).toBe('Occasional');
    expect(agreed('self_seed', 'Prolific', 'Modest')).toBe('Unrated'); // (it self-sows; how freely, unsettled)
  });
  it('nothing where they differ in kind, or the second reading finds nothing', () => {
    expect(agreed('foliage', 'evergreen', 'semi-evergreen')).toBe(null);
    expect(agreed('deer', 'Resistant', 'Occasional')).toBe(null);
    expect(agreed('habit', 'Clumping', 'Spreading rhizome')).toBe(null);
    expect(agreed('habit', 'Spreading rhizome', 'Suckering')).toBe(null);
    expect(agreed('self_seed', 'Sterile', 'Modest')).toBe(null);
    expect(agreed('deer', 'Resistant', null)).toBe(null);
  });
});

describe('the gate', () => {
  const page = { key: 'web:https://shop.example.com/x', names: ['Itea virginica'], sentences: ['It spreads aggressively by rhizomes.', 'Deer avoid it.'] };
  const claims = [
    { fact: 'habit', v: 'Aggressive rhizome', src: 'example.com', kind: 'nursery', prose: true, says: 'It spreads aggressively by rhizomes.', page },
    { fact: 'deer', v: 'Resistant', src: 'example.com', kind: 'nursery', prose: true, says: 'Deer avoid it.', page },
    { fact: 'height', v: { min: 3, max: 5 }, src: 'example.com', kind: 'nursery' },
  ];
  it('holds what no second reading has read, and lists its page once with the facts to read', () => {
    const g = gateProse(claims, {});
    expect(g.claims).toEqual([claims[2]]);
    expect(g.held.map((h: { fact: string; why: string }) => [h.fact, h.why])).toEqual([['habit', 'unread'], ['deer', 'unread']]);
    expect([...g.tasks.values()]).toEqual([{ key: page.key, names: page.names, sentences: page.sentences, text: textHash(page.sentences), facts: ['habit', 'deer'] }]);
  });
  it('writes what agrees (the shared part where only the degree differs), holds what differs, and reads again a changed page', () => {
    const readings = { [page.key]: { text: textHash(page.sentences), read: { habit: 'Spreading rhizome', deer: 'Occasional' } } };
    const g = gateProse(claims, readings);
    expect(g.claims.map((c: { fact: string; v: unknown; read?: unknown; page?: unknown; pageKey?: string }) => [c.fact, c.v, c.read, c.page, c.pageKey])).toEqual([['habit', 'Spreading rhizome', 'Aggressive rhizome', undefined, page.key], ['height', { min: 3, max: 5 }, undefined, undefined, undefined]]);
    expect(g.held).toEqual([{ fact: 'deer', src: 'example.com', rules: 'Resistant', reader: 'Occasional', why: 'disagree' }]);
    expect(g.tasks.size).toBe(0);
    const changed = { [page.key]: { ...readings[page.key], text: 'something else' } };
    expect(gateProse(claims, changed).tasks.size).toBe(1);
  });
  it("keeps NC State's deer field where the text lowered it and the second reading doesn't agree", () => {
    const field = { fact: 'deer', v: 'Resistant', src: 'ncsu', kind: 'authority' };
    const lowered = { ...field, v: 'Occasional', says: 'Deer avoid it.', prose: true, fallback: field, page };
    const g = gateProse([lowered], { [page.key]: { text: textHash(page.sentences), read: { deer: 'Resistant' } } });
    expect(g.claims).toEqual([field]);
    expect(g.held).toEqual([{ fact: 'deer', src: 'ncsu', rules: 'Occasional', reader: 'Resistant', why: 'disagree', kept: 'Resistant' }]);
    const ok = gateProse([lowered], { [page.key]: { text: textHash(page.sentences), read: { deer: 'Candy' } } });
    expect(ok.claims).toEqual([{ fact: 'deer', v: 'Occasional', src: 'ncsu', kind: 'authority', says: 'Deer avoid it.', prose: true, pageKey: page.key }]);
  });
});

describe("merging a reader's answers", () => {
  const tasks = [
    { key: 'ncsu:a', names: ['A'], sentences: ['x'], text: 'h1', facts: ['deer', 'habit'] },
    { key: 'ncsu:b', names: ['B'], sentences: ['y'], text: 'h2', facts: ['foliage'] },
    { key: 'ncsu:c', names: ['C'], sentences: ['z'], text: 'h3', facts: ['self_seed'] },
    { key: 'ncsu:d', names: ['D'], sentences: ['w'], text: 'h4', facts: ['habit'] },
  ];
  it('merges only answers that match their task, with values allowed', () => {
    const { readings, problems } = mergeReadings({ 'ncsu:old': { text: 'h0', read: { deer: 'Resistant' }, at: '2026-10-01' } }, tasks, [
      { key: 'ncsu:a', text: 'h1', read: { habit: 'Clumping', deer: null } },
      { key: 'ncsu:b', text: 'other', read: { foliage: 'evergreen' } }, // (another text)
      { key: 'ncsu:c', text: 'h3', read: { self_seed: 'Lots' } }, // (not a value)
      { key: 'ncsu:x', text: 'h9', read: {} }, // (not a page asked)
    ], '2026-10-27');
    expect(readings).toEqual({ 'ncsu:old': { text: 'h0', read: { deer: 'Resistant' }, at: '2026-10-01' }, 'ncsu:a': { text: 'h1', read: { deer: null, habit: 'Clumping' }, at: '2026-10-27' } });
    expect(problems).toEqual(['ncsu:b: read another text', 'ncsu:c: values not allowed (self_seed: "Lots")', 'ncsu:x: not a page to read', 'ncsu:d: no answer']);
  });
  it('keeps a page\'s earlier readings when a new fact is read of the same text, not of a changed one (fruit set, Oct 30)', () => {
    const had = { 'ncsu:h': { text: 'h5', read: { deer: 'Resistant' }, at: '2026-10-27' }, 'ncsu:k': { text: 'old', read: { deer: 'Candy' }, at: '2026-10-27' } };
    const asked = [{ key: 'ncsu:h', names: ['H'], sentences: ['v'], text: 'h5', facts: ['fruit_set'] }, { key: 'ncsu:k', names: ['K'], sentences: ['u'], text: 'new', facts: ['sex'] }];
    const { readings } = mergeReadings(had, asked, [{ key: 'ncsu:h', text: 'h5', read: { fruit_set: 'separate' } }, { key: 'ncsu:k', text: 'new', read: { sex: 'female' } }], '2026-10-30');
    expect(readings['ncsu:h']).toEqual({ text: 'h5', read: { deer: 'Resistant', fruit_set: 'separate' }, at: '2026-10-30' });
    expect(readings['ncsu:k']).toEqual({ text: 'new', read: { sex: 'female' }, at: '2026-10-30' });
  });
});

describe('a degree left open, settled by another source', () => {
  const open = { fact: 'habit', v: 'Spreading rhizome', read: 'Aggressive rhizome', src: 'ncsu', kind: 'authority', prose: true };
  it("takes the rules' degree where another source gives it, settled", () => {
    const nursery = { fact: 'habit', v: 'Aggressive rhizome', src: 'usperennials.com', kind: 'nursery', prose: true };
    expect(settleDegree([open, nursery])).toEqual([{ fact: 'habit', v: 'Aggressive rhizome', src: 'ncsu', kind: 'authority', prose: true, degree: 'usperennials.com' }, nursery]);
  });
  it('not from another value, nor from one left open itself', () => {
    const slow = { fact: 'habit', v: 'Slow-spreading rhizome', src: 'prairienursery.com', kind: 'nursery', prose: true };
    expect(settleDegree([open, slow])).toEqual([open, slow]);
    const alsoOpen = { ...open, src: 'newmoonnursery.com', kind: 'nursery', v: 'Aggressive rhizome', read: 'Aggressive rhizome' };
    expect(settleDegree([open, alsoOpen])[0]).toBe(open);
  });
});
