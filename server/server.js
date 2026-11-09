/* ==========================================================================
   ACCOOM local test server  (npm run dev)

   Makes your laptop the shared database so several browsers (and phones on
   the same Wi-Fi) can test ACCOOM together:

     - serves the site (same files Live Server would)
     - keeps the agents' public listings + their photos/videos
     - keeps customer <-> agent chats

   Data lives in server/data/ (db.json + uploads/). Delete that folder to
   start fresh. No packages needed, only Node 18+.

   TESTING ONLY: there are no real accounts here, anyone who can reach the
   port can read the data. Do not expose it to the internet.
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.ACCOOM_DATA ? path.resolve(process.env.ACCOOM_DATA) : path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const DB_FILE = path.join(DATA, 'db.json');
const PORT = Number(process.env.PORT) || 3000;

const MAX_JSON = 6 * 1024 * 1024;          // listings / chat payloads
const MAX_MEDIA = 600 * 1024 * 1024;       // one photo / video

fs.mkdirSync(UPLOADS, { recursive: true });

/* ----------------------------------------------------------------- database */
let db = { instance: crypto.randomBytes(6).toString('hex'), listings: {}, conversations: {} };
try {
  const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (saved && typeof saved === 'object') db = Object.assign(db, saved);
} catch (e) { /* first run */ }

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(db), (err) => {
      if (!err) fs.rename(tmp, DB_FILE, () => {});
    });
  }, 150);
}
function flush() {
  clearTimeout(saveTimer);
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (e) { /* ignore */ }
}
process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('SIGTERM', () => { flush(); process.exit(0); });

/* ------------------------------------------------------------------ helpers */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.xml': 'application/xml'
};
const EXT_BY_TYPE = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif',
  'image/svg+xml': '.svg', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'
};

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

function readJson(req, limit = MAX_JSON) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(Object.assign(new Error('Bad JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

// Names and text from other people end up inside page HTML (header dropdown),
// so angle brackets and quotes never get stored.
function cleanName(v, max = 80) {
  return String(v == null ? '' : v).replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function cleanText(v) { return String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, 4000); }
function cleanId(v) { return String(v == null ? '' : v).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 120); }

function log(kind, text) {
  const t = new Date().toLocaleTimeString();
  console.log('  [' + t + '] ' + kind + ': ' + text);
}

// http://localhost:3000/_status : what the server holds right now.
function statusPage() {
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const agents = Object.keys(db.listings).map((k) => '<h3>Agent ' + esc(k) + '</h3><ul>' +
    db.listings[k].map((l) => '<li>' + esc(l.name || l.id) + ' - ' + esc(l.location || '') + ' - N' + esc(l.price) + ' - ' + ((l.images || []).length) + ' photo(s)</li>').join('') + '</ul>').join('');
  const chats = Object.values(db.conversations).map((c) => '<li>' + esc(c.customerName) + ' &harr; ' + esc(c.agentName) + ' about ' + esc(c.propertyName) + ' (' + c.messages.length + ' messages)</li>').join('');
  return '<!doctype html><meta charset="utf-8"><title>ACCOOM server</title><body style="font:15px system-ui;max-width:720px;margin:2rem auto;padding:0 1rem">' +
    '<h2>ACCOOM test server</h2><p>Listings shared by agents: <b>' + Object.values(db.listings).reduce((n, l) => n + l.length, 0) + '</b>. Chats: <b>' + Object.keys(db.conversations).length + '</b>.</p>' +
    (agents || '<p>No agent has shared a listing yet. An agent must be logged in on THIS address, with a submitted (approved) listing, and open any page.</p>') +
    '<h3>Chats</h3><ul>' + (chats || '<li>none yet</li>') + '</ul></body>';
}

/* ---------------------------------------------------------------------- API */
async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  if (p === '/api/ping' && method === 'GET') return sendJson(res, 200, { ok: true, instance: db.instance });

  /* ---- listings: each agent owns one list (their public listings) ---- */
  if (p === '/api/listings' && method === 'GET') {
    const out = [];
    Object.keys(db.listings).forEach((agentKey) => {
      (db.listings[agentKey] || []).forEach((l) => out.push(Object.assign({}, l, { agentKey })));
    });
    return sendJson(res, 200, { listings: out });
  }

  let m = p.match(/^\/api\/listings\/([A-Za-z0-9_-]{1,60})$/);
  if (m && method === 'PUT') {
    const body = await readJson(req);
    const list = Array.isArray(body.listings) ? body.listings.filter((l) => l && l.id != null) : [];
    if (list.length) db.listings[m[1]] = list; else delete db.listings[m[1]];
    saveSoon();
    log('listings', 'agent ' + m[1] + ' now shares ' + list.length + ' listing(s)' + (list.length ? ': ' + list.map((l) => l.name || l.id).join(', ') : ''));
    return sendJson(res, 200, { ok: true, count: list.length });
  }

  /* ---- media: raw body, stored by content hash ---- */
  if (p === '/api/media' && method === 'POST') {
    const type = String(url.searchParams.get('type') || '').toLowerCase();
    const ext = EXT_BY_TYPE[type] || '.bin';
    const tmp = path.join(UPLOADS, '.up-' + crypto.randomBytes(6).toString('hex'));
    const hash = crypto.createHash('sha1');
    const out = fs.createWriteStream(tmp);
    let size = 0, failed = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_MEDIA && !failed) { failed = true; req.destroy(); out.destroy(); fs.unlink(tmp, () => {}); return; }
      hash.update(c);
    });
    req.pipe(out);
    out.on('finish', () => {
      if (failed) return sendJson(res, 413, { error: 'Too large' });
      const name = hash.digest('hex') + ext;
      fs.rename(tmp, path.join(UPLOADS, name), (err) => {
        if (err) { fs.unlink(tmp, () => {}); return sendJson(res, 500, { error: 'Could not save' }); }
        log('media', name + ' (' + Math.round(size / 1024) + ' KB)');
        sendJson(res, 200, { url: '/uploads/' + name });
      });
    });
    out.on('error', () => { fs.unlink(tmp, () => {}); if (!res.headersSent) sendJson(res, 500, { error: 'Could not save' }); });
    return;
  }

  /* ---- chats ---- */
  if (p === '/api/conversations' && method === 'GET') {
    const key = cleanId(url.searchParams.get('key'));
    if (!key) return sendJson(res, 400, { error: 'key required' });
    const list = Object.values(db.conversations)
      .filter((c) => c.agentKey === key || c.customerKey === key)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return sendJson(res, 200, { conversations: list });
  }

  m = p.match(/^\/api\/conversations\/([A-Za-z0-9_.:-]{1,160})\/messages$/);
  if (m && method === 'POST') {
    const body = await readJson(req);
    const id = m[1];
    const senderKey = cleanId(body.senderKey);
    const msg = body.message || {};
    const text = cleanText(msg.text);
    if (!senderKey || !text) return sendJson(res, 400, { error: 'senderKey and text required' });

    let conv = db.conversations[id];
    // Nobody may write to themselves: refuse a conversation whose two sides are the same person.
    if (conv && conv.agentKey === conv.customerKey) return sendJson(res, 400, { error: 'You cannot message yourself' });
    {
      const m0 = body.meta || {};
      if (m0.agentKey && m0.customerKey && cleanId(m0.agentKey) === cleanId(m0.customerKey)) return sendJson(res, 400, { error: 'You cannot message yourself' });
    }
    if (!conv) {
      const meta = body.meta || {};
      const agentKey = cleanId(meta.agentKey), customerKey = cleanId(meta.customerKey);
      if (!agentKey || !customerKey || agentKey === customerKey || senderKey !== customerKey) {
        return sendJson(res, 400, { error: 'A conversation is started by the person writing first' });
      }
      // Agent-to-agent (Permissions Stage 3): the person writing first may be a customer OR another agent.
      // The recipient must be a real agent who shares the listing the chat is about, and the conversation id
      // must belong to the starter (ends with their key), so nobody can pre-register an id another person
      // will later use. (The starter's role is display-only: this test server has no authentication.)
      const sharedByRecipient = db.listings[agentKey] || [];
      const propId = cleanId(meta.propertyId);
      if (!sharedByRecipient.length || (propId && !sharedByRecipient.some((l) => cleanId(l.id) === propId))) {
        return sendJson(res, 400, { error: 'That agent does not share this listing' });
      }
      if (!id.endsWith('-' + customerKey)) return sendJson(res, 400, { error: 'Invalid conversation id' });
      conv = db.conversations[id] = {
        id, agentKey, customerKey,
        agentName: cleanName(meta.agentName) || 'Agent',
        customerName: cleanName(meta.customerName) || 'Customer',
        customerRole: meta.customerRole === 'agent' ? 'agent' : 'customer',
        propertyId: cleanId(meta.propertyId),
        propertyName: cleanName(meta.propertyName, 140),
        createdAt: Date.now(), updatedAt: Date.now(),
        unread: { agent: 0, customer: 0 },
        messages: []
      };
    }

    let side = null;
    if (senderKey === conv.agentKey) side = 'agent';
    else if (senderKey === conv.customerKey) side = 'customer';
    if (!side) return sendJson(res, 403, { error: 'Not part of this conversation' });

    const mid = cleanId(msg.id) || ('m-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'));
    if (!conv.messages.some((x) => x.id === mid)) {
      const ts = Number(msg.ts) > 0 ? Math.min(Number(msg.ts), Date.now() + 60000) : Date.now();
      conv.messages.push({ id: mid, from: side, text, ts });
      log('chat', (side === 'agent' ? conv.agentName : conv.customerName) + ' -> ' + (side === 'agent' ? conv.customerName : conv.agentName) + ' about "' + conv.propertyName + '"');
      conv.messages.sort((a, b) => a.ts - b.ts);
      const other = side === 'agent' ? 'customer' : 'agent';
      conv.unread[other] = (conv.unread[other] || 0) + 1;
      conv.updatedAt = Date.now();
      saveSoon();
    }
    return sendJson(res, 200, { ok: true, conversation: conv });
  }

  m = p.match(/^\/api\/conversations\/([A-Za-z0-9_.:-]{1,160})\/read$/);
  if (m && method === 'POST') {
    const body = await readJson(req);
    const conv = db.conversations[m[1]];
    const key = cleanId(body.key);
    if (!conv) return sendJson(res, 404, { error: 'Not found' });
    const side = key === conv.agentKey ? 'agent' : key === conv.customerKey ? 'customer' : null;
    if (!side) return sendJson(res, 403, { error: 'Not part of this conversation' });
    if (conv.unread[side]) { conv.unread[side] = 0; saveSoon(); }
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'Unknown API route' });
}

/* ------------------------------------------------------------- static files */
const BLOCKED = /^\/(server|node_modules|\.git|\.vscode|tests|dist)(\/|$)/;

function sendFile(req, res, file, stat, cache) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? parseInt(range[1], 10) : stat.size - parseInt(range[2], 10);
    let end = range[1] && range[2] ? parseInt(range[2], 10) : stat.size - 1;
    if (start < 0) start = 0;
    if (start >= stat.size || end >= stat.size) end = stat.size - 1;
    if (start > end) { res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size }); return res.end(); }
    res.writeHead(206, Object.assign(headers, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 }));
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, Object.assign(headers, { 'Content-Length': stat.size }));
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end('Bad request'); }

  // Same redirects vercel.json does in production.
  if (rel === '/filter-accomodation.html') { res.writeHead(301, { Location: '/filter-accommodation.html' + url.search }); return res.end(); }

  if (rel === '/') rel = '/index.html';
  if (BLOCKED.test(rel) || rel.split('/').some((s) => s === '..' || (s.startsWith('.') && s.length > 1))) {
    res.writeHead(404); return res.end('Not found');
  }

  const isUpload = rel.startsWith('/uploads/');
  const base = isUpload ? UPLOADS : ROOT;
  const file = path.join(base, isUpload ? rel.slice('/uploads/'.length) : rel);
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }

  const tryFiles = path.extname(file) ? [file] : [file, file + '.html', path.join(file, 'index.html')];
  (function next(i) {
    if (i >= tryFiles.length) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    fs.stat(tryFiles[i], (err, stat) => {
      if (err || !stat.isFile()) return next(i + 1);
      sendFile(req, res, tryFiles[i], stat, isUpload ? 'public, max-age=31536000, immutable' : 'no-cache');
    });
  })(0);
}

/* ------------------------------------------------------------------- server */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message || 'Server error' });
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (url.pathname === '/_status') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(statusPage()); }
  serveStatic(req, res, url);
});
server.requestTimeout = 0;   // big video uploads

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nACCOOM test server is running.\n');
  console.log('  On this laptop:   http://localhost:' + PORT);
  Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).forEach((i) => {
    console.log('  On your Wi-Fi:    http://' + i.address + ':' + PORT + '   (phones / other computers)');
  });
  console.log('\n  See what the server holds:  http://localhost:' + PORT + '/_status');
  console.log('  Data is saved in server/data/ - delete that folder to start fresh.');
  console.log('  Use ONE address per browser (localhost and the Wi-Fi address keep separate logins).\n');
});
