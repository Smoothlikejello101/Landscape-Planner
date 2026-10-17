// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { openKV } from '../src/db';
import {
  applySizeMode, deleteMyPlant, fullRingRadius, isDataSized, loadMyPlants, mergeMyPlants, myPlants, parseSize,
  plantRadius, plantsToResize, sanitizeMyPlant, saveMyPlant, sunRange,
} from '../src/my-plants';
import { plantShapeAt, plantsById, type Plant } from '../src/plants';
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
  ])('%s', (text, min, max) => {
    expect(parseSize(text)).toEqual({ min, max, med: (min + max) / 2 });
  });
  it('uses the chosen unit for bare numbers, but a written unit wins', () => {
    expect(parseSize('18-24', 'in')).toEqual({ min: 1.5, max: 2, med: 1.75 });
    expect(parseSize('3 ft', 'in')).toEqual({ min: 3, max: 3, med: 3 });
    expect(parseSize('2,5')).toEqual({ min: 2.5, max: 2.5, med: 2.5 }); // decimal comma
  });
  it.each(['', 'big', '0', '-3', '6 meters', '500 ft'])('rejects %j', (text) => {
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
