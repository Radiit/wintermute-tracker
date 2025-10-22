import express from 'express';
import db from '../database/client.js';
import arkhamService from '../services/arkhamService.js';
import config from '../config/index.js';

const router = express.Router();

router.get('/health', async (req, res) => {
  const health = {
    ok: true,
    dbReady: db.isReady(),
    entity: config.entity.name,
    now: new Date().toISOString(),
    intervals: {
      balancesMs: config.intervals.balances,
      transfersMs: config.intervals.transfers,
    },
    lookback: {
      forceLookbackMin: config.lookback.force,
      olderBaselineMin: config.lookback.baseline,
    },
    headers: arkhamService.getHeaderStatus(),
  };

  if (req.app.locals.nextBalancesAtMs) {
    health.nextBalancesAtMs = req.app.locals.nextBalancesAtMs;
  }

  res.json(health);
});

export default router;


