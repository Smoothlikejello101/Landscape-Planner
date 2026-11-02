// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { openKV } from '../src/db';
import {
  applySizeMode, deleteMyPlant, fullRingRadius, isDataSized, loadMyPlants, mergeMyPlants, myPlants, parseSize,
  plantHash, plantRadius, plantsToResize, recolorPlaced, sanitizeMyPlant, saveMyPlant, sunRange,
} from '../src/my-plants';
import { fingerprint } from '../src/sync/engine';
import { supabasePlants } from '../src/sync/remote';
import { plantColors, plantShapeAt, plantsById, type Plant } from '../src/plants';
import { state } from '../src/state';
import { _resetStorageForTests, createProject, flushSave, initStorage, readProject, sanitizeProjectData, switchProject } from '../src/storage';
import { buildBackupFile, buildProjectFile, parseImportPlants } from '../src/backup';
import type { CircleShape } from '../src/types';

let n = 0;
async function fresh(name = 'mp-' + ++n) {
  _resetStorageForTests();
  const kv = await openKV(name);
  await initStorage(kv);
  loadMyPlants();
  return kv;
}
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); localStorage.clear(); });

describe('reading sizes off a tag', () => {
  it.each([
    ['6-8 ft', 6, 8], ['6 to 8 ft', 6, 8], ["6-8'", 6, 8], ['6–8 feet', 6, 8],
    ['36 in', 3, 3], ['18-24 in', 1.5, 2], ['18-24"', 1.5, 2], ['3', 3, 3], ['2.5 ft', 2.5, 2.5], ['8-6 ft', 6, 8],
    // (A decimal with no leading zero, or a dot still being typed; fractions as tags write them.)
    ['.5', 0.5, 0.5], ['.5-1', 0.5, 1], ['1-1.5', 1, 1.5], ['5.', 5, 5], ['1½ ft', 1.5, 1.5], ['1 1/2', 1.5, 1.5], ['1/2-1', 0.5, 1], ['½', 0.5, 0.5],
  ])('%s', (text, min, max) => {
    expect(parseSize(text)).toEqual({ min, max, med: (min + max) / 2 });
  });
  it('uses the chosen unit for bare numbers, but a written unit wins', () => {
    expect(parseSize('18-24', 'in')).toEqual({ min: 1.5, max: 2, med: 1.75 });
    expect(parseSize('3 ft', 'in')).toEqual({ min: 3, max: 3, med: 3 });
    expect(parseSize('2,5')).toEqual({ min: 2.5, max: 2.5, med: 2.5 }); // decimal comma
  });
  it.each(['', 'big', '0', '-3', '6 meters', '500 ft', '.', '1/0'])('rejects %j', (text) => {
    expect(parseSize(text)).toBeNull();
  });
});

describe('plant sizes and modes', () => {
  const plant = { id: 'cat1', common: 'Shrub', width: { min: 4, max: 8, med: 6 } } as Plant;
  const placed = (radius: number, sizeFrom?: 'plant' | 'manual'): CircleShape =>
    ({ id: 's' + radius + sizeFrom, type: 'circle', x: 0, y: 0, radius, color: '#000', label: 'Shrub', opacity: 1, locked: false, role: 'plant', plantId: 'cat1', ...(sizeFrom ? { sizeFrom } : {}) });
  beforeEach(() => { plantsById.cat1 = plant; });

  it('draws the middle of the range or the top', () => {
    expect(plantRadius(plant, 'typical')).toBe(3);
    expect(plantRadius(plant, 'full')).toBe(4);
    expect(fullRingRadius(placed(3))).toBe(4);
    expect(fullRingRadius(placed(4))).toBeNull();
  });
  it('draws to the quarter foot of radius, and still recognizes plants placed at the older half-foot steps', () => {
    plantsById.odd = { id: 'odd', common: 'Odd', width: { min: 2, max: 3, med: 2.5 } } as Plant;
    expect(plantRadius(plantsById.odd, 'typical')).toBe(1.25); // drawn 2.5 ft across, as listed
    const older = { ...placed(1.5), plantId: 'odd' };          // earlier versions drew it at 1.5
    expect(isDataSized(older)).toBe(true);
  });
  it('tells plants sized from data from plants sized by hand', () => {
    expect(isDataSized(placed(3))).toBe(true);           // older plant still at its data size
    expect(isDataSized(placed(2.5))).toBe(false);        // older plant someone resized
    expect(isDataSized(placed(2.5, 'plant'))).toBe(true);
    expect(isDataSized(placed(3, 'manual'))).toBe(false);
  });
  it('switching modes redraws only data-sized plants, as one undo step', () => {
    state.shapes = [placed(3), placed(2.5), placed(3, 'manual')];
    state.history = []; state.historyIndex = -1;
    expect(plantsToResize(state.shapes, 'full')).toHaveLength(1);
    applySizeMode('full');
    expect(state.shapes.map((s) => (s as CircleShape).radius)).toEqual([4, 2.5, 3]);
    expect(state.sizeMode).toBe('full');
    expect(state.historyIndex).toBe(0);
    applySizeMode('typical');
    expect((state.shapes[0] as CircleShape).radius).toBe(3);
  });
});

describe('My plants library', () => {
  const limelight = { id: 'u-lime', common: "Hydrangea 'Limelight'", botanical: 'Hydrangea paniculata', width: parseSize('6-8 ft')!, ...sunRange(['Full', 'Part']) } as Plant;

  it('validates entries', () => {
    expect(sanitizeMyPlant({ ...limelight })).toMatchObject({ id: 'u-lime', sun_most: 'Full', sun_least: 'Part', width: { min: 6, max: 8, med: 7 } });
    expect(sanitizeMyPlant({ ...limelight, id: 'cat-1' })).toBeNull(); // only library ids
    expect(sanitizeMyPlant({ ...limelight, common: ' ' })).toBeNull();
    expect(sanitizeMyPlant({ ...limelight, width: { min: -1 } })).toBeNull();
    expect(sanitizeMyPlant({ ...limelight, sun_most: 'Shade', sun_least: 'Full' })).toMatchObject({ sun_most: 'Full', sun_least: 'Shade' });
    expect(sanitizeMyPlant({ ...limelight, sun_most: 'Lots' })).not.toHaveProperty('sun_most');
    expect(sanitizeMyPlant({ ...limelight, bloom: { start: 7, end: 13, color: 'white' } })).toMatchObject({ bloom: { start: 7, end: 7, color: 'white' } });
  });

  it('is saved, survives a restart, and works as a plant', async () => {
    await fresh('lib');
    await saveMyPlant(limelight);
    expect(plantsById['u-lime'].common).toBe("Hydrangea 'Limelight'");
    state.shapes.push(plantShapeAt(plantsById['u-lime'], { x: 0, y: 0 }));
    const s = state.shapes.at(-1) as CircleShape;
    expect(s).toMatchObject({ plantId: 'u-lime', radius: 3.5, sizeFrom: 'plant', role: 'plant' });
    await flushSave();
    // Restart: the library comes back from storage.
    delete plantsById['u-lime'];
    await fresh('lib');
    expect(myPlants.map((p) => p.id)).toEqual(['u-lime']);
    expect(plantsById['u-lime']).toBeTruthy();
  });

  it('deleting a library plant leaves placed plants as they are', async () => {
    await fresh();
    await saveMyPlant(limelight);
    state.shapes.push(plantShapeAt(plantsById['u-lime'], { x: 0, y: 0 }));
    await deleteMyPlant('u-lime');
    expect(plantsById['u-lime']).toBeUndefined();
    expect(state.shapes.at(-1)).toMatchObject({ plantId: 'u-lime', label: "Hydrangea 'Limelight'", radius: 3.5 });
  });

  it('travels in backup and project files, and merges on import without overwriting', async () => {
    await fresh();
    await saveMyPlant(limelight);
    await saveMyPlant({ id: 'u-other', common: 'Other', width: parseSize('2 ft')! } as Plant);
    state.shapes.push(plantShapeAt(plantsById['u-lime'], { x: 0, y: 0 }));
    await flushSave();
    const backup = await buildBackupFile();
    expect(parseImportPlants(backup.text).map((p) => (p as Plant).id).sort()).toEqual(['u-lime', 'u-other']);
    const projectFile = await buildProjectFile(state.currentProjectId!);
    expect(parseImportPlants(projectFile!.text).map((p) => (p as Plant).id)).toEqual(['u-lime']); // only what it uses
    // A device that has an edited Limelight keeps its own; new plants are added.
    await fresh();
    await saveMyPlant({ ...limelight, common: 'My Limelight' });
    expect(await mergeMyPlants(parseImportPlants(backup.text))).toBe(1);
    expect(plantsById['u-lime'].common).toBe('My Limelight');
    expect(plantsById['u-other']).toBeTruthy();
    expect(await mergeMyPlants([{ id: 'bad' }, 'junk'])).toBe(0);
  });
});

describe('a tree of mine, toward devices and files on an older version', () => {
  it('goes as "Tree (canopy)", which every version reads, and comes back as "Tree", its fingerprint unchanged', async () => {
    await fresh();
    const tree = { id: 'u-oak', common: 'Our oak', form: 'Tree', width: { min: 50, max: 70, med: 60 } } as Plant;
    await saveMyPlant(tree);
    // The fingerprint an older version took of it, as "Tree (canopy)": the same, so the rename alone uploads nothing.
    expect(plantHash(tree)).toBe(fingerprint('', { ...tree, form: 'Tree (canopy)' } as unknown as Record<string, unknown>));
    // A backup file carries the older name; read back here, it's "Tree".
    const backup = await buildBackupFile();
    const inFile = JSON.parse(backup.text).myPlants as { id: string; form?: string }[];
    expect(inFile.find((x) => x.id === 'u-oak')?.form).toBe('Tree (canopy)');
    expect(parseImportPlants(backup.text).map((x) => sanitizeMyPlant(x)?.form)).toContain('Tree');
    // Sync sends it the same way.
    let sent: unknown = null;
    const client = { rpc: async (_name: string, args: { p_plant: unknown }) => { sent = args.p_plant; return { data: { status: 'ok', revision: 1 }, error: null }; } };
    await supabasePlants(client as never, 'phone').pushPlant('u-oak', null, tree, 1);
    expect(sent).toMatchObject({ id: 'u-oak', form: 'Tree (canopy)' });
    expect(tree.form).toBe('Tree'); // (the plant itself untouched)
  });
});

describe('recoloring a library plant', () => {
  it('recolors placed plants still in the old color, as one undo step; ones colored by hand stay', () => {
    const c = (id: string, color: string, plantId = 'u-a') => ({ id, type: 'circle', x: 0, y: 0, radius: 1, color, label: '', opacity: 1, locked: false, role: 'plant', plantId }) as CircleShape;
    state.shapes = [c('a', '#16A34A'), c('b', '#ff0000'), c('o', '#16a34a', 'u-other')];
    state.history = []; state.historyIndex = -1;
    recolorPlaced('u-a', ['#16a34a'], '#a855f7');
    expect(state.shapes.map((s) => s.color)).toEqual(['#a855f7', '#ff0000', '#16a34a']);
    expect(state.historyIndex).toBe(0);
    recolorPlaced('u-a', ['#16a34a'], '#000000'); // nothing left in the old color: no step
    expect(state.historyIndex).toBe(0);
  });
  it('a tree of mine with no color of its own: circles still in the old understory gray follow an edit too', () => {
    const c = (id: string, color: string) => ({ id, type: 'circle', x: 0, y: 0, radius: 1, color, label: '', opacity: 1, locked: false, role: 'plant', plantId: 'u-t' }) as CircleShape;
    state.shapes = [c('gray', '#57534e'), c('brown', '#78350f'), c('red', '#ff0000')];
    const tree = { id: 'u-t', common: 'Our redbud', form: 'Tree', width: { min: 25, max: 35, med: 30 } } as Plant;
    expect(plantColors(tree)).toEqual(['#78350f', '#57534e']);
    expect(plantColors({ ...tree, color: '#123456' })).toEqual(['#123456']);
    recolorPlaced('u-t', plantColors(tree), '#16a34a');
    expect(state.shapes.map((s) => s.color)).toEqual(['#16a34a', '#16a34a', '#ff0000']);
  });
});

describe('stored size settings', () => {
  it('validates size mode and plant size source', () => {
    const d = sanitizeProjectData({ sizeMode: 'huge', shapes: [{ type: 'circle', radius: 1, sizeFrom: 'magic' }, { type: 'circle', radius: 1, sizeFrom: 'manual' }] });
    expect(d.sizeMode).toBe('typical');
    expect(d.shapes[0]).not.toHaveProperty('sizeFrom');
    expect(d.shapes[1]).toMatchObject({ sizeFrom: 'manual' });
  });
  it('a plan keeps its mode, and new plans start in the last mode used', async () => {
    await fresh('modes');
    const first = state.currentProjectId!;
    state.shapes = [];
    applySizeMode('full');
    await flushSave();
    expect((await readProject(first))!.sizeMode).toBe('full');
    const second = await createProject('Second');
    expect((await readProject(second))!.sizeMode).toBe('full');
    await switchProject(second);
    expect(state.sizeMode).toBe('full');
  });
});

describe('switching a plant of mine to the catalog’s', () => {
  const catalog = [
    { id: 'hydrangea-paniculata', common: 'Panicled hydrangea', botanical: 'Hydrangea paniculata', width: { min: 10, max: 20, med: 15 } },
    { id: 'hydrangea-paniculata-limelight', common: 'Limelight Hydrangea', botanical: "Hydrangea paniculata 'Limelight'", width: { min: 6, max: 8, med: 7 } },
    { id: 'hydrangea-paniculata-little-lime', common: 'Little Lime Hydrangea', botanical: "Hydrangea paniculata 'Jane'", width: { min: 3, max: 5, med: 4 } },
  ] as Plant[];
  const mine = (o: Partial<Plant>): Plant => ({ id: 'u-1', common: 'X', width: { min: 5, max: 5, med: 5 }, ...o });

  it('finds the one catalog plant it is, by botanical name or by every word of its name; never when unsure', async () => {
    const { catalogMatchFor } = await import('../src/my-plants');
    expect(catalogMatchFor(mine({ common: 'My lime', botanical: "Hydrangea paniculata ‘Limelight’" }), catalog)?.id).toBe('hydrangea-paniculata-limelight'); // (curly quotes too)
    expect(catalogMatchFor(mine({ common: "Hydrangea 'Limelight'" }), catalog)?.id).toBe('hydrangea-paniculata-limelight');
    expect(catalogMatchFor(mine({ common: 'Panicled hydrangea' }), catalog)?.id).toBe('hydrangea-paniculata'); // (exactly its name, of several that contain it)
    expect(catalogMatchFor(mine({ common: 'Limelight' }), catalog)).toBeNull(); // (one word: too loose)
    expect(catalogMatchFor(mine({ common: 'Blue hydrangea' }), catalog)).toBeNull(); // (no plant has both words)
    expect(catalogMatchFor(mine({ common: 'Lime hydrangea' }), catalog)?.id).toBe('hydrangea-paniculata-little-lime'); // (a suggestion: the person compares, then decides)
    expect(catalogMatchFor(mine({ common: "Hydrangea 'Limelight'", notSame: 'hydrangea-paniculata-limelight' }), catalog)).toBeNull(); // ("Keep mine")
    expect(catalogMatchFor(mine({ common: "Hydrangea 'Limelight'", sameAs: 'hydrangea-paniculata-limelight' }), catalog)).toBeNull(); // (already switched)
    expect(sanitizeMyPlant({ ...mine({}), sameAs: 'hydrangea-paniculata-limelight', notSame: 'x' })).toMatchObject({ sameAs: 'hydrangea-paniculata-limelight' });
    expect(sanitizeMyPlant({ ...mine({}), sameAs: 'Not An Id!' })).not.toHaveProperty('sameAs');
  });

  it('relinks the placed plants here (one undo step), stands for the catalog plant everywhere, and keeps notes and color', async () => {
    const { switchToCatalog, unswitch, activeMyPlants } = await import('../src/my-plants');
    const { ownCopies } = await import('../src/plants');
    const { undo } = await import('../src/history');
    await fresh();
    for (const p of catalog) plantsById[p.id] = p;
    const tag = await saveMyPlant(mine({ common: "Hydrangea 'Limelight'", width: { min: 5, max: 5, med: 5 }, notes: 'From the co-op sale', color: '#a855f7' }));
    state.sizeMode = 'typical';
    const a = { ...plantShapeAt(tag, { x: 0, y: 0 }), label: "Hydrangea 'Limelight'", plantId: tag.id };           // sized from my plant
    const b = { ...plantShapeAt(tag, { x: 9, y: 0 }), label: 'By the gate', plantId: tag.id, radius: 4, sizeFrom: 'manual' as const }; // sized by hand
    state.shapes = [a, b];
    const { pushHistory } = await import('../src/history');
    state.history = []; state.historyIndex = -1; pushHistory();
    const target = catalog[1];
    expect(await switchToCatalog(tag, target, true)).toBe(2);
    const [na, nb] = state.shapes as CircleShape[];
    expect(na).toMatchObject({ plantId: target.id, label: 'Limelight Hydrangea', radius: 3.5, sizeFrom: 'plant', color: '#a855f7' }); // (its color kept)
    expect(nb).toMatchObject({ plantId: target.id, label: 'By the gate', radius: 4, sizeFrom: 'manual' });
    // Its id now means the catalog plant (plans not open still hold it); it's no longer listed as mine; its notes go on.
    expect(plantsById[tag.id]).toBe(target);
    expect(activeMyPlants().map((p) => p.id)).not.toContain(tag.id);
    expect(ownCopies[target.id]?.notes).toBe('From the co-op sale');
    expect(plantColors(target)[0]).toBe('#a855f7');
    // Undo: the plan step, and the plant of mine is itself again.
    undo();
    expect((state.shapes as CircleShape[]).map((s) => s.plantId)).toEqual([tag.id, tag.id]);
    await unswitch(myPlants.find((p) => p.id === tag.id)!);
    expect(plantsById[tag.id]).toMatchObject({ id: tag.id, common: "Hydrangea 'Limelight'" });
    expect(activeMyPlants().map((p) => p.id)).toContain(tag.id);
  });
});

describe('the same species as a catalog plant', () => {
  const species = {
    id: 'hydrangea-paniculata', common: 'Panicle hydrangea', botanical: 'Hydrangea paniculata', form: 'Shrub',
    width: { min: 10, max: 20, med: 15 }, zone_min: 3, zone_max: 8.5, sun_most: 'Full', sun_least: 'Part',
    poison: { severity: 'low', parts: ['leaves'] }, native: 'No', deer: 'Seldom', bloom_season: ['summer'],
    flower_color: ['white'], bloom: { start: 7, end: 9 },
    prov: { zone_min: { src: ['ncstate'] }, poison: { src: ['ncstate'] }, native: { src: ['usda'] }, tox: { src: ['aspca'], unknown: true } },
  } as unknown as Plant;
  const cultivar = { id: 'hydrangea-paniculata-limelight', common: 'Limelight Hydrangea', botanical: "Hydrangea paniculata 'Limelight'", parent: 'hydrangea-paniculata', width: { min: 6, max: 8, med: 7 } } as Plant;
  const mine = (o: Partial<Plant>): Plant => ({ id: 'u-lime', common: "Our 'Limelight'", width: { min: 5, max: 6, med: 5.5 }, ...o });

  it('has what holds for the whole species, its own values standing; its size, color and bloom stay its own', async () => {
    const { withSpecies } = await import('../src/my-plants');
    const seen = withSpecies(mine({ sun_most: 'Part', sun_least: 'Part', color: '#ffffff', species: species.id }), species);
    expect(seen).toMatchObject({
      parent: species.id, zone_min: 3, zone_max: 8.5, poison: { severity: 'low' }, native: 'No', deer: 'Seldom', form: 'Shrub', bloom_season: ['summer'],
      sun_most: 'Part', sun_least: 'Part', color: '#ffffff', width: { min: 5, max: 6, med: 5.5 },
    });
    expect(seen).not.toHaveProperty('bloom');
    expect(seen).not.toHaveProperty('flower_color');
    expect(seen.prov).toMatchObject({ zone_min: { src: ['ncstate'], inherited: true }, poison: { inherited: true }, tox: { unknown: true, inherited: true } });
    expect(seen.prov).not.toHaveProperty('sun_most');
    expect(withSpecies(mine({}), undefined)).toEqual(mine({})); // (its species not loaded yet: as it is)
  });
  it('looks like its species through the year where its own form doesn\'t say: evergreen, needles or scales (Jason, Nov 1)', async () => {
    const { withSpecies } = await import('../src/my-plants');
    const cypress = { id: 'chamaecyparis-pisifera', common: 'Sawara cypress', botanical: 'Chamaecyparis pisifera', form: 'Tree', foliage: 'evergreen', needles: true, leaf_form: { type: ['scale'] } } as unknown as Plant;
    const own = { id: 'u-fc', common: 'False cypress', form: 'Shrub', species: cypress.id, width: { min: 3, max: 5, med: 4 } } as Plant;
    expect(withSpecies(own, cypress)).toMatchObject({ foliage: 'evergreen', needles: true, leaf_form: { type: ['scale'] }, form: 'Shrub' });
    // (Its own, where it has them, stand.)
    expect(withSpecies({ ...own, foliage: 'deciduous' } as Plant, cypress).foliage).toBe('deciduous');
  });
  it('is found for a botanical name, and for a plant to start from', async () => {
    const { speciesLinkFor, speciesRecordFor } = await import('../src/my-plants');
    const catalog = [species, cultivar];
    expect(speciesRecordFor("Hydrangea paniculata 'Bobo'", catalog)).toBe(species);
    expect(speciesRecordFor('Hydrangea', catalog)).toBeUndefined();
    expect(speciesRecordFor('Hydrangea arborescens', catalog)).toBeUndefined();
    for (const p of catalog) plantsById[p.id] = p;
    expect(speciesLinkFor(cultivar)).toBe(species);
    expect(speciesLinkFor(species)).toBe(species);
  });
  it('keeps only the link in storage, sync and backups; the app sees the species’ facts once the catalog loads', async () => {
    const mp = await import('../src/my-plants');
    const { loadPlants } = await import('../src/plants');
    await fresh();
    for (const p of [species, cultivar]) delete plantsById[p.id];
    await saveMyPlant(mine({ species: species.id, notes: 'From the co-op' }));
    expect(plantsById['u-lime']).not.toHaveProperty('poison'); // (the catalog isn't loaded yet)
    const was = globalThis.fetch;
    globalThis.fetch = (async () => ({ json: async () => ({ plants: [species, cultivar], meta: {} }) })) as unknown as typeof fetch;
    try { await loadPlants(); } finally { globalThis.fetch = was; }
    expect(plantsById['u-lime']).toMatchObject({ parent: species.id, poison: { severity: 'low' }, notes: 'From the co-op' });
    expect(mp.activeMyPlants().find((p) => p.id === 'u-lime')).toBe(plantsById['u-lime']);
    // Stored, synced and backed up: the link, never the species' facts.
    const stored = myPlants.find((p) => p.id === 'u-lime')!;
    expect(stored).toMatchObject({ species: species.id });
    for (const k of ['poison', 'zone_min', 'parent', 'prov']) expect(stored).not.toHaveProperty(k);
    expect(fingerprint('', stored as unknown as Record<string, unknown>)).toBe(plantHash(stored));
    const backup = JSON.parse((await buildBackupFile()).text) as { myPlants: Plant[] };
    expect(backup.myPlants.find((p) => p.id === 'u-lime')).not.toHaveProperty('poison');
    // Across a restart, the link stays.
    loadMyPlants();
    expect(myPlants.find((p) => p.id === 'u-lime')?.species).toBe(species.id);
    expect(plantsById['u-lime']).toMatchObject({ poison: { severity: 'low' } });
    // "Keep mine" on a catalog match stores the plant as it was, link and all, and nothing of its species'.
    await mp.keepMine(plantsById['u-lime'], cultivar);
    const kept = myPlants.find((p) => p.id === 'u-lime')!;
    expect(kept).toMatchObject({ species: species.id, notSame: cultivar.id });
    expect(kept).not.toHaveProperty('poison');
    // A link to something that isn't a catalog plant is dropped when read.
    expect(sanitizeMyPlant({ ...mine({}), species: 'Not An Id!' })).not.toHaveProperty('species');
  });
});
