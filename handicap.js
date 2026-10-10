// World Handicap System calculations (pure functions, no DOM).

// Number of differentials used and adjustment, keyed by rounds available.
const WHS_TABLE = {
  3: [1, -2], 4: [1, -1], 5: [1, 0], 6: [2, -1], 7: [2, 0], 8: [2, 0],
  9: [3, 0], 10: [3, 0], 11: [3, 0], 12: [4, 0], 13: [4, 0], 14: [4, 0],
  15: [5, 0], 16: [5, 0], 17: [6, 0], 18: [6, 0], 19: [7, 0], 20: [8, 0],
};

function round1(n) {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

function scoreDifferential({ score, rating, slope, pcc = 0 }) {
  return round1((113 / slope) * (score - rating - pcc));
}

// rounds: array of { date, differential }. Returns index or null if < 3 rounds.
function handicapIndex(rounds) {
  const recent = [...rounds]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 20);
  const entry = WHS_TABLE[Math.min(recent.length, 20)];
  if (!entry) return null;
  const [count, adj] = entry;
  const best = recent.map((r) => r.differential).sort((a, b) => a - b).slice(0, count);
  const avg = best.reduce((s, d) => s + d, 0) / count;
  return Math.min(54, round1(avg + adj));
}

// Indices of the rounds counted toward the current index (for highlighting).
function countingRounds(rounds) {
  const recent = [...rounds]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 20);
  const entry = WHS_TABLE[recent.length];
  if (!entry) return new Set();
  return new Set(
    [...recent].sort((a, b) => a.differential - b.differential).slice(0, entry[0]).map((r) => r.id)
  );
}

// Course handicap = index * slope/113 + (rating - par)
function courseHandicap(index, slope, rating, par) {
  return Math.round(index * (slope / 113) + (rating - par));
}

if (typeof module !== 'undefined') {
  module.exports = { scoreDifferential, handicapIndex, countingRounds, courseHandicap };
}
