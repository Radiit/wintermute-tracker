import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from '../routes/index.js';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('App');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true }));

  const publicPath = path.join(__dirname, '../../public');
  app.use(express.static(publicPath));
  
  logger.debug('Serving static files from', { path: publicPath });

  app.use(routes);

  app.use(notFoundHandler);

  app.use(errorHandler);

  return app;
}


