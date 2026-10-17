// Pure helpers for the promise-research pipeline (no network, no model calls).

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&rsquo;': '’', '&lsquo;': '‘', '&rdquo;': '”', '&ldquo;': '“', '&ndash;': '–', '&mdash;': '—' };

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr|blockquote)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|[a-z]+);/gi, (m, dec, hex) => (dec ? String.fromCodePoint(+dec) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[m.toLowerCase()] || ' '))
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

// Collapse the differences that do not change meaning: case, whitespace, curly quotes, dashes.
export function normalize(s) {
  return String(s)
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// A quote counts only if it appears word-for-word (after normalize) in the fetched page text.
export function quoteInText(quote, text) {
  const q = normalize(quote);
  if (q.length < 25) return false; // too short to mean anything
  return normalize(text).includes(q);
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// "https://web.archive.org/web/20221001123456/https://x.com/issues" -> { snapshotDate: '2022-10-01', original: 'https://x.com/issues' }
export function parseWayback(url) {
  const m = String(url).match(/^https?:\/\/web\.archive\.org\/web\/(\d{4})(\d{2})(\d{2})\d*(?:[a-z_]+)?\/(https?:\/\/.+)$/i);
  return m ? { snapshotDate: `${m[1]}-${m[2]}-${m[3]}`, original: m[4] } : null;
}

// The outlet a source belongs to: the real site behind an archive copy, not archive.org itself.
export function outletHost(url) {
  const wb = parseWayback(url);
  return hostOf(wb ? wb.original : url);
}
export const outletId = (host) => host.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

export function toIsoDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// A source date must come from the archive timestamp, search metadata or the page itself, never a guess.
export function sourceDate(url, pageAge, modelDate) {
  const wb = parseWayback(url);
  return (wb && wb.snapshotDate) || toIsoDate(pageAge) || toIsoDate(modelDate) || null;
}

export const surname = (name) => {
  const parts = name.replace(/,?\s+(Jr|Sr|II|III|IV)\b\.?/gi, '').replace(/"[^"]*"/g, '').trim().split(/\s+/);
  return parts[parts.length - 1];
};

export function nextPromiseNumber(promises, officialId) {
  return promises.filter((p) => p.officialId === officialId).reduce((m, p) => Math.max(m, Number(p.id.split(':')[1]) || 0), 0) + 1;
}

export const UNREVIEWED = 'unreviewed (automated; quote checked word-for-word against the source)';

export function buildPromiseRecord({ official, n, item, source, categories, today }) {
  const category = categories.includes(item.category) ? item.category : 'other';
  return {
    id: `${official.id}:${n}`,
    officialId: official.id,
    category,
    text: item.paraphrase.trim(),
    quote: item.quote.trim(),
    madeOn: source.date,
    source: { outletId: source.outletId, title: source.title, date: source.date, url: source.url, type: source.type },
    status: 'unverifiable',
    evidence: [],
    howRated: 'Not yet rated. This statement was found in the source linked above and its wording was checked word-for-word against the page. No evidence about whether it was kept has been reviewed yet, so no rating is given.',
    statusNote: '',
    contested: false,
    opposesIndustries: [],
    reviewedOn: today,
    review: UNREVIEWED,
  };
}

export function isDuplicate(promises, officialId, quote) {
  const q = normalize(quote);
  return promises.some((p) => p.officialId === officialId && p.quote && normalize(p.quote) === q);
}

export function ensureOutlet(sources, source, officialSiteHost) {
  if (sources.some((s) => s.id === source.outletId)) return false;
  const own = officialSiteHost && source.host === officialSiteHost;
  sources.push({
    id: source.outletId,
    name: source.host,
    kind: own ? 'primary' : 'unrated',
    reliability: own ? 'high' : 'unrated',
    lean: 'unrated',
    note: own ? "The official's own website." : 'Added automatically. Reliability and lean have not been rated yet.',
  });
  return true;
}

// ---------- free (no-API) research flow: fetch pages in CI, extract in a Claude session, verify here ----------

// Best-effort publication date from a page: archive timestamp, JSON-LD, meta tags, <time>, or /YYYY/MM/DD/ in the URL.
export function findPublishedDate(html, url) {
  const wb = parseWayback(url);
  if (wb) return wb.snapshotDate;
  const patterns = [
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|og:published_time|date|pubdate|publishdate|datepublished|dc\.date|dcterms\.created)["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["'](?:article:published_time|og:published_time|date|pubdate|publishdate|datepublished)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = String(html).match(re);
    const d = m && toIsoDate(m[1].trim());
    if (d) return d;
  }
  const u = String(url).match(/\/((?:19|20)\d{2})\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?:\/|$)/);
  if (u) return `${u[1]}-${u[2].padStart(2, '0')}-${u[3].padStart(2, '0')}`;
  return null;
}

const CUES = /\b(I|we)\s+(will|would|won't|support|oppose|pledge|promise|am committed|believe|fight|vote|introduce|sponsor|cut|protect|repeal|expand|lower|reduce|end|ban|fund|work)\b|\b(pledged|promised|vowed|plans? to|would work to|committed to|priorit(?:y|ies))\b/i;

// Shrinks a page to the lines worth reading: first-person commitments and lines naming the official.
export function focusText(text, surnameLower, cap = 14000) {
  const keep = text.split('\n').map((l) => l.trim()).filter((l) => l.length >= 40 && (CUES.test(l) || l.toLowerCase().includes(surnameLower)));
  const out = [];
  let n = 0;
  for (const l of keep) { if (n + l.length > cap) break; out.push(l); n += l.length; }
  return out.join('\n');
}
