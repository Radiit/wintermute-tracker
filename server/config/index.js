import 'dotenv/config';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');
try { 
  dns.setServers(['1.1.1.1', '1.0.0.1', '8.8.8.8']); 
} catch (err) {
  console.warn('[DNS] Failed to set custom DNS servers:', err.message);
}

class Config {
  constructor() {
    this.server = {
      port: this.parseNumber('PORT', 3000),
      nodeEnv: process.env.NODE_ENV || 'development',
    };

    this.entity = {
      name: (process.env.ENTITY || 'wintermute').toLowerCase(),
    };

    this.intervals = {
      balances: this.parseNumber('INTERVAL_MS', 5 * 60 * 1000),
      transfers: this.parseNumber('TRANSFER_INTERVAL_MS', 30 * 1000),
    };

    this.lookback = {
      force: this.parseNumber('FORCE_LOOKBACK_MIN', 0),
      baseline: this.parseNumber('OLDER_BASELINE_MINUTES', 0),
    };

    this.arkham = {
      baseUrl: process.env.ARKHAM_BASE_URL || 'https://api.arkm.com',
      path: process.env.ARKHAM_PATH || `/balances/entity/${this.entity.name}?cheap=false`,
      timeout: this.parseNumber('ARKHAM_TIMEOUT_MS', 20000),
      headers: this.buildArkhamHeaders(),
    };

    this.security = {
      sharedSecret: process.env.SIG_SHARED_SECRET || process.env.SIG_SECRET || process.env.SIG || '',
    };

    this.database = {
      url: process.env.DATABASE_URL,
    };
  }

  parseNumber(key, defaultValue) {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  buildArkhamHeaders() {
    const headers = {
      cookie: process.env.ARKHAM_COOKIE || '',
      'x-payload': process.env.ARKHAM_X_PAYLOAD || process.env.ARKHAM_XPAYLOAD || '',
      'x-timestamp': process.env.ARKHAM_X_TIMESTAMP || process.env.ARKHAM_XTIMESTAMP || '',
      'user-agent': process.env.ARKHAM_UA || 'Mozilla/5.0',
      origin: process.env.ARKHAM_ORIGIN || 'https://intel.arkm.com',
      referer: process.env.ARKHAM_REFERER || 'https://intel.arkm.com/',
      accept: process.env.ARKHAM_ACCEPT || 'application/json, text/plain, */*',
    };

    if (process.env.ARKHAM_ACCEPT_LANGUAGE) headers['accept-language'] = process.env.ARKHAM_ACCEPT_LANGUAGE;
    if (process.env.ARKHAM_SEC_GPC) headers['sec-gpc'] = process.env.ARKHAM_SEC_GPC;
    if (process.env.ARKHAM_SEC_FETCH_MODE) headers['sec-fetch-mode'] = process.env.ARKHAM_SEC_FETCH_MODE;
    if (process.env.ARKHAM_SEC_FETCH_SITE) headers['sec-fetch-site'] = process.env.ARKHAM_SEC_FETCH_SITE;
    if (process.env.ARKHAM_SEC_FETCH_DEST) headers['sec-fetch-dest'] = process.env.ARKHAM_SEC_FETCH_DEST;

    return headers;
  }

  validate() {
    const errors = [];

    if (!this.database.url) {
      errors.push('DATABASE_URL is required');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  isDevelopment() {
    return this.server.nodeEnv === 'development';
  }

  isProduction() {
    return this.server.nodeEnv === 'production';
  }
}

const config = new Config();

export default config;


