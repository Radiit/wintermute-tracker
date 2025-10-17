const tbody = document.querySelector('#tbl tbody');
const meta = document.getElementById('meta');
const statusEl = document.getElementById('status');
const lastUpdatedEl = document.getElementById('lastUpdated');
let lastTs = null;

function fmt(n) {
  if (n === null || n === undefined) return '—';
  if (!isFinite(n)) return String(n);
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 0 : abs >= 100 ? 1 : 2;
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function render(payload) {
  if (!payload || !payload.top100) {
    meta.textContent = 'no data yet…';
    return;
  }
  meta.textContent =
    `entity=${payload.entity} | assets=${payload.totalAssets} | interval=${payload.intervalMs}ms | ts=${payload.timestamp}` +
    (payload.baseline ? ` | baseline=${payload.baseline}` : '');
  lastTs = payload.timestamp || null;
  if (lastUpdatedEl) lastUpdatedEl.textContent = `last update: ${payload.timestamp || '—'}`;

  tbody.innerHTML = '';
  payload.top100.forEach((r, i) => {
    const tr = document.createElement('tr');
    const cls =
      r.pctChange === null ? 'new' :
      r.pctChange > 0 ? 'up' :
      (r.pctChange < 0 ? 'down' : '');

    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${r.symbol}</td>
      <td>${fmt(r.old)}</td>
      <td>${fmt(r.new)}</td>
      <td class="${cls}">${fmt(r.delta)}</td>
      <td class="${cls}">${r.pctChange === null ? 'NEW' : (r.pctChange.toFixed(2) + '%')}</td>
    `;
    tbody.appendChild(tr);
  });
}

const socket = io();
socket.on('connect', () => {
  console.log('socket connected');
  if (statusEl) statusEl.textContent = 'connected';
});
socket.on('connect_error', (e) => console.warn('socket connect_error', e?.message || e));
socket.on('error', (e) => console.warn('socket error', e?.message || e));
socket.on('reconnect_attempt', (n) => console.log('socket reconnect_attempt', n));
socket.on('update', (d) => {
  try { render(d); }
  catch (e) { console.error('render failed', e); }
});
socket.on('disconnect', () => { if (statusEl) statusEl.textContent = 'disconnected'; });

// Fallback fetch on load
fetch(`/api/latest?_=${Date.now()}`, { cache: 'no-store' })
  .then(r => r.ok ? r.json() : null)
  .then(d => d && render(d))
  .catch(()=>{});

// Periodic fetch fallback to ensure UI stays fresh
setInterval(() => {
  fetch(`/api/latest?_=${Date.now()}`, { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (!d) return;
      if (!lastTs || d.timestamp !== lastTs) render(d);
    })
    .catch(() => {});
}, 15000);
