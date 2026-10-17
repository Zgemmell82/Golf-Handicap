import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { buildRoster } from '../scripts/build-roster.mjs';
const f = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'));
const roster = buildRoster(f('legislators-current'), f('committees-current'), f('committee-membership-current'), '2026-10-17');

test('keeps only current members and sorts by state', () => {
  assert.deepStrictEqual(roster.map((o) => o.bioguide), ['X000003', 'X000001', 'X000002']);
});
test('house member fields', () => {
  const o = roster.find((x) => x.bioguide === 'X000001');
  assert.strictEqual(o.id, 'oh-02-x000001');
  assert.strictEqual(o.chamber, 'house');
  assert.strictEqual(o.party, 'D');
  assert.strictEqual(o.district, '02');
  assert.strictEqual(o.firstElected, 2018);
  assert.strictEqual(o.inOfficeSince, 2019);
  assert.deepStrictEqual(o.committees, ['Ways and Means']); // subcommittee excluded
  assert.strictEqual(o.contact.phone, '202-555-0101');
});
test('senator who moved from the House counts years in the Senate only', () => {
  const o = roster.find((x) => x.bioguide === 'X000002');
  assert.strictEqual(o.chamber, 'senate');
  assert.strictEqual(o.district, null);
  assert.strictEqual(o.inOfficeSince, 2017);
  assert.strictEqual(o.firstElected, 2014);
  assert.deepStrictEqual(o.committees, ['Finance']);
  assert.strictEqual(o.name, 'Bo Sample'); // falls back to first + last
});
test('delegates get district 00 and independent code', () => {
  const o = roster.find((x) => x.bioguide === 'X000003');
  assert.strictEqual(o.district, '00');
  assert.strictEqual(o.party, 'I');
  assert.strictEqual(o.state, 'GU');
});
