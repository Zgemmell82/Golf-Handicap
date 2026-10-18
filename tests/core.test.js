const test = require('node:test');
const assert = require('node:assert');
const Core = require('../js/core.js');
const sources = [
  { id: 'gov', kind: 'primary', reliability: 'high', lean: 'n/a' },
  { id: 'wire', kind: 'news', reliability: 'high', lean: 'center' },
  { id: 'l', kind: 'news', reliability: 'medium', lean: 'left' },
  { id: 'r', kind: 'news', reliability: 'medium', lean: 'right' },
  { id: 'bad', kind: 'news', reliability: 'low', lean: 'right' },
];
const ev = (...ids) => ids.map((id) => ({ outletId: id, url: 'https://x/' + id }));
const mk = (status, ids, extra = {}) => ({ id: 'a:1', officialId: 'a', status, evidence: ev(...ids), ...extra });

test('Kept/Broken need two independent sources, else Unverifiable', () => {
  assert.strictEqual(Core.effectiveStatus(mk('kept', ['gov'])).status, 'unverifiable');
  assert.strictEqual(Core.effectiveStatus(mk('broken', ['gov', 'gov'])).status, 'unverifiable'); // same outlet twice
  assert.strictEqual(Core.effectiveStatus(mk('kept', ['gov', 'wire'])).status, 'kept');
  assert.strictEqual(Core.effectiveStatus(mk('progress', ['gov'])).status, 'progress');
  assert.ok(Core.effectiveStatus(mk('kept', ['gov'])).downgraded);
});
test('same rules regardless of party', () => {
  const p = mk('broken', ['gov', 'wire']);
  const a = Core.effectiveStatus(p);
  assert.deepStrictEqual(Core.effectiveStatus({ ...p, officialId: 'zzz' }), a);
});
test('confidence levels', () => {
  assert.strictEqual(Core.confidence(mk('kept', ['gov', 'wire']), sources).level, 'High');
  assert.strictEqual(Core.confidence(mk('kept', ['wire', 'l']), sources).level, 'Medium');
  assert.strictEqual(Core.confidence(mk('kept', ['gov']), sources).level, 'Low');
  assert.strictEqual(Core.confidence(mk('kept', ['gov', 'bad']), sources).level, 'Medium');
});
test('contested rating without cross-spectrum sources is capped at Medium', () => {
  assert.strictEqual(Core.confidence(mk('kept', ['gov', 'wire'], { contested: true }), sources).level, 'Medium');
  assert.strictEqual(Core.confidence(mk('kept', ['gov', 'l', 'r'], { contested: true }), sources).level, 'High');
});
test('scorecard percentages use effective statuses', () => {
  const sc = Core.scorecard([mk('kept', ['gov', 'wire']), mk('kept', ['gov']), mk('progress', ['gov']), mk('broken', ['gov', 'l'])]);
  assert.deepStrictEqual(sc.counts, { kept: 1, partial: 0, broken: 1, progress: 1, unverifiable: 1 });
  assert.strictEqual(sc.pct.kept, 25);
});
test('bias check counts by party', () => {
  const offs = [{ id: 'a', party: 'D' }, { id: 'b', party: 'R' }];
  const ps = [mk('kept', ['gov', 'wire']), { ...mk('broken', ['gov', 'wire']), officialId: 'b', id: 'b:1' }];
  const rows = Core.biasCheck(offs, ps);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows.find((r) => r.party === 'D').kept, 1);
  assert.strictEqual(rows.find((r) => r.party === 'R').broken, 1);
});
test('conflict flag needs both thresholds and uses neutral wording', () => {
  const o = { id: 'a' };
  const p = [{ id: 'a:1', officialId: 'a', text: 'Lower drug costs', opposesIndustries: ['pharma'] }];
  const fin = { cycle: '2024', totalRaised: 1000000, industries: [{ id: 'pharma', name: 'Pharmaceuticals', amount: 100000 }] };
  const c = Core.conflicts(o, p, fin);
  assert.strictEqual(c.length, 1);
  assert.match(c[0].text, /^Possible conflict, here is the data/);
  assert.strictEqual(Core.conflicts(o, p, { ...fin, industries: [{ id: 'pharma', name: 'P', amount: 10000 }] }).length, 0); // under amount
  assert.strictEqual(Core.conflicts(o, p, { ...fin, totalRaised: 10000000 }).length, 0); // under share
});
test('alerts only for favorited officials, linked votes, after date', () => {
  const votes = [{ id: 'v', date: '2026-10-01', byOfficial: { a: 'Nay' }, promiseLinks: [{ promiseId: 'a:1', relation: 'contradicts', explain: 'x' }] }];
  assert.strictEqual(Core.alertsFor(['a'], votes, '2026-09-01').length, 1);
  assert.strictEqual(Core.alertsFor(['a'], votes, '2026-10-02').length, 0);
  assert.strictEqual(Core.alertsFor(['b'], votes, '2026-09-01').length, 0);
});
test('validateData rejects loaded language and missing sources', () => {
  const base = { officials: [{ id: 'a' }], votes: [], sources: [{ id: 'gov' }], categories: [{ id: 'x' }] };
  const good = { id: 'a:1', officialId: 'a', category: 'x', status: 'kept', text: 'Cut taxes', howRated: 'ok', source: { url: 'u', date: 'd', outletId: 'gov' }, evidence: [] };
  assert.deepStrictEqual(Core.validateData({ ...base, promises: [good] }), []);
  assert.ok(Core.validateData({ ...base, promises: [{ ...good, howRated: 'He lied about it' }] }).length);
  assert.ok(Core.validateData({ ...base, promises: [{ ...good, source: null }] }).length);
});

test('topDonor returns the largest donor group and its share of money raised', () => {
  const Core = require('../js/core.js');
  const t = Core.topDonor({ totalRaised: 1000, employers: [{ name: 'A', amount: 50 }, { name: 'B', amount: 20 }] });
  assert.equal(t.name, 'A'); assert.equal(t.pct, 5); assert.equal(t.kind, 'employer');
  assert.equal(Core.topDonor({ totalRaised: 1000, employers: [] }), null);
  assert.equal(Core.topDonor(undefined), null);
  assert.equal(Core.topDonor({ totalRaised: 1000, pacs: [{ name: 'P', amount: 300 }], employers: [{ name: 'A', amount: 50 }] }).kind, 'organization');
});
