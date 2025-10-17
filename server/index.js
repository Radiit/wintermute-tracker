// server/index.js
import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'node:dns';
import { PrismaClient } from '@prisma/client';

// DNS – help Node prefer IPv4 resolvers
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['1.1.1.1', '1.0.0.1', '8.8.8.8']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== ENV & CONFIG ======
const PORT = Number(process.env.PORT || 3000);
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 15000);

const ARKHAM_BASE_URL = process.env.ARKHAM_BASE_URL || 'https://api.arkm.com';
const ARKHAM_PATH = process.env.ARKHAM_PATH || '/balances/entity/wintermute?cheap=false';
const ENTITY = 'wintermute';

// Headers captured from your own DevTools session
const HEADERS_BASE = {
  cookie: process.env.ARKHAM_COOKIE,
  'user-agent': process.env.ARKHAM_UA,
  origin: process.env.ARKHAM_ORIGIN || 'https://intel.arkm.com',
  referer: process.env.ARKHAM_REFERER || 'https://intel.arkm.com/',
  accept: process.env.ARKHAM_ACCEPT || 'application/json, text/plain, */*',
};
if (process.env.ARKHAM_ACCEPT_LANGUAGE) HEADERS_BASE['accept-language'] = process.env.ARKHAM_ACCEPT_LANGUAGE;
if (process.env.ARKHAM_SEC_GPC)         HEADERS_BASE['sec-gpc']         = process.env.ARKHAM_SEC_GPC;
if (process.env.ARKHAM_SEC_FETCH_MODE)  HEADERS_BASE['sec-fetch-mode']  = process.env.ARKHAM_SEC_FETCH_MODE;
if (process.env.ARKHAM_SEC_FETCH_SITE)  HEADERS_BASE['sec-fetch-site']  = process.env.ARKHAM_SEC_FETCH_SITE;
if (process.env.ARKHAM_SEC_FETCH_DEST)  HEADERS_BASE['sec-fetch-dest']  = process.env.ARKHAM_SEC_FETCH_DEST;
// IMPORTANT: x-payload/x-timestamp must stay paired from the same real request
if (process.env.ARKHAM_X_PAYLOAD)   HEADERS_BASE['x-payload']   = process.env.ARKHAM_X_PAYLOAD;
if (process.env.ARKHAM_X_TIMESTAMP) HEADERS_BASE['x-timestamp'] = process.env.ARKHAM_X_TIMESTAMP;

// ====== APP ======
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, '../public')));

// ====== PRISMA ======
let prisma = null;
let dbReady = false;

async function initPrisma() {
  try {
    prisma = new PrismaClient(); // DATABASE_URL should point to Pooler (6543)
    await prisma.$connect();
    dbReady = true;
    console.log('Prisma connected (Pooler).');
  } catch (e) {
    dbReady = false;
    console.error('Prisma connect failed:', e.message);
  }
}

async function loadPrevSnapshotFromDb(entity) {
  if (!dbReady) return null;
  const snap = await prisma.snapshot.findFirst({
    where: { entity },
    orderBy: { ts: 'desc' },
    include: { holdings: true },
  });
  if (!snap) return null;
  const obj = {};
  for (const h of snap.holdings) obj[h.symbol] = Number(h.amount);
  return obj;
}

async function saveSnapshotToDb(ts, entity, snapshot) {
  if (!dbReady) return;
  const symbols = Object.keys(snapshot);
  await prisma.snapshot.create({
    data: {
      entity,
      ts: new Date(ts),
      holdings: symbols.length
        ? {
            createMany: {
              data: symbols.map((sym) => ({
                symbol: sym,
                amount: Number(snapshot[sym]) || 0,
              })),
              skipDuplicates: false,
            },
          }
        : undefined,
    },
  });
}

// ====== STATE ======
let prevSnapshot = null;
let lastPayload = null;

// ====== AXIOS ======
const api = axios.create({ baseURL: ARKHAM_BASE_URL, timeout: 20_000 });
api.interceptors.request.use((config) => {
  // clone base headers each request (don't mutate HEADERS_BASE)
  config.headers = { ...HEADERS_BASE };
  // If you did NOT set ARKHAM_X_TIMESTAMP in env, send a fresh x-timestamp.
  if (!('x-timestamp' in config.headers)) {
    config.headers['x-timestamp'] = Math.floor(Date.now() / 1000).toString();
  }
  const { cookie, ...safe } = config.headers || {};
  console.log('Request headers (safe):', safe, 'path:', config.url);
  return config;
});

// ====== DATA LOGIC ======
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

async function fetchArkham() {
  const resp = await api.get(ARKHAM_PATH, { validateStatus: () => true });
  if (resp.status !== 200) {
    const preview = typeof resp.data === 'string'
      ? resp.data.slice(0, 400)
      : JSON.stringify(resp.data || {}, null, 2).slice(0, 400);
    console.error('Arkham non-200:', resp.status, preview);
    throw new Error('arkham_' + resp.status);
  }

  // Validate content-type & shape
  const ctype = String(resp.headers?.['content-type'] || '');
  if (!ctype.includes('application/json')) {
    console.error('Arkham returned non-JSON content-type:', ctype);
    throw new Error('arkham_non_json');
  }
  if (!isPlainObject(resp.data) && !Array.isArray(resp.data)) {
    console.error('Arkham returned unexpected body type:', typeof resp.data);
    throw new Error('arkham_bad_body');
  }
  return resp.data;
}

// Robust symbol & amount extractors (handles nested token/asset forms)
function toNumber(x) {
  if (x === null || x === undefined) return NaN;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    // strip commas/underscores if any
    const cleaned = x.replace(/[, _]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function normalizeBalances(raw) {
  // Arkham often: { entities, totalBalance, balances: <object-with-arrays-and-nested-objects> }
  const root = isPlainObject(raw?.balances) || Array.isArray(raw?.balances) ? raw.balances : raw;

  const currMap = {};
  const agoMap = {};

  const pickSymbol = (o) =>
    o.symbol || o.ticker || o.tokenSymbol || o.asset || o.coin || o.name ||
    o?.token?.symbol || o?.asset?.symbol || o?.coin?.symbol;

  const pickCurr = (o) =>
    o.amount ?? o.balance ?? o.balanceFloat ?? o.holding ?? o.qty ?? o.value ?? o.total ??
    o.quantity ?? o?.tokenAmount?.amount ?? o?.balanceAmount;

  const pickAgo = (o) =>
    o.balance24hAgo ?? o.amount24hAgo ?? o.value24hAgo ?? o.prev ?? o.previous ??
    o?.tokenAmount24hAgo;

  let visited = 0;

  function visit(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const it of node) visit(it);
      return;
    }
    if (isPlainObject(node)) {
      visited++;

      // Try to read a leaf-like record
      const symRaw = pickSymbol(node);
      const curRaw = pickCurr(node);
      const agoRaw = pickAgo(node);

      if (symRaw !== undefined) {
        const sym = String(symRaw).toUpperCase().trim();
        const curNum = toNumber(curRaw);
        const agoNum = toNumber(agoRaw);
        if (Number.isFinite(curNum)) currMap[sym] = (currMap[sym] || 0) + curNum;
        if (Number.isFinite(agoNum))  agoMap[sym]  = (agoMap[sym]  || 0) + agoNum;
      }

      // Recurse into all values to catch nested arrays/objects like { balances: [...] }
      for (const v of Object.values(node)) {
        if (Array.isArray(v) || isPlainObject(v)) visit(v);
      }
    }
  }

  visit(root);

  // If totally empty, surface a hint to logs
  if (Object.keys(currMap).length === 0) {
    const topKeys = isPlainObject(raw) ? Object.keys(raw).slice(0, 10) : [];
    console.warn('normalizeBalances: empty result. top-level keys =', topKeys, 'visited nodes =', visited);
  }

  return { curr: currMap, baseline24h: Object.keys(agoMap).length ? agoMap : null };
}

function computeDiff(curr, prev) {
  const symbols = new Set([...Object.keys(curr), ...(prev ? Object.keys(prev) : [])]);
  const rows = [];
  for (const sym of symbols) {
    const oldV = prev?.[sym] ?? 0;
    const newV = curr?.[sym] ?? 0;
    const delta = newV - oldV;
    const pct = oldV === 0 ? (newV === 0 ? 0 : null) : (delta / oldV) * 100;
    rows.push({ symbol: sym, old: oldV, new: newV, delta, pctChange: pct });
  }
  rows.sort((a, b) => {
    if (a.pctChange === null && b.pctChange === null) return 0;
    if (a.pctChange === null) return 1;
    if (b.pctChange === null) return -1;
    return Math.abs(b.pctChange) - Math.abs(a.pctChange);
  });
  return rows;
}

// ====== TICK ======
async function tick() {
  const ts = new Date().toISOString();
  try {
    const raw = await fetchArkham();
    const { curr, baseline24h } = normalizeBalances(raw);

    const currCount = Object.keys(curr).length;
    if (currCount === 0) {
      // Don’t clobber the UI with an empty broadcast; likely headers/shape issue for this tick
      console.warn(`[${ts}] Empty snapshot parsed (0 assets) — skipping broadcast (keeping previous payload).`);
      return;
    }

    const hasPrev = prevSnapshot && Object.keys(prevSnapshot).length > 0;
    const prevForDiff = hasPrev ? prevSnapshot : (baseline24h || null);

    const diff = computeDiff(curr, prevForDiff);
    const top100 = diff.slice(0, 100);

    lastPayload = {
      timestamp: ts,
      intervalMs: INTERVAL_MS,
      entity: ENTITY,
      totalAssets: currCount,
      top100,
      snapshot: curr,
      baseline: hasPrev ? 'previous-scrape' : (baseline24h ? '24h-ago' : 'none'),
    };

    io.emit('update', lastPayload);
    prevSnapshot = curr;

    try { await saveSnapshotToDb(ts, ENTITY, curr); }
    catch (e) { console.warn('DB save failed:', e.message); }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${ts}] broadcast ${top100.length} rows (assets=${currCount}, baseline=${lastPayload.baseline})`);
    }
  } catch (err) {
    console.error(`[${ts}] Tick error`, err?.message);
  }
}

// ====== ROUTES ======
app.get('/api/latest', (_req, res) => {
  if (!lastPayload) return res.status(204).set('Cache-Control', 'no-store').send();
  res.set('Cache-Control', 'no-store');
  res.json(lastPayload);
});
app.get('/health', (_req, res) => res.json({ ok: true }));

// ====== START ======
server.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  await initPrisma();
  try {
    const loaded = await loadPrevSnapshotFromDb(ENTITY);
    if (loaded && Object.keys(loaded).length) {
      prevSnapshot = loaded;
      console.log(`Loaded previous snapshot from DB: ${Object.keys(prevSnapshot).length} assets`);
    }
  } catch (e) {
    console.warn('Load previous snapshot failed:', e.message);
  }
  await tick();
  setInterval(tick, INTERVAL_MS);
});
