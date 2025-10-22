import express from 'express';
import config from '../config/index.js';

const router = express.Router();

router.get('/latest', (req, res) => {
  const lastPayload = req.app.locals.lastPayload;
  const nextBalancesAtMs = req.app.locals.nextBalancesAtMs;

  if (!lastPayload) {
    return res.status(404).json({
      ok: false,
      message: 'No data available yet',
    });
  }

  const payload = { ...lastPayload };
  if (nextBalancesAtMs) {
    payload.countdownSec = Math.max(
      0,
      Math.floor((nextBalancesAtMs - Date.now()) / 1000)
    );
    payload.intervalMs = config.intervals.balances;
  }

  res.json(payload);
});

export default router;


