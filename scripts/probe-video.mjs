// Probe: can a CI runner search YouTube and read caption transcripts? Prints a short report.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const H = { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', cookie: 'CONSENT=YES+1; SOCS=CAI' };

async function search(q) {
  const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, { headers: H });
  const html = await r.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  console.log(`search "${q}": HTTP ${r.status}, ${html.length} bytes, data ${m ? 'found' : 'missing'}`);
  if (!m) return [];
  const out = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (o.videoRenderer) {
      const v = o.videoRenderer;
      out.push({ id: v.videoId, title: v.title?.runs?.[0]?.text, channel: v.ownerText?.runs?.[0]?.text, when: v.publishedTimeText?.simpleText, len: v.lengthText?.simpleText });
    }
    for (const k of Object.keys(o)) walk(o[k]);
  };
  walk(JSON.parse(m[1]));
  return out;
}

async function transcript(id) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip', 'x-youtube-client-name': '3', 'x-youtube-client-version': '20.10.38' },
    body: JSON.stringify({ videoId: id, context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en', gl: 'US' } } }),
  });
  const j = await r.json();
  const status = j.playabilityStatus?.status;
  const tracks = j.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const info = { id, http: r.status, status, reason: j.playabilityStatus?.reason, title: j.videoDetails?.title, published: j.microformat?.playerMicroformatRenderer?.publishDate, tracks: tracks.map((t) => `${t.languageCode}${t.kind ? ':' + t.kind : ''}`) };
  if (!tracks.length) return { info };
  const t = tracks.find((x) => x.languageCode.startsWith('en')) || tracks[0];
  const tr = await fetch(t.baseUrl + '&fmt=json3', { headers: { 'user-agent': UA } });
  const body = await tr.text();
  let text = '';
  try { text = JSON.parse(body).events.filter((e) => e.segs).map((e) => e.segs.map((s) => s.utf8).join('')).join(' ').replace(/\s+/g, ' ').trim(); } catch { text = ''; }
  return { info: { ...info, captionHttp: tr.status, captionBytes: body.length, transcriptChars: text.length }, sample: text.slice(0, 300) };
}

const queries = ['Don Davis for Congress 2022 ad', 'Jennifer Kiggans for Congress 2022 ad', 'Ben Cline for Congress 2020 ad', 'Thom Tillis 2020 campaign ad'];
for (const q of queries) {
  try {
    const res = await search(q);
    res.slice(0, 4).forEach((v) => console.log('  ', JSON.stringify(v)));
    for (const v of res.slice(0, 2)) {
      try { const t = await transcript(v.id); console.log('  transcript', JSON.stringify(t.info), t.sample ? '\n    ' + t.sample : ''); } catch (e) { console.log('  transcript error', v.id, e.message); }
    }
  } catch (e) { console.log('search error', q, e.message); }
}
