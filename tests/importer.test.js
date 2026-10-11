const test = require('node:test');
const assert = require('node:assert');
const { parseCSV, guessMapping, normalizeDate, rowsToRounds } = require('../importer.js');

test('parseCSV handles quotes and delimiters', () => {
  assert.deepStrictEqual(parseCSV('a,b\n"x, y",2\n'), [['a', 'b'], ['x, y', '2']]);
  assert.deepStrictEqual(parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});
test('guessMapping', () => {
  const m = guessMapping(['Date', 'Course Name', 'Course Rating', 'Slope Rating', 'Total Score', 'Holes']);
  assert.deepStrictEqual(m, { rating: 2, slope: 3, holes: 5, pcc: -1, date: 0, score: 4, course: 1 });
});
test('normalizeDate', () => {
  assert.strictEqual(normalizeDate('2026-03-04'), '2026-03-04');
  assert.strictEqual(normalizeDate('3/4/2026'), '2026-03-04');
  assert.strictEqual(normalizeDate('Mar 4, 2026'), '2026-03-04');
  assert.strictEqual(normalizeDate('nope'), null);
});
test('rowsToRounds uses defaults and skips bad rows', () => {
  const mapping = { date: 0, course: 1, score: 2, rating: -1, slope: -1, holes: 3, pcc: -1 };
  const { rounds, skipped } = rowsToRounds(
    [['2026-01-01', 'A', '90', '18'], ['2026-01-02', 'B', '', '9'], ['bad', 'C', '80', '18']],
    mapping, { rating: 71, slope: 113 });
  assert.strictEqual(rounds.length, 1);
  assert.strictEqual(rounds[0].differential, 19);
  assert.strictEqual(skipped.length, 2);
});
