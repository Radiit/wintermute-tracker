import express from 'express';
import arkhamService from '../services/arkhamService.js';
import { requireSignature } from '../middleware/security.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

router.post('/headers', requireSignature, asyncHandler(async (req, res) => {
  const { cookie, xPayload, xTimestamp } = req.body || {};

  arkhamService.updateHeaders({
    cookie,
    xPayload,
    xTimestamp,
  });

  res.json({
    ok: true,
    has: {
      cookie: !!arkhamService.headers.cookie,
      xPayload: !!arkhamService.headers['x-payload'],
      xTimestamp: !!arkhamService.headers['x-timestamp'],
    },
    ageSec: 0,
  });
}));

router.get('/headers', (req, res) => {
  const status = arkhamService.getHeaderStatus();
  
  res.json({
    ok: true,
    has: {
      cookie: status.cookie,
      xPayload: status.xPayload,
      xTimestamp: status.xTimestamp,
    },
    ageSec: status.lastUpdateSec,
  });
});

export default router;


