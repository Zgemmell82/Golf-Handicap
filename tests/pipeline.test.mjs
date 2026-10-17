import test from 'node:test';
import assert from 'node:assert';
import { buildVote } from '../scripts/build-votes.mjs';
import { buildFinance } from '../scripts/build-finance.mjs';

// Shapes copied from real Congress.gov / OpenFEC responses captured by the probe workflow.
const item = { congress: 119, legislationNumber: '3424', legislationType: 'HR', legislationUrl: 'https://www.congress.gov/bill/119/house-bill/3424', result: 'Passed', rollCallNumber: 240, sessionNumber: 1, sourceDataURL: 'https://clerk.house.gov/evs/2025/roll240.xml', startDate: '2025-09-08T18:56:00-04:00', voteType: '2/3 Yea-And-Nay' };
const results = [
  { bioguideID: 'A000055', firstName: 'Robert', lastName: 'Aderholt', voteCast: 'Aye', voteParty: 'R', voteState: 'AL' },
  { bioguideID: 'A000148', voteCast: 'No', voteParty: 'D', voteState: 'MA' },
  { bioguideID: 'Z999999', voteCast: 'Aye' }, // not in the roster
];

test('buildVote maps members to official ids and formats the bill', () => {
  const v = buildVote(item, results, { A000055: 'al-05-a000055', A000148: 'ma-06-a000148' }, 'Some Act', 'On Passage');
  assert.strictEqual(v.question, 'On Passage');
  assert.strictEqual(v.id, 'h119-1-240');
  assert.strictEqual(v.date, '2025-09-08');
  assert.strictEqual(v.billId, 'H.R. 3424');
  assert.strictEqual(v.title, 'Some Act');
  assert.deepStrictEqual(v.byOfficial, { 'al-05-a000055': 'Yea', 'ma-06-a000148': 'Nay' });
  assert.strictEqual(v.url, item.legislationUrl);
});
test('buildVote falls back for votes with no bill', () => {
  const v = buildVote({ ...item, legislationType: undefined, legislationNumber: undefined, legislationUrl: undefined }, [], {}, null);
  assert.strictEqual(v.billId, 'Procedural vote');
  assert.strictEqual(v.title, 'Procedural vote');
  assert.strictEqual(v.url, item.sourceDataURL);
});

test('buildFinance computes shares and filters non-employers', () => {
  const totals = { receipts: 1000000, individual_unitemized_contributions: 250000, candidate_contribution: 50000 };
  const employers = [
    { employer: 'RETIRED', total: 90000 }, { employer: 'N/A', total: 80000 },
    { employer: 'ACME HEALTH', total: 40000.4 }, { employer: 'Self-Employed', total: 30000 }, { employer: 'INFORMATION REQUESTED PER BEST EFFORTS', total: 20000 }, { employer: 'LAKESIDE SCHOOLS', total: 10000 },
  ];
  const f = buildFinance('H0OH01234', 2024, totals, employers, '2026-10-17');
  assert.strictEqual(f.totalRaised, 1000000);
  assert.strictEqual(f.smallDollarPct, 25);
  assert.strictEqual(f.selfFundedPct, 5);
  assert.strictEqual(f.largeDollarPct, 70);
  assert.deepStrictEqual(f.employers, [{ name: 'ACME HEALTH', amount: 40000 }, { name: 'LAKESIDE SCHOOLS', amount: 10000 }]);
  assert.deepStrictEqual(f.industries, []);
  assert.strictEqual(f.source.url, 'https://www.fec.gov/data/candidate/H0OH01234/');
});
test('buildFinance handles zero receipts without dividing by zero', () => {
  const f = buildFinance('H1', 2024, {}, [], '2026-10-17');
  assert.deepStrictEqual([f.totalRaised, f.smallDollarPct, f.largeDollarPct, f.selfFundedPct], [0, 0, 100, 0]);
});

import { buildZip } from '../scripts/build-zip.mjs';
// Layout copied from the real Census file (columns trimmed to the ones that matter, same header names).
const H = 'GEOID_CD119_20|NAMELSAD_CD119_20|GEOID_ZCTA5_20|AREALAND_ZCTA5_20|AREALAND_PART';
const zipText = [H,
  '0101|Congressional District 1||||558858619',            // district with no ZCTA row: skipped
  '0101|Congressional District 1|36009|417245447|4938464', // ZIP wholly inside one district
  '3901|Congressional District 1|43215|1000|600',          // ZIP split across two districts
  '3903|Congressional District 3|43215|1000|390',
  '3902|Congressional District 2|43215|1000|5',            // 0.5% sliver: ignored
  '1198|Delegate|20001|2000|2000',                         // DC delegate -> 00
  '4800|At large|99999|10|10',
].join('\n');
test('buildZip groups districts per ZIP, ignores slivers, maps delegates to 00', () => {
  const z = buildZip(zipText);
  assert.deepStrictEqual(z['36009'], ['AL-01']);
  assert.deepStrictEqual(z['43215'], ['OH-01', 'OH-03']);
  assert.deepStrictEqual(z['20001'], ['DC-00']);
  assert.strictEqual(z['99999'][0], 'TX-00');
  assert.strictEqual(Object.keys(z).length, 4);
});
test('buildZip rejects an unexpected layout', () => {
  assert.throws(() => buildZip('a|b\n1|2'), /Unexpected column layout/);
});
