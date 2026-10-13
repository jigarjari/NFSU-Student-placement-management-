const jwt = require('jsonwebtoken');
const { isTokenRevoked } = require('../services/securityService');

const JWT_SECRET = process.env.JWT_SECRET || 'NFSU_CYBER_PLACEMENT_SECRET_KEY_2026';

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
  }

  const token = authHeader.split(' ')[1];

  // 1. Check Token Revocation Blacklist (Anti-Replay / Post-Logout Protection)
  if (isTokenRevoked(token)) {
    return res.status(401).json({ error: 'Invalid Session: This authentication token has been revoked / logged out.' });
  }

  // 2. Cryptographic signature and expiration verification
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session Expired: Please authenticate again.' });
    }
    return res.status(401).json({ error: 'Invalid or compromised session token.' });
  }
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access Denied: Role '${req.user.role}' is not authorized to perform this operation. Required: [${allowedRoles.join(', ')}]`
      });
    }
    next();
  };
}

module.exports = {
  JWT_SECRET,
  authenticate,
  requireRole
};
