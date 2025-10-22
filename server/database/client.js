import { PrismaClient } from '@prisma/client';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Database');

class DatabaseClient {
  constructor() {
    this.client = null;
    this.ready = false;
  }

  async connect() {
    try {
      this.client = new PrismaClient({
        log: process.env.NODE_ENV === 'development' 
          ? ['query', 'error', 'warn'] 
          : ['error'],
      });
      
      await this.client.$connect();
      this.ready = true;
      logger.info('Connected to database');
    } catch (error) {
      this.ready = false;
      logger.error('Failed to connect to database', { error: error.message });
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.$disconnect();
      this.ready = false;
      logger.info('Disconnected from database');
    }
  }

  getClient() {
    if (!this.ready || !this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.client;
  }

  isReady() {
    return this.ready;
  }

  async healthCheck() {
    try {
      if (!this.client) return false;
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed', { error: error.message });
      return false;
    }
  }
}

const db = new DatabaseClient();

export default db;


