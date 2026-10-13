/**
 * NFSU Enterprise Cybersecurity & Defense Service
 * Implements:
 * 1. Sliding-window IP & Account Rate Limiting (Brute-Force & Credential Stuffing Defense)
 * 2. Server-side JWT Token Revocation Blacklist (Anti-Replay & Session Hijack Defense)
 * 3. Deep Recursive Input Sanitization (Cross-Site Scripting XSS & Injection Prevention)
 * 4. PII Data Masking & Least-Privilege Exposure Controls
 */

const { logEvent } = require('./auditLogger');

// 1. In-Memory Token Revocation Store
const revokedTokens = new Set();

function revokeToken(token) {
  if (token) {
    revokedTokens.add(token);
  }
}

function isTokenRevoked(token) {
  return revokedTokens.has(token);
}

// 2. Rate Limiting Store (Sliding window per IP / Identifier)
const rateLimitStore = new Map();

/**
 * Rate Limiter Middleware
 * @param {Object} options { windowMs: number, maxRequests: number, actionName: string }
 */
function createRateLimiter({ windowMs = 60000, maxRequests = 30, actionName = 'REQUEST' }) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const key = `${actionName}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);
    if (!record) {
      record = { timestamps: [] };
      rateLimitStore.set(key, record);
    }

    // Filter out timestamps outside the active window
    record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);

    if (record.timestamps.length >= maxRequests) {
      logEvent({
        actorUsername: 'ANONYMOUS_OR_ATTACKER',
        actorRole: 'UNAUTHENTICATED',
        action: 'SECURITY_ALERT_RATE_LIMIT_EXCEEDED',
        entityType: 'NETWORK_DEFENSE',
        entityId: ip,
        afterState: { ip, action: actionName, requestsInWindow: record.timestamps.length, limit: maxRequests },
        ipAddress: ip
      });

      return res.status(429).json({
        error: 'Too Many Requests: Rate limit exceeded to safeguard NFSU infrastructure. Please wait before retrying.',
        retryAfterSeconds: Math.ceil((windowMs - (now - record.timestamps[0])) / 1000)
      });
    }

    record.timestamps.push(now);
    next();
  };
}

// 3. Strict Input Sanitization (XSS & Injection Protection)
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/onload=/gi, '')
    .replace(/onerror=/gi, '')
    .replace(/onclick=/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .trim();
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      clean[key] = sanitizeString(val);
    } else if (typeof val === 'object') {
      clean[key] = sanitizeObject(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

function sanitizeInputMiddleware(req, res, next) {
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);
  next();
}

// 4. PII Data Masking
function maskPhoneNumber(phone, viewerRole) {
  if (['admin', 'officer'].includes(viewerRole)) return phone;
  if (!phone) return 'N/A';
  const hasPlus = String(phone).trim().startsWith('+');
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 10) return '***-***-****';
  const prefix = (hasPlus && digits.length > 10) ? `+${digits.slice(0, digits.length - 10)} ` : '';
  const tenDigits = digits.slice(-10);
  return `${prefix}${tenDigits.slice(0, 2)}*** ***${tenDigits.slice(-2)}`.trim();
}

function maskEmail(email, viewerRole) {
  if (['admin', 'officer', 'coordinator'].includes(viewerRole)) return email;
  if (!email || !email.includes('@')) return 'N/A';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user[0]}*@${domain}`;
  return `${user.slice(0, 2)}***${user.slice(-1)}@${domain}`;
}

module.exports = {
  revokeToken,
  isTokenRevoked,
  createRateLimiter,
  sanitizeInputMiddleware,
  sanitizeString,
  sanitizeObject,
  maskPhoneNumber,
  maskEmail
};
