// Every US county from the U.S. Census Bureau's cartographic boundaries (the us-atlas package, 1:10m): its
// five-digit FIPS code (as a number: Clark County, Arkansas, 05019, is 5019), name, state, center (lon/lat,
// its largest part's area centroid) and the counties it borders, across state lines too. The atlas map
// reader (atlas_counties.py) places Arkansas's county dots by these centers; wild.mjs names counties and
// their neighbors from them.
//   node scripts/catalog/counties.mjs [out.json]   (default catalog-src/counties.json)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { feature, neighbors } from 'topojson-client';

export const STATES = {
  1: 'AL', 2: 'AK', 4: 'AZ', 5: 'AR', 6: 'CA', 8: 'CO', 9: 'CT', 10: 'DE', 11: 'DC', 12: 'FL', 13: 'GA', 15: 'HI', 16: 'ID', 17: 'IL',
  18: 'IN', 19: 'IA', 20: 'KS', 21: 'KY', 22: 'LA', 23: 'ME', 24: 'MD', 25: 'MA', 26: 'MI', 27: 'MN', 28: 'MS', 29: 'MO', 30: 'MT', 31: 'NE',
  32: 'NV', 33: 'NH', 34: 'NJ', 35: 'NM', 36: 'NY', 37: 'NC', 38: 'ND', 39: 'OH', 40: 'OK', 41: 'OR', 42: 'PA', 44: 'RI', 45: 'SC', 46: 'SD',
  47: 'TN', 48: 'TX', 49: 'UT', 50: 'VT', 51: 'VA', 53: 'WA', 54: 'WV', 55: 'WI', 56: 'WY', 60: 'AS', 66: 'GU', 69: 'MP', 72: 'PR', 78: 'VI',
};
/** A polygon list's largest outer ring's area centroid. */
function center(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let best = null;
  for (const [ring] of polys) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i], [x1, y1] = ring[i + 1], c = x0 * y1 - x1 * y0;
      a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
    a /= 2;
    if (!best || Math.abs(a) > Math.abs(best.a)) best = { a, lon: cx / (6 * a), lat: cy / (6 * a) };
  }
  return best;
}
export function countyTable(topo) {
  const geoms = topo.objects.counties.geometries.filter((g) => g.id && g.type);
  const near = neighbors(geoms);
  const fc = feature(topo, { type: 'GeometryCollection', geometries: geoms });
  return fc.features.map((f, i) => {
    const fips = Number(geoms[i].id), c = center(f.geometry);
    return { fips, name: f.properties.name, state: STATES[Math.floor(fips / 1000)] ?? '', lon: +c.lon.toFixed(4), lat: +c.lat.toFixed(4), near: [...new Set(near[i].map((j) => Number(geoms[j].id)))].filter((n) => n !== fips).sort((a, b) => a - b) }; // (parts of one county can share a border)
  }).sort((a, b) => a.fips - b.fips);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const out = process.argv[2] ?? 'catalog-src/counties.json';
  const topo = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('us-atlas/counties-10m.json'), 'utf8'));
  const counties = countyTable(topo);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(counties) + '\n');
  console.log(`${counties.length} counties → ${out}`);
}
