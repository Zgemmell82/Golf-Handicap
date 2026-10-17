// Fetches ONE small sample from each data source and prints the raw response shape,
// so the real pipeline scripts can be written against what the APIs actually return.
// Keys come from CONGRESS_API_KEY / FEC_API_KEY (falls back to the rate-limited DEMO_KEY).
// API keys are redacted from all output.
const CONGRESS_KEY = process.env.CONGRESS_API_KEY || 'DEMO_KEY';
const FEC_KEY = process.env.FEC_API_KEY || 'DEMO_KEY';
const LIMIT = 600;

const redact = (s) => String(s).split(CONGRESS_KEY).join('<key>').split(FEC_KEY).join('<key>');
async function probe(label, url, { json = true, keep } = {}) {
  console.log(`\n===== ${label}\nGET ${redact(url)}`);
  try {
    const res = await fetch(url, { headers: { Accept: json ? 'application/json' : '*/*', 'User-Agent': 'promise-tracker-probe' } });
    const text = await res.text();
    console.log(`HTTP ${res.status}, ${text.length} bytes, content-type ${res.headers.get('content-type')}`);
    console.log(redact(text.slice(0, LIMIT)));
    if (keep && res.ok) return keep(json ? JSON.parse(text) : text);
  } catch (e) {
    console.log('FAILED:', redact(e.message));
  }
  return null;
}

// Round 2: where is the ZIP -> congressional district file, and what does the address lookup return?
const REL = 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/';
const names = ['cd119-zcta520', 'zcta520-cd119'];
const candidates = [
  `${REL}cd-sld/tab20_cd11920_zcta520_natl.txt`, `${REL}cd-sld/tab20_zcta520_cd11920_natl.txt`,
  `${REL}cd118/tab20_cd11820_zcta520_natl.txt`, `${REL}cd-sld/tab20_cd11820_zcta520_natl.txt`,
  `${REL}zcta520/tab20_zcta520_cd11820_natl.txt`, `${REL}zcta520/tab20_zcta520_cd11920_natl.txt`,
  `${REL}cd119/tab20_cd11920_zcta520_natl.txt`, `${REL}cd119/tab20_zcta520_cd11920_natl.txt`,
];
for (const url of candidates) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-1500' } });
    const text = await res.text();
    console.log(`\n===== ${url}\nHTTP ${res.status}`);
    if (res.ok || res.status === 206) console.log(text.slice(0, 1500));
  } catch (e) { console.log(`\n===== ${url}\nFAILED ${e.message}`); }
}
// Directory listings, in case the names above are wrong.
for (const dir of ['cd-sld/', 'zcta520/', 'cd119/', 'cd118/', '']) {
  try {
    const res = await fetch(REL + dir);
    const text = await res.text();
    const files = [...text.matchAll(/href="([^"?/][^"]*)"/g)].map((m) => m[1]).filter((f) => /cd11|zcta|natl/i.test(f));
    console.log(`\n===== listing ${REL + dir}\nHTTP ${res.status}, matching entries:\n${files.slice(0, 60).join('\n')}`);
  } catch (e) { console.log(`\n===== listing ${dir}\nFAILED ${e.message}`); }
}

const addr = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=4600%20Silver%20Hill%20Rd%2C%20Washington%2C%20DC%2020233&benchmark=Public_AR_Current&vintage=Current_Current&format=json';
try {
  const res = await fetch(addr, { headers: { Origin: 'https://zgemmell82.github.io' } });
  console.log('\n===== Census geocoder CORS check');
  console.log('HTTP', res.status, '| access-control-allow-origin:', res.headers.get('access-control-allow-origin'));
  const j = await res.json();
  const m = j.result.addressMatches[0];
  console.log('geographies keys:', Object.keys(m.geographies));
  const key = Object.keys(m.geographies).find((k) => /Congressional/i.test(k));
  console.log('congressional record:', JSON.stringify(m.geographies[key], null, 1).slice(0, 1200));
  console.log('addressComponents:', JSON.stringify(m.addressComponents));
} catch (e) { console.log('geocoder FAILED', e.message); }

// Congress.gov: do the member list and house-vote members endpoints paginate?
const mem = await probe('Congress.gov house-vote members (pagination keys)', `https://api.congress.gov/v3/house-vote/119/1/1/members?format=json&api_key=${CONGRESS_KEY}`, { keep: (j) => j });
if (mem) console.log('top-level keys:', Object.keys(mem), '| inner keys:', Object.keys(mem.houseRollCallVoteMemberVotes || {}), '| results:', ((mem.houseRollCallVoteMemberVotes || {}).results || []).length);
const tot = await probe('OpenFEC totals (field names)', `https://api.open.fec.gov/v1/candidate/H4OR05312/totals/?cycle=2024&per_page=1&api_key=${FEC_KEY}`, { keep: (j) => j.results[0] });
if (tot) console.log('totals fields:', Object.keys(tot).filter((k) => /receipt|contribution|individual|candidate/.test(k)).join(', '));
