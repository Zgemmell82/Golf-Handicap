import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { htmlToText, normalize, quoteInText, parseWayback, outletHost, sourceDate, surname, nextPromiseNumber, ensureOutlet } from '../scripts/research-lib.mjs';
import { researchOfficial } from '../scripts/research-promises.mjs';
const Core = createRequire(import.meta.url)('../js/core.js');

test('htmlToText strips markup, scripts and entities', () => {
  const t = htmlToText('<html><head><style>p{}</style></head><body><script>x()</script><p>I will fight for &ldquo;lower costs&rdquo; &amp; jobs.</p><p>Second.</p></body></html>');
  assert.strictEqual(t, 'I will fight for “lower costs” & jobs.\nSecond.');
});
test('quoteInText needs a word-for-word match, tolerating quotes, dashes and spacing only', () => {
  const page = 'Here is my plan.  I will  cut taxes for small businesses — and “oppose” new fees on families.';
  assert.ok(quoteInText('I will cut taxes for small businesses - and "oppose" new fees on families.', page));
  assert.ok(!quoteInText('I will cut taxes for every small business and oppose new fees.', page)); // paraphrase
  assert.ok(!quoteInText('I will cut taxes', page)); // too short to count
});
test('wayback urls give the snapshot date and the real outlet', () => {
  const u = 'https://web.archive.org/web/20221001123456/https://www.kiggansforcongress.com/issues';
  assert.deepStrictEqual(parseWayback(u), { snapshotDate: '2022-10-01', original: 'https://www.kiggansforcongress.com/issues' });
  assert.strictEqual(outletHost(u), 'kiggansforcongress.com');
  assert.strictEqual(sourceDate(u, null, null), '2022-10-01');
  assert.strictEqual(sourceDate('https://x.com/a', 'October 12, 2022', null), '2022-10-12');
  assert.strictEqual(sourceDate('https://x.com/a', null, 'not a date'), null);
});
test('surname ignores suffixes and nicknames', () => {
  assert.strictEqual(surname('Robert C. "Bobby" Scott'), 'Scott');
  assert.strictEqual(surname('Donald S. Beyer, Jr.'), 'Beyer');
});

// ---- the whole flow with a stub model: hallucinated quotes must be dropped ----
const PAGE = '<p>Alex Test for Congress.</p><p>I will cut taxes for small businesses in our district and I will oppose any new fees on working families.</p>';
const official = { id: 'oh-02-x1', name: 'Alex Test', chamber: 'house', state: 'OH', district: '02', firstElected: 2018, contact: { website: 'https://test.house.gov' } };
const stubClient = {
  messages: {
    create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://example.org/issues', title: 'Issues', page_age: 'September 1, 2020' }, { type: 'web_search_result', url: 'https://other.example/nope', title: 'Missing', page_age: null }] }] }),
    parse: async () => ({ parsed_output: { promises: [
      { quote: 'I will cut taxes for small businesses in our district', paraphrase: 'Will cut taxes for small businesses.', category: 'taxes', source_type: 'campaign-site', published_date: null },
      { quote: 'I will eliminate the national debt within one year of taking office', paraphrase: 'Will eliminate the national debt.', category: 'economy', source_type: 'campaign-site', published_date: null }, // not on the page
      { quote: 'I will oppose any new fees on working families', paraphrase: 'Is a liar about fees.', category: 'taxes', source_type: 'campaign-site', published_date: null }, // loaded wording
    ] } }),
  },
};
const fetchImpl = async (url) => (url.includes('example.org')
  ? { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => PAGE }
  : { ok: false, status: 404, headers: { get: () => '' }, text: async () => '' });

test('researchOfficial keeps only verified, dated, neutral promises', async () => {
  const data = { promises: [], sources: [{ id: 'congress-gov' }], categories: [{ id: 'taxes' }, { id: 'economy' }, { id: 'other' }], log: {} };
  const n = await researchOfficial({ client: stubClient, official, data, today: '2026-10-17', fetchImpl, log: () => {} });
  assert.strictEqual(n, 1);
  const p = data.promises[0];
  assert.strictEqual(p.id, 'oh-02-x1:1');
  assert.strictEqual(p.status, 'unverifiable');
  assert.strictEqual(p.source.date, '2020-09-01');
  assert.strictEqual(p.source.outletId, 'example-org');
  assert.deepStrictEqual(p.evidence, []);
  assert.match(p.review, /^unreviewed/);
  assert.ok(data.sources.some((s) => s.id === 'example-org' && s.reliability === 'unrated'));
  assert.strictEqual(data.log['oh-02-x1'].promisesAdded, 1);
  // The records it writes pass the project's own data rules.
  const errors = Core.validateData({ officials: [official], promises: data.promises, votes: [], sources: data.sources, categories: data.categories });
  assert.deepStrictEqual(errors, []);
});
test('researching twice does not duplicate promises', async () => {
  const data = { promises: [], sources: [], categories: [{ id: 'taxes' }, { id: 'other' }], log: {} };
  await researchOfficial({ client: stubClient, official, data, today: '2026-10-17', fetchImpl, log: () => {} });
  await researchOfficial({ client: stubClient, official, data, today: '2026-10-18', fetchImpl, log: () => {} });
  assert.strictEqual(data.promises.length, 1);
  assert.strictEqual(nextPromiseNumber(data.promises, official.id), 2);
});
test('ensureOutlet marks the official\'s own site as primary', () => {
  const sources = [];
  ensureOutlet(sources, { outletId: 'test-house-gov', host: 'test.house.gov' }, 'test.house.gov');
  assert.strictEqual(sources[0].kind, 'primary');
});
