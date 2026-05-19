// Voting tracker server — Node.js
// REST API + Server-Sent Events for real-time multi-user sync
// Users with token-based login links; node hierarchy (factory/workshop/precinct).
// Storage: PostgreSQL (preferred, via DATABASE_URL) with automatic migration
// from the legacy data.json; falls back to JSON-on-disk when no DB is configured.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = process.env.PUBLIC_URL || '';
// Persistent data location for the JSON fallback — defaults to ./data so the
// directory can be mounted as a persistent volume separately from the application.
// Override with DATA_DIR (folder) or DATA_FILE (full path).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = process.env.DATA_FILE || path.join(DATA_DIR, 'data.json');
const TMP_FILE  = DATA_FILE + '.tmp';
const ADMIN_LINK_FILE = path.join(path.dirname(DATA_FILE), 'admin-link.txt');
const STARTED_AT = Date.now();

try { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); }
catch (e) { console.error('Cannot create data dir:', e.message); }

// ---------- PostgreSQL ----------
// If DATABASE_URL is set, state is persisted in PostgreSQL.
// Compatible env vars are also honored by node-postgres: PGHOST, PGPORT, PGUSER,
// PGPASSWORD, PGDATABASE.
let pgPool = null;
const HAS_DB = !!(process.env.DATABASE_URL || process.env.PGHOST || process.env.PGDATABASE);
if (HAS_DB) {
  const { Pool } = require('pg');
  pgPool = new Pool(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {}
  );
  pgPool.on('error', (err) => console.error('PG pool error:', err.message));
}

async function dbInitSchema() {
  if (!pgPool) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      token       TEXT NOT NULL UNIQUE,
      is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nodes (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL CHECK (type IN ('factory','workshop','precinct')),
      parent_id   TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      owner_id    TEXT NOT NULL REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS nodes_parent_idx ON nodes(parent_id);
    CREATE INDEX IF NOT EXISTS nodes_owner_idx  ON nodes(owner_id);
    CREATE TABLE IF NOT EXISTS voters (
      id          TEXT PRIMARY KEY,
      node_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      voted       BOOLEAN NOT NULL DEFAULT FALSE,
      ts          BIGINT,
      by_name     TEXT
    );
    CREATE INDEX IF NOT EXISTS voters_node_idx ON voters(node_id);
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

async function dbLoadAll() {
  if (!pgPool) return false;
  const users = await pgPool.query('SELECT id, name, token, is_admin, created_at FROM users ORDER BY created_at');
  const nodes = await pgPool.query('SELECT id, name, type, parent_id, owner_id FROM nodes');
  const voters = await pgPool.query('SELECT id, node_id, name, voted, ts, by_name FROM voters ORDER BY node_id, name');
  const meta  = await pgPool.query("SELECT value FROM meta WHERE key='updatedAt'");

  state.users = users.rows.map(r => ({
    id: r.id, name: r.name, token: r.token,
    isAdmin: !!r.is_admin, createdAt: Number(r.created_at)
  }));
  const nodeMap = new Map();
  state.nodes = nodes.rows.map(r => {
    const n = { id: r.id, name: r.name, type: r.type, parentId: r.parent_id, ownerId: r.owner_id };
    if (r.type === 'precinct') n.voters = [];
    nodeMap.set(r.id, n);
    return n;
  });
  for (const v of voters.rows) {
    const n = nodeMap.get(v.node_id);
    if (!n) continue;
    if (!n.voters) n.voters = [];
    n.voters.push({
      id: v.id, name: v.name,
      voted: !!v.voted,
      ts: v.ts == null ? null : Number(v.ts),
      by: v.by_name || null
    });
  }
  state.updatedAt = meta.rows[0] ? Number(meta.rows[0].value) : Date.now();
  return true;
}

function nodesTopoSorted(nodes) {
  // parents must be inserted before children
  const byId = new Map(nodes.map(n => [n.id, n]));
  const out = [];
  const visited = new Set();
  function visit(n) {
    if (visited.has(n.id)) return;
    visited.add(n.id);
    if (n.parentId && byId.has(n.parentId)) visit(byId.get(n.parentId));
    out.push(n);
  }
  nodes.forEach(visit);
  return out;
}

async function dbSyncAll() {
  if (!pgPool) return;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    // Order matters: voters depend on nodes, nodes depend on users.
    await client.query('DELETE FROM voters');
    await client.query('DELETE FROM nodes');
    await client.query('DELETE FROM users');

    for (const u of state.users) {
      await client.query(
        'INSERT INTO users (id,name,token,is_admin,created_at) VALUES ($1,$2,$3,$4,$5)',
        [u.id, u.name, u.token, !!u.isAdmin, Number(u.createdAt) || Date.now()]
      );
    }
    for (const n of nodesTopoSorted(state.nodes)) {
      await client.query(
        'INSERT INTO nodes (id,name,type,parent_id,owner_id) VALUES ($1,$2,$3,$4,$5)',
        [n.id, n.name, n.type, n.parentId || null, n.ownerId]
      );
      if (n.type === 'precinct') {
        for (const v of (n.voters || [])) {
          await client.query(
            'INSERT INTO voters (id,node_id,name,voted,ts,by_name) VALUES ($1,$2,$3,$4,$5,$6)',
            [v.id, n.id, v.name, !!v.voted, v.ts || null, v.by || null]
          );
        }
      }
    }
    await client.query(
      `INSERT INTO meta(key,value) VALUES('updatedAt',$1)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      [String(state.updatedAt)]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function dbIsEmpty() {
  if (!pgPool) return true;
  const r = await pgPool.query('SELECT COUNT(*)::int AS c FROM users');
  return r.rows[0].c === 0;
}

async function maybeMigrateFromJson() {
  if (!pgPool) return false;
  if (!fs.existsSync(DATA_FILE)) return false;
  if (!await dbIsEmpty()) return false;
  console.log('Migrating data from JSON to PostgreSQL...');
  loadState();
  if (state.users.length === 0 && state.nodes.length === 0) {
    state = { users: [], nodes: [], updatedAt: Date.now() };
    return false;
  }
  await dbSyncAll();
  const backup = DATA_FILE + '.migrated-' + Date.now();
  try { fs.renameSync(DATA_FILE, backup); console.log(`JSON archived → ${backup}`); }
  catch (e) { console.warn('Could not archive JSON:', e.message); }
  console.log(`Migrated ${state.users.length} users, ${state.nodes.length} nodes to PostgreSQL`);
  return true;
}

let state = {
  users: [],   // [{id, name, token, isAdmin, createdAt}]
  nodes: [],   // [{id, name, type, parentId, ownerId, voters?: [{id, name, voted, ts, by}]}]
  updatedAt: Date.now()
};

const TYPES = ['factory', 'workshop', 'precinct'];
const TYPE_LEVEL = { factory: 0, workshop: 1, precinct: 2 };

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      state.users = Array.isArray(data.users) ? data.users : [];
      if (Array.isArray(data.nodes)) {
        state.nodes = data.nodes;
      } else if (Array.isArray(data.precincts)) {
        state.nodes = data.precincts.map(p => ({
          id: p.id, name: p.name, type: 'precinct',
          parentId: null, ownerId: p.ownerId,
          voters: Array.isArray(p.voters) ? p.voters : []
        }));
      } else {
        state.nodes = [];
      }
      state.updatedAt = data.updatedAt || Date.now();
    }
  } catch (e) { console.error('Failed to load state:', e.message); }
}

let saveTimer = null;
let lastSaveError = null;
function saveState() {
  state.updatedAt = Date.now();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      if (pgPool) {
        await dbSyncAll();
      } else {
        fs.writeFileSync(TMP_FILE, JSON.stringify({
          users: state.users,
          nodes: state.nodes,
          updatedAt: state.updatedAt
        }, null, 2));
        fs.renameSync(TMP_FILE, DATA_FILE);
      }
      lastSaveError = null;
    } catch (e) {
      lastSaveError = e.message;
      console.error('Save failed:', e.message);
    }
  }, 120);
}

function uid()   { return crypto.randomBytes(6).toString('hex'); }
function token() { return crypto.randomBytes(18).toString('base64url'); }

async function bootstrap() {
  if (pgPool) {
    await dbInitSchema();
    await maybeMigrateFromJson();
    await dbLoadAll();
  } else {
    loadState();
  }

  let firstAdmin = state.users.find(u => u.isAdmin);
  if (state.nodes.some(n => !n.ownerId) && !firstAdmin) {
    firstAdmin = { id: uid(), name: 'Администратор', token: token(), isAdmin: true, createdAt: Date.now() };
    state.users.unshift(firstAdmin);
  }
  state.nodes.forEach(n => { if (!n.ownerId && firstAdmin) n.ownerId = firstAdmin.id; });

  let createdNewAdmin = false;
  if (state.users.length === 0) {
    const t = token();
    state.users.push({
      id: uid(), name: 'Администратор', token: t, isAdmin: true, createdAt: Date.now()
    });
    createdNewAdmin = true;
    const link = `${PUBLIC_URL || `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`}/?token=${t}`;
    try { fs.writeFileSync(ADMIN_LINK_FILE, link + '\n'); } catch (e) {}
    console.log('\n==================================================');
    console.log('  Создан администратор. Ссылка для входа:');
    console.log('  ' + link);
    console.log('  (также сохранена в admin-link.txt)');
    console.log('==================================================\n');
  }
  if (createdNewAdmin && pgPool) await dbSyncAll();
  else saveState();
}

// ---------- SSE clients ----------
const clients = new Set();
function broadcastChange() {
  const payload = `event: change\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`;
  for (const c of clients) { try { c.res.write(payload); } catch (e) {} }
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

function findNode(id) { return state.nodes.find(n => n.id === id); }
function findUser(id) { return state.users.find(u => u.id === id); }
function childrenOf(id) { return state.nodes.filter(n => n.parentId === id); }
function descendantsOf(id) {
  const out = [];
  const stack = childrenOf(id);
  while (stack.length) {
    const n = stack.pop();
    out.push(n);
    for (const c of childrenOf(n.id)) stack.push(c);
  }
  return out;
}
function ancestorsOf(node) {
  const out = [];
  let cur = node;
  while (cur && cur.parentId) {
    cur = findNode(cur.parentId);
    if (cur) out.push(cur);
  }
  return out;
}
function pathFor(node) {
  const out = [];
  let cur = node;
  while (cur) {
    out.unshift({ id: cur.id, name: cur.name, type: cur.type });
    cur = cur.parentId ? findNode(cur.parentId) : null;
  }
  return out;
}

function canEdit(user, node) {
  if (!user || !node) return false;
  if (user.isAdmin) return true;
  let cur = node;
  while (cur) {
    if (cur.ownerId === user.id) return true;
    cur = cur.parentId ? findNode(cur.parentId) : null;
  }
  return false;
}

function publicUser(u) { return { id: u.id, name: u.name, isAdmin: !!u.isAdmin }; }
function loginLink(req, t) {
  const base = PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
  return `${base}/?token=${t}`;
}

function validateHierarchy(type, parentId) {
  if (!TYPES.includes(type)) return 'неизвестный тип';
  if (type === 'factory') {
    if (parentId) return 'у завода не может быть родителя';
    return null;
  }
  if (!parentId) {
    if (type === 'workshop') return 'цех должен быть внутри завода';
    return null; // precinct at root allowed
  }
  const p = findNode(parentId);
  if (!p) return 'родитель не найден';
  if (TYPE_LEVEL[type] <= TYPE_LEVEL[p.type]) return `${labelOf(type)} нельзя вложить в ${labelOf(p.type)}`;
  if (type === 'workshop' && p.type !== 'factory') return 'цех создаётся только в заводе';
  if (type === 'precinct' && !(p.type === 'workshop' || p.type === 'factory')) {
    return 'участок создаётся в цехе, заводе или на верхнем уровне';
  }
  return null;
}
function labelOf(t) { return { factory:'завод', workshop:'цех', precinct:'участок' }[t] || t; }

function precinctStats(n) {
  const voters = Array.isArray(n.voters) ? n.voters : [];
  const total = voters.length;
  const voted = voters.filter(v => v.voted).length;
  return { total, voted, left: total - voted, pct: total ? (voted / total * 100) : 0 };
}
function nodeStats(n, allowedPrecinctIds = null) {
  if (n.type === 'precinct') {
    if (allowedPrecinctIds && !allowedPrecinctIds.has(n.id)) {
      return { total: 0, voted: 0, left: 0, pct: 0 };
    }
    return precinctStats(n);
  }
  let total = 0, voted = 0;
  for (const d of descendantsOf(n.id)) {
    if (d.type !== 'precinct') continue;
    if (allowedPrecinctIds && !allowedPrecinctIds.has(d.id)) continue;
    total += (d.voters || []).length;
    voted += (d.voters || []).filter(v => v.voted).length;
  }
  return { total, voted, left: total - voted, pct: total ? (voted / total * 100) : 0 };
}

function decorateNode(n, allowedPrecinctIds = null) {
  const owner = findUser(n.ownerId);
  const out = {
    id: n.id, name: n.name, type: n.type,
    parentId: n.parentId || null,
    ownerId: n.ownerId, ownerName: owner ? owner.name : null,
    stats: nodeStats(n, allowedPrecinctIds),
    childrenCount: n.type === 'precinct' ? 0 : childrenOf(n.id).length,
    path: pathFor(n)
  };
  if (n.type === 'precinct') out.voters = n.voters || [];
  return out;
}

function visibleNodes(user) {
  if (!user) return [];
  if (user.isAdmin) return state.nodes;
  const owned = state.nodes.filter(n => n.ownerId === user.id);
  const visible = new Set();
  for (const n of owned) {
    visible.add(n.id);
    for (const a of ancestorsOf(n)) visible.add(a.id);
    for (const d of descendantsOf(n.id)) visible.add(d.id);
  }
  return state.nodes.filter(n => visible.has(n.id));
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
async function healthPayload() {
  const storage = { kind: pgPool ? 'postgres' : 'json' };
  if (pgPool) {
    try {
      const r = await pgPool.query('SELECT 1 AS ok');
      storage.connected = r.rows[0].ok === 1;
      storage.poolTotal = pgPool.totalCount;
      storage.poolIdle = pgPool.idleCount;
      storage.poolWaiting = pgPool.waitingCount;
    } catch (e) {
      storage.connected = false;
      storage.error = e.message;
    }
  } else {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const st = fs.statSync(DATA_FILE);
        storage.path = DATA_FILE;
        storage.exists = true;
        storage.sizeBytes = st.size;
        storage.modified = st.mtime.toISOString();
      } else {
        storage.path = DATA_FILE;
        storage.exists = false;
      }
    } catch (e) { storage.error = e.message; }
  }
  const healthy = pgPool ? !!storage.connected : true;
  return {
    status: healthy && !lastSaveError ? 'ok' : 'degraded',
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    pid: process.pid,
    counts: { users: state.users.length, nodes: state.nodes.length, clients: clients.size },
    storage,
    lastSaveError
  };
}

function publicSummary() {
  const precincts = state.nodes.filter(n => n.type === 'precinct').map(p => {
    const s = precinctStats(p);
    return {
      id: p.id, name: p.name,
      path: pathFor(p),
      total: s.total, voted: s.voted, left: s.left, pct: s.pct
    };
  });
  let total = 0, voted = 0;
  precincts.forEach(p => { total += p.total; voted += p.voted; });
  const factories = state.nodes.filter(n => n.type === 'factory').map(f => {
    const s = nodeStats(f);
    return { id: f.id, name: f.name, total: s.total, voted: s.voted, left: s.left, pct: s.pct };
  });
  return {
    total, voted, left: total - voted,
    pct: total ? (voted/total*100) : 0,
    precincts, factories, updatedAt: state.updatedAt
  };
}

async function handleApi(req, res, parsed) {
  const p = parsed.pathname;
  const m = req.method;

  // ---------- Public endpoints (no auth) ----------
  if (m === 'GET' && (p === '/api/health' || p === '/health')) {
    return send(res, 200, await healthPayload());
  }
  if (m === 'GET' && p === '/api/summary') {
    return send(res, 200, publicSummary());
  }

  const user = getAuth(req, parsed);

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

  if (m === 'GET' && p === '/api/me') {
    if (!user) return send(res, 401, { error: 'unauthorized' });
    return send(res, 200, publicUser(user));
  }

  if (!user) return send(res, 401, { error: 'unauthorized' });

  if (m === 'GET' && p === '/api/state') {
    const visible = visibleNodes(user);
    const allowed = user.isAdmin
      ? null
      : new Set(visible.filter(n => n.type === 'precinct').map(n => n.id));
    return send(res, 200, {
      nodes: visible.map(n => decorateNode(n, allowed)),
      user: publicUser(user),
      updatedAt: state.updatedAt
    });
  }

  // ---------- Users ----------
  if (p === '/api/users/bulk' && m === 'POST') {
    if (!user.isAdmin) return send(res, 403, { error: 'forbidden' });
    const body = await readBody(req);
    const items = Array.isArray(body.users) ? body.users : [];
    const existingByName = new Map(state.users.map(u => [u.name.toLowerCase(), u]));
    const created = []; const skipped = [];
    for (const it of items) {
      const name = String(it && it.name || '').trim();
      if (!name) continue;
      if (existingByName.has(name.toLowerCase())) { skipped.push(name); continue; }
      const u = { id: uid(), name, token: token(), isAdmin: !!(it && it.isAdmin), createdAt: Date.now() };
      state.users.push(u);
      existingByName.set(name.toLowerCase(), u);
      created.push({ ...publicUser(u), token: u.token, link: loginLink(req, u.token), createdAt: u.createdAt });
    }
    if (created.length) { saveState(); broadcastChange(); }
    return send(res, 200, { created, skipped });
  }

  if (p === '/api/users') {
    if (!user.isAdmin) return send(res, 403, { error: 'forbidden' });
    if (m === 'GET') {
      return send(res, 200, state.users.map(u => ({
        ...publicUser(u),
        token: u.token,
        link: loginLink(req, u.token),
        createdAt: u.createdAt,
        ownedCount: state.nodes.filter(n => n.ownerId === u.id).length
      })));
    }
    if (m === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return send(res, 400, { error: 'name required' });
      const u = { id: uid(), name, token: token(), isAdmin: !!body.isAdmin, createdAt: Date.now() };
      state.users.push(u);
      saveState(); broadcastChange();
      return send(res, 200, { ...publicUser(u), token: u.token, link: loginLink(req, u.token), createdAt: u.createdAt });
    }
  }

  let mm = p.match(/^\/api\/users\/([^/]+)$/);
  if (mm) {
    if (!user.isAdmin) return send(res, 403, { error: 'forbidden' });
    const u = findUser(mm[1]);
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
      state.nodes.forEach(n => { if (n.ownerId === u.id) n.ownerId = user.id; });
      state.users = state.users.filter(x => x.id !== u.id);
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

  // ---------- Nodes ----------
  if (p === '/api/nodes' && m === 'POST') {
    const body = await readBody(req);
    const type = body.type;
    const name = String(body.name || '').trim();
    if (!name) return send(res, 400, { error: 'name required' });
    const parentId = body.parentId || null;
    const vErr = validateHierarchy(type, parentId);
    if (vErr) return send(res, 400, { error: vErr });

    if (parentId) {
      const p2 = findNode(parentId);
      if (!canEdit(user, p2)) return send(res, 403, { error: 'forbidden (parent)' });
    } else if (!user.isAdmin && (type === 'factory' || type === 'workshop')) {
      return send(res, 403, { error: `создавать ${labelOf(type)} на верхнем уровне может только администратор` });
    }

    const ownerId = (user.isAdmin && body.ownerId) ? String(body.ownerId) : user.id;
    if (!findUser(ownerId)) return send(res, 400, { error: 'unknown owner' });

    const node = { id: uid(), name, type, parentId, ownerId };
    if (type === 'precinct') {
      const voters = Array.isArray(body.voters) ? body.voters : [];
      node.voters = voters.map(s => String(s).trim()).filter(Boolean)
        .map(nm => ({ id: uid(), name: nm, voted: false, ts: null, by: null }));
    }
    state.nodes.push(node);
    saveState(); broadcastChange();
    return send(res, 200, decorateNode(node));
  }

  mm = p.match(/^\/api\/nodes\/([^/]+)$/);
  if (mm) {
    const id = mm[1];
    const node = findNode(id);
    if (!node) return send(res, 404, { error: 'node not found' });
    if (!canEdit(user, node)) return send(res, 403, { error: 'forbidden' });

    if (m === 'GET') return send(res, 200, decorateNode(node));

    if (m === 'PUT') {
      const body = await readBody(req);
      if (typeof body.name === 'string') {
        const nm = body.name.trim();
        if (!nm) return send(res, 400, { error: 'name required' });
        node.name = nm;
      }
      if (user.isAdmin && typeof body.ownerId === 'string') {
        if (!findUser(body.ownerId)) return send(res, 400, { error: 'unknown owner' });
        node.ownerId = body.ownerId;
      }
      if (user.isAdmin && body.parentId !== undefined) {
        const newParent = body.parentId || null;
        if (newParent === node.id) return send(res, 400, { error: 'нельзя сделать узел родителем самому себе' });
        if (newParent) {
          if (descendantsOf(node.id).some(d => d.id === newParent)) {
            return send(res, 400, { error: 'нельзя перенести в собственного потомка' });
          }
        }
        const vErr = validateHierarchy(node.type, newParent);
        if (vErr) return send(res, 400, { error: vErr });
        node.parentId = newParent;
      }
      if (node.type === 'precinct' && Array.isArray(body.voters)) {
        const existing = new Map((node.voters || []).map(v => [v.name, v]));
        node.voters = body.voters
          .map(n => String(n).trim()).filter(Boolean)
          .map(nm => existing.get(nm) || { id: uid(), name: nm, voted: false, ts: null, by: null });
      }
      saveState(); broadcastChange();
      return send(res, 200, decorateNode(node));
    }

    if (m === 'DELETE') {
      const subtreeIds = new Set([node.id, ...descendantsOf(node.id).map(n => n.id)]);
      state.nodes = state.nodes.filter(n => !subtreeIds.has(n.id));
      saveState(); broadcastChange();
      return send(res, 200, { ok: true, removed: subtreeIds.size });
    }
  }

  mm = p.match(/^\/api\/nodes\/([^/]+)\/voters\/([^/]+)\/vote$/);
  if (mm && m === 'POST') {
    const node = findNode(mm[1]);
    if (!node) return send(res, 404, { error: 'node not found' });
    if (node.type !== 'precinct') return send(res, 400, { error: 'голосование возможно только на участке' });
    if (!canEdit(user, node)) return send(res, 403, { error: 'forbidden' });
    const v = (node.voters || []).find(x => x.id === mm[2]);
    if (!v) return send(res, 404, { error: 'voter not found' });
    const body = await readBody(req).catch(() => ({}));
    v.voted = typeof body.voted === 'boolean' ? body.voted : !v.voted;
    v.ts = v.voted ? Date.now() : null;
    v.by = v.voted ? user.name : null;
    saveState(); broadcastChange();
    return send(res, 200, v);
  }

  mm = p.match(/^\/api\/nodes\/([^/]+)\/reset$/);
  if (mm && m === 'POST') {
    const node = findNode(mm[1]);
    if (!node) return send(res, 404, { error: 'node not found' });
    if (!canEdit(user, node)) return send(res, 403, { error: 'forbidden' });
    const targets = node.type === 'precinct'
      ? [node]
      : descendantsOf(node.id).filter(n => n.type === 'precinct');
    let count = 0;
    for (const t of targets) {
      (t.voters || []).forEach(v => { v.voted = false; v.ts = null; v.by = null; });
      count++;
    }
    saveState(); broadcastChange();
    return send(res, 200, { ok: true, precincts: count });
  }

  if (m === 'POST' && p === '/api/reset-all') {
    if (!user.isAdmin) return send(res, 403, { error: 'forbidden' });
    state.nodes = [];
    saveState(); broadcastChange();
    return send(res, 200, { ok: true });
  }

  // ---------- Backup / Restore ----------
  if (m === 'GET' && p === '/api/export/users') {
    if (!user.isAdmin) return send(res, 403, { error: 'forbidden' });
    return send(res, 200, {
      kind: 'voting-tracker-users', version: 1,
      exportedAt: Date.now(),
      users: state.users.map(u => ({
        id: u.id, name: u.name, token: u.token,
        isAdmin: !!u.isAdmin, createdAt: u.createdAt
      }))
    });
  }

  if (m === 'POST' && p === '/api/import/users') {
    if (!user.isAdmin) return send(res, 403, { error: 'forbidden' });
    const body = await readBody(req);
    const incoming = Array.isArray(body.users) ? body.users : [];
    const mode = body.mode === 'replace' ? 'replace' : 'merge';
    const norm = incoming.map(u => ({
      id: String(u.id || uid()),
      name: String(u.name || '').trim(),
      token: u.token ? String(u.token) : token(),
      isAdmin: !!u.isAdmin,
      createdAt: Number(u.createdAt) || Date.now()
    })).filter(u => u.name);
    let added = 0, kept = 0, replacedCount = 0;
    if (mode === 'replace') {
      const byId = new Map();
      for (const u of norm) byId.set(u.id, u);
      if (!byId.has(user.id)) byId.set(user.id, { ...user });
      else byId.set(user.id, { ...byId.get(user.id), token: user.token, isAdmin: true });
      const seenNames = new Set();
      const result = [];
      for (const u of byId.values()) {
        const key = u.name.toLowerCase();
        if (seenNames.has(key) && u.id !== user.id) continue;
        seenNames.add(key);
        result.push(u);
      }
      state.users = result;
      replacedCount = result.length;
    } else {
      const ids = new Set(state.users.map(u => u.id));
      const names = new Set(state.users.map(u => u.name.toLowerCase()));
      const tokens = new Set(state.users.map(u => u.token));
      for (const u of norm) {
        if (ids.has(u.id) || names.has(u.name.toLowerCase())) { kept++; continue; }
        while (tokens.has(u.token)) u.token = token();
        tokens.add(u.token);
        state.users.push(u);
        added++;
      }
    }
    saveState(); broadcastChange();
    return send(res, 200, { ok: true, mode, added, kept, replaced: replacedCount, total: state.users.length });
  }

  if (m === 'GET' && p === '/api/export/state') {
    if (!user.isAdmin) return send(res, 403, { error: 'forbidden' });
    return send(res, 200, {
      kind: 'voting-tracker-state', version: 2,
      exportedAt: Date.now(),
      nodes: state.nodes.map(n => ({
        id: n.id, name: n.name, type: n.type,
        parentId: n.parentId || null,
        ownerId: n.ownerId,
        ownerName: findUser(n.ownerId)?.name || null,
        path: pathFor(n).map(p => p.name),
        voters: n.type === 'precinct'
          ? (n.voters || []).map(v => ({
              id: v.id, name: v.name,
              voted: !!v.voted, ts: v.ts || null, by: v.by || null
            }))
          : undefined
      }))
    });
  }

  if (m === 'POST' && p === '/api/import/state') {
    if (!user.isAdmin) return send(res, 403, { error: 'forbidden' });
    const body = await readBody(req);
    let incoming = Array.isArray(body.nodes) ? body.nodes : null;
    if (!incoming && Array.isArray(body.precincts)) {
      // legacy v1: precincts list
      incoming = body.precincts.map(p => ({
        id: p.id, name: p.name, type: 'precinct',
        parentId: null, ownerId: p.ownerId, ownerName: p.ownerName,
        voters: p.voters
      }));
    }
    if (!incoming) return send(res, 400, { error: 'нет данных для импорта' });
    const mode = body.mode === 'replace' ? 'replace' : 'merge';

    const userIds = new Set(state.users.map(u => u.id));
    const usersByName = new Map(state.users.map(u => [u.name.toLowerCase(), u]));

    let ownerReassigned = 0;
    const oldToNewId = new Map();
    const norm = incoming.map(raw => {
      let ownerId = String(raw.ownerId || '');
      if (!userIds.has(ownerId)) {
        const byName = raw.ownerName && usersByName.get(String(raw.ownerName).toLowerCase());
        if (byName) ownerId = byName.id;
        else { ownerId = user.id; ownerReassigned++; }
      }
      const newId = String(raw.id || uid());
      if (raw.id) oldToNewId.set(raw.id, newId);
      const type = TYPES.includes(raw.type) ? raw.type : 'precinct';
      return {
        id: newId,
        name: String(raw.name || '').trim() || 'Без названия',
        type,
        _origParent: raw.parentId || null,
        ownerId,
        voters: type === 'precinct'
          ? (Array.isArray(raw.voters) ? raw.voters : []).map(v => ({
              id: String(v.id || uid()),
              name: String(v.name || '').trim(),
              voted: !!v.voted,
              ts: v.voted && v.ts ? Number(v.ts) : null,
              by:  v.voted && v.by ? String(v.by) : null
            })).filter(v => v.name)
          : undefined
      };
    }).filter(n => n.name);

    if (mode === 'replace') {
      // rewire parentId via oldToNewId where possible
      for (const n of norm) {
        n.parentId = n._origParent ? (oldToNewId.get(n._origParent) || null) : null;
        delete n._origParent;
      }
      state.nodes = norm;
    } else {
      const existingIds = new Set(state.nodes.map(n => n.id));
      for (const n of norm) {
        if (existingIds.has(n.id)) {
          const fresh = uid();
          oldToNewId.set(n.id, fresh);
          n.id = fresh;
        }
      }
      for (const n of norm) {
        if (n._origParent) {
          const mapped = oldToNewId.get(n._origParent);
          n.parentId = mapped || (findNode(n._origParent) ? n._origParent : null);
        } else {
          n.parentId = null;
        }
        delete n._origParent;
        state.nodes.push(n);
      }
    }
    saveState(); broadcastChange();
    return send(res, 200, {
      ok: true, mode,
      total: state.nodes.length,
      imported: norm.length,
      ownerReassigned
    });
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
  if (req.method === 'GET' && parsed.pathname === '/health') {
    return send(res, 200, await healthPayload());
  }
  if (parsed.pathname.startsWith('/api/')) {
    try { await handleApi(req, res, parsed); }
    catch (e) { console.error('API error:', e.message); send(res, 500, { error: e.message }); }
    return;
  }
  const entry = STATIC[parsed.pathname];
  if (entry) return serveStatic(res, entry);
  send(res, 404, 'Not found');
});

(async () => {
  try {
    await bootstrap();
  } catch (e) {
    console.error('Bootstrap failed:', e);
    process.exit(1);
  }
  server.listen(PORT, HOST, () => {
    console.log(`Voting tracker running on http://${HOST}:${PORT}`);
    console.log(`Storage:   ${pgPool ? 'PostgreSQL' : 'JSON file (' + DATA_FILE + ')'}`);
    console.log(`Health:    http://${HOST}:${PORT}/health`);
  });
})();

async function shutdown(sig) {
  console.log(`\n${sig} — shutting down`);
  try {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (pgPool) {
      await dbSyncAll().catch(e => console.error('Final sync failed:', e.message));
      await pgPool.end().catch(() => {});
    }
  } finally { process.exit(0); }
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
