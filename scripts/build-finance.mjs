// Builds data/finance.json from OpenFEC: totals, small/large/self-funded shares, and the
// top employers reported for itemized individual contributions to the principal committee.
//   FEC_API_KEY=... node scripts/build-finance.mjs [--limit N] [--max-age-days 30] [--force]
// Employers are NOT an industry classification, so `industries` stays empty and no
// "possible conflict" flags are produced from this data until industries are mapped.
// An entry newer than --max-age-days is reused, which keeps weekly runs cheap (FEC allows ~1000 calls/hour).
import { fileURLToPath } from 'node:url';
import { getJson, readData, writeData } from './lib.mjs';

const FEC = 'https://api.open.fec.gov/v1';
const CYCLES = [2026, 2024];
const NOT_AN_EMPLOYER = /^(N\/?A|NONE|NOT EMPLOYED|RETIRED|SELF|SELF[- ]?EMPLOYED|HOMEMAKER|UNEMPLOYED|STUDENT|REQUESTED|INFORMATION REQUESTED.*|ATTORNEY|REFUSED|\.)$/i;

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
const pct = (part, whole) => (whole > 0 ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0);

// totals: one entry of /candidate/{id}/totals results. employers: by_employer results.
export function buildFinance(candidateId, cycle, totals, employers, today) {
  const raised = num(totals.receipts) || num(totals.contributions);
  const small = pct(num(totals.individual_unitemized_contributions), raised);
  const self = pct(num(totals.candidate_contribution), raised);
  return {
    cycle: String(cycle),
    totalRaised: raised,
    smallDollarPct: small,
    largeDollarPct: Math.max(0, 100 - small - self),
    selfFundedPct: self,
    employers: employers
      .filter((e) => e.employer && !NOT_AN_EMPLOYER.test(e.employer.trim()) && num(e.total) > 0)
      .map((e) => ({ name: e.employer.trim(), amount: Math.round(e.total) }))
      .slice(0, 10),
    industries: [],
    topDonors: [],
    pacs: [],
    source: { label: 'FEC filings via OpenFEC', url: `https://www.fec.gov/data/candidate/${candidateId}/` },
    updated: today,
  };
}

async function main() {
  const key = process.env.FEC_API_KEY;
  if (!key) { console.error('FEC_API_KEY is not set.'); process.exit(1); }
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const limit = Number(opt('--limit', 0));
  const maxAge = Number(opt('--max-age-days', 30)) * 86400000;
  const force = args.includes('--force');
  const today = new Date().toISOString().slice(0, 10);

  const officials = readData('officials', []).filter((o) => (o.fecIds || []).length);
  if (!officials.length) throw new Error('No officials with fecIds. Re-run the roster script (it now records FEC ids).');
  const finance = readData('finance', {});
  const want = (limit ? officials.slice(0, limit) : officials).filter((o) => force || !finance[o.id] || Date.now() - Date.parse(finance[o.id].updated) > maxAge);

  let done = 0, failed = 0;
  for (const o of want) {
    const prefix = o.chamber === 'senate' ? 'S' : 'H';
    const id = [...o.fecIds].reverse().find((x) => x.startsWith(prefix));
    if (!id) continue;
    try {
      let entry = null;
      for (const cycle of CYCLES) {
        const t = await getJson(`${FEC}/candidate/${id}/totals/?cycle=${cycle}&per_page=1&api_key=${key}`, { keys: [key] });
        const totals = (t.results || [])[0];
        if (!totals || !(num(totals.receipts) || num(totals.contributions))) continue;
        const c = await getJson(`${FEC}/candidate/${id}/committees/?cycle=${cycle}&designation=P&per_page=1&api_key=${key}`, { keys: [key] });
        const committee = (c.results || [])[0];
        let employers = [];
        if (committee) {
          const e = await getJson(`${FEC}/schedules/schedule_a/by_employer/?committee_id=${committee.committee_id}&cycle=${cycle}&sort=-total&per_page=20&api_key=${key}`, { keys: [key] });
          employers = e.results || [];
        }
        entry = buildFinance(id, cycle, totals, employers, today);
        break;
      }
      if (entry) finance[o.id] = entry;
      done++;
    } catch (e) {
      failed++;
      console.log(`${o.id} (${id}): ${e.message}`);
    }
    if (done % 25 === 0) writeData('finance', finance); // save progress on long runs
  }
  writeData('finance', finance);
  console.log(`Finance: ${done} updated, ${failed} failed, ${Object.keys(finance).length} total entries.`);
  if (failed > want.length / 2) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
