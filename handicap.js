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

const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

// entries: array of { date, differential }. Returns index or null if < 3 entries.
function indexFromEntries(entries) {
  const recent = [...entries].sort(byDateDesc).slice(0, 20);
  const entry = WHS_TABLE[recent.length];
  if (!entry) return null;
  const [count, adj] = entry;
  const best = recent.map((r) => r.differential).sort((a, b) => a - b).slice(0, count);
  const avg = best.reduce((s, d) => s + d, 0) / count;
  return Math.min(54, round1(avg + adj));
}

// Turns raw rounds into 18-hole-equivalent entries { ids, date, differential }.
// 9-hole rounds are paired oldest-first (differentials summed); a leftover
// unpaired 9-hole round gets an expected differential for the other nine
// (0.52 * index + 1.2) once an index exists from the other entries.
function effectiveEntries(rounds) {
  const entries = rounds
    .filter((r) => r.holes !== 9)
    .map((r) => ({ ids: [r.id], date: r.date, differential: r.differential }));
  const nines = rounds.filter((r) => r.holes === 9).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (let i = 0; i + 1 < nines.length; i += 2) {
    entries.push({
      ids: [nines[i].id, nines[i + 1].id],
      date: nines[i + 1].date,
      differential: round1(nines[i].differential + nines[i + 1].differential),
    });
  }
  if (nines.length % 2 === 1) {
    const last = nines[nines.length - 1];
    const base = indexFromEntries(entries);
    if (base !== null) {
      entries.push({ ids: [last.id], date: last.date, differential: round1(last.differential + 0.52 * base + 1.2) });
    }
  }
  return entries;
}

function handicapIndex(rounds) {
  return indexFromEntries(effectiveEntries(rounds));
}

// Ids of the rounds counted toward the current index (for highlighting).
function countingRounds(rounds) {
  const recent = effectiveEntries(rounds).sort(byDateDesc).slice(0, 20);
  const entry = WHS_TABLE[recent.length];
  const ids = new Set();
  if (!entry) return ids;
  [...recent].sort((a, b) => a.differential - b.differential).slice(0, entry[0])
    .forEach((e) => e.ids.forEach((id) => ids.add(id)));
  return ids;
}

// Course handicap = index * slope/113 + (rating - par)
function courseHandicap(index, slope, rating, par) {
  return Math.round(index * (slope / 113) + (rating - par));
}

if (typeof module !== 'undefined') {
  module.exports = { scoreDifferential, handicapIndex, countingRounds, courseHandicap };
}
