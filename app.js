const KEY = 'golf-handicap-rounds';
let rounds = load();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save() { localStorage.setItem(KEY, JSON.stringify(rounds)); }
const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render() {
  const idx = handicapIndex(rounds);
  $('index').textContent = idx === null ? '—' : idx.toFixed(1);
  $('index-note').textContent = idx === null
    ? `Add at least 3 rounds (${rounds.length}/3)`
    : `Based on ${Math.min(rounds.length, 20)} most recent round${rounds.length === 1 ? '' : 's'}`;
  $('count').textContent = `(${rounds.length})`;

  const counting = countingRounds(rounds);
  const sorted = [...rounds].sort((a, b) => (a.date < b.date ? 1 : -1));
  $('rounds').innerHTML = sorted.map((r) => `
    <tr>
      <td>${r.date}</td><td>${r.holes || 18}</td><td>${escapeHtml(r.course)}</td><td>${r.score}</td>
      <td>${r.rating} / ${r.slope}${r.pcc ? ` (PCC ${r.pcc})` : ''}</td>
      <td class="${counting.has(r.id) ? 'counts' : ''}">${r.differential.toFixed(1)}</td>
      <td><button class="del" data-id="${r.id}" aria-label="Delete round">×</button></td>
    </tr>`).join('');
  updateCourseHandicap();
}

function updateCourseHandicap() {
  const idx = handicapIndex(rounds);
  const slope = +$('ch-slope').value, rating = +$('ch-rating').value, par = +$('ch-par').value;
  $('ch-result').textContent = idx !== null && slope && rating && par
    ? courseHandicap(idx, slope, rating, par) : '—';
}

$('round-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const r = {
    id: Date.now() + Math.random(),
    holes: +f.get('holes'),
    date: f.get('date'),
    course: f.get('course').trim(),
    score: +f.get('score'),
    rating: +f.get('rating'),
    slope: +f.get('slope'),
    pcc: +f.get('pcc') || 0,
  };
  r.differential = scoreDifferential(r);
  rounds.push(r);
  save();
  e.target.reset();
  syncHoles();
  render();
});

// Optional hole-by-hole entry: sums into the total score field.
const form = $('round-form');
function syncHoles() {
  const n = +form.holes.value;
  const on = $('by-hole').checked;
  $('holes').hidden = !on;
  form.score.readOnly = on;
  $('rating-label').textContent = n === 9 ? '9-hole course rating' : 'Course rating';
  $('slope-label').textContent = n === 9 ? '9-hole slope' : 'Slope';
  if (on) {
    $('holes').innerHTML = Array.from({ length: n }, (_, i) =>
      `<label>${i + 1}<input type="number" min="1" max="20" class="hole"></label>`).join('');
    sumHoles();
  }
}
function sumHoles() {
  const vals = [...document.querySelectorAll('.hole')].map((i) => +i.value);
  form.score.value = vals.some(Boolean) ? vals.reduce((a, b) => a + b, 0) : '';
}
form.holes.addEventListener('change', syncHoles);
$('by-hole').addEventListener('change', syncHoles);
$('holes').addEventListener('input', sumHoles);

$('rounds').addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  rounds = rounds.filter((r) => String(r.id) !== id);
  save();
  render();
});

['ch-slope', 'ch-rating', 'ch-par'].forEach((id) => $(id).addEventListener('input', updateCourseHandicap));

$('export').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(rounds, null, 2)], { type: 'application/json' }));
  a.download = 'golf-rounds.json';
  a.click();
});

$('import').addEventListener('change', async (e) => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(data)) throw new Error();
    rounds = data.filter((r) => r.date && typeof r.differential === 'number')
      .map((r) => ({ ...r, course: String(r.course || ''), id: r.id ?? Date.now() + Math.random() }));
    save();
    render();
  } catch { alert('Could not import that file.'); }
  e.target.value = '';
});

// ---- CSV import ----
let importRows = [];
const FIELD_NAMES = { date: 'Date', course: 'Course', score: 'Score', rating: 'Rating', slope: 'Slope', holes: 'Holes', pcc: 'PCC' };

function currentMapping() {
  const m = {};
  document.querySelectorAll('.map-select').forEach((sel) => { m[sel.dataset.field] = +sel.value; });
  return m;
}
function importDefaults() {
  return { rating: +$('def-rating').value || 0, slope: +$('def-slope').value || 0 };
}
function previewImport() {
  const { rounds: ok, skipped } = rowsToRounds(importRows, currentMapping(), importDefaults());
  const why = [...new Set(skipped.map((s) => s.reason))].join(', ');
  $('import-summary').textContent = `${ok.length} round(s) ready to import.` +
    (skipped.length ? ` ${skipped.length} row(s) will be skipped (${why}).` : '');
  $('import-go').disabled = ok.length === 0;
}
function loadImportText(text) {
  const table = parseCSV(text);
  if (table.length < 2) { $('import-map').hidden = true; return; }
  const headers = table[0];
  importRows = table.slice(1);
  const guess = guessMapping(headers);
  $('map-fields').innerHTML = Object.entries(FIELD_NAMES).map(([f, label]) => `
    <label>${label}<select class="map-select" data-field="${f}">
      <option value="-1">— none —</option>
      ${headers.map((h, i) => `<option value="${i}" ${guess[f] === i ? 'selected' : ''}>${escapeHtml(h || 'Column ' + (i + 1))}</option>`).join('')}
    </select></label>`).join('');
  $('import-map').hidden = false;
  previewImport();
}
$('csv-file').addEventListener('change', async (e) => {
  if (e.target.files[0]) {
    const t = await e.target.files[0].text();
    $('csv-text').value = t;
    loadImportText(t);
  }
  e.target.value = '';
});
$('csv-text').addEventListener('input', (e) => loadImportText(e.target.value));
$('import-map').addEventListener('input', previewImport);
$('import-go').addEventListener('click', () => {
  const { rounds: ok } = rowsToRounds(importRows, currentMapping(), importDefaults());
  const seen = new Set(rounds.map((r) => `${r.date}|${r.course}|${r.score}|${r.holes || 18}`));
  let added = 0;
  ok.forEach((r) => {
    const key = `${r.date}|${r.course}|${r.score}|${r.holes}`;
    if (seen.has(key)) return;
    seen.add(key);
    rounds.push({ ...r, id: Date.now() + Math.random() });
    added++;
  });
  save();
  render();
  $('csv-text').value = '';
  $('import-map').hidden = true;
  alert(`Imported ${added} round(s)` + (added < ok.length ? `, ${ok.length - added} duplicate(s) skipped` : '') + '.');
});

render();
