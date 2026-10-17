import test from 'node:test';
import assert from 'node:assert';
import { parseCsv, pool } from '../scripts/lib.mjs';
import { castFromVoteview, normCast, parseClerkVotes, clerkMeta, parseSenateVotes, senateMeta, parseBillNumber } from '../scripts/gather-evidence.mjs';

test('parseCsv handles quoted commas and quotes', () => {
  assert.deepStrictEqual(parseCsv('a,b\n"x, ""y""",2\n'), [['a', 'b'], ['x, "y"', '2']]);
});
test('pool keeps order and limits concurrency', async () => {
  let active = 0, peak = 0;
  const out = await pool([1, 2, 3, 4, 5, 6], 2, async (n) => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return n * 2; });
  assert.deepStrictEqual(out, [2, 4, 6, 8, 10, 12]);
  assert.ok(peak <= 2);
});
test('Voteview cast codes and official labels map to Yea/Nay', () => {
  assert.strictEqual(castFromVoteview('1'), 'Yea');
  assert.strictEqual(castFromVoteview('6'), 'Nay');
  assert.strictEqual(castFromVoteview('9'), 'Not Voting');
  assert.strictEqual(castFromVoteview('0'), null);
  assert.strictEqual(normCast('Aye'), 'Yea');
  assert.strictEqual(normCast('No'), 'Nay');
  assert.strictEqual(normCast('Not Voting'), 'Not Voting');
});
test('Clerk XML: member votes and metadata', () => {
  const xml = '<rollcall-vote><vote-metadata><legis-num>H R 382</legis-num><vote-question>On Passage</vote-question><vote-result>Passed</vote-result><vote-desc>Pandemic is Over Act</vote-desc></vote-metadata><vote-data><recorded-vote><legislator name-id="A000370" sort-field="Adams" party="D" state="NC" role="legislator">Adams</legislator><vote>No</vote></recorded-vote><recorded-vote><legislator name-id="F000450" party="R" state="NC" role="legislator">Foxx</legislator><vote>Aye</vote></recorded-vote></vote-data></rollcall-vote>';
  assert.deepStrictEqual(parseClerkVotes(xml), { A000370: 'Nay', F000450: 'Yea' });
  assert.strictEqual(clerkMeta(xml).desc, 'Pandemic is Over Act');
});
test('Senate XML: votes keyed by state and surname', () => {
  const xml = '<roll_call_vote><vote_question_text>On the Cloture Motion PN89</vote_question_text><vote_result_text>Cloture Motion Agreed to (50-45)</vote_result_text><vote_title>Motion to Invoke Cloture</vote_title><members><member><member_full>Tillis (R-NC)</member_full><last_name>Tillis</last_name><first_name>Thom</first_name><party>R</party><state>NC</state><vote_cast>Yea</vote_cast></member><member><last_name>Kaine</last_name><state>VA</state><vote_cast>Not Voting</vote_cast></member></members></roll_call_vote>';
  assert.deepStrictEqual(parseSenateVotes(xml), { 'NC|tillis': 'Yea', 'VA|kaine': 'Not Voting' });
  assert.match(senateMeta(xml).question, /Cloture/);
});
test('Voteview bill numbers', () => {
  assert.deepStrictEqual(parseBillNumber('HR3424'), { type: 'hr', number: '3424' });
  assert.deepStrictEqual(parseBillNumber('HJRES12'), { type: 'hjres', number: '12' });
  assert.strictEqual(parseBillNumber(''), null);
});
