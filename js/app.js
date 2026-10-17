// Promise Tracker UI. Vanilla JS, hash routing, data from /data/*.json, state in localStorage.
(function () {
  const $app = document.getElementById('app');
  const D = {}; // loaded data
  let lastSeenForBadge = '';

  // ---------- storage ----------
  const store = {
    get(k, fallback) { try { const v = localStorage.getItem('pt.' + k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem('pt.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const profile = () => store.get('profile', null);
  const favs = () => store.get('favs', []);
  function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
  const lastSeen = () => store.get('lastSeen', daysAgo(60));

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PARTY = { D: 'Democratic', R: 'Republican', I: 'Independent', L: 'Libertarian', G: 'Green' };
  const partyChip = (p) => `<span class="chip" title="${esc(PARTY[p] || p)}">${esc(PARTY[p] || p)}</span>`;
  const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const castLabel = (c) => ({ Aye: 'Yea', No: 'Nay' }[c] || c);
  const officialLabel = (o) => (o.chamber === 'senate' ? 'Senator' : o.chamber === 'house' ? 'Rep.' : 'Official') + ' ' + o.name;
  const seat = (o) => (o.chamber === 'senate' ? `${o.state} Senate` : o.chamber === 'house' ? `${o.state}-${o.district}` : o.state);
  const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
  const fmtDate = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  const promisesOf = (id) => D.promises.filter((p) => p.officialId === id);
  const stateName = (c) => (STATE_BY_CODE[c] ? STATE_BY_CODE[c].name : c);
  const officialsIn = (state) => D.officials.filter((o) => o.state === state);

  function badge(status) {
    const s = Core.STATUSES[status];
    return `<span class="badge ${status}"><i aria-hidden="true">${s.icon}</i>${s.label}</span>`;
  }
  function scoreBar(promises) {
    const sc = Core.scorecard(promises);
    if (!sc.total) return `<p class="muted">No promises researched yet for this official.</p>`;
    const order = ['kept', 'partial', 'broken', 'progress', 'unverifiable'];
    const label = order.map((k) => `${Core.STATUSES[k].label} ${sc.pct[k]}%`).join(', ');
    return `<div class="bar" role="img" aria-label="${esc(label)}">${order.map((k) => (sc.counts[k] ? `<span class="${k}" style="width:${(sc.counts[k] / sc.total) * 100}%"></span>` : '')).join('')}</div>
      <div class="legend">${order.map((k) => `<span><i aria-hidden="true">${Core.STATUSES[k].icon}</i> ${Core.STATUSES[k].label} <b>${sc.pct[k]}%</b></span>`).join('')}</div>
      <p class="muted">${sc.total} promise${sc.total === 1 ? '' : 's'} tracked</p>`;
  }
  function officialCard(o) {
    const fav = favs().includes(o.id);
    return `<div class="card"><div class="row">
      <a class="official row grow" href="#/official/${o.id}">
        <span class="avatar">${o.photo ? `<img src="${esc(o.photo)}" alt="" loading="lazy" data-initials="${esc(initials(o.name))}">` : esc(initials(o.name))}</span>
        <span class="grow"><span class="name">${esc(officialLabel(o))}</span><br>
        <span class="muted">${partyChip(o.party)} ${esc(seat(o))}${o.sample ? ' <span class="chip sample">sample</span>' : ''}</span></span>
      </a>
      <button class="star" data-fav="${o.id}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from' : 'Add to'} favorites">${fav ? '★' : '☆'}</button></div>
      ${scoreBar(promisesOf(o.id))}</div>`;
  }
  const updatedLine = (d) => `<p class="muted">Last updated ${esc(fmtDate(d))}</p>`;

  // ---------- views ----------
  function viewOnboarding(msg) {
    const p = profile() || {};
    return `<h1>Promise Tracker</h1>
      <p>See whether the people who represent you kept their promises, with the evidence shown.</p>
      <form id="onb" class="card" novalidate>
        <label for="st">Your state or territory</label>
        <select id="st" required><option value="">Select…</option>${STATES.map((s) => `<option value="${s.code}" ${p.state === s.code ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <label for="zip">ZIP code <span class="muted">(optional, finds your exact House district)</span></label>
        <input id="zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" value="${esc(p.zip || '')}" placeholder="e.g. 43201">
        <div id="onb-extra">${msg || ''}</div>
        <p style="margin-top:16px"><button class="primary" type="submit" style="width:100%">Continue</button></p>
      </form>
      <p class="muted">Your choice is saved only on this device. <a href="#/states">Browse without choosing</a>.</p>`;
  }

  function myReps(p) {
    const inState = officialsIn(p.state);
    const houseMine = p.district ? inState.filter((o) => o.chamber === 'house' && o.district === p.district) : inState.filter((o) => o.chamber === 'house');
    const others = inState.filter((o) => o.chamber !== 'house');
    return { houseMine, others, all: [...houseMine, ...others] };
  }

  function viewHome() {
    const p = profile();
    const { houseMine, others, all } = myReps(p);
    const districtNote = p.district ? `District ${esc(p.state)}-${esc(p.district)}` : `All House members in ${esc(stateName(p.state))}`;
    return `<h1>Your Representatives</h1><p class="muted">${esc(stateName(p.state))} · ${districtNote} · <a href="#/settings">change</a></p>
      ${all.length ? '' : `<div class="note">We don't have officials for ${esc(stateName(p.state))} yet. Browse other states from the States tab.</div>`}
      ${houseMine.map(officialCard).join('')}
      ${others.length ? `<h2>Also representing ${esc(stateName(p.state))}</h2>${others.map(officialCard).join('')}` : ''}
      ${!p.district && houseMine.length ? `<p class="muted">Add a ZIP code in <a href="#/settings">Settings</a> to see only your district.</p>` : ''}
      <p><a class="btn" href="#/state/${esc(p.state)}">Full ${esc(stateName(p.state))} delegation</a> <a class="btn" href="#/states">Browse other states</a></p>
      ${favs().length ? `<h2>Favorites</h2>${favs().map((id) => D.byOfficial[id]).filter(Boolean).map(officialCard).join('')}` : ''}`;
  }

  function viewState(code) {
    const s = STATE_BY_CODE[code];
    if (!s) return `<p>Unknown state.</p>`;
    const members = officialsIn(code);
    const ids = new Set(members.map((o) => o.id));
    const proms = D.promises.filter((p) => ids.has(p.officialId));
    const recent = D.votes.filter((v) => Object.keys(v.byOfficial).some((id) => ids.has(id))).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
    const mine = (profile() || {}).state === code;
    return `<p><a href="#/states">← All states</a></p><h1>${esc(s.name)}</h1>
      ${mine ? '' : `<p class="muted">You're browsing. This doesn't change your profile. <a href="#/set-state/${code}">Make this my state</a></p>`}
      <h2>Delegation scorecard</h2><div class="card">${scoreBar(proms)}</div>
      <h2>Members (${members.length})</h2>
      ${members.length ? members.map(officialCard).join('') : `<div class="note">No officials loaded for this state yet.</div>`}
      <h2>Recent votes by this delegation</h2>
      ${recent.length ? recent.map((v) => voteRow(v, members)).join('') : `<p class="muted">No recent votes on file.</p>`}`;
  }

  function voteRow(v, members) {
    const who = members.filter((o) => v.byOfficial[o.id]);
    return `<div class="card"><div class="name">${esc(v.title)}</div>
      <p class="muted">${esc(v.billId)} · ${esc(fmtDate(v.date))} · ${esc(v.question)} · ${esc(v.result)} · <a href="${esc(v.url)}" rel="noopener">source</a></p>
      ${who.length ? `<table><tbody>${who.map((o) => `<tr><td><a href="#/official/${o.id}">${esc(o.name)}</a> ${partyChip(o.party)}</td><td>${esc(castLabel(v.byOfficial[o.id]))}</td></tr>`).join('')}</tbody></table>` : ''}</div>`;
  }

  function viewStates() {
    const mine = (profile() || {}).state;
    const grid = STATES.map((s) => `<a href="#/state/${s.code}" class="${officialsIn(s.code).length ? 'has' : ''} ${s.code === mine ? 'mine' : ''}" style="grid-column:${s.col + 1};grid-row:${s.row + 1}" aria-label="${esc(s.name)}">${s.code}</a>`).join('');
    return `<h1>Browse states</h1><p class="muted">Tap a state or territory. Dark tiles have officials loaded. Browsing never changes your saved state.</p>
      <div class="tilemap" role="group" aria-label="State map">${grid}</div>
      <h2>All states and territories</h2>
      <div class="card"><table><tbody>${STATES.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => `<tr><td><a href="#/state/${s.code}">${esc(s.name)}</a></td><td class="muted">${officialsIn(s.code).length || '—'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function promiseCard(p, official, open) {
    const eff = Core.effectiveStatus(p);
    const conf = Core.confidence(p, D.sources);
    const cat = D.catById[p.category];
    const outletName = (id) => (D.srcById[id] ? D.srcById[id].name : id);
    const lean = (id) => (D.srcById[id] && D.srcById[id].lean !== 'n/a' ? ` <span class="chip">${esc(D.srcById[id].lean)}-leaning</span>` : '');
    const rel = (id) => (D.srcById[id] ? `<span class="chip">${esc(D.srcById[id].kind === 'primary' ? 'primary' : D.srcById[id].kind === 'factcheck' ? 'fact-check' : 'news')}</span> <span class="chip">${esc(D.srcById[id].reliability)} reliability</span>` : '');
    const ev = (p.evidence || []).slice().sort((a, b) => (D.srcById[a.outletId].kind === 'primary' ? 0 : 1) - (D.srcById[b.outletId].kind === 'primary' ? 0 : 1));
    const related = Core.votesForPromise(p.id, p.officialId, D.votes);
    const contradicts = related.filter((r) => r.relation === 'contradicts');
    return `<details class="promise" ${open ? 'open' : ''}><summary>
        ${badge(eff.status)} <span class="chip">${esc(cat ? cat.name : p.category)}</span> <span class="chip" title="${esc(conf.why)}">${esc(conf.level)} confidence</span>
        <div style="margin-top:6px"><strong>${esc(p.text)}</strong></div></summary>
      <div class="promise-body">
        ${eff.downgraded ? `<div class="note"><strong>Shown as Unverifiable.</strong> ${esc(eff.reason)}</div>` : ''}
        ${contradicts.map((r) => `<div class="flag"><strong>Vote that did not match this promise:</strong> ${esc(r.vote.title)} (${esc(fmtDate(r.vote.date))}). The official voted <strong>${esc(r.cast)}</strong>. ${esc(r.explain)}</div>`).join('')}
        <h4>The promise</h4>
        <p>Made ${esc(fmtDate(p.madeOn))}. Source: <a href="${esc(p.source.url)}" rel="noopener">${esc(p.source.title)}</a> (${esc(outletName(p.source.outletId))}).</p>
        <h4>Evidence</h4>
        ${ev.length ? `<ul class="evidence">${ev.map((e) => `<li><a href="${esc(e.url)}" rel="noopener">${esc(e.title)}</a><br><span class="muted">${esc(outletName(e.outletId))}, ${esc(fmtDate(e.date))}</span> ${rel(e.outletId)}${lean(e.outletId)}</li>`).join('')}</ul>` : `<p class="muted">No evidence on file yet.</p>`}
        ${p.contested ? `<div class="note"><strong>Contested rating.</strong> Sources are shown across the spectrum where available. Leans: ${[...new Set(ev.map((e) => D.srcById[e.outletId].lean).filter((l) => l !== 'n/a'))].map(esc).join(', ') || 'none rated'}.</div>` : ''}
        ${related.filter((r) => r.relation !== 'contradicts').map((r) => `<div class="ok"><strong>Related vote:</strong> ${esc(r.vote.title)} (${esc(fmtDate(r.vote.date))}), voted <strong>${esc(r.cast)}</strong>. ${esc(r.explain)}</div>`).join('')}
        <h4>How we rated this</h4>
        <p>${esc(p.howRated)}</p>
        <p class="muted"><strong>Confidence: ${esc(conf.level)}.</strong> ${esc(conf.why)} Independent sources counted: ${Core.independentSources(p).size}. <a href="#/methodology">Methodology</a></p>
        ${p.statusNote ? `<p class="muted">${esc(p.statusNote)}</p>` : ''}
        <p class="muted">Reviewed ${esc(fmtDate(p.reviewedOn))} (${esc(p.review)}). Something wrong? We correct errors when sources show them.</p>
      </div></details>`;
  }

  function viewOfficial(id, tab) {
    const o = D.byOfficial[id];
    if (!o) return `<p>Official not found. <a href="#/directory">Directory</a></p>`;
    tab = tab || 'promises';
    const proms = promisesOf(id);
    const fin = D.finance[id];
    const fav = favs().includes(id);
    const tabs = [['promises', 'Promises'], ['votes', 'Votes'], ['money', 'Money'], ['about', 'About']];
    let body = '';
    if (tab === 'promises') {
      body = proms.length ? proms.map((p) => promiseCard(p, o)).join('') : `<div class="note">No promises have been researched for this official yet. We don't guess; missing data stays missing.</div>`;
    } else if (tab === 'votes') {
      const vs = D.votes.filter((v) => v.byOfficial[id]).sort((a, b) => (a.date < b.date ? 1 : -1));
      body = vs.length ? vs.map((v) => `<div class="card"><div class="name">${esc(v.title)}</div>
        <p class="muted">${esc(v.billId)} · ${esc(fmtDate(v.date))} · ${esc(v.result)} · <a href="${esc(v.url)}" rel="noopener">source</a></p>
        <p>Voted: <strong>${esc(castLabel(v.byOfficial[id]))}</strong></p></div>`).join('') : `<p class="muted">No votes on file.</p>`;
    } else if (tab === 'money') {
      body = moneyView(o, fin);
    } else {
      body = `<div class="card"><table><tbody>
        <tr><th>Party</th><td>${esc(PARTY[o.party] || o.party)}</td></tr>
        <tr><th>Office</th><td>${esc(o.chamber === 'senate' ? 'U.S. Senate' : 'U.S. House')}, ${esc(seat(o))}</td></tr>
        <tr><th>First elected</th><td>${esc(o.firstElected)}</td></tr>
        <tr><th>In office since</th><td>${esc(o.inOfficeSince)} (${new Date().getFullYear() - o.inOfficeSince} years)</td></tr>
        <tr><th>Committees</th><td>${(o.committees || []).map(esc).join(', ') || 'Not on file'}</td></tr>
        <tr><th>Phone</th><td>${esc(o.contact.phone || 'Not on file')}</td></tr>
        <tr><th>Website</th><td>${o.contact.website ? `<a href="${esc(o.contact.website)}" rel="noopener">${esc(o.contact.website)}</a>` : 'Not on file'}</td></tr>
        <tr><th>Office</th><td>${esc(o.contact.office || 'Not on file')}</td></tr></tbody></table></div>`;
    }
    return `<p><a href="#/state/${esc(o.state)}">← ${esc(stateName(o.state))}</a></p>
      <div class="row"><span class="avatar lg">${o.photo ? `<img src="${esc(o.photo)}" alt="Photo of ${esc(o.name)}" data-initials="${esc(initials(o.name))}">` : esc(initials(o.name))}</span>
        <div class="grow"><h1 style="margin:0">${esc(officialLabel(o))}</h1><span class="muted">${partyChip(o.party)} ${esc(seat(o))}${o.sample ? ' <span class="chip sample">sample</span>' : ''}</span></div>
        <button class="star" data-fav="${o.id}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from' : 'Add to'} favorites">${fav ? '★' : '☆'}</button></div>
      <div class="card" style="margin-top:12px">${scoreBar(proms)}</div>
      <p><a class="btn" href="#/compare?a=${id}">Compare with another official</a></p>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-pressed="${k === tab}" data-subtab="${k}">${l}</button>`).join('')}</div>
      ${body}${updatedLine(o.updated)}`;
  }

  function section(title, rows, label) {
    if (!rows || !rows.length) return '';
    return `<h2>${title}</h2><div class="card"><table><tbody>${rows.map((i) => `<tr><td>${esc(label(i))}</td><td>${Core.money(i.amount)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function moneyView(o, fin) {
    if (!fin) return `<div class="note">No campaign finance data on file for this official yet.</div>`;
    const cs = Core.conflicts(o, D.promises, fin);
    return `<div class="card"><div class="name">${Core.money(fin.totalRaised)} raised (${esc(fin.cycle)} cycle)</div>
      <div class="money-bar" role="img" aria-label="Small-dollar ${fin.smallDollarPct}%, large-dollar ${fin.largeDollarPct}%, self-funded ${fin.selfFundedPct}%">
        <span style="width:${fin.smallDollarPct}%"></span><span style="width:${fin.largeDollarPct}%"></span><span style="width:${fin.selfFundedPct}%"></span></div>
      <div class="legend"><span>Small-dollar <b>${fin.smallDollarPct}%</b></span><span>Large-dollar <b>${fin.largeDollarPct}%</b></span><span>Self-funded <b>${fin.selfFundedPct}%</b></span></div></div>
      ${cs.length ? `<h2>Possible conflicts</h2>${cs.map((c) => `<div class="note">${esc(c.text)}</div>`).join('')}` : ''}
      ${section('Top industries', fin.industries, (i) => i.name, 'amount')}
      ${section('Top employers of donors <span class="muted">(as reported to the FEC; not an industry classification)</span>', fin.employers, (i) => i.name, 'amount')}
      ${section('Top donors', fin.topDonors, (i) => i.name, 'amount')}
      ${section('PACs', fin.pacs, (i) => i.name, 'amount')}
      <p class="muted">Source: <a href="${esc(fin.source.url)}" rel="noopener">${esc(fin.source.label)}</a>. Industry totals group donors by employer or committee type and can be imperfect. A donation is not proof of influence.</p>${updatedLine(fin.updated)}`;
  }

  const dirState = { q: '', party: '', committee: '', issue: '', status: '', chamber: '' };
  function viewDirectory() {
    const committees = [...new Set(D.officials.flatMap((o) => o.committees || []))].sort();
    const parties = [...new Set(D.officials.map((o) => o.party))].sort();
    const list = D.officials.filter((o) => {
      const ps = promisesOf(o.id);
      return (!dirState.q || o.name.toLowerCase().includes(dirState.q.toLowerCase()) || stateName(o.state).toLowerCase().includes(dirState.q.toLowerCase()))
        && (!dirState.party || o.party === dirState.party)
        && (!dirState.chamber || o.chamber === dirState.chamber)
        && (!dirState.committee || (o.committees || []).includes(dirState.committee))
        && (!dirState.issue || ps.some((p) => p.category === dirState.issue))
        && (!dirState.status || ps.some((p) => Core.effectiveStatus(p).status === dirState.status));
    });
    const opt = (v, cur, l) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
    return `<h1>Directory</h1>
      <div class="filters" id="filters">
        <div class="wide"><label for="f-q">Search name or state</label><input id="f-q" type="search" value="${esc(dirState.q)}"></div>
        <div><label for="f-party">Party</label><select id="f-party" data-f="party">${opt('', dirState.party, 'Any')}${parties.map((p) => opt(p, dirState.party, PARTY[p] || p)).join('')}</select></div>
        <div><label for="f-chamber">Chamber</label><select id="f-chamber" data-f="chamber">${opt('', dirState.chamber, 'Any')}${opt('house', dirState.chamber, 'House')}${opt('senate', dirState.chamber, 'Senate')}</select></div>
        <div><label for="f-committee">Committee</label><select id="f-committee" data-f="committee">${opt('', dirState.committee, 'Any')}${committees.map((c) => opt(c, dirState.committee, c)).join('')}</select></div>
        <div><label for="f-issue">Issue</label><select id="f-issue" data-f="issue">${opt('', dirState.issue, 'Any')}${D.categories.map((c) => opt(c.id, dirState.issue, c.name)).join('')}</select></div>
        <div class="wide"><label for="f-status">Has a promise rated</label><select id="f-status" data-f="status">${opt('', dirState.status, 'Any')}${Object.entries(Core.STATUSES).map(([k, v]) => opt(k, dirState.status, v.label)).join('')}</select></div>
      </div>
      <p class="muted" style="margin-top:12px">${list.length} official${list.length === 1 ? '' : 's'}</p>
      <div id="dir-list">${list.map(officialCard).join('') || '<p class="muted">No matches.</p>'}</div>`;
  }

  function viewCompare(query) {
    const a = query.get('a') || '', b = query.get('b') || '';
    const pick = (name, cur) => `<select data-cmp="${name}" aria-label="Official ${name.toUpperCase()}"><option value="">Choose…</option>${D.officials.map((o) => `<option value="${o.id}" ${cur === o.id ? 'selected' : ''}>${esc(o.name)} (${esc(seat(o))})</option>`).join('')}</select>`;
    const col = (id) => {
      const o = D.byOfficial[id];
      if (!o) return `<div class="card muted">Pick an official.</div>`;
      const ps = promisesOf(id), fin = D.finance[id];
      const sc = Core.scorecard(ps);
      const contra = ps.reduce((n, p) => n + Core.votesForPromise(p.id, id, D.votes).filter((r) => r.relation === 'contradicts').length, 0);
      return `<div class="card"><a class="name" href="#/official/${id}">${esc(officialLabel(o))}</a><br>${partyChip(o.party)} <span class="muted">${esc(seat(o))}</span>
        ${scoreBar(ps)}
        <table><tbody>
          <tr><th>Kept</th><td>${sc.counts.kept}</td></tr><tr><th>Partly</th><td>${sc.counts.partial}</td></tr><tr><th>Broken</th><td>${sc.counts.broken}</td></tr>
          <tr><th>In progress</th><td>${sc.counts.progress}</td></tr><tr><th>Unverifiable</th><td>${sc.counts.unverifiable}</td></tr>
          <tr><th>Votes flagged against a promise</th><td>${contra}</td></tr>
          <tr><th>Small-dollar share</th><td>${fin ? fin.smallDollarPct + '%' : 'n/a'}</td></tr>
          <tr><th>Total raised</th><td>${fin ? Core.money(fin.totalRaised) : 'n/a'}</td></tr>
          <tr><th>Top industry</th><td>${fin && fin.industries[0] ? esc(fin.industries[0].name) : 'n/a'}</td></tr></tbody></table></div>`;
    };
    return `<h1>Compare two officials</h1><p class="muted">Same measures, same rules, side by side.</p>
      <div class="cmp"><div>${pick('a', a)}</div><div>${pick('b', b)}</div></div>
      <div class="cmp" style="margin-top:12px">${col(a)}${col(b)}</div>`;
  }

  function viewAlerts() {
    const ids = favs();
    const since = lastSeen();
    const all = Core.alertsFor(ids, D.votes, '0000');
    const fresh = all.filter((a) => a.vote.date > since);
    const row = (a, isNew) => {
      const o = D.byOfficial[a.officialId];
      const p = D.promises.find((x) => x.id === a.promiseId);
      return `<div class="card">${isNew ? '<span class="chip">new</span> ' : ''}<div class="name">${esc(o.name)} voted ${esc(a.cast)}</div>
        <p>${esc(a.vote.title)} <span class="muted">(${esc(fmtDate(a.vote.date))})</span></p>
        <p class="muted">Related promise: ${esc(p ? p.text : '')}</p><p>${esc(a.explain)}</p>
        <a href="#/official/${o.id}">See evidence</a></div>`;
    };
    const html = `<h1>Alerts</h1>
      ${ids.length ? '' : `<div class="note">Tap ☆ on an official to track them. You'll see votes related to their promises here.</div>`}
      ${ids.length ? `<h2>New since your last visit (${fresh.length})</h2>${fresh.map((a) => row(a, true)).join('') || '<p class="muted">Nothing new.</p>'}
      <h2>Earlier</h2>${all.filter((a) => a.vote.date <= since).map((a) => row(a, false)).join('') || '<p class="muted">Nothing earlier.</p>'}` : ''}
      <h2>Tracked officials</h2>${ids.map((id) => D.byOfficial[id]).filter(Boolean).map(officialCard).join('') || '<p class="muted">None yet.</p>'}
      <p class="muted">Alerts appear inside this app when you open it. Push notifications are not part of this version.</p>`;
    lastSeenForBadge = new Date().toISOString().slice(0, 10);
    store.set('lastSeen', lastSeenForBadge);
    return html;
  }

  function viewSettings() {
    const p = profile() || {};
    const theme = store.get('theme', 'system');
    return `<h1>Settings</h1>
      <div class="card"><h3>Your state</h3><p>${p.state ? esc(stateName(p.state)) + (p.district ? ` · ${esc(p.state)}-${esc(p.district)}` : '') : 'Not set'}</p>
        <a class="btn primary" href="#/onboarding">Change state or ZIP</a></div>
      <div class="card"><h3>Appearance</h3><label for="theme">Theme</label>
        <select id="theme"><option value="system" ${theme === 'system' ? 'selected' : ''}>Match my device</option><option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option></select></div>
      <div class="card"><h3>Data</h3><p class="muted">Dataset updated ${esc(fmtDate(D.meta.generated))}. ${D.meta.isSample ? 'This is a fictional sample dataset.' : ''}</p>
        <button id="clear-favs">Clear favorites</button> <a class="btn" href="#/methodology">Methodology</a></div>`;
  }

  function viewMethodology() {
    const bias = Core.biasCheck(D.officials, D.promises);
    const R = Core.RULES;
    return `<h1>Methodology</h1>
      <p>Promise Tracker applies the same rules to every official, whatever their party. Party appears as a small label and never changes how anything is rated or displayed.</p>
      <h2>What counts as a promise</h2><p>A specific, checkable commitment made by the official or their campaign, with a dated source: a campaign site (archived copy where possible), debate transcript, interview, press release or public statement. Vague hopes are not tracked.</p>
      <h2>Statuses</h2><div class="card stack">
        <div>${badge('kept')} The promised action happened, shown by records such as a law, a bill the official sponsored that passed, or votes.</div>
        <div>${badge('partial')} Part of the promise was carried out.</div>
        <div>${badge('broken')} The official did not follow through, for example by voting against the promised action.</div>
        <div>${badge('progress')} Action is under way, such as a bill that has not yet passed.</div>
        <div>${badge('unverifiable')} Not enough independent evidence, or the promise is too vague to check.</div></div>
      <h2>Evidence rules</h2>
      <ul><li><strong>Two independent sources are required</strong> for Kept or Broken (currently ${R.minIndependentSources}). Two links to the same outlet count once. If fewer are on file, the promise is shown as Unverifiable and says why.</li>
      <li>Primary sources come first: Congress.gov, official voting records, FEC filings and the official's own statements. Fact-checkers (PolitiFact, FactCheck.org) are secondary.</li>
      <li>Where a rating is contested, we show sources from across the political spectrum, and confidence is capped until they span it.</li>
      <li>Missing data is shown as missing. We never fill gaps with guesses.</li></ul>
      <h2>Confidence</h2><p><strong>High</strong>: two or more independent sources including at least one primary record. <strong>Medium</strong>: two or more independent sources, but none primary or some lower reliability. <strong>Low</strong>: one or no independent source.</p>
      <h2>Sources and their ratings</h2><div class="card"><table><thead><tr><th>Source</th><th>Type</th><th>Reliability</th><th>Lean</th></tr></thead><tbody>
        ${D.sources.map((s) => `<tr><td>${esc(s.name)}<br><span class="muted">${esc(s.note)}</span></td><td>${esc(s.kind)}</td><td>${esc(s.reliability)}</td><td>${esc(s.lean)}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted">Reliability and lean are editorial judgments that we publish so they can be challenged. "n/a" means a primary record or a fact-checker, where lean is not assigned.</p>
      <h2>Campaign money</h2><p>We show reported totals, top donors, industries, PACs and small- versus large-dollar share from FEC filings. A <em>possible conflict</em> is shown only when a promise names an industry it would affect and that industry gave at least ${Core.money(R.conflictMinAmount)} and at least ${(R.conflictMinShare * 100).toFixed(0)}% of total receipts. It is a data point, not a claim about motive.</p>
      <h2>Language</h2><p>We write "voted against" and "did not follow through." We avoid words that assign motive or character. Our data checks reject loaded wording before it is published.</p>
      <h2>Bias check</h2><p>This table counts Kept and Broken ratings by party so you can see whether the ratings lean one way. Small samples can look uneven by chance.</p>
      <div class="card"><table><thead><tr><th>Party</th><th>Officials</th><th>Promises</th><th>Kept</th><th>Broken</th><th>Kept : Broken</th></tr></thead><tbody>
        ${bias.map((r) => `<tr><td>${esc(PARTY[r.party] || r.party)}</td><td>${r.officials}</td><td>${r.total}</td><td>${r.kept} (${r.keptPct}%)</td><td>${r.broken} (${r.brokenPct}%)</td><td>${r.ratio == null ? 'n/a' : r.ratio}</td></tr>`).join('')}</tbody></table></div>
      ${D.meta.isSample ? '<div class="note">This table uses the fictional sample dataset.</div>' : ''}
      <h2>Limits</h2><p>Promise coverage is incomplete and grows over time. Districts can change after redistricting. Ratings can change when new evidence appears.</p>`;
  }

  // ---------- onboarding logic ----------
  // ZIP data is large and only needed here, so it loads on demand. Values look like "OH-01".
  let zipData = null;
  async function zipDistricts(zip) {
    if (!zipData) {
      try { zipData = await fetch('data/zip.json').then((r) => (r.ok ? r.json() : {})); } catch { zipData = {}; }
    }
    return (zipData[zip] || []).map((s) => { const [state, district] = s.split('-'); return { state, district }; });
  }

  // The Census geocoder does not allow cross-origin fetch from a web page, but it supports JSONP.
  function jsonp(url, ms = 8000) {
    return new Promise((resolve, reject) => {
      const cb = 'pt_cb_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const done = () => { delete window[cb]; script.remove(); clearTimeout(timer); };
      const timer = setTimeout(() => { done(); reject(new Error('timeout')); }, ms);
      window[cb] = (data) => { done(); resolve(data); };
      script.onerror = () => { done(); reject(new Error('network')); };
      script.src = `${url}&format=jsonp&callback=${cb}`;
      document.head.appendChild(script);
    });
  }

  async function lookupAddress(addr) {
    const url = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?benchmark=Public_AR_Current&vintage=Current_Current&address=' + encodeURIComponent(addr);
    const json = await jsonp(url);
    const m = json.result && json.result.addressMatches && json.result.addressMatches[0];
    if (!m) return null;
    const geos = m.geographies || {};
    const key = Object.keys(geos).find((k) => /Congressional Districts/i.test(k));
    const rec = key && geos[key][0];
    const field = rec && Object.keys(rec).find((k) => /^CD\d+$/.test(k));
    if (!field) return null;
    const d = String(rec[field]);
    return { state: m.addressComponents ? m.addressComponents.state : null, district: d === '98' ? '00' : d.padStart(2, '0') };
  }

  function districtPicker(state, districts) {
    return `<label for="dpick">Choose your district</label><select id="dpick">${districts.map((d) => `<option value="${esc(d)}">${esc(state)}-${esc(d)}</option>`).join('')}</select>`;
  }

  async function onboardingSubmit(form) {
    const st = form.querySelector('#st').value;
    const zip = form.querySelector('#zip').value.trim();
    const extra = form.querySelector('#onb-extra');
    if (!st) { extra.innerHTML = '<div class="note">Please choose your state or territory.</div>'; return; }
    const picked = form.querySelector('#dpick');
    const addrEl = form.querySelector('#addr');
    let district = picked ? picked.value : null;
    if (!district && addrEl && addrEl.value.trim()) {
      extra.innerHTML = '<p class="muted">Looking up your address…</p>';
      try {
        const r = await lookupAddress(addrEl.value.trim());
        // Only trust a district we actually have a member for (maps changed in some states).
        if (r && r.district && officialsIn(st).some((o) => o.chamber === 'house' && o.district === r.district)) district = r.district;
      } catch { /* network or browser restriction */ }
      if (!district) {
        const ds = [...new Set(officialsIn(st).filter((o) => o.chamber === 'house').map((o) => o.district))];
        extra.innerHTML = `<div class="note">We couldn't look up that address from this device. Choose your district instead, or continue to see the whole state.</div>${ds.length ? districtPicker(st, ds) : ''}`;
        return;
      }
    }
    if (!district && zip) {
      if (!/^\d{5}$/.test(zip)) { extra.innerHTML = '<div class="note">ZIP codes have 5 digits.</div>'; return; }
      const hits = (await zipDistricts(zip)).filter((h) => h.state === st);
      if (hits.length === 1) district = hits[0].district;
      else if (hits.length > 1) {
        extra.innerHTML = `<div class="note">That ZIP code spans more than one district. Enter your street address to pinpoint yours.</div>
          <label for="addr">Street address, city, state</label><input id="addr" autocomplete="street-address" placeholder="123 Main St, Columbus, OH">
          <p class="muted">Your address is sent only to the U.S. Census Bureau's lookup and is not saved.</p>`;
        return;
      } else {
        const ds = [...new Set(officialsIn(st).filter((o) => o.chamber === 'house').map((o) => o.district))];
        if (ds.length && !picked) {
          extra.innerHTML = `<div class="note">We don't have that ZIP code in our data yet.${ds.length ? ' Choose your district below, or continue to see every House member in the state.' : ''}</div>${districtPicker(st, ds)}`;
          return;
        }
      }
    }
    store.set('profile', { state: st, zip: /^\d{5}$/.test(zip) ? zip : '', district: district || null });
    location.hash = '#/';
  }

  // ---------- router ----------
  function route() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = hash.split('?');
    const query = new URLSearchParams(qs || '');
    const parts = path.split('/').filter(Boolean);
    const p = profile();
    const tabsEl = document.getElementById('tabs');
    let html, tab = '';
    if (!p && parts[0] !== 'states' && parts[0] !== 'state' && parts[0] !== 'official' && parts[0] !== 'methodology' && parts[0] !== 'directory' && parts[0] !== 'compare' && parts[0] !== 'set-state') {
      html = viewOnboarding();
    } else if (!parts.length) { html = viewHome(); tab = 'home'; }
    else if (parts[0] === 'onboarding') { html = viewOnboarding(); }
    else if (parts[0] === 'set-state') { store.set('profile', { state: parts[1], zip: '', district: null }); location.hash = '#/'; return; }
    else if (parts[0] === 'states') { html = viewStates(); tab = 'states'; }
    else if (parts[0] === 'state') { html = viewState(parts[1]); tab = 'states'; }
    else if (parts[0] === 'official') { html = viewOfficial(parts[1], query.get('tab')); tab = 'directory'; }
    else if (parts[0] === 'directory') { html = viewDirectory(); tab = 'directory'; }
    else if (parts[0] === 'compare') { html = viewCompare(query); tab = 'directory'; }
    else if (parts[0] === 'alerts') { html = viewAlerts(); tab = 'alerts'; }
    else if (parts[0] === 'settings') { html = viewSettings(); tab = 'settings'; }
    else if (parts[0] === 'methodology') { html = viewMethodology(); tab = 'settings'; }
    else html = '<p>Page not found. <a href="#/">Home</a></p>';
    $app.innerHTML = html;
    tabsEl.hidden = false;
    tabsEl.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
    updateBadge();
    window.scrollTo(0, 0);
    $app.focus({ preventScroll: true });
  }

  function updateBadge() {
    const n = Core.alertsFor(favs(), D.votes, lastSeenForBadge || lastSeen()).length;
    const el = document.getElementById('alert-count');
    el.hidden = !n; el.textContent = n;
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-fav]');
    if (f) {
      e.preventDefault();
      const id = f.dataset.fav; const cur = favs();
      store.set('favs', cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
      const y = window.scrollY; lastSeenForBadge = ''; route(); window.scrollTo(0, y);
      return;
    }
    const t = e.target.closest('[data-subtab]');
    if (t) { const m = location.hash.match(/#\/official\/([^?]+)/); if (m) location.hash = `#/official/${m[1]}?tab=${t.dataset.subtab}`; return; }
    if (e.target.id === 'clear-favs') { store.set('favs', []); route(); }
  });
  document.addEventListener('submit', (e) => { if (e.target.id === 'onb') { e.preventDefault(); onboardingSubmit(e.target); } });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'f-q') {
      dirState.q = e.target.value;
      const tmp = document.createElement('div');
      tmp.innerHTML = viewDirectory();
      document.getElementById('dir-list').innerHTML = tmp.querySelector('#dir-list').innerHTML;
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.dataset.f) { dirState[e.target.dataset.f] = e.target.value; route(); }
    if (e.target.dataset.cmp) {
      const q = new URLSearchParams(location.hash.split('?')[1] || ''); q.set(e.target.dataset.cmp, e.target.value);
      location.hash = '#/compare?' + q.toString();
    }
    if (e.target.id === 'theme') { store.set('theme', e.target.value); applyTheme(); }
  });
  // A photo that fails to load falls back to initials.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.closest('.avatar')) img.parentNode.textContent = img.dataset.initials || '';
  }, true);
  window.addEventListener('hashchange', route);

  function applyTheme() {
    const t = store.get('theme', 'system');
    if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  }

  // ---------- boot ----------
  async function boot() {
    applyTheme();
    try {
      const names = ['categories', 'sources', 'officials', 'promises', 'votes', 'finance', 'meta'];
      const res = await Promise.all(names.map((n) => fetch(`data/${n}.json`).then((r) => { if (!r.ok) throw new Error(n); return r.json(); })));
      names.forEach((n, i) => { D[n] = res[i]; });
    } catch (err) {
      $app.innerHTML = '<h1>Promise Tracker</h1><div class="note">We could not load the data. Check your connection and reload.</div>';
      return;
    }
    D.byOfficial = byId(D.officials); D.catById = byId(D.categories); D.srcById = byId(D.sources);
    const banner = document.getElementById('sample-banner');
    if (D.meta.isSample) { banner.hidden = false; banner.textContent = 'SAMPLE DATA: all officials, promises, votes and dollar amounts here are fictional, for demonstration.'; }
    lastSeenForBadge = lastSeen();
    route();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  boot();
})();
