import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'node:dns';
import { PrismaClient } from '@prisma/client';

dns.setDefaultResultOrder('ipv4first');
try { dns.setServers(['1.1.1.1','1.0.0.1','8.8.8.8']); } catch {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ===== CONFIG ===== */
const PORT = Number(process.env.PORT || 3000);
const ENTITY = (process.env.ENTITY || 'wintermute').toLowerCase();
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 5 * 60 * 1000);
const TRANSFER_INTERVAL_MS = Number(process.env.TRANSFER_INTERVAL_MS || 30 * 1000);
const FORCE_LOOKBACK_MIN = Number(process.env.FORCE_LOOKBACK_MIN || 0);
const OLDER_BASELINE_MINUTES = Number(process.env.OLDER_BASELINE_MINUTES || 0);
const ARKHAM_BASE_URL = process.env.ARKHAM_BASE_URL || 'https://api.arkm.com';
const ARKHAM_PATH = process.env.ARKHAM_PATH || `/balances/entity/${ENTITY}?cheap=false`;
const SIG_SHARED_SECRET = process.env.SIG_SHARED_SECRET || process.env.SIG_SECRET || process.env.SIG || '';

/* ===== APP ===== */
const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, '../public')));

/* ===== DB (Prisma) ===== */
let prisma = null;
let dbReady = false;
async function initPrisma() {
  try {
    prisma = new PrismaClient();
    await prisma.$connect();
    dbReady = true;
    console.log('[DB] Connected');
  } catch (e) {
    dbReady = false;
    console.error('[DB] Failed to connect:', e.message);
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
  const map = {};
  for (const h of snap.holdings) map[h.symbol] = Number(h.amount || 0);
  return map;
}

async function loadBaselineByLookback(entity, nowMs) {
  if (!dbReady) return null;
  async function findAtOrBefore(minAgo) {
    const target = new Date(nowMs - minAgo * 60_000);
    const s = await prisma.snapshot.findFirst({
      where: { entity, ts: { lte: target } },
      orderBy: { ts: 'desc' },
      include: { holdings: true },
    });
    if (!s) return null;
    const map = {};
    for (const h of s.holdings) map[h.symbol] = Number(h.amount || 0);
    return map;
  }
  if (FORCE_LOOKBACK_MIN > 0) {
    const m = await findAtOrBefore(FORCE_LOOKBACK_MIN);
    if (m) return m;
  }
  if (OLDER_BASELINE_MINUTES > 0) {
    const m = await findAtOrBefore(OLDER_BASELINE_MINUTES);
    if (m) return m;
  }
  return null;
}

async function saveSnapshotToDb(tsIso, entity, snapshotMap) {
  if (!dbReady) return;
  const symbols = Object.keys(snapshotMap);
  await prisma.snapshot.create({
    data: {
      entity,
      ts: new Date(tsIso),
      holdings: symbols.length
        ? {
            createMany: {
              data: symbols.map((sym) => ({ symbol: sym, amount: Number(snapshotMap[sym] || 0) })),
              skipDuplicates: false,
            },
          }
        : undefined,
    },
  });
}

/* ===== Arkham headers ===== */
let arkhamHeaders = {
  cookie: process.env.ARKHAM_COOKIE || '',
  'x-payload': process.env.ARKHAM_X_PAYLOAD || process.env.ARKHAM_XPAYLOAD || '',
  'x-timestamp': process.env.ARKHAM_X_TIMESTAMP || process.env.ARKHAM_XTIMESTAMP || '',
  'user-agent': process.env.ARKHAM_UA || 'Mozilla/5.0',
  origin: process.env.ARKHAM_ORIGIN || 'https://intel.arkm.com',
  referer: process.env.ARKHAM_REFERER || 'https://intel.arkm.com/',
  accept: process.env.ARKHAM_ACCEPT || 'application/json, text/plain, */*',
};
if (process.env.ARKHAM_ACCEPT_LANGUAGE) arkhamHeaders['accept-language'] = process.env.ARKHAM_ACCEPT_LANGUAGE;
if (process.env.ARKHAM_SEC_GPC)         arkhamHeaders['sec-gpc']         = process.env.ARKHAM_SEC_GPC;
if (process.env.ARKHAM_SEC_FETCH_MODE)  arkhamHeaders['sec-fetch-mode']  = process.env.ARKHAM_SEC_FETCH_MODE;
if (process.env.ARKHAM_SEC_FETCH_SITE)  arkhamHeaders['sec-fetch-site']  = process.env.ARKHAM_SEC_FETCH_SITE;
if (process.env.ARKHAM_SEC_FETCH_DEST)  arkhamHeaders['sec-fetch-dest']  = process.env.ARKHAM_SEC_FETCH_DEST;

let lastHeaderUpdateMs = Date.now();
const hasCompleteArkhamHeaders = (h = arkhamHeaders) => Boolean(h.cookie && h['x-payload'] && h['x-timestamp']);

/* ===== Axios ===== */
const api = axios.create({ baseURL: ARKHAM_BASE_URL, timeout: 20_000 });
api.interceptors.request.use((config) => {
  const h = { ...arkhamHeaders };
  if (!h['x-timestamp']) h['x-timestamp'] = Math.floor(Date.now() / 1000).toString();
  config.headers = h;
  return config;
});

/* ===== Helpers ===== */
const num = (v) => {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace?.(/[,_ ]/g, '') ?? v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
};
const toMs = (ts) => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts > 1e12 ? ts : ts * 1000;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? 0 : t;
};

/* ===== Fetchers ===== */
async function fetchArkhamBalances() {
  const resp = await api.get(ARKHAM_PATH, { validateStatus: () => true });
  if (resp.status !== 200) {
    const preview = typeof resp.data === 'string' ? resp.data.slice(0,200) : JSON.stringify(resp.data)?.slice(0,200);
    throw new Error(`[Arkham balances] HTTP ${resp.status} — ${preview}`);
  }
  return resp.data;
}
async function fetchTransfersPage(limit = 200, offset = 0) {
  const url = `/transfers?base=${ENTITY}&flow=all&usdGte=1&sortKey=time&sortDir=desc&limit=${limit}&offset=${offset}`;
  const resp = await api.get(url, { validateStatus: () => true });
  if (resp.status !== 200) throw new Error(`[Arkham transfers] HTTP ${resp.status}`);
  return resp.data;
}

/* ===== Normalizers ===== */
function normalizeBalances(raw) {
  const root = (raw && (Array.isArray(raw.balances) || typeof raw.balances === 'object')) ? raw.balances : raw;
  const currMap = {};
  const agoMap  = {};

  const pickSymbol = (o) =>
    o?.token?.symbol || o?.asset?.symbol || o?.coin?.symbol ||
    o?.tokenSymbol || o?.asset || o?.coin ||
    o?.symbol || o?.ticker || o?.name;

  const pickAmount = (o) =>
    o.amount ?? o.balance ?? o.balanceFloat ?? o.holding ?? o.qty ?? o.quantity ?? o?.tokenAmount?.amount ?? o?.balanceAmount;

  const pickAgoAmt = (o) =>
    o.balance24hAgo ?? o.amount24hAgo ?? o.value24hAgo ?? o.prev ?? o.previous ?? o?.tokenAmount24hAgo;

  function visit(node) {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node === 'object') {
      const symRaw = pickSymbol(node);
      if (symRaw) {
        const sym = String(symRaw).toUpperCase().trim();
        if (sym && !/^[0-9]+$/.test(sym)) {
          const a = num(pickAmount(node));
          if (!currMap[sym]) currMap[sym] = { amount: 0 };
          if (Number.isFinite(a)) currMap[sym].amount += a;

          const ago = num(pickAgoAmt(node));
          if (Number.isFinite(ago)) { if (!agoMap[sym]) agoMap[sym] = { amount: 0 }; agoMap[sym].amount += ago; }
        }
      }
      for (const v of Object.values(node)) if (Array.isArray(v) || typeof v === 'object') visit(v);
    }
  }
  visit(root);
  return { curr: currMap, baseline24h: Object.keys(agoMap).length ? agoMap : null };
}

function computeDiff(currAmounts, prevAmounts) {
  const symbols = new Set([
    ...Object.keys(currAmounts || {}),
    ...(prevAmounts ? Object.keys(prevAmounts) : [])
  ]);
  const rows = [];
  for (const sym of symbols) {
    const oldV = Number(prevAmounts?.[sym] ?? 0);
    const newV = Number(currAmounts?.[sym] ?? 0);
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

function normalizeTransfers(raw) {
  const arr = Array.isArray(raw) ? raw : (raw.items || raw.transfers || raw.result || []);
  return arr.map((it) => {
    const sym   = (it.asset?.symbol || it.token?.symbol || it.symbol || it.ticker || 'UNKNOWN').toUpperCase();
    const usd   = num(it.usd ?? it.valueUSD ?? it.usdValue ?? it.fiatValue ?? 0);
    const toLbl = (it.to?.entity || it.to?.label || it.to?.name || '').toLowerCase();
    const frLbl = (it.from?.entity || it.from?.label || it.from?.name || '').toLowerCase();
    const dir   = toLbl.includes(ENTITY) ? 1 : (frLbl.includes(ENTITY) ? -1 : 0);
    const ts    = toMs(it.time || it.timestamp || it.blockTime || it.ts);
    return { sym, usd, dir, ts };
  }).filter(t => Number.isFinite(t.usd) && t.usd && t.dir);
}

/* ===== STATE ===== */
let prevSnapshot = null;
let lastPayload = null;
let lastSnapshotTs = 0;
let lastSnapshotIso = null;
let nextBalancesAtMs = 0;   // NEW: kapan tickBalances berikutnya

/* ===== TICKERS ===== */
async function tickBalances() {
  const ts = Date.now();
  const iso = new Date(ts).toISOString();
  try {
    const raw = await fetchArkhamBalances();
    const n = normalizeBalances(raw);

    const currAmounts = Object.fromEntries(
      Object.entries(n.curr).map(([k, v]) => [k, Number(v.amount || 0)])
    );

    let baseline = await loadBaselineByLookback(ENTITY, ts);
    if (!baseline) baseline = prevSnapshot || (await loadPrevSnapshotFromDb(ENTITY));

    const rows = computeDiff(currAmounts, baseline);

    nextBalancesAtMs = ts + INTERVAL_MS;

    lastPayload = {
      entity: ENTITY,
      ts: iso,
      rows,
      countdownSec: Math.max(0, Math.floor((nextBalancesAtMs - Date.now()) / 1000)),
      intervalMs: INTERVAL_MS,
    };

    io.emit('update', lastPayload);

    await saveSnapshotToDb(iso, ENTITY, currAmounts);
    prevSnapshot = currAmounts;
    lastSnapshotTs = ts;
    lastSnapshotIso = iso;

    console.log(`[tickBalances] ${iso} — rows=${rows.length} baseline=${baseline ? 'ok' : 'none'}`);
  } catch (e) {
    console.warn('[tickBalances] error:', e.message);
  }
}

async function computeTransferTopSince(tsSinceMs) {
  let offset = 0;
  const batch = [];
  while (true) {
    const raw = await fetchTransfersPage(200, offset);
    const items = normalizeTransfers(raw);
    if (!items.length) break;
    batch.push(...items);
    const oldest = items[items.length - 1].ts || 0;
    if (oldest < tsSinceMs) break;
    if (items.length < 200) break;
    offset += 200;
    if (offset > 2000) break;
  }
  const agg = new Map();
  for (const t of batch) {
    if (t.ts <= tsSinceMs) continue;
    const cur = agg.get(t.sym) || { symbol: t.sym, usdDelta: 0, samples: 0 };
    cur.usdDelta += t.dir * t.usd;
    cur.samples  += 1;
    agg.set(t.sym, cur);
  }
  return [...agg.values()].sort((a,b)=>Math.abs(b.usdDelta)-Math.abs(a.usdDelta)).slice(0,100);
}

async function tickTransfers() {
  try {
    if (!hasCompleteArkhamHeaders()) {
      console.warn('[tickTransfers] skipped: headers incomplete (need cookie + x-payload + x-timestamp)');
      return;
    }
    const sinceMs = lastSnapshotTs || (Date.now() - 20 * 60 * 1000);
    const top = await computeTransferTopSince(sinceMs);

    if (lastPayload) {
      lastPayload.transferTop100 = top;
      // Recompute remaining countdown supaya kalau client render pun tidak “naik” lagi
      lastPayload.countdownSec = Math.max(0, Math.floor((nextBalancesAtMs - Date.now()) / 1000));
      lastPayload.intervalMs = INTERVAL_MS;
      io.emit('update', lastPayload);
    }
    console.log(`[tickTransfers] top=${top.length} since=${new Date(sinceMs).toISOString()}`);
  } catch (e) {
    console.warn('[tickTransfers] error:', e.message);
  }
}

/* ===== ROUTES ===== */
app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true, dbReady, entity: ENTITY, now: new Date().toISOString(),
    intervals: { balancesMs: INTERVAL_MS, transfersMs: TRANSFER_INTERVAL_MS },
    lookback: { FORCE_LOOKBACK_MIN, OLDER_BASELINE_MINUTES },
    headers: {
      cookie: !!arkhamHeaders.cookie,
      xPayload: !!arkhamHeaders['x-payload'],
      xTimestamp: !!arkhamHeaders['x-timestamp'],
      lastUpdateSec: Math.floor((Date.now()-lastHeaderUpdateMs)/1000)
    },
    nextBalancesAtMs
  });
});

app.post('/api/arkham/headers', (req, res) => {
  if (SIG_SHARED_SECRET) {
    const sig = req.get('x-sig') || req.get('x-signature') || req.query.sig;
    if (sig !== SIG_SHARED_SECRET) return res.status(401).json({ ok: false, error: 'bad signature' });
  }
  const { cookie, xPayload, xTimestamp } = req.body || {};
  if (cookie)     arkhamHeaders.cookie = String(cookie);
  if (xPayload)   arkhamHeaders['x-payload'] = String(xPayload);
  if (xTimestamp) arkhamHeaders['x-timestamp'] = String(xTimestamp);
  lastHeaderUpdateMs = Date.now();
  res.json({ ok: true, has: { cookie: !!arkhamHeaders.cookie, xPayload: !!arkhamHeaders['x-payload'], xTimestamp: !!arkhamHeaders['x-timestamp'] }, ageSec: 0 });
});

app.get('/api/arkham/headers', (_req, res) => {
  res.json({ ok: true, has: { cookie: !!arkhamHeaders.cookie, xPayload: !!arkhamHeaders['x-payload'], xTimestamp: !!arkhamHeaders['x-timestamp'] }, ageSec: Math.floor((Date.now()-lastHeaderUpdateMs)/1000) });
});

app.get('/api/latest', async (_req, res) => {
  if (!lastPayload) return res.status(404).json({ ok: false, message: 'No payload yet' });
  // kirim countdown terbaru juga
  lastPayload.countdownSec = Math.max(0, Math.floor((nextBalancesAtMs - Date.now()) / 1000));
  lastPayload.intervalMs = INTERVAL_MS;
  res.json(lastPayload);
});

/* ===== START ===== */
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

  await tickBalances();
  await tickTransfers();

  setInterval(tickBalances, INTERVAL_MS);
  setInterval(tickTransfers, TRANSFER_INTERVAL_MS);
});
