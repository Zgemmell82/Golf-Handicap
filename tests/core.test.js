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
// Kept needs a matching vote and Broken a contradicting one, so verdict fixtures carry vote evidence.
const voted = (status, ids, extra = {}) => { const p = mk(status, ids, extra); p.evidence = p.evidence.map((e) => ({ ...e, type: 'vote', supports: status === 'broken' ? 'contradicts' : 'consistent' })); return p; };

test('Kept/Broken need two independent sources, else Unverifiable', () => {
  assert.strictEqual(Core.effectiveStatus(mk('kept', ['gov'])).status, 'unverifiable');
  assert.strictEqual(Core.effectiveStatus(mk('broken', ['gov', 'gov'])).status, 'unverifiable'); // same outlet twice
  assert.strictEqual(Core.effectiveStatus(voted('kept', ['gov', 'wire'])).status, 'kept');
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
  const sc = Core.scorecard([voted('kept', ['gov', 'wire']), voted('kept', ['gov']), mk('progress', ['gov']), voted('broken', ['gov', 'l'])]);
  assert.deepStrictEqual(sc.counts, { kept: 1, partial: 0, broken: 1, progress: 1, unverifiable: 1 });
  assert.strictEqual(sc.pct.kept, 25);
});
test('bias check counts by party', () => {
  const offs = [{ id: 'a', party: 'D' }, { id: 'b', party: 'R' }];
  const ps = [voted('kept', ['gov', 'wire']), { ...voted('broken', ['gov', 'wire']), officialId: 'b', id: 'b:1' }];
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

test('Kept and Broken must rest on a recorded vote, not on bills or articles alone', () => {
  assert.strictEqual(Core.effectiveStatus(mk('kept', ['gov', 'wire'])).status, 'unverifiable'); // two sources, no vote
  assert.match(Core.effectiveStatus(mk('kept', ['gov', 'wire'])).reason, /recorded vote/);
  assert.strictEqual(Core.effectiveStatus(voted('kept', ['gov', 'wire'])).status, 'kept');
  const wrongWay = voted('kept', ['gov', 'wire']); wrongWay.evidence.forEach((e) => { e.supports = 'contradicts'; });
  assert.strictEqual(Core.effectiveStatus(wrongWay).status, 'unverifiable'); // votes point the other way
  assert.strictEqual(Core.effectiveStatus(voted('broken', ['gov', 'wire'])).status, 'broken');
  assert.strictEqual(Core.effectiveStatus(mk('progress', ['gov'])).status, 'progress'); // other statuses unaffected
});

test('donorAlignment sums only donors whose organization has a documented position on that vote', () => {
  const fin = { totalRaised: 100000, pacs: [{ name: 'CLUB FOR GROWTH PAC', amount: 10000 }, { name: 'AFL-CIO COPE', amount: 4000 }, { name: 'UNRELATED PAC', amount: 9000 }], employers: [] };
  const pos = [
    { org: 'Club for Growth', patterns: ['CLUB FOR GROWTH'], voteIds: ['v1'], position: 'support', url: 'https://x/a' },
    { org: 'AFL-CIO', patterns: ['AFL-CIO'], voteIds: ['v1'], position: 'oppose', url: 'https://x/b' },
    { org: 'Club for Growth', patterns: ['CLUB FOR GROWTH'], voteIds: ['v2'], position: 'support', url: 'https://x/c' },
  ];
  const a = Core.donorAlignment(fin, pos, 'v1', 'Yea');
  assert.strictEqual(a.supportAmount, 10000); assert.strictEqual(a.opposeAmount, 4000);
  assert.strictEqual(a.supportPct, 10); assert.strictEqual(a.opposePct, 4);
  assert.strictEqual(a.moneyFavors, 'support'); assert.strictEqual(a.votedWithMoney, true);
  assert.strictEqual(Core.donorAlignment(fin, pos, 'v1', 'Nay').votedWithMoney, false);
  assert.strictEqual(Core.donorAlignment(fin, pos, 'v9', 'Yea'), null); // no documented positions on that vote
  assert.strictEqual(Core.donorAlignment({ totalRaised: 0 }, pos, 'v1', 'Yea'), null);
  assert.strictEqual(Core.donorAlignment({ totalRaised: 1000, pacs: [] }, pos, 'v1', 'Yea').votedWithMoney, null); // no donors on either side
});
test('donorSummary reports overlap with documented donor money next to overlap with party', () => {
  const offs = [{ id: 'a', party: 'R' }, { id: 'b', party: 'R' }, { id: 'c', party: 'D' }];
  const fin = { a: { totalRaised: 1000, pacs: [{ name: 'PRO PAC', amount: 100 }] }, b: { totalRaised: 1000, pacs: [{ name: 'PRO PAC', amount: 100 }] }, c: { totalRaised: 1000, pacs: [{ name: 'CON PAC', amount: 100 }] } };
  const pos = [{ org: 'Pro', patterns: ['PRO PAC'], voteIds: ['v'], position: 'support' }, { org: 'Con', patterns: ['CON PAC'], voteIds: ['v'], position: 'oppose' }];
  const s = Core.donorSummary(offs, [{ id: 'v', byOfficial: { a: 'Yea', b: 'Nay', c: 'Nay' } }], fin, pos);
  assert.strictEqual(s.pairs.length, 3);
  assert.strictEqual(s.withMoney.withCount, 2); // a yea with support money, c nay with oppose money; b nay against support money
  assert.strictEqual(s.withMoney.n, 3);
});
