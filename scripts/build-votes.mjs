// Builds data/votes.json from the Congress.gov House roll-call vote endpoints.
//   CONGRESS_API_KEY=... node scripts/build-votes.mjs [--count 60] [--congress 119]
// Keeps the most recent N House votes. Votes that already have promiseLinks are always kept.
// The Senate is not included: Congress.gov does not offer Senate roll-call votes yet.
import { fileURLToPath } from 'node:url';
import { getJson, readData, writeData } from './lib.mjs';

const BASE = 'https://api.congress.gov/v3';
const BILL_LABEL = { HR: 'H.R.', HRES: 'H.Res.', HJRES: 'H.J.Res.', HCONRES: 'H.Con.Res.', S: 'S.', SRES: 'S.Res.', SJRES: 'S.J.Res.' };
const billLabel = (type, num) => (type ? `${BILL_LABEL[type] || type} ${num}` : 'Procedural vote');

// listItem: an entry of houseRollCallVotes; results: houseRollCallVoteMemberVotes.results.
// The House records the same two answers as Aye/No on voice-style votes and Yea/Nay on roll calls.
const CAST = { Aye: 'Yea', No: 'Nay' };

export function buildVote(listItem, results, bioguideToId, title, question) {
  const byOfficial = {};
  results.forEach((r) => { const id = bioguideToId[r.bioguideID]; if (id && r.voteCast) byOfficial[id] = CAST[r.voteCast] || r.voteCast; });
  return {
    id: `h${listItem.congress}-${listItem.sessionNumber}-${listItem.rollCallNumber}`,
    date: String(listItem.startDate).slice(0, 10),
    chamber: 'house',
    rollCall: listItem.rollCallNumber,
    billId: billLabel(listItem.legislationType, listItem.legislationNumber),
    title: title || billLabel(listItem.legislationType, listItem.legislationNumber),
    question: question || listItem.voteType || '',
    result: listItem.result || '',
    byOfficial,
    issues: [],
    outletId: 'congress-gov',
    url: listItem.legislationUrl || listItem.sourceDataURL,
    promiseLinks: [],
  };
}

async function listVotes(congress, session, key) {
  const out = [];
  for (let offset = 0; ; offset += 250) {
    const j = await getJson(`${BASE}/house-vote/${congress}/${session}?limit=250&offset=${offset}&format=json&api_key=${key}`, { keys: [key] });
    const page = j.houseRollCallVotes || [];
    out.push(...page);
    if (!j.pagination || !j.pagination.next || !page.length) break;
  }
  return out;
}

async function main() {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) { console.error('CONGRESS_API_KEY is not set.'); process.exit(1); }
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const count = Number(opt('--count', 60));
  const congress = Number(opt('--congress', 119));

  const officials = readData('officials', []);
  const bioguideToId = Object.fromEntries(officials.filter((o) => o.bioguide).map((o) => [o.bioguide, o.id]));
  if (!Object.keys(bioguideToId).length) throw new Error('data/officials.json has no officials; run the roster script first.');

  const all = [];
  for (const session of [2, 1]) {
    try { all.push(...await listVotes(congress, session, key)); } catch (e) { console.log(`session ${session}: ${e.message}`); }
  }
  if (!all.length) throw new Error('No votes returned; refusing to overwrite data/votes.json.');
  const recent = all.sort((a, b) => (a.startDate < b.startDate ? 1 : -1)).slice(0, count);

  const votes = [];
  for (const item of recent) {
    const mem = await getJson(`${BASE}/house-vote/${item.congress}/${item.sessionNumber}/${item.rollCallNumber}/members?format=json&api_key=${key}`, { keys: [key] });
    const detail = mem.houseRollCallVoteMemberVotes || {};
    const results = detail.results || [];
    let title = null;
    if (item.legislationType && item.legislationNumber) {
      try {
        const b = await getJson(`${BASE}/bill/${item.congress}/${item.legislationType.toLowerCase()}/${item.legislationNumber}?format=json&api_key=${key}`, { keys: [key], tries: 2 });
        title = b.bill && b.bill.title;
      } catch { /* keep the bill number as the title */ }
    }
    votes.push(buildVote(item, results, bioguideToId, title, detail.voteQuestion));
  }

  // Keep older votes only if they carry promise links, and keep links on refreshed votes.
  const existing = readData('votes', []);
  const links = Object.fromEntries(existing.filter((v) => (v.promiseLinks || []).length).map((v) => [v.id, v]));
  votes.forEach((v) => { if (links[v.id]) { v.promiseLinks = links[v.id].promiseLinks; v.issues = links[v.id].issues || []; delete links[v.id]; } });
  votes.push(...Object.values(links));
  votes.sort((a, b) => (a.date < b.date ? 1 : -1));
  writeData('votes', votes);
  console.log(`Wrote ${votes.length} votes (${recent.length} recent, ${Object.keys(links).length} older kept for promise links).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
