// Fetches ONE small sample from each data source and prints the raw response shape,
// so the real pipeline scripts can be written against what the APIs actually return.
// Keys come from CONGRESS_API_KEY / FEC_API_KEY (falls back to the rate-limited DEMO_KEY).
// API keys are redacted from all output.
const CONGRESS_KEY = process.env.CONGRESS_API_KEY || 'DEMO_KEY';
const FEC_KEY = process.env.FEC_API_KEY || 'DEMO_KEY';
const LIMIT = 2500;

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

// Congress.gov: House roll-call votes (beta endpoints)
const base = 'https://api.congress.gov/v3';
const votes = await probe('Congress.gov house-vote list', `${base}/house-vote/119/1?limit=2&format=json&api_key=${CONGRESS_KEY}`, { keep: (j) => j });
await probe('Congress.gov house-vote members', `${base}/house-vote/119/1/1/members?limit=3&format=json&api_key=${CONGRESS_KEY}`);
await probe('Congress.gov member list', `${base}/member?currentMember=true&limit=2&format=json&api_key=${CONGRESS_KEY}`);

// OpenFEC
const fec = 'https://api.open.fec.gov/v1';
const cand = await probe('OpenFEC candidates (House, 2024)', `${fec}/candidates/?office=H&cycle=2024&election_year=2024&per_page=1&api_key=${FEC_KEY}`, { keep: (j) => j.results && j.results[0] });
if (cand) {
  await probe('OpenFEC candidate totals', `${fec}/candidate/${cand.candidate_id}/totals/?cycle=2024&per_page=2&api_key=${FEC_KEY}`);
  await probe('OpenFEC candidate committees', `${fec}/candidate/${cand.candidate_id}/committees/?cycle=2024&per_page=2&api_key=${FEC_KEY}`, { keep: (j) => j });
}
await probe('OpenFEC schedule_a by_employer (path check)', `${fec}/schedules/schedule_a/by_employer/?cycle=2024&per_page=2&api_key=${FEC_KEY}`);
await probe('OpenFEC schedule_a by_size (path check)', `${fec}/schedules/schedule_a/by_size/?cycle=2024&per_page=2&api_key=${FEC_KEY}`);

// Keyless sources
await probe('GovTrack vote', 'https://www.govtrack.us/api/v2/vote?congress=119&chamber=house&limit=1&order_by=-created');
await probe('Voteview votes csv (head)', 'https://voteview.com/static/data/out/votes/H119_votes.csv', { json: false });
await probe('Voteview members csv (head)', 'https://voteview.com/static/data/out/members/H119_members.csv', { json: false });

// Census ZIP -> congressional district relationship files
const page = await probe('Census relationship files page', 'https://www.census.gov/geographies/reference-files/2020/geo/relationship-files.html', { json: false, keep: (t) => t });
if (page) {
  const links = [...page.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /cd11|zcta|zip/i.test(h));
  console.log('\nCandidate download links on that page:\n' + [...new Set(links)].slice(0, 40).join('\n'));
}
await probe('Census geocoder (address -> district)', 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=4600%20Silver%20Hill%20Rd%2C%20Washington%2C%20DC%2020233&benchmark=Public_AR_Current&vintage=Current_Current&format=json');
