const express = require('express');
const path = require('node:path');
const cors = require('cors');

// Initialize database schema
require('./db/database');

const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const driveRoutes = require('./routes/driveRoutes');
const offerRoutes = require('./routes/offerRoutes');
const policyRoutes = require('./routes/policyRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const auditRoutes = require('./routes/auditRoutes');
const testRoutes = require('./routes/testRoutes');
const backupRoutes = require('./routes/backupRoutes');

const { sanitizeInputMiddleware, createRateLimiter } = require('./services/securityService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Headers & Hardening (OWASP Top 10 Best Practices)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: https:; font-src 'self' https: data:;"
  );
  next();
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Input Sanitization (strips malicious script tags from all inputs)
app.use(sanitizeInputMiddleware);

// Global API rate limiter (protects against scraping & DoS: max 120 req/min per IP)
const globalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  actionName: 'GLOBAL_API'
});
app.use('/api/', globalApiLimiter);

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/drives', driveRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/backup', backupRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'NFSU Placement Management System 2026-27',
    securityStatus: 'HARDENED',
    timestamp: new Date().toISOString()
  });
});

// Single Page Application fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected internal security or processing error occurred.'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(` NFSU Placement Management System 2026–27 is LIVE`);
    console.log(` Security Hardened • Running on http://localhost:${PORT}`);
    console.log(`================================================================`);
  });
}

module.exports = app;
