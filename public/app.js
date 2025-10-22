const tbody = document.querySelector('#tbl tbody');
const meta = document.getElementById('meta');
const statusEl = document.getElementById('status');
const lastUpdatedEl = document.getElementById('lastUpdated');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const filterGroup = document.getElementById('filterGroup');
const hideZeroPctEl = document.getElementById('hideZeroPct');
const showMicroEl = document.getElementById('showMicro');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageNumEl = document.getElementById('pageNum');
const totalPagesEl = document.getElementById('totalPages');
const countdownEl = document.getElementById('countdown');

let lastTs = null;
let rawPayload = null;
let currentFilter = 'all';
let currentSort = 'default';
let currentSearch = '';
let hideZeroPct = false;
let showMicro = false;
let currentPage = 1;
let totalPages = 1;
const pageSize = 50;
let intervalMs = 15000;
let wsConnected = false;
let lastWsMs = 0;

const ABS_DELTA_EPS = 1e-9;
const PCT_EPS = 1e-6;

const normalizeZero = (n) => (Object.is(n, -0) ? 0 : n);

function formatNumber(n) {
  if (n === null || n === undefined) return '—';
  if (!isFinite(n)) return String(n);
  
  const value = normalizeZero(n);
  const abs = Math.abs(value);
  
  if (abs === 0) return '0';
  if (abs >= 1_000_000_000) return value.toExponential(2);
  if (abs >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (abs >= 1e-3) return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  
  return value.toExponential(2);
}

function formatPercentage(n) {
  if (n === null || n === undefined) return '—';
  if (!isFinite(n)) return String(n);
  
  const value = normalizeZero(n);
  const abs = Math.abs(value);
  
  if (abs === 0) return '0.00%';
  if (abs >= 100) return value.toFixed(0) + '%';
  if (abs >= 1) return value.toFixed(2) + '%';
  if (abs >= 0.01) return value.toFixed(4) + '%';
  
  return value.toExponential(2) + '%';
}

function getChangeType(row) {
  if (row.pctChange === null) return 'new';
  if (row.pctChange > 0) return 'up';
  if (row.pctChange < 0) return 'down';
  return 'neutral';
}

function normalizePayload(payload) {
  if (!payload) return null;
  
  const rows = payload.top100 || payload.rows || [];
  const timestamp = payload.timestamp || payload.ts || null;
  const interval = payload.intervalMs || (payload.countdownSec ? payload.countdownSec * 1000 : intervalMs);
  
  return {
    top100: rows,
    totalAssets: payload.totalAssets || rows.length,
    timestamp,
    intervalMs: interval,
    transferTop100: payload.transferTop100 || null,
  };
}

function normalizeRowsForView(rows) {
  if (showMicro) return rows;
  
  return rows.map((row) => {
    let { old, new: now, delta, pctChange } = row;
    
    if (pctChange !== null) {
      if (Math.abs(delta) < ABS_DELTA_EPS && Math.abs(pctChange) < PCT_EPS) {
        delta = 0;
        pctChange = 0;
      }
    }
    
    return {
      ...row,
      old: normalizeZero(old),
      new: normalizeZero(now),
      delta: normalizeZero(delta),
      pctChange,
    };
  });
}

function applyFilters(rows) {
  let filtered = rows.slice();
  
  const query = currentSearch.trim().toLowerCase();
  if (query) {
    filtered = filtered.filter((row) =>
      String(row.symbol).toLowerCase().includes(query)
    );
  }
  
  if (currentFilter !== 'all') {
    filtered = filtered.filter((row) => getChangeType(row) === currentFilter);
  }
  
  if (hideZeroPct) {
    filtered = filtered.filter((row) => row.pctChange !== 0);
  }
  
  return filtered;
}

function applySort(rows) {
  const sorted = rows.slice();
  
  switch (currentSort) {
    case 'symbol-asc':
      sorted.sort((a, b) => a.symbol.localeCompare(b.symbol));
      break;
    case 'symbol-desc':
      sorted.sort((a, b) => b.symbol.localeCompare(a.symbol));
      break;
    case 'prev-asc':
      sorted.sort((a, b) => a.old - b.old);
      break;
    case 'prev-desc':
      sorted.sort((a, b) => b.old - a.old);
      break;
    case 'now-asc':
      sorted.sort((a, b) => a.new - b.new);
      break;
    case 'now-desc':
      sorted.sort((a, b) => b.new - a.new);
      break;
    case 'delta-asc':
      sorted.sort((a, b) => a.delta - b.delta);
      break;
    case 'delta-desc':
      sorted.sort((a, b) => b.delta - a.delta);
      break;
    case 'default':
    default:
      sorted.sort((a, b) => {
        const aIsNew = a.pctChange === null;
        const bIsNew = b.pctChange === null;
        
        if (aIsNew && !bIsNew) return -1;
        if (!aIsNew && bIsNew) return 1;
        
        const aPct = aIsNew ? Infinity : Math.abs(a.pctChange);
        const bPct = bIsNew ? Infinity : Math.abs(b.pctChange);
        
        if (bPct !== aPct) return bPct - aPct;
        
        return String(a.symbol).localeCompare(String(b.symbol));
      });
  }
  
  return sorted;
}

function renderTable(rows) {
  tbody.innerHTML = '';
  
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="empty" colspan="6">No rows match the current filter.</td>';
    tbody.appendChild(tr);
    return;
  }
  
  rows.forEach((row, index) => {
    const changeClass = getChangeType(row);
    const tr = document.createElement('tr');
    
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${row.symbol}</td>
      <td>${formatNumber(row.old)}</td>
      <td>${formatNumber(row.new)}</td>
      <td class="${changeClass}">${formatNumber(row.delta)}</td>
      <td class="${changeClass}">${
        row.pctChange === null ? 'NEW' : formatPercentage(row.pctChange)
      }</td>
    `;
    
    tbody.appendChild(tr);
  });
}

function renderMeta(payload) {
  const suffix = showMicro ? '' : ' (normalized)';
  meta.textContent = `assets = ${payload.totalAssets}${suffix}`;
}

function pipeline() {
  if (!rawPayload?.top100) return;
  
  const baseRows = rawPayload.top100;
  const normalizedRows = normalizeRowsForView(baseRows);
  const filteredRows = applyFilters(normalizedRows);
  const sortedRows = applySort(filteredRows);
  
  totalPages = Math.ceil(sortedRows.length / pageSize);
  totalPagesEl.textContent = totalPages;
  
  const paginatedRows = sortedRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  
  renderTable(paginatedRows);
  pageNumEl.textContent = currentPage;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

function render(payload) {
  const normalized = normalizePayload(payload);
  if (!normalized) {
    meta.textContent = 'no data yet…';
    return;
  }
  
  const timestampChanged = normalized.timestamp !== lastTs;
  
  rawPayload = { ...(rawPayload || {}), ...normalized };
  
  if (timestampChanged) {
    lastTs = normalized.timestamp || null;
    renderMeta(normalized);
    intervalMs = normalized.intervalMs || intervalMs;
    lastUpdatedEl.textContent = `Last update: ${normalized.timestamp || '—'}`;
    resetCountdown();
    pipeline();
  } else {
    pipeline();
  }
}

function resetCountdown() {
  let timeLeft = Math.max(1, Math.floor((intervalMs || 15000) / 1000));
  countdownEl.textContent = `Next in: ${timeLeft}s`;
  
  clearInterval(window.countdownTimer);
  window.countdownTimer = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      timeLeft = Math.max(1, Math.floor((intervalMs || 15000) / 1000));
    }
    countdownEl.textContent = `Next in: ${timeLeft}s`;
  }, 1000);
}

searchInput.addEventListener('input', (e) => {
  currentSearch = e.target.value;
  pipeline();
});

sortSelect.addEventListener('change', (e) => {
  currentSort = e.target.value;
  pipeline();
});

filterGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-filter');
  if (!btn) return;
  
  [...filterGroup.querySelectorAll('.btn-filter')].forEach((b) =>
    b.classList.remove('active')
  );
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  pipeline();
});

hideZeroPctEl.addEventListener('change', (e) => {
  hideZeroPct = !!e.target.checked;
  pipeline();
});

showMicroEl.addEventListener('change', (e) => {
  showMicro = !!e.target.checked;
  renderMeta(rawPayload || {});
  pipeline();
});

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    pipeline();
  }
});

nextPageBtn.addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage++;
    pipeline();
  }
});

const socket = io();

socket.on('connect', () => {
  wsConnected = true;
  statusEl.textContent = 'connected';
  statusEl.classList.add('connected');
});

socket.on('update', (data) => {
  lastWsMs = Date.now();
  
  try {
    const incomingTs = data?.timestamp || data?.ts || null;
    
    if (incomingTs && incomingTs === lastTs) {
      const normalized = normalizePayload(data);
      rawPayload = { ...(rawPayload || {}), ...normalized };
      pipeline();
      return;
    }
    
    render(data);
  } catch (error) {
    console.error('Error handling WebSocket update:', error);
  }
});

socket.on('disconnect', () => {
  wsConnected = false;
  statusEl.textContent = 'disconnected';
  statusEl.classList.remove('connected');
});

socket.on('connect_error', (error) => {
  console.error('WebSocket connection error:', error);
  statusEl.textContent = 'connection error';
  statusEl.classList.remove('connected');
});

function fetchLatest() {
  const freshHorizon = (intervalMs || 15000) + 2000;
  
  if (wsConnected && Date.now() - lastWsMs < freshHorizon) {
    return;
  }
  
  fetch(`/api/latest?_=${Date.now()}`, { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data) return;
      
      const normalized = normalizePayload(data);
      if (!lastTs || normalized?.timestamp !== lastTs) {
        render(normalized);
      }
    })
    .catch(() => {
    });
}

fetchLatest();
setInterval(fetchLatest, 15000);
