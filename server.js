// Voting tracker server — Node.js (no external deps)
// REST API + Server-Sent Events for real-time multi-user sync
// Storage: data.json (atomic writes, debounced)

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = path.join(__dirname, 'data.json');
const TMP_FILE  = DATA_FILE + '.tmp';

// ---------- Data ----------
let state = {
  precincts: [],   // [{id, name, voters: [{id, name, voted, ts, by}]}]
  updatedAt: Date.now()
};

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      state.precincts = Array.isArray(data.precincts) ? data.precincts : [];
      state.updatedAt = data.updatedAt || Date.now();
    }
  } catch (e) {
    console.error('Failed to load state:', e.message);
  }
}

let saveTimer = null;
function saveState() {
  state.updatedAt = Date.now();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(TMP_FILE, JSON.stringify(state, null, 2));
      fs.renameSync(TMP_FILE, DATA_FILE);
    } catch (e) {
      console.error('Save failed:', e.message);
    }
  }, 150);
}

function uid() {
  return crypto.randomBytes(6).toString('hex');
}

// ---------- SSE clients ----------
const clients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch (e) { /* drop */ }
  }
}

// ---------- Helpers ----------
function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({
    'Content-Type': typeof body === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }, headers));
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 5 * 1024 * 1024) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function findPrecinct(id) {
  return state.precincts.find(p => p.id === id);
}

function summary() {
  let total = 0, voted = 0;
  const precincts = state.precincts.map(p => {
    const t = p.voters.length;
    const v = p.voters.filter(x => x.voted).length;
    total += t; voted += v;
    return {
      id: p.id, name: p.name,
      total: t, voted: v, left: t - v,
      pct: t ? (v / t * 100) : 0
    };
  });
  return {
    total, voted, left: total - voted,
    pct: total ? (voted / total * 100) : 0,
    precincts,
    updatedAt: state.updatedAt
  };
}

// ---------- Static files ----------
const STATIC = {
  '/':            { file: 'index.html',  type: 'text/html; charset=utf-8' },
  '/index.html':  { file: 'index.html',  type: 'text/html; charset=utf-8' },
  '/summary':     { file: 'summary.html', type: 'text/html; charset=utf-8' },
  '/summary.html':{ file: 'summary.html', type: 'text/html; charset=utf-8' },
  '/manifest.json':{ file: 'manifest.json', type: 'application/manifest+json' }
};

function serveStatic(res, entry) {
  const full = path.join(__dirname, entry.file);
  fs.readFile(full, (err, data) => {
    if (err) { send(res, 404, 'Not found'); return; }
    res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// ---------- API ----------
async function handleApi(req, res, parsed) {
  const p = parsed.pathname;
  const m = req.method;

  // SSE
  if (m === 'GET' && p === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (e) {}
    }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  // Get full state
  if (m === 'GET' && p === '/api/state') {
    return send(res, 200, state);
  }

  // Get summary
  if (m === 'GET' && p === '/api/summary') {
    return send(res, 200, summary());
  }

  // Create precinct
  if (m === 'POST' && p === '/api/precincts') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return send(res, 400, { error: 'name required' });
    const voters = Array.isArray(body.voters) ? body.voters : [];
    const precinct = {
      id: uid(),
      name,
      voters: voters.filter(Boolean).map(n => ({
        id: uid(), name: String(n).trim(), voted: false, ts: null, by: null
      })).filter(v => v.name)
    };
    state.precincts.push(precinct);
    saveState();
    broadcast('precinct-added', precinct);
    broadcast('state', state);
    return send(res, 200, precinct);
  }

  // Precinct operations
  let mm = p.match(/^\/api\/precincts\/([^/]+)$/);
  if (mm) {
    const id = mm[1];
    const pr = findPrecinct(id);
    if (!pr) return send(res, 404, { error: 'precinct not found' });

    if (m === 'GET') return send(res, 200, pr);

    if (m === 'PUT') {
      const body = await readBody(req);
      if (typeof body.name === 'string') {
        const nm = body.name.trim();
        if (!nm) return send(res, 400, { error: 'name required' });
        pr.name = nm;
      }
      if (Array.isArray(body.voters)) {
        // preserve voted state by name
        const existing = new Map(pr.voters.map(v => [v.name, v]));
        pr.voters = body.voters
          .map(n => String(n).trim())
          .filter(Boolean)
          .map(name => existing.get(name) || { id: uid(), name, voted: false, ts: null, by: null });
      }
      saveState();
      broadcast('precinct-updated', pr);
      broadcast('state', state);
      return send(res, 200, pr);
    }

    if (m === 'DELETE') {
      state.precincts = state.precincts.filter(x => x.id !== id);
      saveState();
      broadcast('precinct-deleted', { id });
      broadcast('state', state);
      return send(res, 200, { ok: true });
    }
  }

  // Toggle vote
  mm = p.match(/^\/api\/precincts\/([^/]+)\/voters\/([^/]+)\/vote$/);
  if (mm && m === 'POST') {
    const [, pid, vid] = mm;
    const pr = findPrecinct(pid);
    if (!pr) return send(res, 404, { error: 'precinct not found' });
    const v = pr.voters.find(x => x.id === vid);
    if (!v) return send(res, 404, { error: 'voter not found' });
    const body = await readBody(req).catch(() => ({}));
    const by = (body.by || '').toString().slice(0, 40) || null;
    if (typeof body.voted === 'boolean') v.voted = body.voted;
    else v.voted = !v.voted;
    v.ts = v.voted ? Date.now() : null;
    v.by = v.voted ? by : null;
    saveState();
    broadcast('vote', { precinctId: pid, voter: v });
    return send(res, 200, v);
  }

  // Reset votes for a precinct
  mm = p.match(/^\/api\/precincts\/([^/]+)\/reset$/);
  if (mm && m === 'POST') {
    const pr = findPrecinct(mm[1]);
    if (!pr) return send(res, 404, { error: 'precinct not found' });
    pr.voters.forEach(v => { v.voted = false; v.ts = null; v.by = null; });
    saveState();
    broadcast('precinct-updated', pr);
    broadcast('state', state);
    return send(res, 200, { ok: true });
  }

  // Wipe everything
  if (m === 'POST' && p === '/api/reset-all') {
    state.precincts = [];
    saveState();
    broadcast('state', state);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'not found' });
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  // CORS (handy for local dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const parsed = url.parse(req.url, true);

  if (parsed.pathname.startsWith('/api/')) {
    try { await handleApi(req, res, parsed); }
    catch (e) {
      console.error('API error:', e.message);
      send(res, 500, { error: e.message });
    }
    return;
  }

  const entry = STATIC[parsed.pathname];
  if (entry) return serveStatic(res, entry);

  send(res, 404, 'Not found');
});

loadState();
server.listen(PORT, HOST, () => {
  console.log(`Voting tracker running on http://${HOST}:${PORT}`);
});
