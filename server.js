// Load settings from a local ".env" file if there is one (e.g. AUDD_API_TOKEN=...),
// so you don't have to type them in the terminal every time. Values already set
// in the environment (like on Render) always win. The .env file is git-ignored.
(() => {
  try {
    const fs = require('fs'), path = require('path');
    const file = path.join(__dirname, '.env');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      const val = m[2].replace(/^['"]|['"]$/g, '');
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    }
    console.log('[Config] Loaded settings from .env');
  } catch (e) { console.log('[Config] Could not read .env:', e.message); }
})();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 8e6, pingInterval: 20000, pingTimeout: 25000 });

// ── Web Push (call alerts when Frame is closed or in the background) ──
// Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY. If they are missing,
// temporary keys are made at start-up (alerts still work, but phones must
// re-subscribe after each restart — save the printed keys on Render).
const webpush = require('web-push');
let VAPID_PUBLIC = (process.env.VAPID_PUBLIC_KEY || '').trim();
let VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').trim();
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  const k = webpush.generateVAPIDKeys();
  VAPID_PUBLIC = k.publicKey; VAPID_PRIVATE = k.privateKey;
  console.log('[Push] No VAPID keys set — using temporary keys. To keep call alerts working after restarts, add these on Render:');
  console.log('[Push]   VAPID_PUBLIC_KEY=' + VAPID_PUBLIC);
  console.log('[Push]   VAPID_PRIVATE_KEY=' + VAPID_PRIVATE);
} else console.log('[Push] VAPID keys found ✓');
try { webpush.setVapidDetails('mailto:' + ((process.env.CONTACT_EMAIL || '').trim() || 'frame@example.com'), VAPID_PUBLIC, VAPID_PRIVATE); }
catch (e) { console.log('[Push] Bad VAPID keys:', e.message); }
const pushSubs = {};   // uid -> Map(endpoint -> subscription), memory only
function sendPush(uid, payload) {
  const subs = pushSubs[uid]; if (!subs || !subs.size) return;
  const body = JSON.stringify(payload);
  for (const [ep, sub] of subs) {
    webpush.sendNotification(sub, body, { TTL: 30, urgency: 'high', topic: String(payload.tag || 'frame').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) })
      .catch(err => { if (err.statusCode === 404 || err.statusCode === 410) subs.delete(ep); });
  }
}
const CALL_RING_MS = Math.max(5, Number(process.env.CALL_RING_SECONDS) || 10) * 1000;

app.use(express.json());
// ── SEO / Google ──
// SITE_URL = your public address (e.g. https://frame-chat.onrender.com).
// If not set, the address the visitor used is detected automatically.
// GOOGLE_SITE_VERIFICATION = the code Google Search Console gives you for the
// "HTML tag" method (only the content="..." value).
const fsSeo = require('fs'), pathSeo = require('path');
const DEFAULT_SITE = 'https://frame.onrender.com';   // placeholder in index.html, replaced with your real address
function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}
let indexTpl = null;
function renderIndex(req) {
  if (!indexTpl || process.env.NODE_ENV !== 'production') indexTpl = fsSeo.readFileSync(pathSeo.join(__dirname, 'public', 'index.html'), 'utf8');
  const base = siteUrl(req);
  const gsv = process.env.GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${String(process.env.GOOGLE_SITE_VERIFICATION).replace(/[^A-Za-z0-9_\-]/g, '')}"/>` : '';
  return indexTpl.split(DEFAULT_SITE).join(base).replace('<!--GOOGLE_SITE_VERIFICATION-->', gsv);
}
// REDIRECT_TO = https://your-new-address — set this on the OLD Render service so
// every visit (and Google) is sent permanently (301) to the new Frame address.
app.use((req, res, next) => {
  const to = (process.env.REDIRECT_TO || '').replace(/\/+$/, '');
  if (!to || req.path === '/healthz') return next();
  try { if (new URL(to).host === req.headers.host) return next(); } catch (e) { return next(); }
  res.redirect(301, to + req.originalUrl);
});
app.get(['/', '/index.html'], (req, res) => { res.set('Cache-Control', 'no-cache'); res.type('html').send(renderIndex(req)); });
// Terms & Privacy: fill in the contact email from CONTACT_EMAIL (.env / Render).
const legalCache = {};
app.get(['/terms.html', '/privacy.html'], (req, res) => {
  const name = req.path.slice(1);
  try {
    if (!legalCache[name]) legalCache[name] = fsSeo.readFileSync(path.join(__dirname, 'public', name), 'utf8');
    const mail = (process.env.CONTACT_EMAIL || '').trim();
    const ok = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(mail);
    const line = ok
      ? `Questions about these pages or a request about your data: write to <a href="mailto:${mail}">${mail}</a>.`
      : 'Questions about these pages: contact details will be added here soon.';
    res.type('html').send(legalCache[name].replace('<!--CONTACT-->', line));
  } catch (e) { res.status(404).end(); }
});

// Cover images from Deezer's CDN, served from our own address so the page can
// read their colours (for the full-song player background).
app.get('/api/img', async (req, res) => {
  let u;
  try { u = new URL(String(req.query.u || '')); } catch (e) { return res.status(400).end(); }
  if (u.protocol !== 'https:' || !/(^|\.)dzcdn\.net$/.test(u.hostname)) return res.status(400).end();
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return res.status(502).end();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 3e6) return res.status(413).end();
    res.set({ 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' }).send(buf);
  } catch (e) { res.status(502).end(); }
});

app.get('/api/push/key', (req, res) => res.json({ key: VAPID_PUBLIC }));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${siteUrl(req)}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const b = siteUrl(req), d = new Date().toISOString().slice(0, 10);
  const u = (p, pr) => `  <url><loc>${b}${p}</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>${pr}</priority></url>`;
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${u('/', '1.0')}\n${u('/terms.html', '0.3')}\n${u('/privacy.html', '0.3')}\n</urlset>\n`);
});
app.get('/healthz', (req, res) => res.send('ok'));

app.use(express.static(path.join(__dirname, 'public')));

// Serve SVG as og-image.png for social previews
app.get('/og-image.png', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.sendFile(path.join(__dirname, 'public', 'og-image.svg'));
});

// No accounts, no login, no Firebase. Each browser keeps a random secret
// key; the server only ever sees it to derive an anonymous ID (a hash).

// ── CHAT LIFETIME ── (24h max, sweep once a minute; env overrides for testing)
const CHANNEL_TTL_MS = Number(process.env.CHANNEL_TTL_MS) || 24 * 60 * 60 * 1000;
const CHANNEL_SWEEP_INTERVAL_MS = Number(process.env.CHANNEL_SWEEP_INTERVAL_MS) || 60 * 1000;

// ── VISITOR TRACKING ──
const visitors = [];
// The visitor log includes raw IPs and locations — admin-only data. With
// no key configured, these routes are closed by default (fail safe, not
// fail open) rather than quietly staying public.
const ANALYTICS_KEY = process.env.ANALYTICS_KEY || '';
function requireAnalyticsKey(req, res, next) {
  const key = req.headers['x-analytics-key'] || req.query.key;
  if (!ANALYTICS_KEY || key !== ANALYTICS_KEY) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  next();
}

function parseUA(ua) {
  let browser = 'Unknown', os = 'Unknown', device = 'Desktop';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) device = 'Mobile';
  else if (ua.includes('iPad')) device = 'Tablet';
  return { browser, os, device };
}

function countryFlag(code) {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

// ── API ROUTES ──

// Track visit
app.post('/api/visit', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '?';
    const ua = req.headers['user-agent'] || '';
    const page = req.body.page || '/';
    const { browser, os, device } = parseUA(ua);
    let country = 'Unknown', city = 'Unknown', flag = '🌐';
    try {
      const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,countryCode`);
      const geo = await geoRes.json();
      if (geo.status !== 'fail') { country = geo.country||'Unknown'; city = geo.city||'Unknown'; flag = countryFlag(geo.countryCode); }
    } catch(e) {}
    visitors.push({ ts: Date.now(), ip, browser, os, device, country, city, flag, page });
    if (visitors.length > 1000) visitors.shift();
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false }); }
});

app.get('/api/visitors', requireAnalyticsKey, (req, res) => res.json({ visitors }));
app.post('/api/visitors/clear', requireAnalyticsKey, (req, res) => { visitors.length = 0; res.json({ ok: true }); });

// ── MUSIC TRACKER ──
// Song recognition is done by AudD (https://audd.io) — the browser records a
// short clip from the mic (or the user picks an audio file), we forward it
// to AudD, and AudD tells us the title/artist plus its Deezer/Spotify/Apple
// Music matches. "Similar songs" come from Deezer's free public API (no key):
// related artists + their top tracks. Both calls go through this server so
// the AudD token never reaches the browser and Deezer's missing CORS
// headers don't matter.
const AUDD_API_TOKEN = process.env.AUDD_API_TOKEN || '';
console.log(AUDD_API_TOKEN ? '[Music] AudD token found ✓' : '[Music] AudD token MISSING — add AUDD_API_TOKEN to .env (see .env.example)');
const MUSIC_LIMIT_PER_HOUR = Number(process.env.MUSIC_LIMIT_PER_HOUR) || 60;
const musicHits = new Map(); // ip -> [timestamps] — keeps one person from burning the AudD quota

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '?';
}
function musicRateLimited(ip) {
  const now = Date.now(), hourAgo = now - 60 * 60 * 1000;
  const hits = (musicHits.get(ip) || []).filter(t => t > hourAgo);
  if (hits.length >= MUSIC_LIMIT_PER_HOUR) { musicHits.set(ip, hits); return true; }
  hits.push(now); musicHits.set(ip, hits);
  return false;
}
async function deezer(pathAndQuery) {
  const r = await fetch('https://api.deezer.com' + pathAndQuery);
  if (!r.ok) throw new Error('Deezer ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'Deezer error');
  return j;
}
function slimTrack(t) {
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    artist: t.artist?.name || '',
    artistId: t.artist?.id || null,
    album: t.album?.title || '',
    cover: t.album?.cover_medium || t.album?.cover || '',
    coverBig: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || '',
    preview: t.preview || '',
    link: t.link || ''
  };
}

// Recognize a clip. Body = raw audio bytes (audio/webm, audio/mp4, mp3, ...).
app.post('/api/music/recognize', express.raw({ type: () => true, limit: '6mb' }), async (req, res) => {
  try {
    if (musicRateLimited(clientIp(req))) {
      return res.json({ ok: false, error: 'Too many searches — try again in a little while.' });
    }
    if (!req.body || !req.body.length) return res.json({ ok: false, error: 'No audio received.' });

    const form = new FormData();
    if (AUDD_API_TOKEN) form.append('api_token', AUDD_API_TOKEN);
    form.append('return', 'deezer,spotify,apple_music');
    const type = req.headers['content-type'] || 'audio/webm';
    form.append('file', new Blob([req.body], { type }), 'clip.' + (type.includes('wav') ? 'wav' : type.includes('mp4') ? 'm4a' : type.includes('mpeg') ? 'mp3' : type.includes('ogg') ? 'ogg' : 'webm'));

    // Up to 2 tries, 20s each: a slow or flaky connection to AudD is the
    // most common cause of failures, and a second try usually works.
    // Quick tries (sent while the microphone is still listening) get one short
    // attempt; the final clip gets up to 2 attempts of 20 s.
    const quick = req.headers['x-frame-quick'] === '1';
    const tries = quick ? 1 : 2, waitMs = quick ? 12000 : 20000;
    let data = null, lastErr = null;
    for (let attempt = 1; attempt <= tries && !data; attempt++) {
      try {
        const r = await fetch('https://api.audd.io/', { method: 'POST', body: form, signal: AbortSignal.timeout(waitMs) });
        if (r.status === 413) return res.json({ ok: false, error: 'This audio file is too big. Use a 10–20 second clip.' });
        if (!r.ok) throw new Error('AudD HTTP ' + r.status);
        data = await r.json();
      } catch (e) {
        lastErr = e;
        console.log(`[Music] AudD attempt ${attempt} failed:`, e.name === 'TimeoutError' ? `timeout (${waitMs / 1000}s)` : e.message);
      }
    }
    if (!data) {
      const msg = lastErr?.name === 'TimeoutError'
        ? 'The recognition service took too long. Check your internet and try again.'
        : /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|fetch failed/i.test(String(lastErr?.cause?.code || lastErr?.message))
          ? 'No connection to the recognition service. Check your internet (or firewall/VPN) and try again.'
          : 'The recognition service is not responding right now. Try again in a minute.';
      return res.json({ ok: false, error: msg });
    }
    if (data.status !== 'success') {
      const code = Number(data.error?.error_code) || 0;
      const raw = data.error?.error_message || 'Recognition service error.';
      console.log('[Music] AudD error', code, raw);
      // Show people a short, clear message instead of AudD's technical text.
      let msg;
      if (!AUDD_API_TOKEN) msg = 'Music recognition is not set up yet (missing AUDD_API_TOKEN).';
      else if (code === 300 || code === 500 || code === 700 || /fingerprint|audio file|no file/i.test(raw))
        msg = 'Frame couldn’t hear the song clearly. Move closer to the music (the chorus works best) and try again.';
      else if (code === 900 || code === 901 || code === 902 || /token|limit/i.test(raw))
        msg = 'Song recognition is unavailable right now (service limit reached). Please try again later.';
      else msg = 'The recognition service had a problem. Please try again.';
      return res.json({ ok: false, error: msg });
    }
    if (!data.result) return res.json({ ok: true, found: false });

    const a = data.result;
    const dz = a.deezer || null;
    const song = {
      title: a.title,
      artist: a.artist,
      album: a.album || '',
      releaseDate: a.release_date || '',
      label: a.label || '',
      timecode: a.timecode || '',
      cover: dz?.album?.cover_big || dz?.album?.cover_medium || a.spotify?.album?.images?.[0]?.url || '',
      preview: dz?.preview || '',
      deezerId: dz?.id || null,
      artistId: dz?.artist?.id || null,
      links: {
        deezer: dz?.link || '',
        spotify: a.spotify?.external_urls?.spotify || '',
        apple: a.apple_music?.url || '',
        all: a.song_link || ''
      }
    };
    res.json({ ok: true, found: true, song });
  } catch (e) {
    console.log('[Music] Recognize error:', e.message);
    res.json({ ok: false, error: 'Could not reach the recognition service.' });
  }
});

// Charts for the Frame Music home page (Deezer, free, no key).
// Deezer's /chart endpoints change slowly (the same songs stay on top for
// weeks), so Frame mixes in Deezer's daily-updated "Top ..." chart playlists
// and makes a fresh daily selection. Everyone sees the same picks on a given
// day (Kigali time) and new picks the next day. Refreshed every 3 hours.
const CHART_TZ_OFFSET_H = Number(process.env.CHART_TZ_OFFSET_H || 2);   // Kigali = UTC+2
const dayKey = () => new Date(Date.now() + CHART_TZ_OFFSET_H * 3600e3).toISOString().slice(0, 10);
function seededRandom(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Pick n songs from a ranked list: higher-ranked songs are more likely, but
// the mix is different every day.
function dailyPick(list, n, seed) {
  const rnd = seededRandom(seed);
  return list.map((x, i) => ({ x, k: Math.pow(rnd(), 1 / (1 + 3 / (1 + i / 6))) }))   // weighted random order
    .sort((a, b) => b.k - a.k).slice(0, n).map(o => o.x);
}
function uniqTracks(list) {
  const seen = new Set();
  return list.filter(t => { const k = t && (t.id || (t.title + '|' + (t.artist?.name || ''))); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}
const chartPlaylistIds = new Map();   // name -> { id, at }
async function chartPlaylistTracks(name, limit) {
  try {
    let hit = chartPlaylistIds.get(name);
    if (!hit || Date.now() - hit.at > 24 * 3600e3) {
      const r = await deezer('/search/playlist?q=' + encodeURIComponent(name) + '&limit=15');
      const list = r.data || [];
      const exact = list.filter(p => String(p.title || '').trim().toLowerCase() === name.toLowerCase());
      const pick = exact.find(p => /deezer/i.test(p.user?.name || '')) || exact[0];
      if (!pick) return [];
      hit = { id: pick.id, at: Date.now() };
      chartPlaylistIds.set(name, hit);
    }
    const t = await deezer('/playlist/' + hit.id + '/tracks?limit=' + limit);
    return t.data || [];
  } catch (e) { return []; }
}
let chartsCache = { at: 0, day: '', data: null };
app.get('/api/music/charts', async (req, res) => {
  try {
    const day = dayKey();
    if (chartsCache.data && chartsCache.day === day && Date.now() - chartsCache.at < 3 * 3600e3) return res.json(chartsCache.data);
    const [global, worldwide, afroChart, nigeria, kenya, southAfrica, artists] = await Promise.all([
      deezer('/chart/0/tracks?limit=100').catch(() => ({ data: [] })),
      chartPlaylistTracks('Top Worldwide', 100),
      deezer('/chart/2/tracks?limit=50').catch(() => ({ data: [] })),   // genre 2 = African music
      chartPlaylistTracks('Top Nigeria', 50),
      chartPlaylistTracks('Top Kenya', 50),
      chartPlaylistTracks('Top South Africa', 50),
      deezer('/chart/0/artists?limit=40').catch(() => ({ data: [] }))
    ]);
    // Real chart order for the Top list (daily-updated playlist when found).
    const top = uniqTracks([...worldwide, ...(global.data || [])]).filter(t => t.preview || t.title);
    if (!top.length) throw new Error('no chart data');
    // Afro: mix the African charts, then a daily selection.
    const afroPool = uniqTracks([...(afroChart.data || []), ...nigeria, ...kenya, ...southAfrica]);
    const data = {
      ok: true,
      day,
      updatedAt: Date.now(),
      trending: top.slice(0, 20).map(slimTrack),
      today: dailyPick(top.slice(0, 60), 10, 'today:' + day).map(slimTrack),
      afro: dailyPick(afroPool.slice(0, 80), 15, 'afro:' + day).map(slimTrack),
      artists: dailyPick(artists.data || [], 12, 'artists:' + day).map(a => ({ id: a.id, name: a.name, picture: a.picture_medium || a.picture || '', link: a.link || '' }))
    };
    chartsCache = { at: Date.now(), day, data };
    res.json(data);
  } catch (e) {
    console.log('[Music] Charts error:', e.message);
    res.json({ ok: false, error: 'Could not load charts right now.' });
  }
});

// Search songs by name (Deezer).
app.get('/api/music/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.json({ ok: true, tracks: [] });
    const r = await deezer('/search?limit=15&q=' + encodeURIComponent(q));
    res.json({ ok: true, tracks: (r.data || []).map(slimTrack) });
  } catch (e) {
    res.json({ ok: false, error: 'Search failed.' });
  }
});

// Full song page: track + album + artist + top songs + similar + playlists
// + credits, all from Deezer's free API. Cached 1h per track.
const trackCache = new Map();
app.get('/api/music/track', async (req, res) => {
  try {
    let id = String(req.query.id || '').replace(/\D/g, '');
    if (!id && req.query.artist) {
      const q = `artist:"${req.query.artist}"` + (req.query.title ? ` track:"${req.query.title}"` : '');
      const s0 = await deezer('/search?limit=1&q=' + encodeURIComponent(q));
      id = String(s0.data?.[0]?.id || '');
    }
    if (!id) return res.json({ ok: false, error: 'Song not found on Deezer.' });
    const hit = trackCache.get(id);
    if (hit && Date.now() - hit.at < 60 * 60 * 1000) return res.json(hit.data);

    const t = await deezer('/track/' + id);
    const artistId = t.artist?.id, albumId = t.album?.id;
    const [album, artist, top, related, playlists] = await Promise.all([
      albumId ? deezer('/album/' + albumId).catch(() => null) : null,
      artistId ? deezer('/artist/' + artistId).catch(() => null) : null,
      artistId ? deezer(`/artist/${artistId}/top?limit=12`).catch(() => ({ data: [] })) : { data: [] },
      artistId ? deezer(`/artist/${artistId}/related?limit=10`).catch(() => ({ data: [] })) : { data: [] },
      deezer('/search/playlist?limit=10&q=' + encodeURIComponent(`${t.title} ${t.artist?.name || ''}`)).catch(() => ({ data: [] }))
    ]);
    const similar = (await Promise.all((related.data || []).slice(0, 10).map(ar =>
      deezer(`/artist/${ar.id}/top?limit=1`).then(j => slimTrack(j.data?.[0])).catch(() => null)
    ))).filter(Boolean);

    const data = {
      ok: true,
      track: {
        ...slimTrack(t),
        duration: t.duration || 0,
        bpm: t.bpm || 0,
        rank: t.rank || 0,
        explicit: !!t.explicit_lyrics,
        releaseDate: t.release_date || album?.release_date || '',
        isrc: t.isrc || '',
        contributors: (t.contributors || []).map(c => ({ name: c.name, role: c.role || 'Main', picture: c.picture_medium || '', link: c.link || '' }))
      },
      album: album ? {
        id: album.id, title: album.title, cover: album.cover_xl || album.cover_big || '', link: album.link || '',
        label: album.label || '', releaseDate: album.release_date || '', fans: album.fans || 0,
        genres: (album.genres?.data || []).map(g => g.name),
        tracks: (album.tracks?.data || []).slice(0, 30).map(x => ({ ...slimTrack({ ...x, album: { title: album.title, cover_medium: album.cover_medium } }), duration: x.duration || 0 }))
      } : null,
      artist: artist ? { id: artist.id, name: artist.name, picture: artist.picture_xl || artist.picture_big || '', fans: artist.nb_fan || 0, albums: artist.nb_album || 0, link: artist.link || '' } : null,
      topTracks: (top.data || []).map(slimTrack).filter(x => String(x.id) !== id).slice(0, 10),
      similar,
      playlists: (playlists.data || []).map(p => ({ id: p.id, title: p.title, picture: p.picture_big || p.picture_medium || '', link: p.link || '', tracks: p.nb_tracks || 0, by: p.user?.name || '' }))
    };
    trackCache.set(id, { at: Date.now(), data });
    if (trackCache.size > 500) trackCache.delete(trackCache.keys().next().value);
    res.json(data);
  } catch (e) {
    console.log('[Music] Track page error:', e.message);
    res.json({ ok: false, error: 'Could not load song details.' });
  }
});

// Lyrics from Musixmatch's official API (licensed). Needs MUSIXMATCH_API_KEY.
// The free developer plan returns part of the lyrics (about 30%); a paid
// Musixmatch plan returns the full text. Musixmatch's terms require showing
// their copyright line and loading their tracking pixel — the page does both.
const MUSIXMATCH_API_KEY = process.env.MUSIXMATCH_API_KEY || '';
console.log(MUSIXMATCH_API_KEY ? '[Lyrics] Musixmatch key found ✓' : '[Lyrics] No MUSIXMATCH_API_KEY — lyrics will show links instead');
console.log((process.env.YOUTUBE_API_KEY || '').trim() ? '[YouTube] API key found ✓ (full songs inside Frame)' : '[YouTube] No YOUTUBE_API_KEY — the full-song button will open a YouTube search instead');
const lyricsCache = new Map();
// ── Full song inside Frame (official YouTube player, only when the person asks) ──
// Finds the best YouTube video for a song with the YouTube Data API
// (YOUTUBE_API_KEY, free quota ≈100 searches a day). Results are remembered
// for a week, so each song is searched only once.
const YT_KEY = () => (process.env.YOUTUBE_API_KEY || '').trim();
const ytCache = new Map();            // "artist|title" -> { at, data }
const ytHits = new Map();             // ip -> [timestamps]
const ytNorm = v => String(v || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
function ytScore(item, artist, title) {
  const vt = ytNorm(item.snippet?.title), ch = ytNorm(item.snippet?.channelTitle), a = ytNorm(artist), t = ytNorm(title);
  const raw = String(item.snippet?.title || '').toLowerCase(), rawT = String(title || '').toLowerCase();   // keep (brackets) for the checks below
  let s = 0;
  if (t && vt.includes(t)) s += 5;
  if (a && (vt.includes(a) || ch.includes(a))) s += 4;
  if (/ topic$/.test(ch)) s += 3;                       // official "Artist - Topic" audio
  if (/official/.test(raw)) s += 2;
  if (/vevo/.test(ch)) s += 2;
  if (/lyric/.test(raw)) s += 0.5;
  if (/(cover|karaoke|remix|reaction|slowed|sped up|8d|instrumental|live at|tutorial|nightcore)/.test(raw) && !/(cover|remix|live|instrumental)/.test(rawT)) s -= 6;
  return s;
}
app.get('/api/music/fullsong', async (req, res) => {
  const title = String(req.query.title || '').slice(0, 150).trim(), artist = String(req.query.artist || '').slice(0, 120).trim();
  if (!title) return res.json({ ok: false, error: 'Missing song title.' });
  const key = ytNorm(artist) + '|' + ytNorm(title);
  const c = ytCache.get(key);
  if (c && Date.now() - c.at < (c.data.ok ? 7 * 864e5 : 6 * 3600e3)) return res.json(c.data);
  const search = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(artist + ' ' + title);
  if (!YT_KEY()) return res.json({ ok: false, reason: 'nokey', search });
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const hits = (ytHits.get(ip) || []).filter(t => t > Date.now() - 3600e3);
  if (hits.length >= 30) return res.json({ ok: false, reason: 'limit', search });
  hits.push(Date.now()); ytHits.set(ip, hits);
  try {
    const u = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=8&safeSearch=moderate'
      + '&q=' + encodeURIComponent(`${artist} ${title}`.trim()) + '&key=' + encodeURIComponent(YT_KEY());
    const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    if (d.error) {
      console.log('[YouTube] API error:', d.error.code, d.error.message);
      const data = { ok: false, reason: d.error.code === 403 ? 'quota' : 'error', search };
      return res.json(data);                             // not cached: try again later
    }
    const best = (d.items || []).map(it => ({ it, s: ytScore(it, artist, title) })).sort((a, b) => b.s - a.s)[0];
    const data = best && best.s >= 4
      ? { ok: true, videoId: best.it.id.videoId, title: best.it.snippet.title, channel: best.it.snippet.channelTitle, search }
      : { ok: false, reason: 'notfound', search };
    ytCache.set(key, { at: Date.now(), data });
    if (ytCache.size > 3000) ytCache.delete(ytCache.keys().next().value);
    res.json(data);
  } catch (e) {
    console.log('[YouTube] request failed:', e.message);
    res.json({ ok: false, reason: 'error', search });
  }
});

app.get('/api/music/lyrics', async (req, res) => {
  try {
    if (!MUSIXMATCH_API_KEY) return res.json({ ok: false, reason: 'nokey' });
    const title = String(req.query.title || '').slice(0, 120), artist = String(req.query.artist || '').slice(0, 120);
    const isrc = String(req.query.isrc || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    const key = (isrc || (artist + '|' + title)).toLowerCase();
    const hit = lyricsCache.get(key);
    if (hit && Date.now() - hit.at < 24 * 60 * 60 * 1000) return res.json(hit.data);
    const q = new URLSearchParams({ apikey: MUSIXMATCH_API_KEY, format: 'json' });
    if (isrc) q.set('track_isrc', isrc); else { q.set('q_track', title); q.set('q_artist', artist); }
    let r = await fetch('https://api.musixmatch.com/ws/1.1/matcher.lyrics.get?' + q, { signal: AbortSignal.timeout(10000) });
    let j = await r.json();
    if (j?.message?.header?.status_code !== 200 && isrc && title) {   // ISRC miss → try by name
      const q2 = new URLSearchParams({ apikey: MUSIXMATCH_API_KEY, format: 'json', q_track: title, q_artist: artist });
      r = await fetch('https://api.musixmatch.com/ws/1.1/matcher.lyrics.get?' + q2, { signal: AbortSignal.timeout(10000) });
      j = await r.json();
    }
    const code = j?.message?.header?.status_code;
    const L = j?.message?.body?.lyrics;
    let data;
    if (code === 200 && L?.lyrics_body) {
      const body = String(L.lyrics_body).replace(/\n*\*{3,}[^\n]*\*{3,}\s*(\(\d+\))?\s*$/, '').trim();
      data = { ok: true, lyrics: body, partial: /\*{3,}/.test(L.lyrics_body), copyright: L.lyrics_copyright || '', pixel: L.pixel_tracking_url || '', explicit: !!L.explicit };
    } else if (code === 401 || code === 402) {
      data = { ok: false, reason: code === 402 ? 'limit' : 'badkey' };
    } else data = { ok: false, reason: 'notfound' };
    if (data.ok || data.reason === 'notfound') lyricsCache.set(key, { at: Date.now(), data });
    res.json(data);
  } catch (e) {
    console.log('[Lyrics] error:', e.message);
    res.json({ ok: false, reason: 'error' });
  }
});

// Similar songs: other hits by the same artist + top tracks of related artists.
app.get('/api/music/similar', async (req, res) => {
  try {
    let artistId = req.query.artistId;
    const skipId = String(req.query.trackId || '');
    if (!artistId && req.query.artist) {
      const q = `artist:"${req.query.artist}"` + (req.query.title ? ` track:"${req.query.title}"` : '');
      const s = await deezer('/search?limit=1&q=' + encodeURIComponent(q));
      artistId = s.data?.[0]?.artist?.id;
    }
    if (!artistId) return res.json({ ok: true, sameArtist: [], similar: [] });

    const [top, related] = await Promise.all([
      deezer(`/artist/${artistId}/top?limit=6`),
      deezer(`/artist/${artistId}/related?limit=8`)
    ]);
    const sameArtist = (top.data || []).map(slimTrack).filter(t => String(t.id) !== skipId).slice(0, 5);
    const relTops = await Promise.all((related.data || []).slice(0, 8).map(ar =>
      deezer(`/artist/${ar.id}/top?limit=1`).then(j => slimTrack(j.data?.[0])).catch(() => null)
    ));
    res.json({ ok: true, sameArtist, similar: relTops.filter(Boolean) });
  } catch (e) {
    console.log('[Music] Similar error:', e.message);
    res.json({ ok: false, error: 'Could not load similar songs.' });
  }
});

// ── PRIVATE 1-ON-1 CHATS ──
// A chat ("room") is for exactly two accounts. The creator gets a random
// secret code and gives it to ONE person; the first other account to use
// it is locked in as the partner and the code stops working for anyone
// else. Rooms, messages, photos and voice notes live ONLY in this
// process's memory — nothing is written to Firestore or disk. When either
// person taps END & DELETE, the room is wiped for both and the code is
// gone, as if the chat never happened. Rooms also self-destruct when
// nobody has been connected for ROOM_IDLE_MS, and always after
// CHANNEL_TTL_MS (24h by default).
const ROOM_IDLE_MS = Number(process.env.ROOM_IDLE_MS) || 10 * 60 * 1000;
const MAX_ROOMS_PER_USER = 3;
const rooms = {};          // code -> room
const userSockets = {};    // uid  -> Set(socketId) — for live notices outside a room
// One-time invite links: ?inv=<token>. Single use, expire after
// INVITE_TTL_MS, and a new INVITE replaces the previous link. The creator
// opening their own link does NOT burn it (unlike some apps), so a slip
// can't lock your guest out.
const INVITE_TTL_MS = Number(process.env.INVITE_TTL_MS) || 10 * 60 * 1000;
const invites = {};        // token -> { code, expiresAt }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24); }

// Anonymous identity: the browser's secret key → stable anonymous ID.
// The key never leaves this function and the ID can't be turned back
// into the key, so seeing someone's ID (e.g. on their messages) doesn't
// let you act as them.
async function verifyUser(key, name) {
  key = String(key || '');
  if (key.length < 16 || key.length > 200) throw new Error('Missing device key — please reload the page.');
  const uid = 'a_' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
  return { uid, name: cleanName(name) || 'agent' };
}

function newCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 8 }, () => abc[Math.floor(Math.random() * abc.length)]).join(''); } while (rooms[c]);
  return c;
}
function roomSummary(r, uid) {
  const isCreator = r.creatorUid === uid;
  return {
    code: r.code,
    isCreator,
    partnerName: isCreator ? r.peerName : r.creatorName,
    waiting: !r.peerUid,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt
  };
}
function emitToUser(uid, ev, data) {
  for (const sid of userSockets[uid] || []) io.to(sid).emit(ev, data);
}
function broadcastPresence(code) {
  const r = rooms[code]; if (!r) return;
  const online = new Set([...r.sockets.values()].map(m => m.uid));
  io.to(code).emit('room:presence', { online: [...online], members: (r.peerUid ? 2 : 1) });
}
function broadcastVoiceUsers(code) {
  const r = rooms[code]; if (!r) return;
  const users = [...r.voiceUsers].map(id => ({ id, username: r.sockets.get(id)?.username || '?' }));
  io.to(code).emit('voice:users', users);
}

// Wipes a room completely — messages, media, code — and tells both people.
function destroyRoom(code, reason) {
  const r = rooms[code]; if (!r) return;
  const targets = new Set(r.sockets.keys());
  [r.creatorUid, r.peerUid].filter(Boolean).forEach(uid => (userSockets[uid] || []).forEach(sid => targets.add(sid)));
  targets.forEach(sid => io.to(sid).emit('room:deleted', { code, reason }));
  io.in(code).socketsLeave(code);
  if (r.invite) delete invites[r.invite];
  if (r.call) clearTimeout(r.call.timer);
  r.messages.length = 0;
  delete rooms[code];
  console.log(`[Room] ${code} deleted (${reason})`);
}

app.post('/api/rooms/create', async (req, res) => {
  try {
    const me = await verifyUser(req.body.token, req.body.username);
    const mine = Object.values(rooms).filter(r => r.creatorUid === me.uid || r.peerUid === me.uid);
    if (mine.length >= MAX_ROOMS_PER_USER) {
      return res.json({ ok: false, error: `You can have ${MAX_ROOMS_PER_USER} active chats at a time. End one first.` });
    }
    const now = Date.now(), code = newCode();
    rooms[code] = {
      code, creatorUid: me.uid, creatorName: me.name, peerUid: null, peerName: null,
      createdAt: now, expiresAt: now + CHANNEL_TTL_MS, emptySince: now,
      messages: [], sockets: new Map(), voiceUsers: new Set()
    };
    res.json({ ok: true, room: roomSummary(rooms[code], me.uid) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

io.on('connection', (socket) => {
  socket.data = {};

  // Called right after login so we can push "X joined" / "chat deleted"
  // to this person even when they're not inside that chat.
  socket.on('user:hello', async ({ token, username } = {}, cb) => {
    try {
      const me = await verifyUser(token, username);
      socket.data.uid = me.uid; socket.data.username = me.name;
      (userSockets[me.uid] ||= new Set()).add(socket.id);
      const mine = Object.values(rooms).filter(r => r.creatorUid === me.uid || r.peerUid === me.uid);
      cb?.({ ok: true, uid: me.uid, rooms: mine.map(r => roomSummary(r, me.uid)) });
      mine.forEach(r => { if (r.call && r.call.state === 'ringing' && r.call.toUid === me.uid) socket.emit('call:incoming', callInfo(r)); });
    } catch (e) { cb?.({ ok: false, error: e.message }); }
  });

  socket.on('room:join', async ({ code, token, username, inv, alias: rawAlias } = {}, cb) => {
    try {
      const me = await verifyUser(token, username);
      if (inv) {
        const i = invites[inv];
        if (!i || i.expiresAt <= Date.now() || !rooms[i.code]) {
          delete invites[inv];
          return cb?.({ ok: false, error: 'This invite link was already used or has expired. Ask for a new one.' });
        }
        code = i.code;
        // Burn it — unless it's the creator peeking at their own link.
        if (rooms[code].creatorUid !== me.uid) { delete invites[inv]; rooms[code].invite = null; }
      }
      code = String(code || '').trim().toUpperCase();
      const r = rooms[code];
      if (!r) return cb?.({ ok: false, error: 'This chat does not exist or was already deleted.' });
      let justPaired = false;
      if (r.creatorUid !== me.uid && r.peerUid !== me.uid) {
        if (r.peerUid) return cb?.({ ok: false, error: 'This chat is private and already has two people.' });
        r.peerUid = me.uid; r.peerName = me.name; justPaired = true;
      }
      const alias = cleanName(rawAlias);
      const isC = r.creatorUid === me.uid;
      if (alias) { me.name = alias; if (isC) r.creatorName = alias; else if (r.peerUid === me.uid) r.peerName = alias; }
      else if (isC && r.creatorName) me.name = r.creatorName;
      else if (!isC && r.peerUid === me.uid && r.peerName) me.name = r.peerName;
      if (socket.data.code && socket.data.code !== code) leaveRoom(socket);
      socket.join(code);
      socket.data = { ...socket.data, uid: me.uid, username: me.name, code };
      (userSockets[me.uid] ||= new Set()).add(socket.id);
      r.sockets.set(socket.id, { uid: me.uid, username: me.name });
      r.emptySince = null;
      cb?.({ ok: true, room: roomSummary(r, me.uid), history: r.messages, myUid: me.uid });
      broadcastPresence(code);
      broadcastVoiceUsers(code);
      if (justPaired) {
        socket.to(code).emit('chat:system', { text: `${me.name} joined — the chat is now locked to you two`, ts: Date.now() });
        emitToUser(r.creatorUid, 'room:paired', { room: roomSummary(r, r.creatorUid) });
      }
    } catch (e) { cb?.({ ok: false, error: e.message }); }
  });

  socket.on('room:leave', () => leaveRoom(socket));

  // Creator asks for a fresh one-time invite link (old one stops working).
  socket.on('room:invite', (_, cb) => {
    const r = rooms[socket.data?.code];
    if (!r || r.creatorUid !== socket.data.uid) return cb?.({ ok: false, error: 'Only the person who started the chat can invite.' });
    if (r.peerUid) return cb?.({ ok: false, error: 'Your guest is already here — the chat is locked.' });
    if (r.invite) delete invites[r.invite];
    const tok = crypto.randomBytes(18).toString('base64url');
    const expiresAt = Date.now() + INVITE_TTL_MS;
    invites[tok] = { code: r.code, expiresAt };
    r.invite = tok;
    cb?.({ ok: true, inv: tok, expiresAt });
  });

  // Change the name shown in the chat.
  socket.on('user:rename', ({ name } = {}, cb) => {
    name = cleanName(name);
    if (!name) return cb?.({ ok: false, error: 'Name cannot be empty.' });
    const old = socket.data.username;
    socket.data.username = name;
    const r = rooms[socket.data.code];
    if (r) {
      for (const [sid, m] of r.sockets) if (m.uid === socket.data.uid) { m.username = name; const s2 = io.sockets.sockets.get(sid); if (s2) s2.data.username = name; }
      if (r.creatorUid === socket.data.uid) r.creatorName = name; else if (r.peerUid === socket.data.uid) r.peerName = name;
      if (old && old !== name) io.to(r.code).emit('chat:system', { text: `${old} is now ${name}`, ts: Date.now() });
      [r.creatorUid, r.peerUid].filter(Boolean).forEach(uid => emitToUser(uid, 'room:update', { room: roomSummary(r, uid) }));
      broadcastPresence(r.code);
    }
    cb?.({ ok: true, name });
  });

  // Either person can end the chat; it disappears for both, forever.
  socket.on('room:end', (_, cb) => {
    const { code, uid } = socket.data || {};
    const r = rooms[code];
    if (!r || (r.creatorUid !== uid && r.peerUid !== uid)) return cb?.({ ok: false });
    destroyRoom(code, `${socket.data.username} ended the chat`);
    cb?.({ ok: true });
  });
  // End a chat from the list, without opening it.
  socket.on('room:end-code', async ({ code, token } = {}, cb) => {
    try {
      const me = await verifyUser(token);
      const r = rooms[String(code || '').toUpperCase()];
      if (!r) return cb?.({ ok: true });
      if (r.creatorUid !== me.uid && r.peerUid !== me.uid) return cb?.({ ok: false });
      destroyRoom(r.code, `${me.name} ended the chat`);
      cb?.({ ok: true });
    } catch (e) { cb?.({ ok: false, error: e.message }); }
  });

  function inRoom() {
    const { code, uid } = socket.data || {};
    const r = rooms[code];
    return r && r.sockets.has(socket.id) ? r : null;
  }
  function post(msg) {
    const r = inRoom(); if (!r) return false;
    const full = { id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, from: socket.data.uid, username: socket.data.username, ts: Date.now(), ...msg };
    // Photos are view-once: delivered live, never kept in the history.
    r.messages.push(full.type === 'photo' ? { ...full, dataUrl: null, buf: null, gone: true } : full);
    if (r.messages.length > 300) r.messages.shift();
    // The other person gets the full message; the sender only gets a light
    // confirmation (no need to download their own photo / voice note again).
    socket.to(r.code).emit('chat:message', full);
    socket.emit('chat:message', (full.buf || full.dataUrl) ? { ...full, buf: null, dataUrl: null, mine: true } : full);
    const other = r.creatorUid === socket.data.uid ? r.peerUid : r.creatorUid;
    if (other) emitToUser(other, 'notification:new', { code: r.code, text: `${socket.data.username}: ${msg.text ? msg.text.slice(0, 40) : msg.type === 'voice' ? '[voice]' : '[photo]'}` });
    return true;
  }
  const cid = v => String(v || '').slice(0, 40);
  const isBin = b => Buffer.isBuffer(b) || b instanceof ArrayBuffer || ArrayBuffer.isView(b);
  const toBuf = b => Buffer.isBuffer(b) ? b : Buffer.from(b instanceof ArrayBuffer ? b : b.buffer);
  const safeMime = (m, kind) => (new RegExp('^' + kind + '/[a-z0-9.+-]+(;[ a-z0-9=.,-]*)?$', 'i').test(String(m || '')) ? String(m) : kind + (kind === 'image' ? '/jpeg' : '/webm'));
  socket.on('chat:message', ({ text, cid: c } = {}, cb) => {
    if (!text?.trim()) return cb?.({ ok: false });
    const ok = post({ type: 'text', text: text.trim().slice(0, 2000), cid: cid(c) }); cb?.({ ok });
  });
  // Photos / voice notes arrive as binary (fast) or, from older pages, as a data URL.
  socket.on('chat:photo', ({ dataUrl, buf, mime, cid: c } = {}, cb) => {
    if (buf && isBin(buf)) { const b = toBuf(buf); if (b.length > 7e6) return cb?.({ ok: false }); return cb?.({ ok: post({ type: 'photo', buf: b, mime: safeMime(mime, 'image'), cid: cid(c) }) }); }
    if (!dataUrl || !String(dataUrl).startsWith('data:image/')) return cb?.({ ok: false });
    const ok = post({ type: 'photo', dataUrl, cid: cid(c) }); cb?.({ ok });
  });
  socket.on('chat:voice', ({ dataUrl, buf, mime, duration, cid: c } = {}, cb) => {
    const d = Number(duration) || 0;
    if (buf && isBin(buf)) { const b = toBuf(buf); if (b.length > 5e6) return cb?.({ ok: false }); return cb?.({ ok: post({ type: 'voice', buf: b, mime: safeMime(mime, 'audio'), duration: d, cid: cid(c) }) }); }
    if (!dataUrl || !String(dataUrl).startsWith('data:audio/')) return cb?.({ ok: false });
    const ok = post({ type: 'voice', dataUrl, duration: d, cid: cid(c) }); cb?.({ ok });
  });

  // ── Push subscriptions (call alerts) ──
  socket.on('push:subscribe', ({ sub } = {}, cb) => {
    const uid = socket.data?.uid;
    if (!uid || !sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return cb?.({ ok: false });
    const m = (pushSubs[uid] ||= new Map());
    m.set(sub.endpoint, { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } });
    while (m.size > 5) m.delete(m.keys().next().value);
    cb?.({ ok: true });
  });
  socket.on('push:unsubscribe', ({ endpoint } = {}) => { pushSubs[socket.data?.uid]?.delete(String(endpoint || '')); });

  // ── Calls: ring the other person, give up after CALL_RING_MS ──
  socket.on('call:start', ({ video = false } = {}, cb) => {
    const r = inRoom(); if (!r) return cb?.({ ok: false, error: 'Open the chat first.' });
    const me = socket.data.uid, other = r.creatorUid === me ? r.peerUid : r.creatorUid;
    if (!other) return cb?.({ ok: false, error: 'Nobody has joined this chat yet.' });
    if (r.call && r.call.state === 'ringing') return cb?.({ ok: false, error: 'A call is already ringing.' });
    if (r.call) clearTimeout(r.call.timer);
    r.call = { id: crypto.randomBytes(6).toString('hex'), fromSid: socket.id, fromUid: me, fromName: socket.data.username, toUid: other, video: !!video, state: 'ringing', at: Date.now() };
    r.call.timer = setTimeout(() => endRinging(r, 'missed'), CALL_RING_MS);
    const info = callInfo(r);
    emitToUser(other, 'call:incoming', info);
    sendPush(other, { type: 'call', tag: 'call-' + r.code, ...info });
    cb?.({ ok: true, callId: r.call.id, ringMs: CALL_RING_MS });
  });
  socket.on('call:accept', ({ code, callId } = {}, cb) => {
    const r = rooms[String(code || '').toUpperCase()];
    if (!r || !r.call || r.call.id !== callId || r.call.state !== 'ringing' || r.call.toUid !== socket.data?.uid) return cb?.({ ok: false, error: 'This call has ended.' });
    clearTimeout(r.call.timer); r.call.state = 'active';
    io.to(r.call.fromSid).emit('call:accepted', { callId });
    for (const sid of userSockets[r.call.toUid] || []) if (sid !== socket.id) io.to(sid).emit('call:stop-ring', { code: r.code, callId });
    cb?.({ ok: true, video: r.call.video });
  });
  socket.on('call:decline', ({ code, callId } = {}) => {
    const r = rooms[String(code || '').toUpperCase()];
    if (!r || !r.call || r.call.id !== callId || r.call.state !== 'ringing' || r.call.toUid !== socket.data?.uid) return;
    endRinging(r, 'declined');
  });
  socket.on('call:cancel', () => {
    const r = inRoom();
    if (r && r.call && r.call.state === 'ringing' && r.call.fromSid === socket.id) endRinging(r, 'cancelled');
  });

  // Voice/Video WebRTC (2 people)
  socket.on('voice:join', ({ video = false } = {}, cb) => {
    const r = inRoom(); if (!r) return cb?.({ ok: false });
    r.voiceUsers.add(socket.id);
    const peers = [...r.voiceUsers].filter(id => id !== socket.id);
    peers.forEach(p => io.to(p).emit('voice:new-peer', { fromId: socket.id, username: socket.data.username, video }));
    broadcastVoiceUsers(r.code);
    cb?.({ ok: true, peers });
  });
  socket.on('voice:leave', () => leaveVoice(socket));
  const relay = (ev, key) => socket.on(ev, (data = {}) => {
    const r = inRoom(); if (!r || !r.sockets.has(data.targetId)) return;
    io.to(data.targetId).emit(ev, { fromId: socket.id, [key]: data[key] });
  });
  relay('voice:offer', 'offer'); relay('voice:answer', 'answer'); relay('voice:ice', 'candidate');

  socket.on('disconnect', () => {
    leaveRoom(socket);
    const uid = socket.data?.uid;
    if (uid && userSockets[uid]) { userSockets[uid].delete(socket.id); if (!userSockets[uid].size) delete userSockets[uid]; }
  });
});

function callInfo(r) {
  return { code: r.code, callId: r.call.id, from: r.call.fromName, video: r.call.video, ringMs: Math.max(0, CALL_RING_MS - (Date.now() - r.call.at)) };
}
function roomSystem(r, text) {
  const m = { id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, type: 'system', text, ts: Date.now() };
  r.messages.push(m); if (r.messages.length > 300) r.messages.shift();
  io.to(r.code).emit('chat:message', m);
}
// A ringing call ends without being answered: missed, declined or cancelled.
function endRinging(r, how) {
  const c = r.call; if (!c || c.state !== 'ringing') return;
  clearTimeout(c.timer); c.state = 'ended'; r.call = null;
  const calleeName = (r.creatorUid === c.toUid ? r.creatorName : r.peerName) || 'Your friend';
  const kind = c.video ? 'video' : 'voice';
  io.to(c.fromSid).emit(how === 'declined' ? 'call:declined' : 'call:no-answer', { name: calleeName, how });
  emitToUser(c.toUid, 'call:missed', { code: r.code, callId: c.id, from: c.fromName, video: c.video, how });
  if (how !== 'declined') sendPush(c.toUid, { type: 'missed', tag: 'call-' + r.code, code: r.code, from: c.fromName, video: c.video });
  roomSystem(r, how === 'declined' ? `${calleeName} declined the ${kind} call` : `Missed ${kind} call from ${c.fromName}`);
  const s = io.sockets.sockets.get(c.fromSid);
  if (s && how !== 'cancelled') leaveVoice(s);
}
function leaveVoice(sock) {
  const r = rooms[sock.data?.code];
  if (!r || !r.voiceUsers.has(sock.id)) return;
  if (r.call && r.call.state === 'ringing' && r.call.fromSid === sock.id) endRinging(r, 'cancelled');
  r.voiceUsers.delete(sock.id);
  if (!r.voiceUsers.size && r.call) { clearTimeout(r.call.timer); r.call = null; }
  io.to(r.code).emit('voice:peer-left', { fromId: sock.id });
  broadcastVoiceUsers(r.code);
}
function leaveRoom(sock) {
  const code = sock.data?.code;
  const r = rooms[code];
  if (r) {
    leaveVoice(sock);
    r.sockets.delete(sock.id);
    if (!r.sockets.size) r.emptySince = Date.now();
    broadcastPresence(code);
  }
  sock.leave(code);
  if (sock.data) sock.data.code = null;
}

// Self-destruct sweep: idle rooms and rooms past their 24h lifetime.
setInterval(() => {
  const now = Date.now();
  for (const [t, i] of Object.entries(invites)) if (i.expiresAt <= now) { delete invites[t]; if (rooms[i.code]?.invite === t) rooms[i.code].invite = null; }
  for (const r of Object.values(rooms)) {
    if (r.expiresAt <= now) destroyRoom(r.code, 'This chat reached its 24-hour limit and was deleted');
    else if (r.emptySince && now - r.emptySince >= ROOM_IDLE_MS) destroyRoom(r.code, 'Nobody was here for a while, so the chat was deleted');
  }
}, CHANNEL_SWEEP_INTERVAL_MS);

function getLocalIP() {
  const i = os.networkInterfaces();
  for (const n of Object.keys(i)) for (const iface of i[n]) if (iface.family === 'IPv4' && !iface.internal) return iface.address;
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║  FRAME — PRIVATE CHAT + FRAME MUSIC  ║`);
  console.log(`╠═══════════════════════════════════════╣`);
  console.log(`║  Local:   http://localhost:${PORT}          ║`);
  console.log(`║  Network: http://${ip}:${PORT}       ║`);
  console.log(`╚═══════════════════════════════════════╝\n`);
});
