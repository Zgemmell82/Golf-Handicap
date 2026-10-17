// Fetches small samples so evidence scripts can be written against real response shapes.
// Keys come from CONGRESS_API_KEY (falls back to DEMO_KEY); keys are redacted from output.
const KEY = process.env.CONGRESS_API_KEY || 'DEMO_KEY';
const redact = (s) => String(s).split(KEY).join('<key>');
async function probe(label, url, { lines = 0, chars = 1800 } = {}) {
  console.log(`\n===== ${label}\nGET ${redact(url)}`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'promise-tracker-probe' } });
    const text = await res.text();
    console.log(`HTTP ${res.status}, ${text.length} bytes`);
    console.log(redact(lines ? text.split('\n').slice(0, lines).join('\n') : text.slice(0, chars)));
    return { res, text };
  } catch (e) { console.log('FAILED:', redact(e.message)); return null; }
}
const base = 'https://api.congress.gov/v3';
await probe('Congress.gov sponsored legislation', `${base}/member/R000305/sponsored-legislation?limit=2&format=json&api_key=${KEY}`);
await probe('Congress.gov cosponsored legislation', `${base}/member/R000305/cosponsored-legislation?limit=2&format=json&api_key=${KEY}`);
await probe('Congress.gov bill detail', `${base}/bill/119/hr/3424?format=json&api_key=${KEY}`, { chars: 2500 });
await probe('Congress.gov house-vote 118 list', `${base}/house-vote/118/1?limit=1&format=json&api_key=${KEY}`);
await probe('Congress.gov house-vote 118 detail', `${base}/house-vote/118/1/100?format=json&api_key=${KEY}`);
await probe('Voteview H118 rollcalls (head)', 'https://voteview.com/static/data/out/rollcalls/H118_rollcalls.csv', { lines: 4, chars: 2500 });
await probe('Voteview S119 rollcalls (head)', 'https://voteview.com/static/data/out/rollcalls/S119_rollcalls.csv', { lines: 4 });
await probe('Voteview S119 votes (head)', 'https://voteview.com/static/data/out/votes/S119_votes.csv', { lines: 4 });
await probe('Voteview S119 members (head)', 'https://voteview.com/static/data/out/members/S119_members.csv', { lines: 3 });
await probe('Voteview H118 members (head)', 'https://voteview.com/static/data/out/members/H118_members.csv', { lines: 3 });
await probe('Clerk roll call xml', 'https://clerk.house.gov/evs/2023/roll100.xml', { chars: 900 });
await probe('Senate roll call xml', 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1181/vote_118_1_00100.xml', { chars: 900 });
