// Finds campaign promises for officials, with every promise tied to a real, dated source.
//
//   ANTHROPIC_API_KEY=... node scripts/research-promises.mjs --states NC,VA [--officials id,id] [--max-officials N] [--dry-run]
//
// How it avoids invented promises:
//   1. Claude searches the web, but only the URLs the search engine returned are used (not URLs Claude writes).
//   2. This script fetches each page itself.
//   3. Claude extracts forward-looking commitments, each with an exact quote.
//   4. A promise is kept ONLY if its quote appears word-for-word in the page this script fetched.
//   5. A promise needs a date from the archive timestamp, search metadata or the page. No date, no promise.
// Results are published as "unreviewed" with status Unverifiable: nothing here decides whether a promise
// was kept. That needs evidence (votes, laws) and a person's review.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readData, writeData, sleep } from './lib.mjs';
import { htmlToText, quoteInText, hostOf, outletHost, outletId, parseWayback, sourceDate, surname, nextPromiseNumber, buildPromiseRecord, isDuplicate, ensureOutlet } from './research-lib.mjs';

const Core = createRequire(import.meta.url)('../js/core.js');
const MODEL = process.env.RESEARCH_MODEL || 'claude-opus-5-5';
const MAX_PAGE_CHARS = 60000;
const SOURCE_TYPES = ['campaign-site', 'official-site', 'debate', 'interview', 'press-release', 'news', 'other'];

const Extraction = z.object({
  promises: z.array(z.object({
    quote: z.string().describe('Exact words copied from the page, one or two sentences, spoken or written by the official'),
    paraphrase: z.string().describe('One neutral sentence beginning "Will", "Would" or similar describing the commitment'),
    category: z.string(),
    source_type: z.enum(SOURCE_TYPES),
    published_date: z.string().nullable().describe('Date the page or statement is dated, if the page states one; otherwise null'),
  })),
});

// ---------- step 1: find candidate sources ----------
export async function discoverSources(client, official, today) {
  const since = official.firstElected;
  const queries = `Find pages where ${official.name} (${official.chamber === 'senate' ? 'U.S. Senator' : 'U.S. Representative'}, ${official.state}${official.district && official.district !== '00' ? `-${official.district}` : ''}) made specific promises or commitments about what they would do in office, from their first campaign (${since}) onward: their own campaign website (including web.archive.org snapshots), debate transcripts, interviews, press releases and public statements. Prefer primary sources. Search several times with different wording.`;
  const urls = new Map();
  let messages = [{ role: 'user', content: queries }];
  for (let turn = 0; turn < 4; turn++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
      messages,
    });
    for (const b of res.content) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        for (const r of b.content) if (r.type === 'web_search_result' && r.url && !urls.has(r.url)) urls.set(r.url, { title: r.title, pageAge: r.page_age || null });
      }
    }
    if (res.stop_reason !== 'pause_turn') break;
    messages = [{ role: 'user', content: queries }, { role: 'assistant', content: res.content }];
  }
  return [...urls.entries()].map(([url, meta]) => ({ url, ...meta }));
}

// ---------- step 2: fetch ----------
export async function fetchPage(url, fetchImpl = fetch) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PromiseTrackerBot/1.0)', Accept: 'text/html,text/plain' } });
    if (!res.ok) return { ok: false, status: res.status };
    const type = res.headers.get('content-type') || '';
    if (!/html|text\/plain|xml/i.test(type)) return { ok: false, status: `unsupported type ${type}` };
    const body = (await res.text()).slice(0, 1500000);
    return { ok: true, text: htmlToText(body).slice(0, MAX_PAGE_CHARS) };
  } catch (e) {
    return { ok: false, status: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- step 3: extract ----------
export async function extractPromises(client, official, page, categoryIds) {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: zodOutputFormat(Extraction) },
    messages: [{
      role: 'user',
      content: `Below is the text of a web page. Extract the specific, checkable commitments that ${official.name} themselves made about what they would do, support or oppose in office.

Rules:
- Only statements made by ${official.name}. Never include statements by opponents, moderators, reporters or other people.
- Only forward-looking commitments ("I will...", "I support...", "I will oppose..."). Not past accomplishments, biography or general values.
- "quote" must be copied EXACTLY, character for character, from the page text below. Do not fix typos, merge sentences or paraphrase. If you cannot copy an exact quote, leave that item out.
- "paraphrase" is one neutral sentence in plain words. No judgement of the position.
- category must be one of: ${categoryIds.join(', ')}.
- Return at most 8 items. Return an empty list if the page has no such statements.

PAGE TEXT:
${page.text}`,
    }],
  });
  return (res.parsed_output && res.parsed_output.promises) || [];
}

// ---------- one official ----------
export async function researchOfficial({ client, official, data, today, fetchImpl, log = console.log, maxSources = 8 }) {
  const categoryIds = data.categories.map((c) => c.id);
  const sur = surname(official.name).toLowerCase();
  const officialSiteHost = hostOf(official.contact && official.contact.website);
  const found = [];
  const tried = [];

  const candidates = await discoverSources(client, official, today);
  const seenHosts = new Map();
  const picked = candidates.filter((c) => {
    const h = outletHost(c.url);
    const n = seenHosts.get(h) || 0;
    if (n >= 2) return false; // spread across outlets
    seenHosts.set(h, n + 1);
    return true;
  }).slice(0, maxSources);

  for (const c of picked) {
    const page = await fetchPage(c.url, fetchImpl);
    if (!page.ok) { tried.push({ url: c.url, result: `not fetched: ${page.status}` }); continue; }
    if (!page.text.toLowerCase().includes(sur)) { tried.push({ url: c.url, result: 'page does not mention the official' }); continue; }
    let items;
    try { items = await extractPromises(client, official, page, categoryIds); } catch (e) { tried.push({ url: c.url, result: `extraction failed: ${e.message}` }); continue; }
    let kept = 0;
    for (const item of items) {
      if (!quoteInText(item.quote, page.text)) continue; // not word-for-word on the page: discard
      if (Core.LOADED.test(item.paraphrase)) continue; // our own wording must stay neutral
      const date = sourceDate(c.url, c.pageAge, item.published_date);
      if (!date) continue; // undated: discard
      if (isDuplicate(data.promises, official.id, item.quote) || found.some((f) => f.quote === item.quote)) continue;
      const host = outletHost(c.url);
      found.push({ item, quote: item.quote, source: { host, outletId: outletId(host), title: c.title || host, date, url: c.url, type: item.source_type } });
      kept++;
    }
    tried.push({ url: c.url, result: `${items.length} proposed, ${kept} kept` });
  }

  let n = nextPromiseNumber(data.promises, official.id);
  for (const f of found) {
    ensureOutlet(data.sources, f.source, officialSiteHost);
    data.promises.push(buildPromiseRecord({ official, n: n++, item: f.item, source: f.source, categories: categoryIds, today }));
  }
  data.log[official.id] = { ranAt: today, sources: tried, promisesAdded: found.length };
  log(`${official.id} ${official.name}: ${found.length} promise(s) kept from ${tried.length} page(s)`);
  return found.length;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is not set.'); process.exit(1); }
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const states = (opt('--states', '') || '').split(',').filter(Boolean);
  const ids = (opt('--officials', '') || '').split(',').filter(Boolean);
  const max = Number(opt('--max-officials', 0));
  const dry = args.includes('--dry-run');
  const today = new Date().toISOString().slice(0, 10);

  const officials = readData('officials', []);
  let todo = officials.filter((o) => (ids.length ? ids.includes(o.id) : states.includes(o.state)));
  const data = { officials, promises: readData('promises', []), sources: readData('sources', []), categories: readData('categories', []), log: readData('research-log', {}) };
  todo = todo.filter((o) => !data.log[o.id]); // resume: skip officials already researched
  if (max) todo = todo.slice(0, max);
  console.log(`${todo.length} official(s) to research with ${MODEL}${dry ? ' (dry run: nothing saved)' : ''}`);

  const client = new Anthropic();
  let total = 0;
  for (const o of todo) {
    try { total += await researchOfficial({ client, official: o, data, today }); } catch (e) { console.log(`${o.id}: failed: ${e.message}`); }
    if (!dry) { writeData('promises', data.promises); writeData('sources', data.sources); writeData('research-log', data.log); }
    await sleep(1000);
  }
  console.log(`Done: ${total} promise(s) added across ${todo.length} official(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
