// Builds data/zip.json (ZIP -> House district) from the Census Bureau's 119th Congressional District
// to 2020 ZCTA relationship file. Values look like "OH-01"; a ZIP in several districts lists each.
//   node scripts/build-zip.mjs [--from <file>]
// Notes: ZCTAs approximate ZIP codes (point ZIPs such as PO boxes are missing). A district that covers
// under 1% of a ZCTA's land area is ignored as a boundary sliver, so the app does not ask for an
// address needlessly. Delegate seats (district 98) are written as "00".
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeData } from './lib.mjs';

const URL_119 = 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/cd-sld/tab20_cd11920_zcta520_natl.txt';
const SLIVER = 0.01;

const FIPS = { '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY', '60': 'AS', '66': 'GU', '69': 'MP', '72': 'PR', '78': 'VI' };

export function buildZip(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split('|');
  const col = (re) => header.findIndex((h) => re.test(h));
  const iCd = col(/^GEOID_CD\d+_20$/), iZip = col(/^GEOID_ZCTA5_20$/), iZArea = col(/^AREALAND_ZCTA5_20$/), iPart = col(/^AREALAND_PART$/);
  if ([iCd, iZip, iZArea, iPart].some((i) => i < 0)) throw new Error('Unexpected column layout in the Census file.');

  const byZip = {};
  for (const line of lines.slice(1)) {
    const f = line.split('|');
    const zip = f[iZip];
    if (!zip || !/^\d{5}$/.test(zip)) continue; // rows for districts with no ZCTA
    const geoid = f[iCd];
    const state = FIPS[geoid.slice(0, 2)];
    if (!state) continue;
    const dist = geoid.slice(2) === '98' ? '00' : geoid.slice(2);
    (byZip[zip] = byZip[zip] || []).push({ seat: `${state}-${dist}`, share: Number(f[iPart]) / (Number(f[iZArea]) || 1) });
  }
  const out = {};
  for (const [zip, rows] of Object.entries(byZip)) {
    rows.sort((a, b) => b.share - a.share);
    const keep = rows.filter((r) => r.share >= SLIVER);
    out[zip] = (keep.length ? keep : rows.slice(0, 1)).map((r) => r.seat).sort();
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const from = args.indexOf('--from') >= 0 ? args[args.indexOf('--from') + 1] : null;
  let text;
  if (from) text = readFileSync(from, 'utf8');
  else {
    const res = await fetch(URL_119);
    if (!res.ok) throw new Error(`Census file: HTTP ${res.status}`);
    text = await res.text();
  }
  const zip = buildZip(text);
  const n = Object.keys(zip).length;
  if (n < 25000) throw new Error(`Only ${n} ZIPs parsed; refusing to overwrite data/zip.json.`);
  writeData('zip', zip);
  console.log(`Wrote ${n} ZIP codes (${Object.values(zip).filter((v) => v.length > 1).length} span more than one district).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
