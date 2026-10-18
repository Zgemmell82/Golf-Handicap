// Applies reviewed rating proposals: links votes and bills to promises as evidence and sets statuses.
//   node scripts/apply-ratings.mjs <ratings.json> <evidenceDir> [--dry-run]
// ratings.json: [ { promiseId, status, rationale, votes:[{id, relation:'consistent'|'contradicts', explain}],
//                   bills:[{congress,type,number,role:'sponsored'|'cosponsored', explain}] } ]
// A Kept/Broken status still needs two independent publishers; core.js downgrades it to Unverifiable otherwise.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readData, writeData } from './lib.mjs';

const Core = createRequire(import.meta.url)('../js/core.js');
const TYPE = { hr: 'H.R.', hres: 'H.Res.', hjres: 'H.J.Res.', hconres: 'H.Con.Res.', s: 'S.', sres: 'S.Res.', sjres: 'S.J.Res.', sconres: 'S.Con.Res.' };
const billLabel = (b) => `${TYPE[b.type.toLowerCase()] || b.type} ${b.number}`;
const read = (f, fb) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fb);

export const OUTLETS = [
  { id: 'house-clerk', name: 'Clerk of the House (roll-call votes)', kind: 'primary', reliability: 'high', lean: 'n/a', note: 'Official record of House roll-call votes.' },
  { id: 'senate-gov', name: 'U.S. Senate (roll-call votes)', kind: 'primary', reliability: 'high', lean: 'n/a', note: 'Official record of Senate roll-call votes.' },
  { id: 'voteview', name: 'Voteview (UCLA)', kind: 'primary', reliability: 'high', lean: 'n/a', note: 'Independent research database of every congressional roll-call vote.' },
  { id: 'congress-gov', name: 'Congress.gov', kind: 'primary', reliability: 'high', lean: 'n/a', note: 'Official record of bills, sponsors and actions.' },
];

const castText = (c) => (c === 'Yea' ? 'voted yes' : c === 'Nay' ? 'voted no' : `was recorded as ${c}`);

export function applyRatings({ ratings, evidence, data, today }) {
  const problems = [];
  OUTLETS.forEach((o) => { if (!data.sources.some((s) => s.id === o.id)) data.sources.push(o); });
  const promisesById = Object.fromEntries(data.promises.map((p) => [p.id, p]));
  const voteById = Object.fromEntries(data.votes.map((v) => [v.id, v]));
  const officialsByBio = Object.fromEntries(data.officials.map((o) => [o.id, o]));
  let rated = 0;

  for (const r of ratings) {
    const p = promisesById[r.promiseId];
    if (!p) { problems.push(`${r.promiseId}: unknown promise`); continue; }
    const ev = evidence[p.officialId] || { votes: [], legislation: { sponsored: [], cosponsored: [] } };
    const evidenceItems = [];
    const lines = [];
    for (const lv of r.votes || []) {
      const v = ev.votes.find((x) => x.id === lv.id);
      if (!v) { problems.push(`${r.promiseId}: vote ${lv.id} not in the gathered evidence`); continue; }
      const billText = v.bill ? `${billLabel(v.bill)}${v.bill.title ? ' (' + v.bill.title + ')' : ''}` : v.desc;
      const chamberOutlet = v.chamber === 'house' ? 'house-clerk' : 'senate-gov';
      const supports = lv.relation === 'consistent' ? 'consistent' : 'contradicts';
      evidenceItems.push({ type: 'vote', label: `Roll call ${v.roll}, ${v.date}: ${v.question} on ${billText}. ${data.officials.find((o) => o.id === p.officialId).name} ${castText(v.cast)}.`, url: v.sources.official, outletId: chamberOutlet, date: v.date, supports });
      evidenceItems.push({ type: 'vote', label: `Same vote as recorded by Voteview (independent database): ${castText(v.cast)}.`, url: v.sources.voteview, outletId: 'voteview', date: v.date, supports });
      lines.push(`${v.date}: ${castText(v.cast)} on ${billText} (${v.question.toLowerCase()}, ${String(v.result).toLowerCase()}). ${lv.explain}`);
      // vote record shown on the profile and in alerts
      let rec = voteById[v.id];
      if (!rec) {
        rec = { id: v.id, date: v.date, chamber: v.chamber, rollCall: v.roll, billId: v.bill ? billLabel(v.bill) : 'Procedural vote', title: (v.bill && v.bill.title) || v.desc, question: v.question, result: v.result, byOfficial: {}, issues: [], outletId: chamberOutlet, url: v.sources.official, promiseLinks: [] };
        data.votes.push(rec); voteById[v.id] = rec;
      }
      for (const [oid, e] of Object.entries(evidence)) { const x = e.votes.find((y) => y.id === v.id); if (x) rec.byOfficial[oid] = x.cast; }
      if (!rec.promiseLinks.some((l) => l.promiseId === p.id)) rec.promiseLinks.push({ promiseId: p.id, relation: lv.relation, explain: lv.explain });
    }
    for (const lb of r.bills || []) {
      const list = ev.legislation[lb.role] || [];
      const b = list.find((x) => x.congress === lb.congress && x.type.toLowerCase() === lb.type.toLowerCase() && String(x.number) === String(lb.number));
      if (!b) { problems.push(`${r.promiseId}: bill ${lb.type}${lb.number} not in ${lb.role} list`); continue; }
      evidenceItems.push({ type: 'bill', label: `${billLabel(b)}: ${b.title} (${lb.role} by ${data.officials.find((o) => o.id === p.officialId).name}; latest action ${b.latestActionDate}: ${b.latestAction})`, url: b.url, outletId: 'congress-gov', date: b.introduced, supports: 'context' });
      lines.push(`${billLabel(b)} (${lb.role}): ${b.title}. Latest action: ${b.latestAction} ${lb.explain || ''}`.trim());
    }
    p.status = r.status;
    p.evidence = evidenceItems;
    p.howRated = `${r.rationale} ${lines.length ? 'What the record shows: ' + lines.join(' ') : ''}`.trim();
    p.statusNote = '';
    p.reviewedOn = today;
    p.review = 'unreviewed (automated rating; votes checked against two publishers)';
    rated++;
  }
  return { rated, problems };
}

function main() {
  const [ratingsFile, evDir] = process.argv.slice(2);
  const today = new Date().toISOString().slice(0, 10);
  const data = { officials: readData('officials', []), promises: readData('promises', []), sources: readData('sources', []), votes: readData('votes', []) };
  const evidence = {};
  for (const o of data.officials) {
    const vf = join(evDir, `votes-${o.id}.json`);
    if (existsSync(vf)) evidence[o.id] = { votes: read(vf, []), legislation: read(join(evDir, `legislation-${o.id}.json`), { sponsored: [], cosponsored: [] }) };
  }
  const ratings = JSON.parse(readFileSync(ratingsFile, 'utf8'));
  const { rated, problems } = applyRatings({ ratings, evidence, data, today });
  console.log(`${rated} promise(s) updated.`);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  if (!process.argv.includes('--dry-run')) { writeData('promises', data.promises); writeData('sources', data.sources); writeData('votes', data.votes); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
