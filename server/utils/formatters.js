/**
 * Convert value to number, handling various input formats
 * @param {*} value - Value to convert
 * @returns {number} - Parsed number or NaN
 */
export function toNumber(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace?.(/[,_ ]/g, '') ?? value;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

/**
 * Convert timestamp to milliseconds
 * @param {number|string|Date} timestamp - Timestamp in various formats
 * @returns {number} - Timestamp in milliseconds
 */
export function toMilliseconds(timestamp) {
  if (!timestamp) return 0;
  
  if (typeof timestamp === 'number') {
    return timestamp > 1e12 ? timestamp : timestamp * 1000;
  }
  
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(value)) return String(value);
  
  const abs = Math.abs(value);
  const decimalPlaces = abs >= 1000 ? 0 : abs >= 100 ? 1 : decimals;
  
  return value.toLocaleString(undefined, { 
    maximumFractionDigits: decimalPlaces 
  });
}

export function isValidSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  const trimmed = symbol.trim();
  return trimmed.length > 0 && !/^[0-9]+$/.test(trimmed);
}

export function normalizeSymbol(symbol) {
  return String(symbol).toUpperCase().trim();
}


