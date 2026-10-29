import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_LOG_KEY, MAX_ERRORS, errorEntry, readErrors, recordError } from '../src/error-log';
import { buildSupportFile, imageBytes, keyKind, localKeys, sizeText, supportSummary } from '../src/support';
import { parseImportFile, type ExportedProject } from '../src/backup';
import type { ProjectData } from '../src/types';

// The support file (Jason, 2026-10-29): a backup, plus how the app stands on the device; never the sign-in.

/** A localStorage stand-in. */
function fakeStorage(entries: Record<string, string> = {}) {
  const m = new Map(Object.entries(entries));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}
const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(2000);
const project = (name: string, withImage: boolean): ExportedProject => ({
  name, lastModified: 1000,
  data: {
    shapes: [
      { id: 'a', type: 'circle', role: 'plant', x: 0, y: 0, radius: 2, color: '#000', label: 'Redbud', opacity: 0.5, locked: false },
      { id: 'b', type: 'circle', x: 9, y: 9, radius: 1, color: '#000', label: 'A pot', opacity: 0.5, locked: false },
    ],
    zoom: 1, offsetX: 0, offsetY: 0,
    bgImage: withImage ? { dataUrl: IMG, naturalWidth: 800, naturalHeight: 600, ftPerPx: 0.1, cx: 40, cy: 30, rotation: 0, opacity: 0.6, visible: true } : null,
  } as unknown as ProjectData,
});
const parts = (projects: ExportedProject[]) => ({
  projects, myPlants: [{ id: 'u-1', common: 'My fern' }],
  app: { version: '1.2.3', built: '2026-10-29', catalog: { updated: '2026-10-29', plants: 3742 } },
  device: { kind: 'Android phone' }, storage: { persisted: true }, sync: { signedIn: false },
  settings: { 'lp-text-size-2': 'large' }, localData: [], otherKeys: [], errors: [],
});

describe('what a support file keeps from this device', () => {
  it('puts in settings by value, data by size, a key it doesn’t know by name only, and never the sign-in', () => {
    const s = fakeStorage({
      'lp-text-size-2': 'large', 'lp-kind-prefs': '{"bed":"rect"}', 'lp-canopy-hint': '2', 'lp-canopy-hint-at': '1761700000000',
      'lp-projects': '[{"id":"p1"}]', 'lp-journal:p1': '{"at":1}', [ERROR_LOG_KEY]: '[]',
      'lp-auth': '{"access_token":"secret"}', 'lp-code-sent': '{"email":"jason@example.com"}', 'lp-email-signin': 'jason@example.com',
      'lp-something-new': 'its value', 'sb-other': 'not the app’s',
    });
    const got = localKeys(s);
    expect(got.settings).toEqual({ 'lp-canopy-hint': 2, 'lp-canopy-hint-at': 1761700000000, 'lp-kind-prefs': { bed: 'rect' }, 'lp-text-size-2': 'large' });
    expect(got.data.map((d) => d.key)).toEqual([ERROR_LOG_KEY, 'lp-journal:p1', 'lp-projects']);
    expect(got.other).toEqual([{ key: 'lp-something-new', bytes: 9 }]);
    const text = JSON.stringify(got);
    for (const secret of ['lp-auth', 'secret', 'lp-code-sent', 'jason@example.com', 'lp-email-signin', 'sb-other']) expect(text).not.toContain(secret);
  });

  it("lists every key the app keeps: none would go in only by name (src/support.ts SETTING_KEYS, DATA_KEYS, PRIVATE_KEYS)", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(f)) files.push(p); } };
    walk('src');
    const keys = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/'(lp-[a-z0-9:-]+)'/g)) keys.add(m[1]);
    keys.delete('lp-catalog'); // (the catalog file's format, not a key)
    expect([...keys].filter((k) => keyKind(k) === 'other')).toEqual([]);
    expect(keys.size).toBeGreaterThan(20);
  });
});

describe('the support file', () => {
  it('is a backup Import can open, its background images left out unless asked, their placement kept', () => {
    const f = buildSupportFile({ ...parts([project('Back yard', true), project('Front', false)]), includeImages: false, now: new Date('2026-10-29T15:00:00Z') });
    expect(f.projects[0].data.bgImage).toBeNull();
    expect(JSON.stringify(f)).not.toContain(IMG);
    expect(f.support.projects[0]).toMatchObject({ name: 'Back yard', shapes: 2, plants: 1, bgImage: { included: false, bytes: IMG.length, naturalWidth: 800, ftPerPx: 0.1, cx: 40 } });
    expect(f.support.projects[1].bgImage).toBeUndefined();
    expect(f.support.images).toBe('left out');
    const back = parseImportFile(JSON.stringify(f));
    expect(back.map((p) => p.name)).toEqual(['Back yard', 'Front']);
    expect(back[0].data.shapes).toHaveLength(2);
    const withImages = buildSupportFile({ ...parts([project('Back yard', true)]), includeImages: true, now: new Date() });
    expect(withImages.projects[0].data.bgImage?.dataUrl).toBe(IMG);
    expect(withImages.support.projects[0].bgImage?.included).toBe(true);
    expect(imageBytes([project('a', true), project('b', false)])).toBe(IMG.length);
  });

  it('says what’s in it before it’s saved', () => {
    const f = buildSupportFile({ ...parts([project('Back yard', true), project('Front', false)]), errors: [{ at: 1, where: 'save', message: 'QuotaExceededError', count: 3 }], includeImages: false, now: new Date() });
    expect(supportSummary(f)).toEqual([
      'Your 2 projects (2 plants placed), without background images',
      'Your own plants (1)',
      'This device’s settings for the app',
      'The app’s version, your device and browser, and how storage and sync stand',
      'The app’s last errors (3)',
    ]);
    expect(sizeText(2_340_000)).toBe('2.3 MB');
    expect(sizeText(640_400)).toBe('640 KB');
  });
});

describe("the app's error log", () => {
  it('keeps the latest, counts the same error again, and cuts each short', () => {
    const s = fakeStorage();
    for (let i = 0; i < MAX_ERRORS + 5; i++) recordError(new Error(`failure ${i}`), 'save', 1000 + i, s);
    recordError(new Error(`failure ${MAX_ERRORS + 4}`), 'save', 5000, s); // (the same as the last)
    const list = readErrors(s);
    expect(list).toHaveLength(MAX_ERRORS);
    expect(list[0].message).toBe('Error: failure 5');
    expect(list[list.length - 1]).toMatchObject({ message: `Error: failure ${MAX_ERRORS + 4}`, count: 2, last: 5000 });
    const long = new Error('x'.repeat(2000));
    expect(errorEntry(long, 'window', 1).message.length).toBe(500);
    expect(errorEntry('just words', 'promise', 1)).toEqual({ at: 1, where: 'promise', message: 'just words' });
  });

  it('reads garbage, or nothing, as no errors, and never throws', () => {
    expect(readErrors(fakeStorage({ [ERROR_LOG_KEY]: 'not json' }))).toEqual([]);
    expect(readErrors(fakeStorage({ [ERROR_LOG_KEY]: '[{"at":1},{"at":2,"where":"x","message":"kept"}, 7]' }))).toEqual([{ at: 2, where: 'x', message: 'kept' }]);
    expect(readErrors(null)).toEqual([]);
    const full = { ...fakeStorage(), setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(() => recordError(new Error('x'), 'save', 1, full)).not.toThrow();
  });
});
