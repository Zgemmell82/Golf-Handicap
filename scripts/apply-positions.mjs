// Publishes organization positions on House and Senate votes, but only those whose quote appears
// word-for-word in the page that was actually downloaded.
//   node scripts/apply-positions.mjs <candidates.json> <pagesDir> [evidenceDir] [--dry-run]
// candidates.json: [ { org, patterns:[regex source matching the organization's FEC donor names], voteIds:[...],
//                      position:'support'|'oppose', url, quote } ]
// The page is found by url under <pagesDir>/*/*.json (fetch-pages output). If a vote is not yet in data/votes.json
// and an evidence directory is given, the vote record is created from it.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readData, writeData } from './lib.mjs';
import { quoteInText, findPublishedDate } from './research-lib.mjs';
import { loadPages } from './apply-candidates.mjs';

const TYPE = { hr: 'H.R.', hres: 'H.Res.', hjres: 'H.J.Res.', hconres: 'H.Con.Res.', s: 'S.', sres: 'S.Res.', sjres: 'S.J.Res.', sconres: 'S.Con.Res.' };
const label = (b) => `${TYPE[b.type.toLowerCase()] || b.type} ${b.number}`;
const read = (f, fb) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fb);

export function applyPositions({ candidates, pages, data, evidence = {} }) {
  const rejected = [];
  const byUrl = Object.fromEntries(Object.values(pages).map((p) => [p.url, p]));
  const out = [];
  for (const c of candidates) {
    const why = (reason) => rejected.push({ candidate: c, reason });
    if (!['support', 'oppose'].includes(c.position)) { why('position must be support or oppose'); continue; }
    if (!c.org || !(c.patterns || []).length || !(c.voteIds || []).length) { why('needs org, patterns and voteIds'); continue; }
    try { new RegExp(c.patterns.join('|')); } catch { why('a pattern is not a valid expression'); continue; }
    const page = byUrl[c.url];
    if (!page) { why('page was not downloaded'); continue; }
    if (String(c.quote || '').length < 25) { why('quote is too short'); continue; }
    if (!quoteInText(c.quote, page.text)) { why('quote not found word-for-word on the page'); continue; }
    const missing = c.voteIds.filter((id) => !data.votes.some((v) => v.id === id) && !findVote(evidence, id));
    if (missing.length) { why(`vote(s) not on file: ${missing.join(', ')}`); continue; }
    for (const id of c.voteIds) ensureVote(data, evidence, id);
    out.push({ id: `${c.org.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${c.position}-${c.voteIds[0]}`, org: c.org, patterns: c.patterns, voteIds: c.voteIds, position: c.position, quote: c.quote, url: c.url, date: page.date || findPublishedDate('', c.url) || null });
  }
  // replace any earlier record with the same id
  const ids = new Set(out.map((p) => p.id));
  data.positions = [...(data.positions || []).filter((p) => !ids.has(p.id)), ...out];
  return { accepted: out.length, rejected };
}

function findVote(evidence, id) {
  for (const e of Object.values(evidence)) { const v = e.votes.find((x) => x.id === id); if (v) return v; }
  return null;
}

function ensureVote(data, evidence, id) {
  if (data.votes.some((v) => v.id === id)) return;
  const v = findVote(evidence, id);
  const chamberOutlet = v.chamber === 'house' ? 'house-clerk' : 'senate-gov';
  const rec = { id: v.id, date: v.date, chamber: v.chamber, rollCall: v.roll, billId: v.bill ? label(v.bill) : 'Procedural vote', title: (v.bill && v.bill.title) || v.desc, question: v.question, result: v.result, byOfficial: {}, issues: [], outletId: chamberOutlet, url: v.sources.official, promiseLinks: [] };
  for (const [oid, e] of Object.entries(evidence)) { const x = e.votes.find((y) => y.id === v.id); if (x) rec.byOfficial[oid] = x.cast; }
  data.votes.push(rec);
}

function main() {
  const [candFile, pagesDir, evDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!candFile || !pagesDir) { console.error('usage: node scripts/apply-positions.mjs <candidates.json> <pagesDir> [evidenceDir] [--dry-run]'); process.exit(1); }
  const data = { votes: readData('votes', []), positions: readData('positions', []) };
  const evidence = {};
  if (evDir) for (const o of readData('officials', [])) { const vf = join(evDir, `votes-${o.id}.json`); if (existsSync(vf)) evidence[o.id] = { votes: read(vf, []) }; }
  const { accepted, rejected } = applyPositions({ candidates: JSON.parse(readFileSync(candFile, 'utf8')), pages: loadPages(pagesDir), data, evidence });
  console.log(`${accepted} accepted, ${rejected.length} rejected.`);
  rejected.forEach((r) => console.log(`  rejected: ${r.candidate.org} ${r.candidate.voteIds}: ${r.reason}`));
  if (!process.argv.includes('--dry-run')) { writeData('positions', data.positions); writeData('votes', data.votes); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
