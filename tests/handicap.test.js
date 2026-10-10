const test = require('node:test');
const assert = require('node:assert');
const { scoreDifferential, handicapIndex, courseHandicap } = require('../handicap.js');

test('score differential', () => {
  assert.strictEqual(scoreDifferential({ score: 90, rating: 71.2, slope: 128 }), 16.6);
  assert.strictEqual(scoreDifferential({ score: 90, rating: 71.2, slope: 113, pcc: 1 }), 17.8);
});

const mk9 = (diffs) => diffs.map((d, i) => ({ id: 'n' + i, holes: 9, date: `2026-02-${String(i + 1).padStart(2, '0')}`, differential: d }));
const mk = (diffs) => diffs.map((d, i) => ({ id: i, date: `2026-01-${String(i + 1).padStart(2, '0')}`, differential: d }));

test('index needs 3 rounds', () => {
  assert.strictEqual(handicapIndex(mk([10, 11])), null);
});
test('3 rounds: lowest -2', () => {
  assert.strictEqual(handicapIndex(mk([10, 12, 14])), 8.0);
});
test('6 rounds: avg lowest 2 -1', () => {
  assert.strictEqual(handicapIndex(mk([10, 12, 14, 15, 16, 17])), 10.0);
});
test('20 rounds: best 8 of last 20 only', () => {
  const diffs = Array.from({ length: 21 }, (_, i) => 30 - i); // oldest is 30
  // last 20 = 29..10 (dates ascending => newest is 10); best 8 = 10..17 avg 13.5
  assert.strictEqual(handicapIndex(mk(diffs)), 13.5);
});
test('cap at 54', () => {
  assert.strictEqual(handicapIndex(mk([70, 70, 70])), 54);
});
test('course handicap', () => {
  assert.strictEqual(courseHandicap(15.0, 130, 71.5, 72), 17);
});

test('9-hole rounds pair up into one 18-hole differential', () => {
  const rounds = [...mk([10, 12, 14]), ...mk9([5, 6])]; // pair => 11.0
  // 4 entries: 10, 12, 14, 11 -> lowest 1 - 1 = 9.0
  assert.strictEqual(handicapIndex(rounds), 9.0);
});
test('unpaired 9-hole round uses expected differential', () => {
  // base index from 10,12,14 = 8.0; expected other nine = 0.52*8+1.2 = 5.36; 5 + 5.36 = 10.36 -> 10.4
  const rounds = [...mk([10, 12, 14]), ...mk9([5])];
  assert.strictEqual(handicapIndex(rounds), 9.0); // 4 entries, lowest 1 (10) -1
  assert.ok(require('../handicap.js').countingRounds(rounds).has(0));
});
test('unpaired 9-hole round ignored without a base index', () => {
  assert.strictEqual(handicapIndex(mk9([5])), null);
});
