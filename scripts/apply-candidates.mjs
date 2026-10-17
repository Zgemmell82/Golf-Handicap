// Turns reviewed-by-Claude candidates into published, unreviewed promises, but only the ones whose
// quote appears word-for-word in the page text that was actually downloaded.
//   node scripts/apply-candidates.mjs <candidates.json> <pagesDir> [--dry-run]
// candidates.json: [ { officialId, url, quote, paraphrase, category, sourceType } ]
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readData, writeData } from './lib.mjs';
import { quoteInText, outletHost, outletId, hostOf, buildPromiseRecord, nextPromiseNumber, isDuplicate, ensureOutlet } from './research-lib.mjs';

const Core = createRequire(import.meta.url)('../js/core.js');

export function loadPages(pagesDir) {
  const pages = {};
  if (!existsSync(pagesDir)) return pages;
  for (const id of readdirSync(pagesDir)) {
    for (const f of readdirSync(join(pagesDir, id))) {
      const rec = JSON.parse(readFileSync(join(pagesDir, id, f), 'utf8'));
      if (rec.ok) pages[`${rec.officialId}|${rec.url}`] = rec;
    }
  }
  return pages;
}

// Returns { accepted, rejected:[{candidate, reason}] } and mutates data (promises, sources, log).
export function applyCandidates({ candidates, pages, data, today }) {
  const rejected = [];
  const categoryIds = data.categories.map((c) => c.id);
  const byId = Object.fromEntries(data.officials.map((o) => [o.id, o]));
  let accepted = 0;
  const addedBy = {};
  for (const c of candidates) {
    const reject = (reason) => rejected.push({ candidate: c, reason });
    const official = byId[c.officialId];
    if (!official) { reject('unknown official'); continue; }
    const page = pages[`${c.officialId}|${c.url}`];
    if (!page) { reject('page was not downloaded'); continue; }
    if (!quoteInText(c.quote, page.text)) { reject('quote is not word-for-word on the page'); continue; }
    if (!page.date) { reject('page has no verifiable date'); continue; }
    if (!c.paraphrase || Core.LOADED.test(c.paraphrase)) { reject('paraphrase missing or not neutral'); continue; }
    if (isDuplicate(data.promises, official.id, c.quote)) { reject('duplicate'); continue; }
    const host = outletHost(c.url);
    const source = { host, outletId: outletId(host), title: page.title || host, date: page.date, url: c.url, type: c.sourceType || 'other' };
    ensureOutlet(data.sources, source, hostOf(official.contact && official.contact.website));
    const n = nextPromiseNumber(data.promises, official.id);
    data.promises.push(buildPromiseRecord({ official, n, item: c, source, categories: categoryIds, today }));
    accepted++;
    addedBy[official.id] = (addedBy[official.id] || 0) + 1;
  }
  for (const id of new Set(candidates.map((c) => c.officialId))) {
    if (!byId[id]) continue;
    const prior = data.log[id] || { sources: [], promisesAdded: 0 };
    data.log[id] = { ranAt: today, method: 'search + CI fetch + Claude session extraction + verbatim check', sources: prior.sources, promisesAdded: (prior.promisesAdded || 0) + (addedBy[id] || 0) };
  }
  return { accepted, rejected };
}

function main() {
  const [candFile, pagesDir] = process.argv.slice(2);
  if (!candFile || !pagesDir) { console.error('usage: node scripts/apply-candidates.mjs <candidates.json> <pagesDir> [--dry-run]'); process.exit(1); }
  const today = new Date().toISOString().slice(0, 10);
  const data = { officials: readData('officials', []), promises: readData('promises', []), sources: readData('sources', []), categories: readData('categories', []), log: readData('research-log', {}) };
  const candidates = JSON.parse(readFileSync(candFile, 'utf8'));
  const { accepted, rejected } = applyCandidates({ candidates, pages: loadPages(pagesDir), data, today });
  console.log(`${accepted} accepted, ${rejected.length} rejected of ${candidates.length}.`);
  const tally = {};
  rejected.forEach((r) => { tally[r.reason] = (tally[r.reason] || 0) + 1; });
  console.log(tally);
  if (!process.argv.includes('--dry-run')) { writeData('promises', data.promises); writeData('sources', data.sources); writeData('research-log', data.log); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
