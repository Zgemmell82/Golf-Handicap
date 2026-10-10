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
      <td>${r.date}</td><td>${escapeHtml(r.course)}</td><td>${r.score}</td>
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
  render();
});

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

render();
