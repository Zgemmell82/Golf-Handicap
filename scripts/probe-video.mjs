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


const CLIENTS = {
  ANDROID_VR: { client: { clientName: 'ANDROID_VR', clientVersion: '1.60.19', deviceModel: 'Quest 3', androidSdkVersion: 32, hl: 'en', gl: 'US' }, name: '28', ver: '1.60.19', ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip' },
  IOS: { client: { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82', hl: 'en', gl: 'US' }, name: '5', ver: '20.10.4', ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)' },
  TV_EMBED: { client: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', hl: 'en', gl: 'US' }, third: { embedUrl: 'https://www.google.com' }, name: '85', ver: '2.0', ua: UA },
  WEB_EMBED: { client: { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '1.20250310.01.00', hl: 'en', gl: 'US' }, third: { embedUrl: 'https://www.google.com' }, name: '56', ver: '1.20250310.01.00', ua: UA },
  MWEB: { client: { clientName: 'MWEB', clientVersion: '2.20250311.03.00', hl: 'en', gl: 'US' }, name: '2', ver: '2.20250311.03.00', ua: UA },
};
const ids = ['PrZb75W1gOU', '3jAMcsdmDk0', 'QC5liztiwI8'];
for (const id of ids) {
  for (const [label, c] of Object.entries(CLIENTS)) {
    try {
      const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': c.ua, 'x-youtube-client-name': c.name, 'x-youtube-client-version': c.ver }, body: JSON.stringify({ videoId: id, context: { client: c.client, ...(c.third ? { thirdParty: c.third } : {}) }, contentCheckOk: true, racyCheckOk: true }) });
      const j = await r.json();
      const tracks = j.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      let got = '';
      if (tracks.length) {
        const t = tracks.find((x) => x.languageCode.startsWith('en')) || tracks[0];
        const tr = await fetch(t.baseUrl + '&fmt=json3', { headers: { 'user-agent': UA } });
        const b = await tr.text();
        got = ` caption http ${tr.status} bytes ${b.length}`;
        try { got += ' text: ' + JSON.parse(b).events.filter((e) => e.segs).map((e) => e.segs.map((s) => s.utf8).join('')).join(' ').replace(/\s+/g, ' ').slice(0, 120); } catch {}
      }
      console.log(id, label, j.playabilityStatus?.status, (j.playabilityStatus?.reason || '').slice(0, 50), 'tracks', tracks.length, got);
    } catch (e) { console.log(id, label, 'error', e.message); }
  }
  // watch page
  const w = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: H });
  const html = await w.text();
  const m = html.match(/"captionTracks":(\[.*?\])/);
  console.log(id, 'watch page', w.status, html.length, 'captionTracks', m ? 'found' : 'none');
  if (m) { try { const t = JSON.parse(m[1])[0]; const u = t.baseUrl.replace(/\\u0026/g, '&'); const tr = await fetch(u + '&fmt=json3', { headers: { 'user-agent': UA } }); const b = await tr.text(); console.log('  watch caption http', tr.status, 'bytes', b.length, b.slice(0, 100)); } catch (e) { console.log('  watch caption error', e.message); } }
}
