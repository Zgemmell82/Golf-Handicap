// Downloads pages listed in a JSON file so promises can be read from the real text.
//   node scripts/fetch-pages.mjs <urls.json> <outDir>
// urls.json: { "<officialId>": [ { "url": "...", "title": "..." } ] }
// Writes <outDir>/<officialId>/<n>.json: { officialId, url, title, fetchedAt, date, text, focus } or { ok:false, status }.
// Runs in GitHub Actions (free) because the Claude sandbox cannot reach most sites.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToText, findPublishedDate, focusText, surname } from './research-lib.mjs';
import { readData, sleep } from './lib.mjs';

async function fetchHtml(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PromiseTrackerBot/1.0)', Accept: 'text/html,text/plain' } });
    if (!res.ok) return { ok: false, status: res.status };
    const type = res.headers.get('content-type') || '';
    if (!/html|text\/plain|xml/i.test(type)) return { ok: false, status: `unsupported type ${type}` };
    return { ok: true, html: (await res.text()).slice(0, 2000000) };
  } catch (e) {
    return { ok: false, status: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const [urlsFile, outDir] = process.argv.slice(2);
  if (!urlsFile || !outDir) { console.error('usage: node scripts/fetch-pages.mjs <urls.json> <outDir>'); process.exit(1); }
  const urls = JSON.parse(readFileSync(urlsFile, 'utf8'));
  const officials = Object.fromEntries(readData('officials', []).map((o) => [o.id, o]));
  let ok = 0, failed = 0;
  for (const [officialId, list] of Object.entries(urls)) {
    const sur = officials[officialId] ? surname(officials[officialId].name).toLowerCase() : '';
    mkdirSync(join(outDir, officialId), { recursive: true });
    for (const [i, item] of list.entries()) {
      const r = await fetchHtml(item.url);
      let rec;
      if (!r.ok) { rec = { ok: false, officialId, url: item.url, status: r.status }; failed++; }
      else {
        const text = htmlToText(r.html).slice(0, 120000);
        rec = { ok: true, officialId, url: item.url, title: item.title || '', fetchedAt: new Date().toISOString(), date: findPublishedDate(r.html, item.url), text, focus: '' };
        rec.focus = focusText(text, sur);
        ok++;
      }
      writeFileSync(join(outDir, officialId, `${i + 1}.json`), JSON.stringify(rec, null, 1));
      await sleep(400);
    }
  }
  console.log(`Fetched ${ok} page(s), ${failed} failed.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
