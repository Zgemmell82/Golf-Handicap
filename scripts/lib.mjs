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
