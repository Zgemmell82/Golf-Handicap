// CSV import helpers (pure functions, no DOM).

const FIELDS = {
  date: /date|played|time/i,
  course: /course|club|facility|location|name/i,
  score: /^(total|gross|adjusted|adj).*(score)?$|score|strokes/i,
  rating: /rating/i,
  slope: /slope/i,
  holes: /holes/i,
  pcc: /pcc|condition/i,
};

function detectDelimiter(line) {
  const counts = [',', '\t', ';'].map((d) => [d, line.split(d).length]);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

function parseCSV(text) {
  text = text.replace(/^﻿/, '').trim();
  if (!text) return [];
  const delim = detectDelimiter(text.split(/\r?\n/)[0]);
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some(Boolean));
}

// Returns { field: columnIndex | -1 }
function guessMapping(headers) {
  const used = new Set();
  const mapping = {};
  // Most specific fields first so "course rating" isn't mistaken for course.
  for (const f of ['rating', 'slope', 'holes', 'pcc', 'date', 'score', 'course']) {
    mapping[f] = headers.findIndex((h, i) => !used.has(i) && FIELDS[f].test(h));
    if (mapping[f] >= 0) used.add(mapping[f]);
  }
  return mapping;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');

function normalizeDate(s) {
  s = String(s || '').trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) { // month/day/year (US order)
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${pad(m[1])}-${pad(m[2])}`;
  }
  if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/))) {
    const mi = MONTHS.indexOf(m[1].toLowerCase());
    if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(m[2])}`;
  }
  return null;
}

// rows: data rows (no header). defaults: { rating, slope } used when a row has none.
function rowsToRounds(rows, mapping, defaults = {}) {
  const get = (r, f) => (mapping[f] >= 0 ? r[mapping[f]] : '');
  const rounds = [];
  const skipped = [];
  rows.forEach((r, i) => {
    const date = normalizeDate(get(r, 'date'));
    const score = parseInt(get(r, 'score'), 10);
    const rating = parseFloat(get(r, 'rating')) || defaults.rating || 0;
    const slope = parseInt(get(r, 'slope'), 10) || defaults.slope || 0;
    const holesRaw = parseInt(get(r, 'holes'), 10);
    const holes = holesRaw === 9 ? 9 : 18;
    let reason = null;
    if (!date) reason = 'unreadable date';
    else if (!(score > 0)) reason = 'no score';
    else if (!rating || !slope) reason = 'no course rating/slope';
    if (reason) { skipped.push({ row: i + 1, reason }); return; }
    const pcc = parseInt(get(r, 'pcc'), 10) || 0;
    rounds.push({
      date, holes, score, rating, slope, pcc,
      course: get(r, 'course') || 'Imported',
      differential: Math.round((113 / slope) * (score - rating - pcc) * 10) / 10,
    });
  });
  return { rounds, skipped };
}

if (typeof module !== 'undefined') module.exports = { parseCSV, guessMapping, normalizeDate, rowsToRounds };
