// Promise Tracker core logic: pure functions, shared by the browser app and node tests/scripts.
// Every official is rated by exactly the same rules below; nothing here looks at party
// except biasCheck(), which only reports totals.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const STATUSES = {
    kept: { label: 'Kept', icon: '✓' },
    partial: { label: 'Partially Kept', icon: '½' },
    broken: { label: 'Broken', icon: '✕' },
    progress: { label: 'In Progress', icon: '…' },
    unverifiable: { label: 'Unverifiable', icon: '?' },
  };

  // Tunable, documented on the Methodology page.
  const RULES = {
    minIndependentSources: 2, // required for a "Kept" or "Broken" rating
    conflictMinAmount: 25000, // dollars from one industry
    conflictMinShare: 0.05, // share of total receipts
  };

  RULES.verdictNeedsVote = true; // Kept / Broken must rest on a recorded vote that matches (Kept) or contradicts (Broken) the promise

  const PRIMARY_KINDS = new Set(['primary']);

  function sourceIndex(outlets) {
    return Object.fromEntries(outlets.map((o) => [o.id, o]));
  }

  // Independent = different outlets. Two links to the same outlet count once.
  // The promise's own source (the quote) is not evidence about whether it was kept.
  function independentSources(promise) {
    const seen = new Set();
    (promise.evidence || []).forEach((e) => { if (e.outletId && e.url) seen.add(e.outletId); });
    return seen;
  }

  // The status shown to users. A Kept/Broken claim without enough independent
  // sources is shown as Unverifiable, with the reason attached.
  function effectiveStatus(promise) {
    const n = independentSources(promise).size;
    const claimed = promise.status;
    if ((claimed === 'kept' || claimed === 'broken') && n < RULES.minIndependentSources) {
      return {
        status: 'unverifiable',
        claimed,
        downgraded: true,
        reason: `Researchers proposed "${STATUSES[claimed].label}", but only ${n} independent source${n === 1 ? '' : 's'} ` +
          `${n === 1 ? 'is' : 'are'} on file. We require ${RULES.minIndependentSources}.`,
      };
    }
    if (RULES.verdictNeedsVote && (claimed === 'kept' || claimed === 'broken')) {
      const want = claimed === 'kept' ? 'consistent' : 'contradicts';
      const hasVote = (promise.evidence || []).some((e) => e.type === 'vote' && e.supports === want);
      if (!hasVote) {
        return {
          status: 'unverifiable', claimed, downgraded: true,
          reason: `Researchers proposed "${STATUSES[claimed].label}", but no recorded vote ${claimed === 'kept' ? 'consistent with' : 'against'} the promise is on file. ` +
            'Kept and Broken ratings must rest on how the official voted.',
        };
      }
    }
    return { status: claimed, claimed, downgraded: false, reason: '' };
  }

  // High / Medium / Low with a short explanation.
  function confidence(promise, outlets) {
    const idx = sourceIndex(outlets);
    const ids = [...independentSources(promise)];
    const n = ids.length;
    const primary = ids.filter((id) => idx[id] && PRIMARY_KINDS.has(idx[id].kind)).length;
    const lows = ids.filter((id) => idx[id] && idx[id].reliability === 'low').length;
    let level, why;
    if (n >= 2 && primary >= 1 && lows === 0) {
      level = 'High';
      why = `${n} independent sources, including ${primary} primary record${primary === 1 ? '' : 's'} (votes, bills, filings or the official's own words).`;
    } else if (n >= 2) {
      level = 'Medium';
      why = `${n} independent sources, but ${primary ? 'some are lower-reliability' : 'none are primary records'}.`;
    } else {
      level = 'Low';
      why = n === 1 ? 'Only 1 independent source on file.' : 'No independent evidence on file.';
    }
    if (promise.contested) {
      const leans = new Set(ids.map((id) => (idx[id] ? idx[id].lean : null)).filter((l) => l && l !== 'n/a'));
      const spans = leans.has('left') && leans.has('right') || (leans.has('center') && leans.size >= 2);
      if (!spans) {
        if (level === 'High') level = 'Medium';
        why += ' This rating is contested and the sources do not yet span the political spectrum.';
      }
    }
    return { level, why };
  }

  // Counts and percentages over all tracked promises, using effective statuses.
  function scorecard(promises) {
    const counts = { kept: 0, partial: 0, broken: 0, progress: 0, unverifiable: 0 };
    promises.forEach((p) => { counts[effectiveStatus(p).status]++; });
    const total = promises.length;
    const pct = {};
    Object.keys(counts).forEach((k) => { pct[k] = total ? Math.round((counts[k] / total) * 100) : 0; });
    return { total, counts, pct };
  }

  // Ratio of Kept / Broken ratings by party, shown on the Methodology page.
  function biasCheck(officials, promises) {
    const party = Object.fromEntries(officials.map((o) => [o.id, o.party]));
    const rows = {};
    promises.forEach((p) => {
      const pt = party[p.officialId];
      if (!pt) return;
      const r = (rows[pt] = rows[pt] || { party: pt, officials: new Set(), total: 0, kept: 0, broken: 0 });
      r.officials.add(p.officialId);
      r.total++;
      const s = effectiveStatus(p).status;
      if (s === 'kept') r.kept++;
      if (s === 'broken') r.broken++;
    });
    return Object.values(rows).map((r) => ({
      party: r.party,
      officials: r.officials.size,
      total: r.total,
      kept: r.kept,
      broken: r.broken,
      keptPct: r.total ? Math.round((r.kept / r.total) * 100) : 0,
      brokenPct: r.total ? Math.round((r.broken / r.total) * 100) : 0,
      ratio: r.broken ? Math.round((r.kept / r.broken) * 100) / 100 : null,
    }));
  }

  // Largest single donor group on file and its share of everything raised. Donor groups are the employers
  // individual donors report to the FEC (PAC and organization rows are used first when a file has them).
  function topDonor(finance) {
    if (!finance || !(finance.totalRaised > 0)) return null;
    const rows = [...(finance.pacs || []), ...(finance.topDonors || []), ...(finance.employers || [])].filter((r) => r && r.name && r.amount > 0);
    if (!rows.length) return null;
    const top = rows.reduce((a, b) => (b.amount > a.amount ? b : a));
    const own = (finance.pacs || []).includes(top) || (finance.topDonors || []).includes(top);
    return { name: top.name, amount: top.amount, pct: (top.amount / finance.totalRaised) * 100, kind: own ? 'organization' : 'employer' };
  }

  // Donor money against documented organization positions on a vote.
  // positions: [{ org, patterns:[regex source], voteIds:[...], position:'support'|'oppose', url }]
  // Only donors whose organization published a position count; everyone else is left out, not guessed.
  // This measures overlap. It does not show that money caused a vote.
  function donorAlignment(finance, positions, voteId, cast) {
    if (!finance || !(finance.totalRaised > 0)) return null;
    const recs = (positions || []).filter((p) => (p.voteIds || []).includes(voteId));
    if (!recs.length) return null;
    const donors = [...(finance.pacs || []), ...(finance.topDonors || []), ...(finance.employers || [])];
    const sum = { support: 0, oppose: 0 };
    const rows = [];
    const seen = new Set();
    for (const p of recs) {
      const re = new RegExp((p.patterns || []).join('|'), 'i');
      for (const d of donors) {
        const key = `${d.name}|${p.position}`;
        if (!re.test(d.name) || seen.has(key)) continue;
        seen.add(key);
        sum[p.position] += d.amount;
        rows.push({ donor: d.name, org: p.org, position: p.position, amount: d.amount, url: p.url });
      }
    }
    const pct = (n) => (n / finance.totalRaised) * 100;
    const moneyFavors = sum.support > sum.oppose ? 'support' : sum.oppose > sum.support ? 'oppose' : null;
    const c = { Aye: 'Yea', Yes: 'Yea', No: 'Nay' }[cast] || cast;
    const votedSide = c === 'Yea' ? 'support' : c === 'Nay' ? 'oppose' : null;
    return {
      supportAmount: sum.support, opposeAmount: sum.oppose, supportPct: pct(sum.support), opposePct: pct(sum.oppose), rows,
      moneyFavors, votedSide, votedWithMoney: moneyFavors && votedSide ? moneyFavors === votedSide : null,
    };
  }

  // Overlap across every (official, vote) pair that has donor money on at least one documented side.
  // Compared with how often the same officials voted with the majority of their own party on those votes.
  function donorSummary(officials, votes, finance, positions) {
    const pairs = [];
    for (const v of votes) {
      const casts = Object.entries(v.byOfficial || {}).filter(([, c]) => c === 'Yea' || c === 'Nay' || c === 'Aye' || c === 'No');
      for (const [id, cast] of casts) {
        const o = officials.find((x) => x.id === id);
        const a = o && donorAlignment(finance[id], positions, v.id, cast);
        if (!a || a.votedWithMoney === null) continue;
        const mates = casts.filter(([oid]) => { const m = officials.find((x) => x.id === oid); return m && m.party === o.party; });
        const yea = mates.filter(([, c]) => c === 'Yea' || c === 'Aye').length;
        const partySide = yea * 2 === mates.length ? null : yea * 2 > mates.length ? 'Yea' : 'Nay';
        const norm = { Aye: 'Yea', No: 'Nay' }[cast] || cast;
        pairs.push({ officialId: id, voteId: v.id, cast: norm, votedWithMoney: a.votedWithMoney, votedWithParty: partySide ? partySide === norm : null, supportPct: a.supportPct, opposePct: a.opposePct });
      }
    }
    const rate = (xs, k) => { const d = xs.filter((x) => x[k] !== null); return d.length ? { n: d.length, withCount: d.filter((x) => x[k]).length, pct: Math.round((d.filter((x) => x[k]).length / d.length) * 100) } : { n: 0, withCount: 0, pct: null }; };
    return { pairs, withMoney: rate(pairs, 'votedWithMoney'), withParty: rate(pairs, 'votedWithParty') };
  }

  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

  // Possible conflicts: a promise that names industries it would oppose, and
  // reported money from those industries above both thresholds. Facts only.
  function conflicts(official, promises, finance) {
    if (!finance) return [];
    const out = [];
    promises.filter((p) => p.officialId === official.id).forEach((p) => {
      (p.opposesIndustries || []).forEach((ind) => {
        const row = (finance.industries || []).find((i) => i.id === ind);
        if (!row) return;
        const share = finance.totalRaised ? row.amount / finance.totalRaised : 0;
        if (row.amount >= RULES.conflictMinAmount && share >= RULES.conflictMinShare) {
          out.push({
            promiseId: p.id,
            industryId: ind,
            industry: row.name,
            amount: row.amount,
            share,
            text: `Possible conflict, here is the data: the promise "${p.text}" concerns the ${row.name} industry. ` +
              `Filings show ${money(row.amount)} (${(share * 100).toFixed(1)}% of ${money(finance.totalRaised)} raised) ` +
              `from that industry in the ${finance.cycle} cycle. This may or may not be related; the facts are shown so you can decide.`,
          });
        }
      });
    });
    return out;
  }

  // Votes that are linked to a promise, with relation and plain-English explanation.
  function votesForPromise(promiseId, officialId, votes) {
    const out = [];
    votes.forEach((v) => {
      const link = (v.promiseLinks || []).find((l) => l.promiseId === promiseId);
      const cast = v.byOfficial && v.byOfficial[officialId];
      if (link && cast) out.push({ vote: v, cast, relation: link.relation, explain: link.explain });
    });
    return out.sort((a, b) => (a.vote.date < b.vote.date ? 1 : -1));
  }

  // Alerts: votes cast by favorited officials, linked to one of their promises, after `since`.
  function alertsFor(favoriteIds, votes, since) {
    const out = [];
    votes.forEach((v) => {
      (v.promiseLinks || []).forEach((l) => {
        favoriteIds.forEach((id) => {
          if (v.byOfficial && v.byOfficial[id] && v.date > since && String(l.promiseId).startsWith(id + ':')) {
            out.push({ vote: v, officialId: id, promiseId: l.promiseId, cast: v.byOfficial[id], relation: l.relation, explain: l.explain });
          }
        });
      });
    });
    return out.sort((a, b) => (a.vote.date < b.vote.date ? 1 : -1));
  }

  // Words that carry an accusation. Used by data validation so published copy stays neutral.
  const LOADED = /\b(betray\w*|lie[sd]?|lying|liar\w*|fraud\w*|corrupt\w*|hypocri\w+|flip-?flop\w*|sellout|sold out|crook\w*|scam\w*|shameful|disgrac\w+)\b/i;

  function validateData(d) {
    const errors = [];
    const ids = new Set(d.officials.map((o) => o.id));
    const outletIds = new Set(d.sources.map((s) => s.id));
    const cats = new Set(d.categories.map((c) => c.id));
    d.promises.forEach((p) => {
      const where = `promise ${p.id}`;
      if (!ids.has(p.officialId)) errors.push(`${where}: unknown official ${p.officialId}`);
      if (!p.id.startsWith(p.officialId + ':')) errors.push(`${where}: id must start with "<officialId>:"`);
      if (!STATUSES[p.status]) errors.push(`${where}: bad status ${p.status}`);
      if (!cats.has(p.category)) errors.push(`${where}: bad category ${p.category}`);
      if (!p.source || !p.source.url || !p.source.date || !outletIds.has(p.source.outletId)) errors.push(`${where}: promise needs a dated source with url and known outlet`);
      (p.evidence || []).forEach((e) => {
        if (!e.url || !outletIds.has(e.outletId)) errors.push(`${where}: evidence needs url and known outlet`);
      });
      if (!p.howRated) errors.push(`${where}: missing howRated`);
      [p.text, p.howRated, p.statusNote].forEach((t) => { if (t && LOADED.test(t)) errors.push(`${where}: loaded language "${t.match(LOADED)[0]}"`); });
    });
    d.votes.forEach((v) => {
      (v.promiseLinks || []).forEach((l) => {
        if (!d.promises.find((p) => p.id === l.promiseId)) errors.push(`vote ${v.id}: unknown promise ${l.promiseId}`);
        if (!l.explain) errors.push(`vote ${v.id}: promise link needs a plain-English explanation`);
        if (LOADED.test(l.explain || '')) errors.push(`vote ${v.id}: loaded language in explanation`);
      });
    });
    return errors;
  }

  return { LOADED, STATUSES, RULES, effectiveStatus, confidence, scorecard, biasCheck, conflicts, votesForPromise, alertsFor, validateData, independentSources, money, topDonor, donorAlignment, donorSummary };
});
