import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { applyRatings } from '../scripts/apply-ratings.mjs';
import { matchPromise } from '../scripts/match-evidence.mjs';
const Core = createRequire(import.meta.url)('../js/core.js');

const official = { id: 'nc-14-m1', name: 'Tim Moore', party: 'R', state: 'NC', chamber: 'house' };
const vote = { id: 'h119-1-77', chamber: 'house', congress: 119, session: 1, roll: 77, date: '2025-03-04', bill: { congress: 119, type: 'hjres', number: '10', title: 'Congressional Term Limits Amendment', policyArea: 'Government Operations and Politics' }, question: 'On Passage', result: 'Failed', desc: 'Term limits', cast: 'Nay', sources: { official: 'https://clerk.house.gov/evs/2025/roll077.xml', voteview: 'https://voteview.com/rollcall/RH1190077' } };
const bill = { congress: 119, type: 'HJRES', number: '10', title: 'Congressional Term Limits Amendment', introduced: '2025-01-10', latestAction: 'Referred to committee.', latestActionDate: '2025-01-10', policyArea: 'Government Operations and Politics', url: 'https://www.congress.gov/bill/119th-congress/house-joint-resolution/10' };
const fresh = () => ({
  officials: [official], sources: [{ id: 'own-words' }], votes: [],
  promises: [{ id: 'nc-14-m1:1', officialId: 'nc-14-m1', category: 'government-reform', text: 'Signed a pledge to support congressional term limits.', status: 'unverifiable', evidence: [], howRated: 'x', source: { outletId: 'own-words', url: 'u', date: '2023-11-08' }, review: 'unreviewed' }],
});
const evidence = { 'nc-14-m1': { votes: [vote], legislation: { sponsored: [], cosponsored: [bill] } } };

test('a vote against the promised measure is recorded with two publishers and rated Broken', () => {
  const data = fresh();
  const { rated, problems } = applyRatings({ ratings: [{ promiseId: 'nc-14-m1:1', status: 'broken', rationale: 'Voted against the term-limits amendment he pledged to support.', votes: [{ id: 'h119-1-77', relation: 'contradicts', explain: 'This amendment sets congressional term limits, which the official pledged to support. The official voted no.' }], bills: [] }], evidence, data, today: '2026-10-18' });
  assert.deepStrictEqual(problems, []);
  assert.strictEqual(rated, 1);
  const p = data.promises[0];
  assert.deepStrictEqual(p.evidence.map((e) => e.outletId), ['house-clerk', 'voteview']);
  assert.strictEqual(Core.effectiveStatus(p).status, 'broken'); // two independent publishers
  assert.strictEqual(data.votes[0].byOfficial['nc-14-m1'], 'Nay');
  assert.strictEqual(Core.votesForPromise(p.id, 'nc-14-m1', data.votes)[0].relation, 'contradicts');
  assert.ok(data.sources.some((s) => s.id === 'voteview'));
  assert.deepStrictEqual(Core.validateData({ officials: data.officials, promises: data.promises, votes: data.votes, sources: data.sources, categories: [{ id: 'government-reform' }] }), []);
});
test('a Kept rating resting on one publisher is shown as Unverifiable', () => {
  const data = fresh();
  applyRatings({ ratings: [{ promiseId: 'nc-14-m1:1', status: 'kept', rationale: 'Cosponsored the amendment.', votes: [], bills: [{ congress: 119, type: 'hjres', number: '10', role: 'cosponsored', explain: '' }] }], evidence, data, today: 't' });
  assert.strictEqual(Core.effectiveStatus(data.promises[0]).status, 'unverifiable');
});
test('unknown votes and bills are reported, not silently accepted', () => {
  const data = fresh();
  const { problems } = applyRatings({ ratings: [{ promiseId: 'nc-14-m1:1', status: 'broken', rationale: 'r', votes: [{ id: 'h119-9-9', relation: 'contradicts', explain: 'e' }], bills: [{ congress: 119, type: 'hr', number: '1', role: 'sponsored' }] }], evidence, data, today: 't' });
  assert.strictEqual(problems.length, 2);
});
test('matchPromise finds votes by keyword and ranks passage votes first', () => {
  const r = matchPromise({ votes: [vote, { ...vote, id: 'x', question: 'On Motion to Recommit', desc: 'term limits motion', date: '2025-05-01' }], legislation: { sponsored: [], cosponsored: [bill] } }, { keywords: ['term limit'] });
  assert.strictEqual(r.votes[0].id, 'h119-1-77');
  assert.strictEqual(r.cosponsored.length, 1);
});
