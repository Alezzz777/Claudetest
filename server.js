// Voting tracker server — Node.js (no external deps)
// REST API + Server-Sent Events for real-time multi-user sync
// Users with token-based login links; precinct ownership; admin role.
// Storage: data.json (atomic writes, debounced)

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const DATA_FILE = path.join(__dirname, 'data.json');
const TMP_FILE  = DATA_FILE + '.tmp';
const ADMIN_LINK_FILE = path.join(__dirname, 'admin-link.txt');

let state = {
  users: [],       // [{id, name, token, isAdmin, createdAt}]
  precincts: [],   // [{id, name, ownerId, voters: [{id, name, voted, ts, by}]}]
  updatedAt: Date.now()
};

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      state.users     = Array.isArray(data.users)     ? data.users     : [];
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
    } catch (e) { console.error('Save failed:', e.message); }
  }, 150);
}

function uid()   { return crypto.randomBytes(6).toString('hex'); }
function token() { return crypto.randomBytes(18).toString('base64url'); }

function bootstrap() {
  // Ensure every precinct has ownerId — legacy data goes to first admin
  let firstAdmin = state.users.find(u => u.isAdmin);
  if (state.precincts.some(p => !p.ownerId) && !firstAdmin) {
    firstAdmin = { id: uid(), name: 'Администратор', token: token(), isAdmin: true, createdAt: Date.now() };
    state.users.unshift(firstAdmin);
  }
  state.precincts.forEach(p => { if (!p.ownerId && firstAdmin) p.ownerId = firstAdmin.id; });

  if (state.users.length === 0) {
    const t = token();
    state.users.push({
      id: uid(), name: 'Администратор', token: t, isAdmin: true, createdAt: Date.now()
    });
    const link = `${PUBLIC_URL || `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`}/?token=${t}`;
    try { fs.writeFileSync(ADMIN_LINK_FILE, link + '\n'); } catch (e) {}
    console.log('\n==================================================');
    console.log('  Создан администратор. Ссылка для входа:');
    console.log('  ' + link);
    console.log('  (также сохранена в admin-link.txt)');
    console.log('==================================================\n');
  }

  saveState();
}

// ---------- SSE clients ----------
const clients = new Set(); // {res, user}

function broadcastChange() {
  const payload = `event: change\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`;
  for (const c of clients) {
    try { c.res.write(payload); } catch (e) {}
  }
}

// ---------- Helpers ----------
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string';
  const data = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, Object.assign({
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  }, headers));
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 5 * 1024 * 1024) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function getAuth(req, parsed) {
  const h = req.headers['authorization'] || '';
  let t = null;
  if (h.startsWith('Bearer ')) t = h.slice(7).trim();
  if (!t && parsed.query && parsed.query.token) t = String(parsed.query.token);
  if (!t) return null;
  return state.users.find(u => u.token === t) || null;
}

function findPrecinct(id) { return state.precincts.find(p => p.id === id); }
function findUser(id) { return state.users.find(u => u.id === id); }

function canEditPrecinct(user, precinct) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return precinct.ownerId === user.id;
}

function publicUser(u) {
  return { id: u.id, name: u.name, isAdmin: !!u.isAdmin };
}

function loginLink(req, t) {
  const base = PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
  return `${base}/?token=${t}`;
}

function filteredPrecincts(user) {
  if (!user) return [];
  const own = user.isAdmin
    ? state.precincts
    : state.precincts.filter(p => p.ownerId === user.id);
  // attach owner name for UI
  return own.map(p => ({
    ...p,
    ownerName: state.users.find(u => u.id === p.ownerId)?.name || '—'
  }));
}

function summary(user) {
  // Admin sees full summary; regular user — only own precincts
  const list = user.isAdmin
    ? state.precincts
    : state.precincts.filter(p => p.ownerId === user.id);

  let total = 0, voted = 0;
  const precincts = list.map(p => {
    const t = p.voters.length;
    const v = p.voters.filter(x => x.voted).length;
    total += t; voted += v;
    return {
      id: p.id, name: p.name,
      ownerName: state.users.find(u => u.id === p.ownerId)?.name || '—',
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

// ---------- Static ----------
const STATIC = {
  '/':              { file: 'index.html',   type: 'text/html; charset=utf-8' },
  '/index.html':    { file: 'index.html',   type: 'text/html; charset=utf-8' },
  '/summary':       { file: 'summary.html', type: 'text/html; charset=utf-8' },
  '/summary.html':  { file: 'summary.html', type: 'text/html; charset=utf-8' },
  '/admin':         { file: 'admin.html',   type: 'text/html; charset=utf-8' },
  '/admin.html':    { file: 'admin.html',   type: 'text/html; charset=utf-8' },
  '/manifest.json': { file: 'manifest.json',type: 'application/manifest+json' }
};

function serveStatic(res, entry) {
  fs.readFile(path.join(__dirname, entry.file), (err, data) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// ---------- API ----------
async function handleApi(req, res, parsed) {
  const p = parsed.pathname;
  const m = req.method;
  const user = getAuth(req, parsed);

  // SSE (token via query)
  if (m === 'GET' && p === '/api/events') {
    if (!user) return send(res, 401, { error: 'unauthorized' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    res.write(`event: hello\ndata: ${JSON.stringify({ user: publicUser(user) })}\n\n`);
    const c = { res, user };
    clients.add(c);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(c); });
    return;
  }

  // Public: who am I
  if (m === 'GET' && p === '/api/me') {
    if (!user) return send(res, 401, { error: 'unauthorized' });
    return send(res, 200, publicUser(user));
  }

  // Everything below requires auth
  if (!user) return send(res, 401, { error: 'unauthorized' });

  // Filtered state for current user
  if (m === 'GET' && p === '/api/state') {
    return send(res, 200, {
      precincts: filteredPrecincts(user),
      user: publicUser(user),
      updatedAt: state.updatedAt
    });
  }

  if (m === 'GET' && p === '/api/summary') {
    return send(res, 200, summary(user));
  }

  // ---------- Users (admin only) ----------
  if (p === '/api/users') {
    if (!user.isAdmin) return send(res, 403, { error: 'forbidden' });
    if (m === 'GET') {
      return send(res, 200, state.users.map(u => ({
        ...publicUser(u),
        token: u.token,
        link: loginLink(req, u.token),
        createdAt: u.createdAt,
        precinctCount: state.precincts.filter(p => p.ownerId === u.id).length
      })));
    }
    if (m === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return send(res, 400, { error: 'name required' });
      const u = {
        id: uid(), name, token: token(),
        isAdmin: !!body.isAdmin, createdAt: Date.now()
      };
      state.users.push(u);
      saveState();
      broadcastChange();
      return send(res, 200, {
        ...publicUser(u), token: u.token, link: loginLink(req, u.token), createdAt: u.createdAt
      });
    }
  }

  let mm = p.match(/^\/api\/users\/([^/]+)$/);
  if (mm) {
    if (!user.isAdmin) return send(res, 403, { error: 'forbidden' });
    const id = mm[1];
    const u = findUser(id);
    if (!u) return send(res, 404, { error: 'user not found' });

    if (m === 'PUT') {
      const body = await readBody(req);
      if (typeof body.name === 'string') {
        const nm = body.name.trim();
        if (!nm) return send(res, 400, { error: 'name required' });
        u.name = nm;
      }
      if (typeof body.isAdmin === 'boolean') {
        if (!body.isAdmin && u.isAdmin && state.users.filter(x => x.isAdmin).length === 1) {
          return send(res, 400, { error: 'нельзя снять права у единственного администратора' });
        }
        u.isAdmin = body.isAdmin;
      }
      saveState(); broadcastChange();
      return send(res, 200, publicUser(u));
    }

    if (m === 'DELETE') {
      if (u.isAdmin && state.users.filter(x => x.isAdmin).length === 1) {
        return send(res, 400, { error: 'нельзя удалить единственного администратора' });
      }
      // Reassign their precincts to the admin who deletes them
      state.precincts.forEach(p => { if (p.ownerId === id) p.ownerId = user.id; });
      state.users = state.users.filter(x => x.id !== id);
      saveState(); broadcastChange();
      return send(res, 200, { ok: true });
    }
  }

  mm = p.match(/^\/api\/users\/([^/]+)\/regenerate-token$/);
  if (mm && m === 'POST') {
    if (!user.isAdmin) return send(res, 403, { error: 'forbidden' });
    const u = findUser(mm[1]);
    if (!u) return send(res, 404, { error: 'user not found' });
    u.token = token();
    saveState(); broadcastChange();
    return send(res, 200, { token: u.token, link: loginLink(req, u.token) });
  }

  // ---------- Precincts ----------
  if (p === '/api/precincts' && m === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return send(res, 400, { error: 'name required' });
    const ownerId = (user.isAdmin && body.ownerId) ? String(body.ownerId) : user.id;
    if (!findUser(ownerId)) return send(res, 400, { error: 'unknown owner' });
    const voters = Array.isArray(body.voters) ? body.voters : [];
    const precinct = {
      id: uid(),
      name,
      ownerId,
      voters: voters
        .map(n => String(n).trim()).filter(Boolean)
        .map(name => ({ id: uid(), name, voted: false, ts: null, by: null }))
    };
    state.precincts.push(precinct);
    saveState(); broadcastChange();
    return send(res, 200, precinct);
  }

  mm = p.match(/^\/api\/precincts\/([^/]+)$/);
  if (mm) {
    const id = mm[1];
    const pr = findPrecinct(id);
    if (!pr) return send(res, 404, { error: 'precinct not found' });
    if (!canEditPrecinct(user, pr)) return send(res, 403, { error: 'forbidden' });

    if (m === 'GET') return send(res, 200, pr);

    if (m === 'PUT') {
      const body = await readBody(req);
      if (typeof body.name === 'string') {
        const nm = body.name.trim();
        if (!nm) return send(res, 400, { error: 'name required' });
        pr.name = nm;
      }
      if (user.isAdmin && typeof body.ownerId === 'string') {
        if (!findUser(body.ownerId)) return send(res, 400, { error: 'unknown owner' });
        pr.ownerId = body.ownerId;
      }
      if (Array.isArray(body.voters)) {
        const existing = new Map(pr.voters.map(v => [v.name, v]));
        pr.voters = body.voters
          .map(n => String(n).trim()).filter(Boolean)
          .map(name => existing.get(name) || { id: uid(), name, voted: false, ts: null, by: null });
      }
      saveState(); broadcastChange();
      return send(res, 200, pr);
    }

    if (m === 'DELETE') {
      state.precincts = state.precincts.filter(x => x.id !== id);
      saveState(); broadcastChange();
      return send(res, 200, { ok: true });
    }
  }

  mm = p.match(/^\/api\/precincts\/([^/]+)\/voters\/([^/]+)\/vote$/);
  if (mm && m === 'POST') {
    const pr = findPrecinct(mm[1]);
    if (!pr) return send(res, 404, { error: 'precinct not found' });
    if (!canEditPrecinct(user, pr)) return send(res, 403, { error: 'forbidden' });
    const v = pr.voters.find(x => x.id === mm[2]);
    if (!v) return send(res, 404, { error: 'voter not found' });
    const body = await readBody(req).catch(() => ({}));
    v.voted = typeof body.voted === 'boolean' ? body.voted : !v.voted;
    v.ts = v.voted ? Date.now() : null;
    v.by = v.voted ? (user.name) : null;
    saveState(); broadcastChange();
    return send(res, 200, v);
  }

  mm = p.match(/^\/api\/precincts\/([^/]+)\/reset$/);
  if (mm && m === 'POST') {
    const pr = findPrecinct(mm[1]);
    if (!pr) return send(res, 404, { error: 'precinct not found' });
    if (!canEditPrecinct(user, pr)) return send(res, 403, { error: 'forbidden' });
    pr.voters.forEach(v => { v.voted = false; v.ts = null; v.by = null; });
    saveState(); broadcastChange();
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/reset-all') {
    if (!user.isAdmin) return send(res, 403, { error: 'forbidden' });
    state.precincts = [];
    saveState(); broadcastChange();
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'not found' });
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const parsed = url.parse(req.url, true);

  if (parsed.pathname.startsWith('/api/')) {
    try { await handleApi(req, res, parsed); }
    catch (e) { console.error('API error:', e.message); send(res, 500, { error: e.message }); }
    return;
  }

  const entry = STATIC[parsed.pathname];
  if (entry) return serveStatic(res, entry);

  send(res, 404, 'Not found');
});

loadState();
bootstrap();
server.listen(PORT, HOST, () => {
  console.log(`Voting tracker running on http://${HOST}:${PORT}`);
});
