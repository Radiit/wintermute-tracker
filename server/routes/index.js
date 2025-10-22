import express from 'express';
import healthRoutes from './healthRoutes.js';
import arkhamRoutes from './arkhamRoutes.js';
import dataRoutes from './dataRoutes.js';

const router = express.Router();

// Mount route modules
router.use('/api', healthRoutes);
router.use('/api/arkham', arkhamRoutes);
router.use('/api', dataRoutes);

export default router;


