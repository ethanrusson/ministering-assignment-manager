// One-shot sanity check: run the parser against docs/lcr.html and print stats.
// Not a unit test — runs only if you have the real file. Usage:
//   npx tsx scripts/check-real-lcr.ts

import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { LcrHtmlParserV1 } from '../src/lib/lcr/parser';

const path = new URL('../docs/lcr.html', import.meta.url);
if (!existsSync(path)) {
  console.log('No docs/lcr.html — skipping real-file check.');
  process.exit(0);
}

const dom = new JSDOM('');
(globalThis as { DOMParser: typeof DOMParser }).DOMParser = dom.window.DOMParser;

const html = readFileSync(path, 'utf8');
const r = new LcrHtmlParserV1().parse(html);

console.log('Districts      :', r.districts.length, '→', r.districts.map((d) => d.name).join(', '));
console.log('Companionships :', r.companionships.length);
console.log('Elders         :', r.elders.length);
console.log('Households     :', r.households.length);
console.log('Warnings       :', r.warnings.length);

const perDistrict = r.districts
  .map((d) => `${d.name}=${r.companionships.filter((c) => c.districtLegacyId === d.legacyId).length}`)
  .join(' ');
console.log('Comp per dist  :', perDistrict);

const minors = r.elders.filter((e) => e.age != null && (e.age as number) < 18);
console.log('Elders <18     :', minors.length);
console.log('Elders no age  :', r.elders.filter((e) => e.age == null).length);

const sizes = r.companionships.map((c) => c.elderLegacyIds.length);
console.log(
  'Comp sizes     : 1→' + sizes.filter((n) => n === 1).length + '  2→' +
    sizes.filter((n) => n === 2).length + '  3+→' + sizes.filter((n) => n >= 3).length,
);

const hhSizes = r.companionships.map((c) => c.householdLegacyIds.length);
console.log(
  'HH/comp        : avg=' +
    (hhSizes.reduce((a, b) => a + b, 0) / hhSizes.length).toFixed(2) +
    ' max=' + Math.max(...hhSizes) + ' zero=' + hhSizes.filter((n) => n === 0).length,
);
