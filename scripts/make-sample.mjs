// Generates data/*.json: a FICTIONAL sample dataset used until the real pipeline runs.
// Every person, bill, article and dollar amount below is invented for demonstration.
// Usage: node scripts/make-sample.mjs
import { writeFileSync } from 'node:fs';

const TODAY = '2026-10-17';
const out = (name, obj) => writeFileSync(new URL(`../data/${name}.json`, import.meta.url), JSON.stringify(obj, null, 1) + '\n');

const categories = [
  ['healthcare', 'Healthcare'], ['taxes', 'Taxes'], ['economy', 'Economy & jobs'], ['immigration', 'Immigration'],
  ['environment', 'Environment & energy'], ['education', 'Education'], ['infrastructure', 'Infrastructure'], ['public-safety', 'Public safety'],
].map(([id, name]) => ({ id, name }));

// reliability/lean are editorial ratings described on the Methodology page.
const sources = [
  { id: 'congress-gov', name: 'Congress.gov', kind: 'primary', reliability: 'high', lean: 'n/a', note: 'Official record of bills, votes and law status.' },
  { id: 'fec-gov', name: 'FEC filings', kind: 'primary', reliability: 'high', lean: 'n/a', note: 'Federal Election Commission campaign finance filings.' },
  { id: 'govtrack', name: 'GovTrack', kind: 'primary', reliability: 'high', lean: 'n/a', note: 'Open-data mirror of congressional records.' },
  { id: 'own-words', name: "Official's own statement", kind: 'primary', reliability: 'high', lean: 'n/a', note: 'Campaign site, press release, floor remarks or transcript.' },
  { id: 'politifact', name: 'PolitiFact', kind: 'factcheck', reliability: 'high', lean: 'n/a', note: 'Fact-checker (secondary source). We do not assign lean to fact-checkers; see Methodology.' },
  { id: 'factcheck-org', name: 'FactCheck.org', kind: 'factcheck', reliability: 'high', lean: 'n/a', note: 'Fact-checker (secondary source).' },
  { id: 'sample-ledger', name: 'Lakeshore Ledger (sample)', kind: 'news', reliability: 'medium', lean: 'left', note: 'Fictional outlet used in the sample data.' },
  { id: 'sample-standard', name: 'Prairie Standard (sample)', kind: 'news', reliability: 'medium', lean: 'right', note: 'Fictional outlet used in the sample data.' },
  { id: 'sample-wire', name: 'Capital Wire (sample)', kind: 'news', reliability: 'high', lean: 'center', note: 'Fictional wire service used in the sample data.' },
];

const O = (id, name, party, state, district, since, committees, chamber = 'house') => ({
  id, chamber, name, party, state, district, firstElected: since - 1, inOfficeSince: since, photo: null, sample: true,
  committees, contact: { phone: '(202) 555-0100', website: 'https://example.org/sample', office: `Sample Office Building, Washington, DC` },
  updated: TODAY,
});
const officials = [
  O('oh01', 'Morgan Ellis', 'D', 'OH', '01', 2021, ['Energy and Commerce', 'Veterans\' Affairs']),
  O('oh02', 'Casey Whitfield', 'R', 'OH', '02', 2019, ['Ways and Means', 'Budget']),
  O('ohs1', 'Riley Navarro', 'R', 'OH', null, 2017, ['Finance', 'Agriculture'], 'senate'),
  O('tx01', 'Taylor Brandt', 'R', 'TX', '01', 2023, ['Energy and Commerce', 'Homeland Security']),
  O('tx02', 'Jamie Okafor', 'D', 'TX', '02', 2021, ['Education and Workforce', 'Small Business']),
  O('ca01', 'Quinn Halloran', 'D', 'CA', '01', 2019, ['Natural Resources', 'Transportation']),
  O('ca02', 'Avery Lindgren', 'R', 'CA', '02', 2023, ['Agriculture', 'Natural Resources']),
  O('pa01', 'Sam Delacroix', 'D', 'PA', '01', 2017, ['Ways and Means', 'Education and Workforce']),
  O('pa02', 'Drew Kowalski', 'R', 'PA', '02', 2021, ['Transportation', 'Energy and Commerce']),
];

const S = (outletId, title, date, url) => ({ outletId, title, date, url: url || `https://example.org/sample/${outletId}/${date}` });
const CG = (title, date) => S('congress-gov', title, date, 'https://www.congress.gov/');
const FEC = (title, date) => S('fec-gov', title, date, 'https://www.fec.gov/');
const OW = (title, date) => S('own-words', title, date, 'https://example.org/sample/statement/' + date);

// Promises: same fields, same rules, for every official.
const P = (officialId, n, category, text, madeOn, source, status, evidence, howRated, extra = {}) => ({
  id: `${officialId}:${n}`, officialId, category, text, madeOn, source, status, evidence, howRated,
  statusNote: extra.statusNote || '', contested: !!extra.contested, opposesIndustries: extra.opposes || [], reviewedOn: TODAY, review: 'human-reviewed (sample)',
});
const promises = [
  P('oh01', 1, 'healthcare', 'Lower prescription drug costs for seniors.', '2020-09-14', OW('Campaign website, archived', '2020-09-14'), 'kept',
    [CG('H.R. 9001 (sample): Senior Drug Cost Act, signed into law', '2023-03-02'), S('sample-wire', 'Senior drug cap becomes law', '2023-03-03'), S('politifact', 'Rated: Promise Kept', '2023-04-10')],
    'A bill the official sponsored became law and capped out-of-pocket drug costs for seniors. The law text, the wire report and a fact-check agree.', { opposes: ['pharma'] }),
  P('oh01', 2, 'environment', 'Oppose new drilling on public lands.', '2020-10-01', OW('Debate transcript', '2020-10-01'), 'partial',
    [CG('Roll call 212 (sample): voted for restrictions on new leases', '2022-06-09'), CG('Roll call 340 (sample): voted for a bill that allowed some leases', '2023-11-02'), S('sample-ledger', 'Mixed record on leases', '2023-11-04')],
    'Voted for restrictions once and for a bill that allowed some new leases once. Both votes are linked below.', { contested: true }),
  P('oh01', 3, 'infrastructure', 'Bring broadband to every rural county in the district.', '2020-08-20', OW('Campaign website, archived', '2020-08-20'), 'progress',
    [CG('H.R. 9120 (sample): co-sponsored rural broadband grants, in committee', '2024-02-15')],
    'Co-sponsored a bill that has not passed. Work is ongoing, so no final rating is given.'),
  P('oh02', 1, 'taxes', 'Cut taxes for small businesses.', '2018-09-12', OW('Campaign website, archived', '2018-09-12'), 'kept',
    [CG('H.R. 9002 (sample): Small Business Tax Relief Act, signed into law', '2021-12-14'), S('sample-wire', 'Small business tax law signed', '2021-12-15')],
    'Voted for and co-sponsored a law that lowered the small-business rate. Law text and a wire report agree.'),
  P('oh02', 2, 'healthcare', 'Lower prescription drug costs for seniors.', '2018-10-10', OW('Debate transcript', '2018-10-10'), 'broken',
    [CG('Roll call 188 (sample): voted against the Senior Drug Cost Act', '2023-02-24'), S('sample-ledger', 'Voted no on drug cap', '2023-02-25'), S('sample-standard', 'Why he voted no: cost concerns', '2023-02-26')],
    'Voted against the main bill on this topic; the official has said the bill cost too much. Sources from different outlets agree on the vote.', { contested: true, opposes: ['pharma'] }),
  P('oh02', 3, 'economy', 'Balance the federal budget within a decade.', '2018-08-02', OW('Press release', '2018-08-02'), 'unverifiable',
    [CG('Budget resolution votes (sample)', '2022-04-01')],
    'The promise has no measurable target date or bill. Only one independent source is on file.'),
  P('ohs1', 1, 'economy', 'Protect manufacturing jobs in the state.', '2016-09-09', OW('Campaign website, archived', '2016-09-09'), 'partial',
    [CG('S. 9003 (sample): manufacturing credit, passed', '2019-05-20'), S('sample-wire', 'Plant closings continue despite credit', '2022-01-12')],
    'Sponsored a credit that passed; job totals in the state have been mixed.'),
  P('tx01', 1, 'public-safety', 'Increase funding for border and port security.', '2022-09-20', OW('Campaign website, archived', '2022-09-20'), 'kept',
    [CG('Roll call 301 (sample): voted for the Port Security Funding Act', '2023-09-14'), CG('H.R. 9004 (sample): signed into law', '2023-10-01'), S('sample-standard', 'Port funding signed', '2023-10-02')],
    'Voted for and the law increased port security funding.'),
  P('tx01', 2, 'environment', 'Block new federal limits on oil and gas.', '2022-10-05', OW('Debate transcript', '2022-10-05'), 'progress',
    [CG('H.R. 9130 (sample): co-sponsored, awaiting floor vote', '2024-03-02')],
    'Co-sponsored a bill that has not passed.', { opposes: ['environmental-groups'] }),
  P('tx02', 1, 'education', 'Make community college tuition-free.', '2020-09-30', OW('Campaign website, archived', '2020-09-30'), 'broken',
    [CG('Roll call 275 (sample): voted for the version of the bill that dropped the tuition provision', '2023-07-19'), S('sample-ledger', 'Tuition provision dropped', '2023-07-20'), S('sample-standard', 'Free college plan stalls', '2023-07-21')],
    'The provision was removed and the official voted for the final bill without it. Sources from left- and right-leaning outlets agree on the facts.'),
  P('tx02', 2, 'healthcare', 'Expand access to rural clinics.', '2020-09-30', OW('Campaign website, archived', '2020-09-30'), 'kept',
    [CG('H.R. 9005 (sample): Rural Clinics Act, signed into law', '2022-11-30'), S('factcheck-org', 'Checked: clinic funding claim', '2023-01-12')],
    'Sponsored a law that funded rural clinics.'),
  P('ca01', 1, 'environment', 'Reach 100% clean electricity by 2035.', '2018-09-05', OW('Campaign website, archived', '2018-09-05'), 'progress',
    [CG('H.R. 9140 (sample): Clean Grid Act, in committee', '2024-04-10'), S('sample-ledger', 'Clean grid target faces hurdles', '2024-05-01')],
    'Sponsor of a bill that has not passed, so the promise is still pending.', { contested: true }),
  P('ca01', 2, 'infrastructure', 'Fund high-speed rail.', '2018-09-05', OW('Campaign website, archived', '2018-09-05'), 'unverifiable',
    [S('sample-ledger', 'Rail project timeline', '2022-02-02')],
    'Only one independent source is on file and no bill ties directly to the promise.'),
  P('ca02', 1, 'taxes', 'Repeal the state and local tax cap.', '2022-09-12', OW('Campaign website, archived', '2022-09-12'), 'partial',
    [CG('Roll call 220 (sample): voted for a higher cap', '2023-06-01'), S('sample-wire', 'Higher cap passes House, stalls', '2023-06-02')],
    'Voted for raising the cap, which is not a full repeal.'),
  P('pa01', 1, 'economy', 'Raise the federal minimum wage.', '2016-09-20', OW('Campaign website, archived', '2016-09-20'), 'kept',
    [CG('Roll call 150 (sample): voted for the Wage Act', '2021-03-11'), CG('H.R. 9006 (sample): Wage Act signed', '2021-03-30'), S('sample-wire', 'Minimum wage law signed', '2021-03-31')],
    'The law passed with this official voting yes.'),
  P('pa02', 1, 'infrastructure', 'Repair roads and bridges in the district.', '2020-09-18', OW('Campaign website, archived', '2020-09-18'), 'kept',
    [CG('H.R. 9007 (sample): Infrastructure Act, signed', '2021-11-15'), S('sample-standard', 'Bridge repair funds arrive', '2022-06-01')],
    'Voted for the law; district bridge funds were announced.'),
  P('pa02', 2, 'public-safety', 'Hire more police officers.', '2020-09-18', OW('Press release', '2020-09-18'), 'broken',
    [CG('Roll call 260 (sample): voted against a grant program for police hiring', '2023-05-10')],
    'Voted against a bill with police hiring grants, citing other provisions. Only the official vote record is on file so far.'),
];

// Votes (sample): "relation" says whether the vote is consistent with or contradicts a promise.
const V = (id, date, chamber, rollCall, billId, title, question, result, byOfficial, issues, links) => ({
  id, date, chamber, rollCall, billId, title, question, result, byOfficial, issues, outletId: 'congress-gov', url: 'https://www.congress.gov/', promiseLinks: links,
});
const votes = [
  V('v1', '2026-10-08', 'house', 612, 'H.R. 9300 (sample)', 'Rural Clinic Funding Extension', 'On passage', 'Passed 228-201',
    { tx02: 'Yea', oh01: 'Yea', ca01: 'Yea', pa01: 'Yea', oh02: 'Nay', tx01: 'Nay', ca02: 'Yea', pa02: 'Yea' }, ['healthcare'],
    [{ promiseId: 'tx02:2', relation: 'consistent', explain: 'This extends funding for rural clinics, which matches the promise to expand access to rural clinics.' }]),
  V('v2', '2026-10-01', 'house', 598, 'H.R. 9310 (sample)', 'Public Lands Lease Review Act', 'On passage', 'Passed 215-212',
    { oh01: 'Nay', ca01: 'Yea', tx01: 'Nay', pa02: 'Yea', oh02: 'Nay', ca02: 'Nay', tx02: 'Yea', pa01: 'Yea' }, ['environment'],
    [{ promiseId: 'oh01:2', relation: 'consistent', explain: 'The bill would have required fewer reviews before new leases. The official promised to oppose new drilling and voted no, which fits the promise.' }]),
  V('v3', '2026-09-24', 'house', 580, 'H.R. 9320 (sample)', 'Police Hiring Grants Act', 'On passage', 'Passed 230-199',
    { pa02: 'Nay', pa01: 'Yea', oh02: 'Yea', tx01: 'Yea', ca01: 'Yea', ca02: 'Yea', oh01: 'Yea', tx02: 'Yea' }, ['public-safety'],
    [{ promiseId: 'pa02:2', relation: 'contradicts', explain: 'This bill funds police hiring, which the official promised to support. The official voted no and cited unrelated provisions in the bill.' }]),
  V('v4', '2026-09-10', 'house', 561, 'H.R. 9330 (sample)', 'Clean Grid Act', 'On passage', 'Failed 201-228',
    { ca01: 'Yea', oh01: 'Yea', pa01: 'Yea', tx02: 'Yea', oh02: 'Nay', tx01: 'Nay', ca02: 'Nay', pa02: 'Nay' }, ['environment'],
    [{ promiseId: 'ca01:1', relation: 'consistent', explain: 'This bill sets the 2035 clean electricity target the official promised. The official voted yes; the bill did not pass.' }]),
  V('v5', '2026-08-30', 'house', 540, 'H.R. 9340 (sample)', 'State and Local Tax Deduction Act', 'On passage', 'Passed 219-210',
    { ca02: 'Yea', pa01: 'Yea', oh02: 'Yea', oh01: 'Nay', tx01: 'Yea', tx02: 'Nay', ca01: 'Nay', pa02: 'Yea' }, ['taxes'],
    [{ promiseId: 'ca02:1', relation: 'consistent', explain: 'Raises the deduction cap further. The official promised repeal and voted yes on this step.' }]),
];

// Finance (sample, fictional numbers).
const F = (officialId, raised, small, self, donors, industries, pacs) => [officialId, {
  cycle: '2024', totalRaised: raised, smallDollarPct: small, largeDollarPct: 100 - small - self, selfFundedPct: self,
  topDonors: donors.map(([name, amount]) => ({ name, amount })),
  industries: industries.map(([id, name, amount]) => ({ id, name, amount })),
  pacs: pacs.map(([name, amount]) => ({ name, amount })),
  source: { label: 'FEC filings (sample numbers)', url: 'https://www.fec.gov/' }, updated: TODAY,
}];
const finance = Object.fromEntries([
  F('oh01', 1850000, 34, 0, [['Sample Health Partners PAC', 15000], ['Lakeside Teachers Fund', 12000]], [['pharma', 'Pharmaceuticals', 142000], ['education', 'Education', 98000], ['energy', 'Energy', 61000]], [['Sample Health Partners PAC', 15000]]),
  F('oh02', 2300000, 12, 2, [['Buckeye Business Alliance', 20000], ['Midwest Pharma PAC', 18000]], [['pharma', 'Pharmaceuticals', 310000], ['finance', 'Finance', 220000], ['energy', 'Energy', 90000]], [['Midwest Pharma PAC', 18000]]),
  F('ohs1', 6100000, 18, 0, [['Heartland Manufacturers PAC', 25000]], [['manufacturing', 'Manufacturing', 540000], ['finance', 'Finance', 410000]], [['Heartland Manufacturers PAC', 25000]]),
  F('tx01', 2750000, 15, 0, [['Lone Star Energy PAC', 30000]], [['energy', 'Energy', 480000], ['finance', 'Finance', 230000]], [['Lone Star Energy PAC', 30000]]),
  F('tx02', 1400000, 41, 0, [['Educators United', 11000]], [['education', 'Education', 120000], ['finance', 'Finance', 70000]], [['Educators United', 11000]]),
  F('ca01', 2100000, 39, 0, [['Pacific Clean Power PAC', 14000]], [['energy', 'Energy', 160000], ['environmental-groups', 'Environmental groups', 130000]], [['Pacific Clean Power PAC', 14000]]),
  F('ca02', 1900000, 22, 8, [['Central Valley Growers', 16000]], [['agriculture', 'Agriculture', 260000], ['energy', 'Energy', 75000]], [['Central Valley Growers', 16000]]),
  F('pa01', 1600000, 36, 0, [['Keystone Labor Fund', 13000]], [['labor', 'Labor unions', 190000], ['finance', 'Finance', 90000]], [['Keystone Labor Fund', 13000]]),
  F('pa02', 1500000, 20, 0, [['Pennsylvania Builders PAC', 12000]], [['construction', 'Construction', 205000], ['energy', 'Energy', 80000]], [['Pennsylvania Builders PAC', 12000]]),
]);

// ZIP -> district (sample). A ZIP spanning districts asks for a street address.
const zip = {
  '43201': [{ state: 'OH', district: '01' }],
  '43202': [{ state: 'OH', district: '02' }],
  '43215': [{ state: 'OH', district: '01' }, { state: 'OH', district: '02' }],
  '77001': [{ state: 'TX', district: '01' }],
  '78701': [{ state: 'TX', district: '02' }],
  '94102': [{ state: 'CA', district: '01' }],
  '95814': [{ state: 'CA', district: '02' }],
  '19103': [{ state: 'PA', district: '01' }],
  '17101': [{ state: 'PA', district: '02' }],
};

out('categories', categories);
out('sources', sources);
out('officials', officials);
out('promises', promises);
out('votes', votes);
out('finance', finance);
out('zip', zip);
out('meta', { isSample: true, generated: TODAY, note: 'Fictional sample data. Replace by running the data pipeline (see README).' });
console.log('sample data written');
