import config from '../config/index.js';

export function requireSignature(req, res, next) {
  if (!config.security.sharedSecret) {
    return next();
  }

  const signature = 
    req.get('x-sig') || 
    req.get('x-signature') || 
    req.query.sig;

  if (signature !== config.security.sharedSecret) {
    return res.status(401).json({
      ok: false,
      error: 'Invalid or missing signature',
    });
  }

  next();
}


