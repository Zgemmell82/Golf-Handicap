import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { findPublishedDate, focusText } from '../scripts/research-lib.mjs';
import { applyCandidates } from '../scripts/apply-candidates.mjs';
const Core = createRequire(import.meta.url)('../js/core.js');

test('findPublishedDate reads meta, JSON-LD, time tags, URL paths and archive stamps', () => {
  assert.strictEqual(findPublishedDate('<meta property="article:published_time" content="2022-10-12T08:00:00-04:00">', 'https://x.com/a'), '2022-10-12');
  assert.strictEqual(findPublishedDate('<script type="application/ld+json">{"datePublished":"2020-03-04"}</script>', 'https://x.com/a'), '2020-03-04');
  assert.strictEqual(findPublishedDate('<time datetime="2019-07-01">July 1</time>', 'https://x.com/a'), '2019-07-01');
  assert.strictEqual(findPublishedDate('<p>no date</p>', 'https://news.example/2021/09/30/story'), '2021-09-30');
  assert.strictEqual(findPublishedDate('<p>no date</p>', 'https://web.archive.org/web/20200815000000/https://x.com/issues'), '2020-08-15');
  assert.strictEqual(findPublishedDate('<p>no date</p>', 'https://x.com/about'), null);
});
test('focusText keeps commitments and lines naming the official, drops the rest', () => {
  const text = ['Home | Menu | Contact | Donate | Volunteer | Events', 'I will fight for lower prescription drug costs for every family in our district.', 'Smith visited the county fair on Saturday and met with local farmers there.', 'Copyright 2022 all rights reserved terms and conditions privacy'].join('\n');
  const f = focusText(text, 'smith');
  assert.match(f, /lower prescription drug costs/);
  assert.match(f, /county fair/);
  assert.doesNotMatch(f, /Copyright/);
});

const official = { id: 'nc-01-x', name: 'Pat Smith', contact: { website: 'https://smith.house.gov' } };
const page = { ok: true, officialId: 'nc-01-x', url: 'https://smithforcongress.com/issues', title: 'Issues', date: '2022-09-01', text: 'Pat Smith on the issues.\nI will fight to lower prescription drug costs for seniors in North Carolina.\nI will also oppose any cuts to rural hospitals.' };
const mk = (over) => ({ officialId: 'nc-01-x', url: page.url, quote: 'I will fight to lower prescription drug costs for seniors', paraphrase: 'Will work to lower drug costs for seniors.', category: 'healthcare', sourceType: 'campaign-site', ...over });
const fresh = () => ({ officials: [official], promises: [], sources: [], categories: [{ id: 'healthcare' }, { id: 'other' }], log: {} });

test('applyCandidates accepts verified quotes and rejects everything else with a reason', () => {
  const data = fresh();
  const candidates = [
    mk({}),
    mk({ quote: 'I will end all federal spending on hospitals immediately' }), // not on the page
    mk({ url: 'https://elsewhere.org/x' }), // page was never downloaded
    mk({ quote: 'I will also oppose any cuts to rural hospitals', paraphrase: 'He lied about hospitals.' }), // loaded wording
    mk({ officialId: 'nobody' }),
  ];
  const { accepted, rejected } = applyCandidates({ candidates, pages: { [`nc-01-x|${page.url}`]: page }, data, today: '2026-10-17' });
  assert.strictEqual(accepted, 1);
  assert.deepStrictEqual(rejected.map((r) => r.reason), ['quote is not word-for-word on the page', 'page was not downloaded', 'paraphrase missing or not neutral', 'unknown official']);
  assert.strictEqual(data.promises[0].source.date, '2022-09-01');
  assert.strictEqual(data.promises[0].status, 'unverifiable');
  assert.deepStrictEqual(Core.validateData({ officials: [official], promises: data.promises, votes: [], sources: data.sources, categories: data.categories }), []);
  assert.strictEqual(data.log['nc-01-x'].promisesAdded, 1);
});
test('undated pages and duplicates are rejected', () => {
  const data = fresh();
  const undated = { ...page, date: null };
  assert.strictEqual(applyCandidates({ candidates: [mk({})], pages: { [`nc-01-x|${page.url}`]: undated }, data, today: 't' }).rejected[0].reason, 'page has no verifiable date');
  applyCandidates({ candidates: [mk({})], pages: { [`nc-01-x|${page.url}`]: page }, data, today: 't' });
  assert.strictEqual(applyCandidates({ candidates: [mk({})], pages: { [`nc-01-x|${page.url}`]: page }, data, today: 't' }).rejected[0].reason, 'duplicate');
});
