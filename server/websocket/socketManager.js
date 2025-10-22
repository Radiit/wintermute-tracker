import { Server as SocketIOServer } from 'socket.io';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('WebSocket');

class SocketManager {
  constructor() {
    this.io = null;
    this.connections = 0;
  }

  initialize(httpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket) => {
      this.connections++;
      logger.info('Client connected', {
        socketId: socket.id,
        connections: this.connections,
      });

      socket.on('disconnect', () => {
        this.connections--;
        logger.info('Client disconnected', {
          socketId: socket.id,
          connections: this.connections,
        });
      });

      socket.on('error', (error) => {
        logger.error('Socket error', {
          socketId: socket.id,
          error: error.message,
        });
      });
    });

    logger.info('WebSocket server initialized');
  }

  broadcastUpdate(payload) {
    if (!this.io) {
      logger.warn('Cannot broadcast: Socket.IO not initialized');
      return;
    }

    this.io.emit('update', payload);
    
    logger.debug('Broadcasted update', {
      connections: this.connections,
      timestamp: payload.ts || payload.timestamp,
    });
  }

  getConnectionsCount() {
    return this.connections;
  }

  async close() {
    if (this.io) {
      await this.io.close();
      logger.info('WebSocket server closed');
    }
  }
}

const socketManager = new SocketManager();

export default socketManager;


