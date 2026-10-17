// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { formatMonthDay, lookUpZip, sanitizeLocation, zoneFit, zoneRange, type ClimateFile } from '../src/climate';
// @ts-expect-error (plain JavaScript build script)
import { buildFiles, centersByZip, frostStations, miles, monthDay, stationName, table, zonesByZip } from '../scripts/climate/lib.mjs';
import { openKV } from '../src/db';
import { state } from '../src/state';
import { _resetStorageForTests, createProject, flushSave, initStorage, readProject, replaceProjectContent, projectChangeToken, save, switchProject, syncedContent, sanitizeProjectData } from '../src/storage';

// The ZIP code lookup: building its tables from the official files, reading
// them, and what a plan keeps.

const PRISM = 'zipcode,zone,trange,zonetitle\n71923,8a,10 to 15,8a: 10 to 15\n71998,8a,10 to 15,8a: 10 to 15\n72201,8a,10 to 15,8a: 10 to 15\n99999,zz,,\n';
const GAZ = 'GEOID\tALAND\tAWATER\tALAND_SQMI\tAWATER_SQMI\tINTPTLAT\tINTPTLONG\n71923\t1\t0\t1\t0\t34.0812\t-93.0771\n72201\t1\t0\t1\t0\t34.7476\t-92.2797\n';
const FLAGGED = (rows: Record<string, string>[]) => rows.map((r) => (r.NAME.startsWith('KETCHUM') ? { ...r, 'meas_flag_ANN-TMIN-PRBLST-T32FP50': 'V' } : r));
const NORMALS = [
  'STATION,DATE,LATITUDE,LONGITUDE,ELEVATION,NAME,ANN-TMIN-PRBLST-T32FP50,ANN-TMIN-PRBLST-T32FP10,ANN-TMIN-PRBFST-T32FP50,ANN-TMIN-PRBFST-T32FP10,ANN-TMIN-PRBOCC-LSTH032',
  'USC00030220,1991-2020,34.1167,-93.0500,64,"ARKADELPHIA 2 N, AR US",   03/24,   04/08,   11/06,   10/24,  100.0',
  'USW00013963,1991-2020,34.7275,-92.2389,78,"LITTLE ROCK ADAMS FLD, AR US",   03/10,   03/25,-9999.0,   11/01,  100.0',
  'USC00999999,1991-2020,34.0,-93.0,10,"NO FROST DATA, AR US",-9999.0,-9999.0,-9999.0,-9999.0,-9999.0',
  'USC00888888,1991-2020,25.58,-80.43,10,"PERRINE 4W, FL US",   01/18,   02/01,   01/13,   12/31,   11.4',
  'US1FLMD0001,1991-2020,25.6,-80.4,10,"RAIN GAUGE ONLY, FL US",,,,,',
  'USC00104845,1991-2020,43.68,-114.36,1800,"KETCHUM RS, ID US",-9999.0,-9999.0,-9999.0,-9999.0,  100.0',
].join('\n');

describe('building the tables', () => {
  it('reads the official files', () => {
    expect([...zonesByZip(PRISM)]).toEqual([['71923', '8a'], ['71998', '8a'], ['72201', '8a']]);
    expect(centersByZip(GAZ).get('71923')).toEqual([34.0812, -93.0771]);
    const st = frostStations(FLAGGED(table(NORMALS)));
    // Missing dates (where freezes come most years, with no reason given) or no records leave a station out;
    // a rare-frost station keeps only its chance; NOAA's flag V means frost in any month.
    expect(st.map((s: { name: string }) => s.name)).toEqual(['Arkadelphia 2 N, AR', 'Perrine 4W, FL', 'Ketchum RS, ID']);
    expect(st[1]).toEqual({ id: 'USC00888888', name: 'Perrine 4W, FL', lat: 25.58, lon: -80.43, chance: 11 });
    expect(st[2]).toMatchObject({ name: 'Ketchum RS, ID', chance: 100, yearRound: true });
    expect(frostStations(table(NORMALS)).map((s: { name: string }) => s.name)).not.toContain('Ketchum RS, ID'); // (no flag: no reason, left out)
  });
  it('dates come as month-day, MMDD or day of year; codes for "none" are none', () => {
    expect(monthDay('   03/24')).toBe('03-24'); // as NOAA's files have it
    expect(monthDay('0324')).toBe('03-24');
    expect(monthDay('-9999.0')).toBeNull();
    expect(monthDay('3-24')).toBe('03-24');
    expect(monthDay('83')).toBe('03-24');
    expect(monthDay('-7777')).toBeNull();
    expect(monthDay('1345')).toBeNull();
    expect(monthDay('0231')).toBeNull();
  });
  it('each ZIP gets the nearest station with frost dates, within 50 miles', () => {
    const files = buildFiles(zonesByZip(PRISM), centersByZip(GAZ), frostStations(table(NORMALS)), '2026-10-17');
    const f = files.get('719')!;
    expect(f.zips['71923']).toEqual(['8a', 0, 3]);
    expect(f.zips['71998']).toEqual(['8a', -2, 0]); // no mapped area (a PO box): zone only
    expect(f.stations[0]).toEqual({ name: 'Arkadelphia 2 N, AR', chance: 100, spring: '03-24', springLate: '04-08', fall: '11-06', fallEarly: '10-24' });
    expect(f.accessed).toBe('2026-10-17');
    // Little Rock's own station is left out (a missing date), and Arkadelphia is over 50 miles away.
    expect(files.get('722')!.zips['72201']).toEqual(['8a', -1, 0]);
    expect(Math.round(miles([34.0812, -93.0771], [34.7476, -92.2797]))).toBeGreaterThan(50);
    expect(stationName('ST. LOUIS LAMBERT INTL AP, MO US')).toBe('St. Louis Lambert Intl AP, MO');
    expect(stationName('TOA BAJA LEVITTOWN, PR RQ')).toBe('Toa Baja Levittown, PR');
    expect(stationName("MUND'S PARK, AZ US")).toBe("Mund's Park, AZ");
    expect(stationName('JACKSON INTL AP, MS US')).toBe('Jackson Intl AP, MS');
    expect(stationName('FAIRBANKS 11 NE, AK US')).toBe('Fairbanks 11 NE, AK');
    expect(stationName('SAN FRANCISCO 1.1 SW, CA US')).toBe('San Francisco 1.1 SW, CA');
  });
});

describe('looking up a ZIP', () => {
  const file = buildFiles(zonesByZip(PRISM), centersByZip(GAZ), frostStations(table(NORMALS)), '2026-10-17').get('719') as ClimateFile;
  const fetcher = (async (url: string) => {
    if (url === 'climate/719.json') return new Response(JSON.stringify(file));
    return new Response('', { status: 404 });
  }) as typeof fetch;
  it('gives the zone and frost dates', async () => {
    expect(await lookUpZip(' 71923 ', fetcher)).toEqual({ ok: true, location: {
      zip: '71923', zone: '8a', accessed: '2026-10-17',
      frost: { station: 'Arkadelphia 2 N, AR', miles: 3, chance: 100, spring: '03-24', springLate: '04-08', fall: '11-06', fallEarly: '10-24' } } });
    expect(await lookUpZip('71998', fetcher)).toEqual({ ok: true, location: { zip: '71998', zone: '8a', accessed: '2026-10-17', noArea: true } });
  });
  it('says why it can’t', async () => {
    expect(await lookUpZip('7192', fetcher)).toEqual({ ok: false, why: 'format' });
    expect(await lookUpZip('71900', fetcher)).toEqual({ ok: false, why: 'unknown' });
    expect(await lookUpZip('10001', fetcher)).toEqual({ ok: false, why: 'unknown' });
    expect(await lookUpZip('71923', (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch)).toEqual({ ok: false, why: 'offline' });
  });
});

describe('plants and zones', () => {
  const loc = { zip: '71923', zone: '8a' };
  it('a plant fits, is too tender, or may want colder winters', () => {
    expect(zoneFit({ zone_min: 5, zone_max: 9 }, loc)).toBe('fits');
    expect(zoneFit({ zone_min: 9, zone_max: 11 }, loc)).toBe('cold');
    expect(zoneFit({ zone_min: 3, zone_max: 7 }, loc)).toBe('warm');
    expect(zoneFit({}, loc)).toBeNull();
    expect(zoneFit({ zone_min: 5, zone_max: 9 }, null)).toBeNull();
    expect(zoneRange({ zone_min: 5, zone_max: 9 })).toBe('zones 5–9');
    expect(formatMonthDay('03-24')).toBe('Mar 24');
  });
  it('anything malformed in a stored location reads as none', () => {
    expect(sanitizeLocation({ zip: '7192', zone: '8a' })).toBeNull();
    expect(sanitizeLocation({ zip: '71923', zone: '14a' })).toBeNull();
    expect(sanitizeLocation({ zip: '71923', zone: '8a', frost: { station: 'X', miles: 2, spring: '13-01', springLate: '04-08', fall: '11-06', fallEarly: '10-24' } })).toEqual({ zip: '71923', zone: '8a' });
    expect(sanitizeLocation({ zip: '71923', zone: '8a', frost: { station: 'X', miles: 2, chance: 100, spring: '13-01', springLate: '04-08', fall: '11-06', fallEarly: '10-24' } }))
      .toEqual({ zip: '71923', zone: '8a', frost: { station: 'X', miles: 2, chance: 100 } }); // dates all or none
  });
});

describe('a plan keeps its location', () => {
  const loc = { zip: '71923', zone: '8a', frost: { station: 'Arkadelphia 2 N, AR', miles: 3, chance: 100, spring: '03-24', springLate: '04-08', fall: '11-06', fallEarly: '10-24' } };
  async function fresh() { _resetStorageForTests(); globalThis.indexedDB = new IDBFactory(); const kv = await openKV('climate'); await initStorage(kv); return kv; }
  it('across a restart; plans that never had one sync exactly as before', async () => {
    const kv = await fresh();
    const id = state.currentProjectId!;
    expect(state.location).toBeUndefined();
    expect('location' in syncedContent(sanitizeProjectData({}))).toBe(false); // so no plan looks changed after the update
    state.location = loc; save(); await flushSave();
    _resetStorageForTests(); await initStorage(kv);
    expect(state.location).toEqual(loc);
    expect((await readProject(id))!.location).toEqual(loc);
    // Cleared: kept as cleared (so it clears on the other devices too).
    state.location = null; save(); await flushSave();
    expect(syncedContent((await readProject(id))!).location).toBeNull();
  });
  it('a plan from a version before locations synced keeps the location here; a cleared one clears it', async () => {
    await fresh();
    const other = await createProject('Other', { ...sanitizeProjectData({}), location: loc });
    expect(await replaceProjectContent(other, 'Other', { shapes: [] }, projectChangeToken(other))).toBe(true);
    expect((await readProject(other))!.location).toEqual(loc);
    expect(await replaceProjectContent(other, 'Other', { shapes: [], location: null }, projectChangeToken(other))).toBe(true);
    expect((await readProject(other))!.location).toBeNull();
    await switchProject(other);
    expect(state.location).toBeNull();
  });
});

describe('project files and backups', () => {
  it('carry the location', async () => {
    const { buildProjectFile, parseImportFile } = await import('../src/backup');
    _resetStorageForTests(); globalThis.indexedDB = new IDBFactory(); await initStorage(await openKV('climate-backup'));
    state.location = { zip: '71923', zone: '8a' }; save(); await flushSave();
    const file = await buildProjectFile(state.currentProjectId!);
    expect(parseImportFile(file!.text)[0].data.location).toEqual({ zip: '71923', zone: '8a' });
  });
});
