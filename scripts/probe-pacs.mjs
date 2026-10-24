// Probe: can OpenFEC give a candidate's largest committee (PAC) contributors, and how complete is it?
const KEY = process.env.FEC_API_KEY;
const api = async (path, q = {}) => {
  const u = new URL('https://api.open.fec.gov/v1' + path);
  Object.entries({ api_key: KEY, ...q }).forEach(([k, v]) => Array.isArray(v) ? v.forEach((x) => u.searchParams.append(k, x)) : u.searchParams.set(k, v));
  const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${path} ${(await r.text()).slice(0, 120)}`); return r.json();
};
const officials = JSON.parse((await import('node:fs')).readFileSync('data/officials.json', 'utf8'));
for (const id of ['nc-14-m001236', 'va-06-c001118', 'nc-04-f000477']) {
  const o = officials.find((x) => x.id === id);
  const fec = [...(o.fecIds || [])].reverse().find((x) => x.startsWith(o.chamber === 'senate' ? 'S' : 'H'));
  console.log(id, o.name, fec);
  try {
    const c = await api(`/candidate/${fec}/committees/`, { designation: 'P', per_page: 5 });
    const com = c.results[0]; console.log(' principal committee', com && com.committee_id, com && com.name);
    for (const cycle of [2026, 2024]) {
      const t = await api('/schedules/schedule_a/', { committee_id: com.committee_id, two_year_transaction_period: cycle, contributor_type: 'committee', sort: '-contribution_receipt_amount', per_page: 100, is_individual: 'false' });
      const rows = t.results; const by = {};
      rows.forEach((r) => { const n = (r.contributor_name || '').trim(); by[n] = (by[n] || 0) + (r.contribution_receipt_amount || 0); });
      const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8);
      console.log(' cycle', cycle, 'rows', rows.length, 'of', t.pagination && t.pagination.count, 'top:', JSON.stringify(top));
    }
    const tot = await api(`/committee/${com.committee_id}/totals/`, { per_page: 3 });
    console.log(' totals', JSON.stringify(tot.results.slice(0, 2).map((r) => ({ cycle: r.cycle, receipts: r.receipts, pac: r.other_political_committee_contributions, party: r.political_party_committee_contributions, indiv: r.individual_contributions }))));
  } catch (e) { console.log(' error', e.message); }
}
