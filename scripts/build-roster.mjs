// Builds data/officials.json from the public unitedstates/congress-legislators dataset
// (current members of the U.S. House and Senate, plus delegates). No API key needed.
//
//   node scripts/build-roster.mjs [--replace-sample] [--from <dir>] [--out <dir>]
//
//   --replace-sample  required when data/ still holds the fictional sample set; the sample
//                     promises, votes, finance and ZIP files are cleared because they point at
//                     fictional people (real ones are added later, with sources).
//   --from <dir>      read legislators-current.json, committees-current.json and
//                     committee-membership-current.json from a folder instead of the network.
//   --out <dir>       write somewhere other than data/.
//   --min-house <n>   sanity floor on House members parsed (default 400); lower only for test fixtures.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const BASE = 'https://unitedstates.github.io/congress-legislators/';
const PHOTO = 'https://unitedstates.github.io/images/congress/225x275/';

const PARTY = { Democrat: 'D', Republican: 'R', Independent: 'I', Libertarian: 'L', Green: 'G' };
const partyCode = (p) => PARTY[p] || (p ? p[0].toUpperCase() : '?');
const pad2 = (n) => String(n).padStart(2, '0');
const yearOf = (d) => Number(String(d).slice(0, 4));

// "House Committee on Ways and Means" -> "Ways and Means"
const shortCommittee = (name) => name.replace(/^(House|Senate|Joint)\s+(Select\s+|Permanent Select\s+|Special\s+)?Committee\s+(on\s+(the\s+)?|for\s+(the\s+)?)?/i, '').trim() || name;

// Terms starting in Jan/Feb follow a November election the year before; later starts are special elections.
const electionYear = (start) => yearOf(start) - (Number(String(start).slice(5, 7)) <= 2 ? 1 : 0);

export function buildRoster(legislators, committees, membership, today = new Date().toISOString().slice(0, 10)) {
  const committeeName = {};
  committees.forEach((c) => { committeeName[c.thomas_id] = shortCommittee(c.name); });
  const byMember = {};
  Object.entries(membership).forEach(([cid, members]) => {
    if (!committeeName[cid]) return; // skip subcommittees
    members.forEach((m) => { (byMember[m.bioguide] = byMember[m.bioguide] || []).push(committeeName[cid]); });
  });

  const officials = [];
  legislators.forEach((l) => {
    const terms = l.terms || [];
    const current = terms[terms.length - 1];
    if (!current || (current.end && current.end < today)) return;
    if (current.type !== 'rep' && current.type !== 'sen') return;
    const chamber = current.type === 'sen' ? 'senate' : 'house';
    // Consecutive terms in the current chamber, counted back from the present.
    let since = yearOf(current.start);
    for (let i = terms.length - 2; i >= 0 && terms[i].type === current.type; i--) since = yearOf(terms[i].start);
    const bio = l.id.bioguide;
    const slug = chamber === 'senate' ? `${current.state}-S-${bio}` : `${current.state}-${pad2(current.district)}-${bio}`;
    officials.push({
      id: slug.toLowerCase(),
      bioguide: bio,
      chamber,
      name: l.name.official_full || `${l.name.first} ${l.name.last}`,
      party: partyCode(current.party),
      state: current.state,
      district: chamber === 'house' ? pad2(current.district) : null,
      firstElected: electionYear(terms[0].start),
      inOfficeSince: since,
      photo: `${PHOTO}${bio}.jpg`,
      committees: (byMember[bio] || []).sort(),
      contact: { phone: current.phone || '', website: current.url || '', office: current.address || '' },
      updated: today,
    });
  });
  const order = (o) => `${o.state}|${o.chamber === 'senate' ? 0 : 1}|${o.district || ''}|${o.name}`;
  return officials.sort((a, b) => order(a).localeCompare(order(b)));
}

async function load(name, from) {
  if (from) return JSON.parse(readFileSync(join(from, name), 'utf8'));
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const out = opt('--out') || fileURLToPath(new URL('../data/', import.meta.url));
  const from = opt('--from');
  mkdirSync(out, { recursive: true });

  const metaPath = join(out, 'meta.json');
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : { isSample: false };
  if (meta.isSample && !args.includes('--replace-sample')) {
    console.error('data/ still contains the fictional sample set. Re-run with --replace-sample to replace it with the real roster.');
    process.exit(1);
  }

  const [legislators, committees, membership] = await Promise.all([
    load('legislators-current.json', from), load('committees-current.json', from), load('committee-membership-current.json', from),
  ]);
  const officials = buildRoster(legislators, committees, membership);
  if (officials.filter((o) => o.chamber === 'house').length < Number(opt('--min-house') || 400)) throw new Error(`Only ${officials.length} officials parsed; refusing to overwrite data.`);

  const write = (n, obj) => writeFileSync(join(out, n + '.json'), JSON.stringify(obj, null, 1) + '\n');
  write('officials', officials);
  if (meta.isSample) {
    // Sample promises/votes/finance/ZIPs point at fictional people, so they are removed with them.
    write('promises', []); write('votes', []); write('finance', {}); write('zip', {});
  }
  write('meta', { isSample: false, generated: new Date().toISOString().slice(0, 10), note: 'Roster from unitedstates/congress-legislators. Promises, votes and finance are added separately, each with sources.' });
  console.log(`Wrote ${officials.length} officials (${officials.filter((o) => o.chamber === 'house').length} House, ${officials.filter((o) => o.chamber === 'senate').length} Senate).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
