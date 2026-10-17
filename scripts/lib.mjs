// Shared helpers for the data scripts.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const dataPath = (name) => fileURLToPath(new URL(`../data/${name}.json`, import.meta.url));
export const readData = (name, fallback) => (existsSync(dataPath(name)) ? JSON.parse(readFileSync(dataPath(name), 'utf8')) : fallback);
export const writeData = (name, obj) => writeFileSync(dataPath(name), JSON.stringify(obj, null, 1) + '\n');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET JSON with retries. Waits and retries on 429 (rate limit) and 5xx. Keys never appear in errors.
export async function getJson(url, { keys = [], tries = 5 } = {}) {
  const redact = (s) => keys.filter(Boolean).reduce((acc, k) => acc.split(k).join('<key>'), String(s));
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'promise-tracker' } });
    } catch (e) {
      if (attempt >= tries) throw new Error(redact(`${e.message} for ${url}`));
      await sleep(2000 * attempt);
      continue;
    }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      await sleep(res.status === 429 ? 65000 : 3000 * attempt); // FEC/Congress limits reset hourly; back off a minute
      continue;
    }
    throw new Error(redact(`HTTP ${res.status} for ${url}`));
  }
}

// Quote-aware CSV parser (RFC 4180): returns an array of rows.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

// Runs fn over items with limited concurrency; results keep input order.
export async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}
