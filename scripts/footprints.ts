// Houses for the ward map, from Microsoft's open building footprints
// (https://github.com/microsoft/GlobalMLBuildingFootprints). Their file server
// doesn't allow browser downloads, so this runs locally and prints JSON to
// paste into the app's "Import houses".
//
// Usage (the box comes from the Import houses dialog):
//   node scripts/footprints.ts <south>,<west>,<north>,<east> | pbcopy
//
// Keeps buildings whose centre is in the box and whose size is house-like, so
// most sheds and barns drop out. Only the box's map tile is downloaded.

import { gunzipSync } from 'node:zlib';

const INDEX_URL = 'https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv';
const TILE_ZOOM = 9;
const MIN_AREA_M2 = 70;
const MAX_AREA_M2 = 600;

const [south, west, north, east] = (process.argv[2] ?? '').split(',').map(Number);
if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east) {
  console.error('Usage: node scripts/footprints.ts <south>,<west>,<north>,<east>');
  process.exit(1);
}

/** Bing tile quadkey containing a point. */
function quadkey(lat: number, lng: number): string {
  const sin = Math.sin((lat * Math.PI) / 180);
  const x = Math.floor(((lng + 180) / 360) * 2 ** TILE_ZOOM);
  const y = Math.floor((0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 2 ** TILE_ZOOM);
  let key = '';
  for (let i = TILE_ZOOM; i > 0; i--) {
    const bit = 1 << (i - 1);
    key += String((x & bit ? 1 : 0) + (y & bit ? 2 : 0));
  }
  return key;
}

const keys = new Set([
  quadkey(south, west),
  quadkey(south, east),
  quadkey(north, west),
  quadkey(north, east),
]);

const index = await (await fetch(INDEX_URL)).text();
const urls = index
  .split('\n')
  .map((line) => line.split(','))
  .filter(([location, key]) => location === 'UnitedStates' && keys.has(key))
  .map(([, , url]) => url);
if (!urls.length) {
  console.error('No footprint files cover this area.');
  process.exit(1);
}

const lat0 = (south + north) / 2;
const mx = Math.cos((lat0 * Math.PI) / 180) * 111320;
const my = 110540;
const houses: { lat: number; lng: number }[] = [];

for (const url of urls) {
  const gz = Buffer.from(await (await fetch(url)).arrayBuffer());
  for (const line of gunzipSync(gz).toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    const ring: [number, number][] = JSON.parse(line).geometry.coordinates[0];
    const pts = ring.slice(0, -1);
    const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (lat < south || lat > north || lng < west || lng > east) continue;
    let twice = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      twice += ring[i][0] * mx * ring[i + 1][1] * my - ring[i + 1][0] * mx * ring[i][1] * my;
    }
    const area = Math.abs(twice) / 2;
    if (area < MIN_AREA_M2 || area > MAX_AREA_M2) continue;
    houses.push({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
  }
}

console.error(`${houses.length} house-sized buildings.`);
console.log(JSON.stringify(houses));
