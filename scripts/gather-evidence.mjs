// Gathers how NC/VA officials actually voted, and what bills they sponsored or cosponsored,
// so promises can be compared with the record. Runs in GitHub Actions (needs open internet).
//
//   CONGRESS_API_KEY=... node scripts/gather-evidence.mjs <outDir> [--states NC,VA] [--congresses 118,119]
//
// Every vote is recorded from TWO publishers and kept only if they agree:
//   House:  Clerk of the House roll-call XML  +  Voteview (UCLA research dataset)
//   Senate: senate.gov roll-call XML          +  Voteview
// Bill titles and subject areas come from the Congress.gov API.
// Output: <outDir>/votes-<officialId>.json, legislation-<officialId>.json, bills.json, summary.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJson, readData, parseCsv, pool, sleep } from './lib.mjs';

const VV = 'https://voteview.com/static/data/out/';
const CG = 'https://api.congress.gov/v3';

export const castFromVoteview = (code) => {
  const c = Number(code);
  if (c >= 1 && c <= 3) return 'Yea';
  if (c >= 4 && c <= 6) return 'Nay';
  if (c === 7 || c === 8) return 'Present';
  if (c === 9) return 'Not Voting';
  return null;
};
export const normCast = (s) => ({ aye: 'Yea', yea: 'Yea', no: 'Nay', nay: 'Nay', present: 'Present', 'not voting': 'Not Voting' }[String(s).trim().toLowerCase()] || null);

// <recorded-vote><legislator name-id="A000370" ...>Adams</legislator><vote>Aye</vote></recorded-vote>
export function parseClerkVotes(xml) {
  const out = {};
  for (const m of xml.matchAll(/<recorded-vote>\s*<legislator[^>]*name-id="([^"]+)"[^>]*>[^<]*<\/legislator>\s*<vote>([^<]*)<\/vote>/g)) out[m[1]] = normCast(m[2]);
  return out;
}
export function clerkMeta(xml) {
  const g = (tag) => (xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`)) || [])[1] || '';
  return { legisNum: g('legis-num'), question: g('vote-question'), result: g('vote-result'), desc: g('vote-desc') };
}
// <member><last_name>Tillis</last_name>...<state>NC</state><vote_cast>Yea</vote_cast>
export function parseSenateVotes(xml) {
  const out = {};
  for (const m of xml.matchAll(/<member>([\s\S]*?)<\/member>/g)) {
    const g = (tag) => (m[1].match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1] || '';
    out[`${g('state')}|${g('last_name').toLowerCase()}`] = normCast(g('vote_cast'));
  }
  return out;
}
export function senateMeta(xml) {
  const g = (tag) => (xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1] || '';
  return { question: g('vote_question_text'), result: g('vote_result_text'), title: g('vote_title'), document: g('vote_document_text') };
}

async function getText(url, tries = 3) {
  for (let a = 1; a <= tries; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'promise-tracker' } });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await sleep(1500 * a);
  }
  return null;
}

const billKey = (c, t, n) => `${c}-${t.toLowerCase()}-${n}`;
// Voteview "HR3424" / "HRES583" / "S5" / "HJRES12" -> { type:'hr', number:'3424' }
export function parseBillNumber(s) {
  const m = String(s || '').match(/^(HR|HRES|HJRES|HCONRES|S|SRES|SJRES|SCONRES)(\d+)$/i);
  return m ? { type: m[1].toLowerCase(), number: m[2] } : null;
}

async function main() {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) { console.error('CONGRESS_API_KEY is not set.'); process.exit(1); }
  const args = process.argv.slice(2);
  const outDir = args[0];
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const states = opt('--states', 'NC,VA').split(',');
  const congresses = opt('--congresses', '118,119').split(',').map(Number);
  mkdirSync(outDir, { recursive: true });

  const officials = readData('officials', []).filter((o) => states.includes(o.state) && o.bioguide);
  const summary = { officials: officials.length, votes: 0, verified: 0, disagree: 0, officialMissing: 0, notMember: 0 };
  const bills = {};
  const perOfficial = Object.fromEntries(officials.map((o) => [o.id, []]));

  for (const congress of congresses) {
    for (const [chamber, letter] of [['house', 'H'], ['senate', 'S']]) {
      const group = officials.filter((o) => o.chamber === chamber);
      if (!group.length) continue;
      console.log(`== ${letter}${congress}`);
      const membersCsv = parseCsv(await getText(`${VV}members/${letter}${congress}_members.csv`));
      const mh = membersCsv[0];
      const icpsrByBio = {};
      membersCsv.slice(1).forEach((r) => { const b = r[mh.indexOf('bioguide_id')]; if (b) icpsrByBio[b] = r[mh.indexOf('icpsr')]; });
      const mine = group.filter((o) => icpsrByBio[o.bioguide]);
      if (!mine.length) continue;
      const wanted = new Set(mine.map((o) => icpsrByBio[o.bioguide]));

      const rc = parseCsv(await getText(`${VV}rollcalls/${letter}${congress}_rollcalls.csv`));
      const rh = rc[0];
      const col = (n) => rh.indexOf(n);
      const rolls = {};
      rc.slice(1).forEach((r) => { rolls[r[col('rollnumber')]] = { date: r[col('date')], session: r[col('session')], clerkRoll: r[col('clerk_rollnumber')], bill: r[col('bill_number')], result: r[col('vote_result')], desc: r[col('vote_desc')], question: r[col('vote_question')] }; });

      const votesText = await getText(`${VV}votes/${letter}${congress}_votes.csv`);
      const castsByRoll = {};
      for (const line of votesText.split('\n').slice(1)) {
        const p = line.split(',');
        if (p.length < 5 || !wanted.has(p[3])) continue;
        (castsByRoll[p[2]] = castsByRoll[p[2]] || {})[p[3]] = castFromVoteview(p[4]);
      }

      const rollNumbers = Object.keys(castsByRoll);
      console.log(`${rollNumbers.length} roll calls with our members; verifying against the official record`);
      await pool(rollNumbers, 6, async (rn) => {
        const meta = rolls[rn];
        if (!meta) return;
        summary.votes++;
        const year = meta.date.slice(0, 4);
        const sess = meta.session;
        let official = {}, om = {};
        if (chamber === 'house') {
          const xml = await getText(`https://clerk.house.gov/evs/${year}/roll${String(meta.clerkRoll).padStart(3, '0')}.xml`);
          if (xml) { official = parseClerkVotes(xml); om = clerkMeta(xml); }
        } else {
          const xml = await getText(`https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${sess}/vote_${congress}_${sess}_${String(meta.clerkRoll).padStart(5, '0')}.xml`);
          if (xml) { official = parseSenateVotes(xml); om = senateMeta(xml); }
        }
        for (const o of mine) {
          const vv = castsByRoll[rn][icpsrByBio[o.bioguide]];
          if (!vv) { summary.notMember++; continue; }
          const off = chamber === 'house' ? official[o.bioguide] : official[`${o.state}|${o.name.split(' ').pop().toLowerCase()}`] || official[`${o.state}|${o.name.replace(/,.*$/, '').split(' ').pop().toLowerCase()}`];
          if (!off) { summary.officialMissing++; continue; }
          if (off !== vv) { summary.disagree++; continue; }
          summary.verified++;
          const bn = parseBillNumber(meta.bill);
          perOfficial[o.id].push({
            id: `${letter.toLowerCase()}${congress}-${sess}-${meta.clerkRoll}`, chamber, congress, session: Number(sess), roll: Number(meta.clerkRoll), date: meta.date,
            bill: bn ? { congress, type: bn.type, number: bn.number } : null,
            question: om.question || meta.question, result: om.result || meta.result,
            desc: om.desc || om.title || meta.desc, document: om.document || '', cast: off,
            sources: {
              official: chamber === 'house' ? `https://clerk.house.gov/evs/${year}/roll${String(meta.clerkRoll).padStart(3, '0')}.xml` : `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${sess}/vote_${congress}_${sess}_${String(meta.clerkRoll).padStart(5, '0')}.htm`,
              voteview: `https://voteview.com/rollcall/R${letter}${congress}${String(rn).padStart(4, '0')}`,
            },
          });
          if (bn) bills[billKey(congress, bn.type, bn.number)] = null;
        }
      });
    }
  }

  // Bill titles and subjects (Congress.gov)
  const keys = Object.keys(bills);
  console.log(`${keys.length} bills to look up`);
  await pool(keys, 4, async (k) => {
    const [c, t, n] = k.split('-');
    try {
      const j = await getJson(`${CG}/bill/${c}/${t}/${n}?format=json&api_key=${key}`, { keys: [key], tries: 3 });
      const b = j.bill || {};
      bills[k] = { title: b.title || '', policyArea: (b.policyArea && b.policyArea.name) || '', latestAction: (b.latestAction && b.latestAction.text) || '', url: b.legislationUrl || '' };
    } catch (e) { bills[k] = { title: '', policyArea: '', latestAction: '', url: '', error: e.message }; }
  });
  writeFileSync(join(outDir, 'bills.json'), JSON.stringify(bills));

  for (const o of officials) {
    const list = perOfficial[o.id].sort((a, b) => (a.date < b.date ? 1 : -1));
    list.forEach((v) => { if (v.bill) { const b = bills[billKey(v.congress, v.bill.type, v.bill.number)]; if (b) v.bill = { ...v.bill, ...b }; } });
    writeFileSync(join(outDir, `votes-${o.id}.json`), JSON.stringify(list));
  }

  // Sponsored and cosponsored legislation
  await pool(officials, 3, async (o) => {
    const out = { sponsored: [], cosponsored: [] };
    for (const kind of ['sponsored', 'cosponsored']) {
      for (let offset = 0; offset < 4000; offset += 250) {
        let j;
        try { j = await getJson(`${CG}/member/${o.bioguide}/${kind}-legislation?limit=250&offset=${offset}&format=json&api_key=${key}`, { keys: [key] }); } catch (e) { console.log(`${o.id} ${kind}: ${e.message}`); break; }
        const items = j[`${kind}Legislation`] || [];
        items.forEach((b) => out[kind].push({ congress: b.congress, type: b.type, number: b.number, title: b.title, introduced: b.introducedDate, policyArea: (b.policyArea && b.policyArea.name) || '', latestAction: (b.latestAction && b.latestAction.text) || '', latestActionDate: (b.latestAction && b.latestAction.actionDate) || '', url: `https://www.congress.gov/bill/${b.congress}th-congress/${b.type.toLowerCase().startsWith('h') ? 'house' : 'senate'}-${/res/i.test(b.type) ? (/con/i.test(b.type) ? 'concurrent-resolution' : /j/i.test(b.type) ? 'joint-resolution' : 'resolution') : 'bill'}/${b.number}` }));
        if (!j.pagination || !j.pagination.next || !items.length) break;
      }
    }
    writeFileSync(join(outDir, `legislation-${o.id}.json`), JSON.stringify(out));
    console.log(`${o.id}: ${out.sponsored.length} sponsored, ${out.cosponsored.length} cosponsored`);
  });

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ ...summary, gathered: new Date().toISOString() }, null, 1));
  console.log(summary);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
