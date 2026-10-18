// Prints the votes and bills that match each promise's topic keywords, so a person (or Claude) can judge
// which ones bear on the promise. Reads the output of gather-evidence.mjs.
//   node scripts/match-evidence.mjs <evidenceDir> <queries.json> [--max 40]
// queries.json: { "<promiseId>": { "keywords": ["drug", "prescription"], "since": "2021-01-01" } }
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (f, fb) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fb);
const label = (b) => `${{ hr: 'H.R.', hres: 'H.Res.', hjres: 'H.J.Res.', hconres: 'H.Con.Res.', s: 'S.', sres: 'S.Res.', sjres: 'S.J.Res.', sconres: 'S.Con.Res.' }[b.type.toLowerCase()] || b.type} ${b.number}`;

export function matches(text, keywords) {
  const t = String(text).toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

export function matchPromise({ votes, legislation }, { keywords, since = '0000' }, max = 40) {
  const v = votes.filter((x) => x.date >= since && matches([x.desc, x.document, x.bill && x.bill.title, x.bill && x.bill.policyArea].join(' '), keywords) && x.cast !== 'Not Voting' && x.cast !== 'Present')
    // final-passage style questions first: they say the most about what a member supports
    .sort((a, b) => (/passage|agree|concur|adopt/i.test(b.question) ? 1 : 0) - (/passage|agree|concur|adopt/i.test(a.question) ? 1 : 0) || (a.date < b.date ? 1 : -1))
    .slice(0, max);
  const pick = (list) => list.filter((b) => b.introduced >= since && matches([b.title, b.policyArea].join(' '), keywords)).slice(0, max);
  return { votes: v, sponsored: pick(legislation.sponsored), cosponsored: pick(legislation.cosponsored) };
}

function main() {
  const [dir, queriesFile] = process.argv.slice(2);
  const max = Number((process.argv.indexOf('--max') >= 0 && process.argv[process.argv.indexOf('--max') + 1]) || 40);
  const queries = JSON.parse(readFileSync(queriesFile, 'utf8'));
  for (const [promiseId, q] of Object.entries(queries)) {
    const officialId = promiseId.split(':')[0];
    const votes = read(join(dir, `votes-${officialId}.json`), []);
    const legislation = read(join(dir, `legislation-${officialId}.json`), { sponsored: [], cosponsored: [] });
    const r = matchPromise({ votes, legislation }, q, max);
    console.log(`\n######## ${promiseId}  keywords: ${q.keywords.join(', ')}`);
    console.log(`-- votes (${r.votes.length})`);
    r.votes.forEach((x) => console.log(`${x.id} | ${x.date} | ${x.cast.toUpperCase()} | ${x.bill ? label(x.bill) : '-'} | ${x.question} | ${x.result} | ${(x.bill && x.bill.title) || x.desc}`.slice(0, 260)));
    console.log(`-- sponsored (${r.sponsored.length})`);
    r.sponsored.forEach((b) => console.log(`${label(b)} | ${b.introduced} | ${b.title.slice(0, 120)} | ${b.latestAction.slice(0, 80)}`));
    console.log(`-- cosponsored (${r.cosponsored.length})`);
    r.cosponsored.forEach((b) => console.log(`${label(b)} | ${b.introduced} | ${b.title.slice(0, 120)} | ${b.latestAction.slice(0, 80)}`));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
