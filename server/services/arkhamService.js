import axios from 'axios';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ArkhamService');

class ArkhamService {
  constructor() {
    this.headers = { ...config.arkham.headers };
    this.lastHeaderUpdate = Date.now();
    
    this.client = axios.create({
      baseURL: config.arkham.baseUrl,
      timeout: config.arkham.timeout,
    });

    this.client.interceptors.request.use((requestConfig) => {
      const headers = { ...this.headers };
      
      if (!headers['x-timestamp']) {
        headers['x-timestamp'] = Math.floor(Date.now() / 1000).toString();
      }
      
      requestConfig.headers = headers;
      return requestConfig;
    });
  }

  hasCompleteHeaders() {
    return Boolean(
      this.headers.cookie && 
      this.headers['x-payload'] && 
      this.headers['x-timestamp']
    );
  }

  updateHeaders(newHeaders) {
    if (newHeaders.cookie) {
      this.headers.cookie = String(newHeaders.cookie);
    }
    if (newHeaders.xPayload) {
      this.headers['x-payload'] = String(newHeaders.xPayload);
    }
    if (newHeaders.xTimestamp) {
      this.headers['x-timestamp'] = String(newHeaders.xTimestamp);
    }
    this.lastHeaderUpdate = Date.now();
    
    logger.info('Updated Arkham headers', {
      hasCookie: !!this.headers.cookie,
      hasPayload: !!this.headers['x-payload'],
      hasTimestamp: !!this.headers['x-timestamp'],
    });
  }

  getHeaderStatus() {
    return {
      cookie: !!this.headers.cookie,
      xPayload: !!this.headers['x-payload'],
      xTimestamp: !!this.headers['x-timestamp'],
      lastUpdateSec: Math.floor((Date.now() - this.lastHeaderUpdate) / 1000),
    };
  }

  async fetchBalances() {
    try {
      const response = await this.client.get(config.arkham.path, {
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        const preview = typeof response.data === 'string' 
          ? response.data.slice(0, 200) 
          : JSON.stringify(response.data)?.slice(0, 200);
        
        throw new Error(`Arkham balances API returned HTTP ${response.status} — ${preview}`);
      }

      logger.debug('Fetched balances successfully');
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch balances', { error: error.message });
      throw error;
    }
  }

  async fetchTransfers(limit = 200, offset = 0) {
    try {
      const url = `/transfers?base=${config.entity.name}&flow=all&usdGte=1&sortKey=time&sortDir=desc&limit=${limit}&offset=${offset}`;
      
      const response = await this.client.get(url, {
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        throw new Error(`Arkham transfers API returned HTTP ${response.status}`);
      }

      logger.debug('Fetched transfers successfully', { limit, offset });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch transfers', { 
        error: error.message,
        limit,
        offset 
      });
      throw error;
    }
  }
}

const arkhamService = new ArkhamService();

export default arkhamService;


